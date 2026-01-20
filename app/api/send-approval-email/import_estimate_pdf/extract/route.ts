import { NextResponse } from 'next/server'
import PDFParser from 'pdf2json'

/**
 * PDFマッピング座標を使用してデータを抽出するAPI
 * 座標情報から顧客名、件名、日付などを抽出
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const mappingsJson = formData.get('mappings') as string
    
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'ファイルがありません' }, { status: 400 })
    }
    
    if (!mappingsJson) {
      return NextResponse.json({ ok: false, message: 'マッピング情報がありません' }, { status: 400 })
    }
    
    const mappings = JSON.parse(mappingsJson)
    console.log('[PDF Extract] Received mappings:', mappings)
    
    // マッピングから各フィールドのエリアを抽出
    const areaMap = new Map(mappings.map((m: any) => [m.type, m.area]))
    
    // PDFをBufferに変換
    const pdfBuffer = Buffer.from(await file.arrayBuffer())
    
    // pdf2jsonを使ってPDFテキストを抽出
    const pdfParser = new PDFParser()
    
    const pdfData = await new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataError', (errData: any) => {
        console.error('[PDF Extract] PDF Parser Error:', errData)
        reject(new Error('PDF解析エラー'))
      })
      pdfParser.on('pdfParser_dataReady', (data: any) => {
        resolve(data)
      })
      pdfParser.parseBuffer(pdfBuffer)
    })
    
    // テキスト情報を抽出
    const texts: Array<{ x: number; y: number; text: string }> = []
    const pdfDataTyped = pdfData as any
    
    // URIデコード時のエラーハンドリング
    const safeDecode = (encoded: string): string => {
      try {
        return decodeURIComponent(encoded)
      } catch (e) {
        console.warn('[PDF Extract] Decode error for:', encoded)
        return encoded
      }
    }
    
    if (pdfDataTyped.Pages && pdfDataTyped.Pages[0]) {
      const page = pdfDataTyped.Pages[0]
      if (page.Texts) {
        page.Texts.forEach((textItem: any) => {
          if (textItem.R && textItem.R[0] && textItem.R[0].T) {
            const text = safeDecode(textItem.R[0].T)
            texts.push({
              x: textItem.x,
              y: textItem.y,
              text: text
            })
          }
        })
      }
    }
    
    console.log('[PDF Extract] Extracted texts:', texts.length, 'items')
    if (texts.length > 0) {
      console.log('[PDF Extract] Sample texts:', texts.slice(0, 5))
    }
    
    // エリア内のテキストを取得する関数
    // PDF.jsのキャンバス座標（ピクセル）をpdf2jsonのポイント座標に変換
    const getTextInArea = (area: any | null): string => {
      if (!area) return ''
      
      // PDF.jsの座標（ピクセル、scale 2.0）をpdf2jsonのポイント座標に変換
      // A4 = 595x842pt → 1190x1684px (2倍)
      // Canvas座標: Y=0(上) → 1684(下)
      // PDF座標: Y=0(下) → 842(上)
      
      // シンプル変換：ピクセル / 2 = ポイント
      const x1 = area.x1 / 2
      const x2 = area.x2 / 2
      const y_canvas_top = Math.min(area.y1, area.y2)
      const y_canvas_bottom = Math.max(area.y1, area.y2)
      
      // Canvas座標をPT座標（Y軸反転）に変換
      // Canvas上部（小さいY）→ PDF上部（大きいY）
      // Canvas下部（大きいY）→ PDF下部（小さいY）
      const y1_pt = (1684 - y_canvas_bottom) / 2  // Canvasの下 → PDFの下
      const y2_pt = (1684 - y_canvas_top) / 2      // Canvasの上 → PDFの上
      
      const inArea = texts.filter(t => 
        t.x >= x1 && t.x <= x2 && 
        t.y >= y1_pt && t.y <= y2_pt
      )
      
      console.log(`[PDF Extract] Area canvas(${Math.round(area.x1)},${Math.round(y_canvas_top)})-(${Math.round(area.x2)},${Math.round(y_canvas_bottom)}) → pt(${Math.round(x1*10)/10},${Math.round(y1_pt*10)/10})-(${Math.round(x2*10)/10},${Math.round(y2_pt*10)/10}): found ${inArea.length} items`)
      if (inArea.length > 0) {
        console.log(`[PDF Extract] Found texts:`, inArea.map(t => t.text))
      }
      
      return inArea.map(t => t.text).join(' ').trim()
    }
    
    // マッピングエリアからデータを抽出
    const customerName = getTextInArea(areaMap.get('customerName'))
    const subject = getTextInArea(areaMap.get('subject'))
    const estimateDate = getTextInArea(areaMap.get('estimateDate'))
    const estimateNo = getTextInArea(areaMap.get('estimateNo'))
    
    // 列座標からテーブルデータを抽出
    const productNameColArea = areaMap.get('productNameCol')
    const qtyColArea = areaMap.get('qtyCol')
    const unitPriceColArea = areaMap.get('unitPriceCol')
    const amountColArea = areaMap.get('amountCol')
    
    console.log('[PDF Extract] Extracted data:', {
      customerName,
      subject,
      estimateDate,
      estimateNo
    })
    
    const coverData = {
      estimateNumber: estimateNo || 'PDF-' + Date.now(),
      estimateDate: estimateDate || new Date().toISOString().split('T')[0],
      customerName: customerName || '(未抽出)',
      subject: subject || '(未抽出)',
      discountRate: 0,
      taxRate: 0.1,
      deliveryTerms: '',
      paymentTerms: '',
    }
    
    const details = [
      {
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
      }
    ]
    
    const sections = [
      {
        section_id: '1',
        section_name: 'PDFマッピング抽出',
      }
    ]
    
    // デバッグ情報: 抽出されたテキスト候補を含める
    const extractedTextCandidates = texts.slice(0, 30).map(t => `"${t.text}"`)
    
    return NextResponse.json({
      ok: true,
      parsed: true,
      coverData,
      details,
      sections,
      message: `PDFからのデータ抽出が完了しました。抽出テキスト: ${extractedTextCandidates.join(', ')}`,
      fileName: file.name,
      debug: {
        totalTexts: texts.length,
        mappings,
        extractedTexts: texts.map(t => ({ x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, text: t.text }))
      }
    })
  } catch (e: any) {
    console.error('[PDF Extract] Error:', e)
    return NextResponse.json(
      { ok: false, message: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
