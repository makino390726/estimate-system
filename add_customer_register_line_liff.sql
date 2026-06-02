-- 顧客 LINE 登録 LIFF 用（任意）
-- customer_register_rows.raw_data に line_user_id / postal_code を格納するため、
-- 追加列なしでも動作します。検索を速くする場合のみ以下を実行してください。

-- alter table public.customer_register_rows
--     add column if not exists line_user_id text;

-- create index if not exists idx_customer_register_rows_line_user
--     on public.customer_register_rows (line_user_id)
--     where line_user_id is not null;

comment on table public.line_customer_mappings is
    '顧客LINE紐付け（友だち追加登録・修理受付で更新）。1 LINE ID = 1行、複数機械は customer_register_rows を raw_data.line_user_id で関連';
