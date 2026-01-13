import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// ================================
// Excel（縦見積書）セル位置（添付に合わせ）
// ================================
const CELL = {
  customerName: 'D8',
  subject: 'K27',
  deliveryPlace: 'K29',
  deliveryDeadline: 'K31',
  deliveryTerms: 'K33',
  validityText: 'K35',
  paymentTerms: 'K37',
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
  return String(v ?? '').replace(/\u3000/g, ' ').trim()
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
    grossMargin: null as string | null
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
    if (valueLower.includes('原価') || valueLower.includes('粗利') || valueLower.includes('定価')) {
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
  }

  console.log('[Excel Parse] 列検出結果:', columns)
  return columns
}

// ================================
// 見積日を探索（ラベル「見積日」「作成日」「発行日」などの右隣セルを優先）
// 複数セルにまたがる日付にも対応（2025 年 9 月 1 日）
// ================================
function findEstimateDate(ws: XLSX.WorkSheet): string | null {
  const colNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const allCols: string[] = []
  allCols.push(...colNames)
  for (const first of ['A', 'B', 'C']) {
    for (const second of colNames) {
      allCols.push(first + second)
    }
  }

  const targetRows = Array.from({ length: 56 }, (_, i) => i + 5) // 5〜60行目あたりを探索

  console.log('[Excel Parse] 見積日の探索を開始します...')

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

  // 上部エリアを優先的に探索（3〜12行）
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
          console.log(`[Excel Parse] 見積番号検出: Row${row} ${allCols[start]}~${allCols[start+width-1]} => "${candidate}"`)
          return candidate
        }
      }
    }
  }

  console.log('[Excel Parse] 見積番号が見つかりませんでした')
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
}

