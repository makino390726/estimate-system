'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALL_PRESETS, type ExcelFormatPreset } from '@/lib/excelFormatPresets'

type Stage = 'upload' | 'preview' | 'mapping' | 'confirm'

export default function ImportExcelPage() {
  const router = useRouter()

  const resolvePreset = (presetId?: string, fallback?: ExcelFormatPreset) =>
    ALL_PRESETS.find(p => p.id === presetId) || fallback || ALL_PRESETS.find(p => p.id === 'default') || ALL_PRESETS[0]

  const [file, setFile] = useState<File | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [stage, setStage] = useState<Stage>('upload')
  const [previewData, setPreviewData] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
      setResult(null)
    }
  }

  // ★新機能：プレビュー取得
  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('ファイルを選択してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('presetId', selectedPreset)
      formData.append('mode', 'preview')  // ★プレビューモード

      const response = await fetch('/api/send-approval-email/import_estimate_excel', {
        method: 'POST',
        body: formData
      })

      const text = await response.text()
      if (!response.ok) {
        setError(`【エラー ${response.status}】${text || 'APIエラーが発生しました'}`)
        return
      }

      const data = JSON.parse(text)
      if (!data.ok) {
        setError(data.message || 'プレビュー取得に失敗しました')
        return
      }

      setPreviewData(data)
      
      // ★プリセット決定: ユーザーが選択したものを優先、auto時のみ検出結果を採用
      const finalPresetId = selectedPreset === 'auto' ? (data.preset?.id || 'default') : selectedPreset
      setSelectedPreset(finalPresetId)
      
      setStage('preview')
      setLoading(false)
    } catch (e: any) {
      setError(`【エラー】${e.message}`)
      setLoading(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault?.()
    if (!file) {
      setError('ファイルを選択してください')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // PDFかExcelかを判定してAPIを切り替え
      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const apiUrl = isPdf 
        ? '/api/send-approval-email/import_estimate_pdf'
        : '/api/send-approval-email/import_estimate_excel'
      
      if (!isPdf) {
        formData.append('presetId', selectedPreset)  // プリセットIDを送信
        formData.append('mode', 'import')
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData
      })

      // レスポンステキストを取得して確認
      const text = await response.text()
      console.log('API Response Status:', response.status)
      console.log('API Response Text:', text)

      if (!response.ok) {
        setError(`【エラー ${response.status}】${text || 'APIエラーが発生しました'}`)
        return
      }

      // JSONをパース
      let data
      try {
        data = JSON.parse(text)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError, 'Response:', text)
        setError(`【JSON解析エラー】レスポンスがJSONではありません: ${text.slice(0, 200)}`)
        return
      }

      if (!data.ok) {
        setError(data.message || 'インポートに失敗しました')
        return
      }

      // ✅ 解析成功 → 確認画面へデータを渡して遷移
      if (data.parsed) {
        console.log('[ImportPage] API returned data:', {
          sections: data.sections,
          detailsCount: data.details?.length,
          estimateNo: data.estimateNo,
          estimateDate: data.estimateDate
        })
        
        sessionStorage.setItem('excel_import_data', JSON.stringify(data))
        router.push('/cases/import-excel/confirm')
      } else {
        setResult(data)
      }
    } catch (err: any) {
      setError(err?.message || '通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui', backgroundColor: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>
      <button
        onClick={() => router.push('/selectors')}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← メニューに戻る
      </button>

      <h1 style={{ color: 'inherit' }}>📋 見積書のインポート（プレビュー・マッピング機能付き）</h1>

      {/* ========== ステージ1: アップロード ========== */}
      {stage === 'upload' && (
        <form onSubmit={handlePreview} style={{ marginTop: '30px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="file" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: 'inherit' }}>
              見積書ファイル（Excelファイル .xlsx）を選択:
            </label>
            <input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={loading}
              style={{
                display: 'block',
                padding: '8px',
                border: '1px solid var(--input-border)',
                borderRadius: '4px',
                width: '100%',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--foreground)'
              }}
            />
            {file && (
              <p style={{ marginTop: '8px', color: 'var(--muted-foreground)', fontWeight: '500' }}>
                📁 {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: 'inherit' }}>
              📋 Excelフォーマット設定:
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid var(--input-border)',
                borderRadius: '4px',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--foreground)',
                marginBottom: '10px'
              }}
            >
              <option value="auto">🔍 自動判定（推奨）</option>
              <option value="default">📄 標準縦見積書</option>
              <option value="horizontal">📊 横見積書</option>
              <option value="simple">📝 シンプル見積書</option>
              <option value="minamikyushu">🏢 南九州営業所フォーマット</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!file || loading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              marginTop: '20px',
              backgroundColor: loading || !file ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'プレビュー取得中...' : '→ プレビューに進む'}
          </button>
        </form>
      )}

      {/* ========== ステージ2: プレビュー表示 ========== */}
      {stage === 'preview' && previewData && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ color: 'inherit' }}>📊 Excelデータプレビュー</h2>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '20px' }}>
            以下のデータが読み込まれました。列のマッピングを設定してください。
          </p>

          <div style={{ 
            padding: '12px', 
            backgroundColor: 'var(--accent-light)',
            border: '2px solid var(--primary)',
            borderRadius: '4px',
            marginBottom: '20px',
            fontSize: '14px',
            color: 'inherit'
          }}>
            <strong>📌 フォーマット:</strong> {previewData.preset.name}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '30px' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)'
              }}
            >
              <tbody>
                {(previewData.rows || []).map((row: any, idx: number) => (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: idx % 2 === 0 ? 'var(--card-alt)' : 'var(--card)',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    <td
                      style={{
                        padding: '8px',
                        fontWeight: 'bold',
                        backgroundColor: 'var(--muted-bg)',
                        textAlign: 'center',
                        width: '60px',
                        color: 'inherit'
                      }}
                    >
                      {row.rowNum}
                    </td>
                    {row.cells.map((cell: any, cidx: number) => (
                      <td
                        key={cidx}
                        style={{
                          padding: '8px',
                          borderRight: '1px solid var(--border)',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'inherit'
                        }}
                        title={cell.value}
                      >
                        <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>[{cell.col}]</span>{' '}
                        {cell.value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={() => setStage('upload')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ← 戻る
            </button>
            <button
              onClick={() => handleSubmit()}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              → インポート実行
            </button>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: 'var(--card)',
            border: '2px solid #ff6b6b',
            borderRadius: '4px',
            color: '#ff6b6b'
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>❌ エラー</h3>
          <p style={{ margin: '0' }}>{error}</p>
        </div>
      )}

      {/* 成功表示 */}
      {result && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: 'var(--card)',
            border: '2px solid #51cf66',
            borderRadius: '4px',
            color: '#51cf66'
          }}
        >
          <h3 style={{ margin: '0 0 12px 0' }}>✅ インポート成功</h3>
          <p style={{ margin: '0' }}>確認画面へ移動します...</p>
        </div>
      )}
    </div>
  )
}
