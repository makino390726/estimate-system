'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    type WarrantyFieldType,
    type WarrantyFieldMapping,
    type WarrantySavedMapping,
    WARRANTY_MAPPING_STORAGE_KEY,
    saveWarrantyMappingToStorage,
} from '@/lib/warrantyMappingStorage'

export type { WarrantyFieldType, WarrantyFieldMapping, WarrantySavedMapping }
export { WARRANTY_MAPPING_STORAGE_KEY, saveWarrantyMappingToStorage }

const MAPPING_ITEMS: { fieldType: WarrantyFieldType; label: string }[] = [
    { fieldType: 'customer_name', label: 'お客様名' },
    { fieldType: 'postal_code', label: '郵便番号' },
    { fieldType: 'address', label: '住所' },
    { fieldType: 'phone', label: '電話番号（固定）' },
    { fieldType: 'mobile', label: '携帯電話' },
    { fieldType: 'product_name', label: '製品名' },
    { fieldType: 'model_no_full', label: '型式番号' },
    { fieldType: 'manufacturing_no', label: '製造番号' },
    { fieldType: 'slip_no', label: '伝票番号' },
    { fieldType: 'purchase_date', label: '購入年月日' },
    { fieldType: 'dealer_name', label: '販売店名' },
    { fieldType: 'staff_name', label: '担当者名' },
]

type WarrantyPdfMapperProps = {
    file: File
    onSave: (mappings: WarrantyFieldMapping[]) => void
    onCancel: () => void
    initialMappings?: WarrantyFieldMapping[]
}

