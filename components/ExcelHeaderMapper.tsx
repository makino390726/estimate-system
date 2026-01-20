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

type Field = {
  key: string
  label: string
  required?: boolean
  multiSelect?: boolean
}

type ExcelHeaderMapperProps = {
  meta: any
  onConfirm: (mapping: any) => void
  onBack: () => void
}

export default function ExcelHeaderMapper({ meta, onConfirm, onBack }: ExcelHeaderMapperProps) {
  const [activeSheetType, setActiveSheetType] = useState<'detail' | 'cover'>('cover')
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, string[]>>({
    customerName: [],
    subject: [],
    estimateDate: [],
    estimateNo: [],
    validityText: [],
    paymentTerms: [],
    deliveryDeadline: [],
    deliveryTerms: [],
  })

  const fields: Field[] = [
    { key: 'customerName', label: '顧客名', required: true },
    { key: 'subject', label: '件名', required: true },
    { key: 'estimateDate', label: '見積日', required: true, multiSelect: true },
    { key: 'estimateNo', label: '見積番号', required: true, multiSelect: true },
    { key: 'validityText', label: '有効期限', multiSelect: true },
    { key: 'paymentTerms', label: '支払条件', multiSelect: true },
    { key: 'deliveryDeadline', label: '受渡期限', multiSelect: true },
    { key: 'deliveryTerms', label: '受渡条件', multiSelect: true },
  ]

  // 初期値をmetaから設定
  useEffect(() => {
    if (meta) {
      const initial: Record<string, string[]> = {}
      fields.forEach(f => {
        const value = meta[f.key]
        initial[f.key] = value ? [String(value)] : []
      })
      setMapping(initial)
    }
  }, [meta])

  const handleCellClick = (cellValue: string, cellAddr: string) => {
    if (!selectedField || !cellValue?.trim()) return

    const field = fields.find(f => f.key === selectedField)
    if (!field) return

    setMapping(prev => {
      const current = prev[selectedField] || []
      
      // 既に選択されている場合は削除（トグル）
      if (current.includes(cellValue)) {
        return {
          ...prev,
          [selectedField]: current.filter(v => v !== cellValue)
        }
      }
      
      // 単数選択の場合は置き換え
      if (!field.multiSelect) {
        return {
          ...prev,
          [selectedField]: [cellValue]
        }
      }
      
      // 複数選択の場合は追加
      return {
        ...prev,
        [selectedField]: [...current, cellValue]
      }
    })
  }

  const handleClear = (fieldKey: string) => {
    setMapping(prev => ({ ...prev, [fieldKey]: [] }))
  }

  const handleConfirm = () => {
    const required = fields.filter(f => f.required).map(f => f.key)
    const missing = required.filter(key => !mapping[key] || mapping[key].length === 0)
    
    if (missing.length > 0) {
      const labels = missing.map(key => fields.find(f => f.key === key)?.label).join('、')
      alert(`必須項目が未入力です：${labels}`)
      return
    }

    const result: Record<string, string> = {}
    Object.keys(mapping).forEach(key => {
      result[key] = mapping[key].join(' ')
    })
    
    onConfirm(result)
  }

  const sheets = Array.isArray(meta?.sheets) ? meta.sheets : []
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
    (row.cells || []).forEach((cell: any) => {
      cellMap[`${row.rowNum}-${cell.col}`] = cell
    })
  })

  // セルが選択されているかチェック
  const isCellSelected = (cellValue: string): boolean => {
    return Object.values(mapping).some(values => values.includes(cellValue))
  }

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

      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#1e293b' }}>📊 横見積 - ヘッダーマッピング</h1>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
        左側の項目を選択してから、右側のExcelセルをクリックしてマッピングしてください。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px' }}>
        {/* 左側：項目設定 */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0', maxHeight: '80vh', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>項目設定</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fields.map(field => (
              <div
                key={field.key}
                onClick={() => setSelectedField(selectedField === field.key ? null : field.key)}
                style={{
                  padding: '12px',
                  border: selectedField === field.key ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: selectedField === field.key ? '#dbeafe' : '#fff',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 600, color: selectedField === field.key ? '#1e40af' : '#1e293b', fontSize: '14px' }}>
                    {field.label}
                    {field.required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
                    {field.multiSelect && <span style={{ fontSize: '11px', color: '#f97316', marginLeft: '6px' }}>（複数可）</span>}
                  </div>
                  {mapping[field.key]?.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClear(field.key) }}
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
                      クリア
                    </button>
                  )}
                </div>
                {selectedField === field.key && (
                  <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>
                    ← 選択中（右側のセルをクリック）
                  </div>
                )}
                {mapping[field.key]?.length > 0 ? (
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {mapping[field.key].map((val, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#10b981',
                          color: '#fff',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                      >
                        {val}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>未設定</div>
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
            ✓ 次へ（明細マッピング）
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
                      const isSelected = isCellSelected(cellValue)
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
                            background: isSelected ? '#fef3c7' : isMerged ? '#eef2ff' : '#fff',
                            cursor: cellValue && selectedField ? 'pointer' : 'default',
                            fontSize: '13px',
                            border: isSelected ? '2px solid #f59e0b' : undefined
                          }}
                          title={cell ? `${col}${row.rowNum}: ${cellValue}${cell.mergeRange ? ` [結合: ${cell.mergeRange}]` : ''}` : `${col}${row.rowNum}`}
                        >
                          <span style={{ color: '#94a3b8', fontSize: '10px', marginRight: 4, fontWeight: '500' }}>{col}</span>
                          <span style={{ color: '#1e293b', fontWeight: isSelected ? 600 : 400 }}>{cellValue}</span>
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
