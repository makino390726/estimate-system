'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Mapping = {
    id: string
    staff_name: string
    lineworks_user_id: string
    display_name: string | null
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

export default function LineWorksStaffNotifyPage() {
    const [rows, setRows] = useState<Mapping[]>([])
    const [staffNames, setStaffNames] = useState<string[]>([])
    const [msg, setMsg] = useState<string | null>(null)
    const [form, setForm] = useState({
        staff_name: '',
        lineworks_user_id: '',
        display_name: '',
    })

    const fetchAll = useCallback(async () => {
        const [{ data: mappings, error: mErr }, { data: staffs, error: sErr }] = await Promise.all([
            supabase.from('lineworks_staff_mappings').select('*').order('staff_name'),
            supabase.from('staffs').select('name, email').order('name'),
        ])
        if (mErr) {
            setMsg(`取得エラー: ${mErr.message}`)
            return
        }
        if (sErr) {
            setMsg(`担当者取得エラー: ${sErr.message}`)
            return
        }
        setRows((mappings || []) as Mapping[])
        setStaffNames((staffs || []).map((s) => String(s.name || '').trim()).filter(Boolean))
    }, [])

    useEffect(() => {
        void fetchAll()
    }, [fetchAll])

    const handleSave = async () => {
        const staff_name = form.staff_name.trim()
        const lineworks_user_id = form.lineworks_user_id.trim()
        if (!staff_name || !lineworks_user_id) {
            setMsg('担当者名と LINE WORKS ID（メール）は必須です')
            return
        }
        const { error } = await supabase.from('lineworks_staff_mappings').upsert(
            {
                staff_name,
                lineworks_user_id,
                display_name: form.display_name.trim() || null,
                notify_enabled: true,
            },
            { onConflict: 'staff_name' },
        )
        if (error) {
            setMsg(`保存失敗: ${error.message}`)
            return
        }
        setMsg(`${staff_name} の LINE WORKS 通知を登録しました`)
        setForm({ staff_name: '', lineworks_user_id: '', display_name: '' })
        await fetchAll()
    }

    const toggleEnabled = async (row: Mapping) => {
        const { error } = await supabase
            .from('lineworks_staff_mappings')
            .update({ notify_enabled: !row.notify_enabled })
            .eq('id', row.id)
        if (error) {
            setMsg(error.message)
            return
        }
        await fetchAll()
    }

    const handleDelete = async (id: string) => {
        if (!confirm('この LINE WORKS 連携を削除しますか？')) return
        const { error } = await supabase.from('lineworks_staff_mappings').delete().eq('id', id)
        if (error) {
            setMsg(error.message)
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
                    修理依頼受付時、管轄営業所の担当者へ LINE WORKS Bot から通知します。
                    通知メッセージの「確認しました」ボタンで既読（確認）を記録します。
                    <br />
                    <strong>lineworks_user_id</strong> にはログインメール（推奨）または WORKS ユーザー ID を入力してください。
                </p>
            </div>

            {msg && (
                <div style={{ ...panelStyle, marginBottom: 16, borderColor: '#475569', color: '#fbbf24' }}>
                    {msg}
                </div>
            )}

            <div style={{ ...panelStyle, marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>新規登録</h2>
                <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                        <label style={{ fontSize: 12, color: '#94a3b8' }}>担当者名（staffs.name と一致）</label>
                        <input
                            list="lw-staff-name-list"
                            value={form.staff_name}
                            onChange={(e) => setForm((p) => ({ ...p, staff_name: e.target.value }))}
                            style={inputStyle}
                        />
                        <datalist id="lw-staff-name-list">
                            {staffNames.map((n) => (
                                <option key={n} value={n} />
                            ))}
                        </datalist>
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
