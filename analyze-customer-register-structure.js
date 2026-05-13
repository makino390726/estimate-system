const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const inputPath = process.argv[2]
const outputPath = process.argv[3] || 'customer-register-analysis.json'

if (!inputPath) {
    console.error('Usage: node analyze-customer-register-structure.js <excel-file-path> [output-json-path]')
    process.exit(1)
}

if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`)
    process.exit(1)
}

const normalizeHeader = (value) =>
    String(value || '')
        .replace(/[\s　]/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase()

const headerCandidates = [
    '出荷日',
    '型式',
    '本体番号',
    'バーナ番号',
    '伝票番号',
    '販売店名',
    '購入年月日',
]

const normalizedCandidates = headerCandidates.map(normalizeHeader)

const detectHeaderRow = (rows) => {
    const scanLimit = Math.min(rows.length, 30)
    for (let i = 0; i < scanLimit; i += 1) {
        const row = rows[i] || []
        const normalized = row.map(normalizeHeader)
        const hitCount = normalizedCandidates.filter((token) => normalized.includes(token)).length
        if (hitCount >= 3) {
            return i
        }
    }
    return -1
}

const inferSheetType = (sheetName) => {
    const compact = String(sheetName || '').replace(/\s/g, '')
    if (compact.includes('暖房機')) return 'heating'
    if (compact.includes('光合成促進装置')) return 'co2_device'
    if (compact.includes('食品乾燥機')) return 'food_dryer'
    if (compact.includes('ノンメタ乾燥機')) return 'non_metal_dryer'
    if (compact.includes('葉草乾燥機')) return 'leaf_dryer'
    if (compact.includes('干し芋乾燥機')) return 'sweetpotato_dryer'
    return 'unknown'
}

const workbook = XLSX.readFile(inputPath, { cellDates: false, raw: true })
const sheetSummaries = []
const headerSets = []

for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const headerRowIndex = detectHeaderRow(matrix)

    if (headerRowIndex < 0) {
        sheetSummaries.push({
            sheetName,
            sheetType: inferSheetType(sheetName),
            headerDetected: false,
            headerRow: null,
            headers: [],
            rowCount: 0,
        })
        continue
    }

    const headers = (matrix[headerRowIndex] || [])
        .map((h) => String(h || '').trim())
        .filter((h) => h !== '')

    const dataRows = XLSX.utils.sheet_to_json(sheet, {
        range: headerRowIndex,
        defval: '',
    })

    const nonEmptyDataRowCount = dataRows.filter((row) => {
        return Object.values(row).some((v) => String(v || '').trim() !== '')
    }).length

    const normalizedHeaderSet = [...new Set(headers.map(normalizeHeader).filter(Boolean))]
    headerSets.push(new Set(normalizedHeaderSet))

    sheetSummaries.push({
        sheetName,
        sheetType: inferSheetType(sheetName),
        headerDetected: true,
        headerRow: headerRowIndex + 1,
        headers,
        normalizedHeaders: normalizedHeaderSet,
        rowCount: nonEmptyDataRowCount,
    })
}

const headerUnion = new Set()
for (const set of headerSets) {
    for (const h of set) headerUnion.add(h)
}

let headerIntersection = new Set(headerSets[0] || [])
for (let i = 1; i < headerSets.length; i += 1) {
    const next = new Set()
    for (const h of headerIntersection) {
        if (headerSets[i].has(h)) next.add(h)
    }
    headerIntersection = next
}

const report = {
    sourceFile: path.resolve(inputPath),
    analyzedAt: new Date().toISOString(),
    sheetCount: workbook.SheetNames.length,
    headers: {
        union: [...headerUnion].sort(),
        intersection: [...headerIntersection].sort(),
        optional: [...headerUnion].filter((h) => !headerIntersection.has(h)).sort(),
    },
    suggestedTableStrategy: {
        summary: '共通列を固定カラム化し、シート依存列は JSONB へ格納',
        fixedColumns: [
            'sheet_name',
            'sheet_type',
            'shipment_date',
            'customer_name',
            'address',
            'phone',
            'mobile',
            'staff_name',
            'model',
            'model_no',
            'outlet_type',
            'model_full',
            'serial_no',
            'burner_no',
            'slip_no',
            'purchase_ymd',
            'dealer_name',
            'raw_data',
        ],
        transformRules: [
            {
                condition: "sheet_type = 'heating'",
                target: 'model_full',
                expression: "concat_ws('-', model, outlet_type)",
                example: 'SK-400L + DF => SK-400L-DF',
            },
            {
                condition: "sheet_type <> 'heating'",
                target: 'model_full',
                expression: 'coalesce(model, model_no)',
                example: '型式または型式番号をそのまま使用',
            },
        ],
    },
    sheets: sheetSummaries,
}

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
console.log(`Analysis completed: ${path.resolve(outputPath)}`)
