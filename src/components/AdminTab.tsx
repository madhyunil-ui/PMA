import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';

// 1. App.tsx가 던져주는 't'를 받을 준비를 합니다.
interface AdminTabProps {
    t: any;
}

// 2. 't'를 받아서 사용합니다.
export function AdminTab({ t }: AdminTabProps) {
    const [requests, setRequests] = useState<any[]>([]);
    const [filter, setFilter] = useState<'REQUESTED' | 'ALL'>('REQUESTED');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'withdrawal_requests'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setRequests(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (req: any) => {
        const infoMsg = req.contactInfo ? `\n[정보]: ${req.contactInfo}` : '';
        if (!window.confirm(`[승인 확인]\n\n상품: ${req.itemName}${infoMsg}\n\n'완료' 처리하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, 'withdrawal_requests', req.id), {
                status: 'COMPLETED',
                completedAt: serverTimestamp()
            });
            alert("처리 완료되었습니다.");
        } catch (e) {
            console.error(e);
            alert("에러가 발생했습니다.");
        }
    };

    const handleReject = async (req: any) => {
        if (!window.confirm(`[거절 및 환불]\n\n사용자에게 ${req.amount} 포인트를 환불하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, 'withdrawal_requests', req.id), {
                status: 'REJECTED',
                completedAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'users', req.userId), {
                points: increment(req.amount)
            });

            alert(`거절 완료. 환불되었습니다.`);
        } catch (e) {
            console.error(e);
            alert("에러가 발생했습니다.");
        }
    };

    const filteredRequests = requests.filter(r =>
        filter === 'ALL' ? true : r.status === 'REQUESTED'
    );

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '-';
        return new Date(timestamp.seconds * 1000).toLocaleString();
    };

    return (
        <div className="screen admin-screen" style={{ padding: '20px', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                {/* 3. 여기서 't'를 사용해줍니다! (t.admin이 없으면 영어로 표시) */}
                <h3 style={{ margin: 0 }}>👮 {t.admin || "Admin Dashboard"}</h3>
                <div style={{ background: '#333', padding: '5px', borderRadius: '8px' }}>
                    <button
                        onClick={() => setFilter('REQUESTED')}
                        style={{ background: filter === 'REQUESTED' ? '#3498db' : 'transparent', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                        대기 ({requests.filter(r => r.status === 'REQUESTED').length})
                    </button>
                    <button
                        onClick={() => setFilter('ALL')}
                        style={{ background: filter === 'ALL' ? '#3498db' : 'transparent', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', marginLeft: '5px' }}
                    >
                        전체
                    </button>
                </div>
            </div>

            {loading ? <p>로딩 중...</p> : (
                <div className="request-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {filteredRequests.map(req => (
                        <div key={req.id} style={{
                            background: '#222',
                            border: req.status === 'REQUESTED' ? '1px solid #e74c3c' : '1px solid #444',
                            borderRadius: '12px', padding: '15px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{
                                    background: req.country === 'KR' ? '#3498db' : '#f1c40f',
                                    color: req.country === 'KR' ? 'white' : 'black',
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold'
                                }}>
                                    {req.country}
                                </span>
                                <span style={{ color: '#aaa', fontSize: '0.8rem' }}>{formatDate(req.createdAt)}</span>
                            </div>

                            <h4 style={{ margin: '0 0 5px 0', color: 'white' }}>{req.itemName}</h4>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffd700', marginBottom: '10px' }}>
                                {req.amount.toLocaleString()} P
                            </div>

                            {/* 저장된 전화번호/GCash 번호 표시 */}
                            {req.contactInfo && (
                                <div style={{
                                    background: '#333', padding: '10px', borderRadius: '8px',
                                    marginBottom: '15px', border: '1px solid #555'
                                }}>
                                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '4px' }}>
                                        수령 정보 (Contact Info)
                                    </div>
                                    <div style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 'bold', userSelect: 'all' }}>
                                        {req.contactInfo}
                                    </div>
                                </div>
                            )}

                            {req.status === 'REQUESTED' ? (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => handleApprove(req)} style={{ flex: 1, background: '#2ecc71', border: 'none', padding: '12px', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                                        승인 (완료)
                                    </button>
                                    <button onClick={() => handleReject(req)} style={{ flex: 1, background: '#e74c3c', border: 'none', padding: '12px', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                                        거절 (환불)
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: req.status === 'COMPLETED' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: req.status === 'COMPLETED' ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
                                    {req.status === 'COMPLETED' ? '처리 완료됨' : '거절/환불됨'}
                                </div>
                            )}
                        </div>
                    ))}
                    {filteredRequests.length === 0 && <p style={{ textAlign: 'center', color: '#666', marginTop: '30px' }}>내역이 없습니다.</p>}
                </div>
            )}
        </div>
    );
}