-- 案件の見込み区分（○/△/▢/×）を保存するカラムを追加
ALTER TABLE cases
ADD COLUMN IF NOT EXISTS deal_rank text;

ALTER TABLE cases
ADD COLUMN IF NOT EXISTS sales_activity_comment text;

ALTER TABLE cases
ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;

-- 値のゆらぎを防ぐため、許可値を制約で固定
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cases_deal_rank_check'
  ) THEN
    ALTER TABLE cases
    ADD CONSTRAINT cases_deal_rank_check
    CHECK (deal_rank IS NULL OR deal_rank IN ('ordered', 'promising', 'difficult', 'unlikely'));
  END IF;
END $$;

COMMENT ON COLUMN cases.deal_rank IS '案件見込み区分: ordered=○受注/成約, promising=△有力, difficult=▢厳しい, unlikely=×失注/ほぼ無理';
COMMENT ON COLUMN cases.sales_activity_comment IS '営業活動コメント: 主に△/□/×案件の次アクションを記録';
COMMENT ON COLUMN cases.total_amount IS '案件合計額（事業費）';
