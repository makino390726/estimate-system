'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type StaffOption = { id: string; name: string }

function RegisterForm() {
    const searchParams = useSearchParams()
    const initialStaffId = searchParams.get('staff_id')?.trim() || ''
    const initialStaff = searchParams.get('staff')?.trim() || ''

    const [staffId, setStaffId] = useState(initialStaffId)
    const [staffName, setStaffName] = useState(initialStaff)
    const [worksId, setWorksId] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [msg, setMsg] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!initialStaffId) return
        void (async () => {
            const res = await fetch('/api/lineworks/staff-mappings/staffs', { cache: 'no-store' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) return
            const staff = (data.staff || []) as StaffOption[]
            const row = staff.find((s) => s.id === initialStaffId)
            if (row) {
                setStaffId(row.id)
                setStaffName(row.name)
            }
        })()
    }, [initialStaffId])

    const canSubmit = useMemo(
        () => staffName.trim().length > 0 && worksId.trim().length > 0,
        [staffName, worksId],
    )

    const handleSubmit = async () => {
        if (!canSubmit) return
        setSaving(true)
        setMsg(null)
        try {
            const res = await fetch('/api/lineworks/staff-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: staffId && !staffId.startsWith('name-') ? staffId : undefined,
                    staff_name: staffName.trim(),
                    lineworks_user_id: worksId.trim(),
                    display_name: displayName.trim() || null,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) {
                setMsg(data.error || '登録に失敗しました')
                return
            }
            setMsg(`${data.staff_name} として LINE WORKS 通知の登録が完了しました。`)
        } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : '登録に失敗しました')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                padding: 24,
                background: '#0f172a',
                color: '#e2e8f0',
                maxWidth: 480,
                margin: '0 auto',
            }}
        >
            <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>LINE WORKS 通知登録</h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
                修理受付の通知を受け取るため、LINE WORKS のログインメール（またはユーザーID）を登録してください。
            </p>

            {msg && (
                <div
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        borderRadius: 8,
                        background: msg.includes('完了') ? '#14532d' : '#450a0a',
                        color: msg.includes('完了') ? '#bbf7d0' : '#fecaca',
                        fontSize: 14,
                    }}
                >
                    {msg}
                </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>担当者名</label>
                    <input
                        value={staffName}
                        readOnly={Boolean(staffId)}
                        onChange={(e) => setStaffName(e.target.value)}
                        placeholder="QRから開いた場合は自動入力"
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>LINE WORKS ID（ログインメール）</label>
                    <input
                        type="email"
                        value={worksId}
                        onChange={(e) => setWorksId(e.target.value)}
                        placeholder="name@example.com"
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>表示名（任意）</label>
                    <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        style={inputStyle}
                    />
                </div>
                <button
                    type="button"
                    disabled={!canSubmit || saving}
                    onClick={() => void handleSubmit()}
                    style={{
                        padding: 14,
                        borderRadius: 8,
                        border: 'none',
                        background: canSubmit && !saving ? '#2563eb' : '#475569',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: canSubmit && !saving ? 'pointer' : 'not-allowed',
                    }}
                >
                    {saving ? '登録中…' : '登録する'}
                </button>
            </div>
        </div>
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 4,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
    fontSize: 16,
    boxSizing: 'border-box',
}

export default function LineWorksStaffRegisterPage() {
    return (
        <Suspense
            fallback={
                <div style={{ minHeight: '100vh', background: '#0f172a', color: '#94a3b8', padding: 24 }}>
                    読み込み中…
                </div>
            }
        >
            <RegisterForm />
        </Suspense>
    )
}
