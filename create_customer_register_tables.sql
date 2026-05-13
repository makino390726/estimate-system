create extension if not exists pgcrypto;

create table if not exists public.customer_register_import_batches (
    id uuid primary key default gen_random_uuid(),
    source_file_name text,
    source_file_path text,
    imported_by text,
    imported_at timestamptz not null default now(),
    note text
);

create table if not exists public.customer_register_rows (
    id uuid primary key default gen_random_uuid(),
    import_batch_id uuid references public.customer_register_import_batches(id) on delete set null,

    -- シート識別
    sheet_name text not null,
    sheet_type text not null default 'unknown',
    source_row_no integer,

    -- 全シート共通で取得できた列
    shipment_date date,
    customer_name text,
    address text,
    phone text,
    mobile text,
    staff_name text,
    slip_no text,
    purchase_ymd text,
    dealer_name text,

    -- 機種系の準共通列（シートにより名称が異なるため分割保持）
    model text,
    model_no text,
    serial_no text,
    manufacturing_no text,
    burner_no text,
    outlet_type text,
    model_full text,

    -- シート固有列は JSONB に保持
    raw_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_customer_register_rows_sheet
    on public.customer_register_rows (sheet_name, source_row_no);

create index if not exists idx_customer_register_rows_type_date
    on public.customer_register_rows (sheet_type, shipment_date desc);

create index if not exists idx_customer_register_rows_customer_name
    on public.customer_register_rows (customer_name);

create index if not exists idx_customer_register_rows_serial
    on public.customer_register_rows (serial_no);

create index if not exists idx_customer_register_rows_model_full
    on public.customer_register_rows (model_full);

create index if not exists idx_customer_register_rows_dealer
    on public.customer_register_rows (dealer_name);

create index if not exists idx_customer_register_rows_raw_data_gin
    on public.customer_register_rows using gin (raw_data);

comment on table public.customer_register_import_batches is '顧客登録情報 取込バッチ';
comment on table public.customer_register_rows is '顧客登録情報 明細（可変列対応）';
comment on column public.customer_register_rows.sheet_name is '取込元シート名';
comment on column public.customer_register_rows.sheet_type is '機種カテゴリ（シート分類）';
comment on column public.customer_register_rows.source_row_no is 'Excel上の行番号';
comment on column public.customer_register_rows.shipment_date is '出荷日';
comment on column public.customer_register_rows.customer_name is 'お客様氏名';
comment on column public.customer_register_rows.address is '住所';
comment on column public.customer_register_rows.phone is '固定電話';
comment on column public.customer_register_rows.mobile is '携帯電話';
comment on column public.customer_register_rows.staff_name is '担当者';
comment on column public.customer_register_rows.slip_no is '伝票番号';
comment on column public.customer_register_rows.purchase_ymd is '購入年月日（文字列保持）';
comment on column public.customer_register_rows.dealer_name is '販売店名';
comment on column public.customer_register_rows.model is '型式';
comment on column public.customer_register_rows.model_no is '型式番号';
comment on column public.customer_register_rows.model_full is '表示用型式（暖房機は 型式-吹出口 で自動生成）';
comment on column public.customer_register_rows.serial_no is '本体番号';
comment on column public.customer_register_rows.manufacturing_no is '製造番号';
comment on column public.customer_register_rows.burner_no is 'バーナ番号';
comment on column public.customer_register_rows.outlet_type is '吹出口';
comment on column public.customer_register_rows.raw_data is 'シート固有列のKV';

create or replace function public.fn_customer_register_set_model_full()
returns trigger
language plpgsql
as $$
begin
    if new.sheet_type = 'heating' then
        new.model_full := nullif(
            trim(both '-' from (coalesce(nullif(new.model, ''), '') || '-' || coalesce(nullif(new.outlet_type, ''), ''))),
            ''
        );
    else
        new.model_full := coalesce(nullif(new.model, ''), nullif(new.model_no, ''));
    end if;

    return new;
end;
$$;

drop trigger if exists trg_customer_register_set_model_full on public.customer_register_rows;

create trigger trg_customer_register_set_model_full
before insert or update of sheet_type, model, model_no, outlet_type
on public.customer_register_rows
for each row
execute function public.fn_customer_register_set_model_full();

alter table public.customer_register_rows
    add column if not exists model text;

alter table public.customer_register_rows
    add column if not exists model_no text;

alter table public.customer_register_rows
    add column if not exists outlet_type text;

alter table public.customer_register_rows
    add column if not exists model_full text;

update public.customer_register_rows
set model_full = case
    when sheet_type = 'heating' then nullif(
        trim(both '-' from (coalesce(nullif(model, ''), '') || '-' || coalesce(nullif(outlet_type, ''), ''))),
        ''
    )
    else coalesce(nullif(model, ''), nullif(model_no, ''))
end;
