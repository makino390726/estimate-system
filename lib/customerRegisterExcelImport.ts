import * as XLSX from 'xlsx'
import { getSheetTypeLabel, type SheetTypeValue } from '@/lib/customerRegisterSheetTypes'

/** 顧客リスト Excel の列名エイリアス（機種共通） */
export const CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES = {
    shipment_date: ['出荷日'],
    model: ['型式', '型式番号'],
    outlet_type: ['吹出口'],
    serial_no: ['本体番号', '本体'],
    manufacturing_no: ['製造番号'],
    burner_no: ['バーナ番号', 'バーナ'],
    co2_sensor: ['ＣＯ２センサー', 'CO2センサー', 'co2センサー', '二氧化碳センサー'],
    slip_no: ['伝票番号'],
    purchase_ymd: ['購入年月日', '購入日'],
    dealer_name: ['販売店名', '販売店'],
    staff_name: ['担当者', '担当'],
    customer_name: ['お客様氏名', '氏名', '顧客名', 'お客様名'],
    address: ['住所', '住　　所', '住  所'],
    phone: ['固定電話', '電話', 'TEL'],
    mobile: ['携帯電話', '携帯', 'MOBILE'],
    notes: ['備考', 'メモ', '特記', '備考(ﾊﾞｰﾅﾅﾝﾊﾞｰ等)'],
} as const

export type ParsedCustomerRegisterRow = {
    upsert_key: string
    source_row_no: number
    sheet_name: string
    sheet_type: SheetTypeValue
    payload: {
        sheet_name: string
        sheet_type: string
        source_row_no: number
        shipment_date: string | null
        customer_name: string | null
        address: string | null
        phone: string | null
        mobile: string | null
        staff_name: string | null
        slip_no: string | null
        purchase_ymd: string | null
        dealer_name: string | null
        model: string | null
        model_no: string | null
        serial_no: string | null
        manufacturing_no: string | null
        burner_no: string | null
        outlet_type: string | null
        raw_data: Record<string, string>
    }
}

export type ParseCustomerRegisterWorkbookResult = {
    sheet_name: string
    sheet_type: SheetTypeValue
    header_row_index: number
    rows: ParsedCustomerRegisterRow[]
    skipped: { source_row_no: number; reason: string }[]
}

const HEADER_PROBE = [
    '出荷日',
    'お客様氏名',
    '伝票番号',
    '販売店名',
    '本体番号',
    '本体',
    '製造番号',
    '型式',
    '型式番号',
    'バーナ',
]

export function normalizeCustomerRegisterHeader(value: unknown): string {
    return String(value || '')
        .replace(/[\s　]/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase()
}

/** 製造番号・本体番号の照合用正規化 */
export function normalizeCustomerRegisterId(value: unknown): string {
    return String(value ?? '')
        .trim()
        .replace(/[\s　\-ー－]/g, '')
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

export function inferCustomerRegisterSheetType(text: string): SheetTypeValue {
    const compact = String(text || '').replace(/\s/g, '')
    if (compact.includes('暖房機') || compact.includes('ハウス暖房')) return 'heating'
    if (compact.includes('光合成促進装置') || compact.includes('光合成')) return 'co2_device'
    if (compact.includes('食品乾燥機')) return 'food_dryer'
    if (compact.includes('ソーメン乾燥機')) return 'soumen_dryer'
    if (compact.includes('薬草乾燥機')) return 'leaf_dryer'
    if (compact.includes('干し芋乾燥機')) return 'sweetpotato_dryer'
    if (compact.includes('たばこ乾燥機')) return 'tobacco_dryer'
    if (compact.includes('冷熱機器') || compact.includes('冷蔵')) return 'cooling_equipment'
    return 'unknown'
}

export function normalizeCustomerRegisterDate(value: unknown): string | null {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value) && value > 1000) {
        const utc = Math.round((value - 25569) * 86400 * 1000)
        const date = new Date(utc)
        if (Number.isNaN(date.getTime())) return null
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }
    const text = String(value).trim()
    if (!text) return null
    const slash = text.match(/^(\d{2,4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/)
    if (slash) {
        let year = Number(slash[1])
        const month = Number(slash[2])
        const day = Number(slash[3])
        if (year < 100) year += 2000
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().split('T')[0]
}

/** 購入年月日など文字列保持列（日付らしければ yyyy-mm-dd に整形） */
export function normalizeCustomerRegisterYmdText(value: unknown): string | null {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value) && value > 1000) {
        return normalizeCustomerRegisterDate(value)
    }
    const text = String(value).trim()
    return text || null
}

function detectHeaderRow(rows: unknown[][]): number {
    const normalizedCandidates = HEADER_PROBE.map(normalizeCustomerRegisterHeader)
    const scanLimit = Math.min(rows.length, 40)
    for (let i = 0; i < scanLimit; i += 1) {
        const normalized = (rows[i] || []).map(normalizeCustomerRegisterHeader)
        const hitCount = normalizedCandidates.filter((token) => normalized.includes(token)).length
        if (hitCount >= 2) return i
    }
    return -1
}

function inferSheetTypeFromWorkbook(
    sheetName: string,
    matrix: unknown[][],
    headerRowIndex: number,
): SheetTypeValue {
    const fromName = inferCustomerRegisterSheetType(sheetName)
    if (fromName !== 'unknown') return fromName

    for (let i = 0; i < Math.min(headerRowIndex, 5); i += 1) {
        for (const cell of matrix[i] || []) {
            const t = inferCustomerRegisterSheetType(String(cell || ''))
            if (t !== 'unknown') return t
        }
    }
    return 'unknown'
}

function pickByNormalizedHeader(record: Record<string, unknown>, aliases: readonly string[]): unknown {
    const normalizedAliases = aliases.map(normalizeCustomerRegisterHeader)
    for (const [key, value] of Object.entries(record)) {
        if (normalizedAliases.includes(normalizeCustomerRegisterHeader(key)) && String(value ?? '').trim() !== '') {
            return value
        }
    }
    return ''
}

function toNullableText(value: unknown): string | null {
    const v = String(value ?? '').trim()
    return v ? v : null
}

function buildRowPayload(
    record: Record<string, unknown>,
    ctx: { sheetName: string; sheetType: SheetTypeValue; sourceRowNo: number },
): ParsedCustomerRegisterRow | { skip: string } {
    const serialRaw = pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.serial_no)
    const mfgRaw = pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.manufacturing_no)
    const serialNo = normalizeCustomerRegisterId(serialRaw)
    const manufacturingNo = normalizeCustomerRegisterId(mfgRaw) || serialNo

    if (!manufacturingNo) {
        return { skip: '製造番号（または本体・本体番号）が空のためスキップ' }
    }

    const notes = toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.notes))
    const co2Sensor = toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.co2_sensor))
    const rawData: Record<string, string> = {}
    if (notes) rawData.notes = notes
    if (co2Sensor) rawData.co2_sensor = co2Sensor

    const sheetLabel = getSheetTypeLabel(ctx.sheetType)
    const modelText = toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.model))
    const outletType = toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.outlet_type))

    return {
        upsert_key: manufacturingNo,
        source_row_no: ctx.sourceRowNo,
        sheet_name: ctx.sheetName,
        sheet_type: ctx.sheetType,
        payload: {
            sheet_name: ctx.sheetName || sheetLabel,
            sheet_type: ctx.sheetType,
            source_row_no: ctx.sourceRowNo,
            shipment_date: normalizeCustomerRegisterDate(
                pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.shipment_date),
            ),
            customer_name: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.customer_name)),
            address: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.address)),
            phone: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.phone)),
            mobile: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.mobile)),
            staff_name: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.staff_name)),
            slip_no: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.slip_no)),
            purchase_ymd: normalizeCustomerRegisterYmdText(
                pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.purchase_ymd),
            ),
            dealer_name: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.dealer_name)),
            model: modelText,
            model_no: ctx.sheetType === 'heating' ? null : modelText,
            serial_no: serialNo || null,
            manufacturing_no: manufacturingNo,
            burner_no: toNullableText(pickByNormalizedHeader(record, CUSTOMER_REGISTER_EXCEL_COLUMN_ALIASES.burner_no)),
            outlet_type: outletType,
            raw_data: rawData,
        },
    }
}

