-- 修理案件: LINE WORKS「確認しました」用ステータス「担当者確認」を追加
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

comment on column public.repair_requests.status is 'received=受付, staff_confirmed=担当者確認(LINE WORKS), confirming=確認中, ...';
