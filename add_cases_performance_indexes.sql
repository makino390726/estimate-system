-- 案件呼び込み高速化用インデックス
-- 想定対象: /cases/deal-rank, /cases/list など created_date 並び替えと担当者・見込区分絞り込み

-- created_date 降順ソートの高速化
CREATE INDEX IF NOT EXISTS idx_cases_created_date_desc
ON cases (created_date DESC);

-- 担当者 + 作成日 での絞り込み・並び替えを高速化
CREATE INDEX IF NOT EXISTS idx_cases_staff_created_date_desc
ON cases (staff_id, created_date DESC);

-- 見込区分 + 作成日 での集計/表示を高速化
CREATE INDEX IF NOT EXISTS idx_cases_deal_rank_created_date_desc
ON cases (deal_rank, created_date DESC);

-- 顧客ID 参照時の補助（顧客名解決で利用）
CREATE INDEX IF NOT EXISTS idx_cases_customer_id
ON cases (customer_id);

COMMENT ON INDEX idx_cases_created_date_desc IS '案件一覧の作成日降順表示を高速化';
COMMENT ON INDEX idx_cases_staff_created_date_desc IS '担当者別・期間別の案件抽出を高速化';
COMMENT ON INDEX idx_cases_deal_rank_created_date_desc IS '見込区分別・期間別の案件抽出と集計を高速化';
COMMENT ON INDEX idx_cases_customer_id IS 'cases.customer_idでの顧客参照を高速化';

-- 実行後の確認（任意）
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'cases'
-- ORDER BY indexname;
