create extension if not exists pgcrypto;

create table if not exists public.service_repair_reports (
    id uuid primary key default gen_random_uuid(),
    branch_id text not null,
    work_date date not null,
    customer_name text not null,
    address text,
    phone text,
    mobile text,
    staff_name text,
    category text,
    model text,
    treatment_details text,
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_service_repair_reports_branch_work_date
    on public.service_repair_reports (branch_id, work_date desc);

create index if not exists idx_service_repair_reports_customer_name
    on public.service_repair_reports (customer_name);

create index if not exists idx_service_repair_reports_staff_name
    on public.service_repair_reports (staff_name);

comment on table public.service_repair_reports is '出張修理管理表';
comment on column public.service_repair_reports.branch_id is '営業所ID';
comment on column public.service_repair_reports.work_date is '作業日';
comment on column public.service_repair_reports.customer_name is 'お客様氏名';
comment on column public.service_repair_reports.address is '住所';
comment on column public.service_repair_reports.phone is '固定電話';
comment on column public.service_repair_reports.mobile is '携帯電話';
comment on column public.service_repair_reports.staff_name is '担当者';
comment on column public.service_repair_reports.category is '分野';
comment on column public.service_repair_reports.model is '型式';
comment on column public.service_repair_reports.treatment_details is '処置内容';
comment on column public.service_repair_reports.remarks is '備考';