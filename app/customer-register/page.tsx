'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
    loadWarrantyMapping,
    saveWarrantyMappingToStorage,
    type WarrantyFieldMapping,
    type WarrantySavedMapping,
} from '@/lib/warrantyMappingStorage'

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

const SHEET_TYPE_OPTIONS = [
    { value: 'heating', label: '暖房機' },
    { value: 'co2_device', label: '光合成促進装置' },
    { value: 'food_dryer', label: '食品乾燥機' },
    { value: 'soumen_dryer', label: 'ソーメン乾燥機' },
    { value: 'leaf_dryer', label: '薬草乾燥機' },
    { value: 'sweetpotato_dryer', label: '干し芋乾燥機' },
    { value: 'tobacco_dryer', label: 'たばこ乾燥機' },
    { value: 'cooling_equipment', label: '冷熱機器' },
    { value: 'unknown', label: 'その他' },
]

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

const findSheetTypeLabel = (value: string) => SHEET_TYPE_OPTIONS.find((opt) => opt.value === value)?.label || 'その他'

export default function CustomerRegisterPage() {
    const [rows, setRows] = useState<CustomerRegisterRow[]>([])
    const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
    const [loading, setLoading] = useState(false)
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
    const topScrollRef = useRef<HTMLDivElement | null>(null)
    const topScrollInnerRef = useRef<HTMLDivElement | null>(null)
    const bottomScrollRef = useRef<HTMLDivElement | null>(null)
    const isSyncingScroll = useRef(false)
    const stickyTopOffset = 8
    const topScrollbarHeight = 14
    const stickyHeaderTop = 0
    const stickyThStyle: React.CSSProperties = {
        ...thStyle,
        position: 'sticky',
        top: stickyHeaderTop,
        zIndex: 40,
        background: '#1e293b',
    }

    useEffect(() => {
        fetchRows()
        fetchStaffOptions()
        setSavedMapping(loadWarrantyMapping())
    }, [])

    useEffect(() => {
        const syncTopScrollWidth = () => {
            if (!topScrollInnerRef.current || !bottomScrollRef.current) return
            topScrollInnerRef.current.style.width = `${bottomScrollRef.current.scrollWidth}px`
        }

        syncTopScrollWidth()
        window.addEventListener('resize', syncTopScrollWidth)
        return () => window.removeEventListener('resize', syncTopScrollWidth)
    }, [rows, searchKeyword, filterSheetType, loading])

    const syncHorizontalScroll = (source: 'top' | 'bottom') => {
        if (isSyncingScroll.current) return
        isSyncingScroll.current = true

        if (source === 'top' && topScrollRef.current && bottomScrollRef.current) {
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
        }

        if (source === 'bottom' && topScrollRef.current && bottomScrollRef.current) {
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft
        }

        requestAnimationFrame(() => {
            isSyncingScroll.current = false
        })
    }

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

    const fetchRows = async () => {
        setLoading(true)
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        try {
            const { data, error } = await supabase
                .from('customer_register_rows')
                .select('*')
                .order('shipment_date', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false })
                .limit(5000)
            if (error) throw error
            setRows((data || []) as CustomerRegisterRow[])
        } catch (error: any) {
            setMessage(`一覧取得に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        } finally {
            setLoading(false)
        }
    }

    const filteredRows = useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase()
        return rows.filter((row) => {
            if (filterSheetType && row.sheet_type !== filterSheetType) return false
            if (!keyword) return true
            const values = [
                row.sheet_name,
                row.customer_name || '',
                row.dealer_name || '',
                row.model_full || row.model || row.model_no || '',
                row.serial_no || '',
                row.manufacturing_no || '',
                row.burner_no || '',
                row.phone || '',
                row.mobile || '',
                row.address || '',
            ]
            return values.some((v) => v.toLowerCase().includes(keyword))
        })
    }, [rows, searchKeyword, filterSheetType])

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
                sheet_name: toNullable(form.sheet_name) || findSheetTypeLabel(form.sheet_type),
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
                setMessage('顧客登録情報を更新しました')
            } else {
                const { error } = await supabase.from('customer_register_rows').insert(payload)
                if (error) throw error
                setMessage('顧客登録情報を登録しました')
            }

            resetForm()
            await fetchRows()
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
            await fetchRows()
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
            const sheetLabel = findSheetTypeLabel(sheetType)

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
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>顧客登録情報（顧客リスト）</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>機種ごとの差分列に対応した顧客情報を管理します。</p>
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
                        <h2 style={{ margin: 0, fontSize: 22 }}>{editingId ? '顧客情報を編集' : '顧客情報を登録'}</h2>
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
                                    setField('sheet_name', findSheetTypeLabel(nextType))
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

                <section style={panelStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 10, marginBottom: 12 }}>
                        <input
                            type="text"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="氏名・販売店・型式・番号で検索"
                            style={inputStyle}
                        />
                        <select value={filterSheetType} onChange={(e) => setFilterSheetType(e.target.value)} style={inputStyle}>
                            <option value="">全機種</option>
                            {SHEET_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: 10, color: '#94a3b8', fontSize: 13 }}>
                        表示件数: {filteredRows.length}件
                    </div>

                    <div
                        ref={topScrollRef}
                        onScroll={() => syncHorizontalScroll('top')}
                        style={{
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            height: topScrollbarHeight,
                            marginBottom: 8,
                            position: 'sticky',
                            top: stickyTopOffset,
                            zIndex: 30,
                            background: '#0f172a',
                        }}
                        aria-label="顧客一覧テーブル上部スクロール"
                    >
                        <div ref={topScrollInnerRef} style={{ height: 1 }} />
                    </div>

                    <div
                        ref={bottomScrollRef}
                        onScroll={() => syncHorizontalScroll('bottom')}
                        style={{ overflowX: 'auto', overflowY: 'auto', height: '100%', minHeight: 0, position: 'relative' }}
                    >
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1300 }}>
                            <thead>
                                <tr>
                                    <th style={stickyThStyle}>出荷日</th>
                                    <th style={stickyThStyle}>シート</th>
                                    <th style={stickyThStyle}>表示型式</th>
                                    <th style={stickyThStyle}>お客様氏名</th>
                                    <th style={stickyThStyle}>販売店名</th>
                                    <th style={stickyThStyle}>本体番号</th>
                                    <th style={stickyThStyle}>製造番号</th>
                                    <th style={stickyThStyle}>バーナ番号</th>
                                    <th style={stickyThStyle}>伝票番号</th>
                                    <th style={stickyThStyle}>担当者</th>
                                    <th style={stickyThStyle}>連絡先</th>
                                    <th style={{ ...stickyThStyle, textAlign: 'center', width: 110 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>読み込み中...</td></tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>データがありません</td></tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr key={row.id}>
                                            <td style={tdStyle}>{row.shipment_date || '-'}</td>
                                            <td style={tdStyle}>{row.sheet_name} ({row.sheet_type})</td>
                                            <td style={tdStyle}>{getModelPreview(row)}</td>
                                            <td style={tdStyle}>{row.customer_name || '-'}</td>
                                            <td style={tdStyle}>{row.dealer_name || '-'}</td>
                                            <td style={tdStyle}>{row.serial_no || '-'}</td>
                                            <td style={tdStyle}>{row.manufacturing_no || '-'}</td>
                                            <td style={tdStyle}>{row.burner_no || '-'}</td>
                                            <td style={tdStyle}>{row.slip_no || '-'}</td>
                                            <td style={tdStyle}>{row.staff_name || '-'}</td>
                                            <td style={tdStyle}>{row.phone || '-'} / {row.mobile || '-'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <button onClick={() => handleEdit(row)} className="btn-3d" style={{ padding: '4px 8px', marginRight: 4, fontSize: 12 }}>編集</button>
                                                <button onClick={() => handleDelete(row.id)} className="btn-3d btn-reset" style={{ padding: '4px 8px', fontSize: 12, background: '#dc2626', border: '1px solid #b91c1c' }}>削除</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    )
}
