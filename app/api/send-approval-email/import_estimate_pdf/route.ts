import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import PDFParser from 'pdf2json'

export const runtime = 'nodejs'

// pdf2jsonを使ってPDFからテキストを抽出
async function parsePDF(buffer: Buffer): Promise<{ text: string; numpages: number; info: any }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1)
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      console.error('[PDF Parse] エラー:', errData.parserError)
      reject(new Error(errData.parserError))
    })
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        // 全ページのテキストを抽出（座標順にソート）
        let fullText = ''
        const pages = pdfData.Pages || []
        
        console.log('[PDF Parse] ページ数:', pages.length)
        
        pages.forEach((page: any, pageIndex: number) => {
          const texts = page.Texts || []
          
          // Y座標でソート（上から下へ）、同じY座標の場合はX座標でソート（左から右へ）
          const sortedTexts = texts.sort((a: any, b: any) => {
            const yDiff = a.y - b.y
            if (Math.abs(yDiff) < 0.5) { // 同じ行と見なす閾値
              return a.x - b.x
            }
            return yDiff
          })
          
          let currentY = -1
          sortedTexts.forEach((text: any) => {
            const decodedText = decodeURIComponent(text.R?.[0]?.T || '')
            
            // 改行判定：Y座標が大きく変わった場合
            if (currentY >= 0 && Math.abs(text.y - currentY) > 0.5) {
              fullText += '\n'
            }
            
            fullText += decodedText
            currentY = text.y
          })
          
          fullText += '\n\n' // ページ区切り
        })
        
        console.log('[PDF Parse] 抽出テキスト（最初の1000文字）:', fullText.substring(0, 1000))
        
        resolve({
          text: fullText,
          numpages: pages.length,
          info: { Pages: pages.length }
        })
      } catch (err: any) {
        reject(err)
      }
    })
    
    // PDFバッファをパース
    pdfParser.parseBuffer(buffer)
  })
}

// ================================
// Supabase（Service Role）
// ================================
function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    throw new Error('環境変数が未設定です: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ================================
// テキストから数値を抽出
// ================================
function extractNumber(text: string): number | null {
  const cleaned = text.replace(/[,¥円]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

// ================================
// PDFテキストから見積情報を抽出
// ================================
function extractEstimateData(text: string) {
  console.log('[PDF Parse] 抽出開始')
  console.log('[PDF Parse] テキスト長:', text.length)
  console.log('[PDF Parse] テキストサンプル:', text.substring(0, 500))
  
  // 基本情報の抽出パターン
  let customerName = ''
  let subject = ''
  let deliveryPlace = ''
  let deliveryDeadline = ''
  let deliveryTerms = ''
  let validityText = ''
  let paymentTerms = ''
  let estimateDate = ''
  let estimateNo = ''
  let subtotal: number | null = null
  let taxAmount: number | null = null
  let totalAmount: number | null = null
  
  const details: Array<{
    product_name: string
    spec: string
    unit: string
    quantity: number
    unit_price: number
    amount: number
  }> = []

  // テキストを改善：スペースを正規化
  const normalizedText = text.replace(/\s+/g, ' ')
  
  // 顧客名抽出（「様」「御中」の前）
  const customerMatch = normalizedText.match(/([^\s]+)\s*(?:様|御中)/)
  if (customerMatch) {
    customerName = customerMatch[1].trim()
    console.log(`[PDF Parse] 顧客名検出: "${customerName}"`)
  }
  
  // 件名抽出（複数パターン）
  const subjectPatterns = [
    /件\s*名\s*[:：]?\s*([^\n]+)/,
    /工事名\s*[:：]?\s*([^\n]+)/,
    /案件名\s*[:：]?\s*([^\n]+)/,
    /品\s*名\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of subjectPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      subject = match[1].trim()
      console.log(`[PDF Parse] 件名検出: "${subject}"`)
      break
    }
  }
  
  // 受渡場所
  const deliveryPlacePatterns = [
    /受渡\s*場所\s*[:：]?\s*([^\n]+)/,
    /納入\s*場所\s*[:：]?\s*([^\n]+)/,
    /納品\s*場所\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of deliveryPlacePatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      deliveryPlace = match[1].trim()
      console.log(`[PDF Parse] 納入場所検出: "${deliveryPlace}"`)
      break
    }
  }
  
  // 受渡期限
  const deliveryDeadlinePatterns = [
    /受渡\s*期限\s*[:：]?\s*([^\n]+)/,
    /納\s*期\s*[:：]?\s*([^\n]+)/,
    /納入\s*期限\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of deliveryDeadlinePatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      deliveryDeadline = match[1].trim()
      console.log(`[PDF Parse] 納期検出: "${deliveryDeadline}"`)
      break
    }
  }
  
  // 受渡条件
  const deliveryTermsPatterns = [
    /受渡\s*条件\s*[:：]?\s*([^\n]+)/,
    /納入\s*条件\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of deliveryTermsPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      deliveryTerms = match[1].trim()
      console.log(`[PDF Parse] 納入条件検出: "${deliveryTerms}"`)
      break
    }
  }
  
  // 有効期限
  const validityPatterns = [
    /(?:本書)?有効\s*期限\s*[:：]?\s*([^\n]+)/,
    /見積\s*有効\s*期限\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of validityPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      validityText = match[1].trim()
      console.log(`[PDF Parse] 有効期限検出: "${validityText}"`)
      break
    }
  }
  
  // 支払条件
  const paymentPatterns = [
    /(?:御|お)?支払\s*条件\s*[:：]?\s*([^\n]+)/,
    /支払\s*方法\s*[:：]?\s*([^\n]+)/
  ]
  for (const pattern of paymentPatterns) {
    const match = normalizedText.match(pattern)
    if (match && match[1]) {
      paymentTerms = match[1].trim()
      console.log(`[PDF Parse] 支払条件検出: "${paymentTerms}"`)
      break
    }
  }
  
  // 見積番号
  const estimateNoMatch = normalizedText.match(/(?:見積|No\.?|番号)\s*[:：]?\s*([A-Z0-9\-]+)/i)
  if (estimateNoMatch) {
    estimateNo = estimateNoMatch[1].trim()
    console.log(`[PDF Parse] 見積番号検出: "${estimateNo}"`)
  }
  
  // 見積日（令和表記対応）
  const dateMatch = normalizedText.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/)
  if (dateMatch) {
    const year = 2018 + parseInt(dateMatch[1])
    const month = dateMatch[2].padStart(2, '0')
    const day = dateMatch[3].padStart(2, '0')
    estimateDate = `${year}-${month}-${day}`
    console.log(`[PDF Parse] 見積日検出: "${estimateDate}"`)
  }
  
  // 金額抽出
  const subtotalMatch = normalizedText.match(/小\s*計\s*[:：]?\s*([0-9,]+)/)
  if (subtotalMatch) {
    subtotal = extractNumber(subtotalMatch[1])
    console.log(`[PDF Parse] 小計検出: ${subtotal}`)
  }
  
  const taxMatch = normalizedText.match(/消費税\s*[:：]?\s*([0-9,]+)/)
  if (taxMatch) {
    taxAmount = extractNumber(taxMatch[1])
    console.log(`[PDF Parse] 消費税検出: ${taxAmount}`)
  }
  
  const totalMatch = normalizedText.match(/(?:合\s*計|総\s*額)\s*[:：]?\s*([0-9,]+)/)
  if (totalMatch) {
    totalAmount = extractNumber(totalMatch[1])
    console.log(`[PDF Parse] 合計金額検出: ${totalAmount}`)
  }
  
  // 明細データ抽出は今後実装（簡易版では空配列）
  console.log('[PDF Parse] 明細データの抽出をスキップ（今後実装予定）')

  return {
    customerName,
    subject,
    deliveryPlace,
    deliveryDeadline,
    deliveryTerms,
    validityText,
    paymentTerms,
    estimateDate,
    estimateNo,
    subtotal,
    taxAmount,
    totalAmount,
    details
  }
}

