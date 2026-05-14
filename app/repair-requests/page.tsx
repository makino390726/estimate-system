'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

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
    created_at: string
    updated_at: string
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

type StaffOption = { id: string; name: string }

// ── Constants ──

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    received:        { label: '受付',       color: '#60a5fa', bg: '#1e3a5f' },
    confirming:      { label: '確認中',     color: '#fbbf24', bg: '#4a3728' },
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

const CATEGORY_OPTIONS = ['たばこ乾燥機', 'ハウス暖房機', '光合成促進装置', '冷蔵庫', '食品乾燥機', 'その他']

const BRANCHES = [
    { id: 'branch_1', name: '南九州営業所' },
    { id: 'branch_2', name: '中九州営業所' },
    { id: 'branch_3', name: '西九州営業所' },
    { id: 'branch_4', name: '東日本営業所' },
    { id: 'branch_5', name: '沖縄出張所' },
    { id: 'branch_6', name: '東北出張所' },
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
    })

    // Parts form
    const [newPart, setNewPart] = useState({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })

    // Customer sync dialog
    const [customerSyncDialog, setCustomerSyncDialog] = useState<{
        mode: 'new' | 'exists'
        customerData: Record<string, unknown>
        existingCustomers: { id: string; customer_name: string; address: string | null; phone: string | null; mobile: string | null; model: string | null; serial_no: string | null }[]
    } | null>(null)

    const fetchStaffs = useCallback(async () => {
        const { data } = await supabase.from('staffs').select('id, name').order('name')
        setStaffs((data || []).map(s => ({ id: String(s.id), name: s.name || '' })))
    }, [])

    const fetchRequests = useCallback(async () => {
        setLoading(true)
        try {
            let query = supabase.from('repair_requests').select('*').order('received_at', { ascending: false })

            if (filterStatus === 'active') {
                query = query.not('status', 'in', '("completed","billed","closed")')
            } else if (filterStatus && filterStatus !== 'all') {
                query = query.eq('status', filterStatus)
            }
            if (filterPriority) query = query.eq('priority', filterPriority)
            if (filterBranch) query = query.eq('assigned_branch', filterBranch)

            const { data, error } = await query
            if (error) throw error
            setRows((data || []) as RepairRequest[])
        } catch (e: any) {
            console.error(e)
            setMessage(`一覧取得に失敗しました: ${e.message}`)
        } finally {
            setLoading(false)
        }
    }, [filterStatus, filterPriority, filterBranch])

    useEffect(() => { fetchStaffs() }, [fetchStaffs])
    useEffect(() => { fetchRequests() }, [fetchRequests])

    const filteredRows = useMemo(() => {
        const kw = searchKeyword.trim().toLowerCase()
        if (!kw) return rows
        return rows.filter(r => {
            const vals = [
                r.customer_name, r.customer_address || '', r.category || '', r.model || '',
                r.serial_no || '', r.symptom, r.assigned_staff || '',
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

    const resetForm = () => {
        setEditingId(null)
        setFormData(createInitialForm())
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
            category: toNullable(formData.category),
            machine_type: toNullable(formData.machine_type),
            model: toNullable(formData.model),
            serial_no: toNullable(formData.serial_no),
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
        }

        try {
            if (editingId) {
                const { error } = await supabase.from('repair_requests').update(payload).eq('id', editingId)
                if (error) throw error
                setMessage('修理案件を更新しました')
            } else {
                payload.status = 'received'
                const { error } = await supabase.from('repair_requests').insert(payload)
                if (error) throw error
                setMessage('修理案件を登録しました')
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

            const customerPayload: Record<string, unknown> = {
                customer_name: name,
                address: toNullable(fd.customer_address),
                phone: toNullable(fd.customer_phone),
                mobile: toNullable(fd.customer_mobile),
                model: toNullable(fd.model),
                serial_no: toNullable(fd.serial_no),
                sheet_name: '修理受付登録',
                sheet_type: fd.category || 'unknown',
                staff_name: toNullable(fd.assigned_staff),
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
                delete updateData.sheet_name
                delete updateData.sheet_type
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

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase.from('repair_requests').update({ status: newStatus }).eq('id', id)
            if (error) throw error

            await supabase.from('repair_status_history').insert({
                repair_request_id: id,
                old_status: rows.find(r => r.id === id)?.status,
                new_status: newStatus,
            })

            // LINE顧客に自動通知（LINE経由の受付のみ）
            const row = rows.find(r => r.id === id)
            if (row?.received_via === 'line') {
                fetch('/api/line/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'status_change', repair_request_id: id }),
                }).catch(() => {})
            }

            await fetchRequests()
            if (detailRequest?.id === id) {
                setDetailRequest(prev => prev ? { ...prev, status: newStatus } : null)
            }
        } catch (e: any) {
            setMessage(`ステータス変更に失敗しました: ${e.message}`)
        }
    }

    const handleLineNotifyStaff = async (repairId: string, staffName: string) => {
        try {
            const res = await fetch('/api/line/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'new_repair', repair_request_id: repairId, staff_name: staffName }),
            })
            const data = await res.json()
            if (res.ok) {
                setMessage(`${staffName} にLINE通知を送信しました`)
            } else {
                setMessage(`LINE通知失敗: ${data.error || '不明なエラー'}`)
            }
        } catch (e: any) {
            setMessage(`LINE通知送信に失敗しました: ${e.message}`)
        }
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
            category: row.category || '',
            machine_type: row.machine_type || '',
            model: row.model || '',
            serial_no: row.serial_no || '',
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
        setDetailRequest(row)
        setCompletionData({
            treatment_details: row.treatment_details || '',
            root_cause: row.root_cause || '',
            repair_duration_minutes: row.repair_duration_minutes ? String(row.repair_duration_minutes) : '',
            repair_cost: row.repair_cost ? String(row.repair_cost) : '',
        })

        const { data: parts } = await supabase
            .from('repair_parts')
            .select('*')
            .eq('repair_request_id', row.id)
            .order('created_at')
        setDetailParts((parts || []) as RepairPart[])

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

    const handleSaveCompletion = async () => {
        if (!detailRequest) return
        try {
            const { error } = await supabase.from('repair_requests').update({
                treatment_details: toNullable(completionData.treatment_details),
                root_cause: toNullable(completionData.root_cause),
                repair_duration_minutes: completionData.repair_duration_minutes ? Number(completionData.repair_duration_minutes) : null,
                repair_cost: completionData.repair_cost ? Number(completionData.repair_cost) : null,
                visit_completed_date: new Date().toISOString().split('T')[0],
            }).eq('id', detailRequest.id)
            if (error) throw error
            setMessage('修理内容を保存しました')
            await fetchRequests()
            setDetailRequest(prev => prev ? {
                ...prev,
                treatment_details: completionData.treatment_details || null,
                root_cause: completionData.root_cause || null,
                repair_duration_minutes: completionData.repair_duration_minutes ? Number(completionData.repair_duration_minutes) : null,
                repair_cost: completionData.repair_cost ? Number(completionData.repair_cost) : null,
            } : null)
        } catch (e: any) {
            setMessage(`保存に失敗しました: ${e.message}`)
        }
    }

    const handleAddPart = async () => {
        if (!detailRequest || !newPart.part_name.trim()) return
        try {
            const { error } = await supabase.from('repair_parts').insert({
                repair_request_id: detailRequest.id,
                part_name: newPart.part_name.trim(),
                part_code: toNullable(newPart.part_code),
                quantity: Number(newPart.quantity) || 1,
                unit_price: newPart.unit_price ? Number(newPart.unit_price) : null,
                notes: toNullable(newPart.notes),
            })
            if (error) throw error
            setNewPart({ part_name: '', part_code: '', quantity: '1', unit_price: '', notes: '' })
            const { data: parts } = await supabase.from('repair_parts').select('*').eq('repair_request_id', detailRequest.id).order('created_at')
            setDetailParts((parts || []) as RepairPart[])
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
            received: ['confirming', 'phone_done', 'visit_scheduled'],
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
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
                        修理受付から完了・請求まで、案件のライフサイクルを一元管理します。
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
                                        <input type="text" value={formData.category} onChange={e => handleChange('category', e.target.value)} list="rr-category-list" style={inputStyle} />
                                        <datalist id="rr-category-list">
                                            {CATEGORY_OPTIONS.map(o => <option key={o} value={o} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>型式</label>
                                        <input type="text" value={formData.model} onChange={e => handleChange('model', e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>製造番号</label>
                                        <input type="text" value={formData.serial_no} onChange={e => handleChange('serial_no', e.target.value)} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>年式</label>
                                        <input type="text" value={formData.manufacturing_year} onChange={e => handleChange('manufacturing_year', e.target.value)} placeholder="例: 2015" style={inputStyle} />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>使用年数</label>
                                    <input type="number" step="0.5" value={formData.usage_years} onChange={e => handleChange('usage_years', e.target.value)} style={inputStyle} />
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
                                            {staffs.map(s => <option key={s.id} value={s.name} />)}
                                        </datalist>
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
                                    return (
                                        <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(row)}>
                                            <td style={tdStyle}>{row.request_no}</td>
                                            <td style={tdStyle}><Badge config={pc} /></td>
                                            <td style={tdStyle}><Badge config={sc} /></td>
                                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11 }}>
                                                {new Date(row.received_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td style={tdStyle}>{via}</td>
                                            <td style={tdStyle}>{row.customer_name}</td>
                                            <td style={tdStyle}>{row.category || '-'}</td>
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
                    onClick={() => setDetailRequest(null)}
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
                            <div style={{ display: 'flex', gap: 8 }}>
                                {detailRequest.assigned_staff && (
                                    <button
                                        onClick={() => handleLineNotifyStaff(detailRequest.id, detailRequest.assigned_staff!)}
                                        className="btn-3d"
                                        style={{ padding: '8px 14px', background: '#06c755', border: '1px solid #05a847', fontSize: 12 }}
                                    >
                                        LINE通知
                                    </button>
                                )}
                                <button onClick={() => setDetailRequest(null)} className="btn-3d" style={{ padding: '8px 14px', background: '#475569', border: '1px solid #64748b' }}>
                                    閉じる
                                </button>
                            </div>
                        </div>

                        {/* Status transition */}
                        {getNextStatuses(detailRequest.status).length > 0 && (
                            <div style={{ marginBottom: 20, padding: '12px 14px', background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>ステータスを変更:</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {getNextStatuses(detailRequest.status).map(ns => {
                                        const cfg = STATUS_CONFIG[ns]
                                        return (
                                            <button key={ns} onClick={() => handleStatusChange(detailRequest.id, ns)}
                                                className="btn-3d" style={{ padding: '6px 14px', fontSize: 12, background: cfg.bg, border: `1px solid ${cfg.color}50`, color: cfg.color }}>
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
                                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                                    <div><strong>{detailRequest.customer_name}</strong></div>
                                    {detailRequest.customer_address && <div>{detailRequest.customer_address}</div>}
                                    {detailRequest.customer_phone && <div>TEL: {detailRequest.customer_phone}</div>}
                                    {detailRequest.customer_mobile && <div>携帯: {detailRequest.customer_mobile}</div>}
                                    {detailRequest.customer_region && <div>地域: {detailRequest.customer_region}</div>}
                                </div>
                            </div>

                            {/* Machine info */}
                            <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fbbf24' }}>機械情報</h3>
                                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                                    {detailRequest.category && <div>分野: {detailRequest.category}</div>}
                                    {detailRequest.model && <div>型式: {detailRequest.model}</div>}
                                    {detailRequest.serial_no && <div>製造番号: {detailRequest.serial_no}</div>}
                                    {detailRequest.manufacturing_year && <div>年式: {detailRequest.manufacturing_year}</div>}
                                    {detailRequest.usage_years != null && <div>使用年数: {detailRequest.usage_years}年</div>}
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

                        {/* Repair completion form */}
                        <div style={{ background: '#1e293b', borderRadius: 10, padding: 14, border: '1px solid #334155', marginTop: 16 }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#38bdf8' }}>修理内容・完了報告</h3>
                            <div style={{ display: 'grid', gap: 10 }}>
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
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>部品名</label>
                                    <input type="text" value={newPart.part_name} onChange={e => setNewPart(p => ({ ...p, part_name: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>コード</label>
                                    <input type="text" value={newPart.part_code} onChange={e => setNewPart(p => ({ ...p, part_code: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>数量</label>
                                    <input type="number" value={newPart.quantity} onChange={e => setNewPart(p => ({ ...p, quantity: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <div>
                                    <label style={{ ...labelStyle, fontSize: 11 }}>単価</label>
                                    <input type="number" value={newPart.unit_price} onChange={e => setNewPart(p => ({ ...p, unit_price: e.target.value }))} style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
                                </div>
                                <button onClick={handleAddPart} className="btn-3d btn-primary" style={{ padding: '6px 12px', fontSize: 12, marginBottom: 1 }}>追加</button>
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
