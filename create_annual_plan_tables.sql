-- 年度当初計画（担当者×年度のヘッダと案件行）
-- 会計年度は 前年9/1–当年8/31。fiscal_year は終了年（2027 = 2026/9/1–2027/8/31）
--
-- 実行先: 見積システム（estimate-system）の Supabase SQL Editor
--         factory-materials 側では実行しない
-- Table Editor に annual_staff_plans が出れば成功

-- 確認用（実行結果に3行出れば作成済み）:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('annual_staff_plans','annual_staff_plan_lines','annual_staff_plan_changes')
-- ORDER BY table_name;

CREATE TABLE IF NOT EXISTS public.annual_staff_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  staff_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed')),
  initial_amount numeric,
  initial_gross_profit numeric,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, staff_id)
);

CREATE TABLE IF NOT EXISTS public.annual_staff_plan_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.annual_staff_plans(id) ON DELETE CASCADE,
  category text NOT NULL,
  machine_code text NOT NULL,
  machine_name text,
  machine_source text NOT NULL DEFAULT 'factory'
    CHECK (machine_source IN ('factory', 'product')),
  qty numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'mid', 'low')),
  customer_name text,
  due_month date,
  case_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.annual_staff_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.annual_staff_plans(id) ON DELETE CASCADE,
  line_id uuid,
  action text NOT NULL,
  reason text,
  old_payload jsonb,
  new_payload jsonb,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annual_staff_plans_fy_staff
  ON public.annual_staff_plans (fiscal_year, staff_id);

CREATE INDEX IF NOT EXISTS idx_annual_staff_plan_lines_plan
  ON public.annual_staff_plan_lines (plan_id);

CREATE INDEX IF NOT EXISTS idx_annual_staff_plan_lines_machine
  ON public.annual_staff_plan_lines (machine_code);

ALTER TABLE public.annual_staff_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_staff_plan_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_staff_plan_changes DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.annual_staff_plans NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.annual_staff_plan_lines NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.annual_staff_plan_changes NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_staff_plans TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_staff_plan_lines TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_staff_plan_changes TO anon, authenticated, service_role;

DROP POLICY IF EXISTS annual_staff_plans_all ON public.annual_staff_plans;
CREATE POLICY annual_staff_plans_all ON public.annual_staff_plans
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS annual_staff_plan_lines_all ON public.annual_staff_plan_lines;
CREATE POLICY annual_staff_plan_lines_all ON public.annual_staff_plan_lines
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS annual_staff_plan_changes_all ON public.annual_staff_plan_changes;
CREATE POLICY annual_staff_plan_changes_all ON public.annual_staff_plan_changes
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.annual_staff_plans IS '担当者×年度の当初計画ヘッダ。当初金額は確定時に凍結';
COMMENT ON TABLE public.annual_staff_plan_lines IS '個人計画の1行（カテゴリ・機種・台数・金額・確度・販売予定先）';
COMMENT ON COLUMN public.annual_staff_plan_lines.machine_code IS 'factory-materials heater_models.model、または products.id';
COMMENT ON COLUMN public.annual_staff_plan_lines.customer_name IS '備考（販売予定先）';
COMMENT ON COLUMN public.annual_staff_plans.fiscal_year IS '年度の終了年。2027 = 2026/9/1–2027/8/31';
