'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
    loadWarrantyMapping,
    saveWarrantyMappingToStorage,
    type WarrantyFieldMapping,
    type WarrantySavedMapping,
} from '@/lib/warrantyMappingStorage'
import { SHEET_TYPE_OPTIONS, getSheetTypeLabel } from '@/lib/customerRegisterSheetTypes'
import { REPAIR_STATUS_CONFIG } from '@/lib/repairConstants'
import { BRANCHES } from '@/lib/branches'
import type { ServiceRepairReportLite } from '@/lib/serviceRepairReportCustomerMatch'

const WarrantyPdfMapper = dynamic(() => import('@/components/WarrantyPdfMapper'), { ssr: false })

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

const normalizeMatchText = (value: unknown) => String(value || '')
    .replace(/[\s　\-ー－]/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase()

const bigramDiceScore = (leftRaw: string, rightRaw: string) => {
    const left = normalizeMatchText(leftRaw)
    const right = normalizeMatchText(rightRaw)
    if (!left || !right) return 0
    if (left === right) return 1
    if (left.includes(right) || right.includes(left)) return 0.92

    const toBigrams = (text: string) => {
        if (text.length < 2) return [text]
        const grams: string[] = []
        for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2))
        return grams
    }

    const leftBigrams = toBigrams(left)
    const rightBigrams = toBigrams(right)
    const counts = new Map<string, number>()
    for (const gram of leftBigrams) counts.set(gram, (counts.get(gram) || 0) + 1)
    let overlap = 0
    for (const gram of rightBigrams) {
        const current = counts.get(gram) || 0
        if (current > 0) {
            overlap += 1
            counts.set(gram, current - 1)
        }
    }
    return (2 * overlap) / (leftBigrams.length + rightBigrams.length)
}

const findClosestStaffName = (ocrName: string | null | undefined, staffs: StaffOption[]) => {
    const source = String(ocrName || '').trim()
    if (!source) return ''

    let bestName = ''
    let bestScore = 0
    for (const staff of staffs) {
        const score = bigramDiceScore(source, staff.name)
        if (score > bestScore) {
            bestScore = score
            bestName = staff.name
        }
    }

    return bestScore >= 0.45 ? bestName : source
}

const normalizeHeader = (value: unknown) => String(value || '').replace(/[\s　]/g, '').replace(/[()（）]/g, '').toLowerCase()

const inferSheetType = (sheetName: string) => {
    const compact = String(sheetName || '').replace(/\s/g, '')
    if (compact.includes('暖房機')) return 'heating'
    if (compact.includes('光合成促進装置')) return 'co2_device'
    if (compact.includes('食品乾燥機')) return 'food_dryer'
    if (compact.includes('ソーメン乾燥機')) return 'soumen_dryer'
    if (compact.includes('薬草乾燥機')) return 'leaf_dryer'
    if (compact.includes('干し芋乾燥機')) return 'sweetpotato_dryer'
    if (compact.includes('たばこ乾燥機')) return 'tobacco_dryer'
    if (compact.includes('冷熱機器')) return 'cooling_equipment'
    return 'unknown'
}

const normalizeDate = (value: unknown): string | null => {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value)) {
        const utc = Math.round((value - 25569) * 86400 * 1000)
        const date = new Date(utc)
        if (Number.isNaN(date.getTime())) return null
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }
    const text = String(value).trim()
    if (!text) return null
    const slash = text.match(/^(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/)
    if (slash) {
        let year = Number(slash[1])
        const month = Number(slash[2])
        const day = Number(slash[3])
        if (year < 100) year += 2000
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().split('T')[0]
}

const headerCandidates = ['出荷日', 'お客様氏名', '伝票番号', '販売店名']
const normalizedCandidates = headerCandidates.map(normalizeHeader)

const detectHeaderRow = (rows: unknown[][]) => {
    const scanLimit = Math.min(rows.length, 30)
    for (let i = 0; i < scanLimit; i += 1) {
        const normalized = (rows[i] || []).map(normalizeHeader)
        const hitCount = normalizedCandidates.filter((token) => normalized.includes(token)).length
        if (hitCount >= 2) return i
    }
    return -1
}

const chunk = <T,>(items: T[], size: number) => {
    const result: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size))
    }
    return result
}

