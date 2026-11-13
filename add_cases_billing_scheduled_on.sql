-- 受注（成約）時の請求予定日。回収月の起算に使う
-- 実行先: 見積システムの Supabase SQL Editor

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS billing_scheduled_on date;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS collection_month text;

COMMENT ON COLUMN public.cases.billing_scheduled_on IS '受注（成約）の請求予定日。顧客の締日と回収サイクルから回収月を出す';
COMMENT ON COLUMN public.cases.collection_month IS 'マスタに締日・回収サイクルがないときの回収月。YYYY-MM';
