-- 修理フロー前提を一括適用（Supabase SQL Editor に貼り付けて実行）
-- 個別ファイル: add_repair_status_staff_confirmed.sql, add_repair_visit_fee_labor_cost.sql, add_repair_customer_acknowledged.sql

-- ① staff_confirmed ステータス
alter table public.repair_requests
    drop constraint if exists repair_requests_status_check;

alter table public.repair_requests
    add constraint repair_requests_status_check
    check (status in (
        'received',
        'staff_confirmed',
        'confirming',
        'phone_done',
        'visit_scheduled',
        'parts_waiting',
        'repairing',
        'completed',
        'billed',
        'closed'
    ));

comment on column public.repair_requests.status is '本システム: received=受付, staff_confirmed=担当者確認, repairing=修理中, completed=完了（請求以降は別システム）。旧値 confirming等もDB制約上残存';

-- ② 出張費・工賃
alter table public.repair_requests
    add column if not exists visit_fee numeric(12, 0),
    add column if not exists labor_cost numeric(12, 0);

comment on column public.repair_requests.visit_fee is '出張費（円）';
comment on column public.repair_requests.labor_cost is '工賃（円）';

-- ③ 顧客承諾日時
alter table public.repair_requests
    add column if not exists customer_acknowledged_at timestamptz;

comment on column public.repair_requests.customer_acknowledged_at is '顧客がLINEで完了報告を承諾した日時';

create index if not exists idx_repair_requests_customer_ack
    on public.repair_requests (customer_acknowledged_at)
    where customer_acknowledged_at is not null;
