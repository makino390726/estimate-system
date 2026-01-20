'use client'

import React, { useState } from 'react'

interface TextMapperProps {
  textLines: string[]
  detailLines?: Array<{
    productName: string
    spec: string
    unit: string
    quantity: number
    unitPrice: number
    amount: number
  }>
  fileName: string
  onMapping: (mapping: {
    customerName: string
    subject: string
    estimateDate: string
    estimateNumber: string
    deliveryDeadline?: string
    deliveryTerms?: string
    validityText?: string
    paymentTerms?: string
  }) => void
  onCancel: () => void
}

export default function TextMapper({
  textLines,
  detailLines = [],
  fileName,
  onMapping,
  onCancel,
}: TextMapperProps) {
  const [mapping, setMapping] = useState({
    customerName: [] as string[],
    subject: [] as string[],
    estimateDate: [] as string[],
    estimateNumber: [] as string[],
    deliveryDeadline: [] as string[],
    deliveryTerms: [] as string[],
    validityText: [] as string[],
    paymentTerms: [] as string[],
  })

  const [selectedField, setSelectedField] = useState<keyof typeof mapping | null>(null)
  const [lines, setLines] = useState<string[]>(textLines)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

  // テキスト行が更新されたらローカルにも反映
  React.useEffect(() => {
    setLines(textLines)
    setEditingIndex(null)
    setEditingValue('')
  }, [textLines])

  const fields = [
    { key: 'customerName' as const, label: '顧客名', placeholder: 'テキストをクリックして選択（単数）', multiSelect: false },
    { key: 'subject' as const, label: '件名', placeholder: 'テキストをクリックして選択（単数）', multiSelect: false },
    { key: 'estimateDate' as const, label: '見積日', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
    { key: 'estimateNumber' as const, label: '見積番号', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
    { key: 'deliveryDeadline' as const, label: '受渡期限', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
    { key: 'deliveryTerms' as const, label: '受渡条件', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
    { key: 'validityText' as const, label: '有効期限', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
    { key: 'paymentTerms' as const, label: '御支払条件', placeholder: 'テキストをクリックして選択（複数可）', multiSelect: true },
  ]

  const handleTextLineClick = (line: string) => {
    if (!selectedField) return

    const field = fields.find(f => f.key === selectedField)
    if (!field) return

    setMapping(prev => {
      const currentLines = prev[selectedField]
      
      // 既に選択されている場合は削除（トグル）
      if (currentLines.includes(line)) {
        return {
          ...prev,
          [selectedField]: currentLines.filter(l => l !== line)
        }
      }
      
      // 単数選択フィールドの場合は置き換え
      if (!field.multiSelect) {
        return {
          ...prev,
          [selectedField]: [line]
        }
      }
      
      // 複数選択フィールドの場合は追加
      return {
        ...prev,
        [selectedField]: [...currentLines, line]
      }
    })
  }

  // 編集開始
  const startEdit = (idx: number, value: string) => {
    setEditingIndex(idx)
    setEditingValue(value)
  }

  // 編集キャンセル
  const cancelEdit = () => {
    setEditingIndex(null)
    setEditingValue('')
  }

  // 編集保存: テキスト行を置き換え、すでに選択されている場合はマッピングも置き換える
  const saveEdit = () => {
    if (editingIndex === null) return
    const oldLine = lines[editingIndex]
    const newLine = editingValue.trim()
    if (!newLine) return

    setLines(prev => {
      const next = [...prev]
      next[editingIndex] = newLine
      return next
    })

    // マッピング内の古い文字列を新しい文字列に置換
    setMapping(prev => {
      const next = { ...prev }
      ;(Object.keys(next) as Array<keyof typeof next>).forEach(key => {
        if (next[key].includes(oldLine)) {
          next[key] = next[key].map(v => (v === oldLine ? newLine : v))
        }
      })
      return next
    })

    setEditingIndex(null)
    setEditingValue('')
  }

  const handleSet = () => {
    if (mapping.customerName.length > 0 && mapping.subject.length > 0 && mapping.estimateDate.length > 0 && mapping.estimateNumber.length > 0) {
      onMapping({
        customerName: mapping.customerName.join(' '),
        subject: mapping.subject.join(' '),
        estimateDate: mapping.estimateDate.join(' '),
        estimateNumber: mapping.estimateNumber.join(' '),
        deliveryDeadline: mapping.deliveryDeadline.length > 0 ? mapping.deliveryDeadline.join(' ') : undefined,
        deliveryTerms: mapping.deliveryTerms.length > 0 ? mapping.deliveryTerms.join(' ') : undefined,
        validityText: mapping.validityText.length > 0 ? mapping.validityText.join(' ') : undefined,
        paymentTerms: mapping.paymentTerms.length > 0 ? mapping.paymentTerms.join(' ') : undefined,
      })
    } else {
      alert('最低でも「顧客名」「件名」「見積日」「見積番号」は入力してください')
    }
  }

  const handleClear = (field: keyof typeof mapping) => {
    setMapping(prev => ({
      ...prev,
      [field]: []
    }))
  }

  // テキスト行が選択されているかチェック
  const isLineSelected = (line: string): boolean => {
    return Object.values(mapping).some(lines => lines.includes(line))
  }

  // どのフィールドに選択されているかを取得
  const getLineFieldKey = (line: string): keyof typeof mapping | null => {
    for (const [key, lines] of Object.entries(mapping)) {
      if (lines.includes(line)) {
        return key as keyof typeof mapping
      }
    }
    return null
  }

  return (
    <div className="w-full bg-white rounded-lg border border-gray-200">
      <div className="p-6 bg-blue-50 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-800">テキストマッピング</h2>
        <p className="text-sm text-gray-600 mt-2">
          PDFから抽出したテキストを確認して、各項目に対応するテキストを選択してください
        </p>
        <p className="text-xs text-gray-500 mt-2">ファイル: {fileName}</p>
        {detailLines.length > 0 && (
          <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded">
            <p className="text-xs font-semibold text-green-700">✓ 明細行を{detailLines.length}件自動抽出しました</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* 左側：フィールド設定 */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 mb-4">項目設定</h3>
          {fields.map(field => (
            <div
              key={field.key}
              className={`p-3 border-2 rounded cursor-pointer transition ${
                selectedField === field.key
                  ? 'border-blue-600 bg-blue-100 shadow-md'
                  : 'border-gray-300 bg-white hover:border-blue-400'
              }`}
              onClick={() => setSelectedField(selectedField === field.key ? null : field.key)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className={`font-semibold ${selectedField === field.key ? 'text-blue-700' : 'text-gray-800'}`}>
                    {field.label}
                    {field.multiSelect && <span className="ml-2 text-xs text-orange-600 font-normal">（複数選択可）</span>}
                    {selectedField === field.key && <span className="ml-2 text-blue-500">← 選択中</span>}
                  </div>
                  {mapping[field.key].length > 0 ? (
                    <div className="space-y-1 mt-2">
                      {mapping[field.key].map((line, idx) => (
                        <div key={idx} className="text-sm text-gray-900 font-medium p-2 bg-blue-50 rounded border border-blue-300 break-words flex justify-between items-center">
                          <span>{line}</span>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setMapping(prev => ({
                                ...prev,
                                [field.key]: prev[field.key].filter((_, i) => i !== idx)
                              }))
                            }}
                            className="ml-2 text-xs text-red-500 hover:text-red-700 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-xs mt-1 ${selectedField === field.key ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                      {selectedField === field.key ? '→ 右のテキストをクリック' : field.placeholder}
                    </div>
                  )}
                </div>
                {mapping[field.key].length > 0 && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleClear(field.key)
                    }}
                    className="ml-2 text-xs text-red-500 hover:text-red-700 px-2 py-1 hover:bg-red-50 rounded"
                  >
                    全クリア
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 右側：テキスト行リスト */}
        <div>
          <h3 className="font-semibold text-gray-700 mb-4">
            抽出テキスト ({lines.length}行)
          </h3>
          <div className="border border-gray-200 rounded h-96 overflow-y-auto bg-gray-50">
            {textLines.length > 0 ? (
              <div className="space-y-1 p-2">
                {lines.map((line, idx) => {
                  const isSelected = isLineSelected(line)
                  const fieldKey = getLineFieldKey(line)
                  const fieldLabel = fieldKey ? fields.find(f => f.key === fieldKey)?.label : null
                  
                  return (
                    <div key={idx} className="p-2 bg-white border border-gray-200 rounded">
                      {editingIndex === idx ? (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500 font-semibold">[{idx + 1}] 編集</div>
                          <input
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-300 rounded text-sm"
                          />
                          <div className="flex gap-2 justify-end text-xs">
                            <button
                              onClick={saveEdit}
                              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              保存
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleTextLineClick(line)}
                          className={`p-1 text-sm rounded cursor-pointer transition break-words ${
                            isSelected
                              ? 'bg-green-100 border-2 border-green-500 text-gray-900 font-medium'
                              : selectedField
                              ? 'hover:bg-blue-200 bg-white border border-blue-300 text-gray-900'
                              : 'bg-white border border-gray-200 text-gray-600 cursor-default'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <span className="text-xs text-gray-500 font-semibold">[{idx + 1}]</span> {line}
                            </div>
                            <div className="flex items-center gap-1">
                              {isSelected && fieldLabel && (
                                <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                                  ✓ {fieldLabel}
                                </span>
                              )}
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  startEdit(idx, line)
                                }}
                                className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm hover:bg-blue-700"
                              >
                                編集
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-400">
                テキストが見つかりません
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="flex gap-3 p-6 bg-gray-50 border-t border-gray-200 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-100 transition"
        >
          キャンセル
        </button>
        <button
          onClick={handleSet}
          disabled={!mapping.customerName.length || !mapping.subject.length || !mapping.estimateDate.length || !mapping.estimateNumber.length}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          セット → 確認画面へ
        </button>
      </div>
    </div>
  )
}
