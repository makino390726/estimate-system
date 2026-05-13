-- ============================================================
-- 修理案件管理システム（修理受付DB）
-- ============================================================

create extension if not exists pgcrypto;

-- ① repair_requests: 修理受付テーブル（案件管理の中心）
create table if not exists public.repair_requests (
    id uuid primary key default gen_random_uuid(),

    -- 受付情報
    request_no serial,
    received_at timestamptz not null default now(),
    received_via text not null default 'phone'
        check (received_via in ('phone', 'line', 'web', 'visit', 'other')),
    priority text not null default 'normal'
        check (priority in ('urgent', 'high', 'normal', 'low')),

    -- ステータス管理
    status text not null default 'received'
        check (status in (
            'received',        -- 受付
            'confirming',      -- 確認中
            'phone_done',      -- 電話対応済
            'visit_scheduled', -- 出張予定
            'parts_waiting',   -- 部品待ち
            'repairing',       -- 修理中
            'completed',       -- 修理完了
            'billed',          -- 請求済
            'closed'           -- クローズ
        )),

    -- 顧客情報
    customer_name text not null,
    customer_address text,
    customer_phone text,
    customer_mobile text,
    customer_region text,

    -- 機械情報
    category text,
    machine_type text,
    model text,
    serial_no text,
    manufacturing_year text,
    usage_years numeric(4, 1),

    -- 症状
    symptom text not null,
    symptom_category text,
    error_code text,
    symptom_detail text,

    -- 添付
    photo_urls jsonb default '[]'::jsonb,
    video_urls jsonb default '[]'::jsonb,

    -- 対応情報
    assigned_branch text,
    assigned_staff text,
    visit_scheduled_date date,
    visit_completed_date date,

    -- 修理内容
    treatment_details text,
    root_cause text,
    repair_duration_minutes integer,
    repair_cost numeric(12, 0),

    -- LINE連携
    line_user_id text,
    line_message_id text,

    -- 既存テーブルとのリンク
    customer_register_id uuid references public.customer_register_rows(id) on delete set null,
    service_repair_report_id uuid references public.service_repair_reports(id) on delete set null,

    -- メタ
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_repair_requests_status on public.repair_requests (status);
create index if not exists idx_repair_requests_priority on public.repair_requests (priority);
create index if not exists idx_repair_requests_received_at on public.repair_requests (received_at desc);
create index if not exists idx_repair_requests_customer_name on public.repair_requests (customer_name);
create index if not exists idx_repair_requests_model on public.repair_requests (model);
create index if not exists idx_repair_requests_serial_no on public.repair_requests (serial_no);
create index if not exists idx_repair_requests_assigned_staff on public.repair_requests (assigned_staff);
create index if not exists idx_repair_requests_assigned_branch on public.repair_requests (assigned_branch);
create index if not exists idx_repair_requests_symptom_category on public.repair_requests (symptom_category);
create index if not exists idx_repair_requests_customer_region on public.repair_requests (customer_region);

comment on table public.repair_requests is '修理受付テーブル（修理案件管理の中心）';
comment on column public.repair_requests.request_no is '受付番号（自動採番）';
comment on column public.repair_requests.received_via is '受付経路（phone/line/web/visit/other）';
comment on column public.repair_requests.priority is '優先度（urgent/high/normal/low）';
comment on column public.repair_requests.status is 'ステータス';
comment on column public.repair_requests.symptom is '症状（メイン）';
comment on column public.repair_requests.symptom_category is '症状分類（火がつかない/温度上がらない/異音/エラー等）';
comment on column public.repair_requests.repair_duration_minutes is '修理所要時間（分）';
comment on column public.repair_requests.repair_cost is '修理費用';
comment on column public.repair_requests.customer_register_id is '顧客登録情報へのリンク';
comment on column public.repair_requests.service_repair_report_id is '出張修理管理表へのリンク';

-- ② repair_parts: 交換部品テーブル
create table if not exists public.repair_parts (
    id uuid primary key default gen_random_uuid(),
    repair_request_id uuid not null references public.repair_requests(id) on delete cascade,
    part_name text not null,
    part_code text,
    quantity integer not null default 1,
    unit_price numeric(12, 0),
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_repair_parts_request on public.repair_parts (repair_request_id);
create index if not exists idx_repair_parts_name on public.repair_parts (part_name);

comment on table public.repair_parts is '修理交換部品テーブル';

-- ③ repair_status_history: ステータス変更履歴
create table if not exists public.repair_status_history (
    id uuid primary key default gen_random_uuid(),
    repair_request_id uuid not null references public.repair_requests(id) on delete cascade,
    old_status text,
    new_status text not null,
    changed_by text,
    changed_at timestamptz not null default now(),
    comment text
);

create index if not exists idx_repair_status_history_request on public.repair_status_history (repair_request_id, changed_at desc);

comment on table public.repair_status_history is '修理ステータス変更履歴';

-- ④ machine_cards ビュー: 機械カルテ
create or replace view public.machine_cards as
select
    cr.id as customer_register_id,
    cr.customer_name,
    cr.address,
    cr.phone,
    cr.mobile,
    cr.staff_name as sales_staff,
    cr.sheet_type as category,
    cr.model,
    cr.model_no,
    cr.model_full,
    cr.serial_no,
    cr.manufacturing_no,
    cr.shipment_date,
    cr.purchase_ymd,
    cr.dealer_name,
    -- 修理統計
    coalesce(repair_stats.repair_count, 0) as repair_count,
    repair_stats.last_repair_date,
    repair_stats.total_repair_cost,
    repair_stats.total_parts_count,
    -- 使用年数（出荷日からの計算）
    case
        when cr.shipment_date is not null
        then round(extract(epoch from (now() - cr.shipment_date::timestamp)) / (365.25 * 86400), 1)
        else null
    end as calculated_usage_years,
    -- 更新推奨フラグ
    case
        when coalesce(repair_stats.repair_count, 0) >= 5
            or (cr.shipment_date is not null
                and extract(epoch from (now() - cr.shipment_date::timestamp)) / (365.25 * 86400) >= 15)
        then true
        else false
    end as update_recommended
from public.customer_register_rows cr
left join lateral (
    select
        count(*) as repair_count,
        max(rr.visit_completed_date) as last_repair_date,
        sum(rr.repair_cost) as total_repair_cost,
        sum(coalesce(parts.cnt, 0)) as total_parts_count
    from public.repair_requests rr
    left join lateral (
        select count(*) as cnt from public.repair_parts rp where rp.repair_request_id = rr.id
    ) parts on true
    where rr.serial_no = cr.serial_no and cr.serial_no is not null and cr.serial_no != ''
       or rr.customer_register_id = cr.id
) repair_stats on true;

comment on view public.machine_cards is '機械カルテビュー（顧客登録情報＋修理履歴統合）';

-- ⑤ updated_at 自動更新トリガー
create or replace function public.fn_repair_requests_update_timestamp()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_repair_requests_update_timestamp on public.repair_requests;
create trigger trg_repair_requests_update_timestamp
before update on public.repair_requests
for each row
execute function public.fn_repair_requests_update_timestamp();

-- ⑥ 優先度自動判定関数
create or replace function public.fn_repair_auto_priority()
returns trigger language plpgsql as $$
begin
    if new.priority = 'normal' then
        -- 冬季（11月〜3月）の暖房系で「停止」「つかない」「動かない」は緊急
        if (extract(month from now()) in (11, 12, 1, 2, 3))
           and (new.category ilike '%暖房%' or new.machine_type ilike '%暖房%')
           and (new.symptom ilike '%停止%' or new.symptom ilike '%つかない%' or new.symptom ilike '%動かない%')
        then
            new.priority := 'urgent';
        -- シーズン中の乾燥機停止も緊急
        elsif (new.category ilike '%乾燥%' or new.machine_type ilike '%乾燥%')
              and (new.symptom ilike '%停止%' or new.symptom ilike '%動かない%')
        then
            new.priority := 'high';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_repair_auto_priority on public.repair_requests;
create trigger trg_repair_auto_priority
before insert on public.repair_requests
for each row
execute function public.fn_repair_auto_priority();
