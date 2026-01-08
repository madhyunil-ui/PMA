import { useState, useEffect, lazy, Suspense } from 'react';
import { auth, db } from './firebase';
import './App.css';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { UserData, Tab, Lang } from './types';
import { translations } from './translations';
import { LoginScreen } from './components/LoginScreen';
import { HomeTab } from './components/HomeTab';
import { Toast } from './components/Toast';

// ⚡ [Performance] Code Splitting for heavy tabs
const MissionTab = lazy(() => import('./components/MissionTab').then(module => ({ default: module.MissionTab })));
const StoreTab = lazy(() => import('./components/StoreTab').then(module => ({ default: module.StoreTab })));
const ProfileTab = lazy(() => import('./components/ProfileTab').then(module => ({ default: module.ProfileTab })));
const AdminTab = lazy(() => import('./components/AdminTab').then(module => ({ default: module.AdminTab })));

// Loading Spinner for Code Splitting
const TabLoading = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#888' }}>
        <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #3498db' }}></div>
    </div>
);

// Default User Data
const DEFAULT_USER_DATA: UserData = {
    email: '',
    points: 0,
    is_admin: false,
    referral_code: 'ERROR',
    referrer_uid: null,
    created_at: null,
    dailyAdCount: 0,
    dailyRouletteSpins: 0,
    referral_count: 0,
    referral_bonus: 0,
    total_withdrawn: 0
};

// ... (MaintenanceScreen code omitted for brevity as it remains same, ensuring context match)

