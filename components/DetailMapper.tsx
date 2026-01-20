'use client'

import { useState, useEffect } from 'react'

type DetailMapperProps = {
  textLines: string[]
  onMapping: (details: Array<{
    item_name: string
    spec: string
    unit: string
    quantity: number
    unit_price: number
    amount: number
    cost_price: number
  }>) => void
  onBack: () => void
}

type DetailEditState = {
  item_name: string
  spec: string
  quantity: number
  unit: string
  unit_price: number
  amount: number
  cost_price: number
}

export default function DetailMapper({ textLines, onMapping, onBack }: DetailMapperProps) {
  const [selectedRows, setSelectedRows] = useState<number[]>([])
  const [detailNum, setDetailNum] = useState(1)
  const [details, setDetails] = useState<Array<{
    num: number
    rows: number[]
    itemName: string
    spec: string
    quantity: number
    unit: string
    unitPrice: number
    amount: number
    costPrice: number
  }>>([])

  // 編集モード
  const [editingDetail, setEditingDetail] = useState<DetailEditState | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  const handleToggleRow = (idx: number) => {
    setSelectedRows(prev => {
      if (prev.includes(idx)) {
        return prev.filter(i => i !== idx)
      } else {
        return [...prev, idx].sort((a, b) => a - b)
      }
    })
  }

  // テキスト行を結合して、スペース/カンマで分割
  const parseTextToTokens = (rowIndices: number[]): string[] => {
    const combined = rowIndices.map(idx => textLines[idx]).join(' ')
    // スペース、カンマ、その他区切り文字で分割し、空でない要素のみ
    const tokens = combined
      .split(/[\s,]+/)
      .filter(t => t.length > 0)
    return tokens
  }

  const handleCreateDetailWithEdit = () => {
    if (selectedRows.length === 0) {
      alert('テキスト行を選択してください')
      return
    }

    const tokens = parseTextToTokens(selectedRows)
    
    // 初期値を設定
    let unitPrice = 0
    let amount = 0
    let quantity = 1
    let unit = ''
    let wholesalePrice = 0
    
    // 数値を抽出（後ろから最大3つ）
    const numbers: number[] = []
    for (let i = tokens.length - 1; i >= 0 && numbers.length < 3; i--) {
      const num = parseInt(tokens[i].replace(/,/g, ''))
      if (!isNaN(num) && num > 0) {
        numbers.push(num)
      }
    }

    // 仕切価格がある場合: 後ろから [仕切価格, 金額, 単価] または [仕切価格, 金額]
    if (numbers.length >= 2) {
      wholesalePrice = numbers[0]  // 最後の数値が仕切価格
      amount = numbers[1]          // その前が金額
      
      // 数量を探す（小さい数値で、単位の直前）
      const unitPattern = /(式|個|本|セット|kg|m|cm|台|枚|組|ペア|ロット|箱|袋|カート|ケース)/
      for (let i = 0; i < tokens.length - 1; i++) {
        const possibleQty = parseInt(tokens[i])
        if (!isNaN(possibleQty) && possibleQty < 1000 && unitPattern.test(tokens[i + 1])) {
          quantity = possibleQty
          unit = tokens[i + 1]
          break
        }
      }
      
      // 単価 = 金額 ÷ 数量 で計算
      if (quantity > 0) {
        unitPrice = Math.round(amount / quantity)
      }
    } else if (numbers.length === 1) {
      // 数値が1つだけの場合は金額として扱う
      amount = numbers[0]
      unitPrice = amount
    }

    // 単位を探す（まだ見つかっていない場合）
    if (!unit) {
      const unitPattern = /(式|個|本|セット|kg|m|cm|台|枚|組|ペア|ロット|箱|袋|カート|ケース)/
      for (const token of tokens) {
        if (unitPattern.test(token)) {
          unit = token
          break
        }
      }
    }

    setEditingDetail({
      item_name: tokens[0] || '',
      spec: tokens.slice(1, Math.max(1, tokens.length - 6)).join(' ') || '',
      quantity,
      unit,
      unit_price: unitPrice,
      amount,
      cost_price: wholesalePrice || 0
    })
    setShowEditModal(true)
  }

  const handleConfirmEdit = () => {
    if (!editingDetail) return
    
    const detail = {
      num: detailNum,
      rows: [...selectedRows],
      itemName: editingDetail.item_name,
      spec: editingDetail.spec,
      quantity: editingDetail.quantity,
      unit: editingDetail.unit,
      unitPrice: editingDetail.unit_price,
      amount: editingDetail.amount,
      costPrice: editingDetail.cost_price
    }

    setDetails(prev => [...prev, detail])
    setSelectedRows([])
    setDetailNum(detailNum + 1)
    setShowEditModal(false)
    setEditingDetail(null)
  }

  const handleConfirm = () => {
    if (details.length === 0) {
      alert('明細行を作成してください')
      return
    }

    const result = details.map(d => ({
      item_name: d.itemName,
      spec: d.spec,
      unit: d.unit,
      quantity: d.quantity,
      unit_price: d.unitPrice,
      amount: d.amount,
      cost_price: d.costPrice
    }))

    onMapping(result)
  }

  const handleDeleteDetail = (num: number) => {
    setDetails(prev => prev.filter(d => d.num !== num))
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '20px' }}>
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '10px 16px',
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

      <h2 style={{ color: '#1a1a1a', marginBottom: '20px' }}>📊 明細行マッピング</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        抽出されたテキスト行を選択して、明細行を構築してください。複数行を選択することで、1つの明細行を作成できます。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        {/* 左：テキスト行選択 */}
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '8px',
          border: '2px solid #2196f3'
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#0d47a1' }}>📝 抽出テキスト行</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'white' }}>
            {textLines.map((line, idx) => (
              <div
                key={idx}
                onClick={() => handleToggleRow(idx)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  backgroundColor: selectedRows.includes(idx) ? '#e3f2fd' : 'white',
                  borderLeft: selectedRows.includes(idx) ? '4px solid #2196f3' : '4px solid transparent',
                  color: '#000',
                  userSelect: 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedRows.includes(idx)}
                  onChange={() => {}}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontSize: '13px' }}>
                  <strong>{idx + 1}:</strong> {line.substring(0, 60)}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleCreateDetailWithEdit}
            disabled={selectedRows.length === 0}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              backgroundColor: selectedRows.length === 0 ? '#bdbdbd' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedRows.length === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✏️ 明細{detailNum}を編集 ({selectedRows.length}行選択)
          </button>
        </div>

        {/* 右：作成済み明細 */}
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '8px',
          border: '2px solid #ff6f00'
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#e65100' }}>✅ 構築済み明細</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'white' }}>
            {details.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                まだ明細行はありません
              </div>
            ) : (
              details.map((d) => (
                <div
                  key={d.num}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid #eee',
                    backgroundColor: '#fffbf0'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <strong style={{ color: '#e65100', fontSize: '14px' }}>明細{d.num}</strong>
                    <button
                      onClick={() => handleDeleteDetail(d.num)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      削除
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#000', lineHeight: '1.6' }}>
                    <div><strong>商品:</strong> {d.itemName}</div>
                    <div><strong>規格:</strong> {d.spec || 'なし'}</div>
                    <div>
                      <strong>数量:</strong> {d.quantity} {d.unit} × ¥{d.unitPrice.toLocaleString()} = ¥{d.amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 編集モーダル */}
      {showEditModal && editingDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#1a1a1a', fontSize: '18px' }}>
              明細{detailNum} - 項目編集
            </h3>

            <div style={{ display: 'grid', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                  品名 <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editingDetail.item_name}
                  onChange={(e) => setEditingDetail({...editingDetail, item_name: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid #2196f3',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                  規格・寸法
                </label>
                <input
                  type="text"
                  value={editingDetail.spec}
                  onChange={(e) => setEditingDetail({...editingDetail, spec: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid #2196f3',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                    数量 <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={editingDetail.quantity}
                    onChange={(e) => {
                      const qty = Number(e.target.value)
                      const amount = qty * editingDetail.unit_price
                      setEditingDetail({...editingDetail, quantity: qty, amount})
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '2px solid #2196f3',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                    単位 <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingDetail.unit}
                    onChange={(e) => setEditingDetail({...editingDetail, unit: e.target.value})}
                    placeholder="式、個、本など"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '2px solid #2196f3',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                  金額 <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  value={editingDetail.amount}
                  onChange={(e) => {
                    const amount = Number(e.target.value)
                    const unitPrice = editingDetail.quantity > 0 ? Math.round(amount / editingDetail.quantity) : 0
                    setEditingDetail({...editingDetail, amount, unit_price: unitPrice})
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid #2196f3',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '4px' }}>
                  原価単価（仕切価格）
                </label>
                <input
                  type="number"
                  value={editingDetail.cost_price}
                  onChange={(e) => setEditingDetail({...editingDetail, cost_price: Number(e.target.value)})}
                  placeholder="PDFから自動検出された値"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '2px solid #4caf50',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ backgroundColor: '#e3f2fd', padding: '12px', borderRadius: '4px', border: '1px solid #90caf9' }}>
                <strong style={{ color: '#1565c0' }}>単価（自動計算）:</strong>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0d47a1', marginTop: '4px' }}>
                  ¥{editingDetail.unit_price.toLocaleString('ja-JP')}
                  {editingDetail.quantity > 0 && (
                    <span style={{ fontSize: '14px', color: '#666', marginLeft: '8px' }}>
                      (金額 ¥{editingDetail.amount.toLocaleString()} ÷ 数量 {editingDetail.quantity})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingDetail(null)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmEdit}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✅ 確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確定ボタン */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={onBack}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#757575',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ← 戻る
        </button>
        <button
          onClick={handleConfirm}
          disabled={details.length === 0}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: details.length === 0 ? '#bdbdbd' : '#2e7d32',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: details.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          → 確認画面へ ({details.length}明細)
        </button>
      </div>
    </div>
  )
}
