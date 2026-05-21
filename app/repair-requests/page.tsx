'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { BRANCHES, getBranchName, getStaffDepartmentsForBranch } from '@/lib/branches'
import {
    SHEET_TYPE_OPTIONS,
    repairCategoryToSheetType,
    formatRepairCategoryDisplay,
    buildRepairDealerNameForCustomerRegister,
    getSheetTypeLabel,
} from '@/lib/customerRegisterSheetTypes'
import { normalizeRepairMediaUrls } from '@/lib/repairPhotoStorage'
import { buildRepairSymptomQuery } from '@/lib/repairSymptomText'

// ── Types ──

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
    machine_type: string | null
    model: string | null
    serial_no: string | null
    manufacturing_no: string | null
    manufacturing_year: string | null
    usage_years: number | null
    symptom: string
    symptom_category: string | null
    error_code: string | null
    symptom_detail: string | null
    photo_urls: string[]
    video_urls: string[]
    assigned_branch: string | null
    assigned_staff: string | null
    visit_scheduled_date: string | null
    visit_completed_date: string | null
    treatment_details: string | null
    root_cause: string | null
    repair_duration_minutes: number | null
    repair_cost: number | null
    notes: string | null
    customer_register_id: string | null
    created_at: string
    updated_at: string
}

/** 商品マスタ検索の最大件数（以前は10件のみで全マスタを参照できなかった） */
const PART_SUGGESTION_LIMIT = 500

function escapeForIlikeFragment(raw: string): string {
    return raw
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/,/g, ' ')
}

type RepairPart = {
    id: string
    repair_request_id: string
    part_name: string
    part_code: string | null
    quantity: number
    unit_price: number | null
    notes: string | null
}

type StaffOption = { id: string; name: string; department: string | null; email: string | null }

// ── Constants ──

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    received:        { label: '受付',         color: '#60a5fa', bg: '#1e3a5f' },
    staff_confirmed: { label: '担当者確認',   color: '#2dd4bf', bg: '#134e4a' },
    confirming:      { label: '確認中',       color: '#fbbf24', bg: '#4a3728' },
    phone_done:      { label: '電話対応済', color: '#a78bfa', bg: '#3b2e5a' },
    visit_scheduled: { label: '出張予定',   color: '#fb923c', bg: '#4a3020' },
    parts_waiting:   { label: '部品待ち',   color: '#f87171', bg: '#4a2020' },
    repairing:       { label: '修理中',     color: '#38bdf8', bg: '#1e3a5f' },
    completed:       { label: '修理完了',   color: '#4ade80', bg: '#1a3a2a' },
    billed:          { label: '請求済',     color: '#818cf8', bg: '#2e2e5a' },
    closed:          { label: 'クローズ',   color: '#94a3b8', bg: '#334155' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    urgent: { label: '緊急',   color: '#ef4444', bg: '#4a1515' },
    high:   { label: '高',     color: '#f97316', bg: '#4a2a10' },
    normal: { label: '通常',   color: '#60a5fa', bg: '#1e3a5f' },
    low:    { label: '低',     color: '#94a3b8', bg: '#334155' },
}

const RECEIVED_VIA_OPTIONS = [
    { value: 'phone', label: '電話' },
    { value: 'line', label: 'LINE' },
    { value: 'web', label: 'Webフォーム' },
    { value: 'visit', label: '来訪' },
    { value: 'other', label: 'その他' },
]

const SYMPTOM_CATEGORIES = [
    '火がつかない', '温度上がらない', '異音', 'エラー表示',
    '水漏れ', '煙が出る', '電源入らない', '動作不良',
    '部品破損', '点検依頼', 'その他',
]

type FormState = {
    received_via: string
    priority: string
    customer_name: string
    customer_address: string
    customer_phone: string
    customer_mobile: string
    customer_region: string
    category: string
    machine_type: string
    model: string
    serial_no: string
    manufacturing_no: string
    manufacturing_year: string
    usage_years: string
    symptom: string
    symptom_category: string
    error_code: string
    symptom_detail: string
    assigned_branch: string
    assigned_staff: string
    visit_scheduled_date: string
    notes: string
    customer_register_id: string
}

const createInitialForm = (): FormState => ({
    received_via: 'phone',
    priority: 'normal',
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    customer_mobile: '',
    customer_region: '',
    category: '',
    machine_type: '',
    model: '',
    serial_no: '',
    manufacturing_no: '',
    manufacturing_year: '',
    usage_years: '',
    symptom: '',
    symptom_category: '',
    error_code: '',
    symptom_detail: '',
    assigned_branch: '',
    assigned_staff: '',
    visit_scheduled_date: '',
    notes: '',
    customer_register_id: '',
})

// ── Styles ──

const pageStyle: React.CSSProperties = {
    padding: 24, maxWidth: 1800, margin: '0 auto', minHeight: '100vh', color: '#e2e8f0',
}
const panelStyle: React.CSSProperties = {
    background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 20,
    boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
}
const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#cbd5e1',
}
const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, padding: '10px 12px',
}
const thStyle: React.CSSProperties = {
    border: '1px solid #334155', padding: '8px 10px', background: '#1e293b',
    textAlign: 'left', fontSize: 12, color: '#e2e8f0', fontWeight: 700, whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
    border: '1px solid #334155', padding: '8px 10px', fontSize: 12, color: '#cbd5e1', verticalAlign: 'top',
}

const toNullable = (v: string) => { const t = v.trim(); return t || null }

// ── Component ──

