'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALL_PRESETS, type ExcelFormatPreset } from '@/lib/excelFormatPresets'

export default function ImportExcelPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [layoutType, setLayoutType] = useState<'auto' | 'vertical' | 'horizontal'>('auto')
  const [selectedPreset, setSelectedPreset] = useState<string>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
      setResult(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        formData.append('layoutType', layoutType)  // レイアウトタイプを送信
        formData.append('presetId', selectedPreset)  // プリセットIDを送信
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
          firstDetail: data.details?.[0],
          secondDetail: data.details?.[1],
          thirdDetail: data.details?.[2]
        })
        // sessionStorageに解析データを保存
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
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui' }}>
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

      <h1>見積書のインポート（Excel / PDF対応）</h1>

      <form onSubmit={handleSubmit} style={{ marginTop: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="file" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
            見積書ファイル（Excel .xlsx または PDF .pdf）を選択:
          </label>
          <input
            id="file"
            type="file"
            accept=".xlsx,.xls,.pdf"
            onChange={handleFileChange}
            disabled={loading}
            style={{
              display: 'block',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '100%'
            }}
          />
          {file && (
            <p style={{ marginTop: '8px', color: '#333', fontWeight: '500' }}>
              {file.name.toLowerCase().endsWith('.pdf') ? '📄' : '📁'} {file.name} ({(file.size / 1024).toFixed(2)} KB)
              {file.name.toLowerCase().endsWith('.pdf') && (
                <span style={{ marginLeft: '8px', color: '#ff6b00', fontSize: '12px' }}>※ PDF形式</span>
              )}
            </p>
          )}
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            📋 Excelフォーマット設定:
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: 'white',
              marginBottom: '10px'
            }}
          >
            <option value="auto">🔍 自動判定（推奨）</option>
            <option value="default">📄 標準縦見積書（表紙・目次・明細シート分割型）</option>
            <option value="horizontal">📊 横見積書（単一シート型）</option>
            <option value="simple">📝 シンプル見積書（最小限の項目）</option>
          </select>
          
          {selectedPreset !== 'auto' && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f0f7ff', 
              border: '1px solid #b3d9ff',
              borderRadius: '4px',
              fontSize: '13px',
              marginBottom: '10px'
            }}>
              <strong>選択中: </strong>
              {ALL_PRESETS.find(p => p.id === selectedPreset)?.description || ''}
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            見積書レイアウト:
          </label>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="layoutType"
                value="auto"
                checked={layoutType === 'auto'}
                onChange={(e) => setLayoutType(e.target.value as 'auto')}
                style={{ marginRight: '6px' }}
              />
              <span>自動判定（推奨）</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="layoutType"
                value="vertical"
                checked={layoutType === 'vertical'}
                onChange={(e) => setLayoutType(e.target.value as 'vertical')}
                style={{ marginRight: '6px' }}
              />
              <span>縦見積（表紙・明細シート分割）</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="layoutType"
                value="horizontal"
                checked={layoutType === 'horizontal'}
                onChange={(e) => setLayoutType(e.target.value as 'horizontal')}
                style={{ marginRight: '6px' }}
              />
              <span>横見積（単一シート）</span>
            </label>
          </div>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
            💡 自動判定: シート名に「表紙」「明細」があれば縦見積、なければ横見積として処理します
          </p>
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
          {loading ? 'インポート中...' : 'インポート実行'}
        </button>
      </form>

      {error && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: '#fee',
            border: '1px solid #f99',
            borderRadius: '4px',
            color: '#c00'
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>❌ エラー</h3>
          <p style={{ margin: '0 0 12px 0' }}>{error}</p>
          <details style={{ fontSize: '12px', marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer' }}>詳細を表示</summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '8px',
                backgroundColor: '#fff',
                border: '1px solid #f99',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '300px'
              }}
            >
              {error}
            </pre>
            <p style={{ fontSize: '11px', margin: '8px 0 0 0', color: '#666' }}>
              ⚠️ ブラウザの開発者ツール（F12）→ コンソールタブを確認してください
            </p>
          </details>
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: '#efe',
            border: '1px solid #9f9',
            borderRadius: '4px',
            color: '#060'
          }}
        >
          <h3 style={{ margin: '0 0 12px 0' }}>✅ インポート成功</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#060' }}>
            🔄 確認画面へ自動的に移動します...
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #9f9' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>案件ID:</td>
                <td style={{ padding: '8px' }}>
                  <code>{result.case_id}</code>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #9f9' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>顧客名:</td>
                <td style={{ padding: '8px' }}>{result.customerName}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #9f9' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>件名:</td>
                <td style={{ padding: '8px' }}>{result.subject || '（未設定）'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #9f9' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>明細件数:</td>
                <td style={{ padding: '8px' }}>{result.imported.details}件</td>
              </tr>
              <tr>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>合計金額:</td>
                <td style={{ padding: '8px' }}>¥{(result.imported.totalAmount || 0).toLocaleString('ja-JP')}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>📋 明細一覧</h4>
            {result.imported.detailRows && result.imported.detailRows.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    backgroundColor: '#fff'
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#e8f5e9', borderBottom: '2px solid #9f9' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>品名</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>規格</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>数量</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>単位</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>単価</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.imported.detailRows.map((row: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px', borderRight: '1px solid #f0f0f0' }}>{row.item_name}</td>
                        <td style={{ padding: '8px', borderRight: '1px solid #f0f0f0', fontSize: '12px', color: '#666' }}>
                          {row.spec ? row.spec.split('\n').join(' / ') : ''}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', borderRight: '1px solid #f0f0f0' }}>
                          {row.quantity}
                        </td>
                        <td style={{ padding: '8px', borderRight: '1px solid #f0f0f0' }}>{row.unit}</td>
                        <td style={{ padding: '8px', textAlign: 'right', borderRight: '1px solid #f0f0f0' }}>
                          ¥{row.unit_price.toLocaleString('ja-JP')}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                          ¥{row.amount.toLocaleString('ja-JP')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666' }}>明細データはありません</p>
            )}
          </div>

          <details style={{ marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#0070f3' }}>
              📊 生JSON表示（デバッグ用）
            </summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '11px',
                maxHeight: '300px'
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <div
        style={{
          marginTop: '40px',
          padding: '16px',
          backgroundColor: '#f0f0f0',
          borderRadius: '4px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#111'
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', color: '#000' }}>📝 使用方法</h3>
        <ol style={{ margin: '0', paddingLeft: '20px', color: '#222' }}>
          <li style={{ marginBottom: '12px' }}>
            <strong>ファイルを準備</strong>
            <ul style={{ marginTop: '4px', color: '#444', fontSize: '13px' }}>
              <li>📄 <strong>Excelファイル (.xlsx)</strong>
                <ul style={{ marginTop: '4px' }}>
                  <li>標準フォーマット: 表紙・目次・明細シートに分かれた縦見積書</li>
                  <li>横見積書: 単一シートに全情報が含まれる見積書</li>
                  <li>シンプル見積書: 最小限の項目で構成された簡易見積書</li>
                </ul>
              </li>
              <li style={{ marginTop: '8px' }}>📑 <strong>PDFファイル (.pdf)</strong>
                <ul style={{ marginTop: '4px' }}>
                  <li>テキストベースのPDF（コピー可能なテキストを含む）</li>
                  <li>見積書フォーマット（件名、顧客名、明細テーブルなど）</li>
                  <li>※ 画像スキャンPDFは非対応</li>
                </ul>
              </li>
            </ul>
          </li>
          <li style={{ marginBottom: '12px' }}>
            <strong>フォーマット設定を選択（Excelのみ）</strong>
            <ul style={{ marginTop: '4px', color: '#444', fontSize: '13px' }}>
              <li>🔍 自動判定: システムがシート構造から最適なフォーマットを判定（推奨）</li>
              <li>📋 手動選択: フォーマットが分かっている場合は直接指定可能</li>
              <li>※ PDFの場合は自動的にテキスト解析を実行</li>
            </ul>
          </li>
          <li style={{ marginBottom: '12px' }}>
            <strong>柔軟な読み取り機能</strong>
            <ul style={{ marginTop: '4px', color: '#444', fontSize: '13px' }}>
              <li>✅ セル位置のずれに自動対応（複数候補から検索）</li>
              <li>✅ ラベル名から動的に値を検索（「件名」「受渡場所」など）</li>
              <li>✅ セル結合や縦横レイアウトの違いに対応</li>
              <li>✅ 明細列の順序変更にも対応</li>
              <li>✅ PDF内のテキストパターンマッチング</li>
            </ul>
          </li>
          <li style={{ marginBottom: '12px' }}>
            <strong>新しいフォーマットへの対応</strong>
            <ul style={{ marginTop: '4px', color: '#444', fontSize: '13px' }}>
              <li>Excelカスタムプリセットの追加が可能</li>
              <li>PDFパース処理のカスタマイズが可能</li>
              <li>詳細は <code style={{ backgroundColor: '#e0e0e0', padding: '2px 6px' }}>EXCEL_FORMAT_FLEXIBILITY.md</code> を参照</li>
            </ul>
          </li>
        </ol>
        
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffc107',
          borderRadius: '4px'
        }}>
          <strong>💡 ヒント:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
            <li>Excel: フォーマットが不明な場合は「自動判定」を選択</li>
            <li>PDF: テキストがコピーできるPDFであることを確認</li>
            <li>どちらも確認画面で内容を確認してから保存できます</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
