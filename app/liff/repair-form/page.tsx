'use client'

/**
 * LINE リッチメニュー設定例（公式アカウントマネージャー → リッチメニュー → 各エリアのアクション）:
 * - 修理受付: リンク URI → https://liff.line.me/<NEXT_PUBLIC_LIFF_ID と同じ LIFF ID>
 *   （エンドポイント URL が https://<本番ドメイン>/liff/repair-form の場合、その LIFF を開く）
 * - AI診断: 別 LIFF 推奨（リッチメニューが ?mode=ai 付き URL を拒否するため）
 *   - Endpoint: https://<本番ドメイン>/liff/ai
 *   - リンク: https://liff.line.me/<AI用LIFF_ID>
 *   （同一 LIFF のまま使う場合のみ: https://liff.line.me/<ID>?mode=ai ※マネージャーで弾かれることが多い）
 * - 公式HP 等: 従来どおり外部 URL で可
 */

import { Suspense, useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { SHEET_TYPE_OPTIONS, repairCategoryToSheetType, getSheetTypeLabel } from '@/lib/customerRegisterSheetTypes'
import {
    getStaffDepartmentsForBranch,
    isBranchOther,
    isStaffOutsideSalesBranches,
    LIFF_REPAIR_BRANCH_OPTIONS,
} from '@/lib/branches'
import { toEndUserRepairAiError } from '@/lib/difyClient'

type StaffOption = { name: string; branch_id: string | null; department: string | null }

function staffOptionsForBranch(staffs: StaffOption[], branchId: string): StaffOption[] {
    if (!branchId) return []
    if (isBranchOther(branchId)) {
        return staffs.filter((s) => isStaffOutsideSalesBranches(s))
    }
    const deptNames = new Set(getStaffDepartmentsForBranch(branchId))
    return staffs.filter((s) => {
        if (s.branch_id === branchId) return true
        if (s.department && deptNames.has(s.department)) return true
        return false
    })
}

const LIFF_PREFILL_KEY = 'liff_repair_prefill_v1'

type LiffModule = {
    init: (config: { liffId: string }) => Promise<void>
    isLoggedIn: () => boolean
    isInClient: () => boolean
    login: () => void
    getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>
    closeWindow: () => void
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || ''
const LIFF_ID_AI = process.env.NEXT_PUBLIC_LIFF_ID_AI || ''

function isAiEntryPath(): boolean {
    if (typeof window === 'undefined') return false
    return window.location.pathname.replace(/\/$/, '').endsWith('/liff/ai')
}

function formatLiffInitError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    if (/invalid liff|liff id/i.test(msg)) {
        return 'LIFF IDが正しくありません。LINE Developers のエンドポイントURLと Vercel の LIFF ID 設定を確認してください。'
    }
    if (/init|permission|denied/i.test(msg)) {
        return 'LINEアプリから開いてください。ブラウザだけでは連携できない場合があります。'
    }
    return 'LINEとの連携に失敗しました。LINEアプリから再度お試しください。'
}

function RepairFormInner() {
    const searchParams = useSearchParams()
    const mode = searchParams.get('mode') === 'ai' || isAiEntryPath() ? 'ai' : 'repair'

    const [liff, setLiff] = useState<LiffModule | null>(null)
    const [profile, setProfile] = useState<{ userId: string; displayName: string } | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [requestNo, setRequestNo] = useState<number | null>(null)
    const [error, setError] = useState('')
    /** AIモード: LIFF失敗時も検索は続行（赤い致命エラーにしない） */
    const [liffNotice, setLiffNotice] = useState('')
    const photoInputRef = useRef<HTMLInputElement>(null)

    const [form, setForm] = useState({
        customer_name: '',
        category: '',
        custom_category: '',
        model: '',
        symptom: '',
        symptom_category: '',
        customer_address: '',
        customer_phone: '',
        customer_mobile: '',
        customer_region: '',
        assigned_branch: '',
        assigned_staff: '',
        notes: '',
    })
    const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
    const [optionsLoading, setOptionsLoading] = useState(true)
    const [photos, setPhotos] = useState<File[]>([])
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])

    const [aiSheetCategory, setAiSheetCategory] = useState('')
    const [aiSymptom, setAiSymptom] = useState('')
    const [aiAnswer, setAiAnswer] = useState<string | null>(null)
    const [aiSearching, setAiSearching] = useState(false)
    const [closeHint, setCloseHint] = useState('')

    const filteredStaffOptions = useMemo(
        () => staffOptionsForBranch(staffOptions, form.assigned_branch),
        [staffOptions, form.assigned_branch],
    )

    useEffect(() => {
        if (mode !== 'repair') return
        let cancelled = false
        setOptionsLoading(true)
        fetch('/api/repair-form-options')
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (cancelled) return
                if (!ok || data.error) {
                    setError(data.error || '担当者・営業所の取得に失敗しました')
                    return
                }
                if (data.staffs) setStaffOptions(data.staffs as StaffOption[])
            })
            .catch(() => {
                if (!cancelled) setError('担当者・営業所の取得に失敗しました')
            })
            .finally(() => {
                if (!cancelled) setOptionsLoading(false)
            })
        return () => { cancelled = true }
    }, [mode])

    useEffect(() => {
        const isAi = mode === 'ai'
        const liffId = isAi ? (LIFF_ID_AI || LIFF_ID) : LIFF_ID

        const applyUrlAndSessionPrefill = (displayName?: string) => {
            const urlParams = new URLSearchParams(window.location.search)
            const preCategory = urlParams.get('category') || ''
            const preSymptom = urlParams.get('symptom') || ''
            let stored: { category?: string; symptom?: string } | null = null
            try {
                const raw = sessionStorage.getItem(LIFF_PREFILL_KEY)
                if (raw) stored = JSON.parse(raw) as { category?: string; symptom?: string }
            } catch { /* ignore */ }
            sessionStorage.removeItem(LIFF_PREFILL_KEY)

            if (isAi) {
                const cat = preCategory ? repairCategoryToSheetType(preCategory) : (stored?.category || '')
                const sym = preSymptom || stored?.symptom || ''
                setAiSheetCategory(cat)
                setAiSymptom(sym)
            } else {
                const catFromStore = stored?.category ? repairCategoryToSheetType(stored.category) : ''
                const symFromStore = stored?.symptom || ''
                setForm(prev => ({
                    ...prev,
                    customer_name: displayName || prev.customer_name,
                    ...(preCategory ? { category: repairCategoryToSheetType(preCategory) } : catFromStore ? { category: catFromStore } : {}),
                    ...(preSymptom ? { symptom: preSymptom } : symFromStore ? { symptom: symFromStore } : {}),
                }))
            }
        }

        if (!liffId) {
            if (isAi) {
                setLiffNotice('LINE連携は未設定ですが、AI検索は利用できます。')
                applyUrlAndSessionPrefill()
            } else {
                setError('LIFF IDが設定されていません（NEXT_PUBLIC_LIFF_ID）')
            }
            setLoading(false)
            return
        }

        import('@line/liff').then(mod => {
            const liffMod = mod.default as unknown as LiffModule
            liffMod.init({ liffId }).then(() => {
                setLiff(liffMod)
                if (!liffMod.isLoggedIn()) {
                    liffMod.login()
                    return
                }
                return liffMod.getProfile()
                    .then((p) => {
                        setProfile(p)
                        applyUrlAndSessionPrefill(p.displayName)
                    })
                    .catch((e) => {
                        console.error('LIFF getProfile error:', e)
                        if (isAi) {
                            setLiffNotice('LINEプロフィールは取得できませんでしたが、AI検索は利用できます。')
                            applyUrlAndSessionPrefill()
                        } else {
                            setError('LINEプロフィールの取得に失敗しました。LINEアプリから再度開いてください。')
                        }
                    })
                    .finally(() => setLoading(false))
            }).catch((e: unknown) => {
                console.error('LIFF init error:', e, { liffId, isAi })
                if (isAi) {
                    setLiffNotice('LINE連携に失敗しましたが、AI検索は利用できます。')
                    applyUrlAndSessionPrefill()
                } else {
                    setError(formatLiffInitError(e))
                }
                setLoading(false)
            })
        }).catch((e) => {
            console.error('LIFF SDK load error:', e)
            if (isAi) {
                setLiffNotice('LINE連携に失敗しましたが、AI検索は利用できます。')
                applyUrlAndSessionPrefill()
            } else {
                setError('LINE連携モジュールの読み込みに失敗しました。')
            }
            setLoading(false)
        })
    }, [mode])

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

    const handleAiSearch = async () => {
        if (!aiSymptom.trim()) {
            setError('症状を入力してください')
            return
        }
        setError('')
        setAiSearching(true)
        setAiAnswer(null)
        try {
            const categoryLabel = aiSheetCategory ? getSheetTypeLabel(aiSheetCategory) : ''
            const res = await fetch('/api/dify/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: categoryLabel,
                    symptom: aiSymptom.trim(),
                    user_id: profile?.userId ? `line-${profile.userId}` : `line-anon-${Date.now()}`,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'AI検索に失敗しました')
            setAiAnswer(data.answer || '')
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'AI検索に失敗しました'
            setAiAnswer(toEndUserRepairAiError(msg))
        } finally {
            setAiSearching(false)
        }
    }

    const goToRepairFromAi = () => {
        try {
            sessionStorage.setItem(LIFF_PREFILL_KEY, JSON.stringify({
                category: aiSheetCategory || '',
                symptom: aiSymptom.trim(),
            }))
        } catch { /* ignore */ }
        window.location.assign(new URL('/liff/repair-form', window.location.origin).toString())
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.customer_name.trim()) {
            setError('お名前を入力してください')
            return
        }
        if (!form.category) {
            setError('機械の種別を選択してください')
            return
        }
        if (!form.customer_phone.trim()) {
            setError('電話番号を入力してください')
            return
        }
        if (!form.assigned_branch) {
            setError('管轄営業所を選択してください')
            return
        }
        if (!form.assigned_staff) {
            setError('担当者を選択してください')
            return
        }
        if (!form.symptom_category) {
            setError('症状のカテゴリを選択してください')
            return
        }
        setSubmitting(true)
        setError('')

        try {
            const resolvedCategory = form.category === 'unknown' && form.custom_category.trim()
                ? form.custom_category.trim()
                : form.category
            const { custom_category, ...formData } = form
            const body = {
                ...formData,
                category: resolvedCategory,
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
        setCloseHint('')
        void import('@line/liff').then((mod) => {
            const liffSdk = mod.default as unknown as LiffModule
            try {
                if (typeof liffSdk.isInClient === 'function' && !liffSdk.isInClient()) {
                    setCloseHint(
                        'LINEアプリのトーク内で開いていないため、自動では閉じられません。画面左上の「×」または戻るでトーク画面に戻ってください。',
                    )
                    return
                }
                liffSdk.closeWindow()
            } catch (e) {
                console.error('liff.closeWindow error:', e)
                setCloseHint(
                    '画面を閉じられませんでした。LINEアプリの「×」または戻るでトーク画面に戻ってください。',
                )
            }
        }).catch(() => {
            setCloseHint('LINE連携を読み込めませんでした。ブラウザの戻る、またはLINEの「×」でトークに戻ってください。')
        })
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

    if (mode === 'ai') {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.headerAi}>
                        <h1 style={styles.headerTitle}>AI診断（修理ナレッジ）</h1>
                        <p style={styles.headerSub}>機種と症状から参考情報を表示します（確定診断ではありません）</p>
                    </div>
                    <div style={styles.form}>
                        {liffNotice && (
                            <div style={{ ...styles.noticeBox, margin: '0 0 16px' }}>{liffNotice}</div>
                        )}
                        {error && <div style={{ ...styles.errorBox, margin: '0 0 16px' }}>{error}</div>}
                        <div style={styles.field}>
                            <label style={styles.label}>機械の種別（任意）</label>
                            <select
                                value={aiSheetCategory}
                                onChange={e => setAiSheetCategory(e.target.value)}
                                style={styles.select}
                            >
                                <option value="">選択してください</option>
                                {SHEET_TYPE_OPTIONS.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>
                                症状・状況<span style={styles.required}>*</span>
                            </label>
                            <textarea
                                value={aiSymptom}
                                onChange={e => setAiSymptom(e.target.value)}
                                placeholder="例: 着火しない、エラー表示 など"
                                style={styles.textarea}
                                rows={4}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleAiSearch()}
                            disabled={aiSearching}
                            style={{
                                ...styles.submitButtonAi,
                                opacity: aiSearching ? 0.6 : 1,
                            }}
                        >
                            {aiSearching ? '検索中...' : '症状をAIで検索'}
                        </button>
                        {aiAnswer && (
                            <div style={styles.aiAnswerBox}>
                                <div style={styles.aiAnswerLabel}>検索結果</div>
                                <div style={styles.aiAnswerBody}>{aiAnswer}</div>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={goToRepairFromAi}
                            style={styles.secondaryButton}
                        >
                            この内容で修理を依頼する
                        </button>
                        <button type="button" onClick={handleClose} style={styles.ghostButton}>
                            閉じる
                        </button>
                    </div>
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
                    <button type="button" onClick={handleClose} style={styles.closeButton}>
                        閉じる
                    </button>
                    {closeHint && (
                        <p style={{ marginTop: 14, fontSize: 13, color: '#fde68a', lineHeight: 1.6, textAlign: 'center' }}>
                            {closeHint}
                        </p>
                    )}
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

                <style>{`
                    .repair-liff-form input::placeholder,
                    .repair-liff-form textarea::placeholder {
                        color: #94a3b8;
                    }
                    .repair-liff-field option {
                        background: #0f172a;
                        color: #f8fafc;
                    }
                `}</style>
                <form onSubmit={handleSubmit} style={styles.form} className="repair-liff-form">
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
                        <label style={styles.label}>
                            機械の種別<span style={styles.required}>*</span>
                        </label>
                        <select
                            value={form.category}
                            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                            style={styles.select}
                            className="repair-liff-field"
                            required
                        >
                            <option value="">選択してください</option>
                            {SHEET_TYPE_OPTIONS.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        {form.category === 'unknown' && (
                            <input
                                type="text"
                                value={form.custom_category}
                                onChange={e => setForm(prev => ({ ...prev, custom_category: e.target.value }))}
                                placeholder="種別を入力してください"
                                style={{ ...styles.input, marginTop: '8px' }}
                                required
                            />
                        )}
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>住所</label>
                        <input
                            type="text"
                            value={form.customer_address}
                            onChange={e => setForm(prev => ({ ...prev, customer_address: e.target.value }))}
                            placeholder="例: 宮崎県宮崎市…"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>
                            電話番号<span style={styles.required}>*</span>
                        </label>
                        <input
                            type="tel"
                            value={form.customer_phone}
                            onChange={e => setForm(prev => ({ ...prev, customer_phone: e.target.value }))}
                            placeholder="例: 0985-00-0000"
                            style={styles.input}
                            required
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>携帯電話</label>
                        <input
                            type="tel"
                            value={form.customer_mobile}
                            onChange={e => setForm(prev => ({ ...prev, customer_mobile: e.target.value }))}
                            placeholder="例: 090-1234-5678"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>地域</label>
                        <input
                            type="text"
                            value={form.customer_region}
                            onChange={e => setForm(prev => ({ ...prev, customer_region: e.target.value }))}
                            placeholder="例: 宮崎県"
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>
                            管轄営業所<span style={styles.required}>*</span>
                        </label>
                        <select
                            value={form.assigned_branch}
                            onChange={e => setForm(prev => ({
                                ...prev,
                                assigned_branch: e.target.value,
                                assigned_staff: '',
                            }))}
                            style={styles.select}
                            className="repair-liff-field"
                            required
                            disabled={optionsLoading}
                        >
                            <option value="">選択してください</option>
                            {LIFF_REPAIR_BRANCH_OPTIONS.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>
                            担当者<span style={styles.required}>*</span>
                        </label>
                        <select
                            value={form.assigned_staff}
                            onChange={e => setForm(prev => ({ ...prev, assigned_staff: e.target.value }))}
                            style={styles.select}
                            className="repair-liff-field"
                            required
                            disabled={optionsLoading || !form.assigned_branch}
                        >
                            <option value="">
                                {!form.assigned_branch
                                    ? '先に営業所を選択'
                                    : filteredStaffOptions.length === 0
                                        ? isBranchOther(form.assigned_branch)
                                            ? '営業所所属外の担当者が未登録'
                                            : '担当者が未登録'
                                        : '選択してください'}
                            </option>
                            {filteredStaffOptions.map((s) => (
                                <option key={s.name} value={s.name}>
                                    {s.department && isBranchOther(form.assigned_branch)
                                        ? `${s.name}（${s.department}）`
                                        : s.name}
                                </option>
                            ))}
                        </select>
                        <p style={styles.fieldHint}>
                            {isBranchOther(form.assigned_branch)
                                ? '企画部など、営業所に所属しない担当者が表示されます。選択した担当者へ、LINE連携済みの場合は受付後に案件詳細リンクを自動送信します。'
                                : '選択した担当者へ、LINE連携済みの場合は受付後に案件詳細リンクを自動送信します。'}
                        </p>
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
                        <label style={styles.label}>
                            症状のカテゴリ<span style={styles.required}>*</span>
                        </label>
                        <select
                            value={form.symptom_category}
                            onChange={e => setForm(prev => ({ ...prev, symptom_category: e.target.value }))}
                            style={styles.select}
                            className="repair-liff-field"
                            required
                        >
                            <option value="">選択してください</option>
                            {SYMPTOM_CATEGORIES.filter(Boolean).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>症状の詳細</label>
                        <textarea
                            value={form.symptom}
                            onChange={e => setForm(prev => ({ ...prev, symptom: e.target.value }))}
                            placeholder="具体的な症状があればご記入ください（任意）"
                            style={styles.textarea}
                            rows={4}
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
        background: '#0f172a',
    },
    field: {
        marginBottom: '16px',
    },
    label: {
        display: 'block',
        fontSize: '14px',
        fontWeight: 600,
        color: '#f8fafc',
        marginBottom: '6px',
    },
    required: {
        color: '#e53e3e',
        marginLeft: '2px',
    },
    fieldHint: {
        margin: '6px 0 0',
        fontSize: '12px',
        color: '#94a3b8',
        lineHeight: 1.4,
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #475569',
        borderRadius: '8px',
        fontSize: '16px',
        outline: 'none',
        boxSizing: 'border-box',
        WebkitAppearance: 'none',
        background: '#1e293b',
        color: '#f8fafc',
    },
    select: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #475569',
        borderRadius: '8px',
        fontSize: '16px',
        background: '#1e293b',
        color: '#f8fafc',
        outline: 'none',
        boxSizing: 'border-box',
        WebkitAppearance: 'none',
    },
    textarea: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #475569',
        borderRadius: '8px',
        fontSize: '16px',
        outline: 'none',
        resize: 'vertical' as const,
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        background: '#1e293b',
        color: '#f8fafc',
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
        background: '#450a0a',
        color: '#fecaca',
        borderRadius: '8px',
        fontSize: '14px',
        border: '1px solid #991b1b',
    },
    noticeBox: {
        padding: '10px 14px',
        background: '#422006',
        color: '#fde68a',
        borderRadius: '8px',
        fontSize: '13px',
        border: '1px solid #b45309',
        lineHeight: 1.5,
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
    headerAi: {
        background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
        padding: '20px 24px',
    },
    submitButtonAi: {
        width: '100%',
        padding: '14px',
        background: '#ea580c',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: '8px',
    },
    aiAnswerBox: {
        marginTop: '16px',
        padding: '14px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
    },
    aiAnswerLabel: {
        fontSize: '12px',
        fontWeight: 700,
        color: '#64748b',
        marginBottom: '8px',
    },
    aiAnswerBody: {
        fontSize: '14px',
        color: '#1e293b',
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap' as const,
    },
    secondaryButton: {
        width: '100%',
        padding: '12px',
        marginTop: '14px',
        background: '#1e40af',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    ghostButton: {
        width: '100%',
        padding: '10px',
        marginTop: '10px',
        background: 'transparent',
        color: '#64748b',
        border: 'none',
        fontSize: '14px',
        cursor: 'pointer',
    },
}

export default function RepairFormPage() {
    return (
        <Suspense fallback={(
            <div style={styles.container}>
                <div style={styles.loadingWrapper}>
                    <div style={styles.spinner} />
                    <p style={styles.loadingText}>読み込み中...</p>
                </div>
            </div>
        )}
        >
            <RepairFormInner />
        </Suspense>
    )
}