const pickByNormalizedHeader = (record: Record<string, unknown>, aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeHeader)
    for (const [key, value] of Object.entries(record)) {
        if (normalizedAliases.includes(normalizeHeader(key)) && String(value || '').trim() !== '') {
            return value
        }
    }
    return ''
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
    const [pdfFile, setPdfFile] = useState<File | null>(null)
    const [pdfExtracting, setPdfExtracting] = useState(false)
    const [pdfPreviewImage, setPdfPreviewImage] = useState<string | null>(null)
    const [showWarrantyMapper, setShowWarrantyMapper] = useState(false)
    const [savedMapping, setSavedMapping] = useState<WarrantySavedMapping | null>(null)
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
        setSavedMapping(loadWarrantyMapping())
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

    const handlePdfRead = async () => {
        if (!pdfFile) {
            setMessage('PDFファイルを選択してください')
            return
        }

        setPdfExtracting(true)
        setMessage(null)
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        try {
            const fd = new FormData()
            fd.append('file', pdfFile)
            // 領域マッピングが設定済みの場合は送信（定型書式向け高精度モード）
            if (savedMapping) {
                fd.append('fieldMappings', JSON.stringify(savedMapping.mappings))
            }
            const controller = new AbortController()
            // 領域OCRはフィールドごとに画像処理を行うため時間がかかる
            const timeoutMs = savedMapping ? 180000 : 45000
            timeoutId = setTimeout(() => controller.abort(), timeoutMs)

            const res = await fetch('/api/extract-warranty-pdf', { method: 'POST', body: fd, signal: controller.signal })
            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }
            const json = await res.json()

            if (!json.ok) throw new Error(json.message || 'PDF読み込みに失敗しました')

            const ext = json.extracted as {
                customer_name: string | null
                postal_code: string | null
                address: string | null
                phone: string | null
                mobile: string | null
                product_name: string | null
                model_no_full: string | null
                manufacturing_no: string | null
                slip_no: string | null
                purchase_date: string | null
                dealer_name: string | null
                staff_name: string | null
            }
            const source = typeof json.source === 'string' ? json.source : ''
            const warning = typeof json.warning === 'string' ? json.warning : ''

            if (json.imageDataUrl) {
                setPdfPreviewImage(json.imageDataUrl)
            }

            // 製品名 → sheet_type を推定
            const sheetType = inferSheetType(ext.product_name || '')
            const sheetLabel = getSheetTypeLabel(sheetType)

            // 型式番号を model / outlet_type に分割（暖房機の場合）
            let model = ''
            let outletType = ''
            let modelNo = ''

            if (ext.model_no_full) {
                if (sheetType === 'heating') {
                    const lastDash = ext.model_no_full.lastIndexOf('-')
                    if (lastDash > 0) {
                        model = ext.model_no_full.substring(0, lastDash)
                        outletType = ext.model_no_full.substring(lastDash + 1)
                    } else {
                        model = ext.model_no_full
                    }
                } else {
                    modelNo = ext.model_no_full
                }
            }

            // 住所に郵便番号を付加
            const fullAddress = [
                ext.postal_code ? `〒${ext.postal_code}` : '',
                ext.address || '',
            ].filter(Boolean).join(' ')

            const matchedStaffName = findClosestStaffName(ext.staff_name, staffOptions)

            setForm({
                sheet_name: sheetLabel,
                sheet_type: sheetType,
                source_row_no: '',
                shipment_date: '',
                customer_name: ext.customer_name || '',
                address: fullAddress,
                phone: ext.phone || '',
                mobile: ext.mobile || '',
                staff_name: matchedStaffName,
                slip_no: ext.slip_no || '',
                purchase_ymd: ext.purchase_date || '',
                dealer_name: ext.dealer_name || '',
                model,
                model_no: modelNo,
                serial_no: '',
                manufacturing_no: ext.manufacturing_no || '',
                burner_no: '',
                outlet_type: outletType,
                raw_data_json: '{}',
            })

            if (warning) {
                setMessage(`PDF抽出完了（${source || 'fallback'}）: ${warning}`)
            } else if (source === 'region-ocr' || source === 'region-openai' || source === 'region-gemini' || source === 'gemini') {
                setMessage(
                    source === 'region-openai'
                        ? '✓ マッピング設定を使用してAI Visionで読み取りました。内容を確認してから「登録する」をクリックしてください。'
                        : source === 'region-gemini'
                            ? '✓ マッピング設定を使用してGemini Visionで読み取りました。内容を確認してから「登録する」をクリックしてください。'
                            : source === 'gemini'
                                ? '✓ Gemini Visionで読み取りました。内容を確認してから「登録する」をクリックしてください。'
                                : '✓ マッピング設定を使用して領域OCRで読み取りました。内容を確認してから「登録する」をクリックしてください。'
                )
            } else {
                setMessage('PDFから情報を抽出しました。内容を確認してから「登録する」をクリックしてください。')
            }
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setMessage(
                    savedMapping
                        ? 'PDF読み込みがタイムアウトしました。マッピング領域OCRは時間がかかる場合があります。再実行するか、設定項目を減らしてお試しください。'
                        : 'PDF読み込みがタイムアウトしました。再実行するか、PDFサイズを小さくしてお試しください。'
                )
            } else {
                setMessage(`PDF読み込み失敗: ${error.message || '詳細はコンソールを確認してください'}`)
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
            setPdfExtracting(false)
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

            {/* WarrantyPdfMapper モーダル */}
            {showWarrantyMapper && pdfFile && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                        zIndex: 1000, display: 'flex', flexDirection: 'column',
                        padding: 20, boxSizing: 'border-box',
                    }}
                >
                    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h2 style={{ margin: 0, color: '#f8fafc', fontSize: 18 }}>保証書フィールドマッピング設定</h2>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            このPDFを参考に各フィールドの位置をドラッグで指定してください。次回以降も自動適用されます。
                        </span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <WarrantyPdfMapper
                            file={pdfFile}
                            initialMappings={savedMapping?.mappings}
                            onSave={(mappings: WarrantyFieldMapping[]) => {
                                saveWarrantyMappingToStorage(mappings)
                                const newSaved = { mappings, savedAt: new Date().toISOString() }
                                setSavedMapping(newSaved)
                                setShowWarrantyMapper(false)
                                setMessage('✓ マッピング設定を保存しました。次回から「保証書を読み込む」で自動適用されます。')
                            }}
                            onCancel={() => setShowWarrantyMapper(false)}
                        />
                    </div>
                </div>
            )}

            {/* 保証書PDF読み込みパネル */}
            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ ...labelStyle, fontSize: 15, color: '#c4b5fd', marginBottom: 0 }}>📄 保証書PDFを読み込んで自動入力</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {savedMapping && (
                            <span style={{ fontSize: 11, color: '#86efac', background: '#052e16', border: '1px solid #16a34a', borderRadius: 4, padding: '3px 8px' }}>
                                📍 マッピング設定済み ({savedMapping.mappings.filter(m => m.area).length}件)
                            </span>
                        )}
                        <button
                            onClick={() => {
                                if (!pdfFile) {
                                    setMessage('まずPDFファイルを選択してから「マッピング設定」をクリックしてください。')
                                    return
                                }
                                setShowWarrantyMapper(true)
                            }}
                            className="btn-3d"
                            style={{ padding: '6px 14px', background: '#0f4c75', border: '1px solid #1b6ca8', fontSize: 12 }}
                        >
                            📍 マッピング設定
                        </button>
                        {savedMapping && (
                            <button
                                onClick={() => {
                                    if (confirm('マッピング設定を削除しますか？')) {
                                        localStorage.removeItem('warranty_pdf_field_mapping_v1')
                                        setSavedMapping(null)
                                        setMessage('マッピング設定を削除しました。')
                                    }
                                }}
                                style={{ padding: '6px 10px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                            >
                                設定を削除
                            </button>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => { setPdfFile(e.target.files?.[0] || null); setPdfPreviewImage(null) }}
                        style={{ maxWidth: 480 }}
                    />
                    <button
                        onClick={handlePdfRead}
                        disabled={!pdfFile || pdfExtracting}
                        className="btn-3d"
                        style={{
                            padding: '10px 20px',
                            background: pdfExtracting ? '#334155' : '#7c3aed',
                            border: `1px solid ${pdfExtracting ? '#475569' : '#6d28d9'}`,
                        }}
                    >
                        {pdfExtracting ? 'AI読み込み中...' : '保証書を読み込む'}
                    </button>
                </div>
                <p style={{ margin: '8px 0 4px 0', fontSize: 12, color: '#94a3b8' }}>
                    {savedMapping
                        ? '📍 マッピング設定済み：保証書の各フィールド位置を使って領域OCRで読み取ります。'
                        : '保証書の文字をOCRで読み取り、フォームに自動入力します。「マッピング設定」で定型書式の位置を設定すると精度が向上します。'
                    }
                </p>
                {pdfPreviewImage && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <img
                            src={pdfPreviewImage}
                            alt="保証書プレビュー"
                            style={{ maxWidth: 360, maxHeight: 280, border: '1px solid #334155', borderRadius: 8, objectFit: 'contain', background: '#fff' }}
                        />
                        <span style={{ fontSize: 12, color: '#86efac', alignSelf: 'center' }}>✓ 読み取り完了 — 左のフォームを確認してください</span>
                    </div>
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
                                                        {row.customer_name || '（氏名未設定）'}
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
