'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCustomerRegisterDisplayTitle } from '@/lib/customerRegisterDisplay'
import { parseCustomerRegisterWorkbook } from '@/lib/customerRegisterExcelImport'
import { upsertParsedCustomerRegisterRows } from '@/lib/customerRegisterExcelUpsert'
import { SHEET_TYPE_OPTIONS, getSheetTypeLabel, type SheetTypeValue } from '@/lib/customerRegisterSheetTypes'
import { REPAIR_STATUS_CONFIG } from '@/lib/repairConstants'
import { BRANCHES } from '@/lib/branches'
import type { ServiceRepairReportLite } from '@/lib/serviceRepairReportCustomerMatch'

type CustomerRegisterRow = {
    id: string
    sheet_name: string
    sheet_type: string
    source_row_no: number | null
    shipment_date: string | null
    customer_name: string | null
    address: string | null
    phone: string | null
    mobile: string | null
    staff_name: string | null
    slip_no: string | null
    purchase_ymd: string | null
    dealer_name: string | null
    model: string | null
    model_no: string | null
    serial_no: string | null
    manufacturing_no: string | null
    burner_no: string | null
    outlet_type: string | null
    model_full: string | null
    raw_data: Record<string, string>
}

type StaffOption = {
    id: string
    name: string
}

type FormState = {
    sheet_name: string
    sheet_type: string
    source_row_no: string
    shipment_date: string
    customer_name: string
    address: string
    phone: string
    mobile: string
    staff_name: string
    slip_no: string
    purchase_ymd: string
    dealer_name: string
    model: string
    model_no: string
    serial_no: string
    manufacturing_no: string
    burner_no: string
    outlet_type: string
    raw_data_json: string
}

const pageStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 1700,
    margin: '0 auto',
    minHeight: '100vh',
    color: '#e2e8f0',
}

const panelStyle: React.CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.25)',
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#cbd5e1',
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 10,
    padding: '10px 12px',
}

const thStyle: React.CSSProperties = {
    border: '1px solid #334155',
    padding: '8px 10px',
    background: '#1e293b',
    textAlign: 'left',
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: 700,
    whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
    border: '1px solid #334155',
    padding: '8px 10px',
    fontSize: 12,
    color: '#cbd5e1',
    verticalAlign: 'top',
}

const initialForm: FormState = {
    sheet_name: '',
    sheet_type: 'unknown',
    source_row_no: '',
    shipment_date: '',
    customer_name: '',
    address: '',
    phone: '',
    mobile: '',
    staff_name: '',
    slip_no: '',
    purchase_ymd: '',
    dealer_name: '',
    model: '',
    model_no: '',
    serial_no: '',
    manufacturing_no: '',
    burner_no: '',
    outlet_type: '',
    raw_data_json: '{}',
}

const toNullable = (value: string) => {
    const v = value.trim()
    return v ? v : null
}

type RepairChartRow = {
    id: string
    customer_register_id: string | null
    serial_no: string | null
    request_no: number
    received_at: string
    visit_completed_date: string | null
    symptom: string
    treatment_details: string | null
    root_cause: string | null
    status: string
}

type RepairPartRow = {
    repair_request_id: string
    part_name: string
    quantity: number
    part_code: string | null
}

function escapeForIlikeFragment(raw: string): string {
    return raw
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
}

