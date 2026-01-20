'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ALL_PRESETS, type ExcelFormatPreset } from '@/lib/excelFormatPresets'
import dynamic from 'next/dynamic'
import ConfirmImportPage from '@/components/ConfirmImportPage'
import TextMapper from '@/components/TextMapper'
import DetailMapper from '@/components/DetailMapper'
import HorizontalDetailMapper from '@/components/HorizontalDetailMapper'
import ExcelHeaderMapper from '@/components/ExcelHeaderMapper'
import ExcelDetailMapper from '@/components/ExcelDetailMapper'
const PdfMapper = dynamic(() => import('@/components/PdfMapper'), { ssr: false })

const DragSelectMapper = dynamic(() => import('@/components/DragSelectMapper'), { ssr: false })

type Stage = 'upload' | 'preview' | 'text-mapping' | 'header-mapping' | 'detail-mapping' | 'confirm'

// テキスト行を事前に整形: 連続スペースで区切られている場合は分割して別行として扱う
const splitLinesByLargeSpaces = (lines: string[]) => {
  const result: string[] = []
  lines.forEach(line => {
    const parts = line
      .split(/\s{2,}/)
      .map(p => p.trim())
      .filter(Boolean)

    if (parts.length > 1) {
      result.push(...parts)
    } else if (parts.length === 1) {
      result.push(parts[0])
    }
  })
  return result
}

// Excel列名(A, AA...)を番号に変換
const colNameToIndex = (col: string) => {
  return col
    .toUpperCase()
    .split('')
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
}

// 番号をExcel列名に変換
const indexToColName = (index: number) => {
  let n = index
  let name = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name || 'A'
}



