import { NextResponse } from 'next/server'
import { pdfToPng } from 'pdf-to-png-converter'

export const runtime = 'nodejs'

/**
 * PDFファイルをPNG画像に変換するAPI
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const pageIndex = parseInt(form.get('pageIndex') as string || '0')
    
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'ファイルがありません' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ ok: false, message: 'PDFファイルを選択してください' }, { status: 400 })
    }

    // PDFをArrayBufferとして取得
    const pdfArrayBuffer = await file.arrayBuffer()
    
    console.log('[PDF to Image] Converting PDF to PNG... File size:', pdfArrayBuffer.byteLength)

    // PDFをPNGに変換
    const pngPages = await pdfToPng(pdfArrayBuffer, {
      pagesToProcess: [pageIndex + 1],
      verbosityLevel: 0,
      returnPageContent: true
    })
    
    if (!pngPages || pngPages.length === 0) {
      throw new Error('PDF変換に失敗しました')
    }
    
    const pngBuffer = pngPages[0].content
    if (!pngBuffer) {
      throw new Error('PDF変換結果に画像データが含まれていません')
    }
    
    // Base64エンコード
    const base64Image = pngBuffer.toString('base64')
    const imageDataUrl = `data:image/png;base64,${base64Image}`
    
    console.log('[PDF to Image] Success! Image size:', base64Image.length, 'bytes')
    
    return NextResponse.json({
      ok: true,
      imageUrl: imageDataUrl,
      fileName: file.name,
      pageIndex
    })
  } catch (e: any) {
    console.error('[Convert PDF to Image] Error:', e)
    return NextResponse.json(
      { ok: false, message: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
