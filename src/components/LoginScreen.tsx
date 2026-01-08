import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, query, collection, where, getDocs, serverTimestamp, updateDoc, increment } from 'firebase/firestore';

interface LoginScreenProps {
    t: any;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function LoginScreen({ t, showToast }: LoginScreenProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [referrerCode, setReferrerCode] = useState('');
    const [isReferralLocked, setIsReferralLocked] = useState(false);

    // ⚖️ 약관 동의 상태
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [agreePrivacy, setAgreePrivacy] = useState(false);

    // Auto-fill referral code from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get('ref');
        if (ref) {
            console.log("Auto-filling referral code:", ref);
            setReferrerCode(ref);
            setIsLogin(false); // Switch to Sign Up mode automatically
            setIsReferralLocked(true);
        }
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                showToast(t.loginSuccess, 'success');
            } else {
                // 🛡️ [보안] 약관 동의 확인
                if (!agreeTerms || !agreePrivacy) {
                    showToast("Please agree to the Terms and Privacy Policy.", 'error');
                    return;
                }

                // Check for duplicate email
                const signInMethods = await fetchSignInMethodsForEmail(auth, email);
                if (signInMethods.length > 0) {
                    showToast(t.emailInUse, 'error');
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const uid = userCredential.user.uid;
                const newReferralCode = Math.floor(100000 + Math.random() * 900000).toString();

                let referrerUid = null;
                if (referrerCode) {
                    const q = query(collection(db, 'users'), where('referral_code', '==', referrerCode));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        referrerUid = snapshot.docs[0].id;
                        // INCREMENT REFERRAL COUNT BEFORE CREATING NEW USER
                        const referrerRef = doc(db, 'users', referrerUid);
                        await updateDoc(referrerRef, { referral_count: increment(1) });
                    }
                }

                await setDoc(doc(db, 'users', uid), {
                    email,
                    points: 0,
                    is_admin: false,
                    referral_code: newReferralCode,
                    referrer_uid: referrerUid,
                    created_at: serverTimestamp(),
                    dailyAdCount: 0,
                    dailyRouletteSpins: 0,
                    referral_count: 0,
                    referral_bonus: 0,
                    agreed_to_terms_at: serverTimestamp(),
                    agreed_to_privacy_at: serverTimestamp()
                });
                showToast(t.signupSuccess, 'success');
            }
        } catch (err: any) {
            console.error("Auth Error Detail:", err); // [DEBUG] Log full error
            if (err.code === 'auth/invalid-credential') {
                console.error("Check allowed domains in Firebase Console -> Authentication -> Settings -> Authorized Domains.");
            }
            showToast(err.message, 'error');
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            showToast(t.enterEmailFirst, 'info');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            showToast(t.resetEmailSent, 'success');
        } catch (error) {
            console.error("Reset Password Error:", error);
            showToast(t.resetEmailFail, 'error');
        }
    };

    const openDoc = (type: string) => {
        window.open(`/${type}.html`, '_blank');
    };

    return (
        <div className="login-screen">
            <h2>{isLogin ? t.login : t.signup}</h2>
            <form onSubmit={handleAuth}>
                <input type="email" placeholder={t.email} value={email} onChange={e => setEmail(e.target.value)} required />
                <input type="password" placeholder={t.password} value={password} onChange={e => setPassword(e.target.value)} required />

                {!isLogin && (
                    <>
                        <input
                            type="text"
                            placeholder={t.refCodeOptional}
                            value={referrerCode}
                            onChange={e => setReferrerCode(e.target.value)}
                            readOnly={isReferralLocked}
                            style={isReferralLocked ? { backgroundColor: '#e8f0fe', color: '#333', fontWeight: 'bold' } : {}}
                        />

                        {/* ⚖️ 약관 동의 UI */}
                        <div className="terms-container" style={{ textAlign: 'left', marginTop: '10px', fontSize: '0.9rem', color: '#555' }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="check_terms"
                                    checked={agreeTerms}
                                    onChange={e => setAgreeTerms(e.target.checked)}
                                    style={{ width: 'auto', marginRight: '8px' }}
                                />
                                <label htmlFor="check_terms" style={{ flex: 1 }}>
                                    (Required) Terms of Service
                                </label>
                                <span onClick={() => openDoc('terms')} style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>
                                    [View]
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                                <input
                                    type="checkbox"
                                    id="check_privacy"
                                    checked={agreePrivacy}
                                    onChange={e => setAgreePrivacy(e.target.checked)}
                                    style={{ width: 'auto', marginRight: '8px' }}
                                />
                                <label htmlFor="check_privacy" style={{ flex: 1 }}>
                                    (Required) Privacy Policy
                                </label>
                                <span onClick={() => openDoc('privacy')} style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>
                                    [View]
                                </span>
                            </div>
                        </div>

                        {/* ⛔ [추가] 1인 1계정 강력 경고 박스 */}
                        <div style={{
                            backgroundColor: '#fff5f5',
                            border: '1px solid #fc8181',
                            borderRadius: '4px',
                            padding: '10px',
                            margin: '10px 0 20px 0',
                            fontSize: '0.85rem',
                            color: '#c53030',
                            textAlign: 'left'
                        }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Warning / 주의</div>
                            <div>1 Person = 1 Account Policy.</div>
                            <div>Multiple accounts will be <strong>BANNED</strong> immediately without notice.</div>
                            <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>다중 계정 생성 적발 시 예고 없이 영구 차단됩니다.</div>
                        </div>
                    </>
                )}

                <button
                    type="submit"
                    disabled={!isLogin && (!agreeTerms || !agreePrivacy)}
                    style={(!isLogin && (!agreeTerms || !agreePrivacy)) ? { backgroundColor: '#ccc', cursor: 'not-allowed' } : {}}
                >
                    {isLogin ? t.login : t.signup}
                </button>
            </form>

            {isLogin && (
                <p
                    onClick={handleForgotPassword}
                    style={{
                        marginTop: '10px',
                        fontSize: '0.9rem',
                        color: '#888',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textAlign: 'center'
                    }}
                >
                    {t.forgotPassword}
                </p>
            )}
            <p onClick={() => { setIsLogin(!isLogin); setAgreeTerms(false); setAgreePrivacy(false); }} className="switch-auth">
                {isLogin ? t.needAccount : t.haveAccount}
            </p>
        </div>
    );
}