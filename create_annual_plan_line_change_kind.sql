-- 確定後の追加行を「当初の変更」と「中間計画変更」に分ける
-- 実行先: 見積システム（estimate-system）の Supabase SQL Editor

ALTER TABLE public.annual_staff_plan_lines
  ADD COLUMN IF NOT EXISTS change_kind text NOT NULL DEFAULT 'initial';

ALTER TABLE public.annual_staff_plan_lines
  DROP CONSTRAINT IF EXISTS annual_staff_plan_lines_change_kind_check;

ALTER TABLE public.annual_staff_plan_lines
  ADD CONSTRAINT annual_staff_plan_lines_change_kind_check
  CHECK (change_kind IN ('initial', 'interim'));

COMMENT ON COLUMN public.annual_staff_plan_lines.change_kind IS
  'initial=当初計画（担当確定＋経営上乗せ）、interim=中間計画変更';

NOTIFY pgrst, 'reload schema';
