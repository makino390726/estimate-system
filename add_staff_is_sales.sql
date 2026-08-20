-- 年度計画の対象にする営業担当者フラグ
-- 実行先: 見積システム（estimate-system）の Supabase SQL Editor

alter table public.staffs
    add column if not exists is_sales_staff boolean not null default false;

comment on column public.staffs.is_sales_staff is
    '営業担当者。ON のときのみ年度計画の担当者リストに表示する';

create index if not exists idx_staffs_is_sales_staff
    on public.staffs (is_sales_staff)
    where is_sales_staff = true;

NOTIFY pgrst, 'reload schema';
