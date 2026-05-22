-- 修理案件: 出張費・工賃（repair_cost は合計として維持）

alter table public.repair_requests
    add column if not exists visit_fee numeric(12, 0),
    add column if not exists labor_cost numeric(12, 0);

comment on column public.repair_requests.visit_fee is '出張費（円）';
comment on column public.repair_requests.labor_cost is '工賃（円）';
