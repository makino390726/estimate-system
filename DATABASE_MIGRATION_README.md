# データベーススキーマ変更手順

## 見積番号を文字列形式に変更

### 実行するSQL
`migration_case_no_to_text.sql` ファイルに記載されているSQLを実行します。

### Supabaseでの実行方法

1. **Supabase Dashboardにログイン**
   - https://app.supabase.com/ にアクセス
   - プロジェクトを選択

2. **SQL Editorを開く**
   - 左サイドバーから「SQL Editor」をクリック
   - 「New query」をクリック

3. **SQLを貼り付けて実行**
   ```sql
   -- case_no カラムを TEXT型に変更
   ALTER TABLE cases 
   ALTER COLUMN case_no TYPE TEXT USING case_no::TEXT;

   -- カラムにコメントを追加
   COMMENT ON COLUMN cases.case_no IS '見積番号（文字列形式対応: 例 R8-SO001, 123 など）';
   ```

4. **「Run」ボタンをクリックして実行**

5. **変更確認（オプション）**
   ```sql
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'cases' AND column_name = 'case_no';
   ```
   結果: `data_type` が `text` になっていることを確認

### 影響範囲
- **cases** テーブルの **case_no** カラム
- 既存の数値データは自動的に文字列に変換されます（例: 123 → "123"）
- アプリケーション側は既に文字列対応済み

### ロールバック方法
元に戻す必要がある場合（数値型に戻す）:
```sql
ALTER TABLE cases 
ALTER COLUMN case_no TYPE INTEGER USING case_no::INTEGER;
```
**注意**: 文字列形式の見積番号（R8-SO001など）が入っている場合、ロールバックできません。

### 実行後の確認
1. アプリケーションを再起動（開発サーバーが動いている場合）
2. 見積書作成画面で「R8-SO001」のような文字列を入力してテスト
3. Excel取込で見積番号が正しく取り込まれることを確認
