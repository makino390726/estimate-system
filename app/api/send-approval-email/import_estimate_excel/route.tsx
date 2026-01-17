import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { 
  type ExcelFormatPreset, 
  getPresetById, 
  detectPreset, 
  DEFAULT_PRESET 
} from '@/lib/excelFormatPresets'

export const runtime = 'nodejs'

// ================================
// Excel（縦見積書）セル位置（添付に合わせ）
// ================================
const CELL = {
  customerName: 'D8',
  subject: 'C21',  // ★修正: C21に件名がある
  deliveryPlace: 'C23',  // ★修正: C23に受渡場所
  deliveryDeadline: 'C25',  // ★修正: C25に受渡期限
  deliveryTerms: 'C27',  // ★修正: C27に受渡条件
  validityText: 'C29',  // ★修正: C29に本書有効期限
  paymentTerms: 'C31',  // ★修正: 支払条件も対応（例）
  subtotal: 'AJ78',
  taxAmount: 'AJ80',
  totalAmount: 'AJ82'
} as const

// 明細：見出し40行目、データ41行目～
const DETAIL = {
  startRow: 41,
  // D列がこれらになったら終了
  stopWords: ['小計', '消費税', '合計'],
  // 念のため最大行
  maxRow: 220
} as const

// ================================
// シート別処理用の設定
// ================================
const SHEET_NAMES = {
  cover: '表紙',      // 見積情報用
  index: '目次',      // セクション定義用
  details: '明細'      // 明細用
} as const

