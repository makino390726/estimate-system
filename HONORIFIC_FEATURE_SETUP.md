# 敬称機能追加 - データベース更新手順

## 概要
見積書に「様」「御中」の敬称を選択・表示する機能を追加しました。

## データベース更新が必要です

### Supabaseでの実行方法

1. **Supabase Dashboardにログイン**
   - https://app.supabase.com/ にアクセス
   - プロジェクトを選択

2. **SQL Editorを開く**
   - 左サイドバーから「SQL Editor」をクリック
   - 「New query」をクリック

3. **SQLを貼り付けて実行**
   ```sql
   -- casesテーブルにhonorific列を追加
   ALTER TABLE cases 
   ADD COLUMN IF NOT EXISTS honorific TEXT DEFAULT '様';

   COMMENT ON COLUMN cases.honorific IS '敬称（様・御中など）';

   -- 既存データにデフォルト値を設定
   UPDATE cases 
   SET honorific = '様' 
   WHERE honorific IS NULL;
   ```

4. **「Run」ボタンをクリックして実行**

5. **変更確認（オプション）**
   ```sql
   SELECT column_name, data_type, column_default, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'cases' AND column_name = 'honorific';
   ```
   結果: `honorific` 列が存在し、デフォルト値が `'様'` であることを確認

## 機能説明

### 1. 見積作成画面
- 顧客選択ボタンの右に敬称コンボボックスを追加
- 「様」「御中」を選択可能
- デフォルトは「様」
- 保存時にデータベースに敬称を保存

### 2. 承認画面
- データベースから敬称を読み込んで印刷PDFに反映
- 見積作成時に選択した敬称が表示される

### 3. 既存データ
- SQLを実行すると、既存の見積はすべて「様」として表示されます

## 注意事項

- このSQL実行後、アプリケーションを再起動する必要はありません
- 既存の見積データは自動的に「様」が設定されます
- 今後作成する見積では、敬称を自由に選択できます

## トラブルシューティング

### エラー: column "honorific" already exists
→ 既に列が追加されています。UPDATE文のみ実行してください。

### ビルドエラーが出る場合
```bash
npm run build
```
でエラーが出ないことを確認してください。
