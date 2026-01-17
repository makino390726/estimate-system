'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALL_PRESETS, type ExcelFormatPreset } from '@/lib/excelFormatPresets'

type Stage = 'upload' | 'preview' | 'mapping' | 'confirm'

export default function ImportExcelPage() {
  const router = useRouter()

  const resolvePreset = (presetId?: string, fallback?: ExcelFormatPreset) =>
    ALL_PRESETS.find(p => p.id === presetId) || fallback || ALL_PRESETS.find(p => p.id === 'default') || ALL_PRESETS[0]

  const buildColumnDefaults = (preset?: ExcelFormatPreset) => {
    const p = preset ?? resolvePreset('default')
    const defaults = p.details.defaultColumns
    return {
      headerRow: p.details.headerRow,
      itemNameCol: defaults?.productName || 'D',
      specCol: defaults?.spec || 'N',
      qtyCol: defaults?.quantity || 'X',
      priceCol: defaults?.unitPrice || 'AE',
      amountCol: defaults?.amount || 'AJ'
    }
  }

  const buildMetadataDefaults = (preset?: ExcelFormatPreset) => {
    const cover = (preset ?? resolvePreset('default')).cover
    return {
      customerNameCell: cover.customerName?.[0] || 'C8',
      subjectCell: cover.subject?.[0] || 'J27',
      deliveryPlaceCell: cover.deliveryPlace?.[0] || 'J29',
      deliveryDeadlineCell: cover.deliveryDeadline?.[0] || 'J31',
      deliveryTermsCell: cover.deliveryTerms?.[0] || 'J33',
      validityCell: cover.validityText?.[0] || 'J35',
      paymentTermsCell: cover.paymentTerms?.[0] || 'J37',
      estimateDateCell: cover.estimateDate?.[0] || 'AN5,AR5,AU5',
      estimateNumberCell: cover.estimateNumber?.[0] || 'AN1,AO1,AS1,AV1'
    }
  }

  const [file, setFile] = useState<File | null>(null)
  const [layoutType, setLayoutType] = useState<'auto' | 'vertical' | 'horizontal'>('auto')
  const [selectedPreset, setSelectedPreset] = useState<string>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  // ★新しいステート：3段階フロー
  const [stage, setStage] = useState<Stage>('upload')
  const [previewData, setPreviewData] = useState<any>(null)
  const [selectedSheet, setSelectedSheet] = useState<'cover' | 'detail'>('detail') // シート切り替え
  const [columnMapping, setColumnMapping] = useState(() => buildColumnDefaults(resolvePreset(selectedPreset)))
  const [metadataMapping, setMetadataMapping] = useState(() => buildMetadataDefaults(resolvePreset(selectedPreset)))
  // クリック式マッピングUI用の状態
  const [mappingMode, setMappingMode] = useState<keyof ReturnType<typeof buildMetadataDefaults> | null>(null)
  const [selectedCellAddr, setSelectedCellAddr] = useState<string | null>(null)
  const [detailMappingMode, setDetailMappingMode] = useState<keyof ReturnType<typeof buildColumnDefaults> | null>(null)

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
      
      // ★プリセットからデフォルト列・メタデータ位置を取得
      const selectedPresetObj = resolvePreset(data.preset?.id || selectedPreset)
      setColumnMapping(buildColumnDefaults(selectedPresetObj))
      setMetadataMapping(buildMetadataDefaults(selectedPresetObj))
      
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
      // ★デバッグ：マッピング状態確認
      console.log('[handleSubmit] mappingMode:', mappingMode)
      console.log('[handleSubmit] detailMappingMode:', detailMappingMode)
      console.log('[handleSubmit] Current metadataMapping state:')
      for (const [key, val] of Object.entries(metadataMapping || {})) {
        console.log(`  ${key}: "${val}"`)
      }
      console.log('[handleSubmit] Current columnMapping state:')
      for (const [key, val] of Object.entries(columnMapping || {})) {
        console.log(`  ${key}: "${val}"`)
      }

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
        formData.append('mode', 'import')  // ★インポートモード
        // ★マッピング情報を送信（複数セル値の自動抽出用）
        const mappingsJson = JSON.stringify(metadataMapping)
        const columnsJson = JSON.stringify(columnMapping)
        console.log('[handleSubmit] Appending to FormData:')
        console.log('  _mappings:', mappingsJson)
        console.log('  _mappingsColumns:', columnsJson)
        formData.append('_mappings', mappingsJson)
        formData.append('_mappingsColumns', columnsJson)
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
          thirdDetail: data.details?.[2],
          estimateNo: data.estimateNo,
          estimateDate: data.estimateDate
        })
        // sessionStorageに解析データ + マッピング情報を保存
        const merged = {
          ...data,
          _mappings: metadataMapping,               // 既存互換（メタ情報）
          _mappingsColumns: columnMapping,          // 明細列マッピング
          _sheetForMapping: selectedSheet
        }
        
        console.log('[ImportPage] Merged data being saved to session:', {
          _mappings: merged._mappings,
          _mappingsColumns: merged._mappingsColumns,
          estimateNo: merged.estimateNo,
          estimateDate: merged.estimateDate
        })
        
        sessionStorage.setItem('excel_import_data', JSON.stringify(merged))
        
        // 複数セルマッピング検出：複数セル対応項目
        const multiCellFields: (keyof typeof metadataMapping)[] = []
        for (const [key, val] of Object.entries(metadataMapping)) {
          if (String(val || '').includes(',')) {
            multiCellFields.push(key as keyof typeof metadataMapping)
          }
        }
        
        if (multiCellFields.length > 0) {
          console.log('[ImportPage] Multiple cell mappings detected:', multiCellFields)
          // 複数セルマッピング情報をセッションに保存（確認画面で警告表示用）
          merged._multiCellFields = multiCellFields
          sessionStorage.setItem('excel_import_data', JSON.stringify(merged))
        }
        
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

          {/* シート切り替えタブ */}
          {previewData.sheets && previewData.sheets.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {previewData.sheets.map((sheet: any) => (
                <button
                  key={sheet.type}
                  onClick={() => setSelectedSheet(sheet.type)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    backgroundColor: selectedSheet === sheet.type ? 'var(--primary)' : 'var(--muted-bg)',
                    color: selectedSheet === sheet.type ? 'white' : 'var(--foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: selectedSheet === sheet.type ? 'bold' : 'normal'
                  }}
                >
                  {sheet.type === 'cover' ? '📄 表紙シート' : '📋 明細シート'} ({sheet.name})
                </button>
              ))}
            </div>
          )}

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
                {((previewData.sheets?.find((s: any) => s.type === selectedSheet)?.rows) || previewData.rows).map((row: any, idx: number) => (
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
              onClick={() => setStage('mapping')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              → マッピング設定へ進む
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
              → プリセットのまま取り込む（マッピングスキップ）
            </button>
          </div>
        </div>
      )}

      {/* ========== ステージ3: マッピング設定（プレビュー並列表示） ========== */}
      {stage === 'mapping' && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ color: 'inherit' }}>🔗 列のマッピング設定</h2>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '20px' }}>
            左側のプレビューを参照しながら、右側でセル位置をマッピング設定してください。
          </p>

          {/* ===== 2列レイアウト: プレビュー + マッピング設定 ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '30px' }}>
            {/* 左列: プレビューテーブル（読み取り専用） */}
            <div style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '16px',
              maxHeight: '600px',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'inherit', fontSize: '14px', fontWeight: 'bold' }}>
                📊 Excelプレビュー（参照用）
              </h3>
              
              {/* シート切り替えタブ（マッピング画面） */}
              {previewData?.sheets && previewData.sheets.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {previewData.sheets.map((sheet: any) => (
                    <button
                      key={sheet.type}
                      onClick={() => setSelectedSheet(sheet.type)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        backgroundColor: selectedSheet === sheet.type ? 'var(--primary)' : 'var(--muted-bg)',
                        color: selectedSheet === sheet.type ? 'white' : 'var(--foreground)',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontWeight: selectedSheet === sheet.type ? 'bold' : 'normal'
                      }}
                    >
                      {sheet.type === 'cover' ? '📄 表紙' : '📋 明細'}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '11px',
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <tbody>
                    {((previewData?.sheets?.find((s: any) => s.type === selectedSheet)?.rows) || previewData?.rows).map((row: any, idx: number) => (
                      <tr
                        key={idx}
                        style={{
                          backgroundColor: idx % 2 === 0 ? 'var(--card-alt)' : 'var(--card)',
                          borderBottom: '1px solid var(--border)'
                        }}
                      >
                        <td
                          style={{
                            padding: '6px',
                            fontWeight: 'bold',
                            backgroundColor: 'var(--muted-bg)',
                            textAlign: 'center',
                            width: '45px',
                            color: 'inherit',
                            fontSize: '10px'
                          }}
                        >
                          {row.rowNum}
                        </td>
                        {row.cells.map((cell: any, cidx: number) => {
                          const addr = `${cell.col}${row.rowNum}`
                          const mappedList = Object.values(metadataMapping || {}).flatMap((v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean))
                          const isMetaMapped = mappedList.includes(addr)
                          const isDetailMapped = [
                            columnMapping?.itemNameCol,
                            columnMapping?.specCol,
                            columnMapping?.qtyCol,
                            columnMapping?.priceCol,
                            columnMapping?.amountCol
                          ].filter(Boolean).includes(cell.col)
                          const isMapped = isMetaMapped || isDetailMapped
                          const isSelected = selectedCellAddr === addr
                          const clickable = Boolean(mappingMode || detailMappingMode)

                          const baseBg = idx % 2 === 0 ? 'var(--card-alt)' : 'var(--card)'
                          const bgColor = isSelected ? '#2196f3' : (isMapped ? '#c8e6c9' : baseBg)
                          const color = isSelected ? '#fff' : 'inherit'

                          return (
                            <td
                              key={cidx}
                              onClick={(e) => {
                                const isMulti = (e as any).ctrlKey || (e as any).metaKey
                                console.log(`[CellClick] Cell: ${addr}, mappingMode: ${mappingMode}, isMulti: ${isMulti}`)
                                // メタデータのセル指定（Ctrl/⌘で複数セルをカンマ連結）
                                if (mappingMode) {
                                  setMetadataMapping(prev => {
                                    const current = String(prev[mappingMode] || '').split(',').map(s => s.trim()).filter(Boolean)
                                    console.log(`[CellClick] Current values for ${mappingMode}:`, current)
                                    if (isMulti) {
                                      if (!current.includes(addr)) {
                                        current.push(addr)
                                        console.log(`[CellClick] Added ${addr}, new list:`, current)
                                      } else {
                                        console.log(`[CellClick] ${addr} already exists, skipping`)
                                      }
                                      const newVal = current.join(',')
                                      console.log(`[CellClick] Setting ${mappingMode} to: "${newVal}"`)
                                      return { ...prev, [mappingMode]: newVal } as any
                                    } else {
                                      console.log(`[CellClick] Single click mode, setting ${mappingMode} to: "${addr}"`)
                                      return { ...prev, [mappingMode]: addr } as any
                                    }
                                  })
                                  setSelectedCellAddr(addr)
                                }
                                // 明細列の列指定（列記号のみ反映・単一選択）
                                if (detailMappingMode) {
                                  setColumnMapping(prev => ({
                                    ...prev,
                                    [detailMappingMode]: cell.col
                                  }) as any)
                                  setSelectedCellAddr(addr)
                                }
                              }}
                              style={{
                                padding: '6px',
                                borderRight: '1px solid var(--border)',
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color,
                                backgroundColor: bgColor,
                                cursor: clickable ? 'pointer' : 'default',
                                position: 'relative',
                                transition: 'background-color 0.15s ease'
                              }}
                              title={`${addr} ${cell.value}`}
                              onMouseEnter={(e) => {
                                if (clickable && !isSelected && !isMapped) {
                                  (e.currentTarget as HTMLTableCellElement).style.backgroundColor = '#bbdefb'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (clickable && !isSelected && !isMapped) {
                                  (e.currentTarget as HTMLTableCellElement).style.backgroundColor = baseBg
                                }
                              }}
                            >
                              <span style={{ color: isSelected ? '#fff' : 'var(--primary)', fontSize: '9px', fontWeight: 'bold' }}>{cell.col}</span>
                              <br />
                              <span style={{ fontSize: '10px' }}>{cell.value}</span>
                              {isMapped && (
                                <span style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '4px',
                                  fontSize: '10px',
                                  backgroundColor: '#4caf50',
                                  color: '#fff',
                                  padding: '2px 4px',
                                  borderRadius: '3px'
                                }}>✓</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 右列: マッピング設定フォーム */}
            <div style={{
              backgroundColor: 'var(--muted-bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '20px',
              maxHeight: '600px',
              overflowY: 'auto'
            }}>
              <p style={{ margin: '0 0 16px 0', fontWeight: 'bold', color: 'inherit' }}>明細行設定:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  ヘッダー行番号:
                </label>
                <input
                  type="number"
                  value={columnMapping?.headerRow || 40}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, headerRow: parseInt(e.target.value) } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  品名列:
                </label>
                <input
                  type="text"
                  value={columnMapping?.itemNameCol || 'D'}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, itemNameCol: e.target.value.toUpperCase() } as any)
                  }
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="A, B, C..."
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setDetailMappingMode('itemNameCol'); setSelectedCellAddr(null); setSelectedSheet('detail') }}
                    style={{ padding: '6px 10px', backgroundColor: detailMappingMode === 'itemNameCol' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {columnMapping?.itemNameCol && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{columnMapping.itemNameCol}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  規格列:
                </label>
                <input
                  type="text"
                  value={columnMapping?.specCol || 'N'}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, specCol: e.target.value.toUpperCase() } as any)
                  }
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="A, B, C..."
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setDetailMappingMode('specCol'); setSelectedCellAddr(null); setSelectedSheet('detail') }}
                    style={{ padding: '6px 10px', backgroundColor: detailMappingMode === 'specCol' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {columnMapping?.specCol && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{columnMapping.specCol}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  数量列:
                </label>
                <input
                  type="text"
                  value={columnMapping?.qtyCol || 'X'}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, qtyCol: e.target.value.toUpperCase() } as any)
                  }
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="A, B, C..."
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setDetailMappingMode('qtyCol'); setSelectedCellAddr(null); setSelectedSheet('detail') }}
                    style={{ padding: '6px 10px', backgroundColor: detailMappingMode === 'qtyCol' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {columnMapping?.qtyCol && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{columnMapping.qtyCol}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  単価列:
                </label>
                <input
                  type="text"
                  value={columnMapping?.priceCol || 'AE'}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, priceCol: e.target.value.toUpperCase() } as any)
                  }
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="A, B, C..."
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setDetailMappingMode('priceCol'); setSelectedCellAddr(null); setSelectedSheet('detail') }}
                    style={{ padding: '6px 10px', backgroundColor: detailMappingMode === 'priceCol' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {columnMapping?.priceCol && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{columnMapping.priceCol}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  金額列:
                </label>
                <input
                  type="text"
                  value={columnMapping?.amountCol || 'AJ'}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, amountCol: e.target.value.toUpperCase() } as any)
                  }
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="A, B, C..."
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setDetailMappingMode('amountCol'); setSelectedCellAddr(null); setSelectedSheet('detail') }}
                    style={{ padding: '6px 10px', backgroundColor: detailMappingMode === 'amountCol' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {columnMapping?.amountCol && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{columnMapping.amountCol}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: 'var(--accent-light)',
            border: '2px solid var(--primary)',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'inherit' }}>メタデータ設定（セル位置）:</p>
            {mappingMode && (
              <div style={{
                margin: '0 0 12px 0',
                padding: '10px',
                border: '2px solid #ff6f00',
                backgroundColor: '#fff3e0',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                📌 マッピング中: {mappingMode} — 左の表でセルをクリックしてください（Ctrl/⌘+クリックで複数選択可）
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  得意先名:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.customerNameCell || 'C8'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, customerNameCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="C8"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('customerNameCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'customerNameCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.customerNameCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.customerNameCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  件名:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.subjectCell || 'J27'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, subjectCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J27"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('subjectCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'subjectCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.subjectCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.subjectCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  受渡場所:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.deliveryPlaceCell || 'J29'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, deliveryPlaceCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J29"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('deliveryPlaceCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'deliveryPlaceCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.deliveryPlaceCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.deliveryPlaceCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  受渡期限:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.deliveryDeadlineCell || 'J31'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, deliveryDeadlineCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J31"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('deliveryDeadlineCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'deliveryDeadlineCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.deliveryDeadlineCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.deliveryDeadlineCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  受渡条件:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.deliveryTermsCell || 'J35'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, deliveryTermsCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J33"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('deliveryTermsCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'deliveryTermsCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.deliveryTermsCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.deliveryTermsCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  有効期限:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.validityCell || 'J37'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, validityCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J37"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('validityCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'validityCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.validityCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.validityCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  支払条件:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.paymentTermsCell || 'J39'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, paymentTermsCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="J39"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('paymentTermsCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'paymentTermsCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.paymentTermsCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.paymentTermsCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  作成日:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.estimateDateCell || 'L35'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, estimateDateCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                    placeholder="AN5,AR5,AU5"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('estimateDateCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'estimateDateCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.estimateDateCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.estimateDateCell}</span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'inherit' }}>
                  見積番号:
                </label>
                <input
                  type="text"
                  value={metadataMapping?.estimateNumberCell || 'G5'}
                  onChange={(e) =>
                    setMetadataMapping({ ...metadataMapping, estimateNumberCell: e.target.value.toUpperCase() } as any)
                  }
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--input-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    boxSizing: 'border-box'
                  }}
                  placeholder="G5"
                />
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setMappingMode('estimateNumberCell'); setSelectedCellAddr(null); setSelectedSheet('cover') }}
                    style={{ padding: '6px 10px', backgroundColor: mappingMode === 'estimateNumberCell' ? '#ff6f00' : '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >セル指定</button>
                  {metadataMapping?.estimateNumberCell && (
                    <span style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{metadataMapping.estimateNumberCell}</span>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={() => setStage('preview')}
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
              onClick={() => handleSubmit({ preventDefault: () => {} } as any)}
              disabled={loading}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: loading ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'インポート中...' : '✅ インポート実行'}
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