// ================================
// Supabase（Service Role）
// ================================
function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  console.log('[Import Excel] Supabase接続チェック:', {
    urlExists: !!url,
    keyExists: !!key,
    nodeEnv: process.env.NODE_ENV
  })
  
  if (!url || !key) {
    throw new Error(
      '【環境設定エラー】以下の環境変数が未設定です:\n' +
      `- SUPABASE_URL: ${url ? '✓ 設定済み' : '✗ 未設定'}\n` +
      `- SUPABASE_SERVICE_ROLE_KEY: ${key ? '✓ 設定済み' : '✗ 未設定'}\n\n` +
      '.env.local に以下を追加してください:\n' +
      'SUPABASE_URL=https://xxxxx.supabase.co\n' +
      'SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx'
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ================================
// Utils
// ================================
function normalizeText(v: unknown) {
  // 全角スペース・半角スペース・改行をすべて除去
  return String(v ?? '')
    .replace(/\u3000/g, '')  // 全角スペース
    .replace(/\s+/g, '')      // 半角スペース・改行
    .trim()
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function getCell(ws: XLSX.WorkSheet, addr: string) {
  return ws[addr]?.v
}

function colRow(col: string, row: number) {
  return `${col}${row}`
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function pickDigits(s: string): string {
  return s.replace(/\D+/g, '')
}

/**
 * 複数セルから値を取得して連結
 * 例: "AN5,AR5,AU5" → セル AN5, AR5, AU5 の値を取得して連結
 * forceNumber: true の場合、数値セルのみを抽出（日付フォーマット用）
 */
function extractMultipleCellValues(ws: XLSX.WorkSheet, cellAddrs: string, forceNumber: boolean = false): string {
  if (!cellAddrs || !cellAddrs.trim()) return ''
  
  const cells = cellAddrs.split(',').map(s => s.trim()).filter(Boolean)
  const values: string[] = []
  
  console.log(`[extractMultipleCellValues] Processing cells: ${cells.join(', ')}, forceNumber: ${forceNumber}`)
  
  for (const cell of cells) {
    const val = getCell(ws, cell)
    console.log(`[extractMultipleCellValues] Cell ${cell}: ${JSON.stringify(val)} (type: ${typeof val})`)
    
    if (val !== null && val !== undefined && val !== '') {
      // forceNumber=true の場合、数値のみを抽出
      if (forceNumber) {
        const numVal = toNumber(val)
        if (numVal !== null) {
          values.push(String(numVal))
        }
      } else {
        const strVal = String(val).trim()
        if (strVal) {
          values.push(strVal)
        }
      }
    }
  }
  
  const result = values.join('')
  console.log(`[extractMultipleCellValues] Final result: "${result}"`)
  return result
}

// Excelセルの値から日付文字列(YYYY-MM-DD)を生成
function formatDateValue(v: unknown): string | null {
  if (v === null || v === undefined) return null

  // Excelシリアル値（数値）の場合
  if (typeof v === 'number') {
    // Excelは1900年1月1日を1とするシリアル値
    // 誤認防止: 年だけの数値（例: 2025）をシリアル値として扱わない
    // 近年のシリアル値は概ね 20000〜60000 の範囲（1955〜2064年相当）
    const n = v as number
    if (n < 20000 || n > 60000) return null

    // 1899年12月30日を基準日とする（Excelの1 = 1900/1/1）
    const epoch = new Date(1899, 11, 30)
    // 60以降は1日ずれを補正（1900年のうるう年バグ）
    const days = n >= 60 ? n - 1 : n
    const ms = days * 24 * 60 * 60 * 1000
    const date = new Date(epoch.getTime() + ms)

    const yyyy = date.getFullYear()
    const mm = pad2(date.getMonth() + 1)
    const dd = pad2(date.getDate())
    return `${yyyy}-${mm}-${dd}`
  }

  const s = normalizeText(v)
  if (!s) return null

  // yyyy年mm月dd日 形式（例: 2025年9月3日）
  const jpDate = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (jpDate) {
    const year = Number(jpDate[1])
    const mm = pad2(Number(jpDate[2]))
    const dd = pad2(Number(jpDate[3]))
    return `${year}-${mm}-${dd}`
  }

  // 令和表記 -> 西暦変換
  const reiwa = s.match(/令和\s*(\d+)年\s*(\d+)月\s*(\d+)日/)
  if (reiwa) {
    const year = 2018 + Number(reiwa[1]) // 令和1年=2019年
    const mm = pad2(Number(reiwa[2]))
    const dd = pad2(Number(reiwa[3]))
    return `${year}-${mm}-${dd}`
  }

  // 西暦 yyyy/mm/dd, yyyy-mm-dd, yyyy.mm.dd
  const ymd = s.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/)
  if (ymd) {
    const year = Number(ymd[1])
    const mm = pad2(Number(ymd[2]))
    const dd = pad2(Number(ymd[3]))
    return `${year}-${mm}-${dd}`
  }

  return null
}

function generateCaseId16(): string {
  const ts = Date.now().toString(16)
  const rnd = Math.random().toString(16).slice(2, 10)
  return (ts + rnd).slice(0, 16)
}

/**
 * プリセットのセル候補リストから値を探索
 */
function findValueFromCells(ws: XLSX.WorkSheet, cells: string[]): string {
  for (const cellGroup of cells) {
    // カンマ区切りで複数セル指定があれば結合して返す
    const cellList = cellGroup
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)

    if (cellList.length === 0) continue

    const foundParts: string[] = []
    const debugParts: string[] = []

    for (const cell of cellList) {
      const value = normalizeText(getCell(ws, cell))
      if (value) {
        foundParts.push(value)
        debugParts.push(`${cell}="${value}"`)
      } else {
        debugParts.push(`${cell}=""`)
      }
    }

    if (foundParts.length > 0) {
      const combined = foundParts.join('')
      console.log(
        `[Excel Parse] Found value in cell group ${cellGroup}: ${debugParts.join(', ')} => "${combined}"`
      )
      return combined
    }
  }

  console.log(`[Excel Parse] No value found in cells: ${cells.join(', ')}`)
  return ''
}

// ExcelからAU33の画像を抽出（Base64）
function extractStampImage(wb: XLSX.WorkBook): string | null {
  try {
    const wbAny = wb as any
    if (!wbAny.Sheets || !wbAny.media) {
      console.log('[Excel Parse] No media found in workbook')
      return null
    }

    // wb.media は { image_index: { data: Buffer, ... } } 形式
    // AU33付近の画像を探す（最初の画像を取得）
    const mediaKeys = Object.keys(wbAny.media || {})
    if (mediaKeys.length === 0) {
      console.log('[Excel Parse] No images found in media')
      return null
    }

    const firstImageKey = mediaKeys[0]
    const image = wbAny.media[firstImageKey]
    if (!image || !image.data) {
      console.log('[Excel Parse] Image data not found')
      return null
    }

    // image.data は Buffer or Uint8Array
    const buf = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data)
    const base64 = buf.toString('base64')
    
    // MIME推定（content-typeがあれば使用）
    const mime = image.contentType || 'image/png'
    const dataUrl = `data:${mime};base64,${base64}`
    
    console.log(`[Excel Parse] Stamp image extracted: ${mime} (${buf.length} bytes)`)
    return dataUrl
  } catch (err) {
    console.error('[Excel Parse] Failed to extract stamp image:', err)
    return null
  }
}

// ================================
// ヘッダー行から列位置を動的検出
// ================================
function findColumnsByHeader(ws: XLSX.WorkSheet, headerRow: number = 40) {
  const columns = {
    costPrice: null as string | null,
    costAmount: null as string | null,
    grossMargin: null as string | null,
    wholesalePrice: null as string | null  // 仕切価格列
  }

  // A列からCZ列まで探索（最大104列）
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = []
  
  // 1文字列（A-Z）
  allCols.push(...colNames)
  
  // 2文字列（AA-CZ）
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  console.log(`[Excel Parse] ヘッダー行 ${headerRow} を探索中...`)
  
  for (const col of allCols) {
    const cellAddr = `${col}${headerRow}`
    const value = normalizeText(getCell(ws, cellAddr))
    const valueLower = value.toLowerCase()
    
    // デバッグ：原価・粗利関連のヘッダーをすべて表示
    if (valueLower.includes('原価') || valueLower.includes('粗利') || valueLower.includes('定価') || valueLower.includes('仕切')) {
      console.log(`[Excel Parse] 候補列発見: ${cellAddr}="${value}"`)
    }
    
    if (!columns.costPrice && (valueLower.includes('原価単価') || valueLower === '原価')) {
      columns.costPrice = col
      console.log(`[Excel Parse] ✓ 原価単価列確定: ${col}列`)
    }
    if (!columns.costAmount && (valueLower.includes('原価金額') || valueLower.includes('原価合計'))) {
      columns.costAmount = col
      console.log(`[Excel Parse] ✓ 原価金額列確定: ${col}列`)
    }
    if (!columns.grossMargin && (valueLower.includes('粗利') || valueLower.includes('利益率'))) {
      columns.grossMargin = col
      console.log(`[Excel Parse] ✓ 粗利率列確定: ${col}列`)
    }
    if (!columns.wholesalePrice && (valueLower.includes('仕切') || valueLower.includes('帰社'))) {
      columns.wholesalePrice = col
      console.log(`[Excel Parse] ✓ 仕切価格列確定: ${col}列 (キーワード: "${value}")`)
    }
  }

  console.log('[Excel Parse] 列検出結果:', columns)
  return columns
}

// ================================
// 見積日を探索（ラベル「見積日」「作成日」「発行日」などの右隣セルを優先）
// 複数セルにまたがる日付にも対応（2025 年 9 月 1 日）
// ================================
function findSubject(ws: XLSX.WorkSheet): string | null {
  // 件名のセル位置を複数パターン試す
  const candidates = [
    'C21',  // 典型的なレイアウト
    'C22', 'D21', 'D22',
    'K27',  // CELL.subject の定義値
  ]
  
  for (const cell of candidates) {
    const val = normalizeText(getCell(ws, cell))
    if (val && val.length > 0) {
      console.log(`[Excel Parse] 件名検出: ${cell}="${val}"`)
      return val
    }
  }

  // セル周辺スキャン：「件名」ラベルを探して右隣を確認
  const allCols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (let row = 15; row <= 30; row++) {
    for (let col = 0; col < allCols.length; col++) {
      const label = normalizeText(getCell(ws, `${allCols[col]}${row}`))
      if (label.includes('件名')) {
        const nextCol = allCols[col + 1]
        if (nextCol) {
          const val = normalizeText(getCell(ws, `${nextCol}${row}`))
          if (val && val.length > 0) {
            console.log(`[Excel Parse] 件名検出(ラベル隣): ${allCols[col]}${row}="${label}", ${nextCol}${row}="${val}"`)
            return val
          }
        }
      }
    }
  }

  console.log('[Excel Parse] 件名が見つかりませんでした')
  return null
}

// ================================
// ラベル付き値を探索（「受渡場所」「納期」など）
// - ラベルが見つかったら、右側の複数列を探索して値を見つける
// - 見積書フォーマットでは D列にラベル、K列に値というパターンが多い
// ================================
function findLabelValue(ws: XLSX.WorkSheet, labelKeywords: string[]): string {
  const allCols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const extendedCols: string[] = [...allCols]
  for (const first of ['A', 'B', 'C']) {
    for (const second of allCols) {
      extendedCols.push(first + second)
    }
  }

  // 対象範囲を広めに設定（15〜40行目あたり）
  for (let row = 15; row <= 40; row++) {
    for (let colIdx = 0; colIdx < extendedCols.length; colIdx++) {
      const col = extendedCols[colIdx]
      const label = normalizeText(getCell(ws, `${col}${row}`))
      
      // ラベルがキーワードのいずれかに一致するか
      if (labelKeywords.some(kw => label.includes(kw))) {
        // 右側の最大10列まで探索して、最初に見つかった非空セルを返す
        for (let offset = 1; offset <= 10 && colIdx + offset < extendedCols.length; offset++) {
          const targetCol = extendedCols[colIdx + offset]
          const val = normalizeText(getCell(ws, `${targetCol}${row}`))
          if (val) {
            console.log(`[Excel Parse] ${labelKeywords[0]}検出: ${col}${row}="${label}", ${targetCol}${row}="${val}" (offset=${offset})`)
            return val
          }
        }
        
        // 右側に値が見つからない場合、同じ列の次の行を確認
        const valBelow = normalizeText(getCell(ws, `${col}${row + 1}`))
        if (valBelow) {
          console.log(`[Excel Parse] ${labelKeywords[0]}検出(下): ${col}${row}="${label}", ${col}${row + 1}="${valBelow}"`)
          return valBelow
        }
      }
    }
  }

  console.log(`[Excel Parse] ${labelKeywords[0]}が見つかりませんでした`)
  return ''
}

function findEstimateDate(ws: XLSX.WorkSheet): string | null {
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = []
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  console.log('[Excel Parse] 見積日の探索を開始します...')

  // ★優先パターン: 5行目のAN/AR/AU列（年/月/日が分かれている場合）
  const an5 = normalizeText(getCell(ws, 'AN5'))
  const ar5 = normalizeText(getCell(ws, 'AR5'))
  const au5 = normalizeText(getCell(ws, 'AU5'))

  if (an5 || ar5 || au5) {
    console.log(`[Excel Parse] 5行目の日付セルをチェック: AN5="${an5}", AR5="${ar5}", AU5="${au5}"`)
    
    // 年の解析（令和または数値）
    let year: number | null = null
    if (an5) {
      const reiwaMatch = an5.match(/令和\s*(\d+)/)
      const numMatch = an5.match(/(\d+)/)
      if (reiwaMatch) {
        year = 2018 + Number(reiwaMatch[1]) // 令和1年 = 2019年
      } else if (numMatch) {
        const n = Number(numMatch[1])
        if (n >= 1 && n <= 20) {
          year = 2018 + n // 令和年号として扱う
        } else if (n >= 1900 && n <= 2100) {
          year = n // 西暦として扱う
        }
      }
    }

    // 月・日の解析
    const monthMatch = ar5.match(/(\d{1,2})/)
    const dayMatch = au5.match(/(\d{1,2})/)
    const month = monthMatch ? Number(monthMatch[1]) : null
    const day = dayMatch ? Number(dayMatch[1]) : null

    if (year && month && day) {
      const result = `${year}-${pad2(month)}-${pad2(day)}`
      console.log(`[Excel Parse] ✓ 見積日検出成功(5行目): AN5="${an5}" → year=${year}, AR5="${ar5}" → month=${month}, AU5="${au5}" → day=${day} → ${result}`)
      return result
    }
  }

  const targetRows = Array.from({ length: 56 }, (_, i) => i + 5) // 5〜60行目あたりを探索

  // ★パターン追加: K7(令和) L7(9月) M7(3日) のように年月日が分かれているケース
  // 令和 or 西暦 が含まれる行を探す
  for (const row of targetRows) {
    for (let startCol = 0; startCol < allCols.length - 2; startCol++) {
      const col1 = allCols[startCol]
      const col2 = allCols[startCol + 1]
      const col3 = allCols[startCol + 2]
      
      const v1 = normalizeText(getCell(ws, `${col1}${row}`))
      const v2 = normalizeText(getCell(ws, `${col2}${row}`))
      const v3 = normalizeText(getCell(ws, `${col3}${row}`))

      // 令和/平成/昭和 などの元号が含まれるか
      if (/(令和|平成|昭和|西暦)/.test(v1)) {
        // v1 から「令和 X年」を抽出
        const reiwaMatch = v1.match(/令和\s*(\d+)/)
        const seirekiMatch = v1.match(/(\d{4})\s*年/)
        
        let year: number | null = null
        if (reiwaMatch) {
          year = 2018 + Number(reiwaMatch[1]) // 令和1年 = 2019年
        } else if (seirekiMatch) {
          year = Number(seirekiMatch[1])
        }

        // v2 から月を抽出（例: "9月" → "9"）
        const monthMatch = v2.match(/(\d{1,2})/)
        const month = monthMatch ? pad2(Number(monthMatch[1])) : '01'

        // v3 から日を抽出（例: "3日" → "3"）
        const dayMatch = v3.match(/(\d{1,2})/)
        const day = dayMatch ? pad2(Number(dayMatch[1])) : '01'

        if (year && year > 1900 && year < 2100) {
          const result = `${year}-${month}-${day}`
          console.log(`[Excel Parse] ✓ 見積日検出成功(令和年月日分割): ${col1}${row}="${v1}", ${col2}${row}="${v2}", ${col3}${row}="${v3}" → ${result}`)
          return result
        }
      }
    }
  }

  // 従来パターン：連続セルで「年月日」
  for (const row of targetRows) {
    // 連続する8セルを見て「数字 (空) 年 数字 (空) 月 数字 (空) 日」パターンも許容
    for (let idx = 0; idx < allCols.length - 7; idx++) {
      const vals = Array.from({ length: 8 }, (_, i) => {
        const col = allCols[idx + i]
        if (!col) return ''
        const raw = getCell(ws, colRow(col, row))
        return normalizeText(raw)
      })

      // パターン1: [数字, 年, 数字, 月, 数字, 日] (連続)
      const isPattern1 = 
        /^\d{4}$/.test(vals[0]) &&
        vals[1] === '年' &&
        /^\d{1,2}$/.test(vals[2]) &&
        vals[3] === '月' &&
        /^\d{1,2}$/.test(vals[4]) &&
        vals[5] === '日'

      if (isPattern1) {
        const year = Number(vals[0])
        const mm = pad2(Number(vals[2]))
        const dd = pad2(Number(vals[4]))
        const result = `${year}-${mm}-${dd}`
        console.log(`[Excel Parse] ✓ 見積日検出成功(連続6セル): ${allCols[idx]}${row}~${allCols[idx+5]}${row}`, vals.slice(0, 6), `→ ${result}`)
        return result
      }

      // パターン2: [数字, 空, 年, 数字, 空, 月, 数字, 空, 日] のような空白入り
      const isPattern2 =
        /^\d{4}$/.test(vals[0]) &&
        vals[2] === '年' &&
        /^\d{1,2}$/.test(vals[3]) &&
        vals[5] === '月' &&
        /^\d{1,2}$/.test(vals[6])

      if (isPattern2) {
        // 「日」を探す（7番目または8番目）
        if (vals[7] === '日' || vals[8] === '日') {
          const year = Number(vals[0])
          const mm = pad2(Number(vals[3]))
          const dd = pad2(Number(vals[6]))
          const result = `${year}-${mm}-${dd}`
          console.log(`[Excel Parse] ✓ 見積日検出成功(空白入り): ${allCols[idx]}${row}~`, vals, `→ ${result}`)
          return result
        }
      }

      // 年月日パターンが見つかった場合のデバッグ
      if (vals.includes('年') || vals.includes('月') || vals.includes('日')) {
        console.log(`[Excel Parse] 日付パターン候補(不完全): Row${row} ${allCols[idx]}~`, vals)
      }
    }

    // 1セルに結合されている場合の従来ロジック
    for (let idx = 0; idx < allCols.length; idx++) {
      const col = allCols[idx]
      const cellAddr = colRow(col, row)
      const raw = getCell(ws, cellAddr)
      const text = normalizeText(raw)
      const lower = text.toLowerCase()

      const labelKeywords = ['見積', '作成日', '発行日']
      const isLabel = labelKeywords.some((kw) => lower.includes(kw)) && lower.includes('日')

      if (isLabel) {
        const rightCol = allCols[idx + 1]
        if (rightCol) {
          const rightVal = getCell(ws, colRow(rightCol, row))
          const parsedRight = formatDateValue(rightVal)
          if (parsedRight) {
            console.log(`[Excel Parse] 見積日検出: ${colRow(rightCol, row)}="${rightVal}" → ${parsedRight}`)
            return parsedRight
          }
        }

        const parsedSelf = formatDateValue(raw)
        if (parsedSelf) {
          console.log(`[Excel Parse] 見積日検出(同セル): ${cellAddr}="${raw}" → ${parsedSelf}`)
          return parsedSelf
        }
      }

      if (!isLabel) {
        const parsed = formatDateValue(raw)
        if (parsed) {
          console.log(`[Excel Parse] 日付候補検出: ${cellAddr}="${raw}" → ${parsed}`)
          return parsed
        }
      }
    }

    // ================================
    // 行全体から 年/月/日 の近傍数値を拾って再構成
    // - 『年』『月』『日』の位置を見つけ、直近（左側優先）の数値を採用
    // - 空白セルを無視、最大4セルまで遡って探索
    // ================================
    let yearNum: number | null = null
    let monthNum: number | null = null
    let dayNum: number | null = null

    for (let idx = 0; idx < allCols.length; idx++) {
      const col = allCols[idx]
      const cellAddr = colRow(col, row)
      const raw = getCell(ws, cellAddr)
      const text = normalizeText(raw)

      const findLeftNumber = (startIdx: number, maxBack: number, digits: 'YYYY' | 'MMDD') => {
        for (let k = 1; k <= maxBack; k++) {
          const leftCol = allCols[startIdx - k]
          if (!leftCol) continue
          const leftRaw = getCell(ws, colRow(leftCol, row))
          const s = normalizeText(leftRaw)
          if (/^\d+$/.test(s)) {
            const num = Number(s)
            if (digits === 'YYYY' && num >= 1900 && num <= 2100) return num
            if (digits === 'MMDD' && num >= 1 && num <= 31) return num
          }
        }
        return null
      }

      if (text === '年' && yearNum == null) {
        yearNum = findLeftNumber(idx, 4, 'YYYY')
      } else if (text === '月' && monthNum == null) {
        monthNum = findLeftNumber(idx, 4, 'MMDD')
      } else if (text === '日' && dayNum == null) {
        dayNum = findLeftNumber(idx, 4, 'MMDD')
      }
    }

    if (yearNum && monthNum && dayNum) {
      const result = `${yearNum}-${pad2(monthNum)}-${pad2(dayNum)}`
      console.log(`[Excel Parse] ✓ 見積日検出成功(近傍探索): Row${row} → ${result}`)
      return result
    }
  }

  console.log('[Excel Parse] 見積日が見つかりませんでした')
  return null
}

// ================================
// 見積番号を探索（「号」を含む短い文字列、右上帯など）
// ================================
function findEstimateNo(ws: XLSX.WorkSheet): string | null {
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = []
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  // パターン1: 分散型（AM1="第", AO1="Ｒ8-ＳO", AS1=連番, AV1="号"）
  const am1Raw = getCell(ws, 'AM1')
  const ao1Raw = getCell(ws, 'AO1')  // RO1ではなくAO1
  const as1Raw = getCell(ws, 'AS1')
  const av1Raw = getCell(ws, 'AV1')
  
  const am1 = normalizeText(am1Raw)
  const ao1 = normalizeText(ao1Raw)
  const as1 = normalizeText(as1Raw)
  const av1 = normalizeText(av1Raw)
  
  if (am1 && ao1 && as1 && av1) {
    const combined = am1 + ao1 + as1 + av1
    console.log(`[Excel Parse] 見積番号検出（分散型）: AM1="${am1}" + AO1="${ao1}" + AS1="${as1}" + AV1="${av1}" => "${combined}"`)
    return combined
  }

  // パターン2: 集約型（Row3～12の上部エリア）
  const targetRows = Array.from({ length: 10 }, (_, i) => i + 3)

  const testPatterns = (s: string) => {
    const joined = s.replace(/\s+/g, '')
    // 代表的パターン
    if (/第?[A-Za-z0-9\-]+号/.test(joined)) return true
    if (/R\d+[-‐－–—]?S[OE][\-\s]*\d+/.test(joined)) return true
    // 連番のみ + 号
    if (/\d{1,6}号/.test(joined)) return true
    return false
  }

  for (const row of targetRows) {
    // 横方向に最大12セル分のウィンドウで連結して判定
    for (let start = 0; start < allCols.length - 1; start++) {
      let buffer = ''
      for (let width = 1; width <= 12 && start + width < allCols.length; width++) {
        const col = allCols[start + width - 1]
        const raw = getCell(ws, colRow(col, row))
        const t = normalizeText(raw)
        if (t) buffer += (buffer ? ' ' : '') + t
        const candidate = buffer
        if (candidate && candidate.length <= 40 && testPatterns(candidate)) {
          console.log(`[Excel Parse] 見積番号検出（集約型）: Row${row} ${allCols[start]}~${allCols[start+width-1]} => "${candidate}"`)
          return candidate
        }
      }
    }
  }

  console.log('[Excel Parse] 見積番号が見つかりませんでした')
  return null
}

// ================================
// 顧客名を探索（D8/C8優先→行内「御中」近傍→会社キーワード）
// ================================
function findCustomerName(ws: XLSX.WorkSheet): string | null {
  // 1. 既定セル（複数候補）
  const candidates = ['D8', 'C8', 'B8', 'D10', 'C10']
  for (const cell of candidates) {
    const val = normalizeText(getCell(ws, cell))
    if (val) {
      console.log(`[Excel Parse] 顧客名(${cell})検出: "${val}"`)
      return val
    }
  }

  // 2. 上部30行を探索して「御中」を見つけ、その左側の最も近い非空セルを顧客名として採用
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = []
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  const targetRows = Array.from({ length: 30 }, (_, i) => i + 1)
  const companyKeywords = ['株式会社', '有限会社', '合同会社']

  for (const r of targetRows) {
    // 行の全セル文字列を取得
    const rowVals: { col: string; text: string }[] = []
    for (const col of allCols.slice(0, 15)) { // A〜O程度を対象
      const t = normalizeText(getCell(ws, col + String(r)))
      if (t) rowVals.push({ col, text: t })
    }

    if (rowVals.length === 0) continue

    // 2-1. 「御中」を含むセルを探し、その左側でもっとも近い非空テキストを採用
    const onchuIdx = rowVals.findIndex(v => v.text.includes('御中'))
    if (onchuIdx >= 0) {
      for (let k = onchuIdx - 1; k >= 0; k--) {
        const candidate = rowVals[k].text
        // 会社名キーワードや「様」などを優先
        if (candidate) {
          console.log(`[Excel Parse] 顧客名(御中隣接)検出: Row${r} ${rowVals[k].col}="${candidate}"`)
          return candidate
        }
      }
    }

    // 2-2. 行内に会社名キーワードを含むセルがあればそれを採用
    const company = rowVals.find(v => companyKeywords.some(kw => v.text.includes(kw)))
    if (company) {
      console.log(`[Excel Parse] 顧客名(会社キーワード)検出: Row${r} ${company.col}="${company.text}"`)
      return company.text
    }
  }

  console.log('[Excel Parse] 顧客名が見つかりませんでした')
  return null
}

// ================================
// 明細抽出（縦見積書専用）
// - D=品名, N=規格, X=数量, AB=単位, AE=単価, AJ=金額
// - 原価列は動的検出（ヘッダー行から自動判定）
// - 品名空 & 規格のみ → 直前のspecへ追記（改行）
// - D列が stopWords → 終了
// ================================
type ParsedDetail = {
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  cost_price?: number | null
  cost_amount?: number | null
  gross_margin?: number | null
  wholesale_price?: number | null  // 仕切価格
  section_name?: string  // セクション名（例: 暖房機設置工事、工事費）
  section_subtotal?: number | null  // このセクションの小計（該当行が小計の場合のみ）
}

function parseDetails(ws: XLSX.WorkSheet): { details: ParsedDetail[], lastDataRow: number } {
  const rows: ParsedDetail[] = []
  let lastIdx = -1
  let lastDataRow = DETAIL.startRow - 1

  // ★ヘッダー行から品名・規格列を自動検出（南九州フォーマット対応）
  const headerRow = 40
  let colItemName = 'D'  // デフォルト
  let colSpec = 'N'
  let colQty = 'X'
  let colUnit = 'AB'
  let colPrice = 'AE'
  let colAmount = 'AJ'
  
  // Row40で品名列を探す
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = [...colNames]
  for (const first of colNames) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }
  
  for (const col of allCols.slice(0, 30)) { // A～AD列まで
    const cellVal = normalizeText(getCell(ws, col + String(headerRow)))
    if (cellVal.includes('品') && cellVal.includes('名')) {
      colItemName = col
      console.log(`[Excel Parse] 品名列を${col}列に検出: "${cellVal}"`)
    }
    if (cellVal.includes('規格') || (cellVal.includes('規') && cellVal.includes('寸法'))) {
      colSpec = col
      console.log(`[Excel Parse] 規格列を${col}列に検出: "${cellVal}"`)
    }
    if (cellVal.includes('数') && cellVal.includes('量')) {
      colQty = col
      console.log(`[Excel Parse] 数量列を${col}列に検出: "${cellVal}"`)
    }
    if (cellVal === '単位') {
      colUnit = col
    }
    if (cellVal.includes('単') && cellVal.includes('価')) {
      colPrice = col
    }
    if (cellVal.includes('金') && cellVal.includes('額')) {
      colAmount = col
    }
  }

  // 原価列を動的検出（40行目のヘッダーから）
  const costColumns = findColumnsByHeader(ws, 40)

  // デバッグ：ヘッダ行と最初の数行をログ出力
  console.log('[Excel Parse] Scanning details from row', DETAIL.startRow)
  console.log(`[Excel Parse] 使用列: 品名=${colItemName}, 規格=${colSpec}, 数量=${colQty}, 単位=${colUnit}, 単価=${colPrice}, 金額=${colAmount}`)
  
  let currentRow = DETAIL.startRow
  let sectionCount = 0

  while (currentRow <= DETAIL.maxRow) {
    const itemName = normalizeText(getCell(ws, colRow(colItemName, currentRow)))
    const spec = normalizeText(getCell(ws, colRow(colSpec, currentRow)))
    const qty = toNumber(getCell(ws, colRow(colQty, currentRow)))
    const unit = normalizeText(getCell(ws, colRow(colUnit, currentRow)))
    let unitPrice = toNumber(getCell(ws, colRow(colPrice, currentRow)))
    let amount = toNumber(getCell(ws, colRow(colAmount, currentRow)))
    
    // 原価情報を動的列から取得
    const costPrice = costColumns.costPrice ? toNumber(getCell(ws, colRow(costColumns.costPrice, currentRow))) : null
    const costAmount = costColumns.costAmount ? toNumber(getCell(ws, colRow(costColumns.costAmount, currentRow))) : null
    const grossMargin = costColumns.grossMargin ? toNumber(getCell(ws, colRow(costColumns.grossMargin, currentRow))) : null
    const wholesalePrice = costColumns.wholesalePrice ? toNumber(getCell(ws, colRow(costColumns.wholesalePrice, currentRow))) : null
    
    // ★仕切価格がある場合、単価と金額を再計算
    if (wholesalePrice !== null && wholesalePrice > 0 && qty !== null && qty > 0) {
      unitPrice = Math.round(wholesalePrice / qty)
      amount = wholesalePrice  // 金額は仕切価格を使用
      console.log(`[Excel Parse] Row ${currentRow}: 仕切価格=${wholesalePrice}, 数量=${qty} → 計算単価=${unitPrice}, 金額=${amount}`)
    }

    // デバッグ：最初のセクションの最初の10行を出力
    if (sectionCount === 0 && currentRow <= DETAIL.startRow + 10) {
      console.log(`[Excel Parse] Row ${currentRow}:`, {
        [`${colItemName}:品名`]: itemName,
        [`${colSpec}:規格`]: spec,
        [`${colQty}:数量`]: qty,
        [`${colUnit}:単位`]: unit,
        [`${colPrice}:単価`]: unitPrice,
        [`${colAmount}:金額`]: amount,
        [`${costColumns.costPrice}:原価単価`]: costPrice,
        [`${costColumns.costAmount}:原価金額`]: costAmount,
        [`${costColumns.grossMargin}:粗利率`]: grossMargin,
        [`${costColumns.wholesalePrice}:仕切価格`]: wholesalePrice
      })
    }

    // ★小計で終了した場合、次のセクションを探す
    if (DETAIL.stopWords.includes(itemName as any)) {
      // 「合計」に到達したら、すべてのセクション処理を終了
      if (itemName === '合計') {
        console.log(`[Excel Parse] Final subtotal (合計) detected at row ${currentRow}. All sections completed.`)
        break
      }

      // 「小計」に到達したら、次のセクションを探す
      console.log(`[Excel Parse] Subtotal/stop word detected at row ${currentRow}: "${itemName}" (Section ${sectionCount})`)
      sectionCount++
      // 次のセクションの開始を探す（小計の2～5行下を探索）
      let foundNext = false
      for (let skip = 1; skip <= 5; skip++) {
        const nextRow = currentRow + skip
        const nextItemName = normalizeText(getCell(ws, colRow(colItemName, nextRow)))
        
        // 「合計」に達したら、次のセクションなし
        if (nextItemName === '合計') {
          console.log(`[Excel Parse] No more sections found. Final total (合計) at row ${nextRow}. Processing complete.`)
          break  // 処理完全終了
        }

        if (nextItemName && !['小計', '消費税', '合計'].includes(nextItemName)) {
          console.log(`[Excel Parse] Next section found at row ${nextRow}`)
          currentRow = nextRow as any
          foundNext = true
          break
        }
      }
      if (!foundNext) {
        console.log(`[Excel Parse] No more sections found after row ${currentRow}`)
        break
      }
      continue
    }

    const hasAny =
      itemName !== '' || spec !== '' || qty !== null || unit !== '' || unitPrice !== null || amount !== null
    if (!hasAny) {
      currentRow++
      continue
    }

    // 継続行：品名なし・規格だけ（数量/単価は空 or 0）
    const looksLikeContinuation =
      itemName === '' && spec !== '' && (qty === null || qty === 0) && unit === '' && (unitPrice === null || unitPrice === 0)

    if (looksLikeContinuation && lastIdx >= 0) {
      rows[lastIdx].spec = rows[lastIdx].spec ? `${rows[lastIdx].spec}\n${spec}` : spec
      currentRow++
      continue
    }

    // 明細として成立する最低条件：品名あり
    if (itemName === '') {
      currentRow++
      continue
    }

    // ★修正：仕切価格があれば単価・金額なしでも取り込む
    const hasSomeAmount = (unitPrice !== null && unitPrice !== 0) ||
                          (amount !== null && amount !== 0) ||
                          (wholesalePrice !== null && wholesalePrice !== 0)
    
    if (!hasSomeAmount) {
      currentRow++
      continue
    }

    const q = qty ?? 1  // 数量なしなら1で補完
    let up = unitPrice ?? 0
    let am = amount ?? 0
    
    // 仕切価格がある場合は金額・単価を逆算
    if (wholesalePrice !== null && wholesalePrice > 0) {
      am = wholesalePrice
      if (q > 0) up = Math.round(wholesalePrice / q)
    } else if (am === 0 && q > 0) {
      am = q * up
    }

    rows.push({
      item_name: itemName,
      spec,
      unit,
      quantity: q,
      unit_price: up,
      amount: am,
      cost_price: costPrice,
      cost_amount: costAmount,
      gross_margin: grossMargin,
      wholesale_price: wholesalePrice
    })
    lastIdx = rows.length - 1
    lastDataRow = currentRow  // 最終明細行を記録
    currentRow++
  }

  console.log(`[Excel Parse] Details parsed: ${rows.length} items, last row: ${lastDataRow}`)
  return { details: rows, lastDataRow }
}

