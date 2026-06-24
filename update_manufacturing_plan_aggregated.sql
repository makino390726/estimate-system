-- 見積・製造計画検討一覧: 商品コード単位の集計 RPC（1000件制限解消・未登録商品対応）
-- Supabase SQL Editor で実行してください。

CREATE OR REPLACE FUNCTION public.get_manufacturing_plan_aggregated(
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  total_quantity numeric,
  amount numeric,
  cost_amount numeric,
  avg_unit_price numeric,
  is_unregistered boolean,
  detail_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      cd.id AS detail_id,
      cd.product_id,
      cd.unregistered_product,
      cd.quantity,
      cd.amount,
      cd.cost_amount
    FROM case_details cd
    INNER JOIN cases c ON c.case_id = cd.case_id
    WHERE COALESCE(cd.exclude_from_total, false) = false
      AND (_from IS NULL OR c.created_date >= _from)
      AND (_to IS NULL OR c.created_date <= _to)
      AND (
        cd.product_id IS NOT NULL
        OR NULLIF(TRIM(cd.unregistered_product), '') IS NOT NULL
      )
  ),
  keyed AS (
    SELECT
      f.detail_id,
      CASE
        WHEN NULLIF(TRIM(f.product_id), '') IS NOT NULL THEN TRIM(f.product_id)
        ELSE 'unreg:' || LEFT(
          LOWER(
            REGEXP_REPLACE(
              TRIM(f.unregistered_product),
              '[\s\u3000\u00a0\u2000-\u200a\u202f\u205f]+',
              '',
              'g'
            )
          ),
          120
        )
      END AS agg_id,
      CASE
        WHEN NULLIF(TRIM(f.product_id), '') IS NOT NULL THEN COALESCE(p.name, TRIM(f.unregistered_product))
        ELSE TRIM(f.unregistered_product)
      END AS agg_name,
      (NULLIF(TRIM(f.product_id), '') IS NULL) AS is_unregistered,
      COALESCE(f.quantity, 0) AS quantity,
      COALESCE(f.amount, 0) AS amount,
      COALESCE(f.cost_amount, 0) AS cost_amount
    FROM filtered f
    LEFT JOIN products p ON p.id = f.product_id
  )
  SELECT
    k.agg_id AS id,
    MAX(k.agg_name) AS name,
    SUM(k.quantity) AS total_quantity,
    SUM(k.amount) AS amount,
    SUM(k.cost_amount) AS cost_amount,
    CASE
      WHEN SUM(k.quantity) > 0 THEN SUM(k.amount) / SUM(k.quantity)
      ELSE NULL
    END AS avg_unit_price,
    BOOL_OR(k.is_unregistered) AS is_unregistered,
    COUNT(*)::bigint AS detail_count
  FROM keyed k
  GROUP BY k.agg_id
  ORDER BY
    CASE
      WHEN SUM(k.quantity) > 0 THEN SUM(k.amount) / SUM(k.quantity)
      ELSE NULL
    END DESC NULLS LAST,
    k.agg_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_manufacturing_plan_aggregated(date, date) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_manufacturing_plan_aggregated IS
  '見積製造検討一覧: 全ステータス・未登録商品名集計・商品コード単位';
