import Link from 'next/link'
import fs from 'fs'
import path from 'path'

const DOCX_NAME = 'estimate-system-manual.docx'

function docxExists(): boolean {
    try {
        const p = path.join(process.cwd(), 'public', 'manual', DOCX_NAME)
        return fs.existsSync(p)
    } catch {
        return false
    }
}

export default function ManualDownloadPage() {
    const hasDocx = docxExists()
    const downloadUrl = `/manual/${DOCX_NAME}`

    return (
        <div
            style={{
                minHeight: '100vh',
                padding: 32,
                background: '#0f172a',
                color: '#e2e8f0',
                maxWidth: 720,
                margin: '0 auto',
            }}
        >
            <Link href="/selectors" style={{ color: '#94a3b8', fontSize: 14 }}>
                ← メインメニュー
            </Link>
            <h1 style={{ margin: '16px 0 8px', fontSize: 26, color: '#38bdf8' }}>
                取扱説明書のダウンロード
            </h1>
            <p style={{ lineHeight: 1.7, color: '#94a3b8', fontSize: 14 }}>
                Word（.docx）形式でダウンロードし、内容の確認・修正ができます。画像29枚を文書に埋め込んでいます。
            </p>

            {hasDocx ? (
                <div
                    style={{
                        marginTop: 24,
                        padding: 20,
                        borderRadius: 12,
                        border: '1px solid #334155',
                        background: '#1e293b',
                    }}
                >
                    <p style={{ margin: '0 0 16px', fontSize: 15 }}>
                        三州見積書作成システム 取扱説明書
                    </p>
                    <a
                        href={downloadUrl}
                        download={DOCX_NAME}
                        style={{
                            display: 'inline-block',
                            padding: '14px 24px',
                            background: '#2563eb',
                            color: '#fff',
                            borderRadius: 8,
                            fontWeight: 700,
                            textDecoration: 'none',
                            fontSize: 15,
                        }}
                    >
                        Word 形式でダウンロード（.docx）
                    </a>
                    <p style={{ margin: '16px 0 0', fontSize: 12, color: '#64748b' }}>
                        直接リンク:{' '}
                        <a href={downloadUrl} style={{ color: '#60a5fa' }}>
                            {downloadUrl}
                        </a>
                    </p>
                </div>
            ) : (
                <div
                    style={{
                        marginTop: 24,
                        padding: 20,
                        borderRadius: 12,
                        border: '1px solid #b45309',
                        background: '#422006',
                        color: '#fcd34d',
                        fontSize: 14,
                        lineHeight: 1.6,
                    }}
                >
                    <p style={{ margin: 0 }}>
                        Word ファイルがまだ生成されていません。プロジェクトフォルダで次を実行してください。
                    </p>
                    <pre
                        style={{
                            marginTop: 12,
                            padding: 12,
                            background: '#0f172a',
                            borderRadius: 8,
                            overflow: 'auto',
                            fontSize: 13,
                        }}
                    >
                        npm run docs:word
                    </pre>
                    <p style={{ margin: '12px 0 0' }}>
                        画面キャプチャから一式生成する場合: <code>npm run docs:manual</code>
                    </p>
                </div>
            )}

            <section style={{ marginTop: 32, fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
                <h2 style={{ fontSize: 16, color: '#cbd5e1' }}>編集・再生成の手順</h2>
                <ol style={{ paddingLeft: 20 }}>
                    <li>
                        元原稿（Markdown）: <code>docs/manual/取扱説明書.md</code> を編集
                    </li>
                    <li>
                        画面を撮り直す: <code>npm run dev</code> のあと <code>npm run docs:capture</code>
                    </li>
                    <li>
                        Word を再作成: <code>npm run docs:word</code>
                    </li>
                    <li>このページを再読み込みしてダウンロード</li>
                </ol>
                <p style={{ marginTop: 12 }}>
                    Markdown プレビュー: VS Code で <code>docs/manual/取扱説明書.md</code> を開き Ctrl+Shift+V
                </p>
            </section>
        </div>
    )
}
