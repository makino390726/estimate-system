/**
 * 本番 URL で全画面撮影 + localhost:3001 で LIFF プレビュー（任意）
 *
 * LIFF 画像まで含める場合:
 *   npm run build
 *   npx next start -p 3001
 *   npm run docs:capture:prod
 */
process.env.MANUAL_BASE_URL = 'https://estimate-system-ten.vercel.app'
await import('./capture-manual-screenshots.mjs')