// ================================
// 小計・消費税・合計の自動検出
// 明細終了後の数行 + 固定範囲を探索
// ================================
function findSummaryAmounts(ws: XLSX.WorkSheet, lastDetailRow: number) {
  let subtotal: number | null = null
  let specialDiscount: number | null = null
  let taxAmount: number | null = null
  let totalAmount: number | null = null

  // 探索範囲：明細終了後1～15行 + 固定範囲50～100行
  const searchRanges = [
    { start: lastDetailRow + 1, end: lastDetailRow + 15 },
    { start: 50, end: 100 }
  ]

  // 探索対象列（金額が入っていそうな列）
  const amountCols = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM']

  console.log(`[Excel Parse] findSummaryAmounts start. lastDetailRow=${lastDetailRow}, searchRanges:`, searchRanges)

  for (const range of searchRanges) {
    for (let r = range.start; r <= range.end; r++) {
      const dVal = normalizeText(getCell(ws, colRow('D', r)))
      
      if (dVal) {
        console.log(`[Excel Parse] D${r}="${dVal}"`)
      }
      
      // 小計を探す
      if (!subtotal && (dVal === '小計' || dVal.includes('小計'))) {
        for (const col of amountCols) {
          const val = toNumber(getCell(ws, colRow(col, r)))
          if (val !== null && val > 0) {
            subtotal = val
            console.log(`[Excel Parse] 小計発見: D${r}="${dVal}", ${col}${r}=${val}`)
            break
          }
        }
      }

      // 出精値引きを探す
      if (!specialDiscount && dVal.includes('出精')) {
        for (const col of amountCols) {
          const val = toNumber(getCell(ws, colRow(col, r)))
          if (val !== null) {
            // 負数の場合は絶対値を取る
            specialDiscount = Math.abs(val)
            console.log(`[Excel Parse] 出精値引き発見: D${r}="${dVal}", ${col}${r}=${val} → ${specialDiscount}`)
            break
          }
        }
      }

      // 消費税を探す
      if (!taxAmount && (dVal.includes('消費税') || dVal === '税額')) {
        for (const col of amountCols) {
          const val = toNumber(getCell(ws, colRow(col, r)))
          if (val !== null && val >= 0) {
            taxAmount = val
            console.log(`[Excel Parse] 消費税発見: D${r}="${dVal}", ${col}${r}=${val}`)
            break
          }
        }
      }

      // 合計を探す
      if (!totalAmount && (dVal === '合計' || dVal === '合計金額' || dVal.includes('総計'))) {
        for (const col of amountCols) {
          const val = toNumber(getCell(ws, colRow(col, r)))
          if (val !== null && val > 0) {
            totalAmount = val
            console.log(`[Excel Parse] 合計発見: D${r}="${dVal}", ${col}${r}=${val}`)
            break
          }
        }
      }

      // 全て見つかったら終了
      if (subtotal !== null && taxAmount !== null && totalAmount !== null) {
        break
      }
    }
    if (subtotal !== null && taxAmount !== null && totalAmount !== null) {
      break
    }
  }

  return { subtotal, specialDiscount, taxAmount, totalAmount }
}

