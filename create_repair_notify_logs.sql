-- 修理依頼の担当者通知ログ（メール / LINE / LINE WORKS）
-- ※ create_lineworks_integration.sql にも同内容を含めています（どちらか一方で可）

create table if not exists public.repair_notify_logs (
    id uuid primary key default gen_random_uuid(),
    repair_request_id uuid references public.repair_requests(id) on delete cascade,
    channel text not null,
    recipient text not null,
    status text not null check (status in ('sent', 'failed', 'skipped')),
    error_message text,
    created_at timestamptz not null default now()
);

create index if not exists idx_repair_notify_logs_repair
    on public.repair_notify_logs (repair_request_id, created_at desc);

comment on table public.repair_notify_logs is '修理依頼の担当者通知送信ログ';

alter table public.repair_notify_logs drop constraint if exists repair_notify_logs_channel_check;
alter table public.repair_notify_logs add constraint repair_notify_logs_channel_check
    check (channel in ('email', 'line', 'lineworks'));
