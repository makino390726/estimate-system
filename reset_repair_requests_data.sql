-- ============================================================
-- 修理案件データの全削除 ＋ 受付番号(request_no)を 1 から再開
-- ============================================================
-- 対象: 修理案件（repair_requests）と直接紐づく履歴のみ
-- 対象外: 顧客カルテ(customer_register_rows)、担当者マスタ、LINE紐付け等
--
-- 実行: Supabase → SQL Editor → 全文実行（本番前に件数確認推奨）
-- ============================================================

begin;

-- 実行前の件数（確認用・結果ペインに表示）
select 'repair_requests' as tbl, count(*)::bigint as cnt from public.repair_requests
union all
select 'repair_parts', count(*) from public.repair_parts
union all
select 'repair_status_history', count(*) from public.repair_status_history
union all
select 'repair_notify_logs', count(*) from public.repair_notify_logs
union all
select 'repair_lineworks_notifications', count(*) from public.repair_lineworks_notifications
union all
select 'line_message_logs (修理紐付)', count(*) from public.line_message_logs where repair_request_id is not null;

-- ① LINEメッセージ履歴は案件参照のみ解除（ログ行自体は残す）
update public.line_message_logs
set repair_request_id = null
where repair_request_id is not null;

-- ② 子テーブル → 親テーブル（存在しないテーブルはスキップされないよう個別削除）
delete from public.repair_lineworks_notifications;
delete from public.repair_notify_logs;
delete from public.repair_parts;
delete from public.repair_status_history;
delete from public.repair_requests;

-- ③ 受付番号シーケンスを 1 に戻す（次の新規案件が #1）
alter sequence if exists public.repair_requests_request_no_seq restart with 1;

-- 実行後の件数
select 'repair_requests (after)' as tbl, count(*)::bigint as cnt from public.repair_requests;

commit;

-- 次に新規受付すると request_no = 1 から採番されます。
