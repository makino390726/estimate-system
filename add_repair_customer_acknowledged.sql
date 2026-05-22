-- 顧客が LINE で修理完了内容を承諾した日時

alter table public.repair_requests
    add column if not exists customer_acknowledged_at timestamptz;

comment on column public.repair_requests.customer_acknowledged_at is '顧客がLINEで完了報告を承諾した日時';

create index if not exists idx_repair_requests_customer_ack
    on public.repair_requests (customer_acknowledged_at)
    where customer_acknowledged_at is not null;
