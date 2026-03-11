-- cases.total_amount を case_details.amount から再計算して埋める
-- ルール: exclude_from_total=true の行は合算対象外

WITH detail_sum AS (
  SELECT
    d.case_id,
    COALESCE(
      SUM(
        CASE
          WHEN COALESCE(d.exclude_from_total, false) THEN 0
          ELSE COALESCE(d.amount, 0)
        END
      ),
      0
    ) AS recalculated_total_amount
  FROM case_details AS d
  GROUP BY d.case_id
)
UPDATE cases AS c
SET total_amount = ds.recalculated_total_amount
FROM detail_sum AS ds
WHERE c.case_id = ds.case_id
  AND c.total_amount IS DISTINCT FROM ds.recalculated_total_amount;

-- 明細が1件もない案件は 0 を設定
UPDATE cases AS c
SET total_amount = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM case_details AS d
  WHERE d.case_id = c.case_id
)
  AND c.total_amount IS DISTINCT FROM 0;
