import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserData } from '../types';
import { doc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { AboutModalContent } from './AboutModalContent';

interface HomeTabProps {
    user: User;
    userData: UserData | null;
    topUsers: UserData[];
    t: any;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function HomeTab({ userData, topUsers, t, showToast }: HomeTabProps) {
    const [rankingList, setRankingList] = useState<UserData[]>([]);
    const [withdrawRanking, setWithdrawRanking] = useState<UserData[]>([]);
    const [rankingMode, setRankingMode] = useState<'points' | 'withdraw'>('points');
    const [showAboutModal, setShowAboutModal] = useState(false);

    useEffect(() => {
        const unsubPoints = onSnapshot(doc(db, "system", "rankings"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.top10) setRankingList(data.top10 as UserData[]);
            }
        });

        const qWithdraw = query(collection(db, "users"), orderBy("total_withdrawn", "desc"), limit(10));
        const unsubWithdraw = onSnapshot(qWithdraw, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ ...doc.data(), email: doc.data().email || "User" } as UserData));
            setWithdrawRanking(list);
        });

        return () => {
            unsubPoints();
            unsubWithdraw();
        };
    }, []);

    const effectiveRankings = rankingMode === 'points' ? (rankingList.length > 0 ? rankingList : topUsers) : withdrawRanking;

    const currentStreak = userData?.attendanceStreak || 0;
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const monthDates = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    });

    const attendanceHistory = userData?.attendanceHistory || [];
    const todayDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    let nextBonusTarget = 7;
    let nextBonusAmount = 100;
    if (currentStreak >= 7 && currentStreak < 15) { nextBonusTarget = 15; nextBonusAmount = 200; }
    else if (currentStreak >= 15 && currentStreak < 30) { nextBonusTarget = 30; nextBonusAmount = 500; }
    else if (currentStreak >= 30) { nextBonusTarget = 7; nextBonusAmount = 100; }

    const daysUntilBonus = Math.max(0, nextBonusTarget - currentStreak);

    const getCurrencyDisplay = (points: number) => {
        const lang = navigator.language.toLowerCase();
        if (lang.includes('ko')) return `≈ ${(points / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${t.currency_krw}`;
        if (lang.includes('ph') || lang.includes('fil')) return `≈ ${(points / 2500).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.currency_php}`;
        return `≈ $${(points / 140000).toFixed(4)} ${t.currency_usd}`;
    };



    return (
        <div className="screen home-screen">
            <div className="dashboard-card" style={{ marginBottom: '20px', border: '2px solid #ffd32a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{t.myBalance}</h3>
                        <div className="balance-info" style={{ marginTop: '5px' }}>
                            <span className="points" style={{ fontSize: '2rem', color: '#ffd32a' }}>{userData?.points?.toLocaleString() ?? 0} P</span>
                            <span className="krw" style={{ display: 'block', fontSize: '0.9rem', color: '#aaa' }}>{getCurrencyDisplay(userData?.points ?? 0)}</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8rem', color: '#888' }}>Total Payout</span>
                        <span style={{ display: 'block', fontWeight: 'bold', color: '#00d2d3' }}>
                            {(userData?.total_withdrawn || 0).toLocaleString()} P
                        </span>
                    </div>
                </div>
            </div>

            <div className="attendance-board" style={{ background: '#222', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, color: '#eee' }}>{t.attendanceTitle}</h4>
                    <span style={{ fontSize: '0.9rem', color: '#aaa' }}>{currentYear}.{currentMonth + 1}</span>
                </div>
                <div
                    onClick={() => showToast(t.bonusRules, 'info')}
                    style={{ display: 'flex', alignItems: 'center', marginBottom: '15px', background: '#333', padding: '10px', borderRadius: '8px', cursor: 'pointer' }}
                >
                    <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid #444' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: '#ccc' }}>{t.streakLabel}</span>
                        <span style={{ display: 'block', fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>🔥 {currentStreak} {t.day}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: '#ccc' }}>{t.nextBonus}</span>
                        <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 'bold', color: '#00d2d3' }}>
                            {daysUntilBonus > 0 ? `D-${daysUntilBonus}` : t.achieved} (+{nextBonusAmount}P)
                        </span>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', justifyItems: 'center' }}>
                    {monthDates.map((dateStr, index) => {
                        const dayNum = index + 1;
                        const isAttended = attendanceHistory.includes(dateStr);
                        const isToday = dateStr === todayDateStr;
                        const isPast = new Date(dateStr) < new Date(todayDateStr);
                        let bg = '#333';
                        let color = '#888';
                        let border = 'none';
                        let content: React.ReactNode = dayNum;
                        if (isAttended) {
                            bg = '#ffd32a';
                            color = '#000';
                            content = <span style={{ fontSize: '0.6rem', fontWeight: '900' }}>PMA</span>;
                        } else if (isToday) {
                            bg = '#222';
                            border = '1px solid #ffd32a';
                            color = '#fff';
                        } else if (isPast) {
                            bg = '#2a2a2a';
                            color = '#444';
                        }
                        return (
                            <div key={dateStr} onClick={() => showToast("Daily attendance is checked automatically!", 'info')} style={{ width: '32px', height: '32px', background: bg, border: border, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                {content}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="banner" onClick={() => setShowAboutModal(true)} style={{
                cursor: 'pointer',
                marginBottom: '20px',
                background: 'linear-gradient(135deg, #2c3e50 0%, #000 100%)',
                border: '1px solid #3498db'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: '#3498db' }}>{t.pma_guide_title}</h3>
                    <span style={{ fontSize: '0.8rem', textDecoration: 'underline', color: '#aaa' }}>{t.viewAll || 'Details'}</span>
                </div>
                <p style={{ marginTop: '5px', color: '#ddd', fontSize: '0.9rem' }} dangerouslySetInnerHTML={{ __html: t.pma_network_desc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </div>

            <div className="ranking-section">
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button onClick={() => setRankingMode('points')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: rankingMode === 'points' ? '#ffd32a' : '#333', color: rankingMode === 'points' ? '#000' : '#888', fontWeight: 'bold' }}>{t.ranking_points}</button>
                    <button onClick={() => setRankingMode('withdraw')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: rankingMode === 'withdraw' ? '#00d2d3' : '#333', color: rankingMode === 'withdraw' ? '#000' : '#888', fontWeight: 'bold' }}>{t.ranking_withdraw}</button>
                </div>
                <div className="ranking-list">
                    {effectiveRankings.length === 0 ? (
                        <p className="no-ranking">{t.noRanking}</p>
                    ) : (
                        effectiveRankings.map((u, index) => (
                            <div key={index} className="ranking-item">
                                <span className="rank" style={{ color: index < 3 ? '#ffd700' : '#aaa' }}>#{index + 1}</span>
                                <span className="rank-email">{u.email ? u.email.split('@')[0] : 'User'}***</span>
                                <span className="rank-points">{(rankingMode === 'points' ? u.points : u.total_withdrawn || 0)?.toLocaleString()} P</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showAboutModal && (
                <AboutModalContent t={t} onClose={() => setShowAboutModal(false)} viewMode="full" />
            )}
        </div>
    );
}
