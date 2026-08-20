-- 年度計画用の会計売上実績（Excel取込）
-- 実行先: 見積システムの Supabase SQL Editor
-- 累計ファイルを取り込むため、同一年度は取込のたびに全置換する

CREATE TABLE IF NOT EXISTS public.annual_sales_actual_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  file_name text,
  sheet_name text,
  row_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  unmatched_staff_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.annual_sales_actual_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.annual_sales_actual_imports(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  slip_no text,
  billed_on date,
  product_code text,
  product_name text,
  customer_code text,
  customer_name text,
  kamoku text NOT NULL,
  plan_category text NOT NULL,
  department text,
  staff_name_raw text,
  staff_id text,
  qty numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  amount_ex_tax numeric NOT NULL DEFAULT 0,
  amount_inc_tax numeric NOT NULL DEFAULT 0,
  source_row integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annual_sales_actual_imports_fy
  ON public.annual_sales_actual_imports (fiscal_year, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_annual_sales_actual_lines_fy_staff
  ON public.annual_sales_actual_lines (fiscal_year, staff_id);

CREATE INDEX IF NOT EXISTS idx_annual_sales_actual_lines_fy_cat
  ON public.annual_sales_actual_lines (fiscal_year, plan_category);

ALTER TABLE public.annual_sales_actual_imports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_sales_actual_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_sales_actual_imports NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.annual_sales_actual_lines NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_sales_actual_imports TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_sales_actual_lines TO anon, authenticated, service_role;

DROP POLICY IF EXISTS annual_sales_actual_imports_all ON public.annual_sales_actual_imports;
CREATE POLICY annual_sales_actual_imports_all ON public.annual_sales_actual_imports
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS annual_sales_actual_lines_all ON public.annual_sales_actual_lines;
CREATE POLICY annual_sales_actual_lines_all ON public.annual_sales_actual_lines
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.annual_sales_actual_imports IS '年度計画向け売上Excelの取込バッチ。同一年度は再取込で全置換';
COMMENT ON TABLE public.annual_sales_actual_lines IS '売上明細。plan_category は 生産品/肥料/農薬/資材/工事。石油・その他資材は資材';
COMMENT ON COLUMN public.annual_sales_actual_lines.plan_category IS '進捗集計キー。Excel科目の石油・その他資材は資材へ寄せる';
