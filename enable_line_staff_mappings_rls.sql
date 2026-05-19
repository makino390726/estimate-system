-- line_staff_mappings: ブラウザ（anon）から直接読む場合の RLS（API 経由なら service role で不要）
-- Supabase SQL Editor で実行

alter table public.line_staff_mappings enable row level security;

drop policy if exists "line_staff_mappings_anon_all" on public.line_staff_mappings;
create policy "line_staff_mappings_anon_all"
    on public.line_staff_mappings
    for all
    to anon, authenticated
    using (true)
    with check (true);