// ================================
// POSTハンドラー
// ================================
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    
    if (!(file instanceof File)) {
      return NextResponse.json({ 
        ok: false, 
        message: 'PDFファイルがアップロードされていません' 
      }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ 
        ok: false, 
        message: 'PDFファイル(.pdf)を選択してください' 
      }, { status: 400 })
    }

    console.log('[PDF Import] ファイル受信:', file.name, file.size, 'bytes')

    // PDFをパース
    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await parsePDF(buffer)
    
    console.log('[PDF Import] PDF情報:', {
      pages: data.numpages,
      textLength: data.text.length,
      info: data.info
    })

    // 見積データを抽出
    const extracted = extractEstimateData(data.text)
    
    if (!extracted.customerName && !extracted.subject) {
      return NextResponse.json({
        ok: false,
        message: 'PDFから見積情報を抽出できませんでした。テキストベースのPDFであることを確認してください。',
        debug: {
          textSample: data.text.substring(0, 500),
          pages: data.numpages
        }
      }, { status: 400 })
    }

    // 確認画面用のデータを返却（Excel同様）
    return NextResponse.json({
      ok: true,
      parsed: true,
      message: 'PDF解析成功',
      case_id: null, // 確認画面で生成
      customerName: extracted.customerName,
      subject: extracted.subject,
      deliveryPlace: extracted.deliveryPlace,
      deliveryDeadline: extracted.deliveryDeadline,
      deliveryTerms: extracted.deliveryTerms,
      validityText: extracted.validityText,
      paymentTerms: extracted.paymentTerms,
      estimateDate: extracted.estimateDate,
      estimateNo: extracted.estimateNo,
      subtotal: extracted.subtotal,
      taxAmount: extracted.taxAmount,
      totalAmount: extracted.totalAmount,
      details: extracted.details.map((d, idx) => ({
        row_index: idx + 1,
        product_id: null,
        product_name: d.product_name,
        spec: d.spec,
        unit: d.unit,
        quantity: d.quantity,
        unit_price: d.unit_price,
        amount: d.amount,
        cost_price: null,
        section_name: null,
        section_id: null
      })),
      sections: [],
      source: 'pdf',
      fileName: file.name
    })

  } catch (err: any) {
    console.error('[PDF Import] エラー:', err)
    return NextResponse.json({
      ok: false,
      message: `PDFインポートエラー: ${err.message}`,
      stack: err.stack
    }, { status: 500 })
  }
}
