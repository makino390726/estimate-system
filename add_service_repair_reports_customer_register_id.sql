-- 出張修理管理表 → 顧客カルテ行への紐づけ（照合成功分のみ保存）

alter table public.service_repair_reports
    add column if not exists customer_register_id uuid references public.customer_register_rows(id) on delete set null;

create index if not exists idx_service_repair_reports_customer_register
    on public.service_repair_reports (customer_register_id);

comment on column public.service_repair_reports.customer_register_id is '照合で確定した顧客カルテ行（customer_register_rows.id）';
