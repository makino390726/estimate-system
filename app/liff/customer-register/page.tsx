'use client'

/**
 * 顧客情報・保有機械登録（LINE友だち追加・追加登録用）
 *
 * LINE Developers:
 *   - LIFF 新規作成 → Endpoint URL = https://<本番>/liff/customer-register
 *   - Vercel: NEXT_PUBLIC_LIFF_ID_CUSTOMER_REGISTER
 *
 * 友だち追加時: Webhook follow → Flex「登録フォームを開く」
 * リッチメニュー: 同 LIFF URL を「機械追加登録」等で設定可能
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SHEET_TYPE_OPTIONS } from '@/lib/customerRegisterSheetTypes'

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER_REGISTER || ''

type LiffModule = {
    init: (config: { liffId: string }) => Promise<void>
    isLoggedIn: () => boolean
    isInClient: () => boolean
    login: () => void
    getProfile: () => Promise<{ userId: string; displayName: string }>
    closeWindow: () => void
}

type MachineFormRow = {
    key: string
    sheet_type: string
    manufacturing_no: string
    serial_no: string
    model: string
    pending_serial: boolean
}

type CustomerForm = {
    customer_name: string
    phone: string
    mobile: string
    postal_code: string
    address: string
}

function newMachineRow(): MachineFormRow {
    return {
        key: `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sheet_type: 'heating',
        manufacturing_no: '',
        serial_no: '',
        model: '',
        pending_serial: false,
    }
}

const initialCustomer: CustomerForm = {
    customer_name: '',
    phone: '',
    mobile: '',
    postal_code: '',
    address: '',
}

function CustomerRegisterInner() {
    const searchParams = useSearchParams()
    const previewMode = searchParams.get('preview') === '1' || searchParams.get('preview') === 'true'

    const [profile, setProfile] = useState<{ userId: string; displayName: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [resultSummary, setResultSummary] = useState('')
    const [customer, setCustomer] = useState<CustomerForm>(initialCustomer)
    const [machines, setMachines] = useState<MachineFormRow[]>([])
    const [existingCount, setExistingCount] = useState(0)

    const loadPrefill = useCallback(async (lineUserId: string, displayName?: string) => {
        try {
            const res = await fetch(`/api/line/customer-register?line_user_id=${encodeURIComponent(lineUserId)}`)
            const data = await res.json()
            if (!res.ok || !data.ok) return

            const prefill = data.prefill as {
                customer_name?: string | null
                phone?: string | null
                mobile?: string | null
                postal_code?: string | null
                address?: string | null
                machines?: Array<{ sheet_type: string; manufacturing_no: string | null; serial_no: string | null; model: string | null }>
            } | null

            if (!prefill) {
                if (displayName) {
                    setCustomer((c) => ({ ...c, customer_name: displayName }))
                }
                return
            }

            setCustomer({
                customer_name: prefill.customer_name || displayName || '',
                phone: prefill.phone || '',
                mobile: prefill.mobile || '',
                postal_code: prefill.postal_code || '',
                address: prefill.address || '',
            })

            if (prefill.machines?.length) {
                setExistingCount(prefill.machines.length)
            }
        } catch {
            /* ignore prefill errors */
        }
    }, [])

    useEffect(() => {
        if (previewMode) {
            setProfile({ userId: 'U_preview_local_ui_check', displayName: 'プレビュー太郎' })
            setCustomer({
                customer_name: 'プレビュー太郎',
                phone: '0985-00-0000',
                mobile: '',
                postal_code: '880-0000',
                address: '宮崎県宮崎市…',
            })
            setLoading(false)
            return
        }

        if (!LIFF_ID) {
            setError('LIFF ID が未設定です（NEXT_PUBLIC_LIFF_ID_CUSTOMER_REGISTER）')
            setLoading(false)
            return
        }

        import('@line/liff').then((mod) => {
            const liff = mod.default as unknown as LiffModule
            liff.init({ liffId: LIFF_ID })
                .then(() => {
                    if (!liff.isLoggedIn()) {
                        liff.login()
                        return
                    }
                    return liff.getProfile().then((p) => {
                        setProfile(p)
                        return loadPrefill(p.userId, p.displayName)
                    })
                })
                .catch(() => setError('LINE との連携に失敗しました。LINEアプリから開き直してください。'))
                .finally(() => setLoading(false))
        })
    }, [loadPrefill, previewMode])

    const previewBanner = useMemo(() => {
        if (!previewMode) return null
        return (
            <div style={styles.previewBanner}>
                UIプレビュー（LINE連携なし）。送信はテスト保存されません。
            </div>
        )
    }, [previewMode])

    const setCustomerField = (key: keyof CustomerForm, value: string) => {
        setCustomer((c) => ({ ...c, [key]: value }))
    }

    const setMachineField = (key: string, field: keyof MachineFormRow, value: string | boolean) => {
        setMachines((rows) => rows.map((r) => {
            if (r.key !== key) return r
            if (field === 'pending_serial' && value === true) {
                return { ...r, pending_serial: true, manufacturing_no: '', serial_no: '' }
            }
            if (field === 'pending_serial' && value === false) {
                return { ...r, pending_serial: false }
            }
            return { ...r, [field]: value }
        }))
    }

    const addMachine = () => {
        setMachines((rows) => [...rows, newMachineRow()])
    }

    const removeMachine = (key: string) => {
        setMachines((rows) => rows.filter((r) => r.key !== key))
    }

    const handleSubmit = async () => {
        if (previewMode) {
            setResultSummary(`プレビュー: ${machines.length}台分の入力内容を確認しました`)
            setDone(true)
            return
        }

        if (!profile?.userId) {
            setError('LINEユーザーIDを取得できていません')
            return
        }

        setSubmitting(true)
        setError('')
        try {
            const res = await fetch('/api/line/customer-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    line_user_id: profile.userId,
                    line_display_name: profile.displayName,
                    customer_name: customer.customer_name.trim(),
                    phone: customer.phone.trim() || null,
                    mobile: customer.mobile.trim() || null,
                    postal_code: customer.postal_code.trim() || null,
                    address: customer.address.trim() || null,
                    machines: machines.map((m) => ({
                        sheet_type: m.sheet_type,
                        manufacturing_no: m.pending_serial ? null : (m.manufacturing_no.trim() || null),
                        serial_no: m.pending_serial ? null : (m.serial_no.trim() || null),
                        model: m.model.trim() || null,
                        pending_serial: m.pending_serial,
                    })),
                }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                throw new Error(data.error || '登録に失敗しました')
            }

            const parts: string[] = []
            if (data.contact_only) {
                parts.push('連絡先を登録しました')
            } else {
                if (data.inserted > 0) parts.push(`新規 ${data.inserted}台`)
                if (data.updated > 0) parts.push(`更新 ${data.updated}台`)
                if (data.pending > 0) parts.push(`製造番号後日 ${data.pending}台`)
            }
            if (data.skipped > 0) parts.push(`スキップ ${data.skipped}台`)
            setResultSummary(parts.join(' / ') || '登録が完了しました')
            setDone(true)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '登録に失敗しました')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        import('@line/liff').then((mod) => {
            const liff = mod.default as unknown as LiffModule
            try {
                liff.closeWindow()
            } catch {
                window.close()
            }
        })
    }

    if (loading) {
        return (
            <div style={styles.page}>
                <p style={styles.muted}>読み込み中…</p>
            </div>
        )
    }

    if (done) {
        return (
            <div style={styles.page}>
                <div style={styles.card}>
                    <h1 style={styles.title}>登録完了</h1>
                    <p style={styles.text}>{resultSummary}</p>
                    <p style={styles.mutedSmall}>
                        保守・点検のご案内は LINE またはお電話でお知らせします。<br />
                        製造番号は後からこのフォームで追加登録できます。
                    </p>
                    <button type="button" onClick={handleClose} style={styles.primaryBtn}>
                        閉じる
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.page}>
            {previewBanner}
            <div style={styles.header}>
                <h1 style={styles.title}>お客様情報登録</h1>
                <p style={styles.subtitle}>
                    まず氏名・連絡先をご入力ください。機械の登録は任意です（後から追加できます）。
                    {existingCount > 0 ? ` 登録済み ${existingCount}台` : ''}
                </p>
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <section style={styles.section}>
                <h2 style={styles.sectionTitle}>お客様情報</h2>
                <label style={styles.label}>
                    氏名（会社名）<span style={styles.req}>*</span>
                    <input
                        type="text"
                        value={customer.customer_name}
                        onChange={(e) => setCustomerField('customer_name', e.target.value)}
                        style={styles.input}
                        placeholder="山田 太郎"
                    />
                </label>
                <label style={styles.label}>
                    電話番号（固定）
                    <input
                        type="tel"
                        value={customer.phone}
                        onChange={(e) => setCustomerField('phone', e.target.value)}
                        style={styles.input}
                        placeholder="0985-00-0000"
                    />
                </label>
                <label style={styles.label}>
                    携帯電話
                    <input
                        type="tel"
                        value={customer.mobile}
                        onChange={(e) => setCustomerField('mobile', e.target.value)}
                        style={styles.input}
                        placeholder="090-0000-0000"
                    />
                </label>
                <p style={styles.hint}>固定・携帯のどちらか一方は必須です。</p>
                <label style={styles.label}>
                    郵便番号
                    <input
                        type="text"
                        value={customer.postal_code}
                        onChange={(e) => setCustomerField('postal_code', e.target.value)}
                        style={styles.input}
                        placeholder="880-0000"
                        inputMode="numeric"
                    />
                </label>
                <label style={styles.label}>
                    住所
                    <input
                        type="text"
                        value={customer.address}
                        onChange={(e) => setCustomerField('address', e.target.value)}
                        style={styles.input}
                        placeholder="宮崎県宮崎市…"
                    />
                </label>
            </section>

            <section style={styles.section}>
                <div style={styles.sectionHeadRow}>
                    <h2 style={styles.sectionTitle}>保有機械（任意）</h2>
                    <button type="button" onClick={addMachine} style={styles.addBtn}>
                        ＋ 機械を登録
                    </button>
                </div>
                <p style={styles.hint}>
                    製造番号が分かる場合は入力してください。分からない場合は「後で登録」を選べます。
                    機械の登録を省略して、連絡先だけ送ることもできます。
                </p>

                {machines.length === 0 && (
                    <p style={styles.emptyMachines}>機械の登録はありません（連絡先のみ登録）</p>
                )}

                {machines.map((row, index) => (
                    <div key={row.key} style={styles.machineCard}>
                        <div style={styles.machineCardHead}>
                            <strong style={styles.machineLabel}>機械 {index + 1}</strong>
                            <button type="button" onClick={() => removeMachine(row.key)} style={styles.removeBtn}>
                                削除
                            </button>
                        </div>
                        <label style={styles.label}>
                            機種<span style={styles.req}>*</span>
                            <select
                                value={row.sheet_type}
                                onChange={(e) => setMachineField(row.key, 'sheet_type', e.target.value)}
                                style={styles.input}
                            >
                                {SHEET_TYPE_OPTIONS.filter((o) => o.value !== 'unknown').map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                                <option value="unknown">その他</option>
                            </select>
                        </label>
                        <label style={styles.checkRow}>
                            <input
                                type="checkbox"
                                checked={row.pending_serial}
                                onChange={(e) => setMachineField(row.key, 'pending_serial', e.target.checked)}
                            />
                            <span>製造番号がわからない（後で登録）</span>
                        </label>
                        {!row.pending_serial && (
                            <>
                                <label style={styles.label}>
                                    製造番号
                                    <input
                                        type="text"
                                        value={row.manufacturing_no}
                                        onChange={(e) => setMachineField(row.key, 'manufacturing_no', e.target.value)}
                                        style={styles.input}
                                        placeholder="銘板の製造番号（任意）"
                                    />
                                </label>
                                <label style={styles.label}>
                                    本体番号
                                    <input
                                        type="text"
                                        value={row.serial_no}
                                        onChange={(e) => setMachineField(row.key, 'serial_no', e.target.value)}
                                        style={styles.input}
                                        placeholder="製造番号の代わりに入力可"
                                    />
                                </label>
                            </>
                        )}
                        <label style={styles.label}>
                            型式（任意）
                            <input
                                type="text"
                                value={row.model}
                                onChange={(e) => setMachineField(row.key, 'model', e.target.value)}
                                style={styles.input}
                            />
                        </label>
                    </div>
                ))}
            </section>

            <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ ...styles.primaryBtn, opacity: submitting ? 0.7 : 1 }}
            >
                {submitting
                    ? '登録中…'
                    : machines.length > 0
                        ? `登録する（機械 ${machines.length}台）`
                        : '連絡先だけ登録する'}
            </button>
        </div>
    )
}

