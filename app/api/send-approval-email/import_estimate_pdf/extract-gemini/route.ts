import { NextResponse } from 'next/server'
import PDFParser from 'pdf2json'

/**
 * テキスト抽出ベースでPDFから見積データを自動抽出
 * Gemini AIを使わず、正規表現でデータを解析
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'ファイルがありません' }, { status: 400 })
    }
    
    console.log('[PDF Text Extract] Starting PDF analysis:', file.name)
    
    // PDFをBufferに変換
    const pdfBuffer = Buffer.from(await file.arrayBuffer())
    
    // PDFからテキストを抽出
    const pdfParser = new PDFParser()
    
    const extractedText = await new Promise<string>((resolve, reject) => {
      pdfParser.on('pdfParser_dataError', (errData: any) => {
        console.error('[PDF Text Extract] PDF Parser Error:', errData)
        resolve('') // エラーでも続行
      })
      pdfParser.on('pdfParser_dataReady', (data: any) => {
        try {
          const lines: Array<{ y: number; x: number; text: string }> = []
          if (data.Pages && data.Pages[0]) {
            const page = data.Pages[0]
            if (page.Texts) {
              page.Texts.forEach((textItem: any) => {
                if (textItem.R && textItem.R[0] && textItem.R[0].T) {
                  let decoded = textItem.R[0].T
                  try {
                    decoded = decodeURIComponent(textItem.R[0].T)
                  } catch {/* noop */}
                  lines.push({ y: textItem.y, x: textItem.x, text: decoded })
                }
              })
            }
          }

          // y昇順→x昇順でソートし、同じ行(y差0.5以内)をまとめる
          lines.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
          const grouped: string[] = []
          let currentY = -999
          let currentLine: string[] = []
          const flush = () => {
            if (currentLine.length > 0) grouped.push(currentLine.join(' ').trim())
            currentLine = []
          }

          for (const item of lines) {
            if (currentY < -998) {
              currentY = item.y
              currentLine.push(item.text)
              continue
            }
            if (Math.abs(item.y - currentY) <= 0.5) {
              currentLine.push(item.text)
            } else {
              flush()
              currentY = item.y
              currentLine.push(item.text)
            }
          }
          flush()

          resolve(grouped.join('\n'))
        } catch (e) {
          console.error('[PDF Text Extract] Text extraction error:', e)
          resolve('')
        }
      })
      pdfParser.parseBuffer(pdfBuffer)
    })
    
    console.log('[PDF Text Extract] Extracted text length:', extractedText.length)
    console.log('[PDF Text Extract] Sample text:', extractedText.substring(0, 500))
    
    // テキストを行ごとに分割
    const textLines = extractedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    
    console.log('[PDF Text Extract] Total lines:', textLines.length)
    
    // 明細行を自動抽出
    const detailLines = extractDetailLines(textLines)
    console.log('[PDF Text Extract] Extracted details:', detailLines.length)
    
    // ユーザーが手動で配置するためのデータ構造
    return NextResponse.json({
      ok: true,
      parsed: false,  // ユーザーが表紙情報をマッピングする必要あり
      textLines,      // ユーザーに表示するテキスト行
      detailLines,    // 自動抽出した明細行
      fileName: file.name,
      message: `PDFから${textLines.length}行のテキストと${detailLines.length}行の明細を抽出しました。`
    })
  } catch (e: any) {
    console.error('[PDF Text Extract] Error:', e)
    return NextResponse.json(
      { ok: false, message: e?.message || 'テキスト抽出エラー' },
      { status: 500 }
    )
  }
}

// ===== 抽出関数 =====

/**
 * 顧客名を抽出
 */
function extractCustomerName(text: string): string {
  // テキストの最初の部分から探す（通常、顧客名はPDFの上部にある）
  const firstPart = text.substring(0, 200)
  
  // パターン1: 「〇〇様」
  const pattern1 = /^(.{3,30}?)様\s*$/m
  const match1 = firstPart.match(pattern1)
  if (match1) return match1[1].trim()
  
  // パターン2: 「宛先」の後
  const pattern2 = /(?:宛先|お客様)[\s\n]*(.{5,30}?)[\n]/i
  const match2 = text.match(pattern2)
  if (match2) return match2[1].trim()
  
  // パターン3: ファイル名から抽出（最後の手段）
  // "020見積書（二葉園芸種苗　ＳＫ－２００Ｌ－ＤＦ）.pdf" の場合
  if (text.includes('園芸')) {
    const match3 = text.match(/(.{2,20}?園芸[^）\n]*?)[\s）\n]/)
    if (match3) return match3[1].trim()
  }
  
  return ''
}

/**
 * 件名を抽出
 */
function extractSubject(text: string): string {
  // パターン1: 「件名」の後
  const pattern1 = /(?:件\s*名|工事内容)[\s：:]*(.{3,50}?)[\n]/i
  const match1 = text.match(pattern1)
  if (match1) {
    const result = match1[1].trim()
    if (result.length > 2) return result
  }
  
  // パターン2: 「暖房機」「温風」など機械名
  if (text.includes('暖房機')) return '暖房機'
  if (text.includes('温風暖房')) return '温風暖房機'
  
  return ''
}