export default function RepairRequestsPage() {
    const [rows, setRows] = useState<RepairRequest[]>([])
    const [staffs, setStaffs] = useState<StaffOption[]>([])
    const [formData, setFormData] = useState<FormState>(createInitialForm)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('active')
    const [filterPriority, setFilterPriority] = useState<string>('')
    const [filterBranch, setFilterBranch] = useState<string>('')
    const [searchKeyword, setSearchKeyword] = useState('')

    // Detail modal
    const [detailRequest, setDetailRequest] = useState<RepairRequest | null>(null)
    const [detailParts, setDetailParts] = useState<RepairPart[]>([])
    const [pastRepairs, setPastRepairs] = useState<RepairRequest[]>([])

    // Repair completion form
    const [completionData, setCompletionData] = useState({
        treatment_details: '',
        root_cause: '',
        repair_duration_minutes: '',
        repair_cost: '',
        /** 現地で判明した本体番号（受付時は空のことあり） */
        body_serial_no: '',
        /** 銘板の製造番号（受付時は空のことあり） */
        manufacturing_no: '',
    })

    // Parts form
    const [newPart, setNewPart] = useState({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })
    const [partSuggestions, setPartSuggestions] = useState<{ id: string; name: string; cost_price: number | null; retail_price: number | null }[]>([])
    const [showPartSuggestions, setShowPartSuggestions] = useState(false)

    // AI search (Dify)
    const [aiSearching, setAiSearching] = useState(false)
    const [aiAnswer, setAiAnswer] = useState<string | null>(null)

    type LwAckRow = {
        staff_name: string
        status: string
        sent_at: string | null
        acknowledged_at: string | null
    }
    const [lineWorksAcks, setLineWorksAcks] = useState<LwAckRow[]>([])
    const [detailNotifyMessage, setDetailNotifyMessage] = useState<string | null>(null)
    /** 案件詳細を開いたときの DB 上のステータス（「保存して閉じる」まで確定しない） */
    const [detailStatusBaseline, setDetailStatusBaseline] = useState<string | null>(null)

    const handleCloseDetailModalRef = useRef<() => void>(() => {})

    const setNotifyFeedback = (text: string) => {
        setMessage(text)
        setDetailNotifyMessage(text)
    }
    const deepLinkHandled = useRef(false)

    // Customer sync dialog
    const [customerSyncDialog, setCustomerSyncDialog] = useState<{
        mode: 'new' | 'exists'
        customerData: Record<string, unknown>
        existingCustomers: { id: string; customer_name: string; address: string | null; phone: string | null; mobile: string | null; model: string | null; serial_no: string | null }[]
    } | null>(null)

    const [chartLinkCandidates, setChartLinkCandidates] = useState<Array<{
        id: string
        customer_name: string | null
        serial_no: string | null
        phone: string | null
    }> | null>(null)

    const fetchStaffs = useCallback(async () => {
        const { data } = await supabase.from('staffs').select('id, name, department, email').order('name')
        setStaffs((data || []).map(s => ({
            id: String(s.id),
            name: s.name || '',
            department: s.department || null,
            email: s.email || null,
        })))
    }, [])

    const fetchRequests = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true
        if (!silent) setLoading(true)
        try {
            let query = supabase.from('repair_requests').select('*').order('received_at', { ascending: false })

            if (filterStatus === 'active') {
                query = query.not('status', 'in', '("completed","billed","closed")')
            } else if (filterStatus === 'needs_staff_ack') {
                query = query.eq('status', 'received')
            } else if (filterStatus && filterStatus !== 'all') {
                query = query.eq('status', filterStatus)
            }
            if (filterPriority) query = query.eq('priority', filterPriority)
            if (filterBranch) query = query.eq('assigned_branch', filterBranch)

            const { data, error } = await query
            if (error) throw error
            setRows((data || []).map((r) => ({
                ...r,
                photo_urls: normalizeRepairMediaUrls(r.photo_urls),
                video_urls: normalizeRepairMediaUrls(r.video_urls),
            })) as RepairRequest[])
        } catch (e: any) {
            console.error(e)
            setMessage(`一覧取得に失敗しました: ${e.message}`)
        } finally {
            if (!silent) setLoading(false)
        }
    }, [filterStatus, filterPriority, filterBranch])

    useEffect(() => { fetchStaffs() }, [fetchStaffs])
    useEffect(() => { fetchRequests() }, [fetchRequests])

    /** LINE WORKS 確認後のステータス変更を一覧に反映（20秒ごと） */
    useEffect(() => {
        const timer = setInterval(() => {
            void fetchRequests({ silent: true })
        }, 20_000)
        return () => clearInterval(timer)
    }, [fetchRequests])

    const filteredRows = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase()
        if (!kw) return rows
        return rows.filter(r => {
            const vals = [
                r.customer_name, r.customer_address || '', formatRepairCategoryDisplay(r.category), r.model || '',
                r.serial_no || '', r.manufacturing_no || '', r.symptom, r.assigned_staff || '',
                r.treatment_details || '', String(r.request_no),
            ]
            return vals.some(v => v.toLowerCase().includes(kw))
        })
    }, [rows, searchKeyword])

    // Status counts
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
        return counts
    }, [rows])

    const handleChange = (field: keyof FormState, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleLookupChartBySerial = async () => {
        const sn = formData.serial_no.trim()
        if (!sn) {
            setMessage('「本体番号（カルテ照合用）」に顧客カルテと同じ番号を入れてから実行してください')
            return
        }
        setMessage(null)
        try {
            const { data, error } = await supabase
                .from('customer_register_rows')
                .select('id, customer_name, serial_no, phone')
                .eq('serial_no', sn)
                .limit(15)
            if (error) throw error
            const list = (data || []) as Array<{ id: string; customer_name: string | null; serial_no: string | null; phone: string | null }>
            if (list.length === 0) {
                setMessage('本体番号が一致する顧客カルテがありません。カルテ側の本体番号を確認してください。')
                return
            }
            if (list.length === 1) {
                handleChange('customer_register_id', list[0].id)
                setMessage('顧客カルテに紐づけました')
                return
            }
            setChartLinkCandidates(list)
        } catch (e: any) {
            setMessage(`カルテ検索に失敗しました: ${e.message}`)
        }
    }

    const resetForm = () => {
        setEditingId(null)
        setFormData(createInitialForm())
    }

    const staffOptionsForBranch = useMemo(() => {
        const branch = formData.assigned_branch
        if (!branch) return staffs
        const deptNames = new Set(getStaffDepartmentsForBranch(branch))
        return staffs.filter(s => !s.department || deptNames.has(s.department))
    }, [staffs, formData.assigned_branch])

    const triggerRepairStaffNotify = async (repairRequestId: string, branchId: string | null) => {
        try {
            const res = await fetch('/api/repair-notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repair_request_id: repairRequestId }),
            })
            const data = await res.json()
            if (!data.ok) return

            const targetLabel = branchId
                ? `${getBranchName(branchId)}の担当者`
                : '管理部・技術部'
            const emailSent = data.email?.sent ?? 0
            const lwSent = data.lineworks?.sent ?? 0
            const lineSent = data.line?.sent ?? 0
            const parts: string[] = []
            if (emailSent > 0) parts.push(`メール ${emailSent}名`)
            if (lwSent > 0) parts.push(`LINE WORKS ${lwSent}名`)
            if (lineSent > 0) parts.push(`LINE ${lineSent}名`)
            if (parts.length > 0) {
                setMessage(prev => {
                    const base = prev || '保存しました'
                    return `${base}（${targetLabel}へ${parts.join('・')}に通知）`
                })
            } else if (data.email?.skipped || data.lineworks?.skipped || data.line?.skipped) {
                console.log('repair notify skipped:', data.email?.reason, data.line?.reason)
            }
        } catch (e) {
            console.error('repair staff notify failed:', e)
        }
    }

    const handleSave = async () => {
        if (!formData.customer_name.trim()) { setMessage('顧客名を入力してください'); return }
        if (!formData.symptom.trim()) { setMessage('症状を入力してください'); return }

        setSaving(true); setMessage(null)
        const payload: Record<string, unknown> = {
            received_via: formData.received_via,
            priority: formData.priority,
            customer_name: formData.customer_name.trim(),
            customer_address: toNullable(formData.customer_address),
            customer_phone: toNullable(formData.customer_phone),
            customer_mobile: toNullable(formData.customer_mobile),
            customer_region: toNullable(formData.customer_region),
            category: toNullable(repairCategoryToSheetType(formData.category)),
            machine_type: toNullable(formData.machine_type),
            model: toNullable(formData.model),
            serial_no: toNullable(formData.serial_no),
            manufacturing_no: toNullable(formData.manufacturing_no),
            manufacturing_year: toNullable(formData.manufacturing_year),
            usage_years: formData.usage_years ? Number(formData.usage_years) : null,
            symptom: formData.symptom.trim(),
            symptom_category: toNullable(formData.symptom_category),
            error_code: toNullable(formData.error_code),
            symptom_detail: toNullable(formData.symptom_detail),
            assigned_branch: toNullable(formData.assigned_branch),
            assigned_staff: toNullable(formData.assigned_staff),
            visit_scheduled_date: toNullable(formData.visit_scheduled_date) || null,
            notes: toNullable(formData.notes),
            customer_register_id: toNullable(formData.customer_register_id),
        }

        try {
            const branchId = toNullable(formData.assigned_branch)
            if (editingId) {
                const { error } = await supabase.from('repair_requests').update(payload).eq('id', editingId)
                if (error) throw error
                setMessage('修理案件を更新しました')
            } else {
                payload.status = 'received'
                const { data: inserted, error } = await supabase
                    .from('repair_requests')
                    .insert(payload)
                    .select('id')
                    .single()
                if (error) throw error
                setMessage('修理案件を登録しました')
                if (inserted?.id) {
                    await triggerRepairStaffNotify(inserted.id, branchId)
                }
            }

            await syncCustomerRegister(formData)

            resetForm()
            await fetchRequests()
        } catch (e: any) {
            setMessage(`保存に失敗しました: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    const syncCustomerRegister = async (fd: FormState) => {
        const name = fd.customer_name.trim()
        if (!name) return

        const hasInfo = fd.customer_address.trim() || fd.customer_phone.trim() || fd.customer_mobile.trim()
            || fd.model.trim() || fd.serial_no.trim()
        if (!hasInfo) return

        try {
            const { data: existing } = await supabase
                .from('customer_register_rows')
                .select('id, customer_name, address, phone, mobile, model, serial_no')
                .eq('customer_name', name)

            const sheetType = repairCategoryToSheetType(fd.category)
            const customerPayload: Record<string, unknown> = {
                customer_name: name,
                address: toNullable(fd.customer_address),
                phone: toNullable(fd.customer_phone),
                mobile: toNullable(fd.customer_mobile),
                model: toNullable(fd.model),
                serial_no: toNullable(fd.serial_no),
                sheet_name: getSheetTypeLabel(sheetType),
                sheet_type: sheetType,
                staff_name: toNullable(fd.assigned_staff),
                dealer_name: buildRepairDealerNameForCustomerRegister(fd),
            }

            if (existing && existing.length > 0) {
                setCustomerSyncDialog({
                    mode: 'exists',
                    customerData: customerPayload,
                    existingCustomers: existing as any,
                })
            } else {
                setCustomerSyncDialog({
                    mode: 'new',
                    customerData: customerPayload,
                    existingCustomers: [],
                })
            }
        } catch (e) {
            console.error('顧客情報同期チェックエラー:', e)
        }
    }

    const handleCustomerSyncConfirm = async (action: 'insert' | 'update', targetId?: string) => {
        if (!customerSyncDialog) return
        try {
            if (action === 'insert') {
                const { error } = await supabase.from('customer_register_rows').insert(customerSyncDialog.customerData)
                if (error) throw error
                setMessage(prev => (prev ? prev + ' / ' : '') + '顧客情報を新規登録しました')
            } else if (action === 'update' && targetId) {
                const updateData = { ...customerSyncDialog.customerData }
                const { error } = await supabase.from('customer_register_rows').update(updateData).eq('id', targetId)
                if (error) throw error
                setMessage(prev => (prev ? prev + ' / ' : '') + '顧客登録情報を更新しました')
            }
        } catch (e: any) {
            setMessage(prev => (prev ? prev + ' / ' : '') + `顧客情報の同期に失敗: ${e.message}`)
        }
        setCustomerSyncDialog(null)
    }

    const handleCustomerSyncCancel = () => {
        setCustomerSyncDialog(null)
    }

    const notifyLineWorksStaffConfirmed = (repairId: string) => {
        void fetch('/api/lineworks/confirm-from-web', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repair_request_id: repairId }),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok || !data.ok) {
                    if (!data.skipped) {
                        console.warn('LINE WORKS confirm-from-web:', data.error)
                    }
                    return
                }
                if ((data.sent ?? 0) > 0) {
                    setNotifyFeedback(`LINE WORKS に確認メッセージを送信しました（${data.sent}名）`)
                }
            })
            .catch((e) => console.warn('LINE WORKS confirm-from-web:', e))
    }

    /** 案件詳細を閉じる保存の一部としてステータスを確定（履歴・LINE 通知含む） */
    const persistRepairStatusTransition = async (
        repairId: string,
        oldStatus: string,
        newStatus: string,
        receivedVia: string,
    ) => {
        const { error } = await supabase.from('repair_requests').update({ status: newStatus }).eq('id', repairId)
        if (error) throw error

        const { error: histErr } = await supabase.from('repair_status_history').insert({
            repair_request_id: repairId,
            old_status: oldStatus,
            new_status: newStatus,
        })
        if (histErr) throw histErr

        if (receivedVia === 'line') {
            fetch('/api/line/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'status_change', repair_request_id: repairId }),
            }).catch(() => {})
        }

        if (newStatus === 'staff_confirmed') {
            notifyLineWorksStaffConfirmed(repairId)
        }
    }

    /** LINE WORKS で確認済みだが案件が「受付」のままのとき、ステータスだけ下書き変更（保存で確定） */
    const handleApplyStaffConfirmedStatus = () => {
        if (!detailRequest || detailRequest.status !== 'received') return
        setDetailRequest((prev) => (prev ? { ...prev, status: 'staff_confirmed' } : null))
        setDetailNotifyMessage('ステータスを「担当者確認」に変更しました。「保存して閉じる」で保存してください。')
    }

    const handleEdit = (row: RepairRequest) => {
        setEditingId(row.id)
        setFormData({
            received_via: row.received_via,
            priority: row.priority,
            customer_name: row.customer_name,
            customer_address: row.customer_address || '',
            customer_phone: row.customer_phone || '',
            customer_mobile: row.customer_mobile || '',
            customer_region: row.customer_region || '',
            category: repairCategoryToSheetType(row.category || ''),
            machine_type: row.machine_type || '',
            model: row.model || '',
            serial_no: row.serial_no || '',
            manufacturing_no: row.manufacturing_no || '',
            manufacturing_year: row.manufacturing_year || '',
            usage_years: row.usage_years != null ? String(row.usage_years) : '',
            symptom: row.symptom,
            symptom_category: row.symptom_category || '',
            error_code: row.error_code || '',
            symptom_detail: row.symptom_detail || '',
            assigned_branch: row.assigned_branch || '',
            assigned_staff: row.assigned_staff || '',
            visit_scheduled_date: row.visit_scheduled_date || '',
            notes: row.notes || '',
            customer_register_id: row.customer_register_id || '',
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleDelete = async (id: string) => {
        if (!confirm('この修理案件を削除してもよろしいですか？')) return
        try {
            const { error } = await supabase.from('repair_requests').delete().eq('id', id)
            if (error) throw error
            if (editingId === id) resetForm()
            if (detailRequest?.id === id) setDetailRequest(null)
            setMessage('修理案件を削除しました')
            await fetchRequests()
        } catch (e: any) {
            setMessage(`削除に失敗しました: ${e.message}`)
        }
    }

    const openDetail = async (row: RepairRequest) => {
        setDetailRequest({
            ...row,
            photo_urls: normalizeRepairMediaUrls(row.photo_urls),
            video_urls: normalizeRepairMediaUrls(row.video_urls),
        })
        setDetailStatusBaseline(row.status)
        setDetailNotifyMessage(null)
        setAiAnswer(null)
        setCompletionData({
            treatment_details: row.treatment_details || '',
            root_cause: row.root_cause || '',
            repair_duration_minutes: row.repair_duration_minutes ? String(row.repair_duration_minutes) : '',
            repair_cost: row.repair_cost ? String(row.repair_cost) : '',
            body_serial_no: row.serial_no || '',
            manufacturing_no: row.manufacturing_no || '',
        })

        const { data: parts } = await supabase
            .from('repair_parts')
            .select('*')
            .eq('repair_request_id', row.id)
            .order('created_at')
        setDetailParts((parts || []) as RepairPart[])

        const { data: lwAck } = await supabase
            .from('repair_lineworks_notifications')
            .select('staff_name, status, sent_at, acknowledged_at')
            .eq('repair_request_id', row.id)
            .order('staff_name')
        setLineWorksAcks((lwAck || []) as LwAckRow[])

        if (row.model || row.serial_no) {
            let query = supabase.from('repair_requests').select('*').neq('id', row.id).order('received_at', { ascending: false }).limit(20)
            if (row.serial_no) {
                query = query.eq('serial_no', row.serial_no)
            } else if (row.model) {
                query = query.eq('model', row.model).eq('customer_name', row.customer_name)
            }
            const { data: past } = await query
            setPastRepairs((past || []) as RepairRequest[])
        } else {
            setPastRepairs([])
        }
    }

    useEffect(() => {
        if (loading || rows.length === 0 || deepLinkHandled.current) return
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        const no = params.get('no')
        const target =
            (id ? rows.find((r) => r.id === id) : undefined) ||
            (no ? rows.find((r) => String(r.request_no) === no) : undefined)
        if (!target) return
        deepLinkHandled.current = true
        void openDetail(target)
        const url = new URL(window.location.href)
        url.searchParams.delete('id')
        url.searchParams.delete('no')
        window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    }, [loading, rows])

    const handleAiSearch = async () => {
        if (!detailRequest) return
        const symptomText = buildRepairSymptomQuery({
            symptom: detailRequest.symptom,
            symptom_category: detailRequest.symptom_category,
            symptom_detail: detailRequest.symptom_detail,
        })
        if (!symptomText) {
            setAiAnswer(
                'エラー: 症状分類または症状の詳細がありません。LINE受付で詳細未入力の場合は、上の「分類」を確認するか、症状欄に追記してください。',
            )
            return
        }
        setAiSearching(true)
        setAiAnswer(null)
        try {
            const res = await fetch('/api/dify/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: getSheetTypeLabel(repairCategoryToSheetType(detailRequest.category || '')),
                    symptom: symptomText,
                    symptom_category: detailRequest.symptom_category || '',
                    symptom_detail: detailRequest.symptom_detail || '',
                    user_id: `staff-${Date.now()}`,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'AI検索に失敗しました')
            setAiAnswer(data.answer)
        } catch (e: any) {
            setAiAnswer(`エラー: ${e.message}`)
        } finally {
            setAiSearching(false)
        }
    }

    const handleSaveCompletion = async () => {
        if (!detailRequest) return
        const rid = detailRequest.id
        try {
            if (newPart.part_name.trim()) {
                const payload = {
                    repair_request_id: rid,
                    part_name: newPart.part_name.trim(),
                    part_code: toNullable(newPart.part_code),
                    quantity: Number(newPart.quantity) || 1,
                    unit_price: newPart.unit_price ? Number(newPart.unit_price) : null,
                    notes: toNullable(newPart.notes),
                }
                const { error: partErr } = await supabase.from('repair_parts').insert(payload)
                if (partErr) throw partErr
                setNewPart({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })
                setPartSuggestions([])
                setShowPartSuggestions(false)
            }

            const { error } = await supabase.from('repair_requests').update({
                treatment_details: toNullable(completionData.treatment_details),
                root_cause: toNullable(completionData.root_cause),
                repair_duration_minutes: completionData.repair_duration_minutes ? Number(completionData.repair_duration_minutes) : null,
                repair_cost: completionData.repair_cost ? Number(completionData.repair_cost) : null,
                serial_no: toNullable(completionData.body_serial_no),
                manufacturing_no: toNullable(completionData.manufacturing_no),
                visit_completed_date: new Date().toISOString().split('T')[0],
            }).eq('id', rid)
            if (error) throw error
            setMessage('修理内容を保存しました（完了日を記録）')
            await fetchRequests({ silent: true })
            setDetailRequest(prev => prev ? {
                ...prev,
                treatment_details: completionData.treatment_details || null,
                root_cause: completionData.root_cause || null,
                repair_duration_minutes: completionData.repair_duration_minutes ? Number(completionData.repair_duration_minutes) : null,
                repair_cost: completionData.repair_cost ? Number(completionData.repair_cost) : null,
                serial_no: toNullable(completionData.body_serial_no),
                manufacturing_no: toNullable(completionData.manufacturing_no),
                visit_completed_date: new Date().toISOString().split('T')[0],
            } : null)
        } catch (e: any) {
            setMessage(`保存に失敗しました: ${e.message}`)
        }
    }

    /**
     * 閉じる・オーバーレイ・Esc: 修理メモ等をDBへ反映（完了日は付けない）。入力中の部品1行があれば追加保存。
     * モーダルは即時に閉じ、保存はバックグラウンドで実行する（ネットワーク待ちで画面が固まらないようにする）。
     */
    const handleCloseDetailModal = () => {
        if (!detailRequest) {
            setDetailRequest(null)
            setDetailStatusBaseline(null)
            return
        }
        const rid = detailRequest.id
        const statusBaseline = detailStatusBaseline ?? detailRequest.status
        const statusDraft = detailRequest.status
        const receivedVia = detailRequest.received_via
        const snapshot = {
            customer_name: detailRequest.customer_name,
            customerNameFallback: detailRequest.customer_name,
            customer_address: detailRequest.customer_address ?? '',
            customer_phone: detailRequest.customer_phone ?? '',
            customer_mobile: detailRequest.customer_mobile ?? '',
            customer_region: detailRequest.customer_region ?? '',
            treatment_details: completionData.treatment_details ?? '',
            root_cause: completionData.root_cause ?? '',
            repair_duration_minutes: completionData.repair_duration_minutes ?? '',
            repair_cost: completionData.repair_cost ?? '',
            body_serial_no: completionData.body_serial_no ?? '',
            manufacturing_no: completionData.manufacturing_no ?? '',
            statusBaseline,
            statusDraft,
            receivedVia,
        }
        const pendingPart = newPart.part_name.trim()
            ? {
                    part_name: newPart.part_name.trim(),
                    part_code: newPart.part_code,
                    quantity: newPart.quantity,
                    unit_price: newPart.unit_price,
                    notes: newPart.notes,
                }
            : null

        setDetailRequest(null)
        setDetailStatusBaseline(null)

        void (async () => {
            try {
                const { error } = await supabase.from('repair_requests').update({
                    customer_name: (snapshot.customer_name || '').trim() || snapshot.customerNameFallback,
                    customer_address: toNullable(snapshot.customer_address),
                    customer_phone: toNullable(snapshot.customer_phone),
                    customer_mobile: toNullable(snapshot.customer_mobile),
                    customer_region: toNullable(snapshot.customer_region),
                    treatment_details: toNullable(snapshot.treatment_details),
                    root_cause: toNullable(snapshot.root_cause),
                    repair_duration_minutes: snapshot.repair_duration_minutes ? Number(snapshot.repair_duration_minutes) : null,
                    repair_cost: snapshot.repair_cost ? Number(snapshot.repair_cost) : null,
                    serial_no: toNullable(snapshot.body_serial_no),
                    manufacturing_no: toNullable(snapshot.manufacturing_no),
                }).eq('id', rid)
                if (error) throw error

                if (pendingPart) {
                    const payload = {
                        repair_request_id: rid,
                        part_name: pendingPart.part_name,
                        part_code: toNullable(pendingPart.part_code),
                        quantity: Number(pendingPart.quantity) || 1,
                        unit_price: pendingPart.unit_price ? Number(pendingPart.unit_price) : null,
                        notes: toNullable(pendingPart.notes ?? ''),
                    }
                    const { error: partErr } = await supabase.from('repair_parts').insert(payload)
                    if (partErr) throw partErr
                    setNewPart({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })
                    setPartSuggestions([])
                    setShowPartSuggestions(false)
                }

                const statusChanged = snapshot.statusDraft !== snapshot.statusBaseline
                if (statusChanged) {
                    await persistRepairStatusTransition(
                        rid,
                        snapshot.statusBaseline,
                        snapshot.statusDraft,
                        snapshot.receivedVia,
                    )
                }

                setMessage(
                    statusChanged
                        ? '案件内容とステータスを保存して閉じました'
                        : '案件内容を保存して閉じました',
                )
                await fetchRequests({ silent: true })
            } catch (e: any) {
                console.error('repair_requests close-save:', e)
                setMessage(`モーダルは閉じましたが保存に失敗しました: ${e.message}（一覧から案件を開き直して再度お試しください）`)
                await fetchRequests({ silent: true })
            }
        })()
    }

    handleCloseDetailModalRef.current = handleCloseDetailModal

    useEffect(() => {
        if (!detailRequest) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                handleCloseDetailModalRef.current()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [detailRequest])

    const handlePartNameChange = async (value: string) => {
        setNewPart(p => ({ ...p, part_name: value }))
        const raw = value.trim()
        if (raw.length < 1) {
            setPartSuggestions([])
            setShowPartSuggestions(false)
            return
        }
        const pat = `%${escapeForIlikeFragment(raw)}%`
        const sel = 'id, name, cost_price, retail_price'
        try {
            const nameQPromise = supabase
                .from('products')
                .select(sel)
                .ilike('name', pat)
                .order('name')
                .limit(PART_SUGGESTION_LIMIT)

            const specQPromise = supabase
                .from('products')
                .select(sel)
                .ilike('spec', pat)
                .order('name')
                .limit(PART_SUGGESTION_LIMIT)

            const idQPromise = supabase
                .from('products')
                .select(sel)
                .ilike('id', pat)
                .order('name')
                .limit(100)

            const [nameQ, specQ, idQ] = await Promise.all([nameQPromise, specQPromise, idQPromise])

            if (nameQ.error) throw nameQ.error

            const specRows = specQ.error ? [] : (specQ.data || [])
            const idRows = idQ.error ? [] : (idQ.data || [])

            const merged = new Map<string, { id: string; name: string; cost_price: number | null; retail_price: number | null }>()
            for (const row of [...(nameQ.data || []), ...specRows, ...idRows]) {
                const id = String((row as any).id)
                merged.set(id, row as any)
            }
            const list = Array.from(merged.values()).sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', 'ja'),
            )
            setPartSuggestions(list)
            setShowPartSuggestions(list.length > 0)
        } catch (e) {
            console.error('部品（商品マスタ）検索エラー:', e)
            setPartSuggestions([])
            setShowPartSuggestions(false)
        }
    }

    const handleSelectProduct = (product: { id: string; name: string; cost_price: number | null; retail_price: number | null }) => {
        setNewPart(p => ({
            ...p,
            part_name: product.name,
            part_code: product.id,
            unit_price: product.retail_price != null ? String(product.retail_price) : (product.cost_price != null ? String(product.cost_price) : ''),
        }))
        setShowPartSuggestions(false)
    }

    const handleAddPart = async () => {
        if (!detailRequest) {
            setMessage('案件が選択されていません')
            return
        }
        if (!newPart.part_name.trim()) {
            setMessage('部品名を入力してください')
            return
        }
        try {
            const payload = {
                repair_request_id: detailRequest.id,
                part_name: newPart.part_name.trim(),
                part_code: toNullable(newPart.part_code),
                quantity: Number(newPart.quantity) || 1,
                unit_price: newPart.unit_price ? Number(newPart.unit_price) : null,
                notes: toNullable(newPart.notes),
            }
            console.log('repair_parts INSERT:', payload)
            const { error } = await supabase.from('repair_parts').insert(payload)
            if (error) {
                console.error('repair_parts INSERT error:', error)
                throw error
            }
            setNewPart({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })
            setPartSuggestions([])
            const { data: parts } = await supabase.from('repair_parts').select('*').eq('repair_request_id', detailRequest.id).order('created_at')
            setDetailParts((parts || []) as RepairPart[])
            setMessage('部品を追加しました')
        } catch (e: any) {
            setMessage(`部品登録に失敗しました: ${e.message}`)
        }
    }

    const handleDeletePart = async (partId: string) => {
        if (!detailRequest) return
        try {
            await supabase.from('repair_parts').delete().eq('id', partId)
            setDetailParts(prev => prev.filter(p => p.id !== partId))
        } catch (e: any) {
            setMessage(`部品削除に失敗しました: ${e.message}`)
        }
    }

    const getNextStatuses = (current: string): string[] => {
        const flow: Record<string, string[]> = {
            received: ['staff_confirmed', 'confirming', 'phone_done', 'visit_scheduled'],
            staff_confirmed: ['confirming', 'phone_done', 'visit_scheduled'],
            confirming: ['phone_done', 'visit_scheduled', 'parts_waiting'],
            phone_done: ['visit_scheduled', 'parts_waiting', 'completed'],
            visit_scheduled: ['repairing', 'parts_waiting'],
            parts_waiting: ['visit_scheduled', 'repairing'],
            repairing: ['completed', 'parts_waiting'],
            completed: ['billed'],
            billed: ['closed'],
            closed: [],
        }
        return flow[current] || []
    }

    const Badge = ({ config }: { config: { label: string; color: string; bg: string } }) => (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700, color: config.color, background: config.bg,
            border: `1px solid ${config.color}40`,
        }}>
            {config.label}
        </span>
    )

    return (
        <div style={pageStyle}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>修理案件管理</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8', lineHeight: 1.6 }}>
                        修理受付から完了・請求まで、案件のライフサイクルを一元管理します。
                        <br />
                        <span style={{ color: '#2dd4bf' }}>
                            LINE WORKS の通知から案件画面を開き、
                            <strong style={{ color: '#5eead4' }}>「→ 担当者確認」</strong>
                            を選び、右上の
                            <strong style={{ color: '#5eead4' }}>「保存して閉じる」</strong>
                            で確定すると一覧が担当者確認になり、LINE WORKS に確認メッセージが届きます。
                        </span>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href="/machine-cards">
                        <button className="btn-3d" style={{ padding: '10px 16px', background: '#7c3aed', border: '1px solid #6d28d9' }}>
                            機械カルテ
                        </button>
                    </Link>
                    <Link href="/repair-dashboard">
                        <button className="btn-3d" style={{ padding: '10px 16px', background: '#0891b2', border: '1px solid #0e7490' }}>
                            故障分析
                        </button>
                    </Link>
                    <Link href="/selectors">
                        <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
                            ← メニューに戻る
                        </button>
                    </Link>
                </div>
            </div>

            {/* 担当者確認の見える化 */}
            <div
                style={{
                    ...panelStyle,
                    marginBottom: 16,
                    padding: '14px 16px',
                    borderColor: (statusCounts.received || 0) > 0 ? '#f59e0b' : '#334155',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 16,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>要確認（受付・未押下）</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#60a5fa' }}>
                            {statusCounts.received || 0}
                            <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 4 }}>件</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>担当者確認済</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#2dd4bf' }}>
                            {statusCounts.staff_confirmed || 0}
                            <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 4 }}>件</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn-3d"
                        onClick={() => setFilterStatus('needs_staff_ack')}
                        style={{
                            padding: '8px 14px',
                            fontSize: 13,
                            background: filterStatus === 'needs_staff_ack' ? '#1e3a5f' : '#334155',
                            border: `1px solid ${filterStatus === 'needs_staff_ack' ? '#60a5fa' : '#475569'}`,
                        }}
                    >
                        要確認のみ表示
                    </button>
                    <button
                        type="button"
                        className="btn-3d"
                        onClick={() => setFilterStatus('staff_confirmed')}
                        style={{
                            padding: '8px 14px',
                            fontSize: 13,
                            background: filterStatus === 'staff_confirmed' ? '#134e4a' : '#334155',
                            border: `1px solid ${filterStatus === 'staff_confirmed' ? '#2dd4bf' : '#475569'}`,
                        }}
                    >
                        担当者確認済のみ
                    </button>
                </div>
            </div>

            {/* Status summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <div
                        key={key}
                        onClick={() => setFilterStatus(key)}
                        style={{
                            ...panelStyle, padding: '12px 14px', cursor: 'pointer', textAlign: 'center',
                            borderColor: filterStatus === key ? cfg.color : '#334155',
                            transition: 'border-color 0.2s',
                        }}
                    >
                        <div style={{ fontSize: 24, fontWeight: 800, color: cfg.color }}>{statusCounts[key] || 0}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{cfg.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={labelStyle}>ステータス</label>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
                            <option value="active">対応中のみ</option>
                            <option value="needs_staff_ack">要確認（受付のみ）</option>
                            <option value="all">すべて</option>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>優先度</label>
                        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={inputStyle}>
                            <option value="">すべて</option>
                            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>営業所</label>
                        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={inputStyle}>
                            <option value="">すべて</option>
                            {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>キーワード検索</label>
                        <input type="text" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="顧客名・型式・受付番号" style={inputStyle} />
                    </div>
                </div>
            </div>

            {message && (
                <div style={{ ...panelStyle, marginBottom: 20, borderColor: '#475569', padding: '14px 16px', color: '#bfdbfe' }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 480px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
                {/* Form */}
                <section style={panelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc' }}>
                            {editingId ? '案件を編集' : '修理受付'}
                        </h2>
                        {editingId && (
                            <button onClick={resetForm} className="btn-3d" style={{ padding: '8px 12px', background: '#475569', border: '1px solid #64748b' }}>
                                新規入力に戻す
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                        <fieldset style={{ border: '1px solid #334155', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
                            <legend style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', padding: '0 6px' }}>受付情報</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <label style={labelStyle}>受付経路</label>
                                    <select value={formData.received_via} onChange={e => handleChange('received_via', e.target.value)} style={inputStyle}>
                                        {RECEIVED_VIA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>優先度</label>
                                    <select value={formData.priority} onChange={e => handleChange('priority', e.target.value)} style={inputStyle}>
                                        {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset style={{ border: '1px solid #334155', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
                            <legend style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', padding: '0 6px' }}>顧客情報</legend>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div>
                                    <label style={labelStyle}>顧客名 *</label>
                                    <input type="text" value={formData.customer_name} onChange={e => handleChange('customer_name', e.target.value)} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>住所</label>
                                    <input type="text" value={formData.customer_address} onChange={e => handleChange('customer_address', e.target.value)} style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>固定電話</label>
                                        <input type="text" value={formData.customer_phone} onChange={e => handleChange('customer_phone', e.target.value)} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>携帯電話</label>
                                        <input type="text" value={formData.customer_mobile} onChange={e => handleChange('customer_mobile', e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>地域</label>
                                    <input type="text" value={formData.customer_region} onChange={e => handleChange('customer_region', e.target.value)} placeholder="例: 宮崎県, 鹿児島県" style={inputStyle} />
                                </div>
                            </div>
                        </fieldset>

                        <fieldset style={{ border: '1px solid #334155', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
                            <legend style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', padding: '0 6px' }}>機械情報</legend>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>分野</label>
                                        <select
                                            value={formData.category || 'unknown'}
                                            onChange={e => handleChange('category', e.target.value)}
                                            style={inputStyle}
                                        >
                                            {SHEET_TYPE_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>型式</label>
                                        <input type="text" value={formData.model} onChange={e => handleChange('model', e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>本体番号（カルテ照合用）</label>
                                        <input type="text" value={formData.serial_no} onChange={e => handleChange('serial_no', e.target.value)} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>製造番号（銘板・任意）</label>
                                        <input type="text" value={formData.manufacturing_no} onChange={e => handleChange('manufacturing_no', e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>年式</label>
                                        <input type="text" value={formData.manufacturing_year} onChange={e => handleChange('manufacturing_year', e.target.value)} placeholder="例: 2015" style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>使用年数</label>
                                    <input type="number" step="0.5" value={formData.usage_years} onChange={e => handleChange('usage_years', e.target.value)} style={inputStyle} />
                                </div>
                                <div style={{ marginTop: 12, padding: 12, background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>顧客カルテとの紐づけ</div>
                                    <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                                        上記の「本体番号（カルテ照合用）」と顧客カルテの「本体番号」が同じ行を検索し、この修理案件に <code style={{ color: '#cbd5e1' }}>customer_register_id</code> を保存します。保存後にカルテの明細に修理が表示されます。
                                    </p>
                                    {formData.customer_register_id ? (
                                        <div style={{ fontSize: 12, color: '#86efac', marginBottom: 10 }}>
                                            紐づけ済み（保存で確定）… {formData.customer_register_id.slice(0, 8)}…
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>未紐づけ</div>
                                    )}
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button type="button" onClick={handleLookupChartBySerial} className="btn-3d" style={{ padding: '8px 14px', fontSize: 12, background: '#0e7490', border: '1px solid #0891b2' }}>
                                            本体番号でカルテを検索
                                        </button>
                                        {formData.customer_register_id ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleChange('customer_register_id', '')
                                                    setMessage('紐づけを解除しました（保存で反映）')
                                                }}
                                                className="btn-3d"
                                                style={{ padding: '8px 14px', fontSize: 12, background: '#475569', border: '1px solid #64748b' }}
                                            >
                                                紐づけを解除
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset style={{ border: '1px solid #334155', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
                            <legend style={{ fontSize: 13, fontWeight: 700, color: '#f87171', padding: '0 6px' }}>症状</legend>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div>
                                    <label style={labelStyle}>症状 *</label>
                                    <textarea value={formData.symptom} onChange={e => handleChange('symptom', e.target.value)} rows={3} style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>症状分類</label>
                                        <input type="text" value={formData.symptom_category} onChange={e => handleChange('symptom_category', e.target.value)} list="rr-symptom-list" style={inputStyle} />
                                        <datalist id="rr-symptom-list">
                                            {SYMPTOM_CATEGORIES.map(o => <option key={o} value={o} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>エラーコード</label>
                                        <input type="text" value={formData.error_code} onChange={e => handleChange('error_code', e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset style={{ border: '1px solid #334155', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
                            <legend style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', padding: '0 6px' }}>担当割当</legend>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>営業所</label>
                                        <select value={formData.assigned_branch} onChange={e => handleChange('assigned_branch', e.target.value)} style={inputStyle}>
                                            <option value="">未割当</option>
                                            {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>担当者</label>
                                        <input type="text" value={formData.assigned_staff} onChange={e => handleChange('assigned_staff', e.target.value)} list="rr-staff-list" style={inputStyle} />
                                        <datalist id="rr-staff-list">
                                            {staffOptionsForBranch.map(s => <option key={s.id} value={s.name} />)}
                                        </datalist>
                                        {formData.assigned_branch && (
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0 0' }}>
                                                部署が {getStaffDepartmentsForBranch(formData.assigned_branch).join('・')} の担当者を優先表示
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>出張予定日</label>
                                    <input type="date" value={formData.visit_scheduled_date} onChange={e => handleChange('visit_scheduled_date', e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                        </fieldset>

                        <div>
                            <label style={labelStyle}>備考</label>
                            <textarea value={formData.notes} onChange={e => handleChange('notes', e.target.value)} rows={2} style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={handleSave} disabled={saving} className="btn-3d btn-primary" style={{ padding: '10px 18px' }}>
                                {saving ? '保存中...' : editingId ? '更新する' : '受付登録'}
                            </button>
                            <button onClick={resetForm} className="btn-3d" style={{ padding: '10px 18px', background: '#475569', border: '1px solid #64748b' }}>
                                クリア
                            </button>
                        </div>
                    </div>
                </section>

                {/* List */}
                <section style={panelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc' }}>案件一覧</h2>
                            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>{filteredRows.length}件</p>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>No.</th>
                                    <th style={thStyle}>優先度</th>
                                    <th style={thStyle}>ステータス</th>
                                    <th style={thStyle}>受付日時</th>
                                    <th style={thStyle}>経路</th>
                                    <th style={thStyle}>顧客名</th>
                                    <th style={thStyle}>カテゴリ</th>
                                    <th style={thStyle}>型式</th>
                                    <th style={thStyle}>症状</th>
                                    <th style={thStyle}>担当者</th>
                                    <th style={thStyle}>出張予定</th>
                                    <th style={{ ...thStyle, textAlign: 'center', width: 200 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>読み込み中...</td></tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr><td colSpan={12} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>該当データがありません</td></tr>
                                ) : filteredRows.map(row => {
                                    const sc = STATUS_CONFIG[row.status] || STATUS_CONFIG.received
                                    const pc = PRIORITY_CONFIG[row.priority] || PRIORITY_CONFIG.normal
                                    const via = RECEIVED_VIA_OPTIONS.find(o => o.value === row.received_via)?.label || row.received_via
                                    const rowHighlight =
                                        row.status === 'received'
                                            ? { boxShadow: 'inset 4px 0 0 #f59e0b' }
                                            : row.status === 'staff_confirmed'
                                                ? { boxShadow: 'inset 4px 0 0 #2dd4bf' }
                                                : undefined
                                    return (
                                        <tr key={row.id} style={{ cursor: 'pointer', ...rowHighlight }} onClick={() => openDetail(row)}>
                                            <td style={tdStyle}>{row.request_no}</td>
                                            <td style={tdStyle}><Badge config={pc} /></td>
                                            <td style={tdStyle}><Badge config={sc} /></td>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11 }}>
                                                {new Date(row.received_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td style={tdStyle}>{via}</td>
                                            <td style={tdStyle}>{row.customer_name}</td>
                                            <td style={tdStyle}>{formatRepairCategoryDisplay(row.category)}</td>
                                            <td style={tdStyle}>{row.model || '-'}</td>
                                            <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.symptom}
                                            </td>
                                            <td style={tdStyle}>{row.assigned_staff || '-'}</td>
                                            <td style={tdStyle}>{row.visit_scheduled_date || '-'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => handleEdit(row)} className="btn-3d" style={{ padding: '4px 8px', marginRight: 4, fontSize: 11 }}>編集</button>
                                                <button onClick={() => handleDelete(row.id)} className="btn-3d" style={{ padding: '4px 8px', fontSize: 11, background: '#dc2626', border: '1px solid #b91c1c' }}>削除</button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Detail Modal */}
            {detailRequest && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                    onClick={e => {
                        if (e.target !== e.currentTarget) return
                        handleCloseDetailModal()
                    }}
                >
                    <div style={{ ...panelStyle, maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 28 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 24, color: '#f8fafc' }}>
                                    案件 #{detailRequest.request_no}
                                </h2>
                                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Badge config={PRIORITY_CONFIG[detailRequest.priority] || PRIORITY_CONFIG.normal} />
                                    <Badge config={STATUS_CONFIG[detailRequest.status] || STATUS_CONFIG.received} />
                                    {detailRequest.received_via === 'line' && (
                                        <span style={{
                                            display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                                            fontSize: 11, fontWeight: 700, color: '#06c755', background: '#0a2e1a',
                                            border: '1px solid #06c75540',
                                        }}>
                                            LINE受付
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleCloseDetailModal()
                                    }}
                                    className="btn-3d"
                                    style={{
                                        padding: '8px 14px', background: '#475569', border: '1px solid #64748b',
                                        cursor: 'pointer',
                                    }}
                                >
                                    保存して閉じる
                                </button>
                            </div>
                        </div>

                        {detailNotifyMessage && (
                            <div
                                style={{
                                    marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                                    background: detailNotifyMessage.includes('失敗') || detailNotifyMessage.includes('未登録')
                                        ? '#450a0a'
                                        : '#0a2e1a',
                                    border: `1px solid ${detailNotifyMessage.includes('失敗') || detailNotifyMessage.includes('未登録') ? '#f87171' : '#06c755'}`,
                                    color: detailNotifyMessage.includes('失敗') || detailNotifyMessage.includes('未登録') ? '#fecaca' : '#bbf7d0',
                                    fontSize: 13,
                                }}
                            >
                                {detailNotifyMessage}
                            </div>
                        )}

                        {/* Status transition */}
                        {getNextStatuses(detailRequest.status).length > 0 && (
                            <div style={{ marginBottom: 20, padding: '12px 14px', background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                                    次のステータスを選び、右上の「保存して閉じる」で確定します（通知ボタンはありません）。
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {getNextStatuses(detailRequest.status).map(ns => {
                                        const cfg = STATUS_CONFIG[ns]
                                        return (
                                            <button
                                                key={ns}
                                                type="button"
                                                onClick={() =>
                                                    setDetailRequest((prev) =>
                                                        prev ? { ...prev, status: ns } : null,
                                                    )
                                                }
                                                className="btn-3d"
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: 12,
                                                    background: cfg.bg,
                                                    border: `1px solid ${cfg.color}50`,
                                                    color: cfg.color,
                                                }}
                                            >
                                                → {cfg.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* Customer info */}
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#4ade80' }}>顧客情報</h3>
                                <p style={{ margin: '0 0 10px 0', fontSize: 11, color: '#94a3b8' }}>
                                    編集内容とステータスは「保存して閉じる」で保存されます。
                                </p>
                                <div style={{ display: 'grid', gap: 8 }}>
                                    <div>
                                        <label style={{ ...labelStyle, marginBottom: 4 }}>顧客名</label>
                                        <input
                                            type="text"
                                            value={detailRequest.customer_name}
                                            onChange={e => setDetailRequest(prev => prev ? { ...prev, customer_name: e.target.value } : null)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ ...labelStyle, marginBottom: 4 }}>住所</label>
                                        <input
                                            type="text"
                                            value={detailRequest.customer_address || ''}
                                            onChange={e => setDetailRequest(prev => prev ? { ...prev, customer_address: e.target.value || null } : null)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <div>
                                            <label style={{ ...labelStyle, marginBottom: 4 }}>固定電話</label>
                                            <input
                                                type="text"
                                                value={detailRequest.customer_phone || ''}
                                                onChange={e => setDetailRequest(prev => prev ? { ...prev, customer_phone: e.target.value || null } : null)}
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ ...labelStyle, marginBottom: 4 }}>携帯</label>
                                            <input
                                                type="text"
                                                value={detailRequest.customer_mobile || ''}
                                                onChange={e => setDetailRequest(prev => prev ? { ...prev, customer_mobile: e.target.value || null } : null)}
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ ...labelStyle, marginBottom: 4 }}>地域</label>
                                        <input
                                            type="text"
                                            value={detailRequest.customer_region || ''}
                                            onChange={e => setDetailRequest(prev => prev ? { ...prev, customer_region: e.target.value || null } : null)}
                                            placeholder="例: 宮崎県"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Machine info */}
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fbbf24' }}>機械情報</h3>
                                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                                    {detailRequest.assigned_branch && (
                                        <div>営業所: {getBranchName(detailRequest.assigned_branch)}</div>
                                    )}
                                    {detailRequest.assigned_staff ? (
                                        <div>担当者: {detailRequest.assigned_staff}</div>
                                    ) : (
                                        <div style={{ color: '#fbbf24' }}>担当者: 未設定（LIFFで選択されていない可能性）</div>
                                    )}
                                    {detailRequest.category && <div>分野: {formatRepairCategoryDisplay(detailRequest.category)}</div>}
                                    {detailRequest.model && <div>型式: {detailRequest.model}</div>}
                                    {detailRequest.serial_no && <div>本体番号: {detailRequest.serial_no}</div>}
                                    {detailRequest.manufacturing_no && <div>製造番号: {detailRequest.manufacturing_no}</div>}
                                    {!detailRequest.serial_no && !detailRequest.manufacturing_no && (
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>本体番号・製造番号: 未入力（下部「修理内容・完了報告」で現地入力可）</div>
                                    )}
                                    {detailRequest.manufacturing_year && <div>年式: {detailRequest.manufacturing_year}</div>}
                                    {detailRequest.usage_years != null && <div>使用年数: {detailRequest.usage_years}年</div>}
                                    {detailRequest.customer_register_id ? (
                                        <div style={{ marginTop: 8, fontSize: 12, color: '#86efac' }}>顧客カルテ: 紐づけ済み</div>
                                    ) : (
                                        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>顧客カルテ: 未紐づけ（一覧で編集から紐づけ可能）</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Symptom */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#f87171' }}>症状</h3>
                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detailRequest.symptom}</div>
                            {detailRequest.symptom_category && <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>分類: {detailRequest.symptom_category}</div>}
                            {detailRequest.error_code && <div style={{ fontSize: 12, color: '#94a3b8' }}>エラーコード: {detailRequest.error_code}</div>}
                        </div>

                        {lineWorksAcks.length > 0 && (
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                    <h3 style={{ margin: 0, fontSize: 14, color: '#38bdf8' }}>LINE WORKS 確認状況</h3>
                                    {detailRequest.status === 'received' &&
                                        lineWorksAcks.some((a) => a.status === 'acknowledged') && (
                                        <button
                                            type="button"
                                            className="btn-3d"
                                            onClick={() => handleApplyStaffConfirmedStatus()}
                                            style={{ padding: '6px 12px', fontSize: 12, background: '#0f766e', border: '1px solid #14b8a6' }}
                                        >
                                            担当者確認へ反映
                                        </button>
                                    )}
                                </div>
                                <div style={{ fontSize: 13 }}>
                                    {lineWorksAcks.map((a) => (
                                        <div
                                            key={a.staff_name}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                padding: '6px 0',
                                                borderBottom: '1px solid #334155',
                                            }}
                                        >
                                            <span>{a.staff_name}</span>
                                            <span style={{
                                                color: a.status === 'acknowledged' ? '#86efac' : a.status === 'failed' ? '#f87171' : '#fbbf24',
                                                fontSize: 12,
                                                textAlign: 'right',
                                            }}>
                                                {a.status === 'acknowledged'
                                                    ? `確認済 ${a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString('ja-JP') : ''}`
                                                    : a.status === 'failed'
                                                        ? '送信失敗'
                                                        : '未確認'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {detailRequest.photo_urls.length > 0 && (
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#a78bfa' }}>添付写真 ({detailRequest.photo_urls.length}枚)</h3>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                    gap: 10,
                                }}>
                                    {detailRequest.photo_urls.map((url, i) => (
                                        <a
                                            key={`${url}-${i}`}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid #334155' }}
                                        >
                                            <img
                                                src={url}
                                                alt={`添付写真 ${i + 1}`}
                                                style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', background: '#0f172a' }}
                                            />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI Search (Dify) */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #10b98150', marginTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h3 style={{ margin: 0, fontSize: 14, color: '#10b981' }}>AI検索（修理ナレッジ）</h3>
                                <button
                                    onClick={handleAiSearch}
                                    disabled={aiSearching}
                                    className="btn-3d"
                                    style={{
                                        padding: '6px 16px', fontSize: 12,
                                        background: aiSearching ? '#374151' : '#059669',
                                        border: `1px solid ${aiSearching ? '#4b5563' : '#047857'}`,
                                        opacity: aiSearching ? 0.7 : 1,
                                    }}
                                >
                                    {aiSearching ? '検索中...' : '症状をAIで検索'}
                                </button>
                            </div>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px 0' }}>
                                機械の分野と症状（分類のみの案件も可）から、過去事例・マニュアルをAI検索します。
                            </p>
                            {aiAnswer && (
                                <div style={{
                                    background: '#0f172a', borderRadius: 8, padding: 14,
                                    border: '1px solid #334155', fontSize: 13, color: '#e2e8f0',
                                    whiteSpace: 'pre-wrap', lineHeight: 1.7, maxHeight: 400, overflowY: 'auto',
                                }}>
                                    {aiAnswer}
                                </div>
                            )}
                        </div>

                        {/* Repair completion form */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#38bdf8' }}>修理内容・完了報告</h3>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ padding: 10, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>現地で判明した番号（電話・LINE受付時は未入力のことがあります）</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div>
                                            <label style={labelStyle}>本体番号</label>
                                            <input
                                                type="text"
                                                value={completionData.body_serial_no}
                                                onChange={e => setCompletionData(p => ({ ...p, body_serial_no: e.target.value }))}
                                                placeholder="銘板・現地で確認した本体番号"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>製造番号</label>
                                            <input
                                                type="text"
                                                value={completionData.manufacturing_no}
                                                onChange={e => setCompletionData(p => ({ ...p, manufacturing_no: e.target.value }))}
                                                placeholder="銘板の製造番号"
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>処置内容</label>
                                    <textarea value={completionData.treatment_details} onChange={e => setCompletionData(p => ({ ...p, treatment_details: e.target.value }))} rows={3} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>原因</label>
                                    <input type="text" value={completionData.root_cause} onChange={e => setCompletionData(p => ({ ...p, root_cause: e.target.value }))} style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>修理時間（分）</label>
                                        <input type="number" value={completionData.repair_duration_minutes} onChange={e => setCompletionData(p => ({ ...p, repair_duration_minutes: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>修理費用（円）</label>
                                        <input type="number" value={completionData.repair_cost} onChange={e => setCompletionData(p => ({ ...p, repair_cost: e.target.value }))} style={inputStyle} />
                                    </div>
                                </div>
                                <button onClick={handleSaveCompletion} className="btn-3d btn-primary" style={{ padding: '8px 14px', width: 'fit-content' }}>
                                    修理内容を保存
                                </button>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0 0', lineHeight: 1.55 }}>
                                    「保存して閉じる」・画面外クリック・Esc でも処置内容・原因・時間・費用は保存されます（完了日は付きません）。
                                    現場完了として本日の完了日を記録する場合は上のボタンを押してください。
                                </p>
                            </div>
                        </div>

                        {/* Parts */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fb923c' }}>交換部品</h3>
                            {detailParts.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>部品名</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>部品コード</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>数量</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>単価</th>
                                            <th style={{ ...thStyle, background: '#0f172a', width: 40 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detailParts.map(p => (
                                            <tr key={p.id}>
                                                <td style={tdStyle}>{p.part_name}</td>
                                                <td style={tdStyle}>{p.part_code || '-'}</td>
                                                <td style={tdStyle}>{p.quantity}</td>
                                                <td style={tdStyle}>{p.unit_price != null ? `¥${p.unit_price.toLocaleString()}` : '-'}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <button onClick={() => handleDeletePart(p.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px 1fr auto', gap: 8, alignItems: 'end' }}>
                                <div style={{ position: 'relative' }}>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>部品名（商品マスタ検索）</label>
                                    <input
                                        type="text"
                                        value={newPart.part_name}
                                        onChange={e => handlePartNameChange(e.target.value)}
                                        onFocus={() => { if (partSuggestions.length > 0) setShowPartSuggestions(true) }}
                                        onBlur={() => setTimeout(() => setShowPartSuggestions(false), 200)}
                                        placeholder="部品名を入力で検索"
                                        style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}
                                    />
                                    {showPartSuggestions && partSuggestions.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                                            background: '#1e293b', border: '1px solid #475569', borderRadius: 8,
                                            maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                        }}>
                                            {partSuggestions.map(p => (
                                                <div
                                                    key={p.id}
                                                    onMouseDown={() => handleSelectProduct(p)}
                                                    style={{
                                                        padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                                                        borderBottom: '1px solid #334155', color: '#e2e8f0',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                        コード: {p.id}
                                                        {p.retail_price != null ? ` / ¥${p.retail_price.toLocaleString()}` : p.cost_price != null ? ` / 原価¥${p.cost_price.toLocaleString()}` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>コード</label>
                                    <input type="text" value={newPart.part_code} onChange={e => setNewPart(p => ({ ...p, part_code: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} readOnly />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>数量</label>
                                    <input type="number" value={newPart.quantity} onChange={e => setNewPart(p => ({ ...p, quantity: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>単価</label>
                                    <input type="number" value={newPart.unit_price} onChange={e => setNewPart(p => ({ ...p, unit_price: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <button
                                    type="button"
                                    onClick={e => { e.preventDefault(); e.stopPropagation(); handleAddPart() }}
                                    className="btn-3d btn-primary"
                                    style={{ padding: '6px 12px', fontSize: 12, marginBottom: 1 }}
                                >
                                    追加
                                </button>
                            </div>
                        </div>

                        {/* Past repairs for same machine */}
                        {pastRepairs.length > 0 && (
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #7c3aed50', marginTop: 16 }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#a78bfa' }}>
                                    同一機械の過去修理履歴（{pastRepairs.length}件）
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>日付</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>症状</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>処置</th>
                                            <th style={{ ...thStyle, background: '#0f172a' }}>担当</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pastRepairs.map(pr => (
                                            <tr key={pr.id}>
                                                <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11 }}>
                                                    {new Date(pr.received_at).toLocaleDateString('ja-JP')}
                                                </td>
                                                <td style={{ ...tdStyle, fontSize: 11 }}>{pr.symptom}</td>
                                                <td style={{ ...tdStyle, fontSize: 11 }}>{pr.treatment_details || '-'}</td>
                                                <td style={{ ...tdStyle, fontSize: 11 }}>{pr.assigned_staff || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {pastRepairs.length >= 5 && (
                                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#4a1515', borderRadius: 8, border: '1px solid #ef444440', color: '#fca5a5', fontSize: 12 }}>
                                        この機械は修理回数が{pastRepairs.length}回に達しています。更新提案を検討してください。
                                    </div>
                                )}
                            </div>
                        )}

                        {detailRequest.notes && (
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#94a3b8' }}>備考</h3>
                                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{detailRequest.notes}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 顧客カルテ複数候補 */}
            {chartLinkCandidates && chartLinkCandidates.length > 0 && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ ...panelStyle, maxWidth: 520, width: '100%', padding: 24 }}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#f8fafc' }}>顧客カルテを選択</h2>
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>製造番号が一致する行が複数あります。1件を選んでください。</p>
                        <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
                            {chartLinkCandidates.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                        handleChange('customer_register_id', c.id)
                                        setChartLinkCandidates(null)
                                        setMessage('顧客カルテを選択しました（保存で反映）')
                                    }}
                                    className="btn-3d"
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left', marginBottom: 8,
                                        padding: 12, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0',
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>{c.customer_name?.trim() || '（氏名なし）'}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                        本体番号: {c.serial_no || '—'} / TEL: {c.phone || '—'}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button type="button" className="btn-3d" style={{ padding: '8px 16px', background: '#475569' }} onClick={() => setChartLinkCandidates(null)}>
                            キャンセル
                        </button>
                    </div>
                </div>
            )}

            {/* Customer Sync Dialog */}
            {customerSyncDialog && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ ...panelStyle, maxWidth: 560, width: '100%', padding: 28 }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: 20, color: '#f8fafc' }}>
                            {customerSyncDialog.mode === 'new' ? '顧客情報の新規登録' : '同名の顧客が見つかりました'}
                        </h2>

                        {customerSyncDialog.mode === 'new' ? (
                            <>
                                <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 12px 0' }}>
                                    以下の顧客情報を顧客登録情報に追加しますか？
                                </p>
                                <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginBottom: 16, fontSize: 13, lineHeight: 1.8, color: '#e2e8f0' }}>
                                    <div><strong>顧客名:</strong> {String(customerSyncDialog.customerData.customer_name || '')}</div>
                                    {customerSyncDialog.customerData.address ? <div><strong>住所:</strong> {String(customerSyncDialog.customerData.address)}</div> : null}
                                    {customerSyncDialog.customerData.phone ? <div><strong>電話:</strong> {String(customerSyncDialog.customerData.phone)}</div> : null}
                                    {customerSyncDialog.customerData.mobile ? <div><strong>携帯:</strong> {String(customerSyncDialog.customerData.mobile)}</div> : null}
                                    {customerSyncDialog.customerData.model ? <div><strong>型式:</strong> {String(customerSyncDialog.customerData.model)}</div> : null}
                                    {customerSyncDialog.customerData.serial_no ? <div><strong>製造番号:</strong> {String(customerSyncDialog.customerData.serial_no)}</div> : null}
                                    {customerSyncDialog.customerData.sheet_type ? (
                                        <div><strong>分野:</strong> {getSheetTypeLabel(String(customerSyncDialog.customerData.sheet_type))}</div>
                                    ) : null}
                                    {customerSyncDialog.customerData.dealer_name ? (
                                        <div><strong>販売店（経路）:</strong> {String(customerSyncDialog.customerData.dealer_name)}</div>
                                    ) : null}
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={handleCustomerSyncCancel} className="btn-3d" style={{ padding: '10px 20px', background: '#475569', border: '1px solid #64748b' }}>
                                        登録しない
                                    </button>
                                    <button onClick={() => handleCustomerSyncConfirm('insert')} className="btn-3d btn-primary" style={{ padding: '10px 20px' }}>
                                        新規登録する
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 12px 0' }}>
                                    「{String(customerSyncDialog.customerData.customer_name)}」と同名の顧客が{customerSyncDialog.existingCustomers.length}件あります。<br />
                                    既存の情報を更新するか、新規に登録するか選択してください。
                                </p>

                                <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
                                    {customerSyncDialog.existingCustomers.map(c => (
                                        <div key={c.id} style={{
                                            background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155',
                                            marginBottom: 8, fontSize: 13, color: '#e2e8f0', lineHeight: 1.6,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                                                <div>
                                                    <div><strong>{c.customer_name}</strong></div>
                                                    {c.address && <div style={{ color: '#94a3b8', fontSize: 12 }}>住所: {c.address}</div>}
                                                    {c.phone && <div style={{ color: '#94a3b8', fontSize: 12 }}>TEL: {c.phone}</div>}
                                                    {c.mobile && <div style={{ color: '#94a3b8', fontSize: 12 }}>携帯: {c.mobile}</div>}
                                                    {c.model && <div style={{ color: '#94a3b8', fontSize: 12 }}>型式: {c.model}</div>}
                                                    {c.serial_no && <div style={{ color: '#94a3b8', fontSize: 12 }}>製造番号: {c.serial_no}</div>}
                                                </div>
                                                <button
                                                    onClick={() => handleCustomerSyncConfirm('update', c.id)}
                                                    className="btn-3d"
                                                    style={{ padding: '6px 14px', fontSize: 12, background: '#0891b2', border: '1px solid #0e7490', whiteSpace: 'nowrap', flexShrink: 0 }}
                                                >
                                                    この顧客を更新
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button onClick={handleCustomerSyncCancel} className="btn-3d" style={{ padding: '10px 20px', background: '#475569', border: '1px solid #64748b' }}>
                                        登録しない
                                    </button>
                                    <button onClick={() => handleCustomerSyncConfirm('insert')} className="btn-3d" style={{ padding: '10px 20px', background: '#16a34a', border: '1px solid #15803d' }}>
                                        別の顧客として新規登録
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