function parseDetails(ws: XLSX.WorkSheet): { details: ParsedDetail[], lastDataRow: number } {
  const rows: ParsedDetail[] = []
  let lastIdx = -1
  let lastDataRow = DETAIL.startRow - 1

  // 原価列を動的検出（40行目のヘッダーから）
  const costColumns = findColumnsByHeader(ws, 40)

  // デバッグ：ヘッダ行と最初の数行をログ出力
  console.log('[Excel Parse] Scanning details from row', DETAIL.startRow)
  
  for (let r = DETAIL.startRow; r <= DETAIL.maxRow; r++) {
    const itemName = normalizeText(getCell(ws, colRow('D', r)))
    const spec = normalizeText(getCell(ws, colRow('N', r)))
    const qty = toNumber(getCell(ws, colRow('X', r)))
    const unit = normalizeText(getCell(ws, colRow('AB', r)))
    const unitPrice = toNumber(getCell(ws, colRow('AE', r)))
    const amount = toNumber(getCell(ws, colRow('AJ', r)))
    
    // 原価情報を動的列から取得
    const costPrice = costColumns.costPrice ? toNumber(getCell(ws, colRow(costColumns.costPrice, r))) : null
    const costAmount = costColumns.costAmount ? toNumber(getCell(ws, colRow(costColumns.costAmount, r))) : null
    const grossMargin = costColumns.grossMargin ? toNumber(getCell(ws, colRow(costColumns.grossMargin, r))) : null

    // デバッグ：最初の10行を出力
    if (r <= DETAIL.startRow + 10) {
      console.log(`[Excel Parse] Row ${r}:`, {
        'D:品名': itemName,
        'N:規格': spec,
        'X:数量': qty,
        'AB:単位': unit,
        'AE:単価': unitPrice,
        'AJ:金額': amount,
        [`${costColumns.costPrice}:原価単価`]: costPrice,
        [`${costColumns.costAmount}:原価金額`]: costAmount,
        [`${costColumns.grossMargin}:粗利率`]: grossMargin
      })
    }

    if (DETAIL.stopWords.includes(itemName as any)) {
      console.log(`[Excel Parse] Stop word detected at row ${r}: "${itemName}"`)
      break
    }

    const hasAny =
      itemName !== '' || spec !== '' || qty !== null || unit !== '' || unitPrice !== null || amount !== null
    if (!hasAny) continue

    // 継続行：品名なし・規格だけ（数量/単価は空 or 0）
    const looksLikeContinuation =
      itemName === '' && spec !== '' && (qty === null || qty === 0) && unit === '' && (unitPrice === null || unitPrice === 0)

    if (looksLikeContinuation && lastIdx >= 0) {
      rows[lastIdx].spec = rows[lastIdx].spec ? `${rows[lastIdx].spec}\n${spec}` : spec
      continue
    }

    // 明細として成立する最低条件：品名あり
    if (itemName === '') continue

    // 数量か単価のどちらかが空・0の場合は明細として扱わない
    if (qty === null || qty === 0 || unitPrice === null || unitPrice === 0) {
      console.log(`[Excel Parse] Row ${r} skipped (qty or unitPrice missing): "${itemName}"`)
      continue
    }

    const q = qty
    const up = unitPrice
    const am = amount ?? q * up

    rows.push({
      item_name: itemName,
      spec,
      unit,
      quantity: q,
      unit_price: up,
      amount: am,
      cost_price: costPrice,
      cost_amount: costAmount,
      gross_margin: grossMargin
    })
    lastIdx = rows.length - 1
    lastDataRow = r  // 最終明細行を記録
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
// API
// ================================
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'file がありません' }, { status: 400 })
    }

    // Excel読み込み
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellStyles: false })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('シートが見つかりません')
    const ws = wb.Sheets[sheetName]

    // 印章画像を抽出
    const stampImage = extractStampImage(wb)

    // 明細抽出
    const parseResult = parseDetails(ws)
    const details = parseResult.details
    const lastDataRow = parseResult.lastDataRow
    
    if (details.length === 0) {
      const errMsg = '明細が0件です（41行目以降にデータが見つかりません）。\n' +
        'セル配置を確認してください：\n' +
        '- D列：品名\n' +
        '- N列：規格\n' +
        '- X列：数量\n' +
        '- AB列：単位\n' +
        '- AE列：単価\n' +
        '- AJ列：金額\n' +
        'ブラウザコンソールのログを確認してください。'
      throw new Error(errMsg)
    }

    // 実際の最終明細行を使用（推定ではなく実測）
    const lastDetailRow = lastDataRow

    // ヘッダ抽出
    const customerName = normalizeText(getCell(ws, CELL.customerName))
    const subject = normalizeText(getCell(ws, CELL.subject))
    const deliveryPlace = normalizeText(getCell(ws, CELL.deliveryPlace))
    const deliveryDeadline = normalizeText(getCell(ws, CELL.deliveryDeadline))
    const deliveryTerms = normalizeText(getCell(ws, CELL.deliveryTerms))
    const validityText = normalizeText(getCell(ws, CELL.validityText))
    const paymentTerms = normalizeText(getCell(ws, CELL.paymentTerms))
    const estimateDate = findEstimateDate(ws)
    const estimateNo = findEstimateNo(ws)

    // 小計・消費税・合計を自動検出
    console.log('[Excel Parse] 小計・消費税・合計を自動検出中...')
    const summary = findSummaryAmounts(ws, lastDetailRow)

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

    // ★★★ Supabaseでの顧客照合のみ実施（登録はしない） ★★★
    const sb = getAdminClient()
    
    // 顧客の存在確認
    const name = normalizeText(customerName)
    if (!name) throw new Error('顧客名が空です（D8）')

    const exact = await sb.from('customers').select('id,name').eq('name', name).limit(1)
    if (exact.error) throw exact.error
    
    let customerId = null
    let customerStatus = 'new'  // new | existing
    
    if (exact.data?.length) {
      customerId = exact.data[0].id
      customerStatus = 'existing'
    } else {
      const partial = await sb.from('customers').select('id,name').ilike('name', `%${name}%`).limit(1)
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
      subject,
      estimateDate,
      estimateNo,
      deliveryPlace,
      deliveryDeadline,
      deliveryTerms,
      validityText,
      paymentTerms,
      subtotal: finalSubtotal,
      specialDiscount: finalSpecialDiscount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      details: details,
      stampImage,  // Base64エンコードされた画像
      fileName: file.name
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