// 🚧 [추가] 점검 중 화면 컴포넌트
const MaintenanceScreen = () => (
    <div className="maintenance-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f8f9fa', padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '60px', marginBottom: '20px' }}>🚧</div>
        <h2 style={{ color: '#333', marginBottom: '10px' }}>System Maintenance</h2>
        <p style={{ color: '#666', lineHeight: '1.6' }}>
            현재 서버 점검 및 업데이트 진행 중입니다.<br />
            더 나은 서비스를 위해 잠시만 기다려주세요.
        </p>
        <p style={{ marginTop: '20px', fontWeight: 'bold', color: '#007bff' }}>Pocket Money Ads</p>
    </div>
);

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [topUsers, setTopUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
    const [lang, setLang] = useState<Lang>('en');
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    // 🚨 [추가] 킬 스위치 상태 관리
    const [isMaintenance, setIsMaintenance] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ message, type });
    };

    // Localization Init
    useEffect(() => {
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.includes('ko')) {
            setLang('ko');
        } else if (browserLang.includes('ph') || browserLang.includes('fil') || browserLang.includes('tl')) {
            setLang('ph');
        } else {
            setLang('en');
        }
    }, []);

    const t = translations[lang];

    // 🚨 [추가] 킬 스위치(시스템 설정) 감지 리스너
    useEffect(() => {
        // Firestore에 'system' 컬렉션 -> 'config' 문서가 있어야 합니다.
        const unsubscribe = onSnapshot(doc(db, 'system', 'config'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setIsMaintenance(data.maintenance_mode || false); // maintenance_mode 필드 확인
            }
        }, (error) => {
            console.error("System config fetch error:", error);
        });
        return () => unsubscribe();
    }, []);


    // Auth State Listener
    useEffect(() => {
        let unsubUserData: (() => void) | undefined;
        let unsubTopUsers: (() => void) | undefined;

        // ⚡ [Timeout Fix] Force render after 2 seconds if Firebase hangs
        const safetyTimeout = setTimeout(() => {
            if (loading) {
                console.warn("⚠️ Firebase loading timeout. Forcing UI render.");
                setLoading(false);
            }
        }, 2000); // 2 Seconds Limit

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            // If timeout already happened, these updates will just refresh the data
            try {
                setUser(currentUser);
                if (currentUser) {
                    // Fetch User Data
                    unsubUserData = onSnapshot(doc(db, 'users', currentUser.uid), (docSnapshot) => {
                        clearTimeout(safetyTimeout); // Clear timeout on success
                        if (docSnapshot.exists()) {
                            setUserData(docSnapshot.data() as UserData);
                        } else {
                            setUserData({ ...DEFAULT_USER_DATA, email: currentUser.email || '' });
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Error fetching user data:", error);
                        setUserData({ ...DEFAULT_USER_DATA, email: currentUser.email || '' });
                        setLoading(false);
                    });

                    // Fetch Ranking (Direct Real-time for "Always Visible")
                    // [V3.5] Switched to direct listener to resolve "Aggregating..." stuck issue.
                    // Fetch Ranking (Direct Real-time)
                    try {
                        const q = query(collection(db, "users"), orderBy("points", "desc"), limit(10));
                        const rankingUnsub = onSnapshot(q, (querySnapshot) => {
                            if (querySnapshot.empty) {
                                setTopUsers([]);
                                // "Aggrgating..." checks topUsers.length === 0. 
                                // We need a separate state 'isRankingLoaded' or similar?
                                // Or just let it show empty list (UI logic).
                                // Current UI: topUsers.length === 0 ? "Aggregating..." : Map.
                                // If truly empty, it says "Aggregating..." forever.
                                // I will change UI logic too.
                            } else {
                                const users = querySnapshot.docs.map(d => {
                                    const dd = d.data();
                                    return {
                                        userId: d.id,
                                        email: dd.email ? dd.email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "Anonymous",
                                        points: dd.points || 0
                                    };
                                });
                                setTopUsers(users as any[]);
                            }
                        }, (error) => {
                            console.error("Ranking realtime error:", error);
                            setTopUsers([]);
                        });
                        unsubTopUsers = rankingUnsub;
                    } catch (e) {
                        console.error("Ranking query setup error:", e);
                    }
                } else {
                    setUserData(null);
                    setTopUsers([]);
                    setLoading(false);
                }
            } catch (globalError) {
                console.error("Global Auth Error:", globalError);
                setLoading(false);
            }
        });

        return () => {
            unsubscribe();
            if (unsubUserData) unsubUserData();
            if (unsubTopUsers) unsubTopUsers();
        };
    }, []);

    // Daily Reset Check
    const checkDailyReset = async (currentUser: User | null, currentData: UserData | null) => {
        if (!currentUser || !currentData) return;

        const today = new Date().toISOString().split('T')[0];
        const updates: any = {};
        let needsUpdate = false;

        // Check Ad Reset
        if (currentData.lastAdDate !== today && currentData.dailyAdCount !== 0) {
            updates.dailyAdCount = 0;
            updates.lastAdDate = today;
            needsUpdate = true;
        }

        // Check Roulette Reset
        if (currentData.lastRouletteDate !== today && currentData.dailyRouletteSpins !== 0) {
            updates.dailyRouletteSpins = 0;
            updates.lastRouletteDate = today;
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log("Performing Daily Reset...", updates);
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), updates);
                setUserData(prev => prev ? { ...prev, ...updates } : null);
            } catch (e) {
                console.error("Daily reset failed:", e);
            }
        }
    };

    useEffect(() => {
        if (user && userData) {
            checkDailyReset(user, userData);
        }
    }, [user, userData?.lastAdDate, userData?.lastRouletteDate]);

    useEffect(() => {
        if (user && userData) {
            checkDailyReset(user, userData);
        }
    }, [activeTab]);

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

    // 🚨 [추가] 킬 스위치 작동 (관리자는 제외)
    // userData가 로드된 후, is_admin이 아니면 점검 화면을 보여줌
    if (isMaintenance && userData && !userData.is_admin) {
        return <MaintenanceScreen />;
    }

    return (
        <div className="app-container">
            {!user ? (
                <LoginScreen t={t} showToast={showToast} />
            ) : (
                <>
                    <header className="app-header">
                        <h1>Pocket Money Ads</h1>
                        <div className="points-badge">
                            {userData?.points?.toLocaleString() ?? 0} P
                        </div>
                    </header>

                    <main className="app-content">
                        <Suspense fallback={<TabLoading />}>
                            {activeTab === Tab.HOME && <HomeTab user={user} userData={userData} topUsers={topUsers} t={t} showToast={showToast} />}
                            {activeTab === Tab.MISSION && <MissionTab user={user} userData={userData} t={t} showToast={showToast} />}
                            {activeTab === Tab.STORE && <StoreTab user={user} userData={userData} t={t} showToast={showToast} />}
                            {activeTab === Tab.PROFILE && <ProfileTab userData={userData} t={t} lang={lang} setLang={setLang} showToast={showToast} currentUser={user} />}
                            {activeTab === Tab.ADMIN && userData?.is_admin && <AdminTab t={t} />}
                        </Suspense>
                    </main>

                    <nav className="bottom-nav">
                        <NavButton tab={Tab.HOME} activeTab={activeTab} setActiveTab={setActiveTab} icon="🏠" label={t.tab_home} />
                        <NavButton tab={Tab.MISSION} activeTab={activeTab} setActiveTab={setActiveTab} icon="📺" label={t.tab_mission} />
                        <NavButton tab={Tab.STORE} activeTab={activeTab} setActiveTab={setActiveTab} icon="🛍️" label={t.tab_store} />
                        <NavButton tab={Tab.PROFILE} activeTab={activeTab} setActiveTab={setActiveTab} icon="👤" label={t.tab_profile} />
                        {userData?.is_admin && (
                            <NavButton tab={Tab.ADMIN} activeTab={activeTab} setActiveTab={setActiveTab} icon="🛡️" label={t.tab_admin} />
                        )}
                    </nav>

                    {/* Banner Container */}
                    <div className="bottom-banner-container">
                        {/* <span className="bottom-banner-placeholder">Banner Space</span> */}
                        {/* Banner is injected by Native Android Code on top of this area */}
                        <BannerLoader />
                    </div>
                </>
            )}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}

// Helper component to trigger banner load
function BannerLoader() {
    useEffect(() => {
        try {
            if ((window as any).Android && (window as any).Android.showBannerAd) {
                (window as any).Android.showBannerAd();
            }
        } catch (e) {
            console.error("Banner load error:", e);
        }
    }, []);
    return null;
}

function NavButton({ tab, activeTab, setActiveTab, icon, label }: any) {
    return (
        <button
            className={`nav-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
        >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
        </button>
    );
}

export default App;