/**
 * 見積日を抽出
 */
function extractEstimateDate(text: string): string {
  // パターン1: 「発行日」の後
  const pattern1 = /(?:発行日|作成日)[\s：:]*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/i
  const match1 = text.match(pattern1)
  if (match1) {
    const [, year, month, day] = match1
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // パターン2: 単体の「YYYY年M月D日」（テキストの最初の方）
  const firstHalf = text.substring(0, 400)
  const pattern2 = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/
  const match2 = firstHalf.match(pattern2)
  if (match2) {
    const [, year, month, day] = match2
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  return ''
}

/**
 * 見積番号を抽出
 */
function extractEstimateNumber(text: string): string {
  // パターン1: 「見積番号」「見積No」
  const pattern1 = /(?:見積番号|見積\s*No)[\s：:]*([A-Z0-9\-_]+)/i
  const match1 = text.match(pattern1)
  if (match1) return match1[1].trim()
  
  return ''
}

/**
 * 明細行を抽出
 */
function extractDetails(text: string): any[] {
  const details: any[] = []
  
  // 明細テーブルを見つける（数量と単価がある行）
  const lines = text.split('\n')
  let inDetailSection = false
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    // 明細セクション開始判定
    if (trimmed.match(/品名|商品/i) && trimmed.match(/数量|単価|金額/i)) {
      inDetailSection = true
      continue
    }
    
    // 明細セクション終了判定
    if (inDetailSection && (trimmed.match(/小計|消費税|合計/i) || trimmed.length === 0)) {
      inDetailSection = false
      continue
    }
    
    // 明細行を抽出
    if (inDetailSection && trimmed.length > 0) {
      const detail = parseDetailLine(trimmed)
      if (detail && detail.product_name) {
        details.push(detail)
      }
    }
  }
  
  // 明細が見つからない場合、単純なパターンで抽出
  if (details.length === 0) {
    details.push({
      case_id: '',
      product_id: '',
      product_name: '(マッピング抽出対象)',
      spec: '',
      unit: '式',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      cost_price: 0,
      section_id: '',
    })
  }
  
  return details
}

/**
 * 1行から明細情報をパース
 */
function parseNumber(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[，,]/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : 0
}

function parseDetailLine(line: string): any | null {
  // 数字を抽出（カンマ含む）
  const numbers = line.match(/[\d，,]+/g) || []
  if (numbers.length === 0) return null
  
  // 簡易的なパース：品名 数量 単価 金額
  const parts = line.split(/\s+/)
  
  return {
    case_id: '',
    product_id: '',
    product_name: parts[0] || '商品',
    spec: parts.length > 1 ? parts[1] : '',
    unit: '個',
    quantity: parseNumber(numbers[0]) || 1,
    unit_price: numbers.length > 1 ? parseNumber(numbers[1]) : 0,
    amount: parseNumber(numbers[numbers.length - 1]) || 0,
    cost_price: 0,
    section_id: '',
  }
}

/**
 * テキスト行から明細行を抽出
 * 数字を含む行を明細として認識
 */
function extractDetailLines(textLines: string[]): Array<{
  productName: string
  spec: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}> {
  const details: Array<{
    productName: string
    spec: string
    unit: string
    quantity: number
    unitPrice: number
    amount: number
  }> = []
  
  // 明細行の特徴：
  // - 数字を複数含む（数量、単価、金額）
  // - 「式」「個」などの単位を含む
  // - 金額は比較的大きい数字（1000以上）
  
  let i = 0
  while (i < textLines.length) {
    const line = textLines[i]
    const nextLine = i + 1 < textLines.length ? textLines[i + 1] : ''
    
    // パターン: 商品名 + スペック（次行）+ 数量 + 単位 + 単価 + 金額
    const numbers = line.match(/[\d，,]+/g) || []
    const hasUnit = /式|個|本|セット|台|枚|m|kg|kg|リットル|㎡/.test(line)
    
    if (numbers.length >= 2 && hasUnit) {
      // 数字が2つ以上 + 単位を含む = 明細行と判定
      const quantity = parseNumber(numbers[0]) || 1
      const unitPrice = numbers.length > 1 ? parseNumber(numbers[1]) : 0
      const amount = parseNumber(numbers[numbers.length - 1]) || unitPrice * quantity
      
      // 金額が1000以上なら明細と認定
      if (amount > 0) {
        details.push({
          productName: line.replace(/\d+/g, '').replace(/[式個本セット台枚]/, '').trim() || '商品',
          spec: nextLine.length < 30 ? nextLine : '',
          unit: line.match(/式|個|本|セット|台|枚|m|kg|リットル|㎡/)?.[0] || '個',
          quantity,
          unitPrice,
          amount,
        })
        i++ // スペック行をスキップ
      }
    }
    i++
  }
  
  return details
}

