'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ImportExcelPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
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

      const response = await fetch('/api/send-approval-email/import_estimate_excel', {
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

      <h1>Excel見積書のインポート</h1>

      <form onSubmit={handleSubmit} style={{ marginTop: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="file" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
            Excelファイル（.xlsx）を選択:
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
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '100%'
            }}
          />
          {file && <p style={{ marginTop: '8px', color: '#333', fontWeight: '500' }}>📁 {file.name} ({(file.size / 1024).toFixed(2)} KB)</p>}
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
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
          <li>縦見積書形式のExcelファイル（.xlsx）を用意</li>
          <li>下記のセル配置に従ってデータを入力：
            <ul style={{ marginTop: '8px', color: '#222' }}>
              <li>D8: 顧客名</li>
              <li>K27: 件名</li>
              <li>K29: 納入場所</li>
              <li>K31: 納期</li>
              <li>K33: 納期条件</li>
              <li>K35: 有効期限</li>
              <li>K37: 支払条件</li>
              <li>AJ78/80/82: 小計／消費税／合計</li>
              <li>41行目以降: 明細（D=品名, N=規格, X=数量, AB=単位, AE=単価, AJ=金額）</li>
            </ul>
          </li>
          <li>ファイルを選択してインポート</li>
          <li>成功するとcase_idが発行され、DBに登録される</li>
        </ol>
      </div>
    </div>
  )
}
