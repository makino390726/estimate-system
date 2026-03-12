'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useReactToPrint } from 'react-to-print'

type DealRank = 'ordered' | 'promising' | 'difficult' | 'unlikely' | null

type CaseRecord = {
    case_id: string
    case_no: string | number | null
    subject: string | null
    created_date: string | null
    status: string | null
    customer_id: string | null
    staff_id: string | number | null
    total_amount: number | null
    deal_rank: DealRank
    sales_activity_comment: string | null
}

type Staff = {
    id: string
    name: string
}

type CaseView = CaseRecord & {
    staff_name: string
    customer_name: string
}

const rankLabel: Record<Exclude<DealRank, null>, string> = {
    ordered: '○ 受注・成約',
    promising: '△ 商談中（有力）',
    difficult: '▢ 商談中（厳しい）',
    unlikely: '× 失注・ほぼ無理',
}

const rankColor: Record<Exclude<DealRank, null>, string> = {
    ordered: '#dc2626',
    promising: '#0ea5e9',
    difficult: '#f59e0b',
    unlikely: '#374151',
}

const printRankOrder: DealRank[] = ['ordered', 'promising', 'difficult', 'unlikely', null]

const summaryBadgeStyle = (color: string): React.CSSProperties => ({
    color: '#f8fafc',
    backgroundColor: color,
    border: '1px solid rgba(255, 255, 255, 0.35)',
    borderRadius: 999,
    padding: '8px 14px',
    fontWeight: 700,
    lineHeight: 1.5,
    fontSize: 16,
    minHeight: 42,
    display: 'inline-flex',
    alignItems: 'center',
})

