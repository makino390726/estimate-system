-- 確認済みなのにステータスが「受付」のままの案件を一括修正（1回限り）
-- 前提: add_repair_status_staff_confirmed.sql を先に実行すること

update public.repair_requests rr
set status = 'staff_confirmed'
where rr.status = 'received'
  and exists (
    select 1
    from public.repair_lineworks_notifications n
    where n.repair_request_id = rr.id
      and n.status = 'acknowledged'
  );
