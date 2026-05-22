'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getBranchName } from '@/lib/branches'
import {
    SHEET_TYPE_OPTIONS,
    repairCategoryToSheetType,
} from '@/lib/customerRegisterSheetTypes'
import {
    REPAIR_PRIORITY_CONFIG,
    REPAIR_STATUS_CONFIG,
    getMobileSuggestedStatuses,
    isAwaitingCustomerAck,
} from '@/lib/repairConstants'
import { normalizeRepairMediaUrls } from '@/lib/repairPhotoStorage'
import {
    parseRepairPartQuantity,
    repairPartUnitPriceFromProduct,
    searchRepairProducts,
    type RepairProductSuggestion,
} from '@/lib/repairProductSearch'
import type { CustomerRegisterCandidate } from '@/lib/repairCustomerRegisterSync'
import { RepairPhoneCallLinks } from '@/components/RepairPhoneCallLink'

type CustomerSyncDialogState =
    | { mode: 'new'; preview: Record<string, unknown> }
    | { mode: 'exists'; preview: Record<string, unknown>; existingCustomers: CustomerRegisterCandidate[] }
    | { mode: 'skip'; message: string }

function partListQuantity(p: {
    quantity: number | string | null | undefined
}): number {
    return p.quantity != null && p.quantity !== '' && Number(p.quantity) > 0
        ? Number(p.quantity)
        : 1
}

function parseOptionalInt(v: string): number | null {
    const t = v.trim()
    if (!t) return null
    const n = parseInt(t, 10)
    return Number.isFinite(n) ? n : null
}

function parseOptionalFloat(v: string): number | null {
    const t = v.trim()
    if (!t) return null
    const n = parseFloat(t)
    return Number.isFinite(n) ? n : null
}

type RepairRequest = {
    id: string
    request_no: number
    received_at: string
    received_via: string
    priority: string
    status: string
    customer_name: string
    customer_address: string | null
    customer_phone: string | null
    customer_mobile: string | null
    customer_region: string | null
    category: string | null
    model: string | null
    serial_no: string | null
    manufacturing_no: string | null
    manufacturing_year: string | null
    customer_register_id: string | null
    customer_acknowledged_at: string | null
    symptom: string
    symptom_category: string | null
    error_code: string | null
    photo_urls: string[]
    assigned_branch: string | null
    assigned_staff: string | null
    visit_scheduled_date: string | null
    visit_completed_date: string | null
    treatment_details: string | null
    root_cause: string | null
    repair_duration_minutes: number | null
    repair_cost: number | null
    visit_fee: number | null
    labor_cost: number | null
    notes: string | null
}

type RepairPart = {
    id: string
    part_name: string
    part_code: string | null
    quantity: number
}

