import { useState, useEffect } from 'react';
import { functions } from '../firebase'; // Removed db import if not used directly
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { UserData } from '../types';

interface StoreTabProps {
    user: User;
    userData: UserData | null;
    t: any;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Helper to get or create a persistent Device ID
const getDeviceId = () => {
    let deviceId = localStorage.getItem('device_uuid');
    if (!deviceId) {
        // Simple UUID v4 generator if crypto.randomUUID not available everywhere
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            deviceId = crypto.randomUUID();
        } else {
            deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('device_uuid', deviceId);
    }
    return deviceId;
};

export function StoreTab({ user, userData, t, showToast }: StoreTabProps) {
    const [activeStoreTab, setActiveStoreTab] = useState<'KR' | 'PH'>('KR');
    const [isLoading, setIsLoading] = useState(false); // Global Loading State
    const [lastClickTime, setLastClickTime] = useState(0); // For Debounce

    // 📢 [기능 1] 실시간 구매 알림 (Ticker)
    const [purchaseTickerMsg, setPurchaseTickerMsg] = useState('');

    useEffect(() => {
        // [V1.0.14] Localized Purchase Ticker
        const generatePurchaseTicker = () => {
            const users = ["kimb***", "joy***", "user12***", "mark***", "lee***", "anna***", "park***", "santos***"];
            const items = ["Culture Land 5K", "Naver Pay 10K", "GCash 100", "Google Play 5K", "GCash 300", "CU voucher"];

            const randomUser = users[Math.floor(Math.random() * users.length)];
            const randomItem = items[Math.floor(Math.random() * items.length)];

            return t.purchaseNotification
                .replace('{{user}}', randomUser)
                .replace('{{item}}', randomItem);
        };

        setPurchaseTickerMsg(generatePurchaseTicker());

        const interval = setInterval(() => {
            setPurchaseTickerMsg(generatePurchaseTicker());
        }, 4000); // 4초마다 변경
        return () => clearInterval(interval);
    }, [t.purchaseNotification]);

    // 🇰🇷 한국 상품 목록
    const KR_ITEMS = [
        { id: 'cl_5000', name: '컬쳐랜드 (Culture Land)', amount: '5,000원', points: 500000, type: 'culture' },
        { id: 'cl_10000', name: '컬쳐랜드 (Culture Land)', amount: '10,000원', points: 1000000, type: 'culture' },
        { id: 'cl_30000', name: '컬쳐랜드 (Culture Land)', amount: '30,000원', points: 3000000, type: 'culture' },
        { id: 'np_5000', name: '네이버페이 (Naver Pay)', amount: '5,000원', points: 500000, type: 'naver' },
        { id: 'np_10000', name: '네이버페이 (Naver Pay)', amount: '10,000원', points: 1000000, type: 'naver' },
    ];

    // 🇵🇭 필리핀 상품 목록 (카드형 리뉴얼)
    const PH_ITEMS = [
        { id: 'gc_100', name: 'GCash', amount: '₱ 100', points: 250000, type: 'gcash' },
        { id: 'gc_200', name: 'GCash', amount: '₱ 200', points: 500000, type: 'gcash' },
        { id: 'gc_300', name: 'GCash', amount: '₱ 300', points: 750000, type: 'gcash' },
        { id: 'gc_500', name: 'GCash', amount: '₱ 500', points: 1250000, type: 'gcash' },
        { id: 'gc_1000', name: 'GCash', amount: '₱ 1,000', points: 2500000, type: 'gcash' },
    ];

    const checkWeeklyLimit = () => {
        if (!userData?.last_withdrawal_date) return true;
        const lastDate = new Date(userData.last_withdrawal_date);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 7) {
            showToast(t.weeklyLimitError, 'error');
            return false;
        }
        return true;
    };

