-- staffs テーブルの現状確認（Supabase SQL Editor で実行）
-- 結果を見てから add_repair_office_staff_notify.sql を実行してください。

-- ① カラム名・型・NULL・デフォルト
select
    c.ordinal_position as pos,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'staffs'
order by c.ordinal_position;

-- ② 主キー・外部キー・CHECK・UNIQUE
select
    tc.constraint_type,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name as foreign_table,
    ccu.column_name as foreign_column
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
    and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.table_name = 'staffs'
order by tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- ③ インデックス
select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'staffs'
order by indexname;

-- ④ staffs.id の型だけ（マイグレーション用・1行）
select
    c.column_name,
    c.data_type,
    c.udt_name,
    case c.udt_name
        when 'uuid' then 'uuid'
        when 'int8' then 'bigint'
        when 'int4' then 'integer'
        when 'int2' then 'smallint'
        when 'text' then 'text'
        when 'varchar' then 'character varying'
        else c.udt_name
    end as suggested_sql_type_for_fk
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'staffs'
  and c.column_name = 'id';

-- ⑤ 件数サンプル（先頭5件・id の見え方確認）
select *
from public.staffs
order by name
limit 5;

-- ⑥ 既に事務用カラム／中間テーブルがあるか
select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staffs'
      and column_name = 'is_repair_office_notify'
) as has_is_repair_office_notify;

select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'staff_office_notify_branches'
) as has_staff_office_notify_branches;

-- ⑦ staffs.id の重複・空（FK エラー 42830 の原因確認）
select id, count(*) as cnt
from public.staffs
group by id
having count(*) > 1
order by cnt desc, id;

select id, name
from public.staffs
where id is null or trim(id::text) = ''
order by name;

-- ⑧ staffs.id に PK / UNIQUE があるか
select
    c.constraint_type,
    c.constraint_name
from information_schema.table_constraints c
join information_schema.key_column_usage kcu
    on c.constraint_name = kcu.constraint_name
    and c.table_schema = kcu.table_schema
where c.table_schema = 'public'
  and c.table_name = 'staffs'
  and kcu.column_name = 'id'
  and c.constraint_type in ('PRIMARY KEY', 'UNIQUE');
