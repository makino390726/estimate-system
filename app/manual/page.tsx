import Link from 'next/link'
import fs from 'fs'
import path from 'path'

const SYSTEM_MANUAL = 'estimate-system-manual.docx'
const LINEWORKS_MANUAL = 'LINEWORKS運用方法.docx'

type ManualFile = {
    id: string
    fileName: string
    title: string
    description: string
}

const MANUAL_FILES: ManualFile[] = [
    {
        id: 'system',
        fileName: SYSTEM_MANUAL,
        title: '三州見積書作成システム 取扱説明書',
        description: '画面操作の説明（画像29枚を文書に埋め込み）。見積・修理・マスタなど一式。',
    },
    {
        id: 'lineworks',
        fileName: LINEWORKS_MANUAL,
        title: 'LINE WORKS 運用方法',
        description: 'LINE WORKS 修理通知の運用・セットアップ・日常手順（2026-05 改訂版）。画面キャプチャ4枚付き。',
    },
]

function manualExists(fileName: string): boolean {
    try {
        const p = path.join(process.cwd(), 'public', 'manual', fileName)
        return fs.existsSync(p)
    } catch {
        return false
    }
}

function DownloadCard({ item }: { item: ManualFile }) {
    const hasDocx = manualExists(item.fileName)
    const downloadUrl = `/manual/${encodeURIComponent(item.fileName)}`

    return (
        <div
            style={{
                marginTop: 16,
                padding: 20,
                borderRadius: 12,
                border: '1px solid #334155',
                background: '#1e293b',
            }}
        >
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{item.title}</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{item.description}</p>
            {hasDocx ? (
                <>
                    <a
                        href={downloadUrl}
                        download={item.fileName}
                        style={{
                            display: 'inline-block',
                            padding: '12px 20px',
                            background: item.id === 'lineworks' ? '#0d9488' : '#2563eb',
                            color: '#fff',
                            borderRadius: 8,
                            fontWeight: 700,
                            textDecoration: 'none',
                            fontSize: 14,
                        }}
                    >
                        Word 形式でダウンロード（.docx）
                    </a>
                    <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748b' }}>
                        <a href={downloadUrl} style={{ color: '#60a5fa' }}>
                            {item.fileName}
                        </a>
                    </p>
                </>
            ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#fcd34d' }}>
                    ファイルがありません: <code>public/manual/{item.fileName}</code>
                    {item.id === 'system' && (
                        <>
                            <br />
                            生成: <code>npm run docs:word</code>
                        </>
                    )}
                    {item.id === 'lineworks' && (
                        <>
                            <br />
                            <code>docs/manual/LINEWORKS運用方法.docx</code> を同フォルダに配置してください。
                        </>
                    )}
                </p>
            )}
        </div>
    )
}

export default function ManualDownloadPage() {
    const hasSystem = manualExists(SYSTEM_MANUAL)

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
                Word（.docx）形式でダウンロードし、内容の確認・修正ができます。
            </p>

            {MANUAL_FILES.map((item) => (
                <DownloadCard key={item.id} item={item} />
            ))}

            {!hasSystem && (
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
                        システム取扱説明書の Word が未生成です。プロジェクトで{' '}
                        <code>npm run docs:word</code> または <code>npm run docs:manual</code> を実行してください。
                    </p>
                </div>
            )}

            <section style={{ marginTop: 32, fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
                <h2 style={{ fontSize: 16, color: '#cbd5e1' }}>システム取扱説明書の編集・再生成</h2>
                <ol style={{ paddingLeft: 20 }}>
                    <li>
                        元原稿（Markdown）: <code>docs/manual/取扱説明書.md</code> を編集
                    </li>
                    <li>
                        画面を撮り直す: <code>npm run docs:capture:prod</code>（推奨）
                    </li>
                    <li>
                        Word を再作成: <code>npm run docs:word</code>
                    </li>
                    <li>このページを再読み込みしてダウンロード</li>
                </ol>
                <p style={{ marginTop: 12 }}>
                    <strong>LINE WORKS 運用方法</strong> は <code>docs/manual/LINEWORKS運用方法.md</code>{' '}
                    を編集 → <code>npm run docs:lineworks-word</code> → このページからダウンロード。
                </p>
            </section>
        </div>
    )
}