// ================================
// 顧客突合（名称）
// - 完全一致 → 部分一致 → 無ければ作成
// ================================
async function resolveCustomerId(sb: ReturnType<typeof createClient>, customerName: string) {
  const name = normalizeText(customerName)
  if (!name) throw new Error('顧客名が空です（D8）')

  const exact = await sb.from('customers').select('id,name')
  if (exact.error) throw exact.error
  const exactData = exact.data as { id: string; name: string }[] | null
  const exactMatch = exactData?.find(c => c.name === name)
  if (exactMatch) return exactMatch.id

  const partial = await sb.from('customers').select('id,name').ilike('name', `%${name}%`).limit(1)
  if (partial.error) throw partial.error
  const partialData = partial.data as { id: string; name: string }[] | null
  if (partialData?.length) return partialData[0].id

  const ins = await (sb as any).from('customers').insert({ name }).select('id').single()
  if (ins.error) throw ins.error
  const insData = ins.data as { id: string } | null
  return insData?.id as string
}

// ================================
// セクション定義（目次シートから読み取る）
// ================================
interface SectionDef {
  order: number  // セクション順序（1, 2, 3...）
  name: string   // セクション名（番号を除去）
  amount: number // 金額（H列）
  wholesaleAmount?: number // 仕切金額（I列）
}

function parseIndexSheet(ws: XLSX.WorkSheet): SectionDef[] {
  const sections: SectionDef[] = []
  
  console.log('[Excel Parse] === Parsing Index Sheet ===')
  
  // ★デバッグ: 目次シートの内容を確認
  console.log('[Excel Parse] Index sheet content (Row 1-25):')
  for (let row = 1; row <= 25; row++) {
    const rowContent: string[] = []
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      const v = normalizeText(getCell(ws, `${col}${row}`))
      if (v) rowContent.push(`${col}:${v}`)
    }
    if (rowContent.length > 0) {
      console.log(`  Row${row}: ${rowContent.join(', ')}`)
    }
  }
  
  // B列からセクション名、H列から金額、I列から仕切金額を読み取る
  // Row3から開始（Row2はヘッダー）
  let sectionOrder = 0
  for (let row = 3; row <= 30; row++) {
    const bVal = normalizeText(getCell(ws, `B${row}`))
    const hVal = toNumber(getCell(ws, `H${row}`))
    const iVal = toNumber(getCell(ws, `I${row}`))
    
    if (row <= 10) {
      console.log(`[Excel Parse] Index Row${row}: B="${bVal}" H=${hVal} I=${iVal}`)
    }
    
    // B列が空になったら終了
    if (!bVal) {
      if (row > 10) break
      continue
    }
    
    // ★集計行をスキップ：「小計」「消費税」「合計」「金額」「出精」などを除外
    if (bVal.includes('小計') || bVal.includes('消費税') || bVal.includes('合計') || 
        bVal.includes('金額') || bVal.includes('出精') || bVal.includes('値引')) {
      console.log(`[Excel Parse] Row${row} is summary row, skipping: "${bVal}"`)
      continue
    }
    
    // ★セクション名を直接使用（番号は自動採番）
    // H列またはI列に金額がある場合のみセクション定義とする
    if ((hVal ?? 0) > 0 || (iVal ?? 0) > 0) {
      sectionOrder++
      sections.push({
        order: sectionOrder,
        name: bVal,
        amount: hVal ?? 0,
        wholesaleAmount: iVal ?? undefined
      })
      
      console.log(`[Excel Parse] Section ${sectionOrder}: "${bVal}" amount=${hVal ?? 0} wholesale=${iVal ?? 0}`)
    }
  }
  
  console.log(`[Excel Parse] Found ${sections.length} sections in index sheet`)
  return sections
}

// ================================
// 目次シート合計値取得
// Row19-21の小計・消費税・合計を取得
// ================================
interface IndexSheetTotals {
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  wholesaleSubtotal: number | null
  wholesaleTax: number | null
  wholesaleTotal: number | null
}