function isEmptyDataRow(record: Record<string, unknown>): boolean {
    return Object.values(record).every((v) => String(v ?? '').trim() === '')
}

export function parseCustomerRegisterSheet(
    sheetName: string,
    matrix: unknown[][],
    sheetTypeOverride?: SheetTypeValue,
): ParseCustomerRegisterWorkbookResult {
    const headerRowIndex = detectHeaderRow(matrix)
    if (headerRowIndex < 0) {
        throw new Error(`シート「${sheetName}」でヘッダー行が見つかりません（出荷日・氏名・本体番号等の列名を確認してください）`)
    }

    const sheetType =
        sheetTypeOverride && sheetTypeOverride !== 'unknown'
            ? sheetTypeOverride
            : inferSheetTypeFromWorkbook(sheetName, matrix, headerRowIndex)

    const headerRow = (matrix[headerRowIndex] || []).map((c) => String(c ?? '').trim())
    const rows: ParsedCustomerRegisterRow[] = []
    const skipped: { source_row_no: number; reason: string }[] = []

    for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
        const excelRowNo = i + 1
        const line = matrix[i] || []
        const record: Record<string, unknown> = {}
        for (let col = 0; col < headerRow.length; col += 1) {
            const key = headerRow[col]
            if (!key) continue
            record[key] = line[col] ?? ''
        }
        if (isEmptyDataRow(record)) continue

        const built = buildRowPayload(record, {
            sheetName: sheetName.trim() || getSheetTypeLabel(sheetType),
            sheetType,
            sourceRowNo: excelRowNo,
        })
        if ('skip' in built) {
            skipped.push({ source_row_no: excelRowNo, reason: built.skip })
            continue
        }
        rows.push(built)
    }

    return {
        sheet_name: sheetName,
        sheet_type: sheetType,
        header_row_index: headerRowIndex,
        rows,
        skipped,
    }
}

/** ワークブック全体を解析（複数シートは先頭のデータシート、または sheetType 指定シート） */
export function parseCustomerRegisterWorkbook(
    buffer: ArrayBuffer,
    fileName?: string,
    options?: { sheetTypeOverride?: SheetTypeValue; sheetIndex?: number },
): ParseCustomerRegisterWorkbookResult {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true })
    if (!workbook.SheetNames.length) {
        throw new Error('Excel にシートがありません')
    }

    const sheetIndex = options?.sheetIndex ?? 0
    const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`シート「${sheetName}」を読み込めません`)

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
    const parsed = parseCustomerRegisterSheet(sheetName, matrix, options?.sheetTypeOverride)

    if (parsed.rows.length === 0 && fileName) {
        const hint = inferCustomerRegisterSheetType(fileName)
        if (hint !== 'unknown' && hint !== parsed.sheet_type) {
            return parseCustomerRegisterSheet(sheetName, matrix, hint)
        }
    }

    return parsed
}

export function chunkArray<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}
