'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ServiceRepairReport = {
    id: string
    branch_id: string
    work_date: string
    customer_name: string
    address: string | null
    phone: string | null
    mobile: string | null
    staff_name: string | null
    category: string | null
    model: string | null
    treatment_details: string | null
    remarks: string | null
    created_at?: string
    updated_at?: string
}

type StaffOption = {
    id: string
    name: string
}

type FormState = {
    branch_id: string
    work_date: string
    customer_name: string
    address: string
    phone: string
    mobile: string
    staff_name: string
    category: string
    model: string
    treatment_details: string
    remarks: string
}

type ImportableRepairRow = {
    branch_id: string
    work_date: string
    customer_name: string
    address: string | null
    phone: string | null
    mobile: string | null
    staff_name: string | null
    category: string | null
    model: string | null
    treatment_details: string | null
    remarks: string | null
}

const BRANCHES = [
    { id: 'branch_1', name: '南九州営業所' },
    { id: 'branch_2', name: '中九州営業所' },
    { id: 'branch_3', name: '西九州営業所' },
    { id: 'branch_4', name: '東日本営業所' },
    { id: 'branch_5', name: '沖縄出張所' },
    { id: 'branch_6', name: '東北出張所' },
]

const CATEGORY_OPTIONS = ['食品乾燥機', '暖房機', 'その他']

const HEADER_ALIASES = {
    work_date: ['作業日', '作業日付', '日付'],
    customer_name: ['お客様氏名', 'お客様名', '顧客名', '顧客名義'],
    address: ['住所'],
    phone: ['固定電話', '電話番号', '電話'],
    mobile: ['携帯電話', '携帯'],
    staff_name: ['担当者', '担当'],
    category: ['分野'],
    model: ['型式', '型番'],
    treatment_details: ['処置内容', '修理内容', '作業内容', '内容'],
    remarks: ['備考', 'メモ'],
} as const

const pageStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 1600,
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

const today = () => new Date().toISOString().split('T')[0]

const createInitialFormState = (branchId: string): FormState => ({
    branch_id: branchId,
    work_date: today(),
    customer_name: '',
    address: '',
    phone: '',
    mobile: '',
    staff_name: '',
    category: '',
    model: '',
    treatment_details: '',
    remarks: '',
})

const toNullable = (value: string) => {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

const normalizeHeader = (value: unknown) => String(value || '').replace(/[\s　]/g, '').trim().toLowerCase()

const normalizeDateValue = (value: unknown): string | null => {
    if (value == null) {
        return null
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const utc = Math.round((value - 25569) * 86400 * 1000)
        const date = new Date(utc)
        if (Number.isNaN(date.getTime())) {
            return null
        }
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }

    const text = String(value).trim()
    if (!text) {
        return null
    }

    const slash = text.match(/^(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/)
    if (slash) {
        let year = Number(slash[1])
        const month = Number(slash[2])
        const day = Number(slash[3])
        if (year < 100) {
            year += 2000
        }
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
    }

    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) {
        return null
    }
    return parsed.toISOString().split('T')[0]
}

const detectBranchIdFromSheetName = (sheetName: string): string | null => {
    const name = sheetName.replace(/\s/g, '')
    const hasEast = name.includes('東日本')
    const hasTohoku = name.includes('東北')
    if (hasEast && hasTohoku) {
        return null
    }
    if (name.includes('南九州')) return 'branch_1'
    if (name.includes('中九州')) return 'branch_2'
    if (name.includes('西九州')) return 'branch_3'
    if (hasEast) return 'branch_4'
    if (name.includes('沖縄')) return 'branch_5'
    if (hasTohoku) return 'branch_6'
    return null
}

const findHeaderRowIndex = (matrix: unknown[][]) => {
    const requiredDate = HEADER_ALIASES.work_date.map(normalizeHeader)
    const requiredCustomer = HEADER_ALIASES.customer_name.map(normalizeHeader)

    for (let i = 0; i < Math.min(matrix.length, 20); i += 1) {
        const row = matrix[i] || []
        const normalized = row.map(normalizeHeader)
        const hasDate = normalized.some((value) => requiredDate.includes(value))
        const hasCustomer = normalized.some((value) => requiredCustomer.includes(value))
        if (hasDate && hasCustomer) {
            return i
        }
    }

    return -1
}

const pickCell = (record: Record<string, unknown>, aliases: readonly string[]) => {
    for (const alias of aliases) {
        const value = record[alias]
        if (value != null && String(value).trim() !== '') {
            return value
        }
    }
    return ''
}

const chunk = <T,>(items: T[], size: number) => {
    const result: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size))
    }
    return result
}