function parseIndexSheetTotals(ws: XLSX.WorkSheet): IndexSheetTotals {
  const result: IndexSheetTotals = {
    subtotal: null,
    taxAmount: null,
    totalAmount: null,
    wholesaleSubtotal: null,
    wholesaleTax: null,
    wholesaleTotal: null
  }
  
  // Row15-25を探索して「小計」「消費税」「合計」を検出
  for (let row = 15; row <= 25; row++) {
    const bVal = normalizeText(getCell(ws, `B${row}`))
    const hVal = toNumber(getCell(ws, `H${row}`))
    const iVal = toNumber(getCell(ws, `I${row}`))
    
    if (bVal.includes('小計') && !bVal.includes('消費税')) {
      result.subtotal = hVal
      result.wholesaleSubtotal = iVal
      console.log(`[Excel Parse] Index sheet 小計: H=${hVal}, I=${iVal}`)
    } else if (bVal.includes('消費税')) {
      result.taxAmount = hVal
      result.wholesaleTax = iVal
      console.log(`[Excel Parse] Index sheet 消費税: H=${hVal}, I=${iVal}`)
    } else if (bVal.includes('合計')) {
      result.totalAmount = hVal
      result.wholesaleTotal = iVal
      console.log(`[Excel Parse] Index sheet 合計: H=${hVal}, I=${iVal}`)
    }
  }
  
  return result
}

// ================================
// セクション検証
// 明細シートの各セクション小計と目次シートの金額を比較
// ================================
function validateSections(details: ParsedDetail[], sectionDefs: SectionDef[]): void {
  console.log('[Excel Parse] === Validating Sections ===')
  
  // 明細をセクションごとにグループ化
  const sectionGroups = new Map<string, ParsedDetail[]>()
  details.forEach(detail => {
    if (detail.section_name) {
      const existing = sectionGroups.get(detail.section_name) || []
      existing.push(detail)
      sectionGroups.set(detail.section_name, existing)
    }
  })
  
  // 各セクションの合計を計算して目次シートの金額と比較
  sectionDefs.forEach(secDef => {
    const detailsInSection = sectionGroups.get(secDef.name)
    if (detailsInSection) {
      // 卸価格優先で合計計算
      const detailTotal = detailsInSection.reduce((sum, d) => {
        return sum + (d.wholesale_price ?? d.amount)
      }, 0)
      
      const expectedAmount = secDef.wholesaleAmount ?? secDef.amount
      const diff = Math.abs(detailTotal - expectedAmount)
      
      if (diff > 1) { // 1円以上の誤差があれば警告
        console.warn(
          `[Excel Parse] Section "${secDef.name}" amount mismatch: ` +
          `detail sum=${detailTotal}, index amount=${expectedAmount}, diff=${diff}`
        )
      } else {
        console.log(
          `[Excel Parse] Section "${secDef.name}" validated: ` +
          `detail sum=${detailTotal}, index amount=${expectedAmount} ✓`
        )
      }
    } else {
      console.warn(`[Excel Parse] Section "${secDef.name}" from index not found in details`)
    }
  })
  
  // 目次に存在しない明細のセクションがあれば警告
  sectionGroups.forEach((items, sectionName) => {
    const found = sectionDefs.some(sd => sd.name === sectionName)
    if (!found) {
      const total = items.reduce((sum, d) => sum + (d.wholesale_price ?? d.amount), 0)
      console.warn(
        `[Excel Parse] Detail section "${sectionName}" (total=${total}) ` +
        `not found in index sheet`
      )
    }
  })
  
  console.log('[Excel Parse] === Section Validation Complete ===')
}


// ================================
// シート別処理：表紙シートと明細シートから情報抽出
// ================================
interface SheetProcessResult {
  coverData: any
  details: ParsedDetail[]
  sections?: SectionDef[]  // 目次シートから読み取ったセクション定義
  stampImage: string | null
  fileName: string
}

function processMultiSheetWorkbook(
  wb: XLSX.WorkBook,
  fileName: string,
  stampImage: string | null,
  preset: ExcelFormatPreset = DEFAULT_PRESET
): SheetProcessResult {
  // ★表紙シート処理
  console.log('[Excel Parse] All sheets:', wb.SheetNames)
  const coverSheetName = wb.SheetNames.find(name => {
    const normalized = normalizeText(name)
    return normalized === SHEET_NAMES.cover || normalized.includes(SHEET_NAMES.cover)
  })
  if (!coverSheetName) {
    throw new Error(`【エラー】「${SHEET_NAMES.cover}」シートが見つかりません。利用可能なシート: ${wb.SheetNames.join(', ')}`)
  }
  console.log(`[Excel Parse] Found cover sheet: "${coverSheetName}"`)
  const coverWs = wb.Sheets[coverSheetName]
  
  // 表紙から見積情報を抽出（プリセット設定を使用）
  console.log(`[Excel Parse] Using preset: ${preset.name}`)
  const customerName = findValueFromCells(coverWs, preset.cover.customerName) || findCustomerName(coverWs) || ''
  console.log('[Excel Parse] cover.customerName:', customerName)
  const subject = findValueFromCells(coverWs, preset.cover.subject) || findSubject(coverWs) || ''
  const deliveryPlace = findValueFromCells(coverWs, preset.cover.deliveryPlace)
  const deliveryDeadline = findValueFromCells(coverWs, preset.cover.deliveryDeadline)
  const deliveryTerms = findValueFromCells(coverWs, preset.cover.deliveryTerms)
  const validityText = findValueFromCells(coverWs, preset.cover.validityText)
  const paymentTerms = findValueFromCells(coverWs, preset.cover.paymentTerms)
  let estimateDate: string | null = findEstimateDate(coverWs)
  if (!estimateDate && preset.cover?.estimateDate?.length) {
    const combinedDate = findValueFromCells(coverWs, preset.cover.estimateDate)
    estimateDate = combinedDate || null
  }
  let estimateNo: string | null = findEstimateNo(coverWs)
  if (!estimateNo && preset.cover?.estimateNumber?.length) {
    const combinedNo = findValueFromCells(coverWs, preset.cover.estimateNumber)
    estimateNo = combinedNo || null
  }
  
  // ★デバッグ: 表紙シートのセル値を確認
  console.log('[Excel Parse] Cover sheet extracted values:', {
    subject: `"${subject}"`,
    deliveryPlace: `"${deliveryPlace}"`,
    deliveryDeadline: `"${deliveryDeadline}"`,
    deliveryTerms: `"${deliveryTerms}"`,
    validityText: `"${validityText}"`,
    paymentTerms: `"${paymentTerms}"`,
    estimateDate,
    estimateNo
  })

  // ★目次シート処理（セクション定義 + 合計値）
  const indexSheetName = wb.SheetNames.find(name => {
    const normalized = normalizeText(name)
    return normalized === SHEET_NAMES.index || normalized.includes('目次')
  })
  let sections: SectionDef[] | undefined
  let indexTotals: IndexSheetTotals | undefined
  if (indexSheetName) {
    console.log(`[Excel Parse] Found index sheet: "${indexSheetName}"`)
    const indexWs = wb.Sheets[indexSheetName]
    sections = parseIndexSheet(indexWs)
    indexTotals = parseIndexSheetTotals(indexWs)
    console.log(`[Excel Parse] Parsed ${sections.length} sections from index sheet:`)
    sections.forEach(sec => {
      console.log(`  Section ${sec.order}: ${sec.name}, amount=${sec.amount}, wholesale=${sec.wholesaleAmount ?? 'N/A'}`)
    })
    console.log(`[Excel Parse] Index sheet totals:`, indexTotals)
  } else {
    console.log('[Excel Parse] No index sheet found. Sections will be auto-detected from details.')
  }

  // ★明細シート処理
  const detailSheetNames = Array.isArray(preset.details.sheetName) ? preset.details.sheetName : [preset.details.sheetName]
  const detailSheetName = wb.SheetNames.find(name => {
    const normalized = normalizeText(name)
    return detailSheetNames.some(targetName => normalized === targetName || normalized.includes(targetName))
  })
  if (!detailSheetName) {
    throw new Error(`【エラー】明細シートが見つかりません。期待するシート名: ${detailSheetNames.join(', ')}\n利用可能なシート: ${wb.SheetNames.join(', ')}`)
  }
  console.log(`[Excel Parse] Found detail sheet: "${detailSheetName}" (using preset: ${preset.name})`)
  const detailWs = wb.Sheets[detailSheetName]
  
  // 明細シートから自動でヘッダー行を検出してパース（プリセット情報を渡す）
  // ★セクション定義を渡してセクション数分の合計を検出
  const parseResult = parseDetailsFromHeaderDetectionWithPreset(detailWs, preset, sections)
  const details = parseResult.details

  if (details.length === 0) {
    console.error('[Excel Parse] No details found! Check logs above for header detection.')
    throw new Error(
      '【エラー】明細シートからデータが取得できません。\n' +
      'ヘッダー行に「数量」「単価」「金額」などのキーワードが必要です。\n' +
      'ブラウザのデベロッパーツール（F12）→ Console タブで\n' +
      '[Excel Parse] で始まるログをすべて確認してください。\n' +
      'その内容をお知らせいただければ原因を特定できます。'
    )
  }

  // ★セクション検証（目次シートがある場合）
  if (sections && sections.length > 0) {
    validateSections(details, sections)
  }

  // 小計・消費税・合計を自動検出
  console.log('[Excel Parse] 小計・消費税・合計を自動検出中...')
  const lastDetailRow = parseResult.lastDataRow
  const summary = findSummaryAmounts(detailWs, lastDetailRow)

  // 見つからない場合は明細合計から計算
  const detailsSum = details.reduce((sum, d) => sum + d.amount, 0)
  const finalSubtotal = summary.subtotal ?? detailsSum
  const finalSpecialDiscount = summary.specialDiscount ?? 0
  const finalTaxAmount = summary.taxAmount ?? Math.round((finalSubtotal - finalSpecialDiscount) * 0.1)
  const finalTotalAmount = summary.totalAmount ?? (finalSubtotal - finalSpecialDiscount + finalTaxAmount)

  console.log('[Excel Parse] 最終金額情報:', {
    '小計': finalSubtotal,
    '出精値引き': finalSpecialDiscount,
    '消費税': finalTaxAmount,
    '合計': finalTotalAmount,
    '明細合計': detailsSum
  })

  // ★目次シートの合計値と照合（警告のみ、処理は続行）
  if (indexTotals) {
    console.log('[Excel Parse] === Validating against Index Sheet Totals ===')
    const expectedTotal = indexTotals.wholesaleTotal ?? indexTotals.totalAmount
    if (expectedTotal && Math.abs(finalTotalAmount - expectedTotal) > 100) {
      console.warn(
        `[Excel Parse] ⚠️ Total amount mismatch with index sheet!\n` +
        `  Parsed from details: ${finalTotalAmount}\n` +
        `  Expected from index: ${expectedTotal}\n` +
        `  Difference: ${finalTotalAmount - expectedTotal}`
      )
    } else if (expectedTotal) {
      console.log(`[Excel Parse] ✓ Total amount validated: ${finalTotalAmount} matches index sheet`)
    }
  }

  // ★小計行を除外（明細UIに表示しない）
  const detailsWithoutSubtotals = details.filter(d => !d.section_subtotal)
  console.log(`[Excel Parse] Filtered out ${details.length - detailsWithoutSubtotals.length} subtotal rows`)

  return {
    coverData: {
      customerName,
      subject,
      deliveryPlace,
      deliveryDeadline,
      deliveryTerms,
      validityText,
      paymentTerms,
      estimateDate,
      estimateNo,
      subtotal: finalSubtotal,
      specialDiscount: finalSpecialDiscount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount
    },
    details: detailsWithoutSubtotals,
    sections, // ★目次シートから読み取ったセクション定義
    stampImage,
    fileName
  }
}

