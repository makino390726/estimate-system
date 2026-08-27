-- 営業所ノルマ（会社目標）。担当者の積み上げ計画とは別レイヤー
-- 粒度は 営業所 × 科目（生産品/肥料/農薬/資材/工事）の金額
-- 実行先: 見積システム（estimate-system）の Supabase SQL Editor
--
-- 確認用:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'annual_office_quota_years',
--     'annual_office_quota_lines',
--     'annual_office_quota_allocations'
--   )
-- ORDER BY table_name;

CREATE TABLE IF NOT EXISTS public.annual_office_quota_years (
  fiscal_year integer PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.annual_office_quota_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL
    REFERENCES public.annual_office_quota_years(fiscal_year) ON DELETE CASCADE,
  office_key text NOT NULL,
  plan_category text NOT NULL
    CHECK (plan_category IN ('生産品', '肥料', '農薬', '資材', '工事')),
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, office_key, plan_category)
);

CREATE TABLE IF NOT EXISTS public.annual_office_quota_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL
    REFERENCES public.annual_office_quota_years(fiscal_year) ON DELETE CASCADE,
  office_key text NOT NULL,
  staff_id text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, office_key, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_annual_office_quota_lines_fy
  ON public.annual_office_quota_lines (fiscal_year, office_key);

CREATE INDEX IF NOT EXISTS idx_annual_office_quota_alloc_fy
  ON public.annual_office_quota_allocations (fiscal_year, office_key);

ALTER TABLE public.annual_office_quota_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_office_quota_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_office_quota_allocations DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.annual_office_quota_years NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.annual_office_quota_lines NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.annual_office_quota_allocations NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_office_quota_years TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_office_quota_lines TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_office_quota_allocations TO anon, authenticated, service_role;

DROP POLICY IF EXISTS annual_office_quota_years_all ON public.annual_office_quota_years;
CREATE POLICY annual_office_quota_years_all ON public.annual_office_quota_years
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS annual_office_quota_lines_all ON public.annual_office_quota_lines;
CREATE POLICY annual_office_quota_lines_all ON public.annual_office_quota_lines
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS annual_office_quota_allocations_all ON public.annual_office_quota_allocations;
CREATE POLICY annual_office_quota_allocations_all ON public.annual_office_quota_allocations
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.annual_office_quota_years IS '年度の営業所ノルマヘッダ。担当者計画とは別';
COMMENT ON TABLE public.annual_office_quota_lines IS '営業所×科目のノルマ金額。office_key は branches.ts の branch_id';
COMMENT ON TABLE public.annual_office_quota_allocations IS '営業所ノルマの担当者配分（任意）。合計は営業所ノルマ以下';
COMMENT ON COLUMN public.annual_office_quota_lines.office_key IS 'branch_1 など。表示名は営業所マスタ';
