'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Circle, Text } from 'react-konva'

type PinMapping = {
  type: 'customerName' | 'subject' | 'estimateDate' | 'estimateNo' | 
        'productNameCol' | 'specCol' | 'qtyCol' | 'unitPriceCol' | 'amountCol' | 'wholesalePriceCol'
  label: string
  position: { x: number; y: number } | null
  number: number
}

type DragSelectMapperProps = {
  imageUrl: string
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

export default function DragSelectMapper({ imageUrl, onMappingComplete, onCancel }: DragSelectMapperProps) {
  const [mappings, setMappings] = useState<PinMapping[]>(
    MAPPING_ITEMS.map((item, index) => ({
      type: item.type,
      label: item.label,
      position: null,
      number: index + 1
    }))
  )
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  
  const [stageSize, setStageSize] = useState({ width: 1200, height: 800 })

  useEffect(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      setStageSize({ width: Math.max(width - 40, 1200), height: 800 })
    }
  }, [])

  // スクロール同期
  const handleRightPanelScroll = () => {
    if (rightPanelRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = rightPanelRef.current.scrollLeft
    }
  }

  const handleTopScrollChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (rightPanelRef.current) {
      rightPanelRef.current.scrollLeft = Number(e.target.value)
    }
  }

  const handleStageClick = (e: any) => {
    if (selectedIndex === null) return
    
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()
    
    setMappings(prev => prev.map((m, i) => 
      i === selectedIndex ? { ...m, position: { x: pos.x, y: pos.y } } : m
    ))
    
    if (selectedIndex < mappings.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    } else {
      setSelectedIndex(null)
    }
  }

  const handleComplete = () => {
    const completedMappings = mappings.filter(m => m.position !== null)
    onMappingComplete(completedMappings)
  }

  const handleReset = () => {
    setMappings(prev => prev.map(m => ({ ...m, position: null })))
    setSelectedIndex(null)
  }

  const deletePin = (index: number) => {
    setMappings(prev => prev.map((m, i) => 
      i === index ? { ...m, position: null } : m
    ))
  }

  const completedCount = mappings.filter(m => m.position !== null).length
  console.log('[DragSelectMapper] Rendering, mappings:', mappings.length, 'selected:', selectedIndex)
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', maxHeight: '800px', background: '#fff', border: '2px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
      {/* 左側：マッピング項目リスト */}
      <div style={{ width: 380, background: '#fff', padding: 16, boxShadow: '2px 0 8px rgba(0,0,0,0.1)', overflowY: 'auto', borderRight: '1px solid #eee' }}>
        <h2 style={{ marginTop: 0, fontSize: 16, marginBottom: 8, color: '#000' }}>📍 セットする項目</h2>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 16, lineHeight: 1.5 }}>
          書類の情報を学習させることで、読み込み精度が高まります。
        </p>
        
        {/* ズームコントロール */}
        <div style={{ marginBottom: 16, padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8, margin: '0 0 8px 0' }}>画像サイズ:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              onClick={() => setZoom(0.75)}
              style={{
                padding: '6px',
                background: zoom === 0.75 ? '#00bfa5' : '#f0f0f0',
                color: zoom === 0.75 ? 'white' : '#666',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: zoom === 0.75 ? 'bold' : 'normal'
              }}
            >
              75%
            </button>
            <button
              onClick={() => setZoom(1)}
              style={{
                padding: '6px',
                background: zoom === 1 ? '#00bfa5' : '#f0f0f0',
                color: zoom === 1 ? 'white' : '#666',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: zoom === 1 ? 'bold' : 'normal'
              }}
            >
              100%
            </button>
            <button
              onClick={() => setZoom(1.25)}
              style={{
                padding: '6px',
                background: zoom === 1.25 ? '#00bfa5' : '#f0f0f0',
                color: zoom === 1.25 ? 'white' : '#666',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: zoom === 1.25 ? 'bold' : 'normal'
              }}
            >
              125%
            </button>
            <button
              onClick={() => setZoom(1.5)}
              style={{
                padding: '6px',
                background: zoom === 1.5 ? '#00bfa5' : '#f0f0f0',
                color: zoom === 1.5 ? 'white' : '#666',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: zoom === 1.5 ? 'bold' : 'normal'
              }}
            >
              150%
            </button>
          </div>
        </div>
        
        {/* マッピング項目 */}
        <div style={{ marginBottom: 16 }}>
          {mappings.map((item, index) => (
            <div
              key={item.type}
              onClick={() => setSelectedIndex(index)}
              style={{
                padding: '12px',
                marginBottom: 8,
                border: `2px solid ${selectedIndex === index ? '#00bfa5' : item.position ? '#4caf50' : '#ddd'}`,
                background: selectedIndex === index ? '#e0f7f4' : item.position ? '#f1f8f4' : 'white',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.2s'
              }}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: item.position ? '#4caf50' : selectedIndex === index ? '#00bfa5' : '#ddd',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 'bold',
                flexShrink: 0
              }}>
                {item.number}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#000', fontWeight: '500' }}>
                  {item.label}
                </div>
              </div>
              {item.position && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deletePin(index)
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#fee',
                    color: '#c00',
                    border: '1px solid #fcc',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        
        {/* 統計 */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#000', margin: '0 0 12px 0' }}>
            セット済み: <strong style={{ color: '#00bfa5' }}>{completedCount}/{mappings.length}</strong>
          </p>
        </div>
        
        {/* ボタン */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleComplete}
            disabled={completedCount === 0}
            style={{
              padding: '10px',
              background: completedCount > 0 ? '#00bfa5' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: completedCount > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: 13
            }}
          >
            セット ({completedCount})
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
            リセット
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
            キャンセル
          </button>
        </div>
      </div>
      
      {/* 右側：Excel画像（大きく表示） */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
        {/* 上部スクロールバー */}
        <div ref={topScrollRef} style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          height: '20px',
          background: '#f5f5f5',
          borderBottom: '2px solid #ddd'
        }}>
          <div style={{ minWidth: '100%', height: '20px' }} />
        </div>
        
        {/* メイン画像表示エリア */}
        <div 
          ref={rightPanelRef}
          onScroll={handleRightPanelScroll}
          style={{ flex: 1, padding: 0, overflowY: 'auto', overflowX: 'auto', position: 'relative', background: '#f9f9f9' }}
        >
          <div style={{ 
            background: 'white', 
            position: 'relative',
            cursor: selectedIndex !== null ? 'crosshair' : 'default',
            minHeight: '100vh',
            padding: '20px'
          }}>
            {selectedIndex !== null && (
              <div style={{
                position: 'fixed',
                top: 20,
                right: 20,
                background: '#00bfa5',
                color: 'white',
                padding: '12px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 'bold',
                zIndex: 100,
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                {mappings[selectedIndex].number}. {mappings[selectedIndex].label}
              </div>
            )}
          
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative', display: 'inline-block' }}>
            <img
              src={imageUrl}
              alt="Excel Preview"
              style={{
                maxWidth: 'none',
                height: 'auto',
                display: 'block',
                pointerEvents: 'none',
                background: 'white',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              onLoad={(e) => {
                const img = e.currentTarget
                setStageSize({ width: img.naturalWidth, height: img.naturalHeight })
              }}
            />
            
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              onClick={handleStageClick}
              style={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}
            >
              <Layer>
                {mappings.map((m, i) => 
                  m.position ? (
                    <React.Fragment key={i}>
                      <Circle
                        x={m.position.x}
                        y={m.position.y}
                        radius={24}
                        fill="#4caf50"
                        stroke="#fff"
                        strokeWidth={3}
                        shadowColor="black"
                        shadowBlur={8}
                        shadowOpacity={0.4}
                      />
                      <Text
                        x={m.position.x - 24}
                        y={m.position.y - 12}
                        width={48}
                        height={24}
                        text={m.number.toString()}
                        fontSize={18}
                        fontStyle="bold"
                        fill="white"
                        align="center"
                        verticalAlign="middle"
                      />
                    </React.Fragment>
                  ) : null
                )}
              </Layer>
            </Stage>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
