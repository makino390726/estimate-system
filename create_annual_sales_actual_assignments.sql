-- 売上実績の手振り替え。Excel再取込で明細IDが変わっても残すため、行の指紋で持つ
-- 実行先: 見積システムの Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.annual_sales_actual_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  staff_id text NOT NULL,
  line_fingerprint text NOT NULL,
  target_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, staff_id, line_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_annual_sales_actual_assignments_fy
  ON public.annual_sales_actual_assignments (fiscal_year, staff_id);

ALTER TABLE public.annual_sales_actual_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_sales_actual_assignments NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_sales_actual_assignments TO anon, authenticated, service_role;

DROP POLICY IF EXISTS annual_sales_actual_assignments_all ON public.annual_sales_actual_assignments;
CREATE POLICY annual_sales_actual_assignments_all ON public.annual_sales_actual_assignments
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.annual_sales_actual_assignments IS '個人シートの売上明細を計画項目へ手振り替え。target_key は計画行キーまたは bucket:カテゴリ';