export default function DealRankPage() {
    const [loading, setLoading] = useState(true)
    const [savingCaseId, setSavingCaseId] = useState<string | null>(null)
    const [featureColumnsReady, setFeatureColumnsReady] = useState(true)
    const [totalAmountColumnReady, setTotalAmountColumnReady] = useState(true)
    const [cases, setCases] = useState<CaseView[]>([])
    const [staffs, setStaffs] = useState<Staff[]>([])
    const [selectedStaffId, setSelectedStaffId] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const printRef = useRef<HTMLDivElement | null>(null)
    const customerNameCacheRef = useRef<Map<string, string>>(new Map())

    useEffect(() => {
        void fetchStaffs()
    }, [])

    useEffect(() => {
        void fetchData()
    }, [selectedStaffId, startDate, endDate])

    useEffect(() => {
        if (staffs.length === 0) return

        const staffMap = new Map(staffs.map((staff) => [staff.id, staff.name]))
        setCases((prev) => prev.map((c) => {
            const normalizedStaffId = c.staff_id != null ? String(c.staff_id) : null
            return {
                ...c,
                staff_name: normalizedStaffId ? staffMap.get(normalizedStaffId) || '担当者不明' : '担当者未設定',
            }
        }))
    }, [staffs])

    const fetchStaffs = async () => {
        const { data: staffData, error: staffErr } = await supabase
            .from('staffs')
            .select('id, name')
            .order('name', { ascending: true })

        if (staffErr) {
            console.error('担当者取得エラー:', staffErr)
            alert('担当者データの取得に失敗しました')
            return
        }

        const staffList: Staff[] = (staffData || []).map((s: any) => ({
            id: String(s.id),
            name: s.name || '担当者不明',
        }))

        setStaffs(staffList)
    }

    const fetchData = async () => {
        setLoading(true)

        try {
            let caseData: any[] | null = null
            let featureReady = true
            let amountReady = true

            const applyCaseFilters = (query: any) => {
                let nextQuery = query

                if (selectedStaffId) {
                    nextQuery = nextQuery.eq('staff_id', selectedStaffId)
                }

                if (startDate) {
                    nextQuery = nextQuery.gte('created_date', `${startDate}T00:00:00`)
                }

                if (endDate) {
                    const end = new Date(`${endDate}T00:00:00`)
                    end.setDate(end.getDate() + 1)
                    const endExclusive = end.toISOString().split('T')[0]
                    nextQuery = nextQuery.lt('created_date', `${endExclusive}T00:00:00`)
                }

                return nextQuery
            }

            const { data: caseWithFeatureCols, error: caseErr } = await applyCaseFilters(supabase
                .from('cases')
                .select('case_id, case_no, subject, created_date, status, customer_id, staff_id, total_amount, deal_rank, sales_activity_comment')
                .order('created_date', { ascending: false }))

            if (caseErr) {
                const errText = `${caseErr.message || ''} ${caseErr.details || ''}`.toLowerCase()
                const missingDealColumns =
                    (errText.includes('column') && errText.includes('deal_rank')) ||
                    (errText.includes('column') && errText.includes('sales_activity_comment'))
                const missingTotalAmountColumn = errText.includes('column') && errText.includes('total_amount')

                if (missingTotalAmountColumn && !missingDealColumns) {
                    const { data: fallbackWithDeal, error: fallbackWithDealErr } = await applyCaseFilters(supabase
                        .from('cases')
                        .select('case_id, case_no, subject, created_date, status, customer_id, staff_id, deal_rank, sales_activity_comment')
                        .order('created_date', { ascending: false }))

                    if (fallbackWithDealErr) {
                        console.error('案件取得フォールバックエラー:', fallbackWithDealErr)
                        alert('案件データの取得に失敗しました')
                        return
                    }

                    caseData = fallbackWithDeal || []
                    amountReady = false
                } else {
                    if (!missingDealColumns) {
                        console.error('案件取得エラー:', caseErr)
                        alert('案件データの取得に失敗しました')
                        return
                    }

                    // Fallback: show case list even if feature columns are not yet created.
                    const { data: fallbackData, error: fallbackErr } = await applyCaseFilters(supabase
                        .from('cases')
                        .select('case_id, case_no, subject, created_date, status, customer_id, staff_id')
                        .order('created_date', { ascending: false }))

                    if (fallbackErr) {
                        console.error('案件取得フォールバックエラー:', fallbackErr)
                        alert('案件データの取得に失敗しました')
                        return
                    }

                    caseData = fallbackData || []
                    featureReady = false
                    amountReady = false
                }
            } else {
                caseData = caseWithFeatureCols || []
            }

            setFeatureColumnsReady(featureReady)
            setTotalAmountColumnReady(amountReady)

            const customerIds = Array.from(
                new Set((caseData || []).map((c: any) => c.customer_id).filter((value: string | null) => Boolean(value))),
            )

            const customerMap = new Map<string, string>()
            const unknownCustomerIds = customerIds.filter((id) => !customerNameCacheRef.current.has(String(id)))

            if (unknownCustomerIds.length > 0) {
                const { data: customerData, error: customerErr } = await supabase
                    .from('customers')
                    .select('id, name')
                    .in('id', unknownCustomerIds)

                if (customerErr) {
                    console.error('顧客取得エラー:', customerErr)
                } else {
                    for (const customer of customerData || []) {
                        customerNameCacheRef.current.set(String(customer.id), customer.name || '顧客名未設定')
                    }
                }
            }

            for (const id of customerIds) {
                const normalizedId = String(id)
                const cachedName = customerNameCacheRef.current.get(normalizedId)
                if (cachedName) {
                    customerMap.set(normalizedId, cachedName)
                }
            }

            const staffMap = new Map(staffs.map((s) => [s.id, s.name]))

            const mapped: CaseView[] = (caseData || []).map((c: any) => {
                const normalizedStaffId = c.staff_id != null ? String(c.staff_id) : null
                const rank = (c.deal_rank || null) as DealRank

                return {
                    case_id: c.case_id,
                    case_no: c.case_no,
                    subject: c.subject || '',
                    created_date: c.created_date,
                    status: c.status,
                    customer_id: c.customer_id,
                    staff_id: c.staff_id,
                    total_amount: Number(c.total_amount || 0),
                    deal_rank: rank,
                    sales_activity_comment: c.sales_activity_comment || '',
                    staff_name: normalizedStaffId ? staffMap.get(normalizedStaffId) || '担当者不明' : '担当者未設定',
                    customer_name: c.customer_id ? customerMap.get(String(c.customer_id)) || String(c.customer_id) : '顧客未設定',
                }
            })

            setCases(mapped)
        } finally {
            setLoading(false)
        }
    }

    const filteredCases = useMemo(() => {
        return cases
    }, [cases])

    const summary = useMemo(() => {
        const result = {
            ordered: 0,
            promising: 0,
            difficult: 0,
            unlikely: 0,
            unset: 0,
            totalCount: filteredCases.length,
            totalAmount: 0,
            amountOrdered: 0,
            amountPromising: 0,
            amountDifficult: 0,
            amountUnlikely: 0,
            amountUnset: 0,
        }

        for (const c of filteredCases) {
            const amount = Number(c.total_amount || 0)
            result.totalAmount += amount

            if (!c.deal_rank) {
                result.unset += 1
                result.amountUnset += amount
                continue
            }

            result[c.deal_rank] += 1
            if (c.deal_rank === 'ordered') result.amountOrdered += amount
            if (c.deal_rank === 'promising') result.amountPromising += amount
            if (c.deal_rank === 'difficult') result.amountDifficult += amount
            if (c.deal_rank === 'unlikely') result.amountUnlikely += amount
        }

        return result
    }, [filteredCases])

    const selectedStaffName = useMemo(() => {
        if (!selectedStaffId) return '全員'
        return staffs.find((staff) => staff.id === selectedStaffId)?.name || '担当者不明'
    }, [selectedStaffId, staffs])

    const printSections = useMemo(() => {
        return printRankOrder
            .map((rank) => {
                const rows = filteredCases
                    .filter((item) => item.deal_rank === rank)
                    .sort((left, right) => {
                        const leftDate = left.created_date || ''
                        const rightDate = right.created_date || ''
                        if (leftDate !== rightDate) {
                            return leftDate < rightDate ? 1 : -1
                        }

                        const leftNo = String(left.case_no || '')
                        const rightNo = String(right.case_no || '')
                        return leftNo.localeCompare(rightNo, 'ja')
                    })

                const totalAmount = rows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)

                return {
                    rank,
                    label: rank ? rankLabel[rank] : '未設定',
                    rows,
                    count: rows.length,
                    totalAmount,
                }
            })
            .filter((section) => section.count > 0)
    }, [filteredCases])

    const staffAmountSummary = useMemo(() => {
        const summaryMap = new Map<string, {
            staffName: string
            amountOrdered: number
            amountPromising: number
            amountDifficult: number
            amountUnlikely: number
            amountUnset: number
        }>()

        for (const c of filteredCases) {
            const key = c.staff_name || '担当者未設定'
            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    staffName: key,
                    amountOrdered: 0,
                    amountPromising: 0,
                    amountDifficult: 0,
                    amountUnlikely: 0,
                    amountUnset: 0,
                })
            }

            const row = summaryMap.get(key)
            if (!row) continue

            const amount = Number(c.total_amount || 0)
            if (c.deal_rank === 'ordered') row.amountOrdered += amount
            if (c.deal_rank === 'promising') row.amountPromising += amount
            if (c.deal_rank === 'difficult') row.amountDifficult += amount
            if (c.deal_rank === 'unlikely') row.amountUnlikely += amount
            if (!c.deal_rank) row.amountUnset += amount
        }

        const rows = Array.from(summaryMap.values()).sort((a, b) => a.staffName.localeCompare(b.staffName, 'ja'))

        const totals = rows.reduce(
            (acc, row) => ({
                amountOrdered: acc.amountOrdered + row.amountOrdered,
                amountPromising: acc.amountPromising + row.amountPromising,
                amountDifficult: acc.amountDifficult + row.amountDifficult,
                amountUnlikely: acc.amountUnlikely + row.amountUnlikely,
                amountUnset: acc.amountUnset + row.amountUnset,
            }),
            { amountOrdered: 0, amountPromising: 0, amountDifficult: 0, amountUnlikely: 0, amountUnset: 0 },
        )

        return {
            rows,
            totals,
        }
    }, [filteredCases])

    const formatYen = (value: number) => `${Math.round(value).toLocaleString()} 円`
    const formatDate = (value: string | null) => value ? value.split('T')[0] : '-'

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `案件見込み区分一覧_${selectedStaffName}_${startDate || '開始未指定'}_${endDate || '終了未指定'}`,
    })

    const updateDealRank = async (caseId: string, nextRank: string) => {
        if (!featureColumnsReady) {
            alert('見込み区分カラムが未作成です。add_deal_rank_column.sql を実行してください。')
            return
        }

        const rank = nextRank ? (nextRank as Exclude<DealRank, null>) : null
        setSavingCaseId(caseId)

        try {
            const { error } = await supabase
                .from('cases')
                .update({ deal_rank: rank })
                .eq('case_id', caseId)

            if (error) {
                console.error('区分更新エラー:', error)
                alert('区分の更新に失敗しました。カラム未作成の場合は add_deal_rank_column.sql を実行してください。')
                return
            }

            setCases((prev) =>
                prev.map((c) => (c.case_id === caseId ? { ...c, deal_rank: rank } : c)),
            )
        } finally {
            setSavingCaseId(null)
        }
    }

    const canEditComment = (rank: DealRank) => rank === 'promising' || rank === 'difficult'

    const updateLocalComment = (caseId: string, value: string) => {
        setCases((prev) => prev.map((c) => (c.case_id === caseId ? { ...c, sales_activity_comment: value } : c)))
    }

    const saveComment = async (caseId: string, comment: string, dealRank: DealRank) => {
        if (!canEditComment(dealRank)) {
            alert('△（商談中有力）または ▢（商談中厳しい）を選択した場合のみコメントが保存できます。')
            return
        }

        if (!featureColumnsReady) {
            alert('営業活動コメントカラムが未作成です。add_deal_rank_column.sql を実行してください。')
            return
        }

        setSavingCaseId(caseId)

        try {
            const { error } = await supabase
                .from('cases')
                .update({ sales_activity_comment: comment || null })
                .eq('case_id', caseId)

            if (error) {
                console.error('コメント更新エラー:', error)
                alert('営業活動コメントの保存に失敗しました。カラム未作成の場合は add_deal_rank_column.sql を実行してください。')
            } else {
                alert('コメントを保存しました。')
            }
        } finally {
            setSavingCaseId(null)
        }
    }

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <h1 style={{ margin: 0 }}>案件見込み区分（担当者別）</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        className="input-inset"
                        style={{ minWidth: 220, backgroundColor: '#fff', color: '#0f172a', border: '1px solid #94a3b8' }}
                    >
                        <option value="" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>担当者: 全員</option>
                        {staffs.map((staff) => (
                            <option key={staff.id} value={staff.id} style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>
                                {staff.name}
                            </option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, color: '#cbd5e1' }}>期間:</label>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <label style={{ fontSize: 11, color: '#cbd5e1' }}>開始:</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                placeholder="YYYY-MM-DD"
                                style={{ backgroundColor: '#FFEB3B', color: '#000000', border: '2px solid #FBC02D', borderRadius: 4, padding: '6px 10px', fontSize: 13, accentColor: '#000000', width: 140, cursor: 'pointer', fontWeight: 600 }}
                            />
                        </div>
                        <span style={{ color: '#cbd5e1' }}>～</span>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <label style={{ fontSize: 11, color: '#cbd5e1' }}>終了:</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                placeholder="YYYY-MM-DD"
                                style={{ backgroundColor: '#FFEB3B', color: '#000000', border: '2px solid #FBC02D', borderRadius: 4, padding: '6px 10px', fontSize: 13, accentColor: '#000000', width: 140, cursor: 'pointer', fontWeight: 600 }}
                            />
                        </div>
                    </div>
                    <button onClick={() => { setSelectedStaffId(''); setStartDate(''); setEndDate('') }} className="btn-3d btn-reset">
                        フィルタ解除
                    </button>
                    <button
                        type="button"
                        onClick={() => void handlePrint()}
                        className="btn-3d btn-search"
                        disabled={loading || filteredCases.length === 0}
                        style={{
                            opacity: loading || filteredCases.length === 0 ? 0.6 : 1,
                            backgroundColor: '#dc2626',
                            border: '1px solid #991b1b',
                            color: '#ffffff',
                            fontWeight: 800,
                            padding: '8px 16px',
                        }}
                    >
                        印刷
                    </button>
                    <Link href="/cases/list">
                        <button className="btn-3d btn-search">案件一覧へ</button>
                    </Link>
                    <Link href="/selectors">
                        <button className="btn-3d btn-reset" style={{ backgroundColor: '#16a34a', border: '1px solid #15803d', color: '#fff' }}>
                            ← メニュー
                        </button>
                    </Link>
                </div>
            </div>

            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 16, backgroundColor: '#111827', color: '#e5e7eb' }}>
                <strong style={{ color: '#f8fafc', fontSize: 24, letterSpacing: 0.5 }}>件数集計</strong>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                    <span style={summaryBadgeStyle(rankColor.ordered)}>○ {summary.ordered} / {formatYen(summary.amountOrdered)}</span>
                    <span style={summaryBadgeStyle(rankColor.promising)}>△ {summary.promising} / {formatYen(summary.amountPromising)}</span>
                    <span style={summaryBadgeStyle(rankColor.difficult)}>▢ {summary.difficult} / {formatYen(summary.amountDifficult)}</span>
                    <span style={summaryBadgeStyle(rankColor.unlikely)}>× {summary.unlikely} / {formatYen(summary.amountUnlikely)}</span>
                    <span style={summaryBadgeStyle('#94a3b8')}>未設定 {summary.unset} / {formatYen(summary.amountUnset)}</span>
                    <span style={{ ...summaryBadgeStyle('#0f766e'), fontSize: 18, fontWeight: 800 }}>件数合計 {summary.totalCount}</span>
                    <span style={{ ...summaryBadgeStyle('#1d4ed8'), fontSize: 18, fontWeight: 800 }}>金額合計 {formatYen(summary.totalAmount)}</span>
                </div>
            </div>

            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 16, backgroundColor: '#0b1220', color: '#e5e7eb' }}>
                <strong style={{ color: '#f8fafc', fontSize: 22, letterSpacing: 0.4 }}>担当者別集計表（金額）</strong>
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                        <thead>
                            <tr>
                                <th style={summaryThStyle}>担当者名</th>
                                <th style={{ ...summaryThStyle, textAlign: 'right' }}>〇案件金額</th>
                                <th style={{ ...summaryThStyle, textAlign: 'right' }}>△案件金額</th>
                                <th style={{ ...summaryThStyle, textAlign: 'right' }}>▢案件金額</th>
                                <th style={{ ...summaryThStyle, textAlign: 'right' }}>×案件金額</th>
                                <th style={{ ...summaryThStyle, textAlign: 'right' }}>未設定案件計</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staffAmountSummary.rows.map((row) => (
                                <tr key={row.staffName}>
                                    <td style={summaryTdStyle}>{row.staffName}</td>
                                    <td style={{ ...summaryTdStyle, textAlign: 'right' }}>{formatYen(row.amountOrdered)}</td>
                                    <td style={{ ...summaryTdStyle, textAlign: 'right' }}>{formatYen(row.amountPromising)}</td>
                                    <td style={{ ...summaryTdStyle, textAlign: 'right' }}>{formatYen(row.amountDifficult)}</td>
                                    <td style={{ ...summaryTdStyle, textAlign: 'right' }}>{formatYen(row.amountUnlikely)}</td>
                                    <td style={{ ...summaryTdStyle, textAlign: 'right' }}>{formatYen(row.amountUnset)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td style={summaryTotalTdStyle}>集計</td>
                                <td style={{ ...summaryTotalTdStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountOrdered)}</td>
                                <td style={{ ...summaryTotalTdStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountPromising)}</td>
                                <td style={{ ...summaryTotalTdStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountDifficult)}</td>
                                <td style={{ ...summaryTotalTdStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountUnlikely)}</td>
                                <td style={{ ...summaryTotalTdStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountUnset)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {!featureColumnsReady ? (
                <div style={{ border: '1px solid #f59e0b', backgroundColor: '#fffbeb', color: '#92400e', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
                    `deal_rank` / `sales_activity_comment` カラムが未作成のため、現在は閲覧のみ可能です。DBで `add_deal_rank_column.sql` を実行してください。
                </div>
            ) : null}

            {!totalAmountColumnReady ? (
                <div style={{ border: '1px solid #38bdf8', backgroundColor: '#ecfeff', color: '#0c4a6e', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
                    `total_amount` カラムが未作成のため、合計額（事業費）は 0 円表示です。必要に応じてDBに `total_amount` を追加してください。
                </div>
            ) : null}

            {loading ? (
                <p>読み込み中...</p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>案件ID</th>
                            <th style={thStyle}>案件No</th>
                            <th style={thStyle}>作成日</th>
                            <th style={thStyle}>件名</th>
                            <th style={thStyle}>顧客名</th>
                            <th style={thStyle}>担当者</th>
                            <th style={thStyle}>現在ステータス</th>
                            <th style={thStyle}>合計額（事業費）</th>
                            <th style={thStyle}>見込み区分</th>
                            <th style={thStyle}>営業活動コメント</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCases.map((c) => {
                            const rankSelectBackground = c.deal_rank === 'ordered'
                                ? '#fee2e2'
                                : c.deal_rank === 'promising'
                                    ? '#e0f2fe'
                                    : c.deal_rank === 'difficult'
                                        ? '#fef3c7'
                                        : c.deal_rank === 'unlikely'
                                            ? '#e5e7eb'
                                            : '#ffffff'

                            const rankSelectTextColor = c.deal_rank === 'ordered'
                                ? '#991b1b'
                                : c.deal_rank === 'promising'
                                    ? '#0c4a6e'
                                    : c.deal_rank === 'difficult'
                                        ? '#92400e'
                                        : c.deal_rank === 'unlikely'
                                            ? '#111827'
                                            : '#334155'

                            return (
                                <tr key={c.case_id}>
                                    <td style={tdStyle}>{c.case_id}</td>
                                    <td style={tdStyle}>{c.case_no ?? '-'}</td>
                                    <td style={tdStyle}>{formatDate(c.created_date)}</td>
                                    <td style={tdStyle}>{c.subject || '-'}</td>
                                    <td style={tdStyle}>{c.customer_name || '-'}</td>
                                    <td style={tdStyle}>{c.staff_name}</td>
                                    <td style={tdStyle}>{c.status || '-'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatYen(Number(c.total_amount || 0))}</td>
                                    <td style={tdStyle}>
                                        <select
                                            value={c.deal_rank || ''}
                                            disabled={savingCaseId === c.case_id}
                                            onChange={(e) => void updateDealRank(c.case_id, e.target.value)}
                                            style={{
                                                width: '100%',
                                                minWidth: 180,
                                                padding: '6px 8px',
                                                borderRadius: 6,
                                                border: '1px solid #94a3b8',
                                                backgroundColor: rankSelectBackground,
                                                color: rankSelectTextColor,
                                                fontWeight: 700,
                                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45)',
                                            }}
                                        >
                                            <option value="" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>未設定</option>
                                            <option value="ordered" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>{rankLabel.ordered}</option>
                                            <option value="promising" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>{rankLabel.promising}</option>
                                            <option value="difficult" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>{rankLabel.difficult}</option>
                                            <option value="unlikely" style={{ color: '#0f172a', backgroundColor: '#fff', fontWeight: 700 }}>{rankLabel.unlikely}</option>
                                        </select>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <textarea
                                                value={c.sales_activity_comment || ''}
                                                disabled={savingCaseId === c.case_id || !canEditComment(c.deal_rank)}
                                                onChange={(e) => updateLocalComment(c.case_id, e.target.value)}
                                                placeholder={canEditComment(c.deal_rank) ? '今後の営業活動（次アクション）を入力' : '△/□ を選択すると入力できます'}
                                                style={{
                                                    width: '100%',
                                                    minWidth: 260,
                                                    minHeight: 62,
                                                    resize: 'vertical',
                                                    borderRadius: 6,
                                                    border: '1px solid #94a3b8',
                                                    padding: '6px 8px',
                                                    backgroundColor: canEditComment(c.deal_rank) ? '#fff' : '#f1f5f9',
                                                    color: canEditComment(c.deal_rank) ? '#0f172a' : '#64748b',
                                                    caretColor: '#0f172a',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn-3d btn-search"
                                                disabled={savingCaseId === c.case_id}
                                                onClick={() => void saveComment(c.case_id, c.sales_activity_comment || '', c.deal_rank)}
                                                style={{ padding: '6px 10px', minWidth: 56, opacity: savingCaseId === c.case_id ? 0.6 : 1 }}
                                            >
                                                保存
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}

            {!loading && filteredCases.length === 0 ? (
                <p style={{ textAlign: 'center', marginTop: 24, color: '#64748b' }}>対象案件がありません</p>
            ) : null}

            <div style={{ position: 'absolute', left: -99999, top: 0 }}>
                <div ref={printRef} style={{ width: 1120, padding: 24, backgroundColor: '#ffffff', color: '#000000' }}>
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>案件見込み区分一覧</h1>
                        <div style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <span>担当者: {selectedStaffName}</span>
                            <span>期間: {startDate || '指定なし'} ～ {endDate || '指定なし'}</span>
                            <span>出力件数: {filteredCases.length} 件</span>
                            <span>出力日: {new Date().toLocaleDateString('ja-JP')}</span>
                        </div>
                    </div>

                    <div style={{ marginBottom: 20, breakInside: 'avoid' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>担当者別集計表（金額）</h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={printThStyle}>担当者名</th>
                                    <th style={{ ...printThStyle, textAlign: 'right' }}>〇案件金額</th>
                                    <th style={{ ...printThStyle, textAlign: 'right' }}>△案件金額</th>
                                    <th style={{ ...printThStyle, textAlign: 'right' }}>▢案件金額</th>
                                    <th style={{ ...printThStyle, textAlign: 'right' }}>×案件金額</th>
                                    <th style={{ ...printThStyle, textAlign: 'right' }}>未設定案件計</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffAmountSummary.rows.map((row) => (
                                    <tr key={`print-${row.staffName}`}>
                                        <td style={printTdStyle}>{row.staffName}</td>
                                        <td style={{ ...printTdStyle, textAlign: 'right' }}>{formatYen(row.amountOrdered)}</td>
                                        <td style={{ ...printTdStyle, textAlign: 'right' }}>{formatYen(row.amountPromising)}</td>
                                        <td style={{ ...printTdStyle, textAlign: 'right' }}>{formatYen(row.amountDifficult)}</td>
                                        <td style={{ ...printTdStyle, textAlign: 'right' }}>{formatYen(row.amountUnlikely)}</td>
                                        <td style={{ ...printTdStyle, textAlign: 'right' }}>{formatYen(row.amountUnset)}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td style={printSummaryTotalStyle}>集計</td>
                                    <td style={{ ...printSummaryTotalStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountOrdered)}</td>
                                    <td style={{ ...printSummaryTotalStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountPromising)}</td>
                                    <td style={{ ...printSummaryTotalStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountDifficult)}</td>
                                    <td style={{ ...printSummaryTotalStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountUnlikely)}</td>
                                    <td style={{ ...printSummaryTotalStyle, textAlign: 'right' }}>{formatYen(staffAmountSummary.totals.amountUnset)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {printSections.map((section) => (
                        <div key={section.label} style={{ marginBottom: 28, breakInside: 'avoid' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, borderBottom: '2px solid #1e293b', paddingBottom: 6 }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 18 }}>{section.label}</h2>
                                    <div style={{ marginTop: 4, fontSize: 13 }}>
                                        件数計: {section.count} 件 / 事業費計: {formatYen(section.totalAmount)}
                                    </div>
                                </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...printThStyle, width: '9%' }}>案件№</th>
                                        <th style={{ ...printThStyle, width: '11%' }}>作成日</th>
                                        <th style={{ ...printThStyle, width: '23%' }}>案件名</th>
                                        <th style={{ ...printThStyle, width: '16%' }}>顧客名</th>
                                        <th style={{ ...printThStyle, width: '12%' }}>事業費（金額）</th>
                                        <th style={{ ...printThStyle, width: '9%' }}>ステータス</th>
                                        <th style={{ ...printThStyle, width: '10%' }}>見込区分</th>
                                        <th style={{ ...printThStyle, width: '20%' }}>コメント</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.rows.map((item) => (
                                        <tr key={item.case_id}>
                                            <td style={printTdStyle}>{item.case_no ?? '-'}</td>
                                            <td style={printTdStyle}>{formatDate(item.created_date)}</td>
                                            <td style={printTdStyle}>{item.subject || '-'}</td>
                                            <td style={printTdStyle}>{item.customer_name || '-'}</td>
                                            <td style={{ ...printTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatYen(Number(item.total_amount || 0))}</td>
                                            <td style={printTdStyle}>{item.status || '-'}</td>
                                            <td style={printTdStyle}>{item.deal_rank ? rankLabel[item.deal_rank] : '未設定'}</td>
                                            <td style={printTdStyle}>{item.sales_activity_comment || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

const thStyle: React.CSSProperties = {
    border: '1px solid #334155',
    padding: '8px 10px',
    backgroundColor: '#0f172a',
    color: '#cbd5e1',
    textAlign: 'left',
    fontSize: 12,
}

const tdStyle: React.CSSProperties = {
    border: '1px solid #cbd5e1',
    padding: '8px 10px',
    fontSize: 12,
}

const summaryThStyle: React.CSSProperties = {
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    padding: '8px 10px',
    fontSize: 12,
    textAlign: 'left',
}

const summaryTdStyle: React.CSSProperties = {
    border: '1px solid #475569',
    padding: '8px 10px',
    fontSize: 12,
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
}

const summaryTotalTdStyle: React.CSSProperties = {
    ...summaryTdStyle,
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    fontWeight: 800,
}

const printThStyle: React.CSSProperties = {
    border: '1px solid #475569',
    padding: '8px 10px',
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
    textAlign: 'left',
    fontSize: 12,
}

const printTdStyle: React.CSSProperties = {
    border: '1px solid #94a3b8',
    padding: '8px 10px',
    fontSize: 11,
    verticalAlign: 'top',
    wordBreak: 'break-word',
}

const printSummaryTotalStyle: React.CSSProperties = {
    ...printTdStyle,
    backgroundColor: '#dbeafe',
    color: '#1e3a8a',
    fontWeight: 800,
}
