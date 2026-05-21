-- lineworks_staff_mappings: RLS ポリシー（anon からの読み書きを許可）
-- API は service role 推奨だが、未設定時のフォールバック用。
-- Supabase SQL Editor で実行してください。

alter table public.lineworks_staff_mappings enable row level security;

drop policy if exists "lineworks_staff_mappings_anon_all" on public.lineworks_staff_mappings;
create policy "lineworks_staff_mappings_anon_all"
    on public.lineworks_staff_mappings
    for all
    to anon, authenticated
    using (true)
    with check (true);