// ================================
// 明細抽出（ヘッダー検出版・シンプル実装）
// - ヘッダー行を探してそこから下をパース
// - セクションマーカー（小計・合計）を検出
// ================================
/**
 * プリセット情報を使用して明細をパースする関数
 */
function parseDetailsFromHeaderDetectionWithPreset(
  ws: XLSX.WorkSheet,
  preset: ExcelFormatPreset,
  sections?: SectionDef[]
): { details: ParsedDetail[], lastDataRow: number } {
  const rows: ParsedDetail[] = []
  let lastDataRow = 1

  const allCols: string[] = []
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  console.log(`[Excel Parse] === Header Detection with Preset: ${preset.name} ===`)
  console.log(`[Excel Parse] Expected header row: ${preset.details.headerRow}`)
  console.log(`[Excel Parse] Expected start row: ${preset.details.startRow}`)

  // プリセットで指定されたヘッダー行を使用
  const headerRow = preset.details.headerRow
  const rowContent: { [key: string]: string } = {}
  for (const col of allCols.slice(0, 20)) {  // A-T列まで確認
    const v = normalizeText(getCell(ws, `${col}${headerRow}`))
    if (v) {
      rowContent[col] = v
      console.log(`[Excel Parse] Header cell ${col}${headerRow}: "${v}"`)
    }
  }

  // ヘッダーキーワードに基づいて列を特定
  let colItemName = '', colSpec = '', colQty = '', colUnit = '', colPrice = '', colAmount = ''
  let colWholesale = '', colCostPrice = ''

  for (const [col, val] of Object.entries(rowContent)) {
    // 品名列
    if (!colItemName && preset.details.columns.productName.some(keyword => val.includes(normalizeText(keyword)))) {
      colItemName = col
      console.log(`[Excel Parse] Found productName column: ${col} (keyword matched in "${val}")`)
    }
    // 規格列
    if (!colSpec && preset.details.columns.spec.some(keyword => val.includes(normalizeText(keyword)))) {
      colSpec = col
      console.log(`[Excel Parse] Found spec column: ${col}`)
    }
    // 数量列
    if (!colQty && preset.details.columns.quantity.some(keyword => val.includes(normalizeText(keyword)))) {
      colQty = col
      console.log(`[Excel Parse] Found quantity column: ${col}`)
    }
    // 単位列
    if (!colUnit && preset.details.columns.unit.some(keyword => val.includes(normalizeText(keyword)))) {
      colUnit = col
      console.log(`[Excel Parse] Found unit column: ${col}`)
    }
    // 単価列
    if (!colPrice && preset.details.columns.unitPrice.some(keyword => val.includes(normalizeText(keyword)))) {
      colPrice = col
      console.log(`[Excel Parse] Found unitPrice column: ${col}`)
    }
    // 金額列
    if (!colAmount && preset.details.columns.amount.some(keyword => val.includes(normalizeText(keyword)))) {
      colAmount = col
      console.log(`[Excel Parse] Found amount column: ${col}`)
    }
    // 仕切金額列（オプション）
    if (!colWholesale && preset.details.columns.wholesalePrice && 
        preset.details.columns.wholesalePrice.some(keyword => val.includes(normalizeText(keyword)))) {
      colWholesale = col
      console.log(`[Excel Parse] Found wholesalePrice column: ${col}`)
    }
    // 原価列（オプション）
    if (!colCostPrice && preset.details.columns.costPrice && 
        preset.details.columns.costPrice.some(keyword => val.includes(normalizeText(keyword)))) {
      colCostPrice = col
      console.log(`[Excel Parse] Found costPrice column: ${col}`)
    }
  }

  console.log(`[Excel Parse] Column mapping: itemName=${colItemName}, spec=${colSpec}, qty=${colQty}, unit=${colUnit}, price=${colPrice}, amount=${colAmount}, wholesale=${colWholesale}`)

  if (!colItemName || !colQty || !colPrice || !colAmount) {
    console.error('[Excel Parse] Required columns not found!', { colItemName, colQty, colPrice, colAmount })
    throw new Error(`ヘッダー行 ${headerRow} に必要な列が見つかりません。品名・数量・単価・金額の列が必要です。`)
  }

  // データパース開始
  let currentRow = preset.details.startRow
  let currentSectionName = ''
  let subtotalCount = 0

  console.log(`[Excel Parse] Starting parse from row ${currentRow}`)

  while (currentRow <= preset.details.maxRow) {
    const itemName = normalizeText(getCell(ws, `${colItemName}${currentRow}`))
    const spec = normalizeText(getCell(ws, `${colSpec}${currentRow}`))
    const qty = toNumber(getCell(ws, `${colQty}${currentRow}`))
    const unit = normalizeText(getCell(ws, `${colUnit}${currentRow}`))
    const unitPriceRaw = toNumber(getCell(ws, `${colPrice}${currentRow}`))
    const amountRaw = toNumber(getCell(ws, `${colAmount}${currentRow}`))
    const wholesaleRaw = colWholesale ? toNumber(getCell(ws, `${colWholesale}${currentRow}`)) : null

    // 終了条件チェック
    const shouldStop = preset.details.stopWords.some(word => itemName.includes(word))
    if (shouldStop) {
      console.log(`[Excel Parse] Stop word detected at row ${currentRow}: "${itemName}"`)
      if (itemName.includes('小計') || itemName.includes('小　') || itemName.includes('合計') || itemName.includes('合　')) {
        subtotalCount++
        if (sections && subtotalCount >= sections.length) {
          console.log(`[Excel Parse] All section subtotals detected (${subtotalCount}), stopping parse`)
          lastDataRow = currentRow
          break
        }
      }
      currentRow++
      continue
    }

    // 空行スキップ
    if (!itemName && !spec && qty === null && unitPriceRaw === null) {
      currentRow++
      continue
    }

    // セクション判定（数字+ピリオドで始まる = セクションヘッダー）
    const sectionMatch = itemName.match(/^[0-9０-９]+[.．。]/)
    if (sectionMatch && !qty && !unitPriceRaw) {
      currentSectionName = itemName.replace(sectionMatch[0], '').trim()
      console.log(`[Excel Parse] Section header detected at row ${currentRow}: "${currentSectionName}"`)
      currentRow++
      continue
    }

    // 有効なデータ行
    // 仕切金額のみや金額のみでも取り込む（単価未入力でもOK）
    const hasSomeAmount = (unitPriceRaw !== null && unitPriceRaw !== 0) ||
                          (amountRaw !== null && amountRaw !== 0) ||
                          (wholesaleRaw !== null && wholesaleRaw !== 0)

    if (itemName && hasSomeAmount) {
      const q = qty ?? 1
      let unitPrice = unitPriceRaw ?? 0
      let amount = amountRaw ?? 0
      const wholesale = wholesaleRaw ?? null

      if (wholesale !== null && wholesale > 0) {
        amount = wholesale
        if (!unitPrice && q > 0) unitPrice = Math.round(wholesale / q)
      } else if (!amount) {
        amount = q * unitPrice
      }

      rows.push({
        item_name: itemName,
        spec,
        quantity: q,
        unit: unit || '式',
        unit_price: unitPrice,
        amount,
        cost_price: null,
        wholesale_price: wholesale,
        section_name: currentSectionName || undefined
      })

      lastDataRow = currentRow
      console.log(`[Excel Parse] Row${currentRow}: ${itemName} | qty=${q} | price=${unitPrice} | amount=${amount} | wholesale=${wholesale} | section="${currentSectionName}"`)
    }

    currentRow++
  }

  console.log(`[Excel Parse] Parsing complete. Found ${rows.length} detail rows. Last data row: ${lastDataRow}`)
  return { details: rows, lastDataRow }
}

/**
 * 既存の自動検出関数（後方互換性のため残す）
 */
