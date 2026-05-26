# 取扱説明書（ローカル画面キャプチャ付き）

## Word でダウンロード（確認・修正用）

1. Word を生成（初回・原稿更新後）:

```bash
npm run docs:word
```

2. ブラウザで開く（`npm run dev` 起動中）:

**http://localhost:3000/manual**

→ **「Word 形式でダウンロード（.docx）」** から保存。Microsoft Word で開いて編集できます。

生成ファイルの場所:

- `docs/manual/estimate-system-manual.docx`
- `public/manual/estimate-system-manual.docx`（上記 URL 用）

## ファイル

| ファイル | 内容 |
|----------|------|
| [取扱説明書.md](./取扱説明書.md) | 本文（編集用の元原稿・画面画像参照） |
| [estimate-system-manual.docx](./estimate-system-manual.docx) | Word 版（`npm run docs:word` で生成） |
| [screenshots/](./screenshots/) | ローカルで撮影した PNG（29枚） |
| [screenshots-manifest.json](./screenshots-manifest.json) | 撮影ログ |

## 画面の再撮影

**重要:** `npm run dev`（開発モード）で撮ると、Next.js の「Build Error」画面が写り込むことがあります。次のいずれかで撮影してください。

### 推奨 A: 本番サイトから撮影

```bash
npx puppeteer browsers install chrome
npm run docs:capture:prod
```

### 推奨 B: ローカル本番ビルド

```bash
npm run build
npx next start -p 3001
```

別ターミナルで:

```powershell
$env:MANUAL_BASE_URL="http://localhost:3001"
npm run docs:capture
```

### 非推奨: npm run dev (ポート3000)

開発サーバーでは `canvas` モジュール関連のエラー画面が多数のページに重なって表示されます。

## 一式の再生成（画面＋Word）

```bash
npm run docs:manual
```

（`docs:capture` → `docs:word` を連続実行）

## Markdown のみ閲覧

VS Code で `取扱説明書.md` を開き、プレビュー（Ctrl+Shift+V）。