    // 🛒 [기능 2 & 3] 통합 구매 로직 (Secure: Cloud Function)
    const handlePurchase = async (item: any, isKorea: boolean) => {
        // [Protection 1] Debounce (3 Seconds)
        const now = Date.now();
        if (now - lastClickTime < 3000) {
            return; // Ignore clicks within 3 seconds
        }
        setLastClickTime(now);

        // [Protection 2] Loading State
        if (isLoading) return;

        // 🔒 [보안] 이메일 인증 체크
        if (!user.emailVerified) {
            showToast(t.emailVerifyError, 'error');
            return;
        }

        if (!userData || userData.points < item.points) {
            showToast(t.notEnoughPoints, 'error');
            return;
        }

        if (!checkWeeklyLimit()) return;

        // 📝 정보 입력 받기
        let promptMsg = "";
        if (isKorea) {
            promptMsg = t.enterPhoneNumber;
        } else {
            promptMsg = t.enterGcashNumber;
        }

        const contactInfo = window.prompt(`${item.name} - ${item.amount}\n\n${promptMsg}`);

        if (contactInfo === null) return; // 취소
        if (contactInfo.trim() === "") {
            showToast(t.enterInfoError, 'error');
            return;
        }

        // 최종 확인
        const confirmMsg = t.confirmPurchase
            .replace('{{item}}', `${item.name} (${item.amount})`)
            .replace('{{info}}', contactInfo);

        if (window.confirm(confirmMsg)) {
            setIsLoading(true); // Start Global Loading

            try {
                const requestWithdrawal = httpsCallable(functions, 'requestWithdrawal');
                const idempotencyKey = `${user.uid}_${Date.now()}_${item.points}`;
                const deviceId = getDeviceId(); // [NEW] Get Device ID
                const userAgent = navigator.userAgent; // [NEW] Get User Agent

                const result = await requestWithdrawal({
                    amount: item.points,
                    country: isKorea ? 'KR' : 'PH',
                    itemName: item.name,
                    contactInfo: contactInfo,
                    idempotencyKey: idempotencyKey,
                    deviceId: deviceId, // Pass to backend
                    userAgent: userAgent // Pass to backend
                });

                const data = result.data as any;

                if (data.success) {
                    showToast(t.reqSuccess, 'success');

                    // 한국 유저 카톡 안내
                    if (isKorea) {
                        const KAKAO_LINK = 'https://open.kakao.com/o/sIcvdI5h';
                        if (window.confirm(t.confirmKakao)) {
                            window.open(KAKAO_LINK, '_blank');
                        }
                    }
                } else {
                    showToast(data.message || t.reqFail, 'error');
                }

            } catch (e: any) {
                console.error("Withdrawal Error:", e);
                const errMsg = e.message || t.reqFail;
                // Simple error mapping
                if (errMsg.includes("resource-exhausted")) showToast(t.errorResourceExhausted, 'error');
                else if (errMsg.includes("failed-precondition")) showToast(t.errorPrecondition, 'error');
                else showToast(errMsg, 'error');
            } finally {
                setIsLoading(false); // Stop Global Loading
            }
        }
    };

    return (
        <div className="screen store-screen">
            {/* 🛑 [Global Loading Spinner] */}
            {isLoading && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
                }}>
                    <div className="spinner"></div>
                    <p style={{ color: 'white', marginTop: '15px' }}>Processing Transaction...</p>
                </div>
            )}

            {/* 📢 상단 알림 티커 */}
            <div style={{
                background: '#f1f2f6', color: '#2f3542', padding: '10px 15px', borderRadius: '20px',
                marginBottom: '15px', fontSize: '0.85rem', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
                <span style={{ marginRight: '8px' }}>🔔</span>
                <span className="fade-in-text">
                    {purchaseTickerMsg}
                </span>
            </div>

            <div className="store-tabs">
                <button className={`store-tab ${activeStoreTab === 'KR' ? 'active' : ''}`} onClick={() => setActiveStoreTab('KR')}>{t.korea}</button>
                <button className={`store-tab ${activeStoreTab === 'PH' ? 'active' : ''}`} onClick={() => setActiveStoreTab('PH')}>{t.philippines}</button>
            </div>

            {/* 안내 배너 */}
            <div style={{
                background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', padding: '12px', borderRadius: '10px',
                marginBottom: '20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', border: '1px solid rgba(52, 152, 219, 0.3)'
            }}>
                <span style={{ marginRight: '10px', fontSize: '1.2rem' }}>ℹ️</span>
                <span>
                    {t.storeNotice}
                </span>
            </div>

            {/* 상품 그리드 (한국 & 필리핀 공통 디자인) */}
            <div className="gift-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {(activeStoreTab === 'KR' ? KR_ITEMS : PH_ITEMS).map((card, index) => (
                    <div key={index} onClick={() => handlePurchase(card, activeStoreTab === 'KR')}
                        style={{
                            background: '#2c3e50', padding: '15px', borderRadius: '12px', border: '1px solid #34495e',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                            minHeight: '130px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                            position: 'relative', overflow: 'hidden',
                            opacity: isLoading ? 0.7 : 1, // Visual feedback for disabled
                            pointerEvents: isLoading ? 'none' : 'auto'
                        }}
                    >
                        <div style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '4px',
                            background: activeStoreTab === 'KR' ? '#e74c3c' : '#f1c40f'
                        }}></div>

                        <span style={{ fontSize: '0.8rem', color: '#bdc3c7', marginTop: '10px', textAlign: 'center' }}>{card.name}</span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'white', margin: '10px 0' }}>
                            {activeStoreTab === 'KR' ? `₩ ${(card.points * 0.01).toLocaleString()}` : card.amount}
                        </span>
                        <div style={{
                            background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: '15px',
                            color: '#ffd700', fontWeight: 'bold', fontSize: '0.9rem'
                        }}>
                            {card.points.toLocaleString()} P
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}