-- 顧客マスタに得意先の回収条件（予定日1）を保持する
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS close_day integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collect_cycle integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collect_cycle_name text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collect_day integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS collect_term_name text;

COMMENT ON COLUMN public.customers.customer_code IS '得意先コード（得意先マスタ）';
COMMENT ON COLUMN public.customers.close_day IS '締日(1)。99は月末';
COMMENT ON COLUMN public.customers.collect_cycle IS '回収サイクル(1)の月数。0当月 1翌月 2以降';
COMMENT ON COLUMN public.customers.collect_cycle_name IS '回収サイクル名(1)';
COMMENT ON COLUMN public.customers.collect_day IS '回収日(1)。99は月末';
COMMENT ON COLUMN public.customers.collect_term_name IS '回収条件1取引条件名1';

CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON public.customers (customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name_norm ON public.customers (name);
