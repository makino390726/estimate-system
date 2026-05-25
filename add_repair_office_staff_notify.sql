-- 修理完了報告の事務処理 LINE WORKS 通知: staffs 拡張 + 担当事業所（複数）
-- 事前に inspect_staffs_schema.sql を実行し、staffs.id の型を確認してください。
-- 本スクリプトは staffs.id の udt_name を読み取り、staff_id の型を自動合わせします。
--
-- 運用:
--   ・担当者マスタで「事務処理担当」を ON にし、担当事業所を複数登録
--   ・通常営業所 (branch_1 … branch_6) は複数の事務担当が同じ営業所を持てる
--   ・「その他」(branch_other) は全社で1名のみ
--   ・完了報告時は repair_requests.assigned_branch で通知先を解決

-- ── ① staffs: 事務処理担当フラグ ─────────────────────────────────────
alter table public.staffs
    add column if not exists is_repair_office_notify boolean not null default false;

comment on column public.staffs.is_repair_office_notify is
    '修理完了報告の事務処理 LINE WORKS 通知担当。ON のとき staff_office_notify_branches で担当事業所を設定';

create index if not exists idx_staffs_repair_office_notify
    on public.staffs (is_repair_office_notify)
    where is_repair_office_notify = true;

-- ── ①b staffs.id を外部キー参照可能にする（PK/UNIQUE が無い環境向け）────────
-- 重複・NULL があるとここで止まります。inspect_staffs_schema.sql の ⑦ を確認してください。
do $ensure_staffs_id_unique$
declare
    dup_count integer;
    null_count integer;
begin
    select count(*) into null_count from public.staffs where id is null or trim(id::text) = '';
    if null_count > 0 then
        raise exception 'staffs.id が空の行が % 件あります。先に id を埋めてください。', null_count;
    end if;

    select count(*) into dup_count
    from (
        select id
        from public.staffs
        group by id
        having count(*) > 1
    ) d;

    if dup_count > 0 then
        raise exception
            'staffs.id が重複しています（% 組）。⑦のSQLで重複一覧を確認し、統合してから再実行してください。',
            dup_count;
    end if;

    create unique index if not exists idx_staffs_id_unique on public.staffs (id);
    raise notice 'staffs.id の一意インデックスを確認しました（idx_staffs_id_unique）';
end
$ensure_staffs_id_unique$;

-- ── ② 担当事業所（staffs.id の型に合わせて作成）──────────────────────────
do $repair_office_notify$
declare
    staff_id_udt text;
    staff_id_sql text;
    ddl text;
begin
    select c.udt_name
    into staff_id_udt
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'staffs'
      and c.column_name = 'id';

    if staff_id_udt is null then
        raise exception 'public.staffs.id が見つかりません。inspect_staffs_schema.sql で確認してください。';
    end if;

    staff_id_sql := case staff_id_udt
        when 'uuid' then 'uuid'
        when 'int8' then 'bigint'
        when 'int4' then 'integer'
        when 'int2' then 'smallint'
        when 'text' then 'text'
        when 'varchar' then 'character varying'
        else staff_id_udt
    end;

    raise notice 'staffs.id udt_name=%, staff_office_notify_branches.staff_id type=%',
        staff_id_udt, staff_id_sql;

    -- 型違いで既存テーブルがある場合は一度削除（未運用想定）
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'staff_office_notify_branches'
    ) then
        execute 'drop table public.staff_office_notify_branches cascade';
        raise notice '既存の staff_office_notify_branches を削除して再作成しました';
    end if;

    ddl := format($ddl$
        create table public.staff_office_notify_branches (
            id uuid primary key default gen_random_uuid(),
            staff_id %1$s not null references public.staffs (id) on delete cascade,
            branch_id text not null,
            created_at timestamptz not null default now(),

            constraint staff_office_notify_branches_staff_branch_unique
                unique (staff_id, branch_id),

            constraint staff_office_notify_branches_branch_id_check
                check (
                    branch_id in (
                        'branch_1',
                        'branch_2',
                        'branch_3',
                        'branch_4',
                        'branch_5',
                        'branch_6',
                        'branch_other'
                    )
                )
        );

        comment on table public.staff_office_notify_branches is
            '事務処理担当が受け持つ営業所（修理完了報告の LINE WORKS 通知範囲）';
        comment on column public.staff_office_notify_branches.staff_id is
            'staffs.id（型: %1$s / udt: %2$s）';
        comment on column public.staff_office_notify_branches.branch_id is
            'repair_requests.assigned_branch と同じ ID。branch_other=その他（営業所以外・全社1名）';

        create index idx_staff_office_notify_branches_staff
            on public.staff_office_notify_branches (staff_id);

        create index idx_staff_office_notify_branches_branch
            on public.staff_office_notify_branches (branch_id);

        create unique index idx_staff_office_notify_branch_other_one
            on public.staff_office_notify_branches (branch_id)
            where branch_id = 'branch_other';
    $ddl$, staff_id_sql, staff_id_udt);

    execute ddl;
end
$repair_office_notify$;

-- ── ③ 整合性トリガー ───────────────────────────────────────────────────
create or replace function public.staff_office_notify_branches_staff_must_be_office()
returns trigger
language plpgsql
as $$
declare
    ok boolean;
begin
    select s.is_repair_office_notify
    into ok
    from public.staffs s
    where s.id = new.staff_id;

    if coalesce(ok, false) = false then
        raise exception
            '事務処理担当が OFF の担当者には担当事業所を登録できません（staff_id=%）',
            new.staff_id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_staff_office_notify_branches_staff_check
    on public.staff_office_notify_branches;
create trigger trg_staff_office_notify_branches_staff_check
    before insert or update on public.staff_office_notify_branches
    for each row
    execute function public.staff_office_notify_branches_staff_must_be_office();

-- ── ④ 参照用ビュー ─────────────────────────────────────────────────────
create or replace view public.v_repair_office_notify_targets as
select
    s.id as staff_id,
    s.name as staff_name,
    s.email,
    b.branch_id,
    case b.branch_id
        when 'branch_1' then '南九州営業所'
        when 'branch_2' then '中九州営業所'
        when 'branch_3' then '西九州営業所'
        when 'branch_4' then '東日本営業所'
        when 'branch_5' then '沖縄出張所'
        when 'branch_6' then '東北出張所'
        when 'branch_other' then 'その他'
        else b.branch_id
    end as branch_label,
    b.branch_id = 'branch_other' as is_other_exclusive_slot
from public.staffs s
inner join public.staff_office_notify_branches b on b.staff_id = s.id
where s.is_repair_office_notify = true
order by b.branch_id, s.name;

comment on view public.v_repair_office_notify_targets is
    '営業所別の事務処理 LINE WORKS 通知担当一覧（開発・運用確認用）';

-- ── ⑤ RLS（担当者画面を anon で触る場合）──────────────────────────────
alter table public.staff_office_notify_branches enable row level security;

drop policy if exists "staff_office_notify_branches_anon_all"
    on public.staff_office_notify_branches;
create policy "staff_office_notify_branches_anon_all"
    on public.staff_office_notify_branches
    for all
    to anon, authenticated
    using (true)
    with check (true);
