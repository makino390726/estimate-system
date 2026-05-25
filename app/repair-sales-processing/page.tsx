'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
    office_sales_confirmed_at: string | null
    office_sales_confirmed_by: string | null
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

function formatConfirmedAt(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function RepairSalesProcessingInner() {
    const searchParams = useSearchParams()
    const focusId = (searchParams.get('focus') || '').trim()
    const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

    const [rows, setRows] = useState<RepairRow[]>([])
    const [partsByRepair, setPartsByRepair] = useState<Record<string, PartRow[]>>({})
    const [loading, setLoading] = useState(true)
    const [msg, setMsg] = useState<string | null>(null)
    const [keyword, setKeyword] = useState('')
    const [unconfirmedOnly, setUnconfirmedOnly] = useState(false)
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setMsg(null)
        try {
            const { data, error } = await supabase
                .from('repair_requests')
                .select(
                    'id, request_no, customer_name, assigned_branch, assigned_staff, visit_fee, labor_cost, visit_completed_date, status, updated_at, office_sales_confirmed_at, office_sales_confirmed_by',
                )
                .eq('status', 'completed')
                .order('visit_completed_date', { ascending: false, nullsFirst: false })
                .order('updated_at', { ascending: false })
                .limit(200)

            if (error) {
                const hint = /office_sales_confirmed/i.test(error.message)
                    ? '（Supabase で add_repair_office_sales_confirmed.sql を実行してください）'
                    : ''
                throw new Error(`${error.message}${hint}`)
            }
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

    useEffect(() => {
        if (!focusId || loading) return
        const el = rowRefs.current[focusId]
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [focusId, loading, rows])

    const unconfirmedCount = useMemo(
        () => rows.filter((r) => !r.office_sales_confirmed_at).length,
        [rows],
    )

    const filtered = useMemo(() => {
        const q = keyword.trim().toLowerCase()
        return rows.filter((r) => {
            if (unconfirmedOnly && r.office_sales_confirmed_at) return false
            if (!q) return true
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
    }, [rows, keyword, partsByRepair, unconfirmedOnly])

    const handleOfficeConfirm = async (row: RepairRow) => {
        if (row.office_sales_confirmed_at || confirmingId) return
        if (!confirm(`案件 #${row.request_no}（${row.customer_name}）の内容を確認し、売上処理に進みますか？`)) {
            return
        }
        setConfirmingId(row.id)
        setMsg(null)
        try {
            const res = await fetch('/api/repair-sales-processing/office-confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repair_request_id: row.id }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data.error || '確認の保存に失敗しました')
            }
            const confirmedAt = (data.confirmed_at as string) || new Date().toISOString()
            setRows((prev) =>
                prev.map((r) =>
                    r.id === row.id
                        ? {
                              ...r,
                              office_sales_confirmed_at: confirmedAt,
                              office_sales_confirmed_by: r.office_sales_confirmed_by,
                          }
                        : r,
                ),
            )
            setMsg(`案件 #${row.request_no} を確認済みにしました`)
        } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : '確認の保存に失敗しました')
        } finally {
            setConfirmingId(null)
        }
    }

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
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                <Link href="/selectors" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
                    ← メインメニュー
                </Link>
                <h1 style={{ margin: '12px 0 8px', fontSize: 26, color: '#38bdf8' }}>
                    修理対応・部品等売上処理
                </h1>
                <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: 14, lineHeight: 1.65, maxWidth: 820 }}>
                    修理担当者が完了報告を送信すると、事務担当へ LINE WORKS で通知されます。
                    本画面で内容を確認し、
                    <strong style={{ color: '#fca5a5' }}>未確認（赤）</strong>
                    の案件は
                    <strong style={{ color: '#86efac' }}>確認（緑）</strong>
                    ボタンを押してから売上処理を行ってください。
                </p>

                {msg && (
                    <div
                        style={{
                            ...panelStyle,
                            marginBottom: 16,
                            borderColor: msg.includes('失敗') ? '#7f1d1d' : '#14532d',
                            color: msg.includes('失敗') ? '#fecaca' : '#bbf7d0',
                        }}
                    >
                        {msg}
                    </div>
                )}

                <div
                    style={{
                        ...panelStyle,
                        marginBottom: 16,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        alignItems: 'center',
                    }}
                >
                    <input
                        type="search"
                        placeholder="受付番号・顧客・担当・営業所・部品名で検索"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        style={inputStyle}
                    />
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            color: '#cbd5e1',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={unconfirmedOnly}
                            onChange={(e) => setUnconfirmedOnly(e.target.checked)}
                        />
                        未確認のみ
                    </label>
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
                        {loading
                            ? '読み込み中…'
                            : `${filtered.length} 件表示 / 完了 ${rows.length} 件（未確認 ${unconfirmedCount} 件）`}
                    </span>
                </div>

                <div style={{ ...panelStyle, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
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
                                <th style={thStyle}>事務確認</th>
                                <th style={thStyle} />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={10} style={{ ...tdStyle, color: '#64748b' }}>
                                        読み込み中…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ ...tdStyle, color: '#64748b' }}>
                                        対象案件がありません
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((r) => {
                                    const parts = partsByRepair[r.id] || []
                                    const statusLabel =
                                        REPAIR_STATUS_CONFIG[r.status]?.label || r.status
                                    const confirmed = Boolean(r.office_sales_confirmed_at)
                                    const isFocus = focusId === r.id
                                    const isConfirming = confirmingId === r.id
                                    return (
                                        <tr
                                            key={r.id}
                                            ref={(el) => {
                                                rowRefs.current[r.id] = el
                                            }}
                                            style={{
                                                backgroundColor: isFocus
                                                    ? 'rgba(251, 191, 36, 0.12)'
                                                    : undefined,
                                            }}
                                        >
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
                                                {confirmed ? (
                                                    <div>
                                                        <span
                                                            style={{
                                                                display: 'inline-block',
                                                                padding: '6px 14px',
                                                                borderRadius: 8,
                                                                background: '#15803d',
                                                                color: '#fff',
                                                                fontWeight: 700,
                                                                fontSize: 13,
                                                                border: '1px solid #22c55e',
                                                            }}
                                                        >
                                                            確認済
                                                        </span>
                                                        <div
                                                            style={{
                                                                fontSize: 10,
                                                                color: '#86efac',
                                                                marginTop: 4,
                                                            }}
                                                        >
                                                            {formatConfirmedAt(r.office_sales_confirmed_at)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={isConfirming}
                                                        onClick={() => void handleOfficeConfirm(r)}
                                                        style={{
                                                            padding: '6px 14px',
                                                            borderRadius: 8,
                                                            background: isConfirming ? '#7f1d1d' : '#dc2626',
                                                            color: '#fff',
                                                            fontWeight: 700,
                                                            fontSize: 13,
                                                            border: '1px solid #ef4444',
                                                            cursor: isConfirming ? 'wait' : 'pointer',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {isConfirming ? '保存中…' : '確認'}
                                                    </button>
                                                )}
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

export default function RepairSalesProcessingPage() {
    return (
        <Suspense
            fallback={
                <div style={{ minHeight: '100vh', padding: 24, background: '#0f172a', color: '#94a3b8' }}>
                    読み込み中…
                </div>
            }
        >
            <RepairSalesProcessingInner />
        </Suspense>
    )
}