export default function CustomerRegisterLiffPage() {
    return (
        <Suspense fallback={<div style={styles.page}><p style={styles.muted}>読み込み中…</p></div>}>
            <CustomerRegisterInner />
        </Suspense>
    )
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: '#f8fafc',
        padding: '16px 16px 32px',
        maxWidth: 480,
        margin: '0 auto',
        fontFamily: '"Hiragino Sans", "Yu Gothic", Meiryo, sans-serif',
    },
    header: { marginBottom: 20, textAlign: 'center' as const },
    title: { fontSize: 20, margin: '0 0 8px', fontWeight: 700 },
    subtitle: { margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },
    section: {
        background: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        border: '1px solid #334155',
    },
    sectionTitle: { fontSize: 15, margin: '0 0 12px', fontWeight: 700 },
    sectionHeadRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    label: { display: 'block', fontSize: 13, marginBottom: 12, fontWeight: 600 },
    req: { color: '#f87171', marginLeft: 4 },
    input: {
        display: 'block',
        width: '100%',
        marginTop: 6,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #475569',
        background: '#0f172a',
        color: '#f8fafc',
        fontSize: 15,
        boxSizing: 'border-box' as const,
    },
    hint: { fontSize: 12, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.45 },
    emptyMachines: {
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center' as const,
        padding: '12px 8px',
        marginBottom: 8,
        border: '1px dashed #475569',
        borderRadius: 8,
    },
    checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 12,
        cursor: 'pointer',
    },
    machineCard: {
        background: '#0f172a',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        border: '1px solid #334155',
    },
    machineCardHead: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    machineLabel: { fontSize: 14, color: '#e2e8f0' },
    addBtn: {
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid #047857',
        background: 'transparent',
        color: '#6ee7b7',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
    },
    removeBtn: {
        padding: '4px 10px',
        borderRadius: 6,
        border: 'none',
        background: '#450a0a',
        color: '#fca5a5',
        fontSize: 12,
        cursor: 'pointer',
    },
    primaryBtn: {
        width: '100%',
        padding: 14,
        borderRadius: 10,
        border: 'none',
        background: '#047857',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
    },
    errorBox: {
        background: '#450a0a',
        color: '#fecaca',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 13,
        whiteSpace: 'pre-wrap' as const,
    },
    card: {
        background: '#1e293b',
        borderRadius: 12,
        padding: 24,
        border: '1px solid #334155',
        textAlign: 'center' as const,
    },
    text: { fontSize: 15, margin: '0 0 12px' },
    muted: { color: '#94a3b8', textAlign: 'center' as const, paddingTop: 40 },
    mutedSmall: { fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 20 },
    previewBanner: {
        background: '#422006',
        color: '#fcd34d',
        fontSize: 12,
        padding: '10px 12px',
        borderRadius: 8,
        marginBottom: 16,
        lineHeight: 1.45,
        border: '1px solid #854d0e',
    },
}
