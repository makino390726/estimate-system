'use client'

import { useEffect, useState, useRef } from 'react'

type LiffModule = {
    init: (config: { liffId: string }) => Promise<void>
    isLoggedIn: () => boolean
    login: () => void
    getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>
    closeWindow: () => void
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || ''

export default function RepairFormPage() {
    const [liff, setLiff] = useState<LiffModule | null>(null)
    const [profile, setProfile] = useState<{ userId: string; displayName: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [requestNo, setRequestNo] = useState<number | null>(null)
    const [error, setError] = useState('')
    const photoInputRef = useRef<HTMLInputElement>(null)

    const [form, setForm] = useState({
        customer_name: '',
        model: '',
        symptom: '',
        symptom_category: '',
        customer_phone: '',
        notes: '',
    })
    const [photos, setPhotos] = useState<File[]>([])
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])

    useEffect(() => {
        if (!LIFF_ID) {
            setError('LIFF IDが設定されていません')
            setLoading(false)
            return
        }
        import('@line/liff').then(mod => {
            const liffMod = mod.default as unknown as LiffModule
            liffMod.init({ liffId: LIFF_ID }).then(() => {
                setLiff(liffMod)
                if (!liffMod.isLoggedIn()) {
                    liffMod.login()
                    return
                }
                liffMod.getProfile().then(p => {
                    setProfile(p)
                    setForm(prev => ({ ...prev, customer_name: p.displayName }))
                    setLoading(false)
                })
            }).catch((e: Error) => {
                console.error('LIFF init error:', e)
                setError('LINEとの連携に失敗しました')
                setLoading(false)
            })
        })
    }, [])

    useEffect(() => {
        return () => {
            photoPreviewUrls.forEach(url => URL.revokeObjectURL(url))
        }
    }, [photoPreviewUrls])

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        setPhotos(prev => [...prev, ...files])
        setPhotoPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    }

    const removePhoto = (idx: number) => {
        URL.revokeObjectURL(photoPreviewUrls[idx])
        setPhotos(prev => prev.filter((_, i) => i !== idx))
        setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== idx))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.customer_name || !form.symptom) {
            setError('お名前と症状は必須です')
            return
        }
        setSubmitting(true)
        setError('')

        try {
            const body = {
                ...form,
                line_user_id: profile?.userId || '',
                line_display_name: profile?.displayName || '',
            }
            const res = await fetch('/api/line/repair-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || '送信に失敗しました')
            }
            const result = await res.json()
            setRequestNo(result.request_no || null)
            setSubmitted(true)
        } catch (err: any) {
            setError(err.message || '送信に失敗しました')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        if (liff) {
            try { liff.closeWindow() } catch { window.close() }
        } else {
            window.close()
        }
    }

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingWrapper}>
                    <div style={styles.spinner} />
                    <p style={styles.loadingText}>読み込み中...</p>
                </div>
            </div>
        )
    }

    if (submitted) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.successIcon}>&#10004;</div>
                    <h2 style={styles.successTitle}>送信完了</h2>
                    {requestNo && (
                        <p style={styles.requestNo}>受付番号: #{requestNo}</p>
                    )}
                    <p style={styles.successText}>
                        修理依頼を受け付けました。<br />
                        担当者より折り返しご連絡いたします。<br />
                        LINEにも確認メッセージをお送りしました。
                    </p>
                    <button onClick={handleClose} style={styles.closeButton}>
                        閉じる
                    </button>
                </div>
            </div>
        )
    }

    const SYMPTOM_CATEGORIES = [
        '', '火がつかない', '温度が上がらない', '異音がする',
        '水漏れ', '煙が出る', 'エラー表示', '動作しない', 'その他',
    ]

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <h1 style={styles.headerTitle}>修理依頼フォーム</h1>
                    <p style={styles.headerSub}>必要事項を入力して送信してください</p>
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.field}>
                        <label style={styles.label}>
                            お名前（会社名）<span style={styles.required}>*</span>
                        </label>
                        <input
                            type="text"
                            value={form.customer_name}
                            onChange={e => setForm(prev => ({ ...prev, customer_name: e.target.value }))}
                            placeholder="例: 山田太郎"
                            style={styles.input}
                            required
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>電話番号</label>
                        <input
                            type="tel"
                            value={form.customer_phone}
                            onChange={e => setForm(prev => ({ ...prev, customer_phone: e.target.value }))}
                            placeholder="例: 090-1234-5678"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>機械の型式（型番）</label>
                        <input
                            type="text"
                            value={form.model}
                            onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                            placeholder="不明な場合は空欄でOK"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>症状のカテゴリ</label>
                        <select
                            value={form.symptom_category}
                            onChange={e => setForm(prev => ({ ...prev, symptom_category: e.target.value }))}
                            style={styles.select}
                        >
                            <option value="">選択してください</option>
                            {SYMPTOM_CATEGORIES.filter(Boolean).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>
                            症状の詳細<span style={styles.required}>*</span>
                        </label>
                        <textarea
                            value={form.symptom}
                            onChange={e => setForm(prev => ({ ...prev, symptom: e.target.value }))}
                            placeholder="具体的な症状をご記入ください"
                            style={styles.textarea}
                            rows={4}
                            required
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>写真（任意）</label>
                        <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            capture="environment"
                            onChange={handlePhotoChange}
                            style={{ display: 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            style={styles.photoButton}
                        >
                            &#128247; 写真を追加
                        </button>
                        {photoPreviewUrls.length > 0 && (
                            <div style={styles.photoGrid}>
                                {photoPreviewUrls.map((url, i) => (
                                    <div key={i} style={styles.photoThumb}>
                                        <img src={url} alt={`写真${i + 1}`} style={styles.photoImg} />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            style={styles.photoRemove}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>備考</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="その他お気づきの点があればご記入ください"
                            style={styles.textarea}
                            rows={3}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        style={{
                            ...styles.submitButton,
                            opacity: submitting ? 0.6 : 1,
                        }}
                    >
                        {submitting ? '送信中...' : '修理依頼を送信'}
                    </button>
                </form>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        width: '100%',
        maxWidth: '480px',
        background: '#fff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    },
    header: {
        background: '#1e40af',
        padding: '20px 24px',
    },
    headerTitle: {
        color: '#fff',
        fontSize: '20px',
        fontWeight: 700,
        margin: 0,
    },
    headerSub: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: '13px',
        margin: '4px 0 0',
    },
    form: {
        padding: '20px 24px 24px',
    },
    field: {
        marginBottom: '16px',
    },
    label: {
        display: 'block',
        fontSize: '14px',
        fontWeight: 600,
        color: '#333',
        marginBottom: '6px',
    },
    required: {
        color: '#e53e3e',
        marginLeft: '2px',
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '16px',
        outline: 'none',
        boxSizing: 'border-box',
        WebkitAppearance: 'none',
    },
    select: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '16px',
        background: '#fff',
        outline: 'none',
        boxSizing: 'border-box',
    },
    textarea: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '16px',
        outline: 'none',
        resize: 'vertical' as const,
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    photoButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 16px',
        background: '#f3f4f6',
        border: '1px dashed #9ca3af',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#374151',
        cursor: 'pointer',
    },
    photoGrid: {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: '8px',
        marginTop: '10px',
    },
    photoThumb: {
        position: 'relative' as const,
        width: '72px',
        height: '72px',
        borderRadius: '8px',
        overflow: 'hidden',
    },
    photoImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover' as const,
    },
    photoRemove: {
        position: 'absolute' as const,
        top: '2px',
        right: '2px',
        width: '22px',
        height: '22px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        border: 'none',
        borderRadius: '50%',
        fontSize: '14px',
        lineHeight: '22px',
        textAlign: 'center' as const,
        cursor: 'pointer',
        padding: 0,
    },
    submitButton: {
        width: '100%',
        padding: '14px',
        background: '#1e40af',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: '8px',
    },
    errorBox: {
        margin: '0 24px',
        padding: '10px 14px',
        background: '#fef2f2',
        color: '#b91c1c',
        borderRadius: '8px',
        fontSize: '14px',
    },
    loadingWrapper: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '4px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
    loadingText: {
        color: '#fff',
        marginTop: '12px',
        fontSize: '16px',
    },
    successIcon: {
        textAlign: 'center' as const,
        fontSize: '48px',
        color: '#10b981',
        padding: '24px 0 8px',
    },
    successTitle: {
        textAlign: 'center' as const,
        fontSize: '22px',
        fontWeight: 700,
        color: '#111',
        margin: 0,
    },
    requestNo: {
        textAlign: 'center' as const,
        fontSize: '18px',
        fontWeight: 700,
        color: '#1e40af',
        margin: '8px 0 0',
    },
    successText: {
        textAlign: 'center' as const,
        color: '#555',
        fontSize: '14px',
        padding: '8px 24px 0',
        lineHeight: 1.6,
    },
    closeButton: {
        display: 'block',
        margin: '20px auto 24px',
        padding: '12px 48px',
        background: '#6b7280',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '15px',
        cursor: 'pointer',
    },
}
