-- LINE WORKS 修理通知・既読（確認）管理
-- Supabase SQL Editor でこのファイルをまとめて実行してください。
-- （repair_notify_logs が無い環境でも単独で完結します）

-- ── 通知ログ（未作成なら作成） ──
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

-- channel に lineworks を含める（既存制約があれば差し替え）
alter table public.repair_notify_logs drop constraint if exists repair_notify_logs_channel_check;
alter table public.repair_notify_logs add constraint repair_notify_logs_channel_check
    check (channel in ('email', 'line', 'lineworks'));

-- ── 担当者 ⇔ LINE WORKS（ログインID / メール / ユーザーID） ──
create table if not exists public.lineworks_staff_mappings (
    id uuid primary key default gen_random_uuid(),
    staff_name text not null,
    lineworks_user_id text not null,
    display_name text,
    notify_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (staff_name),
    unique (lineworks_user_id)
);

create index if not exists idx_lineworks_staff_mappings_staff
    on public.lineworks_staff_mappings (staff_name);

comment on table public.lineworks_staff_mappings is '担当者の LINE WORKS 通知先（userId またはログインメール）';
comment on column public.lineworks_staff_mappings.lineworks_user_id is 'LINE WORKS ユーザーID またはメールアドレス';

-- ── 修理依頼ごとの通知・確認状況 ──
create table if not exists public.repair_lineworks_notifications (
    id uuid primary key default gen_random_uuid(),
    repair_request_id uuid not null references public.repair_requests(id) on delete cascade,
    staff_name text not null,
    lineworks_user_id text not null,
    status text not null default 'pending' check (status in ('pending', 'acknowledged', 'failed')),
    sent_at timestamptz,
    acknowledged_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    unique (repair_request_id, staff_name)
);

create index if not exists idx_repair_lw_notify_repair
    on public.repair_lineworks_notifications (repair_request_id);
create index if not exists idx_repair_lw_notify_status
    on public.repair_lineworks_notifications (repair_request_id, status);

comment on table public.repair_lineworks_notifications is '修理依頼の LINE WORKS 通知と確認（postback）状態';
