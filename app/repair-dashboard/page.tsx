'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ── Types ──

type RepairRequest = {
    id: string
    request_no: number
    received_at: string
    status: string
    priority: string
    customer_name: string
    customer_region: string | null
    category: string | null
    model: string | null
    serial_no: string | null
    symptom: string
    symptom_category: string | null
    assigned_branch: string | null
    assigned_staff: string | null
    repair_cost: number | null
    repair_duration_minutes: number | null
    visit_completed_date: string | null
    manufacturing_year: string | null
    usage_years: number | null
}

type RepairPart = {
    id: string
    repair_request_id: string
    part_name: string
    quantity: number
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

const BRANCH_NAMES: Record<string, string> = {
    branch_1: '南九州', branch_2: '中九州', branch_3: '西九州',
    branch_4: '東日本', branch_5: '沖縄', branch_6: '東北',
}

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

type RankItem = { label: string; count: number; pct: number }

function RankingChart({ title, items, color }: { title: string; items: RankItem[]; color: string }) {
    const maxCount = Math.max(...items.map(i => i.count), 1)
    return (
        <div style={{ ...panelStyle, padding: 16 }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#f8fafc' }}>{title}</h3>
            {items.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: 13 }}>データなし</p>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {items.map((item, i) => (
                        <div key={item.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                                    <span style={{ color: '#64748b', marginRight: 6 }}>{i + 1}.</span>
                                    {item.label}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, color }}>
                                    {item.count}件 ({item.pct.toFixed(1)}%)
                                </span>
                            </div>
                            <div style={{ background: '#1e293b', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                <div style={{ width: `${(item.count / maxCount) * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function StatCard({ value, label, color, sub }: { value: string | number; label: string; color: string; sub?: string }) {
    return (
        <div style={{ ...panelStyle, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
        </div>
    )
}

export default function RepairDashboardPage() {
    const [repairs, setRepairs] = useState<RepairRequest[]>([])
    const [parts, setParts] = useState<RepairPart[]>([])
    const [loading, setLoading] = useState(false)
    const [year, setYear] = useState(new Date().getFullYear())

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const startDate = `${year}-01-01`
            const endDate = `${year}-12-31T23:59:59`
            const { data: repairData } = await supabase
                .from('repair_requests')
                .select('*')
                .gte('received_at', startDate)
                .lte('received_at', endDate)
                .order('received_at', { ascending: false })
            setRepairs((repairData || []) as RepairRequest[])

            if (repairData && repairData.length > 0) {
                const ids = repairData.map((r: any) => r.id)
                const batchSize = 200
                const allParts: RepairPart[] = []
                for (let i = 0; i < ids.length; i += batchSize) {
                    const batch = ids.slice(i, i + batchSize)
                    const { data: partData } = await supabase.from('repair_parts').select('*').in('repair_request_id', batch)
                    if (partData) allParts.push(...(partData as RepairPart[]))
                }
                setParts(allParts)
            } else {
                setParts([])
            }
        } catch (e: any) {
            console.error('ダッシュボードデータ取得エラー:', e)
        } finally {
            setLoading(false)
        }
    }, [year])

    useEffect(() => { fetchData() }, [fetchData])

    // ── Analytics ──

    const totalRepairs = repairs.length
    const completedRepairs = repairs.filter(r => ['completed', 'billed', 'closed'].includes(r.status))
    const activeRepairs = repairs.filter(r => !['completed', 'billed', 'closed'].includes(r.status))
    const urgentRepairs = repairs.filter(r => r.priority === 'urgent')
    const totalCost = repairs.reduce((s, r) => s + (r.repair_cost || 0), 0)
    const avgDuration = completedRepairs.length > 0
        ? Math.round(completedRepairs.reduce((s, r) => s + (r.repair_duration_minutes || 0), 0) / completedRepairs.filter(r => r.repair_duration_minutes).length) || 0
        : 0

    const buildRanking = (key: (r: RepairRequest) => string | null, limit = 10): RankItem[] => {
        const map: Record<string, number> = {}
        repairs.forEach(r => {
            const val = key(r)
            if (val) map[val] = (map[val] || 0) + 1
        })
        const total = repairs.length || 1
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    }

    const symptomRanking = useMemo(() => buildRanking(r => r.symptom_category), [repairs])
    const modelRanking = useMemo(() => buildRanking(r => r.model), [repairs])
    const regionRanking = useMemo(() => buildRanking(r => r.customer_region), [repairs])
    const branchRanking = useMemo(() => buildRanking(r => r.assigned_branch ? (BRANCH_NAMES[r.assigned_branch] || r.assigned_branch) : null), [repairs])
    const staffRanking = useMemo(() => buildRanking(r => r.assigned_staff), [repairs])
    const categoryRanking = useMemo(() => buildRanking(r => r.category), [repairs])

    const partRanking = useMemo((): RankItem[] => {
        const map: Record<string, number> = {}
        parts.forEach(p => { map[p.part_name] = (map[p.part_name] || 0) + p.quantity })
        const total = Object.values(map).reduce((s, v) => s + v, 0) || 1
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    }, [parts])

    const monthlyData = useMemo(() => {
        const counts = Array(12).fill(0) as number[]
        repairs.forEach(r => {
            const m = new Date(r.received_at).getMonth()
            counts[m]++
        })
        return counts
    }, [repairs])

    const maxMonthly = Math.max(...monthlyData, 1)

    const yearRanking = useMemo((): RankItem[] => {
        const map: Record<string, number> = {}
        repairs.forEach(r => {
            if (r.manufacturing_year) map[r.manufacturing_year] = (map[r.manufacturing_year] || 0) + 1
        })
        const total = repairs.length || 1
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, count]) => ({ label: `${label}年式`, count, pct: (count / total) * 100 }))
    }, [repairs])

    return (
        <div style={pageStyle}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>故障分析ダッシュボード</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
                        修理データを分析し、故障傾向・コスト・改善ポイントを可視化します。
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div>
                        <label style={labelStyle}>年度</label>
                        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 120 }}>
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                <option key={y} value={y}>{y}年</option>
                            ))}
                        </select>
                    </div>
                    <Link href="/repair-requests">
                        <button className="btn-3d" style={{ padding: '10px 16px', background: '#2563eb', border: '1px solid #1d4ed8' }}>
                            修理案件管理
                        </button>
                    </Link>
                    <Link href="/machine-cards">
                        <button className="btn-3d" style={{ padding: '10px 16px', background: '#7c3aed', border: '1px solid #6d28d9' }}>
                            機械カルテ
                        </button>
                    </Link>
                    <Link href="/selectors">
                        <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
                            ← メニューに戻る
                        </button>
                    </Link>
                </div>
            </div>

            {loading && <div style={{ ...panelStyle, textAlign: 'center', padding: 24, marginBottom: 20 }}>データ読み込み中...</div>}

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                <StatCard value={totalRepairs} label="総修理件数" color="#60a5fa" sub={`${year}年`} />
                <StatCard value={activeRepairs.length} label="対応中" color="#fbbf24" />
                <StatCard value={completedRepairs.length} label="完了" color="#4ade80" />
                <StatCard value={urgentRepairs.length} label="緊急案件" color="#ef4444" />
                <StatCard value={`¥${totalCost.toLocaleString()}`} label="総修理費用" color="#a78bfa" />
                <StatCard value={avgDuration ? `${avgDuration}分` : '-'} label="平均修理時間" color="#38bdf8" />
            </div>

            {/* Monthly chart */}
            <div style={{ ...panelStyle, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f8fafc' }}>月別修理件数（{year}年）</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 180 }}>
                    {monthlyData.map((count, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{count || ''}</span>
                            <div style={{
                                width: '100%', maxWidth: 60,
                                height: `${Math.max((count / maxMonthly) * 140, count > 0 ? 8 : 0)}px`,
                                background: [10, 11, 0, 1, 2].includes(i)
                                    ? 'linear-gradient(180deg, #ef4444, #991b1b)'
                                    : 'linear-gradient(180deg, #60a5fa, #1e40af)',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.5s',
                            }} />
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{MONTH_NAMES[i]}</span>
                        </div>
                    ))}
                </div>
                <p style={{ margin: '10px 0 0 0', fontSize: 11, color: '#64748b' }}>
                    赤バー: 冬季（11月〜3月）- 暖房機故障が増加する傾向
                </p>
            </div>

            {/* Rankings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16, marginBottom: 24 }}>
                <RankingChart title="故障分類 TOP10" items={symptomRanking} color="#f87171" />
                <RankingChart title="型式別故障 TOP10" items={modelRanking} color="#fbbf24" />
                <RankingChart title="地域別故障 TOP10" items={regionRanking} color="#60a5fa" />
                <RankingChart title="営業所別 TOP" items={branchRanking} color="#4ade80" />
                <RankingChart title="年式別故障 TOP10" items={yearRanking} color="#a78bfa" />
                <RankingChart title="担当者別修理件数" items={staffRanking} color="#38bdf8" />
                <RankingChart title="分野別故障" items={categoryRanking} color="#fb923c" />
                <RankingChart title="交換部品 TOP10" items={partRanking} color="#e879f9" />
            </div>
        </div>
    )
}
