-- ============================================================
-- LINE連携テーブル
-- ============================================================

create extension if not exists pgcrypto;

-- ① line_staff_mappings: 担当者 ⇔ LINE紐付け
-- 担当者がLINE公式アカウントを友だち追加した際に、
-- 管理画面からstaffのLINE user IDを登録する。
-- これにより、修理受付時に担当者へLINE通知を送信できる。
create table if not exists public.line_staff_mappings (
    id uuid primary key default gen_random_uuid(),
    staff_name text not null,
    line_user_id text not null,
    line_display_name text,
    notify_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (staff_name),
    unique (line_user_id)
);

create index if not exists idx_line_staff_mappings_staff on public.line_staff_mappings (staff_name);
create index if not exists idx_line_staff_mappings_line on public.line_staff_mappings (line_user_id);

comment on table public.line_staff_mappings is '担当者LINE紐付けテーブル';
comment on column public.line_staff_mappings.staff_name is 'staffsテーブルのname';
comment on column public.line_staff_mappings.line_user_id is 'LINE User ID（Uxxxxxxx形式）';
comment on column public.line_staff_mappings.notify_enabled is '通知ON/OFF';

-- ② line_customer_mappings: 顧客 ⇔ LINE紐付け
-- 顧客がLINEで修理依頼を送信した際に自動的に紐付けされる。
-- customer_nameで既存顧客との突合を行い、以降のLINE通知先として使用。
create table if not exists public.line_customer_mappings (
    id uuid primary key default gen_random_uuid(),
    line_user_id text not null unique,
    line_display_name text,
    customer_name text,
    customer_phone text,
    customer_register_id uuid references public.customer_register_rows(id) on delete set null,
    last_message_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_line_customer_mappings_line on public.line_customer_mappings (line_user_id);
create index if not exists idx_line_customer_mappings_name on public.line_customer_mappings (customer_name);

comment on table public.line_customer_mappings is '顧客LINE紐付けテーブル';
comment on column public.line_customer_mappings.line_user_id is 'LINE User ID';
comment on column public.line_customer_mappings.customer_register_id is '顧客登録情報へのリンク';

-- ③ line_message_logs: LINEメッセージ履歴
-- 修理受付時のやり取りを保存。後からの確認・分析に使用。
create table if not exists public.line_message_logs (
    id uuid primary key default gen_random_uuid(),
    line_user_id text not null,
    direction text not null check (direction in ('incoming', 'outgoing')),
    message_type text not null default 'text',
    message_text text,
    message_id text,
    repair_request_id uuid references public.repair_requests(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_line_message_logs_user on public.line_message_logs (line_user_id, created_at desc);
create index if not exists idx_line_message_logs_repair on public.line_message_logs (repair_request_id);

comment on table public.line_message_logs is 'LINEメッセージ履歴';

-- ④ updated_at 自動更新
create or replace function public.fn_line_mappings_update_timestamp()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_line_staff_mappings_ts on public.line_staff_mappings;
create trigger trg_line_staff_mappings_ts
before update on public.line_staff_mappings
for each row execute function public.fn_line_mappings_update_timestamp();

drop trigger if exists trg_line_customer_mappings_ts on public.line_customer_mappings;
create trigger trg_line_customer_mappings_ts
before update on public.line_customer_mappings
for each row execute function public.fn_line_mappings_update_timestamp();
