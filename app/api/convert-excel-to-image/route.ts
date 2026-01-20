import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import puppeteer from 'puppeteer'

export const runtime = 'nodejs'

/**
 * ExcelシートをPNG画像に変換するAPI
 * Puppeteer経由でHTMLをレンダリング
 */
export async function POST(req: Request) {
  let browser
  try {
    const form = await req.formData()
    const file = form.get('file')
    const sheetIndex = parseInt(form.get('sheetIndex') as string || '0')
    
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'ファイルがありません' }, { status: 400 })
    }

    // Excel読み込み
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false })
    
    const sheetName = wb.SheetNames[sheetIndex]
    if (!sheetName) {
      return NextResponse.json({ ok: false, message: 'シートが見つかりません' }, { status: 400 })
    }
    
    const ws = wb.Sheets[sheetName]
    
    // シートをHTML変換
    const html = XLSX.utils.sheet_to_html(ws, { 
      editable: false,
      header: '',
      footer: ''
    })
    
    // HTMLをスタイル付きで整形
    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            padding: 30px;
            background: white;
            font-family: 'MS PGothic', 'MS Gothic', 'Meiryo', sans-serif;
          }
          table {
            border-collapse: collapse;
            font-size: 12px;
            background: white;
            width: auto;
          }
          td, th {
            border: 1px solid #333;
            padding: 6px 10px;
            min-width: 60px;
            text-align: left;
            white-space: pre-wrap;
            vertical-align: top;
          }
          th {
            background: #f0f0f0;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `
    
    // Puppeteerで画像化
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setContent(styledHtml, { waitUntil: 'networkidle0' })
    
    // ページサイズを取得してビューポート設定
    const bodyHandle = await page.$('body')
    const boundingBox = await bodyHandle?.boundingBox()
    
    if (boundingBox) {
      await page.setViewport({
        width: Math.ceil(boundingBox.width + 60),
        height: Math.ceil(boundingBox.height + 60)
      })
    }
    
    // PNG画像生成
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: true
    })
    
    await browser.close()
    
    // Base64エンコード
    const base64Image = (screenshot as Buffer).toString('base64')
    const imageDataUrl = `data:image/png;base64,${base64Image}`
    
    return NextResponse.json({
      ok: true,
      sheetName,
      imageUrl: imageDataUrl,
      sheetNames: wb.SheetNames
    })
  } catch (e: any) {
    console.error('[Convert Excel to Image] Error:', e)
    if (browser) await browser.close()
    return NextResponse.json(
      { ok: false, message: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
