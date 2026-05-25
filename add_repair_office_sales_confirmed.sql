-- 事務担当の売上処理確認（完了報告後・LINE WORKS 通知 → 部品等売上処理画面で確認）
alter table public.repair_requests
    add column if not exists office_sales_confirmed_at timestamptz,
    add column if not exists office_sales_confirmed_by text;

comment on column public.repair_requests.office_sales_confirmed_at is
    '事務担当が部品等売上処理画面で確認した日時';
comment on column public.repair_requests.office_sales_confirmed_by is
    '事務確認を行った担当者名（任意・画面入力）';

create index if not exists idx_repair_requests_office_sales_confirmed
    on public.repair_requests (office_sales_confirmed_at)
    where office_sales_confirmed_at is null and status = 'completed';