export default function WarrantyPdfMapper({
    file,
    onSave,
    onCancel,
    initialMappings,
}: WarrantyPdfMapperProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [zoom, setZoom] = useState<number>(1)
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

    const [mappings, setMappings] = useState<WarrantyFieldMapping[]>(() => {
        if (initialMappings && initialMappings.length === MAPPING_ITEMS.length) {
            return initialMappings
        }
        return MAPPING_ITEMS.map((item, index) => ({
            fieldType: item.fieldType,
            label: item.label,
            area: null,
            number: index + 1,
        }))
    })

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
    const [currentDrag, setCurrentDrag] = useState<{ x: number; y: number } | null>(null)

    const overlayRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const renderPdfAsImage = async () => {
            setLoading(true)
            setError(null)
            setImageUrl(null)
            setImageSize(null)
            try {
                const fd = new FormData()
                fd.append('file', file)
                fd.append('pageIndex', '0')

                const res = await fetch('/api/convert-pdf-to-image', {
                    method: 'POST',
                    body: fd,
                })
                const json = await res.json()

                if (!json.ok || !json.imageUrl) {
                    throw new Error(json.message || 'PDFの画像変換に失敗しました')
                }

                setImageUrl(String(json.imageUrl))
            } catch (e: any) {
                setError(e?.message || 'PDFの画像変換に失敗しました')
            } finally {
                setLoading(false)
            }
        }

        renderPdfAsImage()
    }, [file])

    const completedCount = useMemo(() => mappings.filter((m) => m.area !== null).length, [mappings])

    const toNormalized = (clientX: number, clientY: number) => {
        const overlay = overlayRef.current
        const size = imageSize
        if (!overlay || !size) return { x: 0, y: 0 }

        const rect = overlay.getBoundingClientRect()
        const x = (clientX - rect.left) / zoom / size.width
        const y = (clientY - rect.top) / zoom / size.height

        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
        }
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (selectedIndex === null || !imageSize) return
        const norm = toNormalized(e.clientX, e.clientY)
        setDragStart(norm)
        setCurrentDrag(norm)
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!dragStart || !imageSize) return
        setCurrentDrag(toNormalized(e.clientX, e.clientY))
    }

    const handleMouseUp = () => {
        if (selectedIndex === null || !dragStart || !currentDrag) return

        const x1 = Math.min(dragStart.x, currentDrag.x)
        const y1 = Math.min(dragStart.y, currentDrag.y)
        const x2 = Math.max(dragStart.x, currentDrag.x)
        const y2 = Math.max(dragStart.y, currentDrag.y)

        if (x2 - x1 < 0.002 || y2 - y1 < 0.002) {
            setDragStart(null)
            setCurrentDrag(null)
            return
        }

        setMappings((prev) =>
            prev.map((m, i) => (i === selectedIndex ? { ...m, area: { x1, y1, x2, y2 } } : m))
        )

        setDragStart(null)
        setCurrentDrag(null)

        if (selectedIndex < mappings.length - 1) {
            setSelectedIndex(selectedIndex + 1)
        } else {
            setSelectedIndex(null)
        }
    }

    const toPx = (norm: { x1: number; y1: number; x2: number; y2: number }, w: number, h: number) => ({
        left: norm.x1 * w,
        top: norm.y1 * h,
        width: (norm.x2 - norm.x1) * w,
        height: (norm.y2 - norm.y1) * h,
    })

    const handleSave = () => {
        saveWarrantyMappingToStorage(mappings)
        onSave(mappings)
    }

    const handleReset = () => {
        setMappings((prev) => prev.map((m) => ({ ...m, area: null })))
        setSelectedIndex(null)
    }

    return (
        <div
            style={{
                display: 'flex',
                height: 'calc(100vh - 160px)',
                maxHeight: '860px',
                background: '#0f172a',
                border: '2px solid #334155',
                borderRadius: 8,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    width: 290,
                    background: '#1e293b',
                    padding: 14,
                    overflowY: 'auto',
                    borderRight: '1px solid #334155',
                    flexShrink: 0,
                }}
            >
                <h2 style={{ marginTop: 0, fontSize: 14, marginBottom: 4, color: '#c4b5fd' }}>
                    📍 保証書フィールドマッピング設定
                </h2>
                <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
                    左の項目名をクリックして選択 → 画像上をドラッグして範囲を指定します。
                    <br />
                    設定を保存すると次回から自動適用されます。
                </p>

                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>表示倍率</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                        {[0.5, 0.75, 1, 1.25].map((z) => (
                            <button
                                key={z}
                                onClick={() => setZoom(z)}
                                style={{
                                    padding: '4px 0',
                                    background: zoom === z ? '#7c3aed' : '#334155',
                                    color: zoom === z ? '#fff' : '#94a3b8',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 10,
                                }}
                            >
                                {Math.round(z * 100)}%
                            </button>
                        ))}
                    </div>
                </div>

                <div
                    style={{
                        marginBottom: 10,
                        padding: '6px 10px',
                        background: '#0f172a',
                        borderRadius: 6,
                        fontSize: 12,
                        color: completedCount > 0 ? '#86efac' : '#64748b',
                    }}
                >
                    {completedCount} / {MAPPING_ITEMS.length} 件設定済み
                </div>

                <div style={{ marginBottom: 12 }}>
                    {mappings.map((item, i) => (
                        <div
                            key={item.fieldType}
                            onClick={() => setSelectedIndex(i)}
                            style={{
                                padding: '7px 10px',
                                marginBottom: 3,
                                border: `2px solid ${selectedIndex === i ? '#7c3aed' : item.area ? '#16a34a' : '#334155'}`,
                                background: selectedIndex === i ? '#2e1065' : item.area ? '#052e16' : '#0f172a',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <div
                                style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    background: item.area ? '#16a34a' : selectedIndex === i ? '#7c3aed' : '#475569',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    fontWeight: 'bold',
                                    flexShrink: 0,
                                }}
                            >
                                {item.number}
                            </div>
                            <div style={{ fontSize: 12, color: item.area ? '#86efac' : '#cbd5e1', flexGrow: 1 }}>
                                {item.label}
                            </div>
                            {item.area && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMappings((prev) => prev.map((m, idx) => (idx === i ? { ...m, area: null } : m)))
                                    }}
                                    style={{
                                        padding: '2px 6px',
                                        fontSize: 10,
                                        background: '#7f1d1d',
                                        color: '#fca5a5',
                                        border: '1px solid #991b1b',
                                        borderRadius: 3,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                        onClick={handleSave}
                        disabled={completedCount === 0}
                        style={{
                            padding: '10px 0',
                            background: completedCount > 0 ? '#7c3aed' : '#334155',
                            color: completedCount > 0 ? '#fff' : '#64748b',
                            border: 'none',
                            borderRadius: 6,
                            cursor: completedCount > 0 ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold',
                            fontSize: 13,
                        }}
                    >
                        保存して使用 ({completedCount}/{MAPPING_ITEMS.length})
                    </button>
                    <button
                        onClick={handleReset}
                        style={{
                            padding: '8px 0',
                            background: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        すべてリセット
                    </button>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 0',
                            background: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        キャンセル
                    </button>
                </div>
            </div>

            <div
                style={{
                    flex: 1,
                    position: 'relative',
                    background: '#334155',
                    overflow: 'auto',
                    padding: 16,
                }}
            >
                {selectedIndex !== null && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 16,
                            right: 16,
                            background: '#7c3aed',
                            color: '#fff',
                            padding: '10px 18px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 'bold',
                            zIndex: 200,
                            pointerEvents: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        }}
                    >
                        {mappings[selectedIndex].number}. {mappings[selectedIndex].label} の範囲をドラッグ
                    </div>
                )}

                {loading && <div style={{ padding: 20, color: '#e2e8f0', fontSize: 14 }}>⏳ PDFを画像変換中...</div>}

                {error && (
                    <div
                        style={{
                            margin: 20,
                            padding: 16,
                            border: '2px solid #ff6b6b',
                            borderRadius: 4,
                            background: '#1e293b',
                            color: '#ff6b6b',
                        }}
                    >
                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>エラー</div>
                        <div>{error}</div>
                    </div>
                )}

                {!loading && !error && imageUrl && imageSize && (
                    <div style={{ position: 'relative', display: 'inline-block', cursor: selectedIndex !== null ? 'crosshair' : 'default' }}>
                        <div style={{ position: 'relative', transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                            <img
                                src={imageUrl}
                                alt="保証書PDFプレビュー"
                                onLoad={(e) => {
                                    const target = e.currentTarget
                                    setImageSize({ width: target.naturalWidth, height: target.naturalHeight })
                                }}
                                style={{
                                    display: 'block',
                                    width: imageSize.width,
                                    height: imageSize.height,
                                    background: '#fff',
                                    border: '1px solid #475569',
                                    borderRadius: 4,
                                    userSelect: 'none',
                                    pointerEvents: 'none',
                                }}
                            />

                            <div
                                ref={overlayRef}
                                style={{ position: 'absolute', left: 0, top: 0, width: imageSize.width, height: imageSize.height }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                            />

                            {dragStart && currentDrag && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: Math.min(dragStart.x, currentDrag.x) * imageSize.width,
                                        top: Math.min(dragStart.y, currentDrag.y) * imageSize.height,
                                        width: Math.abs(currentDrag.x - dragStart.x) * imageSize.width,
                                        height: Math.abs(currentDrag.y - dragStart.y) * imageSize.height,
                                        border: '2px dashed #a78bfa',
                                        background: 'rgba(124, 58, 237, 0.15)',
                                        pointerEvents: 'none',
                                    }}
                                />
                            )}

                            {mappings.map((m, i) => {
                                if (!m.area) return null
                                const px = toPx(m.area, imageSize.width, imageSize.height)
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            position: 'absolute',
                                            left: px.left,
                                            top: px.top,
                                            width: px.width,
                                            height: px.height,
                                            border: '2px solid #22c55e',
                                            background: 'rgba(34, 197, 94, 0.12)',
                                            pointerEvents: 'none',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'flex-start',
                                        }}
                                    >
                                        <div style={{ background: '#16a34a', color: '#fff', padding: '1px 5px', fontSize: 10, fontWeight: 'bold', lineHeight: 1.4 }}>
                                            {m.number}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {!loading && !error && imageUrl && !imageSize && (
                    <img
                        src={imageUrl}
                        alt="保証書PDFプレビュー"
                        onLoad={(e) => {
                            const target = e.currentTarget
                            setImageSize({ width: target.naturalWidth, height: target.naturalHeight })
                        }}
                        style={{ display: 'none' }}
                    />
                )}
            </div>
        </div>
    )
}
