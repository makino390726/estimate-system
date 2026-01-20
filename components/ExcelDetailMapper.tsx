'use client'

import { useState, useEffect } from 'react'

// Excel列名変換
const colNameToIndex = (col: string) => {
  return col
    .toUpperCase()
    .split('')
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0)
}

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
  id: number
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  cost_price?: number | null
  section_name?: string
}

type ExcelDetailMapperProps = {
  details: any[]
  sections: any[]
  meta: any
  onConfirm: (mappedDetails: Detail[], sections: any[]) => void
  onBack: () => void
}

export default function ExcelDetailMapper({ details, sections, meta, onConfirm, onBack }: ExcelDetailMapperProps) {
  const [activeSheetType, setActiveSheetType] = useState<'detail' | 'cover'>('detail')
  const [detailRows, setDetailRows] = useState<Detail[]>([])
  const [selectedDetail, setSelectedDetail] = useState<number | null>(null)
  const [selectedField, setSelectedField] = useState<string | null>(null)

  const fields = [
    { key: 'item_name', label: '商品名', required: true },
    { key: 'spec', label: '規格' },
    { key: 'quantity', label: '数量', type: 'number' },
    { key: 'unit', label: '単位' },
    { key: 'unit_price', label: '単価', type: 'number' },
    { key: 'amount', label: '金額', type: 'number' },
    { key: 'cost_price', label: '原価', type: 'number' },
    { key: 'section_name', label: 'セクション' },
  ]

  useEffect(() => {
    // 初期明細データをセット（IDを付与）
    const initialDetails = (details || []).map((d, idx) => ({
      id: idx + 1,
      item_name: d.item_name || '',
      spec: d.spec || '',
      unit: d.unit || '',
      quantity: d.quantity || 0,
      unit_price: d.unit_price || 0,
      amount: d.amount || 0,
      cost_price: d.cost_price || 0,
      section_name: d.section_name || ''
    }))
    setDetailRows(initialDetails)
  }, [details])

  const handleCellClick = (cellValue: string, cellAddr: string) => {
    if (selectedDetail === null || !selectedField || !cellValue?.trim()) return

    const field = fields.find(f => f.key === selectedField)
    if (!field) return

    setDetailRows(prev => prev.map(d => {
      if (d.id === selectedDetail) {
        let value: any = cellValue
        if (field.type === 'number') {
          value = parseFloat(cellValue.replace(/,/g, '')) || 0
        }
        
        const updated = { ...d, [selectedField]: value }
        
        // 数量または単価が変更された場合、金額を再計算
        if (selectedField === 'quantity' || selectedField === 'unit_price') {
          updated.amount = (updated.quantity || 0) * (updated.unit_price || 0)
        }
        
        return updated
      }
      return d
    }))
  }

  const handleAddRow = () => {
    const newId = Math.max(...detailRows.map(d => d.id), 0) + 1
    setDetailRows(prev => [...prev, {
      id: newId,
      item_name: '',
      spec: '',
      unit: '',
      quantity: 0,
      unit_price: 0,
      amount: 0,
      cost_price: 0,
      section_name: ''
    }])
    setSelectedDetail(newId)
  }

  const handleDeleteRow = (id: number) => {
    if (confirm('この明細行を削除しますか？')) {
      setDetailRows(prev => prev.filter(d => d.id !== id))
      if (selectedDetail === id) {
        setSelectedDetail(null)
        setSelectedField(null)
      }
    }
  }

  const handleConfirm = () => {
    const missingNames = detailRows.filter(d => !d.item_name?.trim())
    if (missingNames.length > 0) {
      alert(`商品名が未入力の明細があります（${missingNames.length}件）`)
      return
    }
    onConfirm(detailRows, sections)
  }

  const sheets = Array.isArray(meta?.sheets) ? meta.sheets : []
  const currentSheet = sheets.find((s: any) => s.type === activeSheetType) || sheets.find((s: any) => s.type === 'detail') || sheets[0]
  const rows = currentSheet?.rows || []

  const maxColIndex = rows.reduce((max: number, row: any) => {
    const rowMax = (row.cells || []).reduce((m: number, cell: any) => Math.max(m, colNameToIndex(cell.col)), 0)
    return Math.max(max, rowMax)
  }, 0)
  const colCount = Math.min(Math.max(maxColIndex || 8, 12), 52)
  const columns = Array.from({ length: colCount }, (_, i) => indexToColName(i + 1))

  const cellMap: Record<string, any> = {}
  rows.forEach((row: any) => {
    (row.cells || []).forEach((cell: any) => {
      cellMap[`${row.rowNum}-${cell.col}`] = cell
    })
  })

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', padding: '20px', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
          fontSize: '14px',
          backgroundColor: '#6c757d',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← 戻る
      </button>

      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#1e293b' }}>📋 横見積 - 明細マッピング</h1>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
        左側の明細行と項目を選択してから、右側のExcelセルをクリックしてマッピングしてください。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
        {/* 左側：明細行リスト */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>明細行（{detailRows.length}件）</h3>
            <button
              onClick={handleAddRow}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              + 行追加
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {detailRows.map(detail => (
              <div
                key={detail.id}
                style={{
                  border: selectedDetail === detail.id ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: selectedDetail === detail.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedDetail(detail.id)
                  setSelectedField(null)
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>
                    #{detail.id} {detail.item_name || '（未設定）'}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRow(detail.id) }}
                    style={{
                      padding: '2px 8px',
                      fontSize: '11px',
                      backgroundColor: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    削除
                  </button>
                </div>

                {selectedDetail === detail.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                    {fields.map(field => (
                      <div
                        key={field.key}
                        onClick={(e) => { e.stopPropagation(); setSelectedField(field.key) }}
                        style={{
                          padding: '8px',
                          border: selectedField === field.key ? '2px solid #10b981' : '1px solid #d1d5db',
                          borderRadius: '4px',
                          backgroundColor: selectedField === field.key ? '#d1fae5' : '#f9fafb',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ fontWeight: 600, color: selectedField === field.key ? '#047857' : '#374151', marginBottom: '2px' }}>
                          {field.label}
                          {field.required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
                          {selectedField === field.key && <span style={{ marginLeft: '6px', color: '#10b981' }}>← 選択中</span>}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '11px' }}>
                          {detail[field.key as keyof Detail] || '---'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedDetail !== detail.id && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    数量:{detail.quantity} {detail.unit} × ¥{detail.unit_price.toLocaleString()} = ¥{detail.amount.toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirm}
            style={{
              marginTop: '24px',
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            ✓ 確認画面へ進む
          </button>
        </div>

        {/* 右側：Excelプレビュー */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>📑 Excelプレビュー</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {sheets.map((sheet: any) => (
                <button
                  key={sheet.name}
                  onClick={() => setActiveSheetType(sheet.type === 'detail' ? 'detail' : 'cover')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: activeSheetType === sheet.type ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                    backgroundColor: activeSheetType === sheet.type ? '#3b82f6' : '#fff',
                    color: activeSheetType === sheet.type ? '#fff' : '#1e293b',
                    cursor: 'pointer',
                    fontWeight: activeSheetType === sheet.type ? 700 : 600,
                    fontSize: '13px'
                  }}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflow: 'auto', maxHeight: '75vh' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2, background: '#f3f4f6', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #d1d5db', padding: '6px 8px', minWidth: '46px', textAlign: 'center', fontWeight: 'bold' }}>#</th>
                  {columns.map(col => (
                    <th key={col} style={{ borderBottom: '1px solid #d1d5db', borderRight: '1px solid #e5e7eb', padding: '6px 10px', background: '#f3f4f6', fontWeight: 'bold', textAlign: 'center', minWidth: '100px' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, rIdx: number) => (
                  <tr key={row.rowNum || rIdx} style={{ background: rIdx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#f3f4f6', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{row.rowNum}</th>
                    {columns.map(col => {
                      const cell = cellMap[`${row.rowNum}-${col}`]
                      const cellValue = cell?.value?.toString().trim() || ''
                      const isMerged = cell?.isMerged

                      return (
                        <td
                          key={col}
                          onClick={() => handleCellClick(cellValue, `${col}${row.rowNum}`)}
                          style={{
                            borderRight: '1px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                            padding: '6px 8px',
                            minWidth: '100px',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: isMerged ? '#eef2ff' : '#fff',
                            cursor: cellValue && selectedDetail && selectedField ? 'pointer' : 'default',
                            fontSize: '13px',
                            border: undefined
                          }}
                          title={cell ? `${col}${row.rowNum}: ${cellValue}${cell.mergeRange ? ` [結合: ${cell.mergeRange}]` : ''}` : `${col}${row.rowNum}`}
                        >
                          <span style={{ color: '#94a3b8', fontSize: '10px', marginRight: 4, fontWeight: '500' }}>{col}</span>
                          <span style={{ color: '#1e293b' }}>{cellValue}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
