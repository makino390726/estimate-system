-- case_details テーブルに comment 列を追加するマイグレーション
-- 既に列が存在する場合は何もしない

ALTER TABLE case_details
ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT NULL;

-- インデックスを作成（不要だが、参照用に作成可能）
-- CREATE INDEX idx_case_details_comment ON case_details(comment);
