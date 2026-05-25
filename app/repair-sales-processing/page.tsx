'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getBranchName } from '@/lib/branches'
import { REPAIR_STATUS_CONFIG } from '@/lib/repairConstants'

type RepairRow = {
    id: string
    request_no: number
    customer_name: string
    assigned_branch: string | null
    assigned_staff: string | null
    visit_fee: number | null
    labor_cost: number | null
    visit_completed_date: string | null
    status: string
    updated_at: string
}

type PartRow = {
    repair_request_id: string
    part_name: string
    part_code: string | null
    quantity: number
}

function formatYen(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(Number(v))) return '—'
    return `${Number(v).toLocaleString('ja-JP')}円`
}

export default function RepairSalesProcessingPage() {
    const [rows, setRows] = useState<RepairRow[]>([])
    const [partsByRepair, setPartsByRepair] = useState<Record<string, PartRow[]>>({})
    const [loading, setLoading] = useState(true)
    const [msg, setMsg] = useState<string | null>(null)
    const [keyword, setKeyword] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setMsg(null)
        try {
            const { data, error } = await supabase
                .from('repair_requests')
                .select(
                    'id, request_no, customer_name, assigned_branch, assigned_staff, visit_fee, labor_cost, visit_completed_date, status, updated_at',
                )
                .eq('status', 'completed')
                .order('visit_completed_date', { ascending: false, nullsFirst: false })
                .order('updated_at', { ascending: false })
                .limit(200)

            if (error) throw error
            const list = (data || []) as RepairRow[]
            setRows(list)

            const ids = list.map((r) => r.id)
            if (ids.length === 0) {
                setPartsByRepair({})
                return
            }

            const { data: parts, error: partsErr } = await supabase
                .from('repair_parts')
                .select('repair_request_id, part_name, part_code, quantity')
                .in('repair_request_id', ids)

            if (partsErr) throw partsErr

            const map: Record<string, PartRow[]> = {}
            for (const p of parts || []) {
                const rid = String(p.repair_request_id)
                if (!map[rid]) map[rid] = []
                map[rid].push(p as PartRow)
            }
            setPartsByRepair(map)
        } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : '読み込みに失敗しました')
            setRows([])
            setPartsByRepair({})
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const filtered = useMemo(() => {
        const q = keyword.trim().toLowerCase()
        if (!q) return rows
        return rows.filter((r) => {
            const parts = partsByRepair[r.id] || []
            const partText = parts.map((p) => `${p.part_name} ${p.part_code || ''}`).join(' ')
            return (
                String(r.request_no).includes(q) ||
                r.customer_name.toLowerCase().includes(q) ||
                (r.assigned_staff || '').toLowerCase().includes(q) ||
                getBranchName(r.assigned_branch).toLowerCase().includes(q) ||
                partText.toLowerCase().includes(q)
            )
        })
    }, [rows, keyword, partsByRepair])

    const pageStyle: React.CSSProperties = {
        minHeight: '100vh',
        padding: 24,
        background: '#0f172a',
        color: '#e2e8f0',
    }
    const panelStyle: React.CSSProperties = {
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 16,
    }
    const inputStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: 360,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #475569',
        background: '#0f172a',
        color: '#f8fafc',
        fontSize: 14,
    }
    const thStyle: React.CSSProperties = {
        textAlign: 'left',
        padding: '10px 12px',
        fontSize: 12,
        color: '#94a3b8',
        borderBottom: '1px solid #334155',
        whiteSpace: 'nowrap',
    }
    const tdStyle: React.CSSProperties = {
        padding: '10px 12px',
        fontSize: 13,
        borderBottom: '1px solid #1e293b',
        verticalAlign: 'top',
    }

    return (
        <div style={pageStyle}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <Link href="/selectors" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
                    ← メインメニュー
                </Link>
                <h1 style={{ margin: '12px 0 8px', fontSize: 26, color: '#38bdf8' }}>
                    修理対応・部品等売上処理
                </h1>
                <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: 14, lineHeight: 1.65, maxWidth: 720 }}>
                    完了報告済みの修理案件について、顧客名・出張料・工賃・交換部品などを一覧し、事務による売上処理のたたき台画面です。
                    詳細の編集は
                    <Link href="/repair-requests" style={{ color: '#38bdf8', marginLeft: 4 }}>
                        修理案件管理
                    </Link>
                    から行えます。
                </p>

                {msg && (
                    <div
                        style={{
                            ...panelStyle,
                            marginBottom: 16,
                            borderColor: '#7f1d1d',
                            color: '#fecaca',
                        }}
                    >
                        {msg}
                    </div>
                )}

                <div style={{ ...panelStyle, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <input
                        type="search"
                        placeholder="受付番号・顧客・担当・営業所・部品名で検索"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        style={inputStyle}
                    />
                    <button
                        type="button"
                        onClick={() => void load()}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #475569',
                            background: '#0f172a',
                            color: '#e2e8f0',
                            cursor: 'pointer',
                            fontSize: 14,
                        }}
                    >
                        再読み込み
                    </button>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                        {loading ? '読み込み中…' : `${filtered.length} 件（完了報告済）`}
                    </span>
                </div>

                <div style={{ ...panelStyle, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>No.</th>
                                <th style={thStyle}>顧客名</th>
                                <th style={thStyle}>管轄</th>
                                <th style={thStyle}>担当者</th>
                                <th style={thStyle}>出張料</th>
                                <th style={thStyle}>工賃</th>
                                <th style={thStyle}>交換部品</th>
                                <th style={thStyle}>完了日</th>
                                <th style={thStyle} />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={9} style={{ ...tdStyle, color: '#64748b' }}>
                                        読み込み中…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ ...tdStyle, color: '#64748b' }}>
                                        対象案件がありません
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((r) => {
                                    const parts = partsByRepair[r.id] || []
                                    const statusLabel =
                                        REPAIR_STATUS_CONFIG[r.status]?.label || r.status
                                    return (
                                        <tr key={r.id}>
                                            <td style={tdStyle}>#{r.request_no}</td>
                                            <td style={tdStyle}>{r.customer_name}</td>
                                            <td style={tdStyle}>{getBranchName(r.assigned_branch)}</td>
                                            <td style={tdStyle}>{r.assigned_staff || '—'}</td>
                                            <td style={tdStyle}>{formatYen(r.visit_fee)}</td>
                                            <td style={tdStyle}>{formatYen(r.labor_cost)}</td>
                                            <td style={{ ...tdStyle, maxWidth: 280 }}>
                                                {parts.length === 0 ? (
                                                    '—'
                                                ) : (
                                                    <ul
                                                        style={{
                                                            margin: 0,
                                                            paddingLeft: 18,
                                                            lineHeight: 1.45,
                                                        }}
                                                    >
                                                        {parts.map((p, i) => (
                                                            <li key={i}>
                                                                {p.part_name}
                                                                {p.part_code ? (
                                                                    <span style={{ color: '#94a3b8' }}>
                                                                        {' '}
                                                                        ({p.part_code})
                                                                    </span>
                                                                ) : null}
                                                                {' '}
                                                                ×{p.quantity}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </td>
                                            <td style={tdStyle}>
                                                {r.visit_completed_date || '—'}
                                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                                    {statusLabel}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <Link
                                                    href={`/repair-requests?id=${encodeURIComponent(r.id)}`}
                                                    style={{ color: '#38bdf8', fontSize: 13 }}
                                                >
                                                    案件を開く
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
