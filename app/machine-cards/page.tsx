'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ── Types ──

type MachineCard = {
    customer_register_id: string
    customer_name: string | null
    address: string | null
    phone: string | null
    mobile: string | null
    sales_staff: string | null
    category: string | null
    model: string | null
    model_no: string | null
    model_full: string | null
    serial_no: string | null
    manufacturing_no: string | null
    shipment_date: string | null
    purchase_ymd: string | null
    dealer_name: string | null
    repair_count: number
    last_repair_date: string | null
    total_repair_cost: number | null
    total_parts_count: number | null
    calculated_usage_years: number | null
    update_recommended: boolean
}

type RepairHistory = {
    id: string
    request_no: number
    received_at: string
    status: string
    priority: string
    symptom: string
    symptom_category: string | null
    treatment_details: string | null
    root_cause: string | null
    assigned_staff: string | null
    repair_duration_minutes: number | null
    repair_cost: number | null
    visit_completed_date: string | null
}

type RepairPart = {
    id: string
    repair_request_id: string
    part_name: string
    part_code: string | null
    quantity: number
    unit_price: number | null
}

// ── Styles ──

const pageStyle: React.CSSProperties = {
    padding: 24, maxWidth: 1600, margin: '0 auto', minHeight: '100vh', color: '#e2e8f0',
}
const panelStyle: React.CSSProperties = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 20,
    boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
}
const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, padding: '10px 12px',
}
const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#cbd5e1',
}
const thStyle: React.CSSProperties = {
    border: '1px solid #334155', padding: '8px 10px', background: '#1e293b',
    textAlign: 'left', fontSize: 12, color: '#e2e8f0', fontWeight: 700, whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
    border: '1px solid #334155', padding: '8px 10px', fontSize: 12, color: '#cbd5e1', verticalAlign: 'top',
}

const STATUS_LABELS: Record<string, string> = {
    received: '受付', confirming: '確認中', phone_done: '電話対応済',
    visit_scheduled: '出張予定', parts_waiting: '部品待ち', repairing: '修理中',
    completed: '修理完了', billed: '請求済', closed: 'クローズ',
}

