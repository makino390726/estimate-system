'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_STAFF_REGISTER || process.env.NEXT_PUBLIC_LIFF_ID_STAFF || ''

type LiffModule = {
    init: (config: { liffId: string }) => Promise<void>
    isLoggedIn: () => boolean
    login: () => void
    getProfile: () => Promise<{ userId: string; displayName: string }>
    closeWindow: () => void
}

function StaffLineRegisterInner() {
    const searchParams = useSearchParams()
    const presetStaff = searchParams.get('staff')?.trim() || ''

    const [staffName, setStaffName] = useState(presetStaff)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!LIFF_ID) {
            setError('LIFF ID が未設定です（NEXT_PUBLIC_LIFF_ID_STAFF_REGISTER）')
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
                    setLoading(false)
                })
                .catch(() => {
                    setError('LINE との連携に失敗しました')
                    setLoading(false)
                })
        })
    }, [])

    const handleRegister = async () => {
        const name = staffName.trim()
        if (!name) {
            setError('担当者名を入力してください')
            return
        }
        if (!LIFF_ID) return

        setSubmitting(true)
        setError('')
        try {
            const liffMod = (await import('@line/liff')).default as unknown as LiffModule
            const profile = await liffMod.getProfile()
            const res = await fetch('/api/line/staff-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_name: name,
                    line_user_id: profile.userId,
                    line_display_name: profile.displayName,
                }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                throw new Error(data.error || '登録に失敗しました')
            }
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
            <div style={styles.centered}>
                <p style={styles.text}>LINE 連携を準備しています…</p>
            </div>
        )
    }

    if (done) {
        return (
            <div style={styles.centered}>
                <div style={styles.card}>
                    <h1 style={styles.title}>登録完了</h1>
                    <p style={styles.textDark}>
                        修理通知の LINE 連携を登録しました。<br />
                        この画面を閉じてください。
                    </p>
                    <button type="button" onClick={handleClose} style={styles.button}>
                        閉じる
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.centered}>
            <div style={styles.card}>
                <h1 style={styles.title}>修理通知 LINE 登録</h1>
                <p style={styles.hint}>
                    公式アカウントの友だち追加後、この画面で担当者名を確認して登録してください。
                </p>
                {error && <div style={styles.error}>{error}</div>}
                <label style={styles.label}>担当者名（姓と名の間のスペースは不要）</label>
                <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    style={styles.input}
                    disabled={Boolean(presetStaff)}
                />
                <button
                    type="button"
                    onClick={() => void handleRegister()}
                    disabled={submitting}
                    style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}
                >
                    {submitting ? '登録中…' : 'この LINE で登録する'}
                </button>
            </div>
        </div>
    )
}

export default function StaffLineRegisterPage() {
    return (
        <Suspense fallback={<div style={styles.centered}><p style={styles.text}>読み込み中…</p></div>}>
            <StaffLineRegisterInner />
        </Suspense>
    )
}

const styles: Record<string, React.CSSProperties> = {
    centered: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        width: '100%',
        maxWidth: 400,
        background: '#fff',
        borderRadius: 16,
        padding: '24px 20px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    },
    title: { margin: '0 0 12px', fontSize: 20, color: '#1e293b' },
    hint: { margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 },
    label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 },
    input: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #cbd5e1',
        fontSize: 16,
        marginBottom: 16,
        boxSizing: 'border-box',
    },
    button: {
        width: '100%',
        padding: '12px',
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
    },
    error: {
        background: '#fef2f2',
        color: '#b91c1c',
        padding: '10px 12px',
        borderRadius: 8,
        fontSize: 13,
        marginBottom: 12,
    },
    text: { color: '#e2e8f0', fontSize: 14, margin: 0 },
    textDark: { color: '#334155', fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' },
}
