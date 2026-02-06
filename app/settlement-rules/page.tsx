'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Branch = {
    id: string
    name: string
    tel?: string
}

type SettlementRule = {
    id: string
    branch_id: string
    pdf_url?: string
    created_at?: string
    updated_at?: string
}

export default function SettlementRulesPage() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState<string>('')
    const [settlementRule, setSettlementRule] = useState<SettlementRule | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [uploadingFile, setUploadingFile] = useState(false)

    const isDevelopment = process.env.NODE_ENV !== 'production'

    // 営業所一覧を取得
    useEffect(() => {
        const fetchBranches = async () => {
            try {
                // staffテーブルから営業所情報を取得（固定リスト）
                const branchList: Branch[] = [
                    { id: 'branch_1', name: '南九州営業所', tel: '099-269-1821' },
                    { id: 'branch_2', name: '中九州営業所', tel: '096-380-5522' },
                    { id: 'branch_3', name: '西九州営業所', tel: '0942-43-4691' },
                    { id: 'branch_4', name: '東日本営業所', tel: '0299-57-6722' },
                    { id: 'branch_5', name: '沖縄出張所', tel: '098-987-1966' },
                    { id: 'branch_6', name: '東北出張所', tel: '0178-32-6525' },
                ]
                setBranches(branchList)
            } catch (err) {
                console.error('営業所取得エラー:', err)
                setError('営業所情報の取得に失敗しました')
            }
        }

        fetchBranches()
    }, [])

    // 営業所を選択したときにPDFを取得
    const handleBranchSelect = async (branchId: string) => {
        setSelectedBranchId(branchId)
        setLoading(true)
        setError(null)

        try {
            const { data, error: fetchError } = await supabase
                .from('settlement_rules')
                .select('*')
                .eq('branch_id', branchId)
                .single()

            if (fetchError && fetchError.code !== 'PGRST116') {
                // PGRST116: 行が見つからない
                throw fetchError
            }

            setSettlementRule(data || null)
        } catch (err: any) {
            console.error('決済ルール取得エラー:', err)
            setError(err.message || '決済ルール情報の取得に失敗しました')
            setSettlementRule(null)
        } finally {
            setLoading(false)
        }
    }

    // PDFファイルをアップロード
    const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !selectedBranchId) {
            setError('ファイルと営業所を選択してください')
            return
        }

        setUploadingFile(true)
        setError(null)

        try {
            // Supabase Storageにアップロード
            const fileName = `settlement-rules/${selectedBranchId}-${Date.now()}.pdf`
            const { error: uploadError, data } = await supabase.storage
                .from('settlement-rules')
                .upload(fileName, file, { upsert: true })

            if (uploadError) throw uploadError

            // 公開URLを取得
            const { data: publicUrlData } = supabase.storage
                .from('settlement-rules')
                .getPublicUrl(fileName)

            const pdfUrl = publicUrlData.publicUrl

            // データベースに保存
            const { error: dbError } = await supabase
                .from('settlement_rules')
                .upsert(
                    {
                        branch_id: selectedBranchId,
                        pdf_url: pdfUrl,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'branch_id' }
                )

            if (dbError) throw dbError

            // ローカルの状態を更新
            setSettlementRule({
                id: settlementRule?.id || selectedBranchId,
                branch_id: selectedBranchId,
                pdf_url: pdfUrl,
            })

            alert('決済ルールPDFをアップロードしました')
        } catch (err: any) {
            console.error('アップロードエラー:', err)
            setError(err.message || 'PDFのアップロードに失敗しました')
        } finally {
            setUploadingFile(false)
            // ファイルインプットをリセット
            event.target.value = ''
        }
    }

    // 選択中の営業所情報
    const selectedBranch = branches.find((b) => b.id === selectedBranchId)

    const containerStyle: React.CSSProperties = {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '20px',
        backgroundColor: '#0f172a',
        color: '#e2e8f0',
        minHeight: '100vh',
    }

    const headerStyle: React.CSSProperties = {
        marginBottom: '30px',
    }

    const titleStyle: React.CSSProperties = {
        fontSize: '32px',
        fontWeight: 'bold',
        marginBottom: '10px',
        color: '#93c5fd',
    }

    const sectionStyle: React.CSSProperties = {
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #334155',
    }

    const labelStyle: React.CSSProperties = {
        display: 'block',
        marginBottom: '8px',
        fontWeight: '600',
        color: '#cbd5e1',
    }

    const selectStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 12px',
        backgroundColor: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #475569',
        borderRadius: '6px',
        fontSize: '14px',
        marginBottom: '20px',
    }

    const buttonStyle: React.CSSProperties = {
        padding: '10px 20px',
        backgroundColor: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        transition: 'background-color 0.2s',
    }

    const fileInputStyle: React.CSSProperties = {
        display: 'block',
        marginBottom: '20px',
        padding: '10px 0',
    }

    const pdfContainerStyle: React.CSSProperties = {
        backgroundColor: '#0f172a',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '20px',
        border: '1px solid #334155',
    }

    const iframeContainerStyle: React.CSSProperties = {
        width: '100%',
        height: '600px',
        borderRadius: '6px',
        border: '1px solid #334155',
        overflow: 'hidden',
    }

    const errorStyle: React.CSSProperties = {
        backgroundColor: '#7f1d1d',
        color: '#fca5a5',
        padding: '12px 16px',
        borderRadius: '6px',
        marginBottom: '20px',
        border: '1px solid #dc2626',
    }

    const backButtonStyle: React.CSSProperties = {
        padding: '8px 16px',
        backgroundColor: '#6b7280',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        transition: 'background-color 0.2s',
        marginBottom: '20px',
    }

    return (
        <div style={containerStyle}>
            <button
                onClick={() => window.location.href = '/'}
                style={backButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4b5563')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#6b7280')}
            >
                ← メニューへ戻る
            </button>
            <div style={headerStyle}>
                <h1 style={titleStyle}>決済ルール管理</h1>
                <p style={{ color: '#94a3b8' }}>
                    営業所を選択してPDF決済ルールを表示・管理します
                </p>
            </div>

            {error && (
                <div style={errorStyle}>
                    <strong>エラー:</strong> {error}
                </div>
            )}

            {/* 営業所選択セクション */}
            <div style={sectionStyle}>
                <label style={labelStyle}>営業所を選択</label>
                <select
                    value={selectedBranchId}
                    onChange={(e) => handleBranchSelect(e.target.value)}
                    style={selectStyle}
                >
                    <option value="">-- 営業所を選択してください --</option>
                    {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                            {branch.name} {branch.tel && `(${branch.tel})`}
                        </option>
                    ))}
                </select>
            </div>

            {/* 選択中の営業所の詳細表示 */}
            {selectedBranch && (
                <div style={sectionStyle}>
                    <h2 style={{ color: '#93c5fd', marginBottom: '16px' }}>
                        {selectedBranch.name}
                    </h2>
                    <p style={{ marginBottom: '12px', color: '#cbd5e1' }}>
                        <strong>電話:</strong> {selectedBranch.tel || '未設定'}
                    </p>

                    {/* PDFアップロードセクション */}
                    {isDevelopment ? (
                        <div
                            style={{
                                backgroundColor: '#0f172a',
                                padding: '16px',
                                borderRadius: '6px',
                                marginTop: '16px',
                                border: '1px solid #334155',
                            }}
                        >
                            <h3 style={{ color: '#93c5fd', marginBottom: '12px', fontSize: '16px' }}>
                                決済ルールPDFをアップロード
                            </h3>
                            <label style={fileInputStyle}>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfUpload}
                                    disabled={uploadingFile}
                                    style={{ cursor: uploadingFile ? 'not-allowed' : 'pointer' }}
                                />
                            </label>
                            {uploadingFile && (
                                <p style={{ color: '#fbbf24', fontSize: '14px' }}>
                                    アップロード中...
                                </p>
                            )}
                        </div>
                    ) : (
                        <div
                            style={{
                                backgroundColor: '#0f172a',
                                padding: '16px',
                                borderRadius: '6px',
                                marginTop: '16px',
                                border: '1px solid #334155',
                            }}
                        >
                            <h3 style={{ color: '#93c5fd', marginBottom: '8px', fontSize: '16px' }}>
                                決済ルールPDFのアップロード
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                                運用後はアップロード機能を無効化しています。
                            </p>
                        </div>
                    )}

                    {/* PDF表示セクション */}
                    {loading ? (
                        <div
                            style={{
                                marginTop: '20px',
                                padding: '20px',
                                textAlign: 'center',
                                color: '#cbd5e1',
                            }}
                        >
                            読み込み中...
                        </div>
                    ) : settlementRule?.pdf_url ? (
                        <div style={pdfContainerStyle}>
                            <h3 style={{ color: '#93c5fd', marginBottom: '12px', fontSize: '16px' }}>
                                決済ルール PDF
                            </h3>
                            <iframe
                                src={settlementRule.pdf_url}
                                title="決済ルール PDF"
                                style={iframeContainerStyle}
                            />
                            <div style={{ marginTop: '12px' }}>
                                <a
                                    href={settlementRule.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        ...buttonStyle,
                                        display: 'inline-block',
                                        marginRight: '12px',
                                        backgroundColor: '#10b981',
                                    }}
                                >
                                    新しいタブで開く
                                </a>
                                <a
                                    href={settlementRule.pdf_url}
                                    download
                                    style={{
                                        ...buttonStyle,
                                        display: 'inline-block',
                                        backgroundColor: '#6366f1',
                                    }}
                                >
                                    ダウンロード
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                marginTop: '20px',
                                padding: '20px',
                                backgroundColor: '#1e2a3a',
                                borderRadius: '6px',
                                textAlign: 'center',
                                color: '#cbd5e1',
                                border: '1px dashed #475569',
                            }}
                        >
                            <p>この営業所の決済ルールPDFがまだアップロードされていません</p>
                            <p style={{ fontSize: '12px', marginTop: '8px', color: '#94a3b8' }}>
                                上のフォームからPDFをアップロードしてください
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* 営業所が未選択の場合 */}
            {!selectedBranch && (
                <div
                    style={{
                        ...sectionStyle,
                        textAlign: 'center',
                        color: '#94a3b8',
                        padding: '40px',
                    }}
                >
                    <p>営業所を選択してください</p>
                </div>
            )}
        </div>
    )
}
