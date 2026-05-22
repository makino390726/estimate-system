'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getBranchName } from '@/lib/branches'
import {
    ACTIVE_REPAIR_STATUSES,
    REPAIR_PRIORITY_CONFIG,
    REPAIR_STATUS_CONFIG,
} from '@/lib/repairConstants'
import { RepairPhoneCallLinks } from '@/components/RepairPhoneCallLink'

const STAFF_STORAGE_KEY = 'repair_mobile_staff_filter'

type ListRow = {
    id: string
    request_no: number
    received_at: string
    status: string
    priority: string
    customer_name: string
    customer_phone: string | null
    symptom: string
    assigned_staff: string | null
    assigned_branch: string | null
    model: string | null
    visit_scheduled_date: string | null
}

function RepairMobileListInner() {
    const searchParams = useSearchParams()
    const staffFromUrl = searchParams.get('staff')?.trim() || ''

    const [tab, setTab] = useState<'active' | 'done'>('active')
    const [staffFilter, setStaffFilter] = useState('')
    const [rows, setRows] = useState<ListRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(STAFF_STORAGE_KEY) : null
        setStaffFilter(staffFromUrl || saved || '')
    }, [staffFromUrl])

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            let q = supabase
                .from('repair_requests')
                .select(
                    'id, request_no, received_at, status, priority, customer_name, customer_phone, symptom, assigned_staff, assigned_branch, model, visit_scheduled_date',
                )
                .order('received_at', { ascending: false })
                .limit(200)

            if (tab === 'active') {
                q = q.in('status', ACTIVE_REPAIR_STATUSES)
            } else {
                q = q.in('status', ['completed', 'billed', 'closed'])
            }

            const { data, error: err } = await q
            if (err) throw err
            setRows((data as ListRow[]) || [])
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '読み込みに失敗しました')
        } finally {
            setLoading(false)
        }
    }, [tab])

    useEffect(() => {
        load()
    }, [load])

    const filtered = useMemo(() => {
        const f = staffFilter.trim()
        if (!f) return rows
        return rows.filter((r) => (r.assigned_staff || '').includes(f))
    }, [rows, staffFilter])

    const onStaffChange = (v: string) => {
        setStaffFilter(v)
        if (typeof window !== 'undefined') {
            if (v.trim()) localStorage.setItem(STAFF_STORAGE_KEY, v.trim())
            else localStorage.removeItem(STAFF_STORAGE_KEY)
        }
    }

    return (
        <>
            <header className="repair-mobile-header">
                <h1>修理対応</h1>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>現場スタッフ向け</p>
            </header>

            <main className="repair-mobile-main">
                <label className="repair-mobile-label" style={{ marginTop: 0 }}>
                    担当者で絞り込み（任意）
                </label>
                <input
                    className="repair-mobile-input"
                    type="search"
                    placeholder="例: 山田"
                    value={staffFilter}
                    onChange={(e) => onStaffChange(e.target.value)}
                    enterKeyHint="search"
                />

                <div className="repair-mobile-tabs" style={{ marginTop: 14 }}>
                    <button
                        type="button"
                        className={`repair-mobile-tab${tab === 'active' ? ' active' : ''}`}
                        onClick={() => setTab('active')}
                    >
                        対応中
                    </button>
                    <button
                        type="button"
                        className={`repair-mobile-tab${tab === 'done' ? ' active' : ''}`}
                        onClick={() => setTab('done')}
                    >
                        完了済
                    </button>
                </div>

                {error && <div className="repair-mobile-msg err">{error}</div>}
                {loading && <p style={{ color: '#94a3b8' }}>読み込み中…</p>}
                {!loading && filtered.length === 0 && (
                    <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 24 }}>案件がありません</p>
                )}

                {filtered.map((r) => {
                    const st = REPAIR_STATUS_CONFIG[r.status] || {
                        label: r.status,
                        color: '#94a3b8',
                        bg: '#334155',
                    }
                    const pr = REPAIR_PRIORITY_CONFIG[r.priority]
                    return (
                        <Link key={r.id} href={`/repair-mobile/${r.id}`} className="repair-mobile-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 15 }}>No.{r.request_no}</span>
                                <span
                                    className="repair-mobile-badge"
                                    style={{ color: st.color, background: st.bg }}
                                >
                                    {st.label}
                                </span>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600 }}>{r.customer_name}</div>
                            <RepairPhoneCallLinks
                                customerPhone={r.customer_phone}
                                stopPropagation
                            />
                            {r.model && (
                                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{r.model}</div>
                            )}
                            <div
                                style={{
                                    fontSize: 13,
                                    color: '#cbd5e1',
                                    marginTop: 6,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {r.symptom}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {r.assigned_staff && (
                                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                                        担当: {r.assigned_staff}
                                    </span>
                                )}
                                {r.assigned_branch && (
                                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                                        {getBranchName(r.assigned_branch)}
                                    </span>
                                )}
                                {pr && pr.label !== '通常' && (
                                    <span style={{ color: pr.color }}>{pr.label}</span>
                                )}
                                {r.visit_scheduled_date && <span>出張: {r.visit_scheduled_date}</span>}
                            </div>
                        </Link>
                    )
                })}

                <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12 }}>
                    <Link href="/repair-requests" style={{ color: '#64748b' }}>
                        管理画面（PC）
                    </Link>
                </p>
            </main>
        </>
    )
}

export default function RepairMobileListPage() {
    return (
        <Suspense fallback={<p style={{ padding: 24, color: '#94a3b8' }}>読み込み中…</p>}>
            <RepairMobileListInner />
        </Suspense>
    )
}
