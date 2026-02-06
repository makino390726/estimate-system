-- casesテーブルにhonorific列を追加
-- 敬称（様・御中）を保存するための列

ALTER TABLE cases 
ADD COLUMN IF NOT EXISTS honorific TEXT DEFAULT '様';

COMMENT ON COLUMN cases.honorific IS '敬称（様・御中など）';

-- 既存データにデフォルト値を設定
UPDATE cases 
SET honorific = '様' 
WHERE honorific IS NULL;