export default function RepairMobileDetailPage() {
    const params = useParams()
    const router = useRouter()
    const id = typeof params.id === 'string' ? params.id : ''

    const [request, setRequest] = useState<RepairRequest | null>(null)
    const [parts, setParts] = useState<RepairPart[]>([])
    const [photos, setPhotos] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [confirmingStaff, setConfirmingStaff] = useState(false)
    const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    const [statusBaseline, setStatusBaseline] = useState('')
    const [selectedStatus, setSelectedStatus] = useState('')

    const [treatment, setTreatment] = useState('')
    const [rootCause, setRootCause] = useState('')
    const [durationMin, setDurationMin] = useState('')
    const [visitFee, setVisitFee] = useState('')
    const [laborCost, setLaborCost] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [customerAddress, setCustomerAddress] = useState('')
    const [customerRegion, setCustomerRegion] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [customerMobile, setCustomerMobile] = useState('')
    const [category, setCategory] = useState('unknown')
    const [model, setModel] = useState('')
    const [serialNo, setSerialNo] = useState('')
    const [mfgNo, setMfgNo] = useState('')
    const [mfgYear, setMfgYear] = useState('')

    const [newPart, setNewPart] = useState({
        part_name: '',
        part_code: '',
        quantity: '1',
        unit_price: '',
    })
    const [partSuggestions, setPartSuggestions] = useState<RepairProductSuggestion[]>([])
    const [showPartSuggestions, setShowPartSuggestions] = useState(false)
    const [addingPart, setAddingPart] = useState(false)
    const [customerRegisterId, setCustomerRegisterId] = useState<string | null>(null)
    const [syncDialog, setSyncDialog] = useState<CustomerSyncDialogState | null>(null)
    const [syncing, setSyncing] = useState(false)

    const load = useCallback(async () => {
        if (!id) return
        setLoading(true)
        setMessage(null)
        setParts([])
        try {
            const { data: req, error: reqErr } = await supabase
                .from('repair_requests')
                .select('*')
                .eq('id', id)
                .single()
            if (reqErr || !req) throw reqErr || new Error('案件が見つかりません')

            const r = req as RepairRequest
            setRequest(r)
            setStatusBaseline(r.status)
            setSelectedStatus(r.status)
            setTreatment(r.treatment_details || '')
            setRootCause(r.root_cause || '')
            setDurationMin(r.repair_duration_minutes != null ? String(r.repair_duration_minutes) : '')
            if (r.visit_fee != null) {
                setVisitFee(String(r.visit_fee))
            } else {
                setVisitFee('')
            }
            if (r.labor_cost != null) {
                setLaborCost(String(r.labor_cost))
            } else if (
                r.repair_cost != null &&
                r.visit_fee == null &&
                r.labor_cost == null
            ) {
                setLaborCost(String(r.repair_cost))
            } else {
                setLaborCost('')
            }
            setCustomerName(r.customer_name || '')
            setCustomerAddress(r.customer_address || '')
            setCustomerRegion(r.customer_region || '')
            setCustomerPhone(r.customer_phone || '')
            setCustomerMobile(r.customer_mobile || '')
            setCategory(repairCategoryToSheetType(r.category))
            setModel(r.model || '')
            setSerialNo(r.serial_no || '')
            setMfgNo(r.manufacturing_no || '')
            setMfgYear(r.manufacturing_year || '')
            setCustomerRegisterId(r.customer_register_id || null)
            setPhotos(normalizeRepairMediaUrls(r.photo_urls || []))

            const { data: partRows, error: partsErr } = await supabase
                .from('repair_parts')
                .select('id, part_name, part_code, quantity')
                .eq('repair_request_id', id)
                .order('created_at')
            if (partsErr) throw partsErr
            setParts(
                (partRows || []).map((row) => ({
                    id: String(row.id),
                    part_name: String(row.part_name || ''),
                    part_code: row.part_code != null ? String(row.part_code) : null,
                    quantity:
                        row.quantity != null && Number(row.quantity) > 0 ? Number(row.quantity) : 1,
                })),
            )
        } catch (e: unknown) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : '読み込み失敗' })
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        load()
    }, [load])

    const handleStaffConfirm = async () => {
        if (!request) return
        setConfirmingStaff(true)
        setMessage(null)
        try {
            const res = await fetch('/api/repair-mobile/staff-confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repair_request_id: request.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '担当者確認に失敗しました')

            if (json.status_updated) {
                setMessage({ type: 'ok', text: '担当者確認を記録しました（ステータスを更新しました）' })
            } else if (json.already_confirmed) {
                setMessage({ type: 'ok', text: '確認済みとして記録しました' })
            } else {
                setMessage({ type: 'ok', text: '担当者確認を記録しました' })
            }
            await load()
        } catch (e: unknown) {
            setMessage({
                type: 'err',
                text: e instanceof Error ? e.message : '担当者確認に失敗しました',
            })
        } finally {
            setConfirmingStaff(false)
        }
    }

    const save = async (opts?: { markCompleted?: boolean }) => {
        if (!request) return
        if (!customerName.trim()) {
            setMessage({ type: 'err', text: '顧客名を入力してください' })
            return
        }
        setSaving(true)
        setMessage(null)
        try {
            const visitFeeNum = parseOptionalFloat(visitFee)
            const laborCostNum = parseOptionalFloat(laborCost)
            const res = await fetch('/api/repair-mobile/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repair_request_id: request.id,
                    status: selectedStatus,
                    status_baseline: statusBaseline,
                    customer_name: customerName,
                    customer_address: customerAddress,
                    customer_phone: customerPhone,
                    customer_mobile: customerMobile,
                    customer_region: customerRegion,
                    category,
                    model,
                    serial_no: serialNo,
                    manufacturing_no: mfgNo,
                    manufacturing_year: mfgYear,
                    treatment_details: treatment,
                    root_cause: rootCause,
                    repair_duration_minutes: parseOptionalInt(durationMin),
                    ...(visitFeeNum != null ? { visit_fee: visitFeeNum } : {}),
                    ...(laborCostNum != null ? { labor_cost: laborCostNum } : {}),
                    mark_completed: opts?.markCompleted === true,
                }),
            })
            const json = await res.json()
            if (!res.ok) {
                const hint =
                    json.code === 'missing_service_role'
                        ? '（Vercelに SUPABASE_SERVICE_ROLE_KEY を設定してください）'
                        : ''
                throw new Error(`${json.error || '保存に失敗しました'}${hint}`)
            }

            if (opts?.markCompleted && json.status_applied === false) {
                throw new Error(
                    `ステータスが「完了報告済」になりませんでした（現在: ${json.status ?? '不明'}）`,
                )
            }

            const lineNotify = json.line_customer_notify as
                | { ok?: boolean; skipped?: string; error?: string }
                | null
                | undefined
            const fieldWarnings = json.field_warnings as string[] | undefined

            let okText = opts?.markCompleted
                ? '完了報告を送信しました（顧客の承諾後に案件が完了します）'
                : '保存しました'
            if (opts?.markCompleted) {
                if (lineNotify?.ok) {
                    okText += '（顧客へLINEで届けました）'
                } else if (lineNotify?.skipped) {
                    okText += `（顧客LINE未送信: ${lineNotify.skipped}）`
                } else if (lineNotify?.error) {
                    setMessage({
                        type: 'err',
                        text: `${okText}。顧客へのLINE通知に失敗: ${lineNotify.error}`,
                    })
                    await load()
                    return
                } else if (!lineNotify) {
                    okText += '（顧客LINE通知なし）'
                }
                if (fieldWarnings?.length) {
                    okText += ` ※${fieldWarnings.join(' ')}`
                }
            }

            setMessage({ type: 'ok', text: okText })
            await load()
            if (opts?.markCompleted) {
                setTimeout(() => router.push('/repair-mobile'), 800)
            }
        } catch (e: unknown) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : '保存失敗' })
        } finally {
            setSaving(false)
        }
    }

    const buildCustomerSyncBody = () => ({
        repair_request_id: request?.id,
        customer_name: customerName,
        customer_address: customerAddress,
        customer_phone: customerPhone,
        customer_mobile: customerMobile,
        category,
        model,
        serial_no: serialNo,
        manufacturing_no: mfgNo,
        assigned_staff: request?.assigned_staff ?? null,
        received_via: request?.received_via ?? null,
        notes: request?.notes ?? null,
    })

    const handlePrepareCustomerRegister = async () => {
        if (!request) return
        if (!customerName.trim()) {
            setMessage({ type: 'err', text: '先に顧客名を入力してください' })
            return
        }
        setSyncing(true)
        setMessage(null)
        try {
            const res = await fetch('/api/repair-mobile/customer-register-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'prepare', ...buildCustomerSyncBody() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '確認に失敗しました')
            if (json.mode === 'skip') {
                setSyncDialog({ mode: 'skip', message: json.message || '同期できる情報がありません' })
                return
            }
            if (json.mode === 'exists') {
                setSyncDialog({
                    mode: 'exists',
                    preview: json.preview || {},
                    existingCustomers: json.existingCustomers || [],
                })
                return
            }
            setSyncDialog({ mode: 'new', preview: json.preview || {} })
        } catch (e: unknown) {
            setMessage({
                type: 'err',
                text: e instanceof Error ? e.message : '顧客登録の確認に失敗しました',
            })
        } finally {
            setSyncing(false)
        }
    }

    const handleApplyCustomerRegister = async (
        syncAction: 'insert' | 'update',
        targetCustomerRegisterId?: string,
    ) => {
        if (!request) return
        setSyncing(true)
        try {
            const res = await fetch('/api/repair-mobile/customer-register-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'apply',
                    sync_action: syncAction,
                    target_customer_register_id: targetCustomerRegisterId,
                    ...buildCustomerSyncBody(),
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '同期に失敗しました')
            setSyncDialog(null)
            if (json.customer_register_id) {
                setCustomerRegisterId(json.customer_register_id)
                setRequest((prev) =>
                    prev ? { ...prev, customer_register_id: json.customer_register_id } : null,
                )
            }
            setMessage({ type: 'ok', text: json.message || '顧客登録（カルテ）に反映しました' })
        } catch (e: unknown) {
            setMessage({
                type: 'err',
                text: e instanceof Error ? e.message : '顧客登録の同期に失敗しました',
            })
        } finally {
            setSyncing(false)
        }
    }

    const deletePart = async (partId: string) => {
        if (!confirm('この部品を削除しますか？')) return
        const { error } = await supabase.from('repair_parts').delete().eq('id', partId)
        if (error) {
            setMessage({ type: 'err', text: error.message })
            return
        }
        setParts((p) => p.filter((x) => x.id !== partId))
    }

    const handlePartNameChange = async (value: string) => {
        setNewPart((p) => ({ ...p, part_name: value, part_code: '' }))
        if (!value.trim()) {
            setPartSuggestions([])
            setShowPartSuggestions(false)
            return
        }
        try {
            const list = await searchRepairProducts(supabase, value)
            setPartSuggestions(list)
            setShowPartSuggestions(list.length > 0)
        } catch (e) {
            console.error('商品マスタ検索:', e)
            setPartSuggestions([])
            setShowPartSuggestions(false)
        }
    }

    const handleSelectProduct = (product: RepairProductSuggestion) => {
        const price = repairPartUnitPriceFromProduct(product)
        setNewPart({
            part_name: product.name,
            part_code: product.id,
            quantity: newPart.quantity || '1',
            unit_price: price != null ? String(price) : '',
        })
        setShowPartSuggestions(false)
        setPartSuggestions([])
    }

    const handleAddPart = async () => {
        if (!request) return
        if (!newPart.part_name.trim()) {
            setMessage({ type: 'err', text: '商品名を入力または選択してください' })
            return
        }
        setAddingPart(true)
        setMessage(null)
        try {
            const { error } = await supabase.from('repair_parts').insert({
                repair_request_id: request.id,
                part_name: newPart.part_name.trim(),
                part_code: newPart.part_code.trim() || null,
                quantity: parseRepairPartQuantity(newPart.quantity),
                unit_price: newPart.unit_price.trim() ? Number(newPart.unit_price) : null,
            })
            if (error) throw error
            setNewPart({ part_name: '', part_code: '', quantity: '1', unit_price: '' })
            setPartSuggestions([])
            setShowPartSuggestions(false)
            const { data: partRows } = await supabase
                .from('repair_parts')
                .select('id, part_name, part_code, quantity')
                .eq('repair_request_id', request.id)
                .order('created_at')
            setParts(
                (partRows || []).map((row) => ({
                    id: String(row.id),
                    part_name: String(row.part_name || ''),
                    part_code: row.part_code != null ? String(row.part_code) : null,
                    quantity:
                        row.quantity != null && Number(row.quantity) > 0 ? Number(row.quantity) : 1,
                })),
            )
            setMessage({ type: 'ok', text: '部品を追加しました' })
        } catch (e: unknown) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : '部品の追加に失敗しました' })
        } finally {
            setAddingPart(false)
        }
    }

    if (loading) {
        return <p style={{ padding: 24, color: '#94a3b8' }}>読み込み中…</p>
    }

    if (!request) {
        return (
            <main className="repair-mobile-main">
                <p className="repair-mobile-msg err">{message?.text || '案件が見つかりません'}</p>
                <Link href="/repair-mobile" className="repair-mobile-btn-secondary">
                    一覧へ
                </Link>
            </main>
        )
    }

    const st = REPAIR_STATUS_CONFIG[request.status] || {
        label: request.status,
        color: '#94a3b8',
        bg: '#334155',
    }
    const pr = REPAIR_PRIORITY_CONFIG[request.priority]
    const suggested = getMobileSuggestedStatuses(statusBaseline)

    return (
        <>
            <header className="repair-mobile-header">
                <Link
                    href="/repair-mobile"
                    style={{ fontSize: 14, color: '#94a3b8', textDecoration: 'none' }}
                >
                    ← 一覧
                </Link>
                <div className="repair-mobile-header-row" style={{ marginTop: 6 }}>
                    <div className="repair-mobile-header-title">
                        <h1 style={{ margin: 0 }}>No.{request.request_no}</h1>
                        {request.status === 'received' ? (
                            <button
                                type="button"
                                className="repair-mobile-staff-confirm-btn"
                                disabled={confirmingStaff}
                                onClick={() => void handleStaffConfirm()}
                            >
                                {confirmingStaff ? '記録中…' : '担当者確認'}
                            </button>
                        ) : request.status === 'staff_confirmed' ||
                          statusBaseline === 'staff_confirmed' ? (
                            <span className="repair-mobile-staff-confirmed-done">確認済</span>
                        ) : null}
                    </div>
                    <span
                        className="repair-mobile-badge"
                        style={{ color: st.color, background: st.bg, fontSize: 12, flexShrink: 0 }}
                    >
                        {st.label}
                    </span>
                </div>
                <RepairPhoneCallLinks
                    customerPhone={customerPhone}
                    customerMobile={customerMobile}
                />
            </header>

            <main className="repair-mobile-main">
                {message && (
                    <div className={`repair-mobile-msg ${message.type}`}>{message.text}</div>
                )}

                {request.status === 'closed' && (
                    <div className="repair-mobile-msg ok">
                        案件は完了です（顧客承諾済み
                        {request.customer_acknowledged_at
                            ? ` ${new Date(request.customer_acknowledged_at).toLocaleString('ja-JP')}`
                            : ''}
                        ）
                    </div>
                )}
                {isAwaitingCustomerAck(request.status) && !request.customer_acknowledged_at && (
                    <div className="repair-mobile-msg ok">
                        完了報告済みです。顧客がLINEで「承諾する」を押すと案件が完了になります。
                    </div>
                )}

                <section className="repair-mobile-section">
                    <h2>顧客・機器情報</h2>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                        緑の番号をタップで発信できます。保存すると修理案件に記録されます。
                    </p>
                    {(customerRegisterId || request.customer_register_id) && (
                        <p style={{ fontSize: 12, color: '#4ade80', marginBottom: 10 }}>
                            顧客カルテ紐づけ済み
                        </p>
                    )}
                    <label className="repair-mobile-label" style={{ marginTop: 0 }}>
                        顧客名 <span style={{ color: '#f87171' }}>*</span>
                    </label>
                    <input
                        className="repair-mobile-input"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                    />
                    <label className="repair-mobile-label">住所</label>
                    <input
                        className="repair-mobile-input"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="都道府県・市区町村・番地"
                    />
                    <label className="repair-mobile-label">地域（県など）</label>
                    <input
                        className="repair-mobile-input"
                        value={customerRegion}
                        onChange={(e) => setCustomerRegion(e.target.value)}
                        placeholder="例: 宮崎県"
                    />
                    <label className="repair-mobile-label">緊急時連絡先（電話番号）</label>
                    <input
                        className="repair-mobile-input"
                        type="tel"
                        inputMode="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="固定・携帯どちらでも"
                    />
                    <label className="repair-mobile-label">追加の連絡先（任意）</label>
                    <input
                        className="repair-mobile-input"
                        type="tel"
                        inputMode="tel"
                        value={customerMobile}
                        onChange={(e) => setCustomerMobile(e.target.value)}
                    />
                    <label className="repair-mobile-label">分野（顧客登録のシート種別）</label>
                    <select
                        className="repair-mobile-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        {SHEET_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <label className="repair-mobile-label">型式</label>
                    <input
                        className="repair-mobile-input"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                    />
                    <label className="repair-mobile-label">本体番号</label>
                    <input
                        className="repair-mobile-input"
                        value={serialNo}
                        onChange={(e) => setSerialNo(e.target.value)}
                        placeholder="銘板・カルテ照合用"
                    />
                    <label className="repair-mobile-label">製造番号</label>
                    <input
                        className="repair-mobile-input"
                        value={mfgNo}
                        onChange={(e) => setMfgNo(e.target.value)}
                    />
                    <label className="repair-mobile-label">製造年</label>
                    <input
                        className="repair-mobile-input"
                        value={mfgYear}
                        onChange={(e) => setMfgYear(e.target.value)}
                        placeholder="例: 2020"
                    />
                    <button
                        type="button"
                        className="repair-mobile-btn-outline"
                        disabled={syncing}
                        onClick={() => handlePrepareCustomerRegister()}
                    >
                        {syncing ? '確認中…' : '顧客登録（カルテ）へ反映'}
                    </button>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                        画面上の顧客・機器情報を顧客登録マスタへ登録／更新し、この案件に紐づけます。
                    </p>
                    <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
                        {request.assigned_staff && <div>担当: {request.assigned_staff}</div>}
                        {request.assigned_branch && <div>{getBranchName(request.assigned_branch)}</div>}
                        {request.visit_scheduled_date && <div>出張予定: {request.visit_scheduled_date}</div>}
                        {pr && pr.label !== '通常' && (
                            <span style={{ color: pr.color }}>優先度: {pr.label}</span>
                        )}
                    </div>
                </section>

                <section className="repair-mobile-section">
                    <h2>症状（受付内容）</h2>
                    {request.symptom_category && (
                        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#fbbf24' }}>
                            {request.symptom_category}
                            {request.error_code ? ` (${request.error_code})` : ''}
                        </p>
                    )}
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {request.symptom}
                    </p>
                    {request.notes && (
                        <p style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>備考: {request.notes}</p>
                    )}
                </section>

                {photos.length > 0 && (
                    <section className="repair-mobile-section">
                        <h2>写真</h2>
                        <div className="repair-mobile-photo-grid">
                            {photos.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={`写真${i + 1}`} />
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                <section className="repair-mobile-section">
                    <h2>ステータス</h2>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>
                        完了は「完了報告送信」→ 顧客承諾 → 案件完了の順です。下の「保存する」で途中保存できます。
                    </p>
                    {suggested.map((code) => {
                        const cfg = REPAIR_STATUS_CONFIG[code]
                        if (!cfg) return null
                        return (
                            <button
                                key={code}
                                type="button"
                                className={`repair-mobile-status-btn${selectedStatus === code ? ' selected' : ''}`}
                                onClick={() => setSelectedStatus(code)}
                            >
                                {cfg.label}
                            </button>
                        )
                    })}
                </section>

                <section className="repair-mobile-section">
                    <h2>修理内容・完了報告</h2>
                    <label className="repair-mobile-label" style={{ marginTop: 0 }}>
                        処置内容
                    </label>
                    <textarea
                        className="repair-mobile-textarea"
                        value={treatment}
                        onChange={(e) => setTreatment(e.target.value)}
                    />
                    <label className="repair-mobile-label">原因</label>
                    <input
                        className="repair-mobile-input"
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                    />
                    <label className="repair-mobile-label">修理時間（分）</label>
                    <input
                        className="repair-mobile-input"
                        type="number"
                        inputMode="numeric"
                        value={durationMin}
                        onChange={(e) => setDurationMin(e.target.value)}
                    />
                    <div className="repair-mobile-cost-row">
                        <div className="repair-mobile-part-cell">
                            <label className="repair-mobile-part-cell-label">出張費（円）</label>
                            <input
                                className="repair-mobile-input"
                                type="text"
                                inputMode="text"
                                value={visitFee}
                                onChange={(e) => setVisitFee(e.target.value)}
                                placeholder="例: 5000"
                            />
                        </div>
                        <div className="repair-mobile-part-cell">
                            <label className="repair-mobile-part-cell-label">工賃（円）</label>
                            <input
                                className="repair-mobile-input"
                                type="text"
                                inputMode="text"
                                value={laborCost}
                                onChange={(e) => setLaborCost(e.target.value)}
                                placeholder="例: 15000"
                            />
                        </div>
                    </div>
                    {request.visit_completed_date && (
                        <p style={{ fontSize: 12, color: '#4ade80', marginTop: 8 }}>
                            完了日: {request.visit_completed_date}
                        </p>
                    )}
                </section>

                <section className="repair-mobile-section">
                    <h2>交換部品</h2>
                    {parts.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            {parts.map((p) => (
                                <div
                                    key={p.id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        padding: '10px 0',
                                        borderBottom: '1px solid #334155',
                                    }}
                                >
                                    <div
                                        className="repair-mobile-part-line"
                                        style={{ flex: 1, minWidth: 0, fontSize: 14 }}
                                    >
                                        <span style={{ fontWeight: 600 }}>{p.part_name || '—'}</span>
                                        <span className="repair-mobile-part-line-muted">
                                            {' '}
                                            / {p.part_code || '—'}
                                        </span>
                                        <span className="repair-mobile-part-qty">
                                            {partListQuantity(p)}個
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => deletePart(p.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#f87171',
                                            fontSize: 18,
                                            padding: 8,
                                        }}
                                        aria-label="削除"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="repair-mobile-part-row">
                        <div className="repair-mobile-part-cell repair-mobile-suggest-wrap">
                            <span className="repair-mobile-part-cell-label">商品名</span>
                            <input
                                className="repair-mobile-input"
                                type="text"
                                value={newPart.part_name}
                                onChange={(e) => handlePartNameChange(e.target.value)}
                                onFocus={() => {
                                    if (partSuggestions.length > 0) setShowPartSuggestions(true)
                                }}
                                onBlur={() => setTimeout(() => setShowPartSuggestions(false), 200)}
                                placeholder="検索"
                                autoComplete="off"
                            />
                            {showPartSuggestions && partSuggestions.length > 0 && (
                                <div className="repair-mobile-suggest-list">
                                    {partSuggestions.map((p) => (
                                        <div
                                            key={p.id}
                                            className="repair-mobile-suggest-item"
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                handleSelectProduct(p)
                                            }}
                                        >
                                            <div className="repair-mobile-suggest-name">{p.name}</div>
                                            <div className="repair-mobile-suggest-code">{p.id}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="repair-mobile-part-cell">
                            <span className="repair-mobile-part-cell-label">コード</span>
                            <input
                                className="repair-mobile-input"
                                type="text"
                                value={newPart.part_code}
                                readOnly
                                placeholder="—"
                                style={{ color: '#94a3b8' }}
                            />
                        </div>
                        <div className="repair-mobile-part-cell">
                            <span className="repair-mobile-part-cell-label">数量</span>
                            <input
                                className="repair-mobile-input"
                                type="text"
                                inputMode="text"
                                value={newPart.quantity}
                                onChange={(e) =>
                                    setNewPart((prev) => ({ ...prev, quantity: e.target.value }))
                                }
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        className="repair-mobile-btn-add-part"
                        disabled={addingPart || !newPart.part_name.trim()}
                        onClick={() => handleAddPart()}
                    >
                        {addingPart ? '追加中…' : '追加'}
                    </button>
                </section>
            </main>

            {syncDialog && (
                <div
                    className="repair-mobile-overlay"
                    onClick={() => !syncing && setSyncDialog(null)}
                >
                    <div className="repair-mobile-sheet" onClick={(e) => e.stopPropagation()}>
                        <h3>顧客登録（カルテ）への反映</h3>
                        {syncDialog.mode === 'skip' && (
                            <>
                                <p style={{ fontSize: 14, color: '#fca5a5', lineHeight: 1.5 }}>
                                    {syncDialog.message}
                                </p>
                                <button
                                    type="button"
                                    className="repair-mobile-btn-primary"
                                    style={{ width: '100%', marginTop: 12 }}
                                    onClick={() => setSyncDialog(null)}
                                >
                                    閉じる
                                </button>
                            </>
                        )}
                        {syncDialog.mode === 'new' && (
                            <>
                                <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                                    同名の顧客が顧客登録にありません。新規登録して案件に紐づけます。
                                </p>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                                    <div>顧客: {String(syncDialog.preview.customer_name || '')}</div>
                                    {syncDialog.preview.address ? (
                                        <div>住所: {String(syncDialog.preview.address)}</div>
                                    ) : null}
                                    {syncDialog.preview.model ? (
                                        <div>型式: {String(syncDialog.preview.model)}</div>
                                    ) : null}
                                    {syncDialog.preview.serial_no ? (
                                        <div>本体番号: {String(syncDialog.preview.serial_no)}</div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    className="repair-mobile-btn-primary"
                                    style={{ width: '100%', marginTop: 16 }}
                                    disabled={syncing}
                                    onClick={() => handleApplyCustomerRegister('insert')}
                                >
                                    {syncing ? '登録中…' : '新規登録する'}
                                </button>
                                <button
                                    type="button"
                                    className="repair-mobile-btn-outline"
                                    disabled={syncing}
                                    onClick={() => setSyncDialog(null)}
                                >
                                    キャンセル
                                </button>
                            </>
                        )}
                        {syncDialog.mode === 'exists' && (
                            <>
                                <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                                    同名の顧客が {syncDialog.existingCustomers.length}{' '}
                                    件あります。更新する行を選ぶか、別顧客として新規登録してください。
                                </p>
                                {syncDialog.existingCustomers.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className="repair-mobile-candidate"
                                        disabled={syncing}
                                        onClick={() => handleApplyCustomerRegister('update', c.id)}
                                    >
                                        <div style={{ fontWeight: 600 }}>{c.customer_name}</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                            {[c.address, c.phone, c.model, c.serial_no]
                                                .filter(Boolean)
                                                .join(' / ') || '（詳細なし）'}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 6 }}>
                                            この行を更新して紐づけ
                                        </div>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className="repair-mobile-btn-primary"
                                    style={{ width: '100%', marginTop: 8 }}
                                    disabled={syncing}
                                    onClick={() => handleApplyCustomerRegister('insert')}
                                >
                                    {syncing ? '登録中…' : '別顧客として新規登録'}
                                </button>
                                <button
                                    type="button"
                                    className="repair-mobile-btn-outline"
                                    disabled={syncing}
                                    onClick={() => setSyncDialog(null)}
                                >
                                    キャンセル
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="repair-mobile-bar" style={{ maxWidth: '100%' }}>
                {!isAwaitingCustomerAck(request.status) && request.status !== 'closed' && (
                    <button
                        type="button"
                        className="repair-mobile-btn-primary"
                        disabled={saving}
                        onClick={() => save({ markCompleted: true })}
                    >
                        {saving ? '送信中…' : '完了報告送信'}
                    </button>
                )}
                <button
                    type="button"
                    className="repair-mobile-btn-secondary"
                    disabled={saving}
                    onClick={() => save()}
                >
                    {saving ? '保存中…' : '保存する'}
                </button>
            </div>
        </>
    )
}
