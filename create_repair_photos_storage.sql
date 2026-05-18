-- 修理案件の LIFF フォーム添付写真用 Storage バケット
-- Supabase SQL Editor で実行してください。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'repair-photos',
    'repair-photos',
    true,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 公開読み取り（案件詳細で表示）
drop policy if exists "repair_photos_public_read" on storage.objects;
create policy "repair_photos_public_read"
on storage.objects for select
using (bucket_id = 'repair-photos');

-- サービスロール経由のアップロードは RLS をバイパスするため、追加の insert ポリシーは不要です。