export default function ServiceRepairReportsPage() {
    const [rows, setRows] = useState<ServiceRepairReport[]>([])
    const [staffs, setStaffs] = useState<StaffOption[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState(BRANCHES[0].id)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [formData, setFormData] = useState<FormState>(() => createInitialFormState(BRANCHES[0].id))
    const [editingId, setEditingId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [importing, setImporting] = useState(false)
    const [importFile, setImportFile] = useState<File | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        fetchStaffs()
    }, [])

    useEffect(() => {
        fetchReports()
    }, [selectedBranchId, startDate, endDate])

    const fetchStaffs = async () => {
        const { data, error } = await supabase
            .from('staffs')
            .select('id, name')
            .order('name')

        if (error) {
            console.error('担当者取得エラー:', error)
            return
        }

        setStaffs((data || []).map((staff) => ({ id: String(staff.id), name: staff.name || '' })))
    }

    const fetchReports = async () => {
        setLoading(true)

        try {
            let query = supabase
                .from('service_repair_reports')
                .select('*')
                .eq('branch_id', selectedBranchId)
                .order('work_date', { ascending: false })
                .order('created_at', { ascending: false })

            if (startDate) {
                query = query.gte('work_date', startDate)
            }

            if (endDate) {
                query = query.lte('work_date', endDate)
            }

            const { data, error } = await query

            if (error) {
                throw error
            }

            setRows((data || []) as ServiceRepairReport[])
        } catch (error: any) {
            console.error('出張修理管理表取得エラー:', error)
            setMessage(`一覧取得に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        } finally {
            setLoading(false)
        }
    }

    const filteredRows = useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase()
        if (!keyword) {
            return rows
        }

        return rows.filter((row) => {
            const values = [
                row.customer_name,
                row.address || '',
                row.phone || '',
                row.mobile || '',
                row.staff_name || '',
                row.category || '',
                row.model || '',
                row.treatment_details || '',
                row.remarks || '',
            ]
            return values.some((value) => value.toLowerCase().includes(keyword))
        })
    }, [rows, searchKeyword])

    const resetForm = (branchId = selectedBranchId) => {
        setEditingId(null)
        setFormData(createInitialFormState(branchId))
    }

    const handleBranchSelect = (branchId: string) => {
        setSelectedBranchId(branchId)
        setMessage(null)
        setSearchKeyword('')
        resetForm(branchId)
    }

    const handleChange = (field: keyof FormState, value: string) => {
        setFormData((current) => ({ ...current, [field]: value }))
    }

    const handleEdit = (row: ServiceRepairReport) => {
        setEditingId(row.id)
        setFormData({
            branch_id: row.branch_id,
            work_date: row.work_date,
            customer_name: row.customer_name,
            address: row.address || '',
            phone: row.phone || '',
            mobile: row.mobile || '',
            staff_name: row.staff_name || '',
            category: row.category || '',
            model: row.model || '',
            treatment_details: row.treatment_details || '',
            remarks: row.remarks || '',
        })
        setSelectedBranchId(row.branch_id)
        setMessage(`「${row.customer_name}」を編集中です`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleSave = async () => {
        if (!formData.work_date) {
            setMessage('作業日を入力してください')
            return
        }

        if (!formData.customer_name.trim()) {
            setMessage('お客様氏名を入力してください')
            return
        }

        setSaving(true)
        setMessage(null)

        const payload = {
            branch_id: formData.branch_id,
            work_date: formData.work_date,
            customer_name: formData.customer_name.trim(),
            address: toNullable(formData.address),
            phone: toNullable(formData.phone),
            mobile: toNullable(formData.mobile),
            staff_name: toNullable(formData.staff_name),
            category: toNullable(formData.category),
            model: toNullable(formData.model),
            treatment_details: toNullable(formData.treatment_details),
            remarks: toNullable(formData.remarks),
            updated_at: new Date().toISOString(),
        }

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('service_repair_reports')
                    .update(payload)
                    .eq('id', editingId)

                if (error) {
                    throw error
                }

                setMessage('出張修理管理表を更新しました')
            } else {
                const { error } = await supabase
                    .from('service_repair_reports')
                    .insert(payload)

                if (error) {
                    throw error
                }

                setMessage('出張修理管理表を登録しました')
            }

            resetForm(formData.branch_id)
            await fetchReports()
        } catch (error: any) {
            console.error('出張修理管理表保存エラー:', error)
            setMessage(`保存に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('この行を削除してもよろしいですか？')) {
            return
        }

        try {
            const { error } = await supabase
                .from('service_repair_reports')
                .delete()
                .eq('id', id)

            if (error) {
                throw error
            }

            if (editingId === id) {
                resetForm(selectedBranchId)
            }

            setMessage('出張修理管理表を削除しました')
            await fetchReports()
        } catch (error: any) {
            console.error('出張修理管理表削除エラー:', error)
            setMessage(`削除に失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        }
    }

    const handleImport = async () => {
        if (!importFile) {
            setMessage('インポートするExcel/CSVファイルを選択してください')
            return
        }

        setImporting(true)
        setMessage(null)

        try {
            const XLSX = await import('xlsx')
            const fileBuffer = await importFile.arrayBuffer()
            const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: false, raw: true })

            const rowsToInsert: ImportableRepairRow[] = []
            const skippedSheets: string[] = []

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName]
                if (!sheet) {
                    continue
                }

                const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
                const headerRowIndex = findHeaderRowIndex(matrix)
                if (headerRowIndex < 0) {
                    skippedSheets.push(sheetName)
                    continue
                }

                const branchId = detectBranchIdFromSheetName(sheetName) || selectedBranchId
                const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
                    range: headerRowIndex,
                    defval: '',
                })

                rawRows.forEach((raw) => {
                    const workDate = normalizeDateValue(pickCell(raw, HEADER_ALIASES.work_date))
                    const customerName = String(pickCell(raw, HEADER_ALIASES.customer_name) || '').trim()
                    if (!workDate || !customerName) {
                        return
                    }

                    rowsToInsert.push({
                        branch_id: branchId,
                        work_date: workDate,
                        customer_name: customerName,
                        address: toNullable(String(pickCell(raw, HEADER_ALIASES.address) || '')),
                        phone: toNullable(String(pickCell(raw, HEADER_ALIASES.phone) || '')),
                        mobile: toNullable(String(pickCell(raw, HEADER_ALIASES.mobile) || '')),
                        staff_name: toNullable(String(pickCell(raw, HEADER_ALIASES.staff_name) || '')),
                        category: toNullable(String(pickCell(raw, HEADER_ALIASES.category) || '')),
                        model: toNullable(String(pickCell(raw, HEADER_ALIASES.model) || '')),
                        treatment_details: toNullable(String(pickCell(raw, HEADER_ALIASES.treatment_details) || '')),
                        remarks: toNullable(String(pickCell(raw, HEADER_ALIASES.remarks) || '')),
                    })
                })
            }

            if (rowsToInsert.length === 0) {
                setMessage('取込対象データが見つかりませんでした。ヘッダー名（作業日・お客様氏名）を確認してください。')
                return
            }

            const batchedRows = chunk(rowsToInsert, 300)
            for (const batch of batchedRows) {
                const { error } = await supabase
                    .from('service_repair_reports')
                    .insert(batch)

                if (error) {
                    throw error
                }
            }

            await fetchReports()
            const skippedMessage = skippedSheets.length > 0
                ? ` / ヘッダー未検出シート: ${skippedSheets.join(', ')}`
                : ''
            setMessage(`インポート完了: ${rowsToInsert.length}件を登録しました${skippedMessage}`)
            setImportFile(null)
        } catch (error: any) {
            console.error('出張修理管理表インポートエラー:', error)
            setMessage(`インポートに失敗しました: ${error.message || '詳細はコンソールを確認してください'}`)
        } finally {
            setImporting(false)
        }
    }

    const branchName = BRANCHES.find((branch) => branch.id === selectedBranchId)?.name || '営業所未選択'

    return (
        <div style={pageStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 32, color: '#f8fafc' }}>出張修理管理表</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
                        営業所ごとの作業履歴を入力し、そのまま一覧管理できます。
                    </p>
                </div>
                <Link href="/selectors">
                    <button className="btn-3d btn-reset" style={{ padding: '10px 16px', background: '#16a34a', border: '1px solid #15803d' }}>
                        ← メニューに戻る
                    </button>
                </Link>
            </div>

            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    {BRANCHES.map((branch) => {
                        const isActive = branch.id === selectedBranchId
                        return (
                            <button
                                key={branch.id}
                                onClick={() => handleBranchSelect(branch.id)}
                                className="btn-3d"
                                style={{
                                    padding: '10px 14px',
                                    background: isActive ? '#2563eb' : '#1e293b',
                                    border: `1px solid ${isActive ? '#1d4ed8' : '#334155'}`,
                                    borderRadius: 999,
                                }}
                            >
                                {branch.name}
                            </button>
                        )
                    })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={labelStyle}>開始日</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>終了日</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={labelStyle}>キーワード検索</label>
                        <input
                            type="text"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="お客様氏名、住所、担当者、型式、処置内容で検索"
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 14, borderTop: '1px solid #334155', paddingTop: 14 }}>
                    <label style={labelStyle}>既存修理履歴のインポート（Excel/CSV）</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            style={{ maxWidth: 420 }}
                        />
                        <button
                            onClick={handleImport}
                            disabled={importing || !importFile}
                            className="btn-3d"
                            style={{
                                padding: '10px 14px',
                                background: importing ? '#334155' : '#0ea5e9',
                                border: `1px solid ${importing ? '#475569' : '#0284c7'}`,
                            }}
                        >
                            {importing ? 'インポート中...' : 'インポート実行'}
                        </button>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                        ヘッダー「作業日」「お客様氏名」を含むシートを対象に取り込みます。営業所はシート名（南九州/中九州/西九州/東日本/沖縄/東北）から判定し、判定できない場合は現在選択中の営業所で登録します。
                    </p>
                </div>
            </div>

            {message && (
                <div style={{ ...panelStyle, marginBottom: 20, borderColor: '#475569', padding: '14px 16px', color: '#bfdbfe' }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
                <section style={panelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc' }}>{editingId ? '修理履歴を編集' : '修理履歴を登録'}</h2>
                            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                                現在の対象営業所: {branchName}
                            </p>
                        </div>
                        {editingId && (
                            <button onClick={() => resetForm(selectedBranchId)} className="btn-3d" style={{ padding: '8px 12px', background: '#475569', border: '1px solid #64748b' }}>
                                新規入力に戻す
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>営業所</label>
                            <select value={formData.branch_id} onChange={(e) => handleChange('branch_id', e.target.value)} style={inputStyle}>
                                {BRANCHES.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={labelStyle}>作業日</label>
                            <input type="date" value={formData.work_date} onChange={(e) => handleChange('work_date', e.target.value)} style={inputStyle} />
                        </div>

                        <div>
                            <label style={labelStyle}>お客様氏名</label>
                            <input type="text" value={formData.customer_name} onChange={(e) => handleChange('customer_name', e.target.value)} style={inputStyle} />
                        </div>

                        <div>
                            <label style={labelStyle}>住所</label>
                            <input type="text" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} style={inputStyle} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>固定電話</label>
                                <input type="text" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>携帯電話</label>
                                <input type="text" value={formData.mobile} onChange={(e) => handleChange('mobile', e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>担当者</label>
                                <input
                                    type="text"
                                    value={formData.staff_name}
                                    onChange={(e) => handleChange('staff_name', e.target.value)}
                                    list="service-repair-staff-list"
                                    style={inputStyle}
                                />
                                <datalist id="service-repair-staff-list">
                                    {staffs.map((staff) => (
                                        <option key={staff.id} value={staff.name} />
                                    ))}
                                </datalist>
                            </div>
                            <div>
                                <label style={labelStyle}>分野</label>
                                <input
                                    type="text"
                                    value={formData.category}
                                    onChange={(e) => handleChange('category', e.target.value)}
                                    list="service-repair-category-list"
                                    style={inputStyle}
                                />
                                <datalist id="service-repair-category-list">
                                    {CATEGORY_OPTIONS.map((option) => (
                                        <option key={option} value={option} />
                                    ))}
                                </datalist>
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>型式</label>
                            <input type="text" value={formData.model} onChange={(e) => handleChange('model', e.target.value)} style={inputStyle} />
                        </div>

                        <div>
                            <label style={labelStyle}>処置内容</label>
                            <textarea value={formData.treatment_details} onChange={(e) => handleChange('treatment_details', e.target.value)} rows={5} style={inputStyle} />
                        </div>

                        <div>
                            <label style={labelStyle}>備考</label>
                            <textarea value={formData.remarks} onChange={(e) => handleChange('remarks', e.target.value)} rows={3} style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button onClick={handleSave} disabled={saving} className="btn-3d btn-primary" style={{ padding: '10px 18px' }}>
                                {saving ? '保存中...' : editingId ? '更新する' : '登録する'}
                            </button>
                            <button onClick={() => resetForm(selectedBranchId)} className="btn-3d" style={{ padding: '10px 18px', background: '#475569', border: '1px solid #64748b' }}>
                                クリア
                            </button>
                        </div>
                    </div>
                </section>

                <section style={panelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, color: '#f8fafc' }}>一覧</h2>
                            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                                {branchName} / {filteredRows.length}件
                            </p>
                        </div>
                        {(startDate || endDate || searchKeyword) && (
                            <button
                                onClick={() => {
                                    setStartDate('')
                                    setEndDate('')
                                    setSearchKeyword('')
                                }}
                                className="btn-3d"
                                style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155' }}
                            >
                                絞り込み解除
                            </button>
                        )}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>作業日</th>
                                    <th style={thStyle}>お客様氏名</th>
                                    <th style={thStyle}>住所</th>
                                    <th style={thStyle}>固定電話</th>
                                    <th style={thStyle}>携帯電話</th>
                                    <th style={thStyle}>担当者</th>
                                    <th style={thStyle}>分野</th>
                                    <th style={thStyle}>型式</th>
                                    <th style={thStyle}>処置内容</th>
                                    <th style={thStyle}>備考</th>
                                    <th style={{ ...thStyle, textAlign: 'center', width: 110 }}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>
                                            読み込み中...
                                        </td>
                                    </tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', padding: 24 }}>
                                            該当データがありません
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((row) => (
                                        <tr key={row.id}>
                                            <td style={tdStyle}>{row.work_date}</td>
                                            <td style={tdStyle}>{row.customer_name}</td>
                                            <td style={tdStyle}>{row.address || '-'}</td>
                                            <td style={tdStyle}>{row.phone || '-'}</td>
                                            <td style={tdStyle}>{row.mobile || '-'}</td>
                                            <td style={tdStyle}>{row.staff_name || '-'}</td>
                                            <td style={tdStyle}>{row.category || '-'}</td>
                                            <td style={tdStyle}>{row.model || '-'}</td>
                                            <td style={{ ...tdStyle, minWidth: 260, whiteSpace: 'pre-wrap' }}>{row.treatment_details || '-'}</td>
                                            <td style={{ ...tdStyle, minWidth: 180, whiteSpace: 'pre-wrap' }}>{row.remarks || '-'}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <button onClick={() => handleEdit(row)} className="btn-3d" style={{ padding: '4px 8px', marginRight: 4, fontSize: 12 }}>
                                                    編集
                                                </button>
                                                <button onClick={() => handleDelete(row.id)} className="btn-3d btn-reset" style={{ padding: '4px 8px', fontSize: 12, background: '#dc2626', border: '1px solid #b91c1c' }}>
                                                    削除
                                                </button>
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