# コメント機能の追加 - DBスキーマ更新ガイド

## 概要
見積書の詳細行にコメント/メッセージ機能を追加しました。このガイドでは、Supabase 上のデータベーススキーマを更新する手順を説明します。

## 更新内容
`case_details` テーブルに `comment` 列を追加します。

## 実行手順

### 1. Supabase ダッシュボードにアクセス
- [https://supabase.com](https://supabase.com) にアクセスして、estimate-system プロジェクトにログイン

### 2. SQL エディタで以下のコマンドを実行

```sql
ALTER TABLE case_details
ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT NULL;
```

**ポイント:**
- `IF NOT EXISTS` を使用して、列が既に存在する場合はエラーにならないようにしています
- `TEXT` 型はコメントテキストを保存できるサイズです
- `DEFAULT NULL` は新規レコードではデフォルト値が NULL になります

### 3. 実行結果の確認
- "Query executed successfully" というメッセージが表示されればOKです
- 「Table definition」から `case_details` テーブルを確認して、`comment` 列が表示されることを確認してください

## ローカル開発環境での検証

Supabase を使用している場合、以下の方法でスキーマを確認できます：

```bash
# Supabase CLI をインストール（まだの場合）
npm install -g @supabase/cli

# スキーマダンプ
supabase db pull

# または SQL エディタから手動で確認
```

## アプリケーション側の変更

以下のファイルが既に更新されています：

1. **`/app/cases/new/page.tsx`**
   - `Row` 型に `comment?: string` フィールドを追加
   - コメント用のモーダルと状態管理を追加
   - 保存時に `detailsToInsert` にコメントを含める

2. **`/components/PrintEstimate.tsx`**
   - `PrintRow` 型に `comment?: string` フィールドを追加
   - 縦型・横型の両方のレイアウトにコメント表示を実装
   - コメント行は黄色背景で強調表示されます

## 機能の使い方

### ユーザー側
1. 見積作成ページで詳細行を追加
2. 各行の右側に 💬 ボタンが表示されます
3. ボタンをクリックするとコメント入力モーダルが開きます
4. テキストを入力して「保存」ボタンをクリック
5. 見積を保存すると、コメントがデータベースに保存されます
6. 印刷プレビューで、コメントが詳細行の下に表示されます

### 表示形式
- **編集画面**: 各行に 💬 ボタン（コメント有=緑色、コメント無=グレー色）
- **印刷画面**: 【コメント】という接頭辞付きで、黄色背景で表示

## トラブルシューティング

### 「Permission denied」エラーが表示された場合
- Supabase でのユーザー権限を確認してください
- 管理者権限が必要です

### テーブルが見つからない場合
- プロジェクト内に `case_details` テーブルが存在することを確認してください
- テーブル名が異なる場合は、SQL クエリを修正してください

### コメントが保存されない場合
- ブラウザのコンソールでエラーを確認
- Supabase のログを確認
- アプリケーションの `handleSaveCase()` 関数でエラーハンドリングを確認

## ロールバック（必要な場合）

```sql
ALTER TABLE case_details
DROP COLUMN IF EXISTS comment;
```

## 関連ファイル

- `/app/cases/new/page.tsx` - 見積作成ページ
- `/components/PrintEstimate.tsx` - 印刷画面コンポーネント
- `/add_comment_column.sql` - マイグレーション SQL