function parseDetailsFromHeaderDetectionSimple(ws: XLSX.WorkSheet, sections?: SectionDef[]): { details: ParsedDetail[], lastDataRow: number } {
  const rows: ParsedDetail[] = []
  let lastDataRow = 1

  const allCols: string[] = []
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  console.log('[Excel Parse] === Header Detection (Simple) ===')

  // ステップ1: ヘッダー行を探す（最初の30行を探索）
  let headerRow = -1
  let colItemName = '', colSpec = '', colQty = '', colUnit = '', colPrice = '', colAmount = ''
  // 仕切金額（例: I列「貴社仕切金額」）があれば検出
  let colWholesale = ''

  console.log('[Excel Parse] First 30 rows content:')
  for (let dumpRow = 1; dumpRow <= 30; dumpRow++) {
    const rowContent: string[] = []
    for (let i = 0; i < 15; i++) {
      const col = allCols[i]
      const v = normalizeText(getCell(ws, `${col}${dumpRow}`))
      if (v) rowContent.push(`${col}:${v}`)
    }
    if (rowContent.length > 0) {
      console.log(`  Row${dumpRow}: ${rowContent.join(', ')}`)
    }
  }

  // Row2の生セル値を詳細確認
  console.log('[Excel Parse] Row2 Raw Cell Values (Before normalizeText):')
  const row2RawB = getCell(ws, 'B2')
  const row2RawC = getCell(ws, 'C2')
  const row2RawE = getCell(ws, 'E2')
  const row2RawG = getCell(ws, 'G2')
  const row2RawH = getCell(ws, 'H2')
  console.log(`  B2 raw: "${row2RawB}" (type: ${typeof row2RawB})`)
  console.log(`  C2 raw: "${row2RawC}" (type: ${typeof row2RawC})`)
  console.log(`  E2 raw: "${row2RawE}" (type: ${typeof row2RawE})`)
  console.log(`  G2 raw: "${row2RawG}" (type: ${typeof row2RawG})`)
  console.log(`  H2 raw: "${row2RawH}" (type: ${typeof row2RawH})`)

  // normalizeText後
  console.log('[Excel Parse] Row2 After normalizeText:')
  const row2NormB = normalizeText(row2RawB)
  const row2NormC = normalizeText(row2RawC)
  const row2NormE = normalizeText(row2RawE)
  const row2NormG = normalizeText(row2RawG)
  const row2NormH = normalizeText(row2RawH)
  console.log(`  B2 norm: "${row2NormB}"`)
  console.log(`  C2 norm: "${row2NormC}"`)
  console.log(`  E2 norm: "${row2NormE}"`)
  console.log(`  G2 norm: "${row2NormG}"`)
  console.log(`  H2 norm: "${row2NormH}"`)
  console.log(`  B2 includes "名"?`, row2NormB.includes('名'))
  console.log(`  B2 includes "称"?`, row2NormB.includes('称'))
  console.log(`  C2 includes "規"?`, row2NormC.includes('規'))
  console.log(`  E2 includes "数"?`, row2NormE.includes('数'))
  console.log(`  E2 includes "量"?`, row2NormE.includes('量'))
  console.log(`  G2 includes "単"?`, row2NormG.includes('単'))
  console.log(`  G2 includes "価"?`, row2NormG.includes('価'))
  console.log(`  H2 includes "金"?`, row2NormH.includes('金'))
  console.log(`  H2 includes "額"?`, row2NormH.includes('額'))

  for (let r = 1; r <= 30; r++) {
    const rowContent: { [key: string]: string } = {}
    for (const col of allCols.slice(0, 15)) {  // A-O列まで確認
      const v = normalizeText(getCell(ws, `${col}${r}`))
      if (v) rowContent[col] = v
    }

    // ヘッダーキーワードの検出 - スペース除去済み状態で比較
    const values = Object.values(rowContent)
    // セルの値自体がスペース除去済み（normalizeText済み）なので、contains判定が機能する
    const hasName = values.some(v => v.includes('名称') || v.includes('品名') || v.includes('名') || v.includes('品'))
    const hasQty = values.some(v => v.includes('数量'))
    const hasPrice = values.some(v => v.includes('単価') || v.includes('価格'))
    const hasAmount = values.some(v => v.includes('金額') || v.includes('額') || v.includes('金'))
    // 仕切列の存在は必須にしない（任意）

    // デバッグ：Row2の場合、詳細ログ
    if (r === 2) {
      console.log('[Excel Parse] Row2 detailed content:', rowContent)
      console.log('[Excel Parse] Row2 values:', values)
      console.log('[Excel Parse] Checking Row2:')
      values.forEach((v, idx) => {
        console.log(`  [${idx}] "${v}" | 名称?${v.includes('名称')} 品名?${v.includes('品名')} 名?${v.includes('名')} 品?${v.includes('品')}`)
      })
    }

    console.log(`[Excel Parse] Row${r} check: hasName=${hasName}, hasQty=${hasQty}, hasPrice=${hasPrice}, hasAmount=${hasAmount}`)

    if (hasName && hasQty && hasPrice && hasAmount) {
      headerRow = r
      // 列位置を特定
      for (const [col, val] of Object.entries(rowContent)) {
        if (!colItemName && (val.includes('名称') || val.includes('品名') || val.includes('名') || val.includes('品'))) colItemName = col
        if (!colSpec && (val.includes('規格') || val.includes('寸法'))) colSpec = col
        if (!colQty && val.includes('数量')) colQty = col
        if (!colUnit && val.includes('単位')) colUnit = col
        if (!colPrice && (val.includes('単価') || val.includes('価格'))) colPrice = col
        if (!colAmount && (val.includes('金額') || val.includes('額') || val.includes('金'))) colAmount = col
        // 仕切金額（例: "貴社仕切金額"、"仕切金額" など）を検出
        if (!colWholesale && (val.includes('仕切') || val.includes('特価'))) colWholesale = col
      }
      console.log(`[Excel Parse] ✓ Header found at Row${r}:`, { colItemName, colSpec, colQty, colUnit, colPrice, colAmount, colWholesale })
      break
    }
  }

  if (headerRow === -1) {
    console.error('[Excel Parse] Header row not found in first 30 rows')
    throw new Error('ヘッダー行が見つかりません（最初の30行内に「名称」「数量」「単価」「金額」が必要です）')
  }

  // ステップ2: ヘッダー下からデータをパース
  let currentRow = headerRow + 1
  let currentSectionName = ''  // 現在のセクション名を追跡
  let subtotalCount = 0  // ★セクション合計の数をカウント
  console.log(`[Excel Parse] Starting parse from row ${currentRow}`)
  console.log(`[Excel Parse] Section definitions from index sheet:`)
  sections?.forEach((sec, idx) => {
    console.log(`  [${idx}] ${sec.name}`)
  })

  while (currentRow <= 300) {
    const itemName = normalizeText(getCell(ws, `${colItemName}${currentRow}`))
    const spec = normalizeText(getCell(ws, `${colSpec}${currentRow}`))
    const qty = toNumber(getCell(ws, `${colQty}${currentRow}`))
    const unit = normalizeText(getCell(ws, `${colUnit}${currentRow}`))
    const unitPriceRaw = toNumber(getCell(ws, `${colPrice}${currentRow}`))
    const amountRaw = toNumber(getCell(ws, `${colAmount}${currentRow}`))
    const wholesaleRaw = colWholesale ? toNumber(getCell(ws, `${colWholesale}${currentRow}`)) : null

    // ★セクションマーカー判定
    // 「小計」または「合計」を検出（セクション終了マーカー）
    const isSubtotal = itemName.includes('小計') || itemName.includes('小　') || itemName.includes('合計') || itemName.includes('合　')
    const isFinalTotal = itemName.includes('総合計')  // 最終合計は別

    if (isSubtotal && !isFinalTotal) {
      // 小計/セクション合計行：目次シートから取得したセクション名を使用
      const subtotalAmount = amountRaw ?? wholesaleRaw ?? 0
      const sectionDef = sections?.[subtotalCount]  // ★現在のセクション定義を取得
      const sectionName = sectionDef?.name || `セクション${subtotalCount + 1}`  // ★目次から取得したセクション名を使用
      
      console.log(`[Excel Parse] Section subtotal at Row${currentRow}: "${itemName}" amount=${subtotalAmount} -> section="${sectionName}" (subtotal #${subtotalCount + 1})`)
      
      if (sectionName && subtotalAmount > 0) {
        rows.push({
          item_name: itemName,
          spec: '',
          unit: '',
          quantity: 0,
          unit_price: 0,
          amount: 0,
          section_name: sectionName,
          section_subtotal: subtotalAmount
        })
      }
      subtotalCount++
      currentRow++
      continue
    }

    // ★セクション名割り当て：目次から取得したセクション定義を使用
    // 現在のセクション番号は subtotalCount に基づく
    const assignedSectionName = sections?.[subtotalCount]?.name || ''

    const hasData = itemName || qty || unitPriceRaw || amountRaw || wholesaleRaw
    if (!hasData) {
      currentRow++
      continue
    }

    // ★品名がない場合はスキップ
    if (!itemName) {
      currentRow++
      continue
    }

    // ★最小限の条件：単価・金額・仕切のいずれかが存在（数量は未入力なら1で補完）
    if ((unitPriceRaw === null || unitPriceRaw === 0) && (amountRaw === null || amountRaw === 0) && (wholesaleRaw === null || wholesaleRaw === 0)) {
      currentRow++
      continue
    }

    const q = qty ?? 1
    // 仕切金額があればそれを金額優先、単価は仕切金額/数量で再算出
    let up = unitPriceRaw ?? 0
    let am = amountRaw ?? 0
    let wholesale = wholesaleRaw ?? null
    if (wholesale !== null && wholesale > 0) {
      am = wholesale
      if (q > 0) up = Math.round(wholesale / q)
    } else {
      // 仕切なしの場合は通常金額 or 再計算
      if (am === 0) am = q * up
    }

    console.log(`[Excel Parse] Row${currentRow}: "${itemName}" qty=${q} price=${up} amount=${am}${wholesale ? ` (wholesale=${wholesale})` : ''}${assignedSectionName ? ` [${assignedSectionName}]` : ''}`)

    rows.push({
      item_name: itemName,
      spec,
      unit,
      quantity: q,
      unit_price: up,
      amount: am,
      cost_price: null,
      cost_amount: null,
      gross_margin: null,
      wholesale_price: wholesale,
      section_name: assignedSectionName || undefined
    })

    lastDataRow = currentRow
    currentRow++
  }

  console.log(`[Excel Parse] Parsed ${rows.length} items from header detection`)
  return { details: rows, lastDataRow }
}

