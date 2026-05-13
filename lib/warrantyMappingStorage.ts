// 保証書PDFマッピング設定の型定義とlocalStorageユーティリティ
// pdfjs-dist に依存しないため、サーバー側でもインポート可能

export type WarrantyFieldType =
    | 'customer_name'
    | 'postal_code'
    | 'address'
    | 'phone'
    | 'mobile'
    | 'product_name'
    | 'model_no_full'
    | 'manufacturing_no'
    | 'slip_no'
    | 'purchase_date'
    | 'dealer_name'
    | 'staff_name'

export type WarrantyFieldMapping = {
    fieldType: WarrantyFieldType
    label: string
    /** 正規化座標 (0-1): キャンバスサイズに対する相対位置 */
    area: { x1: number; y1: number; x2: number; y2: number } | null
    number: number
}

export type WarrantySavedMapping = {
    mappings: WarrantyFieldMapping[]
    savedAt: string
}

export const WARRANTY_MAPPING_STORAGE_KEY = 'warranty_pdf_field_mapping_v1'

export function loadWarrantyMapping(): WarrantySavedMapping | null {
    try {
        if (typeof window === 'undefined') return null
        const saved = localStorage.getItem(WARRANTY_MAPPING_STORAGE_KEY)
        if (!saved) return null
        return JSON.parse(saved) as WarrantySavedMapping
    } catch {
        return null
    }
}

export function saveWarrantyMappingToStorage(mappings: WarrantyFieldMapping[]): void {
    const config: WarrantySavedMapping = {
        mappings,
        savedAt: new Date().toISOString(),
    }
    localStorage.setItem(WARRANTY_MAPPING_STORAGE_KEY, JSON.stringify(config))
}
