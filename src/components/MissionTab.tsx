import confetti from 'canvas-confetti';
import { useState, useEffect, useRef } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { UserData } from '../types';
import { MAX_DAILY_ADS, MAX_DAILY_ROULETTE, SELF_EARNING_LIMIT, AD_COOLDOWN_SEC, MAX_FALLBACK_REWARDS } from '../constants';
import AdManager from '../utils/AdManager';

interface MissionTabProps {
    user: User;
    userData: UserData | null;
    t: any;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * MissionTab - Two Button Logic (Separated)
 * 
 * A. Roulette Button:
 *    - Limit to 2 times per day
 *    - First attempt is free
 *    - Play roulette animation (~5 seconds)
 *    - After first completion, show popup: "Watch an ad to play once more?"
 *    - If ad is successfully watched, allow second attempt
 *    - After 2 attempts, completely disable roulette
 *    - No 30-second cooldown here
 *    - Prevent clicks while roulette is spinning
 * 
 * B. Video Ad Button:
 *    - Daily limit: 50 views
 *    - Apply 30-second cooldown AFTER click
 *    - Disable button immediately on click
 *    - Show visual countdown during cooldown
 *    - If ad fails to load or show:
 *      - Grant fallback reward
 *      - Limit fallback rewards to 20 per day
 *    - Prevent all duplicate clicks and background tasks
 * 
 * Daily Counter Reset:
 *    - All daily counters reset at midnight (local time)
 *    - Tracked via 'today' state which updates when date changes
 *    - LocalStorage used for local tracking, synced with Firestore
 */
export function MissionTab({ user, userData, t, showToast }: MissionTabProps) {
    // ========== STATE MANAGEMENT ==========
    // Video Ad Button State
    const [adCooldown, setAdCooldown] = useState(0);
    const [isVideoAdProcessing, setIsVideoAdProcessing] = useState(false);
    const [localAdCount, setLocalAdCount] = useState(0);
    const [fallbackRewardCount, setFallbackRewardCount] = useState(0);

    // Roulette Button State
    const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
    const [isRouletteAdProcessing, setIsRouletteAdProcessing] = useState(false);
    const [rouletteDisplay, setRouletteDisplay] = useState(777);
    const [showSpinAdModal, setShowSpinAdModal] = useState(false);

    // Shared State
    const [currentSelfEarned, setCurrentSelfEarned] = useState((userData as any)?.pointsToday_self || 0);
    const [currentReferralEarned, setCurrentReferralEarned] = useState((userData as any)?.pointsToday_referral || 0);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [tickerMsg, setTickerMsg] = useState('');

    // Safety: Prevent duplicate operations
    const videoAdLockRef = useRef(false);
    const rouletteLockRef = useRef(false);

    // ========== DATE MANAGEMENT ==========
    const getLocalToday = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [today, setToday] = useState(getLocalToday());

    // Reset daily counters at midnight
    useEffect(() => {
        const checkMidnight = () => {
            const currentToday = getLocalToday();
            if (currentToday !== today) {
                setToday(currentToday);
                setLocalAdCount(0);
                setFallbackRewardCount(0);
                setCurrentSelfEarned(0);
                setCurrentReferralEarned(0);
                localStorage.removeItem(`dailyRouletteSpins_${user.uid}`);
                localStorage.removeItem(`adCooldownTarget_${user.uid}`);
                localStorage.removeItem(`fallbackRewardCount_${user.uid}`);
                videoAdLockRef.current = false;
                rouletteLockRef.current = false;
            }
        };
        const interval = setInterval(checkMidnight, 5000);
        return () => clearInterval(interval);
    }, [today, user.uid]);

    // ========== SYNC WITH FIRESTORE ==========
    useEffect(() => {
        if (userData) {
            const remoteLastDate = (userData as any).lastSelfEarnDate || "";
            if (remoteLastDate === today) {
                setCurrentSelfEarned((userData as any).pointsToday_self || 0);
            }
            if (userData.lastAdDate === today) {
                setLocalAdCount(userData.dailyAdCount || 0);
            }
            if ((userData as any).lastReferralEarnDate === today) {
                setCurrentReferralEarned((userData as any).pointsToday_referral || 0);
            }
        }
    }, [userData, today]);

    // ========== FALLBACK REWARD TRACKING ==========
    useEffect(() => {
        const stored = localStorage.getItem(`fallbackRewardCount_${user.uid}`);
        if (stored) {
            const { date, count } = JSON.parse(stored);
            if (date === today) {
                setFallbackRewardCount(count);
            }
        }
    }, [today, user.uid]);

    // ========== AD COOLDOWN MANAGEMENT ==========
    useEffect(() => {
        const targetTime = localStorage.getItem(`adCooldownTarget_${user.uid}`);
        if (targetTime) {
            const remaining = Math.ceil((parseInt(targetTime) - Date.now()) / 1000);
            if (remaining > 0) setAdCooldown(remaining);
        }
    }, [user.uid]);

    useEffect(() => {
        if (adCooldown > 0) {
            const timer = setTimeout(() => setAdCooldown(adCooldown - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            localStorage.removeItem(`adCooldownTarget_${user.uid}`);
        }
    }, [adCooldown]);

    // ========== ROULETTE LOGIC ==========
    const getLocalRouletteSpins = () => {
        const stored = localStorage.getItem(`dailyRouletteSpins_${user.uid}`);
        if (stored) {
            const { date, count } = JSON.parse(stored);
            if (date === today) return count;
        }
        return 0;
    };

    const isRouletteToday = userData?.lastRouletteDate === today;
    const remoteSpinsDone = isRouletteToday ? (userData?.dailyRouletteSpins || 0) : 0;
    const dailySpinsDone = Math.max(remoteSpinsDone, getLocalRouletteSpins());
    const isMaxSpinsReached = dailySpinsDone >= MAX_DAILY_ROULETTE;

    const handleRouletteSpin = async () => {
        // Safety: Prevent duplicate spins
        if (rouletteLockRef.current || isRouletteSpinning || !user) return;
        rouletteLockRef.current = true;
        setIsRouletteSpinning(true);

        const spinInterval = setInterval(() => setRouletteDisplay(Math.floor(Math.random() * 999)), 50);

        try {
            const requestRouletteReward = httpsCallable(functions, 'requestRouletteReward');
            const res = await requestRouletteReward({ token: await user.getIdToken(true) });
            const data = res.data as any;

            if (data.success) {
                clearInterval(spinInterval);
                const reward = data.reward;
                setRouletteDisplay(reward);
                setCurrentSelfEarned((prev: number) => prev + reward);

                if (reward >= 100) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                showToast(`${t.pointsEarned} (+${reward} P)`, 'success');

                // Update local spin count
                localStorage.setItem(`dailyRouletteSpins_${user.uid}`, JSON.stringify({ date: today, count: dailySpinsDone + 1 }));
            }
        } catch (error: any) {
            clearInterval(spinInterval);
            showToast(error.message || "Error", 'error');
        } finally {
            setIsRouletteSpinning(false);
            rouletteLockRef.current = false;
        }
    };

    const handleWatchSpinAd = async () => {
        setShowSpinAdModal(false);

        // Safety: Prevent duplicate ad processing
        if (isRouletteAdProcessing || rouletteLockRef.current) return;
        setIsRouletteAdProcessing(true);
        rouletteLockRef.current = true;

        try {
            const adResult = await AdManager.showUnityAd(user, 'roulette_reward');
            if (adResult.success) {
                // Ad watched successfully - AdManager already tracked it via requestSpinAdReward
                // Now allow roulette spin
                handleRouletteSpin();
            } else {
                showToast(t[adResult.message!] || adResult.message!, 'error');
                rouletteLockRef.current = false;
            }
        } catch (error) {
            showToast(t.adFail, 'error');
            rouletteLockRef.current = false;
        } finally {
            setIsRouletteAdProcessing(false);
        }
    };

    const onRouletteClick = () => {
        // Safety checks
        if (isRouletteSpinning || isRouletteAdProcessing || rouletteLockRef.current) return;
        if (isLimitReached) {
            setShowLimitModal(true);
            return;
        }
        if (isMaxSpinsReached) return;

        // First spin is free
        if (dailySpinsDone === 0) {
            handleRouletteSpin();
        }
        // Second spin requires ad
        else if (dailySpinsDone === 1) {
            setShowSpinAdModal(true);
        }
    };

    // ========== VIDEO AD LOGIC ==========
    const handleWatchAd = async () => {
        // Safety: Prevent duplicate clicks
        if (videoAdLockRef.current || isVideoAdProcessing) return;
        if (isLimitReached) {
            setShowLimitModal(true);
            return;
        }
        if (localAdCount >= MAX_DAILY_ADS) {
            showToast(t.adLimitMsg, 'error');
            return;
        }

        // [Double Check] Verify cooldown from LocalStorage directly to avoid state race conditions
        const storedTarget = localStorage.getItem(`adCooldownTarget_${user.uid}`);
        if (storedTarget) {
            const remaining = Math.ceil((parseInt(storedTarget) - Date.now()) / 1000);
            if (remaining > 0) {
                setAdCooldown(remaining); // Sync state just in case
                return;
            }
        }
        if (adCooldown > 0) return;

        // Lock immediately to prevent duplicate clicks
        videoAdLockRef.current = true;
        setIsVideoAdProcessing(true);

        // [IMMEDIATE COOLDOWN] Start 30s cooldown immediately on click
        const cooldownSecs = AD_COOLDOWN_SEC;
        localStorage.setItem(`adCooldownTarget_${user.uid}`, (Date.now() + cooldownSecs * 1000).toString());
        setAdCooldown(cooldownSecs);

        try {
            const adResult = await AdManager.showUnityAd(user, 'mission_video');

            if (adResult.success) {
                // Ad watched successfully
                setLocalAdCount(prev => prev + 1);
                if (adResult.reward) {
                    const addedReward = adResult.reward;
                    setCurrentSelfEarned((prev: number) => prev + addedReward);
                    showToast(`${t.pointsEarned} (+${addedReward} P)`, 'success');
                }

                // Note: Cooldown was already started at the beginning.
            } else {
                // Ad failed to load or show - grant fallback reward
                if (fallbackRewardCount < MAX_FALLBACK_REWARDS) {
                    try {
                        const requestFallbackReward = httpsCallable(functions, 'requestFallbackReward');
                        const result = await requestFallbackReward({
                            token: await user.getIdToken(true),
                            timezoneOffset: new Date().getTimezoneOffset()
                        });
                        const data = result.data as any;

                        if (data.success) {
                            const fallbackReward = data.reward || 50;
                            setCurrentSelfEarned((prev: number) => prev + fallbackReward);
                            setFallbackRewardCount(prev => {
                                const newCount = prev + 1;
                                localStorage.setItem(`fallbackRewardCount_${user.uid}`, JSON.stringify({ date: today, count: newCount }));
                                return newCount;
                            });
                            showToast(`${t.pointsEarned} (Fallback: +${fallbackReward} P)`, 'info');
                        } else {
                            showToast(t[data.message!] || data.message!, 'error');
                        }
                    } catch (fallbackError: any) {
                        console.error("Fallback reward error:", fallbackError);
                        showToast(t.adFail, 'error');
                    }
                } else {
                    showToast(t.adFail + " (Fallback limit reached)", 'error');
                }
            }
        } catch (error) {
            showToast(t.adFail, 'error');
        } finally {
            // [RESYNC] Update cooldown state based on actual wall-clock time passed
            // This ensures time spent watching the ad counts towards the cooldown
            const currentTarget = localStorage.getItem(`adCooldownTarget_${user.uid}`);
            if (currentTarget) {
                const remaining = Math.ceil((parseInt(currentTarget) - Date.now()) / 1000);
                setAdCooldown(Math.max(0, remaining));
            }

            setIsVideoAdProcessing(false);
            videoAdLockRef.current = false;
        }
    };

    // ========== UI HELPERS ==========
    const isLimitReached = currentSelfEarned >= SELF_EARNING_LIMIT;

    useEffect(() => {
        setTickerMsg(t.winnerTickerGeneric || "Win up to 777 Points! Good Luck! 🍀");
    }, [t.winnerTickerGeneric]);

    const getCurrencyDisplay = (pts: number) => {
        const krw = Math.floor(pts * 0.01);
        const php = (pts / 2500).toFixed(2);
        return `(₩${krw} / ₱${php})`;
    };

    // ========== RENDER ==========
    return (
        <div className="screen mission-screen">
            <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', whiteSpace: 'nowrap', zIndex: 10 }}>
                {tickerMsg}
            </div>

            <h3>{t.dailyMissions}</h3>
            <div className="dashboard-container" style={{ background: '#222', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #333' }}>
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{t.selfEarning}</span>
                        <span style={{ fontSize: '0.9rem', color: isLimitReached ? '#ff4757' : '#4cd137' }}>
                            {currentSelfEarned.toLocaleString()} / {SELF_EARNING_LIMIT.toLocaleString()} P
                        </span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: '#444', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (currentSelfEarned / SELF_EARNING_LIMIT) * 100)}%`, height: '100%', background: isLimitReached ? '#ff4757' : 'linear-gradient(90deg, #fbc531, #4cd137)' }}></div>
                    </div>
                </div>

                {/* Referral Earning Section (Restored) */}
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{t.referralBonus || "Referral Bonus"} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#aaa' }}>(Unlimited)</span></span>
                        <span style={{ fontSize: '0.9rem', color: '#00d2d3' }}>
                            {currentReferralEarned.toLocaleString()} P
                        </span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: '#444', borderRadius: '5px', overflow: 'hidden' }}>
                        {/* Referral earnings typically don't have a limit, so just a full bar or progress based on some arbitrary visual target if desired, but a full simple bar or no bar is fine. 
                            Let's use a simple full bar style to match the aesthetic but distinct color. */}
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #48dbfb, #00d2d3)' }}></div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #444', paddingTop: '15px', marginTop: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: '#ff9f43' }}>{t.dailyBonusTitle || "Daily Bonus"}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        {[10, 30, 50].map(tier => {
                            const isReached = localAdCount >= tier;
                            const claimedList = (userData as any)?.lastMissionClaimDate === today ? ((userData as any)?.missionClaims || []) : [];
                            const isClaimed = claimedList.includes(tier);
                            let reward = tier === 10 ? 50 : tier === 30 ? 100 : 200;

                            return (
                                <button
                                    key={tier}
                                    disabled={!isReached || isClaimed}
                                    onClick={async () => {
                                        if (!isReached || isClaimed) return;
                                        try {
                                            const fn = httpsCallable(functions, 'claimDailyMissionReward');
                                            const res = await fn({ tier, token: await user.getIdToken() });
                                            const data = res.data as any;
                                            if (data.success) {
                                                showToast(data.message, 'success');
                                                setCurrentSelfEarned((cur: number) => cur + data.reward);
                                            }
                                        } catch (e: any) { showToast(e.message || "Error", 'error'); }
                                    }}
                                    style={{
                                        flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #555',
                                        background: isClaimed ? '#222' : (isReached ? '#e1b12c' : '#333'),
                                        color: isClaimed ? '#666' : (isReached ? '#000' : '#888'),
                                        fontWeight: 'bold', fontSize: '0.85rem'
                                    }}
                                >
                                    <div>{tier} Ads</div>
                                    <div style={{ fontSize: '0.75rem' }}>{isClaimed ? "Done" : `+${reward}P`}</div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '15px', textAlign: 'right' }}>
                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Today Total: </span>
                    <span style={{ color: '#ffd32a', fontWeight: 'bold', fontSize: '1.1rem' }}>{(currentSelfEarned + currentReferralEarned).toLocaleString()} P</span>
                    <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: '5px' }}>{getCurrencyDisplay(currentSelfEarned + currentReferralEarned)}</span>
                </div>
            </div>

            {/* A. Roulette Button */}
            <div className="roulette-card" style={{ position: 'relative' }}>
                <div className="roulette-header">
                    <h4>{t.luckyRoulette}</h4>
                    <span className="spins-left">{t.spinLeft}: {(MAX_DAILY_ROULETTE - dailySpinsDone)} / {MAX_DAILY_ROULETTE}</span>
                </div>
                <div className="roulette-display">{rouletteDisplay}</div>
                <button
                    className="spin-btn"
                    onClick={onRouletteClick}
                    disabled={isRouletteSpinning || isRouletteAdProcessing || isMaxSpinsReached || rouletteLockRef.current}
                >
                    {isRouletteSpinning ? t.spinning : (isMaxSpinsReached ? t.spinLimitReached : t.lucky_msg_0)}
                </button>
            </div>

            {/* B. Video Ad Button */}
            <div className="mission-list" style={{ marginTop: '20px' }}>
                <div
                    className={`mission-item ${adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing ? 'disabled' : ''}`}
                    onClick={handleWatchAd}
                    style={{
                        background: '#222',
                        padding: '15px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                        cursor: (adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing) ? 'not-allowed' : 'pointer',
                        border: '1px solid #333',
                        opacity: (adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing) ? 0.6 : 1
                    }}
                >
                    <div style={{ fontSize: '24px' }}>📺</div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0 }}>{t.watchAd}</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#aaa' }}>
                            {t.earnAd} ({localAdCount}/{MAX_DAILY_ADS})
                            {fallbackRewardCount > 0 && ` | Fallback: ${fallbackRewardCount}/${MAX_FALLBACK_REWARDS}`}
                        </p>
                    </div>
                    <button
                        disabled={adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: (adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing) ? '#555' : '#3498db',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: (adCooldown > 0 || localAdCount >= MAX_DAILY_ADS || isVideoAdProcessing) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isVideoAdProcessing ? '...' : (adCooldown > 0 ? `${adCooldown}s` : t.go)}
                    </button>
                </div>
            </div>

            {/* Roulette Ad Modal */}
            {showSpinAdModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: '#222', padding: '20px', borderRadius: '12px', width: '80%', maxWidth: '300px', textAlign: 'center', border: '1px solid #444' }}>
                        <h4>{t.lucky_msg_0}</h4>
                        <p>Watch an ad to play once more?</p>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button
                                onClick={handleWatchSpinAd}
                                disabled={isRouletteAdProcessing}
                                style={{ flex: 1, padding: '10px', background: isRouletteAdProcessing ? '#555' : '#3498db', border: 'none', borderRadius: '8px', color: 'white' }}
                            >
                                {isRouletteAdProcessing ? '...' : (t.yesWatch || 'Yes, Watch')}
                            </button>
                            <button
                                onClick={() => setShowSpinAdModal(false)}
                                disabled={isRouletteAdProcessing}
                                style={{ flex: 1, padding: '10px', background: '#555', border: 'none', borderRadius: '8px', color: 'white' }}
                            >
                                {t.cancel}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Limit Reached Modal */}
            {showLimitModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: '#1e272e', padding: '25px', borderRadius: '16px', width: '85%', maxWidth: '320px', textAlign: 'center', border: '2px solid #ffd32a' }}>
                        <h3 style={{ color: '#ffd32a' }}>{t.limitReachedTitle}</h3>
                        <p>{t.limitReachedMsg}</p>
                        <button onClick={() => setShowLimitModal(false)} style={{ width: '100%', padding: '12px', background: '#ffd32a', border: 'none', borderRadius: '8px', color: '#000', fontWeight: 'bold', marginTop: '20px' }}>{t.confirm}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
