import React from 'react';

interface AboutModalContentProps {
    t: any;
    onClose: () => void;
    viewMode?: 'full' | 'ranking';
}

export const AboutModalContent: React.FC<AboutModalContentProps> = ({ t, onClose, viewMode = 'full' }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxHeight: '80vh', overflowY: 'auto' }}>
                <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '15px', color: '#3498db' }}>
                    {viewMode === 'ranking' ? t.pma_rank_title : t.pma_guide_title}
                </h3>

                {viewMode === 'full' && (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <h4 style={{ color: '#fff', marginBottom: '8px' }}>{t.pma_network_title}</h4>
                            <p style={{ lineHeight: '1.6', color: '#ccc', fontSize: '0.9rem' }} dangerouslySetInnerHTML={{ __html: t.pma_network_desc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        </div>

                        <div style={{ background: 'rgba(255,211,42,0.1)', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(255,211,42,0.3)' }}>
                            <h4 style={{ marginTop: 0, color: '#ffd32a' }}>{t.pma_ad_title}</h4>
                            <p style={{ margin: '5px 0', fontSize: '0.85rem', color: '#eee' }}>{t.pma_ad_desc}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                    <span>{t.pma_ad_milestone_10}</span>
                                    <strong style={{ color: '#ffd32a' }}>+50 P</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                    <span>{t.pma_ad_milestone_30}</span>
                                    <strong style={{ color: '#ffd32a' }}>+100 P</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                    <span>{t.pma_ad_milestone_50}</span>
                                    <strong style={{ color: '#ffd32a' }}>+200 P</strong>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div style={{ marginBottom: '20px' }}>
                    {viewMode === 'full' && <h4 style={{ color: '#fff', marginBottom: '10px' }}>{t.pma_rank_title}</h4>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderLeft: '4px solid #cd7f32', background: 'rgba(205, 127, 50, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🥉</span> <strong>{t.rank_bronze}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem' }}>{t.rank_desc_bronze}</div>
                                <div style={{ color: '#4cd137', fontWeight: 'bold' }}>{t.rank_bonus_5}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderLeft: '4px solid #c0c0c0', background: 'rgba(192, 192, 192, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🥈</span> <strong>{t.rank_silver}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem' }}>{t.rank_desc_silver}</div>
                                <div style={{ color: '#4cd137', fontWeight: 'bold' }}>{t.rank_bonus_7}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderLeft: '4px solid #ffd700', background: 'rgba(255, 215, 0, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🥇</span> <strong>{t.rank_gold}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem' }}>{t.rank_desc_gold}</div>
                                <div style={{ color: '#4cd137', fontWeight: 'bold' }}>{t.rank_bonus_8}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderLeft: '4px solid #70a1ff', background: 'rgba(112, 161, 255, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>💎</span> <strong>{t.rank_diamond}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem' }}>{t.rank_desc_diamond}</div>
                                <div style={{ color: '#4cd137', fontWeight: 'bold' }}>{t.rank_bonus_10}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <button className="modal-close-btn" onClick={onClose} style={{ width: '100%', padding: '12px', background: '#3498db', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                    {t.notice_close}
                </button>
            </div>
        </div>
    );
};
