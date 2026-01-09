import { useState, useEffect } from 'react';
import { auth, db, functions } from '../firebase';
import { signOut, User, sendEmailVerification } from 'firebase/auth';
import { collection, query, where, getCountFromServer, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { UserData, Lang } from '../types';
import { APP_VERSION, SHARING_BASE_URL } from '../constants';
import { useTranslation } from '../hooks/useTranslation';
import { AboutModalContent } from './AboutModalContent';

interface ProfileTabProps {
    userData: UserData | null;
    t: any;
    lang: Lang;
    setLang: (lang: Lang) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    currentUser: User | null;
}

export function ProfileTab({ userData, t: tDict, lang, setLang, showToast, currentUser }: ProfileTabProps) {
    const { t } = useTranslation(lang);
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [localReferralCount, setLocalReferralCount] = useState<number | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Auto-Sync Referral Count
    useEffect(() => {
        const syncReferralCount = async () => {
            if (!currentUser?.uid) return;

            try {
                const q = query(collection(db, 'users'), where('referrer_uid', '==', currentUser.uid));
                const snapshot = await getCountFromServer(q);
                const realCount = snapshot.data().count;
                const currentCount = (userData as any)?.referral_count || 0;

                if (realCount !== currentCount) {
                    const userRef = doc(db, 'users', currentUser.uid);
                    await updateDoc(userRef, { referral_count: realCount });
                    setLocalReferralCount(realCount);
                }
            } catch (error) {
                console.error("Failed to sync referral count:", error);
            }
        };

        syncReferralCount();
    }, [currentUser?.uid]);

    // 🛑 계정 탈퇴 로직
    const handleDeleteAccount = async () => {
        if (!currentUser) return;
        setIsDeleting(true);
        try {
            const deleteUserAcct = httpsCallable(functions, 'deleteUserAccount');
            await deleteUserAcct();

            // 성공 시 처리
            await signOut(auth);
            showToast(t('deleteSuccess'), 'success');
            // 이미 signOut 되면 App.tsx 레벨에서 화면 전환이 일어날 것임 (LoginScreen으로)
        } catch (error: any) {
            console.error("Delete Account Error:", error);
            showToast(t('deleteError'), 'error');
            setShowDeleteModal(false);
        } finally {
            setIsDeleting(false);
        }
    };

    const [referralInput, setReferralInput] = useState('');
    const [isSubmittingRef, setIsSubmittingRef] = useState(false);

    const handleLogout = async () => {
        await signOut(auth);
        showToast(t('logoutSuccess'), 'success');
    };

    const handleSubmitReferral = async () => {
        if (!referralInput || isSubmittingRef) return;
        setIsSubmittingRef(true);
        try {
            const submitReferralCode = httpsCallable(functions, 'submitReferralCode');
            const result = await submitReferralCode({ referralCode: referralInput });
            const data = result.data as any;
            if (data.success) {
                showToast(data.message, 'success');
                // Optional: Update local user data if needed, or rely on snapshot
                setReferralInput('');
            }
        } catch (error: any) {
            console.error("Referral Error:", error);
            showToast(error.message || t('referral_error'), 'error');
        } finally {
            setIsSubmittingRef(false);
        }
    };

    // 📧 [추가됨] 이메일 인증 메일 보내기
    const handleVerifyEmail = async () => {
        if (!currentUser) return;
        try {
            await sendEmailVerification(currentUser);
            showToast(t('auth_email_sent_success'), 'success');
        } catch (e: any) {
            console.error(e);
            showToast(t('error_try_again'), 'error');
        }
    };

    const getInviteText = () => {
        // [V1.0.14 Cleanup] Unified Logic using i18n
        return `${t('shareText')}\n${t('my_referral_code')}: ${userData?.referral_code}`;
    };

    const handleShare = async () => {
        // [Defensive] Force Production URL to prevent 'localhost' issues
        let baseUrl = SHARING_BASE_URL;
        if (!baseUrl || baseUrl.includes('localhost')) {
            baseUrl = 'https://play.google.com/store/apps/details?id=com.dreambridgehq.pocketmoney';
        }

        const shareUrl = userData?.referral_code
            ? `${baseUrl}&ref=${userData.referral_code}`
            : baseUrl;
        const inviteText = getInviteText();

        const shareData = {
            title: t('shareTitle'),
            text: inviteText,
            url: shareUrl
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Share closed');
            }
        } else {
            navigator.clipboard.writeText(`${inviteText}\n${shareUrl}`);
            showToast(t('linkCopied'), 'success');
        }
    };

    const handleContactSupport = () => {
        // [V1.0.14] Keep Kakao for Korean users? Or unify?
        // User requested: "getInviteText logic unification". 
        // Contact Support wasn't explicitly mentioned to be unified but "ALL hardcoding check". 
        // I will trust the translation keys for now.
        if (lang === 'ko') {
            window.open('https://open.kakao.com/o/sIcvdI5h', '_blank');
        } else {
            const subject = `Support Request: ${userData?.email || 'User'}`;
            const body = `User ID: ${currentUser?.uid}\nVersion: ${APP_VERSION}\n\nProblem Description:\n`;
            window.open(`mailto:support@dreambridgehq.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
        }
    };

    const referralCount = localReferralCount !== null ? localReferralCount : ((userData as any)?.referral_count || 0);
    const referralBonus = (userData as any)?.referral_bonus || 0;

    const getRankInfo = () => {
        if (referralCount >= 50) return { rank: 'Gold', icon: '👑', next: 0, color: '#ffd700' };
        if (referralCount >= 10) return { rank: 'Silver', icon: '🥈', next: 50 - referralCount, color: '#c0c0c0' };
        return { rank: 'Bronze', icon: '🥉', next: 10 - referralCount, color: '#cd7f32' };
    };
    const rankInfo = getRankInfo();

    return (
        <div className="screen profile-screen">
            <div className="profile-header">
                <div className="avatar">👤</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <h3 style={{ margin: 0 }}>{userData?.email}</h3>

                    {/* 🔒 [추가됨] 이메일 인증 상태 표시 및 버튼 */}
                    {currentUser?.emailVerified ? (
                        <span style={{ fontSize: '0.8rem', color: '#2ecc71', background: 'rgba(46, 204, 113, 0.1)', padding: '4px 8px', borderRadius: '12px' }}>
                            ✅ {t('verified_status')}
                        </span>
                    ) : (
                        <button
                            onClick={handleVerifyEmail}
                            style={{
                                fontSize: '0.8rem', color: '#e74c3c', background: 'rgba(231, 76, 60, 0.1)',
                                border: '1px solid #e74c3c', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer'
                            }}
                        >
                            ⚠️ {t('verify_now')}
                        </button>
                    )}
                </div>

                <div className="lang-toggle" style={{ marginTop: '15px' }}>
                    <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
                    <button className={lang === 'ko' ? 'active' : ''} onClick={() => setLang('ko')}>KO</button>
                    <button className={lang === 'ph' ? 'active' : ''} onClick={() => setLang('ph')}>PH</button>
                </div>
            </div>

            <div className="network-dashboard-card">
                <div className="network-header">
                    <h3>{t('myNetwork')}</h3>
                    <div className="help-icon" onClick={() => setShowNetworkModal(true)}>?</div>
                </div>
                <div className="network-stats">
                    <div className="stat-item">
                        <span className="stat-label">{t('myLevel')}</span>
                        <span className="stat-value" style={{ color: rankInfo.color }}>{rankInfo.icon} {rankInfo.rank}</span>
                        {rankInfo.next > 0 && <span className="stat-sub">Next: {rankInfo.next}</span>}
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">{t('teamMembers')}</span>
                        <span className="stat-value">{referralCount}</span>
                        <span className="stat-sub">{t('unit_people')}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">{t('referralBonus')}</span>
                        <span className="stat-value gold">{referralBonus.toLocaleString()}</span>
                        <span className="stat-sub">{t('unit_points')}</span>
                    </div>
                </div>
            </div>

            <div className="profile-menu">
                <div className="menu-item invite-btn" onClick={handleShare} style={{ backgroundColor: '#2c3e50', border: '1px solid #3498db' }}>
                    <span style={{ color: '#3498db', fontWeight: 'bold' }}>{t('inviteFriends')}</span>
                    <span className="arrow">›</span>
                </div>
                <div className="menu-item" onClick={handleContactSupport}>
                    <span>{t('contactSupport')}</span>
                    <span className="arrow">›</span>
                </div>
                <div className="menu-item" onClick={handleLogout}>
                    <span>{t('logout')}</span>
                    <span className="arrow">›</span>
                </div>
            </div>

            {/* Referral Submission Section */}
            <div className="referral-input-section" style={{ padding: '0 20px', marginTop: '20px' }}>
                <h3>{t('referral_title')}</h3>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ccc' }}>
                        {t('my_referral_code')}: <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{userData?.referral_code || 'Loading...'}</strong>
                    </p>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder={t('enter_friend_code')}
                            value={referralInput}
                            onChange={(e) => setReferralInput(e.target.value)}
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff' }}
                        />
                        <button
                            onClick={handleSubmitReferral}
                            disabled={isSubmittingRef || !referralInput}
                            style={{ padding: '0 15px', borderRadius: '8px', border: 'none', background: '#3498db', color: 'white', fontWeight: 'bold', cursor: 'pointer', opacity: (isSubmittingRef || !referralInput) ? 0.5 : 1 }}
                        >
                            {isSubmittingRef ? '...' : t('submit')}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '20px', padding: '0 20px' }}>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'transparent',
                        border: '1px solid #e74c3c',
                        borderRadius: '12px',
                        color: '#e74c3c',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    {t('deleteAccountBtn')}
                </button>
            </div>

            <div className="profile-footer">
                <div className="legal-links" onClick={() => window.open('/privacy.html', '_blank')}>
                    <span>{t('termsPrivacy')}</span>
                </div>
                <div className="app-version">Ver: {APP_VERSION}</div>
            </div>

            {showNetworkModal && (
                <AboutModalContent t={tDict} onClose={() => setShowNetworkModal(false)} viewMode="ranking" />
            )}

            {/* 🛑 계정 삭제 확인 모달 */}
            {showDeleteModal && (
                <div className="modal-overlay" onClick={() => !isDeleting && setShowDeleteModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3 style={{ color: '#e74c3c' }}>{t('deleteAccountTitle')}</h3>
                        <p>{t('deleteAccountMsg')}</p>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', background: 'transparent' }}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#e74c3c', color: 'white' }}
                            >
                                {isDeleting ? t('checking') : t('deleteAccountBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}