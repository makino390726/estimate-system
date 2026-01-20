'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// PDF.jsのworkerを設定
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
}

type PinMapping = {
  type: 'customerName' | 'subject' | 'estimateDate' | 'estimateNo' |
        'productNameCol' | 'specCol' | 'qtyCol' | 'unitPriceCol' | 'amountCol' | 'wholesalePriceCol'
  label: string
  area: { x1: number; y1: number; x2: number; y2: number } | null
  number: number
}

type PdfMapperProps = {
  file: File
  onMappingComplete: (mappings: PinMapping[]) => void
  onCancel: () => void
}

const MAPPING_ITEMS: { type: PinMapping['type']; label: string }[] = [
  { type: 'customerName', label: '顧客名' },
  { type: 'subject', label: '件名' },
  { type: 'estimateDate', label: '見積日' },
  { type: 'estimateNo', label: '見積番号' },
  { type: 'productNameCol', label: '品名列' },
  { type: 'specCol', label: '仕様列' },
  { type: 'qtyCol', label: '数量列' },
  { type: 'unitPriceCol', label: '単価列' },
  { type: 'amountCol', label: '金額列' },
  { type: 'wholesalePriceCol', label: '仕切価格列' },
]

export default function PdfMapper({ file, onMappingComplete, onCancel }: PdfMapperProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(1)

  const [mappings, setMappings] = useState<PinMapping[]>(
    MAPPING_ITEMS.map((item, index) => ({
      type: item.type,
      label: item.label,
      area: null,
      number: index + 1
    }))
  )
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [currentDrag, setCurrentDrag] = useState<{ x: number; y: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const renderPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        
        const viewport = page.getViewport({ scale: 2.0 }) // 高解像度
        const canvas = canvasRef.current
        if (!canvas) return
        
        const context = canvas.getContext('2d')
        if (!context) return
        
        canvas.width = viewport.width
        canvas.height = viewport.height
        
        await page.render({ canvasContext: context, viewport }).promise
        
        console.log('[PdfMapper] PDF rendered:', viewport.width, 'x', viewport.height)
      } catch (e: any) {
        console.error('[PdfMapper] PDF render error:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    renderPdf()
  }, [file])

  const completedCount = useMemo(() => mappings.filter(m => m.area !== null).length, [mappings])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedIndex === null || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom
    setDragStart({ x, y })
    setCurrentDrag({ x, y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStart && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom
      setCurrentDrag({ x, y })
    }
  }

  const handleMouseUp = () => {
    if (selectedIndex === null || !dragStart || !currentDrag) return
    
    const x1 = Math.min(dragStart.x, currentDrag.x)
    const y1 = Math.min(dragStart.y, currentDrag.y)
    const x2 = Math.max(dragStart.x, currentDrag.x)
    const y2 = Math.max(dragStart.y, currentDrag.y)
    
    setMappings(prev => prev.map((m, i) => 
      i === selectedIndex ? { ...m, area: { x1, y1, x2, y2 } } : m
    ))
    
    setDragStart(null)
    setCurrentDrag(null)
    
    if (selectedIndex < mappings.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    } else {
      setSelectedIndex(null)
    }
  }

  const handleComplete = () => {
    const completed = mappings.filter(m => m.area)
    onMappingComplete(completed)
  }

  const handleReset = () => {
    setMappings(prev => prev.map(m => ({ ...m, area: null })))
    setSelectedIndex(null)
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', maxHeight: '800px', background: '#fff', border: '2px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
      {/* 左パネル */}
      <div style={{ width: 380, background: '#fff', padding: 16, overflowY: 'auto', borderRight: '1px solid #eee' }}>
        <h2 style={{ marginTop: 0, fontSize: 16, marginBottom: 8, color: '#000' }}>📍 PDFマッピング</h2>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>南九州営業所のPDFでも使えるよう座標で指定します。</p>

        {/* ズーム */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[0.75, 1, 1.25, 1.5].map(z => (
              <button key={z}
                onClick={() => setZoom(z)}
                style={{ padding: 6, background: zoom === z ? '#00bfa5' : '#f0f0f0', color: zoom === z ? '#fff' : '#666', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                {Math.round(z*100)}%
              </button>
            ))}
          </div>
        </div>

        {/* 項目 */}
        <div style={{ marginBottom: 16 }}>
          {mappings.map((item, i) => (
            <div key={item.type}
              onClick={() => setSelectedIndex(i)}
              style={{ padding: 12, marginBottom: 8, border: `2px solid ${selectedIndex===i ? '#00bfa5' : item.area ? '#4caf50' : '#ddd'}`, background: selectedIndex===i ? '#e0f7f4' : item.area ? '#f1f8f4' : '#fff', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: item.area ? '#4caf50' : selectedIndex===i ? '#00bfa5' : '#ddd', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold' }}>{item.number}</div>
              <div style={{ fontSize: 14, color: '#000' }}>{item.label}</div>
              {item.area && (
                <button onClick={(e) => { e.stopPropagation(); setMappings(prev => prev.map((m, idx) => idx===i ? { ...m, area: null } : m)) }}
                  style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 11, background: '#fee', color: '#c00', border: '1px solid #fcc', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
              )}
            </div>
          ))}
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleComplete} disabled={completedCount===0} style={{ padding: 10, background: completedCount>0 ? '#00bfa5' : '#ccc', color: '#fff', border: 'none', borderRadius: 6, cursor: completedCount>0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>セット ({completedCount})</button>
          <button onClick={handleReset} style={{ padding: 10, background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 6 }}>リセット</button>
          <button onClick={onCancel} style={{ padding: 10, background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 6 }}>キャンセル</button>
        </div>
      </div>

      {/* 右：PDFキャンバス */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#f9f9f9', overflow: 'auto', padding: 20 }}>
        {loading && (
          <div style={{ padding: 20, color: '#000', fontSize: 14 }}>
            <div style={{ marginBottom: 8 }}>⏳ PDFをレンダリング中...</div>
          </div>
        )}
        {error && (
          <div style={{ margin: 20, padding: 16, border: '2px solid #ff6b6b', borderRadius: 4, background: '#fff', color: '#ff6b6b' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>エラー</div>
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div style={{ position: 'relative', display: 'inline-block', cursor: selectedIndex !== null ? 'crosshair' : 'default' }}>
            {selectedIndex !== null && (
              <div style={{ position: 'fixed', top: 20, right: 20, background: '#00bfa5', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 'bold', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                {mappings[selectedIndex].number}. {mappings[selectedIndex].label}
              </div>
            )}
            
            <div style={{ position: 'relative', transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <canvas
                ref={canvasRef}
                style={{ display: 'block', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              />
              
              {/* ドラッグ中の範囲 */}
              {dragStart && currentDrag && (
                <div style={{
                  position: 'absolute',
                  left: Math.min(dragStart.x, currentDrag.x),
                  top: Math.min(dragStart.y, currentDrag.y),
                  width: Math.abs(currentDrag.x - dragStart.x),
                  height: Math.abs(currentDrag.y - dragStart.y),
                  border: '2px dashed #00bfa5',
                  background: 'rgba(0, 191, 165, 0.1)',
                  pointerEvents: 'none'
                }} />
              )}
              
              {/* 確定した範囲 */}
              {mappings.map((m, i) => m.area ? (
                <div key={i} style={{
                  position: 'absolute',
                  left: m.area.x1,
                  top: m.area.y1,
                  width: m.area.x2 - m.area.x1,
                  height: m.area.y2 - m.area.y1,
                  border: '2px solid #4caf50',
                  background: 'rgba(76, 175, 80, 0.1)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ 
                    background: '#4caf50', 
                    color: '#fff', 
                    padding: '4px 8px', 
                    borderRadius: 4, 
                    fontSize: 12, 
                    fontWeight: 'bold' 
                  }}>{m.number}</div>
                </div>
              ) : null)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
