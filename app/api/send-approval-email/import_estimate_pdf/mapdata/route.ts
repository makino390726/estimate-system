import { NextResponse } from 'next/server'
import PDFParser from 'pdf2json'

export const runtime = 'nodejs'

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

function parsePDFWithPositions(buffer: Buffer): Promise<{ pages: any[] }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1)

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(errData?.parserError || 'PDF解析エラー'))
    })

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        const pages = pdfData.Pages || []
        resolve({ pages })
      } catch (err) {
        reject(err)
      }
    })

    pdfParser.parseBuffer(buffer)
  })
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const pageIndexStr = form.get('pageIndex') as string | null
    const pageIndex = pageIndexStr ? Math.max(0, parseInt(pageIndexStr)) : 0

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'PDFファイルが必要です' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ ok: false, message: 'PDFファイル(.pdf)を選択してください' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { pages } = await parsePDFWithPositions(buf)
    if (!pages.length) {
      return NextResponse.json({ ok: false, message: 'PDFからページが取得できませんでした' }, { status: 400 })
    }

    const page = pages[Math.min(pageIndex, pages.length - 1)]
    const width = page.Width || 595 // A4横の既定（pt）。pdf2jsonがWidthを提供しない場合のフォールバック
    const height = page.Height || 842 // A4縦の既定（pt）

    // テキスト座標と内容を抽出
    const texts = (page.Texts || []).map((t: any) => ({
      x: t.x,
      y: t.y,
      w: t.w,
      sw: t.sw,
      R: (t.R || []).map((r: any) => ({ T: safeDecode(r.T || '') })),
      text: safeDecode(t.R?.[0]?.T || '')
    }))

    return NextResponse.json({
      ok: true,
      pageIndex,
      pageCount: pages.length,
      pageWidth: width,
      pageHeight: height,
      texts
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || 'PDFマップデータ生成エラー' }, { status: 500 })
  }
}