/** PostgREST .or() 用: キーワードを複数列の ilike に展開（氏名未入力行は製造番号・電話等でヒット） */
function buildCustomerRegisterSearchOr(keyword: string): string {
    const safe = keyword.replace(/,/g, ' ').trim()
    if (!safe) return ''
    const frag = escapeForIlikeFragment(safe)
    const pattern = `%${frag}%`
    const cols = [
        'customer_name',
        'serial_no',
        'phone',
        'mobile',
        'address',
        'dealer_name',
        'model',
        'model_no',
        'manufacturing_no',
        'slip_no',
    ]
    return cols.map((c) => `${c}.ilike.${pattern}`).join(',')
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

const REPAIR_STATUS_LABEL: Record<string, string> = Object.fromEntries(
    Object.entries(REPAIR_STATUS_CONFIG).map(([k, v]) => [k, v.label]),
)

const BRANCH_NAME_BY_ID: Record<string, string> = Object.fromEntries(BRANCHES.map((b) => [b.id, b.name]))

const SERVICE_REPORT_COLS =
    'id, branch_id, work_date, customer_name, address, phone, mobile, staff_name, category, model, treatment_details, remarks'

function formatChartDate(iso: string | null | undefined): string {
    if (!iso) return '-'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function summarizeParts(rid: string, partsByRepairId: Record<string, RepairPartRow[]>): string {
    const list = partsByRepairId[rid] || []
    if (list.length === 0) return '-'
    return list
        .map((p) => `${p.part_name}${p.quantity > 1 ? `×${p.quantity}` : ''}${p.part_code ? ` (${p.part_code})` : ''}`)
        .join('、')
}

function summarizeRepairContent(r: RepairChartRow): string {
    const parts = [r.treatment_details, r.root_cause].filter(Boolean) as string[]
    return parts.length ? parts.join(' / ') : '-'
}

const getModelPreview = (row: Pick<CustomerRegisterRow, 'sheet_type' | 'model' | 'model_no' | 'outlet_type' | 'model_full'>) => {
    if (row.model_full) return row.model_full
    if (row.sheet_type === 'heating') {
        const left = row.model || row.model_no || ''
        const right = row.outlet_type || ''
        const joined = `${left}${left && right ? '-' : ''}${right}`.trim()
        return joined || '-'
    }
    return row.model || row.model_no || '-'
}

export default function CustomerRegisterPage() {
    const [chartRows, setChartRows] = useState<CustomerRegisterRow[]>([])
    const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
    const [chartLoading, setChartLoading] = useState(false)
    const [chartNonce, setChartNonce] = useState(0)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<FormState>(initialForm)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [filterSheetType, setFilterSheetType] = useState('')
    const [excelFile, setExcelFile] = useState<File | null>(null)
    const [excelImporting, setExcelImporting] = useState(false)
    const [importSheetType, setImportSheetType] = useState<SheetTypeValue | ''>('')
    const [importSummary, setImportSummary] = useState<string | null>(null)
    const [repairsByRowId, setRepairsByRowId] = useState<Record<string, RepairChartRow[]>>({})
    const [partsByRepairId, setPartsByRepairId] = useState<Record<string, RepairPartRow[]>>({})
    const [serviceReportsByRowId, setServiceReportsByRowId] = useState<Record<string, ServiceRepairReportLite[]>>({})
    const [linkingServiceReports, setLinkingServiceReports] = useState(false)
    const [serviceLinkSummary, setServiceLinkSummary] = useState<string | null>(null)
    const [chartPage, setChartPage] = useState(0)
    const [chartPageSize, setChartPageSize] = useState(50)
    const [chartTotalCount, setChartTotalCount] = useState<number | null>(null)

    useEffect(() => {
        setChartPage(0)
    }, [searchKeyword, filterSheetType, chartPageSize])

    useEffect(() => {
        fetchStaffOptions()
    }, [])

    const runLinkServiceReports = async () => {
        setLinkingServiceReports(true)
        setServiceLinkSummary(null)
        try {
            const res = await fetch('/api/customer-register/link-service-reports', { method: 'POST' })
            const json = await res.json()
            if (!res.ok || !json.ok) {
                const detail = json.hint ? `${json.error}\n${json.hint}` : json.error || '紐づけに失敗しました'
                setMessage(detail)
                return
            }
            setServiceLinkSummary(
                `出張修理管理表: 新規紐づけ ${json.linked} 件 / 未一致 ${json.skippedNoMatch} / 複数候補 ${json.skippedAmbiguous}`,
            )
            setChartNonce((n) => n + 1)
        } catch (e: unknown) {
            setMessage(e instanceof Error ? e.message : '紐づけに失敗しました')
        } finally {
            setLinkingServiceReports(false)
        }
    }

    const initialServiceLinkDone = useRef(false)
    useEffect(() => {
        if (initialServiceLinkDone.current) return
        initialServiceLinkDone.current = true
        void runLinkServiceReports()
    }, [])

    useEffect(() => {
        const kw = searchKeyword.trim()
        if (!kw && !filterSheetType) {
            setChartRows([])
            setChartTotalCount(null)
            setChartLoading(false)
            return
        }
        let cancelled = false
        setChartLoading(true)
        const t = setTimeout(async () => {
            try {
                let countQ = supabase.from('customer_register_rows').select('id', { count: 'exact', head: true })
                let dataQ = supabase.from('customer_register_rows').select('*')
                if (kw) {
                    const orClause = buildCustomerRegisterSearchOr(kw)
                    if (orClause) {
                        countQ = countQ.or(orClause)
                        dataQ = dataQ.or(orClause)
                    }
                }
                if (filterSheetType) {
                    countQ = countQ.eq('sheet_type', filterSheetType)
                    dataQ = dataQ.eq('sheet_type', filterSheetType)
                }
                const from = chartPage * chartPageSize
                const to = from + chartPageSize - 1
                dataQ = dataQ
                    .order('created_at', { ascending: false })
                    .order('shipment_date', { ascending: false, nullsFirst: false })
                    .range(from, to)

                const [{ count, error: cErr }, { data, error: dErr }] = await Promise.all([countQ, dataQ])
                if (cErr) throw cErr
                if (dErr) throw dErr
                if (!cancelled) {
                    setChartTotalCount(typeof count === 'number' ? count : 0)
                    setChartRows((data || []) as CustomerRegisterRow[])
                }
            } catch (e: any) {
                if (!cancelled) {
                    setMessage(`検索に失敗しました: ${e.message || String(e)}`)
                    setChartRows([])
                    setChartTotalCount(null)
                }
            } finally {
                if (!cancelled) setChartLoading(false)
            }
        }, 320)
        return () => {
            cancelled = true
            clearTimeout(t)
        }
    }, [searchKeyword, filterSheetType, chartPage, chartPageSize, chartNonce])

    useEffect(() => {
        if (chartTotalCount === null) return
        const maxPage = Math.max(0, Math.ceil(chartTotalCount / chartPageSize) - 1)
        if (chartPage > maxPage) setChartPage(maxPage)
    }, [chartTotalCount, chartPageSize, chartPage])

    useEffect(() => {
        const rows = chartRows
        if (rows.length === 0) {
            setRepairsByRowId({})
            setPartsByRepairId({})
            setServiceReportsByRowId({})
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const ids = rows.map((r) => r.id)
                const serials = [...new Set(rows.map((r) => r.serial_no?.trim()).filter(Boolean))] as string[]

                const repairMap = new Map<string, RepairChartRow>()
                const cols = 'id, customer_register_id, serial_no, request_no, received_at, visit_completed_date, symptom, treatment_details, root_cause, status'

                for (const idChunk of chunkArray(ids, 80)) {
                    const { data, error } = await supabase
                        .from('repair_requests')
                        .select(cols)
                        .in('customer_register_id', idChunk)
                    if (error) throw error
                    for (const r of data || []) {
                        repairMap.set((r as RepairChartRow).id, r as RepairChartRow)
                    }
                }
                for (const serChunk of chunkArray(serials, 80)) {
                    const { data, error } = await supabase.from('repair_requests').select(cols).in('serial_no', serChunk)
                    if (error) throw error
                    for (const r of data || []) {
                        repairMap.set((r as RepairChartRow).id, r as RepairChartRow)
                    }
                }

                const allRepairs = Array.from(repairMap.values())
                const byRow: Record<string, RepairChartRow[]> = {}
                for (const row of rows) {
                    byRow[row.id] = []
                }
                for (const r of allRepairs) {
                    for (const row of rows) {
                        const idMatch = r.customer_register_id === row.id
                        const s1 = row.serial_no?.trim()
                        const s2 = r.serial_no?.trim()
                        const serialMatch = !!(s1 && s2 && s1 === s2)
                        if (idMatch || serialMatch) {
                            const list = byRow[row.id]
                            if (!list.some((x) => x.id === r.id)) list.push(r)
                        }
                    }
                }
                for (const id of Object.keys(byRow)) {
                    byRow[id].sort(
                        (a, b) =>
                            new Date(b.visit_completed_date || b.received_at).getTime() -
                            new Date(a.visit_completed_date || a.received_at).getTime(),
                    )
                }

                const repairIds = allRepairs.map((r) => r.id)
                const partsMap: Record<string, RepairPartRow[]> = {}
                if (repairIds.length > 0) {
                    for (const idChunk of chunkArray(repairIds, 100)) {
                        const { data: parts, error: pe } = await supabase
                            .from('repair_parts')
                            .select('repair_request_id, part_name, quantity, part_code')
                            .in('repair_request_id', idChunk)
                        if (pe) throw pe
                        for (const p of parts || []) {
                            const pr = p as RepairPartRow
                            const rid = pr.repair_request_id
                            if (!partsMap[rid]) partsMap[rid] = []
                            partsMap[rid].push(pr)
                        }
                    }
                }

                const serviceByRow: Record<string, ServiceRepairReportLite[]> = {}
                for (const row of rows) {
                    serviceByRow[row.id] = []
                }
                for (const idChunk of chunkArray(ids, 80)) {
                    const { data, error } = await supabase
                        .from('service_repair_reports')
                        .select(SERVICE_REPORT_COLS)
                        .in('customer_register_id', idChunk)
                        .order('work_date', { ascending: false })
                    if (error) throw error
                    for (const r of (data || []) as (ServiceRepairReportLite & { customer_register_id?: string })[]) {
                        const cid = r.customer_register_id
                        if (cid && serviceByRow[cid] && !serviceByRow[cid].some((x) => x.id === r.id)) {
                            serviceByRow[cid].push(r)
                        }
                    }
                }

                if (!cancelled) {
                    setRepairsByRowId(byRow)
                    setPartsByRepairId(partsMap)
                    setServiceReportsByRowId(serviceByRow)
                }
            } catch (e: any) {
                if (!cancelled) console.error('顧客カルテ修理取得:', e)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [chartRows])

    const fetchStaffOptions = async () => {
        try {
            const { data, error } = await supabase.from('staffs').select('id, name').order('name')
            if (error) throw error
            setStaffOptions(((data || []) as Array<{ id: string | number | null; name: string | null }>)
                .map((staff) => ({ id: String(staff.id || ''), name: String(staff.name || '').trim() }))
                .filter((staff) => staff.id && staff.name))
        } catch (error: any) {
            console.error('担当者マスタ取得失敗:', error?.message || error)
        }
    }

    const resetForm = () => {
        setEditingId(null)
        setForm(initialForm)
    }

    const setField = (key: keyof FormState, value: string) => {
        setForm((current) => ({ ...current, [key]: value }))
    }

    const handleEdit = (row: CustomerRegisterRow) => {
        setEditingId(row.id)
        setForm({
            sheet_name: row.sheet_name || '',
            sheet_type: row.sheet_type || 'unknown',
            source_row_no: row.source_row_no != null ? String(row.source_row_no) : '',
            shipment_date: row.shipment_date || '',
            customer_name: row.customer_name || '',
            address: row.address || '',
            phone: row.phone || '',
            mobile: row.mobile || '',
            staff_name: row.staff_name || '',
            slip_no: row.slip_no || '',
            purchase_ymd: row.purchase_ymd || '',
            dealer_name: row.dealer_name || '',
            model: row.model || '',
            model_no: row.model_no || '',
            serial_no: row.serial_no || '',
            manufacturing_no: row.manufacturing_no || '',
            burner_no: row.burner_no || '',
            outlet_type: row.outlet_type || '',
            raw_data_json: JSON.stringify(row.raw_data || {}, null, 2),
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const parseRawData = () => {
        const text = form.raw_data_json.trim()
        if (!text) return {}
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
        throw new Error('raw_data は JSONオブジェクト形式で入力してください')
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            setMessage(null)

            const rawData = parseRawData()
            const payload = {
                sheet_name: toNullable(form.sheet_name) || getSheetTypeLabel(form.sheet_type),
                sheet_type: toNullable(form.sheet_type) || 'unknown',
                source_row_no: form.source_row_no ? Number(form.source_row_no) : null,
                shipment_date: toNullable(form.shipment_date),
                customer_name: toNullable(form.customer_name),
                address: toNullable(form.address),
                phone: toNullable(form.phone),
                mobile: toNullable(form.mobile),
                staff_name: toNullable(form.staff_name),
                slip_no: toNullable(form.slip_no),
                purchase_ymd: toNullable(form.purchase_ymd),
                dealer_name: toNullable(form.dealer_name),
                model: toNullable(form.model),
                model_no: toNullable(form.model_no),
                serial_no: toNullable(form.serial_no),
                manufacturing_no: toNullable(form.manufacturing_no),
                burner_no: toNullable(form.burner_no),
                outlet_type: toNullable(form.outlet_type),
                raw_data: rawData,
                updated_at: new Date().toISOString(),
            }

            if (editingId) {
                const { error } = await supabase.from('customer_register_rows').update(payload).eq('id', editingId)
                if (error) throw error
                setMessage('顧客カルテを更新しました')
            } else {
                const { error } = await supabase.from('customer_register_rows').insert(payload)
                if (error) throw error
                setMessage('顧客カルテに登録しました')
            }

            resetForm()
            setChartNonce((n) => n + 1)
        } catch (error: any) {
            setMessage(`保存に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('この行を削除してよろしいですか？')) return
        try {
            const { error } = await supabase.from('customer_register_rows').delete().eq('id', id)
            if (error) throw error
            if (editingId === id) resetForm()
            setMessage('削除しました')
            setChartNonce((n) => n + 1)
        } catch (error: any) {
            setMessage(`削除に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        }
    }

    const applyExcelImportResult = (
        fileName: string,
        parsed: ReturnType<typeof parseCustomerRegisterWorkbook>,
        result: Awaited<ReturnType<typeof upsertParsedCustomerRegisterRows>>,
    ) => {
        const summaryParts = [
            `✓ ${fileName} を取り込みました`,
            `シート: ${parsed.sheet_name}（${getSheetTypeLabel(parsed.sheet_type)}）`,
            `新規 ${result.inserted} 件 / 更新 ${result.updated} 件`,
            result.skipped ? `スキップ ${result.skipped} 件` : null,
            result.error_count ? `DBエラー ${result.error_count} 件` : null,
        ].filter(Boolean)
        const summary = summaryParts.join(' / ')

        const skipDetail =
            result.skipped_details?.length
                ? `スキップ行: ${result.skipped_details.map((s) => `Excel${s.source_row_no}行目`).join('、')}`
                : null

        setImportSummary(summary)
        setMessage([summary, skipDetail, result.errors?.length
            ? `DBエラー詳細: ${result.errors.map((e) => `${e.source_row_no}行目 ${e.reason}`).join(' / ')}`
            : null].filter(Boolean).join('\n'))
        setChartNonce((n) => n + 1)
        if (parsed.sheet_type && parsed.sheet_type !== 'unknown') {
            setFilterSheetType(parsed.sheet_type)
        }
    }

    const handleExcelImport = async () => {
        if (!excelFile) {
            setMessage('Excelファイルを選択してください')
            return
        }

        setExcelImporting(true)
        setMessage(null)
        setImportSummary(null)

        try {
            const buffer = await excelFile.arrayBuffer()
            const parsed = parseCustomerRegisterWorkbook(buffer, excelFile.name, {
                sheetTypeOverride: importSheetType || undefined,
            })

            if (parsed.rows.length === 0) {
                throw new Error('取込対象のデータ行がありません（本体・本体番号・製造番号が空の行はスキップされます）')
            }

            const result = await upsertParsedCustomerRegisterRows(supabase, parsed, {
                sourceFileName: excelFile.name,
            })
            applyExcelImportResult(excelFile.name, parsed, result)
        } catch (error: unknown) {
            setMessage(`Excel取込失敗: ${error instanceof Error ? error.message : '詳細はコンソールを確認してください'}`)
        } finally {
            setExcelImporting(false)
        }
    }

    return (
        <div style={pageStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>顧客カルテ</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
                        顧客名のあいまい検索でカルテを表示します。出張修理管理表はお客様氏名・機種（分野）・型式が一致した行のみ表示します。
                    </p>
                </div>
                <Link href="/selectors">
                    <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
                        ← メニューに戻る
                    </button>
                </Link>
            </div>

            {/* 顧客リスト Excel 取込 */}
            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <label style={{ ...labelStyle, fontSize: 15, color: '#c4b5fd', marginBottom: 8, display: 'block' }}>
                    📊 顧客リスト Excel を取り込む
                </label>
                <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                    暖房機・光合成促進装置・たばこ乾燥機など、機種別の顧客リスト Excel を一括登録します。
                    製造番号（本体番号列）が既存データと一致する場合は更新、なければ新規登録します。
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => { setExcelFile(e.target.files?.[0] || null); setImportSummary(null) }}
                        style={{ maxWidth: 480 }}
                    />
                    <select
                        value={importSheetType}
                        onChange={(e) => setImportSheetType(e.target.value as SheetTypeValue | '')}
                        style={{ ...inputStyle, width: 'auto', minWidth: 180 }}
                        title="自動判定できない場合に機種を指定"
                    >
                        <option value="">機種: 自動判定</option>
                        {SHEET_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => void handleExcelImport()}
                        disabled={!excelFile || excelImporting}
                        className="btn-3d"
                        style={{
                            padding: '10px 20px',
                            background: excelImporting ? '#334155' : '#7c3aed',
                            border: `1px solid ${excelImporting ? '#475569' : '#6d28d9'}`,
                        }}
                    >
                        {excelImporting ? '取込中...' : 'Excelを取り込む'}
                    </button>
                </div>
                {importSummary && (
                    <p style={{ margin: 0, fontSize: 12, color: '#86efac' }}>{importSummary}</p>
                )}
            </div>

            {message && (
                <div style={{ ...panelStyle, marginBottom: 20, borderColor: '#475569', padding: '14px 16px', color: '#bfdbfe' }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 520px) minmax(0, 1fr)', gap: 20, alignItems: 'stretch' }}>
                <section style={{ ...panelStyle, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h2 style={{ margin: 0, fontSize: 22 }}>{editingId ? 'カルテを編集' : 'カルテに登録'}</h2>
                        {editingId && (
                            <button className="btn-3d" onClick={resetForm} style={{ padding: '8px 12px', background: '#475569', border: '1px solid #64748b' }}>
                                新規入力に戻す
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>製品名</label>
                            <select
                                value={form.sheet_type}
                                onChange={(e) => {
                                    const nextType = e.target.value
                                    setField('sheet_type', nextType)
                                    setField('sheet_name', getSheetTypeLabel(nextType))
                                }}
                                style={inputStyle}
                            >
                                {SHEET_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>出荷日</label>
                                <input type="date" value={form.shipment_date} onChange={(e) => setField('shipment_date', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>伝票番号</label>
                                <input value={form.slip_no} onChange={(e) => setField('slip_no', e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>お客様氏名</label>
                            <input value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>住所</label>
                            <input value={form.address} onChange={(e) => setField('address', e.target.value)} style={inputStyle} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>固定電話</label>
                                <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>携帯電話</label>
                                <input value={form.mobile} onChange={(e) => setField('mobile', e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>型式</label>
                                <input value={form.model} onChange={(e) => setField('model', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>吹出口（暖房機）</label>
                                <input value={form.outlet_type} onChange={(e) => setField('outlet_type', e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>型式番号</label>
                                <input value={form.model_no} onChange={(e) => setField('model_no', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>本体番号</label>
                                <input value={form.serial_no} onChange={(e) => setField('serial_no', e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>製造番号</label>
                                <input value={form.manufacturing_no} onChange={(e) => setField('manufacturing_no', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>バーナ番号</label>
                                <input value={form.burner_no} onChange={(e) => setField('burner_no', e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>販売店名</label>
                            <input value={form.dealer_name} onChange={(e) => setField('dealer_name', e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>担当者</label>
                            <select value={form.staff_name} onChange={(e) => setField('staff_name', e.target.value)} style={inputStyle}>
                                <option value="">未選択</option>
                                {form.staff_name && !staffOptions.some((staff) => staff.name === form.staff_name) && (
                                    <option value={form.staff_name}>{form.staff_name}（OCR候補）</option>
                                )}
                                {staffOptions.map((staff) => (
                                    <option key={staff.id} value={staff.name}>{staff.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>購入年月日（文字列）</label>
                            <input value={form.purchase_ymd} onChange={(e) => setField('purchase_ymd', e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>追加情報 raw_data (JSON)</label>
                            <textarea value={form.raw_data_json} onChange={(e) => setField('raw_data_json', e.target.value)} rows={5} style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={handleSave} disabled={saving} className="btn-3d btn-primary" style={{ padding: '10px 18px' }}>
                                {saving ? '保存中...' : editingId ? '更新する' : '登録する'}
                            </button>
                            <button onClick={resetForm} className="btn-3d" style={{ padding: '10px 18px', background: '#475569', border: '1px solid #64748b' }}>
                                クリア
                            </button>
                        </div>
                    </div>
                </section>

                <section style={{ ...panelStyle, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 200px', gap: 10, flex: 1, minWidth: 0 }}>
                            <input
                                type="text"
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                placeholder="氏名・電話・本体番号・型式など（複数列あいまい）"
                                style={inputStyle}
                            />
                            <select value={filterSheetType} onChange={(e) => setFilterSheetType(e.target.value)} style={inputStyle}>
                                <option value="">全機種</option>
                                {SHEET_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            className="btn-3d"
                            disabled={linkingServiceReports}
                            onClick={() => void runLinkServiceReports()}
                            style={{
                                padding: '8px 14px',
                                background: linkingServiceReports ? '#334155' : '#0ea5e9',
                                border: `1px solid ${linkingServiceReports ? '#475569' : '#0284c7'}`,
                                fontSize: 13,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {linkingServiceReports ? '照合中...' : '管理表を照合して紐づけ'}
                        </button>
                        <Link href="/repair-requests">
                            <button type="button" className="btn-3d" style={{ padding: '8px 14px', background: '#2563eb', border: '1px solid #1d4ed8', fontSize: 13, whiteSpace: 'nowrap' }}>
                                修理案件管理
                            </button>
                        </Link>
                    </div>
                    {serviceLinkSummary && (
                        <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#86efac' }}>{serviceLinkSummary}</p>
                    )}
                    <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#94a3b8' }}>
                        キーワードは氏名だけでなく、電話・本体番号・型式・販売店などでもヒットします。出張修理管理表は氏名・機種・型式が一致し1件に特定できた行のみ紐づけて表示します。
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                        <div style={{ color: '#94a3b8', fontSize: 13 }}>
                            {chartLoading ? (
                                '検索中…'
                            ) : chartTotalCount != null ? (
                                <>
                                    全 <strong style={{ color: '#e2e8f0' }}>{chartTotalCount}</strong> 件中{' '}
                                    {chartTotalCount === 0 ? '0' : `${chartPage * chartPageSize + 1}–${Math.min((chartPage + 1) * chartPageSize, chartTotalCount)}`}
                                    件を表示（1ページあたり {chartPageSize} 件）
                                </>
                            ) : (
                                '—'
                            )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                                件数
                                <select
                                    value={chartPageSize}
                                    onChange={(e) => setChartPageSize(Number(e.target.value))}
                                    style={{ ...inputStyle, width: 'auto', minWidth: 80, padding: '6px 10px' }}
                                >
                                    {[25, 50, 100, 200].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                className="btn-3d"
                                disabled={chartPage <= 0 || chartLoading}
                                onClick={() => setChartPage((p) => Math.max(0, p - 1))}
                                style={{ padding: '6px 12px', fontSize: 12, background: '#334155', border: '1px solid #475569' }}
                            >
                                前へ
                            </button>
                            <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                                {chartTotalCount != null && chartPageSize > 0
                                    ? `${chartPage + 1} / ${Math.max(1, Math.ceil(chartTotalCount / chartPageSize))}`
                                    : '—'}
                            </span>
                            <button
                                type="button"
                                className="btn-3d"
                                disabled={
                                    chartLoading
                                    || chartTotalCount == null
                                    || (chartPage + 1) * chartPageSize >= chartTotalCount
                                }
                                onClick={() => setChartPage((p) => p + 1)}
                                style={{ padding: '6px 12px', fontSize: 12, background: '#334155', border: '1px solid #475569' }}
                            >
                                次へ
                            </button>
                        </div>
                    </div>

                    {chartLoading && chartRows.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>
                    ) : chartRows.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', border: '1px dashed #334155', borderRadius: 12 }}>
                            キーワードを入力するか、機種だけ選択して検索してください。
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {chartRows.map((row) => {
                                const repairs = repairsByRowId[row.id] || []
                                const serviceReports = serviceReportsByRowId[row.id] || []
                                return (
                                    <div
                                        key={row.id}
                                        style={{
                                            border: '1px solid #334155',
                                            borderRadius: 14,
                                            overflow: 'hidden',
                                            background: '#0f172a',
                                        }}
                                    >
                                        <div
                                            style={{
                                                padding: '14px 16px',
                                                background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
                                                borderBottom: '1px solid #334155',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                                <div style={{ flex: 1, minWidth: 200 }}>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                                                        {formatCustomerRegisterDisplayTitle(row.customer_name, row.dealer_name)}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px', fontSize: 13, color: '#cbd5e1' }}>
                                                        <div><span style={{ color: '#64748b' }}>住所</span> {row.address?.trim() || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>電話</span> {row.phone?.trim() || '—'} / <span style={{ color: '#64748b' }}>携帯</span> {row.mobile?.trim() || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>出荷日</span> {row.shipment_date || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>販売店</span> {row.dealer_name?.trim() || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>機種</span> {getSheetTypeLabel(row.sheet_type)}</div>
                                                        <div><span style={{ color: '#64748b' }}>表示型式</span> {getModelPreview(row)}</div>
                                                        <div><span style={{ color: '#64748b' }}>本体番号</span> {row.serial_no?.trim() || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>製造番号</span> {row.manufacturing_no?.trim() || '—'}</div>
                                                        <div><span style={{ color: '#64748b' }}>担当</span> {row.staff_name?.trim() || '—'}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                                    <button type="button" onClick={() => handleEdit(row)} className="btn-3d" style={{ padding: '6px 12px', fontSize: 12 }}>編集</button>
                                                    <button type="button" onClick={() => handleDelete(row.id)} className="btn-3d btn-reset" style={{ padding: '6px 12px', fontSize: 12, background: '#dc2626', border: '1px solid #b91c1c' }}>削除</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ padding: 12 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>修理履歴</div>
                                            {repairs.length === 0 ? (
                                                <div style={{ fontSize: 13, color: '#64748b', padding: '8px 0' }}>紐づく修理案件はありません（製造番号・顧客登録IDで自動紐づけ）。</div>
                                            ) : (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={thStyle}>修理日</th>
                                                                <th style={thStyle}>受付</th>
                                                                <th style={thStyle}>症状</th>
                                                                <th style={thStyle}>修理内容</th>
                                                                <th style={thStyle}>交換部品</th>
                                                                <th style={thStyle}>状態</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {repairs.map((r) => (
                                                                <tr key={r.id}>
                                                                    <td style={tdStyle}>{formatChartDate(r.visit_completed_date || r.received_at)}</td>
                                                                    <td style={tdStyle}>#{r.request_no}</td>
                                                                    <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'pre-wrap' }}>{r.symptom || '—'}</td>
                                                                    <td style={{ ...tdStyle, maxWidth: 260, whiteSpace: 'pre-wrap' }}>{summarizeRepairContent(r)}</td>
                                                                    <td style={{ ...tdStyle, maxWidth: 280, whiteSpace: 'pre-wrap', fontSize: 11 }}>{summarizeParts(r.id, partsByRepairId)}</td>
                                                                    <td style={tdStyle}>{REPAIR_STATUS_LABEL[r.status] || r.status}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: '#94a3b8',
                                                    marginBottom: 8,
                                                    marginTop: 16,
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <span>出張修理履歴（管理表）</span>
                                                <Link
                                                    href="/service-repair-reports"
                                                    style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}
                                                >
                                                    出張修理管理表で編集 →
                                                </Link>
                                            </div>
                                            {serviceReports.length === 0 ? (
                                                <div style={{ fontSize: 13, color: '#64748b', padding: '8px 0' }}>
                                                    紐づけ済みの出張修理履歴はありません。上の「管理表を照合して紐づけ」を実行するか、氏名・機種・型式がカルテと一致しているか確認してください。
                                                </div>
                                            ) : (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={thStyle}>作業日</th>
                                                                <th style={thStyle}>営業所</th>
                                                                <th style={thStyle}>担当</th>
                                                                <th style={thStyle}>分野</th>
                                                                <th style={thStyle}>型式</th>
                                                                <th style={thStyle}>処置内容</th>
                                                                <th style={thStyle}>備考</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {serviceReports.map((sr) => (
                                                                <tr key={sr.id}>
                                                                    <td style={tdStyle}>{sr.work_date}</td>
                                                                    <td style={tdStyle}>{BRANCH_NAME_BY_ID[sr.branch_id] || sr.branch_id}</td>
                                                                    <td style={tdStyle}>{sr.staff_name || '—'}</td>
                                                                    <td style={tdStyle}>{sr.category || '—'}</td>
                                                                    <td style={tdStyle}>{sr.model || '—'}</td>
                                                                    <td style={{ ...tdStyle, maxWidth: 280, whiteSpace: 'pre-wrap' }}>
                                                                        {sr.treatment_details || '—'}
                                                                    </td>
                                                                    <td style={{ ...tdStyle, maxWidth: 180, whiteSpace: 'pre-wrap' }}>
                                                                        {sr.remarks || '—'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