export default function MachineCardsPage() {
    const [cards, setCards] = useState<MachineCard[]>([])
    const [loading, setLoading] = useState(false)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [filterCategory, setFilterCategory] = useState('')
    const [showUpdateOnly, setShowUpdateOnly] = useState(false)

    const [selectedCard, setSelectedCard] = useState<MachineCard | null>(null)
    const [repairHistory, setRepairHistory] = useState<RepairHistory[]>([])
    const [allParts, setAllParts] = useState<RepairPart[]>([])

    const fetchCards = useCallback(async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('machine_cards')
                .select('*')
                .order('customer_name')

            if (filterCategory) {
                query = query.eq('category', filterCategory)
            }
            if (showUpdateOnly) {
                query = query.eq('update_recommended', true)
            }

            const { data, error } = await query
            if (error) throw error
            setCards((data || []) as MachineCard[])
        } catch (e: any) {
            console.error('機械カルテ取得エラー:', e)
        } finally {
            setLoading(false)
        }
    }, [filterCategory, showUpdateOnly])

    useEffect(() => { fetchCards() }, [fetchCards])

    const filteredCards = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase()
        if (!kw) return cards
        return cards.filter(c => {
            const vals = [
                c.customer_name || '', c.model || '', c.model_full || '',
                c.serial_no || '', c.address || '', c.sales_staff || '',
            ]
            return vals.some(v => v.toLowerCase().includes(kw))
        })
    }, [cards, searchKeyword])

    const stats = useMemo(() => {
        const total = filteredCards.length
        const withRepairs = filteredCards.filter(c => c.repair_count > 0).length
        const updateNeeded = filteredCards.filter(c => c.update_recommended).length
        const totalCost = filteredCards.reduce((s, c) => s + (c.total_repair_cost || 0), 0)
        return { total, withRepairs, updateNeeded, totalCost }
    }, [filteredCards])

    const openMachineDetail = async (card: MachineCard) => {
        setSelectedCard(card)

        let query = supabase.from('repair_requests').select('*').order('received_at', { ascending: false })
        if (card.serial_no) {
            query = query.eq('serial_no', card.serial_no)
        } else {
            query = query.eq('customer_register_id', card.customer_register_id)
        }
        const { data: repairs } = await query
        setRepairHistory((repairs || []) as RepairHistory[])

        if (repairs && repairs.length > 0) {
            const ids = repairs.map((r: any) => r.id)
            const { data: parts } = await supabase.from('repair_parts').select('*').in('repair_request_id', ids)
            setAllParts((parts || []) as RepairPart[])
        } else {
            setAllParts([])
        }
    }

    const categories = useMemo(() => {
        const set = new Set<string>()
        cards.forEach(c => { if (c.category) set.add(c.category) })
        return Array.from(set).sort()
    }, [cards])

    return (
        <div style={pageStyle}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>機械カルテ</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
                        機械ごとの購入情報・修理履歴・部品交換・更新推奨を一覧管理します。
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href="/repair-requests">
                        <button className="btn-3d" style={{ padding: '10px 16px', background: '#2563eb', border: '1px solid #1d4ed8' }}>
                            修理案件管理
                        </button>
                    </Link>
                    <Link href="/selectors">
                        <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
                            ← メニューに戻る
                        </button>
                    </Link>
                </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={{ ...panelStyle, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#60a5fa' }}>{stats.total}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>登録機械数</div>
                </div>
                <div style={{ ...panelStyle, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#fbbf24' }}>{stats.withRepairs}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>修理履歴あり</div>
                </div>
                <div style={{ ...panelStyle, padding: '14px 16px', textAlign: 'center', borderColor: stats.updateNeeded > 0 ? '#ef444460' : '#334155' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444' }}>{stats.updateNeeded}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>更新推奨</div>
                </div>
                <div style={{ ...panelStyle, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#4ade80' }}>¥{stats.totalCost.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>総修理費用</div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
                    <div>
                        <label style={labelStyle}>キーワード検索</label>
                        <input type="text" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="顧客名・型式・製造番号" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>分野</label>
                        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={inputStyle}>
                            <option value="">すべて</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={showUpdateOnly} onChange={e => setShowUpdateOnly(e.target.checked)} />
                            更新推奨のみ表示
                        </label>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div style={panelStyle}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 22, color: '#f8fafc' }}>
                    機械一覧（{filteredCards.length}件）
                </h2>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>顧客名</th>
                                <th style={thStyle}>分野</th>
                                <th style={thStyle}>型式</th>
                                <th style={thStyle}>製造番号</th>
                                <th style={thStyle}>出荷日</th>
                                <th style={thStyle}>使用年数</th>
                                <th style={thStyle}>修理回数</th>
                                <th style={thStyle}>最終修理</th>
                                <th style={thStyle}>総費用</th>
                                <th style={thStyle}>部品数</th>
                                <th style={thStyle}>状態</th>
                                <th style={thStyle}>担当営業</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>読み込み中...</td></tr>
                            ) : filteredCards.length === 0 ? (
                                <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>該当データがありません</td></tr>
                            ) : filteredCards.map(card => (
                                <tr key={card.customer_register_id}
                                    onClick={() => openMachineDetail(card)}
                                    style={{ cursor: 'pointer', background: card.update_recommended ? '#4a151510' : undefined }}
                                >
                                    <td style={tdStyle}>{card.customer_name || '-'}</td>
                                    <td style={tdStyle}>{card.category || '-'}</td>
                                    <td style={tdStyle}>{card.model_full || card.model || '-'}</td>
                                    <td style={tdStyle}>{card.serial_no || '-'}</td>
                                    <td style={tdStyle}>{card.shipment_date || '-'}</td>
                                    <td style={tdStyle}>
                                        {card.calculated_usage_years != null ? `${card.calculated_usage_years}年` : '-'}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <span style={{
                                            color: card.repair_count >= 5 ? '#ef4444' : card.repair_count >= 3 ? '#fbbf24' : '#4ade80',
                                            fontWeight: 700,
                                        }}>
                                            {card.repair_count}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>{card.last_repair_date || '-'}</td>
                                    <td style={tdStyle}>
                                        {card.total_repair_cost != null ? `¥${card.total_repair_cost.toLocaleString()}` : '-'}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>{card.total_parts_count || 0}</td>
                                    <td style={tdStyle}>
                                        {card.update_recommended ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                                                fontSize: 11, fontWeight: 700, color: '#ef4444', background: '#4a1515',
                                                border: '1px solid #ef444440',
                                            }}>
                                                更新推奨
                                            </span>
                                        ) : (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                                                fontSize: 11, fontWeight: 700, color: '#4ade80', background: '#1a3a2a',
                                                border: '1px solid #4ade8040',
                                            }}>
                                                正常
                                            </span>
                                        )}
                                    </td>
                                    <td style={tdStyle}>{card.sales_staff || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Machine Detail Modal */}
            {selectedCard && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    onClick={() => setSelectedCard(null)}
                >
                    <div style={{ ...panelStyle, maxWidth: 950, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 28 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 24, color: '#f8fafc' }}>
                                    機械カルテ: {selectedCard.model_full || selectedCard.model || '型式不明'}
                                </h2>
                                <p style={{ margin: '6px 0 0 0', fontSize: 14, color: '#94a3b8' }}>
                                    {selectedCard.customer_name} / {selectedCard.serial_no || '製造番号なし'}
                                </p>
                                {selectedCard.update_recommended && (
                                    <div style={{ marginTop: 8, padding: '6px 14px', background: '#4a1515', borderRadius: 8, border: '1px solid #ef444440', color: '#fca5a5', fontSize: 13, display: 'inline-block' }}>
                                        更新推奨: 修理回数 {selectedCard.repair_count}回
                                        {selectedCard.calculated_usage_years != null && ` / 使用年数 ${selectedCard.calculated_usage_years}年`}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedCard(null)} className="btn-3d" style={{ padding: '8px 14px', background: '#475569', border: '1px solid #64748b' }}>
                                閉じる
                            </button>
                        </div>

                        {/* Machine basic info */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#60a5fa' }}>機械基本情報</h3>
                                <div style={{ fontSize: 13, lineHeight: 2 }}>
                                    <div>分野: <strong>{selectedCard.category || '-'}</strong></div>
                                    <div>型式: <strong>{selectedCard.model_full || selectedCard.model || '-'}</strong></div>
                                    <div>製造番号: <strong>{selectedCard.serial_no || '-'}</strong></div>
                                    <div>出荷日: <strong>{selectedCard.shipment_date || '-'}</strong></div>
                                    <div>購入日: <strong>{selectedCard.purchase_ymd || '-'}</strong></div>
                                    <div>使用年数: <strong>{selectedCard.calculated_usage_years != null ? `${selectedCard.calculated_usage_years}年` : '-'}</strong></div>
                                    <div>販売店: <strong>{selectedCard.dealer_name || '-'}</strong></div>
                                </div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#4ade80' }}>顧客・営業情報</h3>
                                <div style={{ fontSize: 13, lineHeight: 2 }}>
                                    <div>顧客名: <strong>{selectedCard.customer_name || '-'}</strong></div>
                                    <div>住所: <strong>{selectedCard.address || '-'}</strong></div>
                                    <div>TEL: <strong>{selectedCard.phone || '-'}</strong></div>
                                    <div>携帯: <strong>{selectedCard.mobile || '-'}</strong></div>
                                    <div>担当営業: <strong>{selectedCard.sales_staff || '-'}</strong></div>
                                </div>
                            </div>
                        </div>

                        {/* Repair stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, border: '1px solid #334155', textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: selectedCard.repair_count >= 5 ? '#ef4444' : '#60a5fa' }}>{selectedCard.repair_count}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>修理回数</div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, border: '1px solid #334155', textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#fbbf24' }}>{selectedCard.total_parts_count || 0}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>交換部品数</div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, border: '1px solid #334155', textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80' }}>
                                    {selectedCard.total_repair_cost != null ? `¥${selectedCard.total_repair_cost.toLocaleString()}` : '-'}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>総修理費用</div>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 12, border: '1px solid #334155', textAlign: 'center' }}>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8' }}>{selectedCard.last_repair_date || '-'}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>最終修理</div>
                            </div>
                        </div>

                        {/* Repair history */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginBottom: 16 }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#a78bfa' }}>修理履歴（{repairHistory.length}件）</h3>
                            {repairHistory.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: 13 }}>修理履歴がありません</p>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>No.</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>日付</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>ステータス</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>症状</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>処置</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>原因</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>時間</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>費用</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>担当</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {repairHistory.map(rh => (
                                            <tr key={rh.id}>
                                                <td style={tdStyle}>{rh.request_no}</td>
                                                <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11 }}>
                                                    {new Date(rh.received_at).toLocaleDateString('ja-JP')}
                                                </td>
                                                <td style={tdStyle}>{STATUS_LABELS[rh.status] || rh.status}</td>
                                                <td style={tdStyle}>{rh.symptom}</td>
                                                <td style={{ ...tdStyle, maxWidth: 200 }}>{rh.treatment_details || '-'}</td>
                                                <td style={tdStyle}>{rh.root_cause || '-'}</td>
                                                <td style={tdStyle}>{rh.repair_duration_minutes ? `${rh.repair_duration_minutes}分` : '-'}</td>
                                                <td style={tdStyle}>{rh.repair_cost != null ? `¥${rh.repair_cost.toLocaleString()}` : '-'}</td>
                                                <td style={tdStyle}>{rh.assigned_staff || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Parts used across all repairs */}
                        {allParts.length > 0 && (
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fb923c' }}>使用部品一覧</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>部品名</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>コード</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>数量</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>単価</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allParts.map(p => (
                                            <tr key={p.id}>
                                                <td style={tdStyle}>{p.part_name}</td>
                                                <td style={tdStyle}>{p.part_code || '-'}</td>
                                                <td style={tdStyle}>{p.quantity}</td>
                                                <td style={tdStyle}>{p.unit_price != null ? `¥${p.unit_price.toLocaleString()}` : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
