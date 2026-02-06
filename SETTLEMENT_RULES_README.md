# 決済ルール管理ページ セットアップガイド

## 概要
決済ルール管理ページは、営業所を選択して決済ルールPDFを表示・管理するシンプルな機能です。

## 機能仕様

### 1. 営業所選択
- ドロップダウンから営業所を選択
- 6つの営業所をサポート：
  - 南九州営業所 (099-269-1821)
  - 中九州営業所 (096-380-5522)
  - 西九州営業所 (0942-43-4691)
  - 東日本営業所 (0299-57-6722)
  - 沖縄出張所 (098-987-1966)
  - 東北出張所 (0178-32-6525)

### 2. PDF表示
- 選択した営業所の決済ルールPDFを表示
- iframe内でPDF表示
- 新しいタブで開く、ダウンロード機能付き

### 3. PDFアップロード
- 決済ルールPDFをアップロード
- Supabase Storageに保存
- 自動的にデータベースに記録

## セットアップ手順

### ステップ1: Supabaseテーブルを作成

1. [Supabase ダッシュボード](https://app.supabase.com) にアクセス
2. SQL Editor を開く
3. `SETTLEMENT_RULES_SETUP.sql` の内容をコピー＆ペースト
4. 実行

### ステップ2: Supabase Storage バケットを作成

1. Supabase ダッシュボード → Storage
2. 「新規作成」をクリック
3. バケット名: `settlement-rules`
4. 公開をON
5. ファイルサイズ制限: 52MB以上を推奨
6. 作成

### ステップ3: 環境変数確認

`.env.local` または `.env` に以下が設定されていることを確認：

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### ステップ4: アプリケーション起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000/settlement-rules` にアクセス

## 使用方法

### 決済ルールの表示

1. 営業所をドロップダウンから選択
2. PDFが自動的に読み込まれて表示

### 決済ルールのアップロード

1. 営業所を選択
2. 「決済ルールPDFをアップロード」フォームで PDFファイルを選択
3. ファイルが Supabase Storage にアップロードされて、データベースに記録

## データベーススキーマ

### settlement_rules テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | UUID | プライマリキー |
| branch_id | TEXT | 営業所ID（ユニーク） |
| pdf_url | TEXT | PDF公開URL |
| created_at | TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | 更新日時 |

## API統合

### Supabase操作例

```typescript
import { supabase } from '@/lib/supabaseClient'

// 特定営業所の決済ルールを取得
const { data, error } = await supabase
  .from('settlement_rules')
  .select('*')
  .eq('branch_id', 'branch_1')
  .single()

// PDFをアップロード
const { error: uploadError } = await supabase.storage
  .from('settlement-rules')
  .upload('settlement-rules/branch_1-timestamp.pdf', pdfFile)

// データベースに記録
const { error: dbError } = await supabase
  .from('settlement_rules')
  .upsert({ branch_id: 'branch_1', pdf_url: pdfUrl })
```

## トラブルシューティング

### PDFが表示されない

- **原因**: Supabase Storage の公開URLが正しくない
- **対処**: Supabase ダッシュボール → Storage → settlement-rules → ファイルをクリックして公開URLをコピー

### アップロード失敗

- **原因1**: Storageバケットが存在しない
  - **対処**: ステップ2を実行してバケットを作成
  
- **原因2**: ファイルサイズが大きすぎる
  - **対処**: バケットのファイルサイズ制限を52MB以上に設定

### データが保存されない

- **原因**: RLSポリシーが有効だが、適切に設定されていない
- **対処**: SETTLEMENT_RULES_SETUP.sql のポリシー設定を確認

## 将来の拡張案

1. **複数PDFサポート**: 各営業所で複数の決済ルール（改訂版など）を管理
2. **バージョン管理**: PDFのバージョン履歴を追跡
3. **有効期限設定**: 決済ルールの有効期限を設定
4. **通知機能**: 新しいPDFがアップロードされたときにメール通知
5. **カテゴリ分類**: 決済ルール以外のドキュメントも管理可能に拡張

## ファイル一覧

| ファイルパス | 説明 |
|------------|------|
| `/app/settlement-rules/page.tsx` | メインのUIページ |
| `/SETTLEMENT_RULES_SETUP.sql` | Supabase セットアップスクリプト |
| `/SETTLEMENT_RULES_README.md` | このドキュメント |
