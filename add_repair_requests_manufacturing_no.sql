-- 修理案件: 現地で判明する製造番号（銘板等）。受付時は空のままで可。
alter table public.repair_requests add column if not exists manufacturing_no text;

comment on column public.repair_requests.manufacturing_no is '製造番号（銘板・現地確認。電話/LINE受付では不明なことが多い）';
