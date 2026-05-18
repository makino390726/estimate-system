-- 担当者マスタ: 所属営業所・部署（修理依頼メール通知の宛先解決に使用）
-- Supabase SQL Editor で実行してください。

alter table public.staffs
  add column if not exists branch_id text,
  add column if not exists department text;

comment on column public.staffs.branch_id is '所属営業所ID（BRANCHES.id / repair_requests.assigned_branch と同一）';
comment on column public.staffs.department is '所属部署（管理部・企画部・各営業所・製造部・技術部など）';

create index if not exists idx_staffs_branch_id on public.staffs (branch_id);
