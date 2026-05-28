/**
 * LINE WORKS 運用方法 Markdown → Word（.docx）
 * 用法: npm run docs:lineworks-word
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import HTMLtoDOCX from 'html-to-docx'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MANUAL_DIR = path.join(ROOT, 'docs', 'manual')
const MD_FILE = path.join(MANUAL_DIR, 'LINEWORKS運用方法.md')
const OUT_NAME = 'LINEWORKS運用方法.docx'
const OUT_MANUAL = path.join(MANUAL_DIR, OUT_NAME)
const OUT_PUBLIC = path.join(ROOT, 'public', 'manual', OUT_NAME)

const IMAGE_MAX_WIDTH = 960

async function imageToDataUrl(fullPath) {
    const resized = await sharp(fullPath)
        .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
        .png({ compressionLevel: 8 })
        .toBuffer()
    return `data:image/png;base64,${resized.toString('base64')}`
}

async function embedScreenshotImages(md, baseDir) {
    const re = /!\[([^\]]*)\]\((screenshots\/[^)]+)\)/g
    let out = md
    for (const m of [...md.matchAll(re)]) {
        const [full, alt, rel] = m
        const fullPath = path.join(baseDir, rel.replace(/\//g, path.sep))
        if (!fs.existsSync(fullPath)) {
            console.warn(`画像なし: ${rel}`)
            out = out.replace(full, `**[画像: ${alt || rel}]**`)
            continue
        }
        const dataUrl = await imageToDataUrl(fullPath)
        out = out.replace(full, `![${alt}](${dataUrl})`)
    }
    return out
}

function wrapHtml(body) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: "Yu Gothic", "Meiryo", sans-serif; font-size: 11pt; line-height: 1.55; color: #111; }
    h1 { font-size: 20pt; color: #0f766e; border-bottom: 2px solid #0d9488; padding-bottom: 6px; }
    h2 { font-size: 14pt; color: #115e59; margin-top: 20px; }
    h3 { font-size: 12pt; color: #334155; margin-top: 14px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 10pt; vertical-align: top; }
    th { background: #ccfbf1; }
    img { max-width: 580px; height: auto; display: block; margin: 12px 0; }
    code { background: #f1f5f9; padding: 1px 4px; font-size: 9pt; }
    blockquote { border-left: 4px solid #0d9488; padding-left: 12px; color: #475569; }
    pre { background: #f1f5f9; padding: 10px; font-size: 9pt; overflow-x: auto; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

async function mdToHtml(md) {
    const re = /(!\[[^\]]*\]\([^)]+\))/g
    const segments = md.split(re)
    const htmlParts = []
    for (const seg of segments) {
        const trimmed = seg.trim()
        if (!trimmed) continue
        const img = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/)
        if (img) {
            const alt = img[1].replace(/"/g, '&quot;')
            const src = img[2].replace(/"/g, '&quot;')
            htmlParts.push(`<p><img src="${src}" alt="${alt}" /></p>`)
            continue
        }
        const subChunks = seg.split(/\n(?=## )/)
        for (const sub of subChunks) {
            if (!sub.trim()) continue
            htmlParts.push(await marked.parse(sub))
        }
    }
    return htmlParts.join('\n')
}

async function main() {
    if (!fs.existsSync(MD_FILE)) {
        console.error(`見つかりません: ${MD_FILE}`)
        process.exit(1)
    }

    let md = fs.readFileSync(MD_FILE, 'utf8')
    console.log('画像をリサイズして埋め込み中…')
    md = await embedScreenshotImages(md, MANUAL_DIR)

    marked.setOptions({ gfm: true, breaks: false })
    console.log('HTML 変換中…')
    const bodyHtml = await mdToHtml(md)
    const html = wrapHtml(bodyHtml)

    console.log('Word 生成中…')
    const buffer = await HTMLtoDOCX(html, null, {
        table: { row: { cantSplit: true } },
        pageNumber: true,
    })

    fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true })
    fs.writeFileSync(OUT_MANUAL, buffer)
    fs.writeFileSync(OUT_PUBLIC, buffer)

    const kb = Math.round(buffer.length / 1024)
    console.log(`Word 出力完了 (${kb} KB):`)
    console.log(`  ${OUT_MANUAL}`)
    console.log(`  ${OUT_PUBLIC}`)
    console.log(`\nダウンロード: http://localhost:3000/manual/${encodeURIComponent(OUT_NAME)}`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
