'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QRCode } from 'react-qr-code'
import { getStaffLineRegisterLiffUrl, parseQrScanPayload, QR_SCAN_HINTS, type QrScanPayload } from '@/lib/lineStaffRegister'
import { resolveStaffName } from '@/lib/staffNameMatch'

const LineStaffQrScanner = dynamic(() => import('@/components/LineStaffQrScanner'), { ssr: false })

type Mapping = {
    id: string
    staff_name: string
    line_user_id: string
    line_display_name: string | null
    notify_enabled: boolean
}

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

export default function LineStaffNotifyPage() {
    const [rows, setRows] = useState<Mapping[]>([])
    const [staffNames, setStaffNames] = useState<string[]>([])
    const [msg, setMsg] = useState<string | null>(null)
    const [qrStaffName, setQrStaffName] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [form, setForm] = useState({
        staff_name: '',
        line_user_id: '',
        line_display_name: '',
    })

    const registerLiffUrl = useMemo(
        () => getStaffLineRegisterLiffUrl(qrStaffName),
        [qrStaffName],
    )

    const fetchAll = useCallback(async () => {
        const [mapRes, staffRes] = await Promise.all([
            fetch('/api/line/staff-mappings', { cache: 'no-store' }),
            fetch('/api/line/staff-mappings/staffs', { cache: 'no-store' }),
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
        setStaffNames((staffData.names || []) as string[])
    }, [])

    useEffect(() => {
        void fetchAll()
    }, [fetchAll])

    const handleSave = async () => {
        const staff_name = form.staff_name.trim()
        const line_user_id = form.line_user_id.trim()
        if (!staff_name || !line_user_id) {
            setMsg('担当者名と LINE User ID は必須です')
            return
        }
        const canonicalName = resolveStaffName(staff_name, staffNames)
        if (!canonicalName) {
            setMsg(`担当者「${staff_name}」が staffs に見つかりません`)
            return
        }
        if (!line_user_id.startsWith('U')) {
            setMsg('LINE User ID は U で始まる形式です')
            return
        }
        const res = await fetch('/api/line/staff-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                staff_name: canonicalName,
                line_user_id,
                line_display_name: form.line_display_name.trim() || null,
            }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
            setMsg(`保存失敗: ${data.error || res.statusText}`)
            return
        }
        setMsg(`${canonicalName} の LINE 通知を登録しました`)
        setForm({ staff_name: '', line_user_id: '', line_display_name: '' })
        await fetchAll()
    }

    const handleQrDecoded = (decoded: string): boolean => {
        if (decoded.includes('カメラ')) {
            setMsg(decoded)
            return false
        }
        const payload: QrScanPayload = parseQrScanPayload(decoded)
        if (payload.kind === 'line_user_id') {
            setForm((p) => ({
                ...p,
                line_user_id: payload.lineUserId,
                staff_name: p.staff_name || qrStaffName,
            }))
            setMsg(`LINE User ID を読み取りました: ${payload.lineUserId}`)
            return true
        }
        if (payload.kind === 'staff_register_url') {
            if (payload.staffName) {
                setQrStaffName(payload.staffName)
                setForm((p) => ({ ...p, staff_name: payload.staffName! }))
            }
            setMsg(QR_SCAN_HINTS.staffRegisterUrl)
            return false
        }
        setMsg(QR_SCAN_HINTS.unrecognized)
        return false
    }

    const copyUserIdHelp = `公式LINEに「連携」と送信すると、User ID が返信されます。`

    const toggleEnabled = async (row: Mapping) => {
        const res = await fetch('/api/line/staff-mappings', {
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
        if (!confirm('この LINE 連携を削除しますか？')) return
        const res = await fetch(`/api/line/staff-mappings?id=${encodeURIComponent(id)}`, {
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
                <h1 style={{ margin: '12px 0 8px', fontSize: 24 }}>修理通知 LINE 連携</h1>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                    修理依頼受付時、担当者へメールと LINE で通知します。
                    公式アカウントを友だち追加したうえで、QR による自己登録または手動登録を行ってください。
                </p>
            </div>

            {msg && (
                <div style={{ ...panelStyle, marginBottom: 16, borderColor: '#475569', color: '#fbbf24' }}>
                    {msg}
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
                    <strong>管理PCのカメラで上のQRを読んでも User ID は取れません。</strong>
                    担当者本人がスマホの <strong>LINEアプリ</strong> で読み取ってください。
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                    登録画面が開いたら「この LINE で登録する」をタップするだけで完了です。
                </p>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>登録する担当者名</label>
                    <input
                        list="staff-name-list-qr"
                        value={qrStaffName}
                        onChange={(e) => {
                            const v = e.target.value
                            setQrStaffName(v)
                            setForm((p) => ({ ...p, staff_name: v }))
                        }}
                        placeholder="staffs.name と同じ表記"
                        style={inputStyle}
                    />
                    <datalist id="staff-name-list-qr">
                        {staffNames.map((n) => (
                            <option key={n} value={n} />
                        ))}
                    </datalist>
                </div>
                {registerLiffUrl ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                        <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
                            <QRCode value={registerLiffUrl} size={200} />
                        </div>
                        <div style={{ flex: '1 1 200px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                            <p style={{ margin: '0 0 8px' }}>
                                1. 担当者に公式 LINE を友だち追加してもらう<br />
                                2. この QR を LINE アプリで読み取る<br />
                                3. 「この LINE で登録する」をタップ
                            </p>
                            <p style={{ margin: 0, wordBreak: 'break-all' }}>
                                <a href={registerLiffUrl} style={{ color: '#60a5fa' }}>{registerLiffUrl}</a>
                            </p>
                        </div>
                    </div>
                ) : (
                    <p style={{ margin: 0, fontSize: 13, color: '#fbbf24' }}>
                        LIFF 未設定です。LINE Developers で Endpoint URL を
                        <code style={{ color: '#e2e8f0' }}> /liff/staff-line-register </code>
                        の LIFF を作成し、Vercel に <code>NEXT_PUBLIC_LIFF_ID_STAFF_REGISTER</code> を設定してください。
                    </p>
                )}
            </div>


            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>LINE で User ID を確認（手動登録用）</h2>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                    担当者に公式LINEへ次のいずれかを送ってもらうと、User ID が返信されます（Webhook 設定が必要です）。
                </p>
                <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
                    <li><code style={{ color: '#fbbf24' }}>連携</code> … User ID と登録方法が返信</li>
                    <li><code style={{ color: '#fbbf24' }}>登録 担当者名</code> … その場で自動登録（例: 登録 山田太郎）</li>
                </ul>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{copyUserIdHelp}</p>
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
                                User ID だけが入ったQR向け（登録用QRは使えません）
                            </p>
                            <LineStaffQrScanner onScan={handleQrDecoded} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>手動登録</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                        <label style={{ fontSize: 12, color: '#94a3b8' }}>担当者名（staffs.name と一致）</label>
                        <input
                            list="staff-name-list"
                            value={form.staff_name}
                            onChange={(e) => setForm((p) => ({ ...p, staff_name: e.target.value }))}
                            style={inputStyle}
                        />
                        <datalist id="staff-name-list">
                            {staffNames.map((n) => (
                                <option key={n} value={n} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: '#94a3b8' }}>LINE User ID</label>
                        <input
                            value={form.line_user_id}
                            onChange={(e) => setForm((p) => ({ ...p, line_user_id: e.target.value }))}
                            placeholder="Uxxxxxxxx..."
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: '#94a3b8' }}>LINE 表示名（任意）</label>
                        <input
                            value={form.line_display_name}
                            onChange={(e) => setForm((p) => ({ ...p, line_display_name: e.target.value }))}
                            style={inputStyle}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        style={{
                            padding: '12px',
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
                </div>
                        </div>
                    </div>
                )}
            </div>
            <div style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>登録一覧</h2>
                    <button
                        type="button"
                        onClick={() => void fetchAll()}
                        style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid #475569',
                            background: '#1e293b',
                            color: '#e2e8f0',
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        一覧を更新
                    </button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
                    スマホで LIFF 登録したあと、この画面で「一覧を更新」を押すと反映されます。
                </p>
                {rows.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 14 }}>未登録です</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                                <th style={{ padding: '8px 6px' }}>担当者</th>
                                <th style={{ padding: '8px 6px' }}>LINE User ID</th>
                                <th style={{ padding: '8px 6px' }}>通知</th>
                                <th style={{ padding: '8px 6px' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} style={{ borderTop: '1px solid #334155' }}>
                                    <td style={{ padding: '10px 6px' }}>{row.staff_name}</td>
                                    <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: 12 }}>{row.line_user_id}</td>
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