export default function ImportExcelPage() {
  const router = useRouter()
  
  // ページの背景を設定
  useEffect(() => {
    document.documentElement.style.colorScheme = 'dark'
    return () => {
      document.documentElement.style.colorScheme = ''
    }
  }, [])

  const resolvePreset = (presetId?: string, fallback?: ExcelFormatPreset) =>
    ALL_PRESETS.find(p => p.id === presetId) || fallback || ALL_PRESETS.find(p => p.id === 'default') || ALL_PRESETS[0]

  const [file, setFile] = useState<File | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [stage, setStage] = useState<Stage>('upload')
  const [previewData, setPreviewData] = useState<any>(null)
  const [activePreviewSheet, setActivePreviewSheet] = useState<'detail' | 'cover'>('detail')
  const [confirmData, setConfirmData] = useState<any>(null)  // 確認画面用データ
  const [textLines, setTextLines] = useState<string[]>([])  // PDF用テキスト行
  const [detailLines, setDetailLines] = useState<any[]>([])  // 自動抽出した明細行
  const [pdfFileName, setPdfFileName] = useState<string>('')
  const mappingSource = previewData?.details?.length ? previewData : confirmData

  // PDF用の新しいハンドラー：テキスト抽出 → マッピング画面へ
  const handlePdfUpload = async (e: React.FormEvent) => {
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
      
      console.log('[Import PDF] Sending PDF to text extraction...')
      
      const response = await fetch('/api/send-approval-email/import_estimate_pdf/extract-gemini', {
        method: 'POST',
        body: formData
      })
      
      const text = await response.text()
      console.log('[Import PDF] Response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text}`)
      }
      
      const data = JSON.parse(text)
      
      if (!data.ok) {
        throw new Error(data.message || 'テキスト抽出に失敗しました')
      }
      
      console.log('[Import PDF] Extracted text lines:', data.textLines?.length)
      
      // ✅ テキストマッピング画面へ遷移
      const normalizedLines = splitLinesByLargeSpaces(data.textLines || [])
      setTextLines(normalizedLines)
      setDetailLines(data.detailLines || [])
      setPdfFileName(data.fileName || 'PDF')
      setStage('text-mapping')
    } catch (e: any) {
      console.error('[Import PDF] Error:', e)
      setError(`テキスト抽出エラー: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // テキストマッピング完了ハンドラー
  const handleTextMapping = (mapping: {
    customerName: string
    subject: string
    estimateDate: string
    estimateNumber: string
    deliveryDeadline?: string
    deliveryTerms?: string
    validityText?: string
    paymentTerms?: string
  }) => {
    console.log('[TextMapper] Mapping completed:', mapping)
    console.log('[TextMapper] detailLines count:', detailLines.length)
    console.log('[TextMapper] Switching to detail-mapping stage...')
    
    // 案件情報を保存
    setConfirmData({
      estimateNo: mapping.estimateNumber,
      estimateDate: mapping.estimateDate,
      customerName: mapping.customerName,
      subject: mapping.subject,
      deliveryDeadline: mapping.deliveryDeadline || '',
      deliveryTerms: mapping.deliveryTerms || '',
      validityText: mapping.validityText || '発行日より３ヶ月',
      paymentTerms: mapping.paymentTerms || '',
    })
    
    // detail-mappingステージへ
    setStage('detail-mapping')
  }

  // 明細マッピング完了ハンドラー
  const handleDetailMapping = (details: Array<{
    item_name: string
    spec: string
    unit: string
    quantity: number
    unit_price: number
    amount: number
  }>) => {
    console.log('[DetailMapper] Mapping completed, details count:', details.length)
    
    // confirmDataに明細を追加
    const updated = {
      ...confirmData,
      ok: true,
      parsed: true,
      specialDiscount: 0,
      taxAmount: 0,
      subtotal: 0,
      taxRate: 0.1,
      deliveryPlace: '',
      details: details.map(d => ({
        item_name: d.item_name,
        spec: d.spec,
        unit: d.unit,
        quantity: d.quantity,
        unit_price: d.unit_price,
        amount: d.amount,
        product_id: null,
        cost_price: (d as any).cost_price || 0,
        section_name: 'PDF抽出',
      })),
      sections: [{ section_id: '1', section_name: 'PDF抽出', order: 1, name: 'PDF抽出', amount: details.reduce((sum, d) => sum + d.amount, 0) }],
      fileName: pdfFileName,
      stampImage: null,
    }
    
    setConfirmData(updated)
    console.log('[DetailMapper→Confirm] Switching to confirm stage...')
    setStage('confirm')
  }

  // 横見積ヘッダーマッピングハンドラ
  const handleHeaderMapping = (headerData: any) => {
    console.log('[ExcelHeaderMapper] Header mapping completed:', headerData)
    
    // ヘッダー情報を更新してdetail-mappingへ
    const updated = {
      ...previewData,
      ...headerData
    }
    
    setPreviewData(updated)
    setConfirmData(updated)
    setStage('detail-mapping')
  }

  // 横見積専用のマッピングハンドラ
  const handleHorizontalDetailMapping = (details: any[], sections: any[]) => {
    console.log('[HorizontalDetailMapper] Mapping completed, details count:', details.length)
    
    // 編集済みの明細とセクションでconfirmDataを更新
    const updated = {
      ...previewData,
      details,
      sections
    }
    
    setConfirmData(updated)
    console.log('[HorizontalDetailMapper→Confirm] Switching to confirm stage...')
    setStage('confirm')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
      setResult(null)
    }
  }

  // ★新機能：プレビュー取得（ExcelとPDFで分岐）
  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('ファイルを選択してください')
      return
    }
    
    // PDFの場合は直接AI抽出へ
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      return handlePdfUpload(e)
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
        setError(`【エラー ${response.status}】${text || 'APIエラーが発生しました'}\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはAI自動抽出で取り込めます）。`)
        return
      }

      const data = JSON.parse(text)
      if (!data.ok) {
        setError(`${data.message || 'プレビュー取得に失敗しました'}\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはマッピング方式で取り込めます）。`)
        return
      }

      setPreviewData(data)
      
      // ★プリセット決定: ユーザーが選択したものを優先、auto時のみ検出結果を採用
      const finalPresetId = selectedPreset === 'auto' ? (data.preset?.id || 'default') : selectedPreset
      setSelectedPreset(finalPresetId)

      // シートタブの初期選択（detail優先、なければcover）
      const hasDetailSheet = Array.isArray(data.sheets) && data.sheets.some((s: any) => s.type === 'detail')
      setActivePreviewSheet(hasDetailSheet ? 'detail' : 'cover')
      
      setStage('preview')
      setLoading(false)
    } catch (e: any) {
      setError(`【エラー】${e.message}\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはマッピング方式で取り込めます）。`)
      setLoading(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault?.()
    
    console.log('[handleSubmit] Called, current stage:', stage, 'previewData exists:', !!previewData)
    
    if (!file) {
      setError('ファイルを選択してください')
      return
    }

    // プレビュー画面からのインポート実行の場合、プレビューデータを使用
    if (stage === 'preview' && previewData?.parsed) {
      console.log('[handleSubmit] Using preview data for import')
      const data = previewData
      
      // プリセットから様式を判定
      const finalPresetId = selectedPreset === 'auto' ? (data.preset?.id || 'default') : selectedPreset
      const preset = resolvePreset(finalPresetId)
      
      console.log('[Import from Preview] Layout detection:', {
        selectedPreset,
        finalPresetId,
        layoutType: preset.layoutType,
        presetName: preset.name
      })
      
      // 横見積の場合のみheader-mappingを挟む
      if (preset.layoutType === 'horizontal') {
        console.log('[Import from Preview] Horizontal layout detected → Going to header-mapping stage')
        // プレビューデータのsheetsを保持（マッピング画面でExcelプレビューに使用）
        const dataWithSheets = { ...data, sheets: previewData?.sheets || [] }
        setPreviewData(dataWithSheets)
        setConfirmData(dataWithSheets)
        setStage('header-mapping')
      } else {
        // 縦見積の場合は直接確認画面へ
        console.log('[Import from Preview] Vertical layout detected → Going to confirm stage')
        setConfirmData(data)
        setStage('confirm')
      }
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
        const hint = !isPdf ? '\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはマッピング方式で取り込めます）。' : ''
        setError(`【エラー ${response.status}】${text || 'APIエラーが発生しました'}${hint}`)
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
        const hint = !isPdf ? '\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはマッピング方式で取り込めます）。' : ''
        setError(`${data.message || 'インポートに失敗しました'}${hint}`)
        return
      }

      // ✅ 解析成功 → 様式に応じて遷移先を決定
      if (data.parsed) {
        // プリセットから様式を判定
        const finalPresetId = selectedPreset === 'auto' ? (data.preset?.id || 'default') : selectedPreset
        const preset = resolvePreset(finalPresetId)
        
        console.log('[Import] Layout detection:', {
          selectedPreset,
          finalPresetId,
          layoutType: preset.layoutType,
          presetName: preset.name
        })
        
        // 横見積の場合のみheader-mappingを挟む
        if (preset.layoutType === 'horizontal') {
          console.log('[Import] Horizontal layout detected → Going to header-mapping stage')
          // プレビューがある場合はsheetsを引き継ぐ
          const dataWithSheets = previewData?.sheets 
            ? { ...data, sheets: previewData.sheets }
            : data
          setPreviewData(dataWithSheets)
          setConfirmData(dataWithSheets)
          setStage('header-mapping')
        } else {
          // 縦見積の場合は直接確認画面へ
          console.log('[Import] Vertical layout detected → Going to confirm stage')
          setConfirmData(data)
          setStage('confirm')
        }
      } else {
        setResult(data)
      }
    } catch (err: any) {
      const hint = file && !file.name.toLowerCase().endsWith('.pdf') ? '\nExcel（縦/横様式）の取り込みでエラーが発生しました。PDFデータとして取り込んでください（PDFはマッピング方式で取り込めます）。' : ''
      setError(`${err?.message || '通信エラーが発生しました'}${hint}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {stage === 'confirm' && confirmData ? (
      <ConfirmImportPage data={confirmData} onBack={() => {
        setStage('upload')
        setFile(null)
        setPreviewData(null)
        setConfirmData(null)
        setTextLines([])
        setDetailLines([])
      }} />
    ) : stage === 'header-mapping' ? (
      // 横見積ヘッダーマッピング（Excelセルから案件情報を選択）
      <ExcelHeaderMapper 
        meta={mappingSource}
        onConfirm={handleHeaderMapping}
        onBack={() => {
          setStage('preview')
        }}
      />
    ) : stage === 'detail-mapping' ? (
      // 横見積の場合は専用マッパーを使用（プレビュー／インポートのどちら経由でも表示）
      mappingSource && mappingSource.details?.length ? (
        <ExcelDetailMapper 
          details={mappingSource.details || []}
          sections={mappingSource.sections || []}
          meta={mappingSource}
          onConfirm={handleHorizontalDetailMapping}
          onBack={() => {
            setStage('header-mapping')
          }}
        />
      ) : (
        // PDF用の既存のDetailMapper
        <DetailMapper 
          textLines={textLines}
          onMapping={handleDetailMapping}
          onBack={() => {
            setStage('text-mapping')
          }}
        />
      )
    ) : stage === 'text-mapping' ? (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '20px' }}>
        <button
          onClick={() => {
            setStage('upload')
            setTextLines([])
            setPdfFileName('')
          }}
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
          ← アップロードに戻る
        </button>
        <TextMapper
          textLines={textLines}
          detailLines={detailLines}
          fileName={pdfFileName}
          onMapping={handleTextMapping}
          onCancel={() => {
            setStage('upload')
            setTextLines([])
            setDetailLines([])
            setPdfFileName('')
          }}
        />
      </div>
    ) : (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui', minHeight: '100vh' }}>
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
              accept=".xlsx,.xls,.pdf"
              onChange={handleFileChange}
              disabled={loading}
              style={{
                display: 'block',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '100%',
                backgroundColor: '#ffffff',
                color: '#1a1a1a'
              }}
            />
            {file && (
              <p style={{ marginTop: '8px', color: '#666', fontWeight: '500' }}>
                📁 {file.name} ({(file.size / 1024).toFixed(2)} KB)
                {file.name.toLowerCase().endsWith('.pdf') ? '（PDFはマッピングで取り込みます）' : '（Excelは縦/横プリセットで取り込みます）'}
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
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            {loading ? 'プレビュー取得中...' : '→ プレビューに進む'}
          </button>
        </form>
      )}

      {/* ========== ステージ2: プレビュー表示 ========== */}
      {stage === 'preview' && previewData && (() => {
        const sheets = Array.isArray(previewData.sheets) ? previewData.sheets : []
        const currentSheet = sheets.find((s: any) => s.type === activePreviewSheet) || sheets[0] || { rows: previewData.rows || [], merges: [] }
        const rowsForPreview = currentSheet?.rows || previewData.rows || []

        const maxColIndex = rowsForPreview.reduce((max: number, row: any) => {
          const rowMax = (row.cells || []).reduce((m: number, cell: any) => Math.max(m, colNameToIndex(cell.col)), 0)
          return Math.max(max, rowMax)
        }, 0)
        const colCount = Math.min(Math.max(maxColIndex || 8, 12), 52) // 少なくとも12列、最大52列まで
        const columns = Array.from({ length: colCount }, (_, i) => indexToColName(i + 1))

        const cellMap: Record<string, any> = {}
        rowsForPreview.forEach((row: any) => {
          ;(row.cells || []).forEach((cell: any) => {
            cellMap[`${row.rowNum}-${cell.col}`] = cell
          })
        })

        // プリセットからセルマッピングを取得
        const preset = ALL_PRESETS.find(p => p.id === selectedPreset) || ALL_PRESETS[0]

        return (
          <div style={{ marginTop: '30px' }}>
            <h2 style={{ color: 'inherit' }}>📊 Excelデータプレビュー</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Excelの見た目に近いレイアウトでプレビューしています。
            </p>

            <div style={{ 
              padding: '12px', 
              backgroundColor: '#dbeafe',
              border: '2px solid #1976d2',
              borderRadius: '4px',
              marginBottom: '12px',
              fontSize: '14px',
              color: '#000',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <div><strong>📌 フォーマット:</strong> {previewData.preset?.name || '不明'}</div>
              <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>シートをクリックして切り替えできます</div>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#000', fontWeight: '600' }}>
                マッピングはプリセット＋オフセットで自動表示
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {sheets.map((sheet: any) => (
                <button
                  key={sheet.name}
                  onClick={() => setActivePreviewSheet(sheet.type === 'detail' ? 'detail' : 'cover')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: activePreviewSheet === sheet.type ? '2px solid #1976d2' : '1px solid #ccc',
                    backgroundColor: activePreviewSheet === sheet.type ? '#1976d2' : '#fff',
                    color: activePreviewSheet === sheet.type ? '#fff' : '#000',
                    cursor: 'pointer',
                    fontWeight: activePreviewSheet === sheet.type ? 'bold' : '600',
                    fontSize: '14px'
                  }}
                >
                  {sheet.name} ({sheet.type === 'detail' ? '明細' : '表紙'})
                </button>
              ))}
            </div>

            <div style={{ overflow: 'auto', border: '1px solid #d0d7de', borderRadius: '6px', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: '900px',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  backgroundColor: '#fff'
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        background: '#f3f4f6',
                        borderRight: '1px solid #e5e7eb',
                        borderBottom: '1px solid #d1d5db',
                        padding: '6px 8px',
                        minWidth: '46px',
                        textAlign: 'center',
                        color: '#000',
                        fontWeight: 'bold'
                      }}
                    >
                      #
                    </th>
                    {columns.map(col => (
                      <th
                        key={col}
                        style={{
                          borderBottom: '1px solid #d1d5db',
                          borderRight: '1px solid #e5e7eb',
                          padding: '6px 10px',
                          background: '#f3f4f6',
                          color: '#000',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          minWidth: '120px'
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsForPreview.map((row: any, rIdx: number) => (
                    <tr key={row.rowNum || rIdx} style={{ background: rIdx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <th
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          background: '#f3f4f6',
                          borderRight: '1px solid #e5e7eb',
                          borderBottom: '1px solid #e5e7eb',
                          padding: '6px 8px',
                          textAlign: 'center',
                          fontWeight: 600,
                          color: '#000'
                        }}
                      >
                        {row.rowNum}
                      </th>
                      {columns.map(col => {
                        const cell = cellMap[`${row.rowNum}-${col}`]
                        const isMerged = cell?.isMerged
                        const cellAddr = `${col}${row.rowNum}`
                        const hasValue = !!(cell?.value?.toString().trim())
                        
                        return (
                          <td
                            key={col}
                            style={{
                              borderRight: '1px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb',
                              padding: '6px 8px',
                              minWidth: '120px',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              background: isMerged ? '#eef2ff' : '#fff',
                              color: '#000',
                              fontSize: '13px',
                              cursor: 'default'
                            }}
                            title={cell ? `${cellAddr}: ${cell.value || ''}${cell.mergeRange ? ` [結合: ${cell.mergeRange}]` : ''}` : cellAddr}
                          >
                            <span style={{ color: '#64748b', fontSize: '10px', marginRight: 4, fontWeight: '500' }}>{col}</span>
                            <span style={{ color: '#000' }}>{cell?.value || ''}</span>
                          </td>
                        )
                      })}
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
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
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
                  color: '#fff',
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
        )
      })()}

      {/* エラー表示 */}
      {error && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: '#ffffff',
            border: '2px solid #ff6b6b',
            borderRadius: '4px',
            color: '#ff6b6b'
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>❌ エラー</h3>
          <p style={{ margin: '0', whiteSpace: 'pre-wrap' }}>{error}</p>
        </div>
      )}

      {/* 成功表示 */}
      {result && (
        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            backgroundColor: '#ffffff',
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
    )}
    </>
  )
}