// ================================
// API
// ================================
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const presetId = form.get('presetId') as string | null
    const mode = form.get('mode') as string | null  // 'preview' or 'import'
    const mappingsStr = form.get('_mappings') as string | null  // クライアント側のマッピング情報
    
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'file がありません' }, { status: 400 })
    }

    // マッピング情報をパース
    let mappings: Record<string, string> = {}
    if (mappingsStr) {
      try {
        mappings = JSON.parse(mappingsStr)
        console.log('[Import Excel] Received cell mappings:', Object.keys(mappings))
      } catch (e) {
        console.warn('[Import Excel] Failed to parse mappings:', e)
      }
    }

    // Excel読み込み
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellStyles: false })

    // ★プリセット決定
    let preset: ExcelFormatPreset
    if (presetId && presetId !== 'auto') {
      preset = getPresetById(presetId) || DEFAULT_PRESET
      console.log(`[Import Excel] 手動プリセット選択: ${preset.name}`)
    } else {
      preset = detectPreset(wb)
      console.log(`[Import Excel] 自動プリセット判定: ${preset.name}`)
    }

    // ★プレビューモード：生データを返す
    if (mode === 'preview') {
      return handlePreviewMode(wb, preset)
    }

    // 印章画像を抽出
    const stampImage = extractStampImage(wb)

    // ★複数シート処理を実行（プリセット情報を渡す）
    console.log('[Import Excel] Sheet names:', wb.SheetNames)
    let processResult: SheetProcessResult
    
    try {
      // 表紙・明細の複数シート構成に対応
      processResult = processMultiSheetWorkbook(wb, file.name, stampImage, preset)
      console.log('[Import Excel] Multi-sheet processing succeeded')
    } catch (multiSheetErr: any) {
      console.error('[Import Excel] Multi-sheet processing failed:', multiSheetErr)
      console.log('[Import Excel] Sheet names available:', wb.SheetNames)
      console.log('[Import Excel] Sheet name details:', wb.SheetNames.map((n, i) => `Sheet[${i}]="${n}"`))
      console.log('[Import Excel] Falling back to single sheet processing...')
      
      // フォールバック：単一シート処理（プリセット対応）
      // フォールバック時でも可能な限り「明細」系シートを優先
      const candidateNames = Array.isArray(preset.details.sheetName)
        ? preset.details.sheetName
        : [preset.details.sheetName]
      const pickDetailSheet = wb.SheetNames.find(n => {
        const norm = normalizeText(n)
        return candidateNames.some(c => norm.includes(normalizeText(c))) ||
               norm.includes('明細') || norm.includes('見積明細') || norm.includes('詳細')
      }) || wb.SheetNames[0]

      if (!pickDetailSheet) throw new Error('シートが見つかりません')
      console.log(`[Import Excel] Using fallback (single sheet) with preset: ${preset.name}, sheet: ${pickDetailSheet}`)
      const ws = wb.Sheets[pickDetailSheet]

      // ★プリセット対応のパース関数を使用
      let details: ParsedDetail[] = []
      let lastDetailRow = 1
      
      try {
        const parseResult = parseDetailsFromHeaderDetectionWithPreset(ws, preset)
        details = parseResult.details
        lastDetailRow = parseResult.lastDataRow
        console.log(`[Import Excel] Preset-based parsing returned ${details.length} items`)
      } catch (presetErr) {
        console.error('[Import Excel] Preset-based parsing failed:', presetErr)
        console.log('[Import Excel] Trying old simple header detection...')
        // 旧関数にフォールバック
        try {
          const parseResult = parseDetailsFromHeaderDetectionSimple(ws)
          details = parseResult.details
          lastDetailRow = parseResult.lastDataRow
          console.log(`[Import Excel] Simple header detection returned ${details.length} items`)
        } catch (simpleErr) {
          console.error('[Import Excel] Simple header detection also failed:', simpleErr)
          console.log('[Import Excel] Falling back to fixed position parsing...')
          // 固定位置パースにフォールバック
          const parseResult = parseDetails(ws)
          details = parseResult.details
          lastDetailRow = parseResult.lastDataRow
          console.log(`[Import Excel] Fixed position parseDetails returned ${details.length} items`)
        }
      }
      
      if (details.length === 0) {
        const errMsg = '明細が0件です。Excel ファイルに品名・数量・単価などの正しい明細データが含まれているか、フォーマットを確認してください。\n\nブラウザコンソールのログを確認してください。'
        throw new Error(errMsg)
      }

      const customerName = findValueFromCells(ws, preset.cover.customerName) || findCustomerName(ws) || ''
      const subject = findValueFromCells(ws, preset.cover.subject) || findSubject(ws) || ''
      const deliveryPlace = findValueFromCells(ws, preset.cover.deliveryPlace) || findLabelValue(ws, ['受渡場所', '納入場所', '受渡し場所'])
      const deliveryDeadline = findValueFromCells(ws, preset.cover.deliveryDeadline) || findLabelValue(ws, ['受渡期限', '納期', '納入期限', '受渡し期限'])
      const deliveryTerms = findValueFromCells(ws, preset.cover.deliveryTerms) || findLabelValue(ws, ['受渡条件', '納入条件', '受渡し条件'])
      const validityText = findValueFromCells(ws, preset.cover.validityText) || findLabelValue(ws, ['有効期限', '本書有効期限', '見積有効期限'])
      const paymentTerms = findValueFromCells(ws, preset.cover.paymentTerms) || findLabelValue(ws, ['支払条件', '支払方法', '決済条件'])
      let estimateDate = findEstimateDate(ws)
      let estimateNo = findEstimateNo(ws)

      // ★マッピング情報がある場合、複数セル値を優先的に取得
      if (mappings && Object.keys(mappings).length > 0) {
        console.log('[Import Excel] Extracting multi-cell mapped values...')
        console.log('[Import Excel] Full mappings object:', mappings)
        
        // 表紙シートを取得（webpackの第一シートを表紙と仮定）
        const coverSheetName = wb.SheetNames[0]
        const coverWs = wb.Sheets[coverSheetName]
        
        if (mappings.estimateDateCell) {
          const cellAddrs = String(mappings.estimateDateCell || '').trim()
          console.log(`[Import Excel] estimateDateCell raw value: "${cellAddrs}"`)
          
          // ★日付の場合、データ部分（数値）だけを抽出
          const mappedDate = extractMultipleCellValues(coverWs, cellAddrs, true)
          console.log(`[Import Excel] estimateDateCell extracted (numbers only): "${mappedDate}"`)
          
          if (mappedDate) {
            // ★抽出した数値を日付フォーマットに変換（例: "2025930" → "2025-09-30"）
            let formattedDate = mappedDate
            
            // 8桁の数字と仮定（YYYYMMDD形式）
            if (/^\d{8}$/.test(mappedDate)) {
              const yyyy = mappedDate.slice(0, 4)
              const mm = mappedDate.slice(4, 6)
              const dd = mappedDate.slice(6, 8)
              formattedDate = `${yyyy}-${mm}-${dd}`
              console.log(`[Import Excel] Formatted date from YYYYMMDD: "${mappedDate}" → "${formattedDate}"`)
            }
            // 4+1+1+1+2 = 9文字（年数字 + 月数字 + 日数字の場合）
            else if (/^\d{4}\d{1,2}\d{1,2}$/.test(mappedDate)) {
              const yyyy = mappedDate.slice(0, 4)
              const mm = mappedDate.slice(4, mappedDate.length - 2).padStart(2, '0')
              const dd = mappedDate.slice(-2).padStart(2, '0')
              formattedDate = `${yyyy}-${mm}-${dd}`
              console.log(`[Import Excel] Formatted date from flexible YYYY M D: "${mappedDate}" → "${formattedDate}"`)
            } else {
              const parsedDate = formatDateValue(mappedDate)
              if (parsedDate) {
                formattedDate = parsedDate
              }
            }
            
            estimateDate = formattedDate
            console.log(`[Import Excel] estimateDate final: "${estimateDate}"`)
          }
        }
        
        if (mappings.estimateNumberCell) {
          const cellAddrs = String(mappings.estimateNumberCell || '').trim()
          console.log(`[Import Excel] estimateNumberCell raw value: "${cellAddrs}"`)
          const mappedNo = extractMultipleCellValues(coverWs, cellAddrs, false)
          console.log(`[Import Excel] estimateNumberCell extracted: "${mappedNo}"`)
          if (mappedNo) {
            console.log(`[Import Excel] estimateNumberCell mapped: "${cellAddrs}" → "${mappedNo}"`)
            estimateNo = mappedNo
          }
        }
      }

      const summary = findSummaryAmounts(ws, lastDetailRow)
      const detailsSum = details.reduce((sum, d) => sum + d.amount, 0)
      const finalSubtotal = summary.subtotal ?? detailsSum
      const finalSpecialDiscount = summary.specialDiscount ?? 0
      const finalTaxAmount = summary.taxAmount ?? Math.round((finalSubtotal - finalSpecialDiscount) * 0.1)
      const finalTotalAmount = summary.totalAmount ?? (finalSubtotal - finalSpecialDiscount + finalTaxAmount)

      processResult = {
        coverData: {
          customerName,
          subject,
          deliveryPlace,
          deliveryDeadline,
          deliveryTerms,
          validityText,
          paymentTerms,
          estimateDate,
          estimateNo,
          subtotal: finalSubtotal,
          specialDiscount: finalSpecialDiscount,
          taxAmount: finalTaxAmount,
          totalAmount: finalTotalAmount
        },
        details,
        stampImage,
        fileName: file.name
      }
    }

    // ★★★ Supabaseでの顧客照合のみ実施（登録はしない） ★★★
    const sb = getAdminClient()
    
    // 顧客の存在確認
    console.log('[Import Excel] coverData.customerName:', processResult.coverData?.customerName)
    const customerName = normalizeText(processResult.coverData.customerName)
    if (!customerName) throw new Error('顧客名が取得できません')

    const exact = await sb.from('customers').select('id,name').eq('name', customerName).limit(1)
    if (exact.error) throw exact.error
    
    let customerId = null
    let customerStatus = 'new'  // new | existing
    
    if (exact.data?.length) {
      customerId = exact.data[0].id
      customerStatus = 'existing'
    } else {
      const partial = await sb.from('customers').select('id,name').ilike('name', `%${customerName}%`).limit(1)
      if (partial.error) throw partial.error
      if (partial.data?.length) {
        customerId = partial.data[0].id
        customerStatus = 'existing'
      }
    }

    // ★★★ DBには登録せず、解析結果のみ返す ★★★
    return NextResponse.json({
      ok: true,
      parsed: true,  // 解析済みフラグ
      customerName,
      customerId,
      customerStatus,
      subject: processResult.coverData.subject,
      estimateDate: processResult.coverData.estimateDate,
      estimateNo: processResult.coverData.estimateNo,
      deliveryPlace: processResult.coverData.deliveryPlace,
      deliveryDeadline: processResult.coverData.deliveryDeadline,
      deliveryTerms: processResult.coverData.deliveryTerms,
      validityText: processResult.coverData.validityText,
      paymentTerms: processResult.coverData.paymentTerms,
      subtotal: processResult.coverData.subtotal,
      specialDiscount: processResult.coverData.specialDiscount,
      taxAmount: processResult.coverData.taxAmount,
      totalAmount: processResult.coverData.totalAmount,
      details: processResult.details,
      stampImage: processResult.stampImage,
      fileName: processResult.fileName
    })
  } catch (e: any) {
    console.error('[Import Excel] Error:', {
      message: e?.message,
      code: e?.code,
      status: e?.status,
      details: e?.details,
      stack: e?.stack
    })
    
    const errorMsg = e?.message ?? 'unknown error'
    const displayMsg = errorMsg.includes('Invalid API key') 
      ? '【認証エラー】Service Role Keyが無効です。.env.localを確認してください。'
      : errorMsg
    
    return NextResponse.json(
      { 
        ok: false, 
        message: displayMsg, 
        detail: String(e),
        fullError: e 
      },
      { status: 500 }
    )
  }
}
// ================================
// プレビューモード：ユーザーが列をマッピングするためのデータを返す
// ================================
function handlePreviewMode(wb: XLSX.WorkBook, preset: ExcelFormatPreset) {
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = [...colNames]
  for (const first of colNames) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  // ヘルパー関数：シートからデータを取得
  const getSheetRows = (ws: XLSX.WorkSheet, maxRow: number = 60) => {
    const rows: { rowNum: number; cells: { col: string; value: string }[] }[] = []
    
    for (let r = 1; r <= maxRow; r++) {
      const cells: { col: string; value: string }[] = []
      for (const col of allCols.slice(0, 48)) { // A～AV列まで
        const cell = ws[col + String(r)]
        const val = cell ? String(cell.v ?? '') : ''
        if (val.trim()) {
          cells.push({ col, value: val })
        }
      }
      if (cells.length > 0) {
        rows.push({ rowNum: r, cells })
      }
    }
    return rows
  }

  // 表紙シート（または最初のシート）のデータ
  const coverSheetName = wb.SheetNames[0]
  const coverWs = wb.Sheets[coverSheetName]
  const coverRows = getSheetRows(coverWs, 40) // 表紙は40行まで

  // 明細シート名を検索
  const detailSheetNames = Array.isArray(preset.details.sheetName) 
    ? preset.details.sheetName 
    : [preset.details.sheetName]
  
  const detailSheetName = wb.SheetNames.find(name => 
    detailSheetNames.some(pattern => name.includes(pattern))
  ) || wb.SheetNames[0]
  
  const detailWs = wb.Sheets[detailSheetName]
  const detailRows = getSheetRows(detailWs, 60) // 明細は60行まで

  return NextResponse.json({
    ok: true,
    mode: 'preview',
    sheetNames: wb.SheetNames,
    preset: {
      id: preset.id,
      name: preset.name
    },
    sheets: [
      {
        name: coverSheetName,
        type: 'cover',
        rows: coverRows.slice(0, 40)
      },
      {
        name: detailSheetName,
        type: 'detail',
        rows: detailRows.slice(0, 50)
      }
    ],
    // 後方互換性のため、明細シートをデフォルトで返す
    sheetName: detailSheetName,
    rows: detailRows.slice(0, 50)
  })
}