'use client'

import { useState, useEffect } from 'react'

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

type Detail = {
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  cost_price?: number | null
  wholesale_price?: number | null
  section_name?: string
}

type HorizontalDetailMapperProps = {
  details: Detail[]
  sections: Array<{ order: number; name: string; amount: number }>
  onConfirm: (mappedDetails: Detail[], sections: any[]) => void
  onBack: () => void
  meta?: any
}

export default function HorizontalDetailMapper({ details, sections, onConfirm, onBack, meta }: HorizontalDetailMapperProps) {
  const [editableDetails, setEditableDetails] = useState<Detail[]>(details)
  const [editableSections, setEditableSections] = useState(sections)
  const [activeSheetType, setActiveSheetType] = useState<'detail' | 'cover'>('detail')

  useEffect(() => {
    setEditableDetails(details)
    setEditableSections(sections)
  }, [details, sections])

  // シートが変わったら先頭を選択
  useEffect(() => {
    const sheets = Array.isArray(meta?.sheets) ? meta.sheets : []
    if (sheets.length > 0) {
      const firstType = sheets[0].type === 'cover' ? 'cover' : 'detail'
      setActiveSheetType(firstType)
    }
  }, [meta?.sheets])

  const handleDetailChange = (index: number, field: keyof Detail, value: any) => {
    setEditableDetails(prev => prev.map((d, i) => {
      if (i === index) {
        const updated = { ...d, [field]: value }
        // 数量または単価が変更された場合、金額を再計算
        if (field === 'quantity' || field === 'unit_price') {
          updated.amount = (updated.quantity || 0) * (updated.unit_price || 0)
        }
        return updated
      }
      return d
    }))
  }

  const handleDeleteRow = (index: number) => {
    if (confirm(`${index + 1}行目「${editableDetails[index].item_name}」を削除しますか？`)) {
      setEditableDetails(prev => prev.filter((_, i) => i !== index))
    }
  }

  const handleConfirm = () => {
    onConfirm(editableDetails, editableSections)
  }

  return (
    <div style={{ 
      maxWidth: '1400px', 
      margin: '20px auto', 
      padding: '20px', 
      backgroundColor: '#1e293b',
      color: '#e2e8f0',
      minHeight: '100vh'
    }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#6c757d',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← 戻る
      </button>

      <h1 style={{ color: '#e2e8f0', marginBottom: '8px' }}>📊 横見積 - 明細マッピング</h1>
      <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
        取り込んだ明細データを確認・編集してください。必要に応じて商品名、規格、数量、単価などを修正できます。
      </p>

      {/* Excelプレビュー（抽出テキスト代替・シート切替付き） */}
      {(() => {
        console.log('[HorizontalDetailMapper] meta:', meta)
        console.log('[HorizontalDetailMapper] meta?.sheets?.length:', meta?.sheets?.length)
        if (!meta?.sheets || meta.sheets.length === 0) {
          return (
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8' }}>📑 Excelプレビューデータがありません（meta.sheets未設定）</div>
            </div>
          )
        }
        const sheets = Array.isArray(meta.sheets) ? meta.sheets : []
        const currentSheet = sheets.find((s: any) => s.type === activeSheetType) || sheets[0]
        const rows = currentSheet?.rows || []

        const maxColIndex = rows.reduce((max: number, row: any) => {
          const rowMax = (row.cells || []).reduce((m: number, cell: any) => Math.max(m, colNameToIndex(cell.col)), 0)
          return Math.max(max, rowMax)
        }, 0)
        const colCount = Math.min(Math.max(maxColIndex || 8, 12), 52)
        const columns = Array.from({ length: colCount }, (_, i) => indexToColName(i + 1))

        const cellMap: Record<string, any> = {}
        rows.forEach((row: any) => {
          ;(row.cells || []).forEach((cell: any) => {
            cellMap[`${row.rowNum}-${cell.col}`] = cell
          })
        })

        return (
          <div style={{ marginBottom: '24px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #334155' }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700 }}>📑 抽出テキスト（Excelプレビュー）</div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>シートをクリックして切り替えできます</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sheets.map((sheet: any) => (
                  <button
                    key={sheet.name}
                    onClick={() => setActiveSheetType(sheet.type === 'detail' ? 'detail' : 'cover')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: activeSheetType === sheet.type ? '2px solid #38bdf8' : '1px solid #475569',
                      backgroundColor: activeSheetType === sheet.type ? '#0ea5e9' : '#1e293b',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontWeight: activeSheetType === sheet.type ? 700 : 600,
                      fontSize: '12px'
                    }}
                  >
                    {sheet.name}（{sheet.type === 'detail' ? '明細' : '表紙'}）
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflow: 'auto', maxHeight: '420px' }}>
              <table style={{ width: '100%', minWidth: '960px', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: '#0f172a' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, zIndex: 2, background: '#1e293b', borderRight: '1px solid #334155', borderBottom: '1px solid #334155', padding: '6px 8px', minWidth: '46px', textAlign: 'center', color: '#e2e8f0', fontWeight: 'bold' }}>#</th>
                    {columns.map(col => (
                      <th key={col} style={{ borderBottom: '1px solid #334155', borderRight: '1px solid #334155', padding: '6px 10px', background: '#1e293b', color: '#e2e8f0', fontWeight: 'bold', textAlign: 'center', minWidth: '110px' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any, rIdx: number) => (
                    <tr key={row.rowNum || rIdx} style={{ background: rIdx % 2 === 0 ? '#0f172a' : '#111827' }}>
                      <th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#1e293b', borderRight: '1px solid #334155', borderBottom: '1px solid #334155', padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#e2e8f0' }}>{row.rowNum}</th>
                      {columns.map(col => {
                        const cell = cellMap[`${row.rowNum}-${col}`]
                        const cellAddr = `${col}${row.rowNum}`
                        const isMerged = cell?.isMerged

                        return (
                          <td
                            key={col}
                            style={{
                              borderRight: '1px solid #334155',
                              borderBottom: '1px solid #334155',
                              padding: '6px 8px',
                              minWidth: '110px',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              background: isMerged ? '#0b2745' : '#0f172a',
                              color: '#e2e8f0',
                              fontSize: '12px',
                              cursor: 'default'
                            }}
                            title={cell ? `${cellAddr}: ${cell.value || ''}${cell.mergeRange ? ` [結合: ${cell.mergeRange}]` : ''}` : cellAddr}
                          >
                            <span style={{ color: '#94a3b8', fontSize: '10px', marginRight: 4, fontWeight: '500' }}>{col}</span>
                            <span style={{ color: '#e2e8f0' }}>{cell?.value || ''}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* 案件ヘッダー情報（PDFマッピング風の概要表示） */}
      {meta && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #334155',
          backgroundColor: '#0f172a'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>件名</div>
              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{meta.subject || '---'}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>顧客名</div>
              <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{meta.customer_name || meta.customer || '---'}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>見積日</div>
              <div style={{ color: '#e2e8f0' }}>{meta.estimate_date || meta.date || '---'}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>有効期限</div>
              <div style={{ color: '#e2e8f0' }}>{meta.validity_text || meta.expiration || '---'}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>支払条件</div>
              <div style={{ color: '#e2e8f0' }}>{meta.payment_terms || '---'}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>税率 / 値引</div>
              <div style={{ color: '#e2e8f0' }}>{`${meta.tax_rate != null ? meta.tax_rate : 0.1} / ${meta.discount != null ? meta.discount : 0}`}</div>
            </div>
          </div>
        </div>
      )}

      {/* セクション情報 */}
      {editableSections.length > 0 && (
        <div style={{ 
          marginBottom: '30px', 
          padding: '20px', 
          backgroundColor: '#334155',
          borderRadius: '8px',
          border: '2px solid #475569'
        }}>
          <h3 style={{ color: '#e2e8f0', marginBottom: '15px' }}>📋 セクション一覧（{editableSections.length}件）</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {editableSections.map((sec) => (
              <div key={sec.order} style={{ 
                padding: '10px', 
                backgroundColor: '#475569',
                borderRadius: '4px',
                border: '1px solid #64748b'
              }}>
                <div style={{ fontWeight: 'bold', color: '#cbd5e1' }}>{sec.order}. {sec.name}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>¥{sec.amount.toLocaleString('ja-JP')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 明細テーブル */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: '#0f172a' }}>
          <thead>
            <tr style={{ backgroundColor: '#1e293b', borderBottom: '2px solid #475569' }}>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '40px' }}>No</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '200px' }}>商品名</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '150px' }}>規格</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '80px' }}>数量</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '60px' }}>単位</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '100px' }}>単価</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '120px' }}>金額</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '100px' }}>原価</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '100px' }}>セクション</th>
              <th style={{ padding: '10px', color: '#cbd5e1', fontWeight: 'bold', width: '60px' }}>削除</th>
            </tr>
          </thead>
          <tbody>
            {editableDetails.map((detail, idx) => (
              <tr key={idx} style={{ 
                borderBottom: '1px solid #334155',
                backgroundColor: idx % 2 === 0 ? '#0f172a' : '#1e293b'
              }}>
                <td style={{ padding: '8px', color: '#cbd5e1', textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="text"
                    value={detail.item_name}
                    onChange={(e) => handleDetailChange(idx, 'item_name', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="text"
                    value={detail.spec || ''}
                    onChange={(e) => handleDetailChange(idx, 'spec', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="number"
                    value={detail.quantity}
                    onChange={(e) => handleDetailChange(idx, 'quantity', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px',
                      textAlign: 'right'
                    }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="text"
                    value={detail.unit || ''}
                    onChange={(e) => handleDetailChange(idx, 'unit', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="number"
                    value={detail.unit_price}
                    onChange={(e) => handleDetailChange(idx, 'unit_price', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px',
                      textAlign: 'right'
                    }}
                  />
                </td>
                <td style={{ padding: '8px', color: '#fbbf24', fontWeight: 'bold', textAlign: 'right' }}>
                  ¥{detail.amount.toLocaleString('ja-JP')}
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="number"
                    value={detail.cost_price || 0}
                    onChange={(e) => handleDetailChange(idx, 'cost_price', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px',
                      textAlign: 'right'
                    }}
                  />
                </td>
                <td style={{ padding: '8px' }}>
                  <input
                    type="text"
                    value={detail.section_name || ''}
                    onChange={(e) => handleDetailChange(idx, 'section_name', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: '#334155',
                      color: '#cbd5e1',
                      border: '1px solid #475569',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  />
                </td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleDeleteRow(idx)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#334155', fontWeight: 'bold' }}>
              <td colSpan={6} style={{ padding: '12px', textAlign: 'right', color: '#cbd5e1' }}>合計:</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#fbbf24', fontSize: '16px' }}>
                ¥{editableDetails.reduce((sum, d) => sum + d.amount, 0).toLocaleString('ja-JP')}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 確定ボタン */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button
          onClick={handleConfirm}
          style={{
            padding: '14px 40px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginRight: '15px'
          }}
        >
          ✓ 確認画面へ進む
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '14px 40px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
