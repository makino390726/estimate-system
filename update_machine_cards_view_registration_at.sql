-- 機械カルテビュー: 登録日時（registration_at）を追加
-- ※列は SELECT の末尾にのみ追加（途中に挟むと REPLACE 時に 42P16: cannot change name of view column）
-- Supabase SQL エディタ等で実行してください。
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
    coalesce(repair_stats.repair_count, 0) as repair_count,
    repair_stats.last_repair_date,
    repair_stats.total_repair_cost,
    repair_stats.total_parts_count,
    case
        when cr.shipment_date is not null
        then round(extract(epoch from (now() - cr.shipment_date::timestamp)) / (365.25 * 86400), 1)
        else null
    end as calculated_usage_years,
    case
        when coalesce(repair_stats.repair_count, 0) >= 5
            or (cr.shipment_date is not null
                and extract(epoch from (now() - cr.shipment_date::timestamp)) / (365.25 * 86400) >= 15)
        then true
        else false
    end as update_recommended,
    cr.created_at as registration_at
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

comment on view public.machine_cards is '機械カルテビュー（顧客登録情報＋修理履歴統合、registration_at=顧客登録行の作成日時）';
