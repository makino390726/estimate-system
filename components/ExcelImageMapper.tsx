'use client'

import { useState, useRef, useEffect } from 'react'

type CellMapping = {
  type: 'customerName' | 'subject' | 'estimateDate' | 'estimateNo' | 
        'productNameCol' | 'specCol' | 'qtyCol' | 'unitPriceCol' | 'amountCol' | 'wholesalePriceCol' |
        'headerRow' | 'dataStartRow'
  label: string
  cells: string[]  // 例: ['A1', 'B1'] または ['D:D'] (列全体)
  color: string
}

type ExcelImageMapperProps = {
  htmlContent: string
  cellMap: { [key: string]: { row: number; col: number; value: any } }
  onMappingComplete: (mappings: CellMapping[]) => void
  onCancel: () => void
}

const MAPPING_TYPES: { type: CellMapping['type']; label: string; color: string }[] = [
  { type: 'customerName', label: '顧客名', color: '#ff6b6b' },
  { type: 'subject', label: '件名', color: '#4ecdc4' },
  { type: 'estimateDate', label: '見積日', color: '#45b7d1' },
  { type: 'estimateNo', label: '見積番号', color: '#96ceb4' },
  { type: 'headerRow', label: 'ヘッダー行', color: '#ffeaa7' },
  { type: 'productNameCol', label: '品名列', color: '#fd79a8' },
  { type: 'qtyCol', label: '数量列', color: '#fdcb6e' },
  { type: 'unitPriceCol', label: '単価列', color: '#6c5ce7' },
  { type: 'amountCol', label: '金額列', color: '#a29bfe' },
  { type: 'wholesalePriceCol', label: '仕切価格列', color: '#fd79a8' },
  { type: 'dataStartRow', label: 'データ開始行', color: '#74b9ff' },
]

export default function ExcelImageMapper({ 
  htmlContent, 
  cellMap, 
  onMappingComplete, 
  onCancel 
}: ExcelImageMapperProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mappings, setMappings] = useState<CellMapping[]>([])
  const [selectedType, setSelectedType] = useState<CellMapping['type'] | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  
  useEffect(() => {
    if (!iframeRef.current) return
    
    const iframe = iframeRef.current
    const handleLoad = () => {
      const doc = iframe.contentDocument
      if (!doc) return
      
      // スタイル追加
      const style = doc.createElement('style')
      style.textContent = `
        td, th {
          position: relative;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        td:hover, th:hover {
          background-color: #e3f2fd !important;
        }
        .mapped-cell {
          outline: 3px solid;
          outline-offset: -3px;
        }
      `
      doc.head.appendChild(style)
      
      // セルクリックイベント
      doc.body.addEventListener('click', handleCellClick)
    }
    
    iframe.addEventListener('load', handleLoad)
    return () => {
      iframe.removeEventListener('load', handleLoad)
    }
  }, [selectedType])
  
  const handleCellClick = (e: MouseEvent) => {
    if (!selectedType) return
    
    const target = e.target as HTMLElement
    if (target.tagName !== 'TD' && target.tagName !== 'TH') return
    
    // セル位置取得（簡易版）
    const row = (target.parentElement as HTMLTableRowElement)?.rowIndex + 1
    const col = Array.from(target.parentElement?.children || []).indexOf(target) + 1
    const cellAddr = String.fromCharCode(64 + col) + row  // 簡易的な変換
    
    const selectedColor = MAPPING_TYPES.find(t => t.type === selectedType)?.color || '#000'
    
    // マッピング追加
    setMappings(prev => {
      const existing = prev.find(m => m.type === selectedType)
      if (existing) {
        return prev.map(m => 
          m.type === selectedType 
            ? { ...m, cells: [...m.cells, cellAddr] }
            : m
        )
      }
      return [
        ...prev,
        {
          type: selectedType,
          label: MAPPING_TYPES.find(t => t.type === selectedType)?.label || '',
          cells: [cellAddr],
          color: selectedColor
        }
      ]
    })
    
    // 視覚的フィードバック
    target.classList.add('mapped-cell')
    target.style.outlineColor = selectedColor
  }
  
  const handleComplete = () => {
    onMappingComplete(mappings)
  }
  
  const handleReset = () => {
    setMappings([])
    if (iframeRef.current?.contentDocument) {
      const cells = iframeRef.current.contentDocument.querySelectorAll('.mapped-cell')
      cells.forEach(cell => {
        cell.classList.remove('mapped-cell')
      })
    }
  }
  
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {/* 左側：ツールパネル */}
      <div style={{ width: 450, background: '#fff', padding: 20, boxShadow: '2px 0 8px rgba(0,0,0,0.1)', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0, fontSize: 18, marginBottom: 16 }}>📍 項目マッピング</h2>
        
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            各項目をクリックし、Excel画像上の該当セルをクリックしてください
          </p>
          
          {MAPPING_TYPES.map(({ type, label, color }) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              style={{
                width: '100%',
                padding: '14px 16px',
                marginBottom: 10,
                border: `2px solid ${selectedType === type ? color : '#ddd'}`,
                background: selectedType === type ? color + '20' : 'white',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 16,
                fontWeight: selectedType === type ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: '#333'
              }}
            >
              <span style={{ 
                width: 20, 
                height: 20, 
                background: color, 
                borderRadius: 3,
                display: 'inline-block',
                flexShrink: 0
              }} />
              <span style={{ flex: 1, color: '#000', fontWeight: selectedType === type ? 'bold' : '500' }}>{label}</span>
              {mappings.find(m => m.type === type) && (
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#000', fontWeight: 'bold' }}>
                  ✓ {mappings.find(m => m.type === type)?.cells.length}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <div style={{ borderTop: '1px solid #eee', paddingTop: 16, marginTop: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>選択済み項目</h3>
          {mappings.length === 0 && (
            <p style={{ fontSize: 12, color: '#999' }}>まだ項目が選択されていません</p>
          )}
          {mappings.map(m => (
            <div key={m.type} style={{ marginBottom: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: m.color, borderRadius: 2 }} />
                <strong>{m.label}:</strong>
                <span>{m.cells.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleComplete}
            disabled={mappings.length === 0}
            style={{
              padding: '12px',
              background: mappings.length > 0 ? '#16a34a' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: mappings.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: 14
            }}
          >
            ✓ マッピング完了
          </button>
          
          <button
            onClick={handleReset}
            style={{
              padding: '10px',
              background: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            🔄 リセット
          </button>
          
          <button
            onClick={onCancel}
            style={{
              padding: '10px',
              background: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            ← 戻る
          </button>
        </div>
      </div>
      
      {/* 右側：Excel画像プレビュー */}
      <div style={{ flex: 1, padding: 20, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: 1400 }}>
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            style={{
              width: '1400px',
              height: '800px',
              border: 'none',
              borderRadius: 8
            }}
          />
        </div>
      </div>
    </div>
  )
}
