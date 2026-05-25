'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QRCode } from 'react-qr-code'
import {
    getLineWorksStaffRegisterUrl,
    LINEWORKS_QR_SCAN_HINTS,
    parseLineWorksQrScanPayload,
} from '@/lib/lineWorksStaffRegister'

const LineStaffQrScanner = dynamic(() => import('@/components/LineStaffQrScanner'), { ssr: false })

type Mapping = {
    id: string
    staff_name: string
    lineworks_user_id: string
    display_name: string | null
    notify_enabled: boolean
}

type StaffOption = { id: string; name: string }

const pageStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 900,
    margin: '0 auto',
    minHeight: '100vh',
    color: '#e2e8f0',
}
const panelStyle: React.CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 16,
    padding: 20,
}
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
    fontSize: 14,
}

export default function LineWorksStaffNotifyPage() {
    const [rows, setRows] = useState<Mapping[]>([])
    const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
    const [msg, setMsg] = useState<string | null>(null)
    const [qrStaffId, setQrStaffId] = useState('')
    const [qrStaffName, setQrStaffName] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [origin, setOrigin] = useState('')
    const [form, setForm] = useState({
        staff_name: '',
        lineworks_user_id: '',
        display_name: '',
    })
    const [lwStatus, setLwStatus] = useState<{
        ok?: boolean
        configured?: boolean
        tokenOk?: boolean
        tokenError?: string | null
        mappingCount?: number
        hint?: string | null
        notificationsTableOk?: boolean
        notificationsTableError?: string | null
        supabaseServiceRole?: boolean
        env?: Record<string, boolean>
        missingEnv?: string[]
        hints?: string[]
        deployNote?: string
        staffNotifyChannel?: string
        staffNotifyChannelLabel?: string
        staffNotifyPolicy?: string
    } | null>(null)
    const [testSending, setTestSending] = useState(false)

    useEffect(() => {
        setOrigin(window.location.origin)
    }, [])

    const registerUrl = useMemo(
        () => (origin ? getLineWorksStaffRegisterUrl(qrStaffName, origin, qrStaffId) : null),
        [origin, qrStaffName, qrStaffId],
    )

    const applyStaffSelection = (staffId: string) => {
        const opt = staffOptions.find((s) => s.id === staffId)
        setQrStaffId(staffId)
        setQrStaffName(opt?.name || '')
        setForm((p) => ({ ...p, staff_name: opt?.name || '' }))
    }

    const fetchAll = useCallback(async () => {
        const [mapRes, staffRes] = await Promise.all([
            fetch('/api/lineworks/staff-mappings', { cache: 'no-store' }),
            fetch('/api/lineworks/staff-mappings/staffs', { cache: 'no-store' }),
        ])
        const mapData = await mapRes.json().catch(() => ({}))
        const staffData = await staffRes.json().catch(() => ({}))
        if (!mapRes.ok || !mapData.ok) {
            setMsg(`取得エラー: ${mapData.error || mapRes.statusText}`)
            return
        }
        if (!staffRes.ok || !staffData.ok) {
            setMsg(`担当者取得エラー: ${staffData.error || staffRes.statusText}`)
            return
        }
        setRows((mapData.mappings || []) as Mapping[])
        const staff = (staffData.staff || []) as StaffOption[]
        if (staff.length > 0) {
            setStaffOptions(staff)
        } else {
            const names = (staffData.names || []) as string[]
            setStaffOptions(names.map((name, i) => ({ id: `name-${i}`, name })))
        }
    }, [])

    const fetchStatus = useCallback(async () => {
        const res = await fetch('/api/lineworks/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        setLwStatus(data)
    }, [])

    useEffect(() => {
        void fetchAll()
        void fetchStatus()
    }, [fetchAll, fetchStatus])

    const handleTestMessage = async () => {
        const userId = form.lineworks_user_id.trim()
        if (!userId) {
            setMsg('テスト送信する LINE WORKS ID を入力してください')
            return
        }
        setTestSending(true)
        try {
            const res = await fetch('/api/lineworks/test-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineworks_user_id: userId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) {
                setMsg(`テスト送信失敗: ${data.error || res.statusText}`)
                return
            }
            setMsg(`${userId} へテストメッセージを送信しました。LINE WORKS を確認してください。`)
        } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : 'テスト送信に失敗しました')
        } finally {
            setTestSending(false)
        }
    }

    const handleSave = async () => {
        const lineworks_user_id = form.lineworks_user_id.trim()
        const matched = staffOptions.find((s) => s.id === qrStaffId)
        const staff_name = (matched?.name || form.staff_name).trim()
        if (!qrStaffId || !staff_name || !lineworks_user_id) {
            setMsg('担当者（プルダウン）と LINE WORKS ID（メール）は必須です')
            return
        }
        const staff_id = qrStaffId.startsWith('name-') ? undefined : qrStaffId
        const res = await fetch('/api/lineworks/staff-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                staff_id,
                staff_name,
                lineworks_user_id,
                display_name: form.display_name.trim() || null,
            }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
            setMsg(`保存失敗: ${data.error || res.statusText}`)
            return
        }
        setMsg(`${data.staff_name} の LINE WORKS 通知を登録しました`)
        setForm({ staff_name: '', lineworks_user_id: '', display_name: '' })
        await fetchAll()
    }

    const handleQrDecoded = (decoded: string): boolean => {
        if (decoded.includes('カメラ')) {
            setMsg(decoded)
            return false
        }
        const payload = parseLineWorksQrScanPayload(decoded)
        if (payload.kind === 'lineworks_user_id') {
            setForm((p) => ({
                ...p,
                lineworks_user_id: payload.userId,
                staff_name: p.staff_name || qrStaffName,
            }))
            setMsg(`LINE WORKS ID を読み取りました: ${payload.userId}`)
            return true
        }
        if (payload.kind === 'staff_register_url') {
            if (payload.staffName) {
                setQrStaffName(payload.staffName)
                setForm((p) => ({ ...p, staff_name: payload.staffName! }))
            }
            setMsg(LINEWORKS_QR_SCAN_HINTS.staffRegisterUrl)
            return false
        }
        setMsg(LINEWORKS_QR_SCAN_HINTS.unrecognized)
        return false
    }

    const toggleEnabled = async (row: Mapping) => {
        const res = await fetch('/api/lineworks/staff-mappings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, notify_enabled: !row.notify_enabled }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
            setMsg(data.error || res.statusText)
            return
        }
        await fetchAll()
    }

    const handleDelete = async (id: string) => {
        if (!confirm('この LINE WORKS 連携を削除しますか？')) return
        const res = await fetch(`/api/lineworks/staff-mappings?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
            setMsg(data.error || res.statusText)
            return
        }
        await fetchAll()
    }

    return (
        <div style={pageStyle}>
            <div style={{ marginBottom: 20 }}>
                <Link href="/selectors" style={{ color: '#94a3b8', fontSize: 14 }}>← メニュー</Link>
                <h1 style={{ margin: '12px 0 8px', fontSize: 24 }}>修理通知 LINE WORKS 連携</h1>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                    修理依頼受付時、管轄営業所の担当者へ LINE WORKS Bot から通知します（担当者通知は LINE WORKS と LINE 公式の<strong>併用不可</strong>）。
                    新規受付通知の「案件を開く」から案件画面を開き、案件情報欄の「担当者確認」「修理中」で進捗を記録してください（LINE受付のお客様へステータスが通知されます）。
                    <br />
                    <strong>lineworks_user_id</strong> にはログインメール（推奨）または WORKS ユーザー ID を入力してください。
                    代理店・販売店（LINE のみ）向けは <Link href="/line-staff-notify" style={{ color: '#38bdf8' }}>修理通知 LINE 連携</Link> を使い、環境変数 <code>REPAIR_STAFF_NOTIFY_CHANNEL=line</code> に切り替えます。
                </p>
            </div>

            {msg && (
                <div style={{ ...panelStyle, marginBottom: 16, borderColor: '#475569', color: '#fbbf24' }}>
                    {msg}
                </div>
            )}

            {lwStatus?.staffNotifyChannel === 'line' && (
                <div style={{
                    ...panelStyle,
                    marginBottom: 16,
                    borderColor: '#b45309',
                    color: '#fcd34d',
                    fontSize: 13,
                    lineHeight: 1.6,
                }}>
                    担当者通知は <strong>LINE 公式</strong> モードです。この LINE WORKS 連携画面は利用しません。
                    <Link href="/line-staff-notify" style={{ color: '#38bdf8', marginLeft: 6 }}>修理通知 LINE 連携へ</Link>
                </div>
            )}

            {lwStatus && (
                <div style={{
                    ...panelStyle,
                    marginBottom: 16,
                    borderColor: lwStatus.ok ? '#166534' : '#b45309',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: 15, color: lwStatus.ok ? '#86efac' : '#fcd34d' }}>
                            連携状態: {lwStatus.ok ? 'OK' : '要確認'}
                        </h2>
                        <button
                            type="button"
                            onClick={() => void fetchStatus()}
                            style={{
                                padding: '6px 12px', fontSize: 12, borderRadius: 6,
                                border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer',
                            }}
                        >
                            再確認
                        </button>
                    </div>
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
                        <li>担当者通知チャネル: {lwStatus.staffNotifyChannelLabel || lwStatus.staffNotifyChannel || '—'}</li>
                        <li>環境変数: {lwStatus.configured ? '設定済み' : '未設定'}</li>
                        <li>APIトークン: {lwStatus.tokenOk ? '取得成功' : `失敗 ${lwStatus.tokenError || ''}`}</li>
                        <li>担当者登録: {lwStatus.mappingCount ?? 0} 名</li>
                        <li>確認用テーブル: {lwStatus.notificationsTableOk === false
                            ? `未作成（${lwStatus.notificationsTableError}）`
                            : 'OK'}</li>
                        <li>Supabase service role: {lwStatus.supabaseServiceRole ? '設定済み' : '未設定（RLSで保存失敗の原因）'}</li>
                    </ul>
                    {lwStatus.missingEnv && lwStatus.missingEnv.length > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#f87171' }}>
                            未設定の変数: {lwStatus.missingEnv.join('、')}
                        </p>
                    )}
                    {(lwStatus.hints?.length ? lwStatus.hints : lwStatus.hint ? [lwStatus.hint] : []).map((h) => (
                        <p key={h} style={{ margin: '10px 0 0', fontSize: 13, color: '#fbbf24' }}>{h}</p>
                    ))}
                </div>
            )}

            <div style={{ ...panelStyle, marginBottom: 20, borderColor: '#1d4ed8' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#93c5fd' }}>QRコードで登録（推奨）</h2>
                <div style={{
                    marginBottom: 14,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#172554',
                    fontSize: 13,
                    color: '#bfdbfe',
                    lineHeight: 1.55,
                }}>
                    <strong>管理PCのカメラで上のQRを読んでも登録は完了しません。</strong>
                    担当者本人がスマートフォンで読み取り、LINE WORKS のログインメールを入力してください。
                </div>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>登録する担当者（担当者マスタから選択）</label>
                    <select
                        value={qrStaffId}
                        onChange={(e) => applyStaffSelection(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">-- 選択してください --</option>
                        {staffOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748b' }}>
                        手入力ではなく一覧から選ぶと、氏名のスペース違いで登録に失敗しにくくなります。
                    </p>
                </div>
                {registerUrl ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                        <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
                            <QRCode value={registerUrl} size={200} />
                        </div>
                        <div style={{ flex: '1 1 200px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                            <p style={{ margin: '0 0 8px' }}>
                                1. 担当者名を上で選択<br />
                                2. 担当者にこの QR をスマホで読み取ってもらう<br />
                                3. 開いた画面で LINE WORKS のログインメールを入力して「登録する」
                            </p>
                            <p style={{ margin: 0, wordBreak: 'break-all' }}>
                                <a href={registerUrl} style={{ color: '#60a5fa' }}>{registerUrl}</a>
                            </p>
                        </div>
                    </div>
                ) : (
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>QR を生成中…</p>
                )}
            </div>

            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        textAlign: 'left',
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: 13,
                    }}
                >
                    {showAdvanced ? '▼' : '▶'} 詳細（PCカメラ・手動入力）
                </button>
                {showAdvanced && (
                    <div style={{ marginTop: 14, display: 'grid', gap: 16 }}>
                        <div>
                            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#94a3b8' }}>
                                担当者の連絡先QR（メール入り）や登録用QRを読み取れます
                            </p>
                            <LineStaffQrScanner onScan={handleQrDecoded} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>手動登録</h3>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 12, color: '#94a3b8' }}>担当者（マスタから選択）</label>
                                    <select
                                        value={qrStaffId}
                                        onChange={(e) => applyStaffSelection(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="">-- 選択 --</option>
                                        {staffOptions.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: '#94a3b8' }}>LINE WORKS ID（メールまたはユーザーID）</label>
                                    <input
                                        value={form.lineworks_user_id}
                                        onChange={(e) => setForm((p) => ({ ...p, lineworks_user_id: e.target.value }))}
                                        placeholder="tanaka@example.com"
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: '#94a3b8' }}>表示名（任意）</label>
                                    <input
                                        value={form.display_name}
                                        onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => void handleSave()}
                                        style={{
                                            padding: '12px 16px',
                                            background: '#2563eb',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        保存
                                    </button>
                                    <button
                                        type="button"
                                        disabled={testSending}
                                        onClick={() => void handleTestMessage()}
                                        style={{
                                            padding: '12px 16px',
                                            background: '#0f766e',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            cursor: testSending ? 'wait' : 'pointer',
                                            opacity: testSending ? 0.7 : 1,
                                        }}
                                    >
                                        {testSending ? '送信中…' : 'テスト送信'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div style={panelStyle}>
                <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>登録一覧</h2>
                {rows.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 14 }}>未登録です</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                                <th style={{ padding: '8px 6px' }}>担当者</th>
                                <th style={{ padding: '8px 6px' }}>LINE WORKS ID</th>
                                <th style={{ padding: '8px 6px' }}>通知</th>
                                <th style={{ padding: '8px 6px' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} style={{ borderTop: '1px solid #334155' }}>
                                    <td style={{ padding: '10px 6px' }}>{row.staff_name}</td>
                                    <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 12 }}>{row.lineworks_user_id}</td>
                                    <td style={{ padding: '10px 6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => void toggleEnabled(row)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: 6,
                                                border: '1px solid #334155',
                                                background: row.notify_enabled ? '#14532d' : '#334155',
                                                color: row.notify_enabled ? '#86efac' : '#94a3b8',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                            }}
                                        >
                                            {row.notify_enabled ? 'ON' : 'OFF'}
                                        </button>
                                    </td>
                                    <td style={{ padding: '10px 6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => void handleDelete(row.id)}
                                            style={{
                                                padding: '4px 10px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: '#f87171',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                            }}
                                        >
                                            削除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
