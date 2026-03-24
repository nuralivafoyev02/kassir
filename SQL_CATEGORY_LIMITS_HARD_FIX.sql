-- ===== v1.2.6 category_limits hard migration for legacy prod schemas =====
-- Root fix: create table if not exists does NOT upgrade old category_limits tables.
-- This block normalizes legacy schemas (name/category/type) to the new monthly-plan schema.

do $$
declare
  has_table boolean;
  has_name boolean;
  has_category boolean;
  has_type boolean;
  has_limit_amount boolean;
  has_plan_amount boolean;
  has_limit boolean;
  c record;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'category_limits'
  ) into has_table;

  if not has_table then
    return;
  end if;

  alter table public.category_limits add column if not exists category_id bigint references public.categories(id) on delete set null;
  alter table public.category_limits add column if not exists category_name text;
  alter table public.category_limits add column if not exists amount bigint;
  alter table public.category_limits add column if not exists alert_before bigint not null default 0;
  alter table public.category_limits add column if not exists notify_bot boolean not null default true;
  alter table public.category_limits add column if not exists notify_app boolean not null default true;
  alter table public.category_limits add column if not exists is_active boolean not null default true;
  alter table public.category_limits add column if not exists month_key text not null default to_char(timezone('utc', now()), 'YYYY-MM');
  alter table public.category_limits add column if not exists last_alert_sent_at timestamptz;
  alter table public.category_limits add column if not exists created_at timestamptz not null default timezone('utc', now());
  alter table public.category_limits add column if not exists updated_at timestamptz not null default timezone('utc', now());

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'name'
  ) into has_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'category'
  ) into has_category;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'type'
  ) into has_type;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'limit_amount'
  ) into has_limit_amount;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'plan_amount'
  ) into has_plan_amount;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'category_limits' and column_name = 'limit'
  ) into has_limit;

  if has_name then
    execute $sql$
      update public.category_limits
      set category_name = coalesce(nullif(btrim(category_name), ''), nullif(btrim(name), ''))
      where category_name is null or btrim(category_name) = ''
    $sql$;
  end if;

  if has_category then
    execute $sql$
      update public.category_limits
      set category_name = coalesce(nullif(btrim(category_name), ''), nullif(btrim(category), ''))
      where category_name is null or btrim(category_name) = ''
    $sql$;
  end if;

  if has_limit_amount then
    execute $sql$
      update public.category_limits
      set amount = coalesce(amount, limit_amount, 0)
      where amount is null
    $sql$;
  end if;

  if has_plan_amount then
    execute $sql$
      update public.category_limits
      set amount = coalesce(amount, plan_amount, 0)
      where amount is null
    $sql$;
  end if;

  if has_limit then
    execute $sql$
      update public.category_limits
      set amount = coalesce(amount, "limit", 0)
      where amount is null
    $sql$;
  end if;

  update public.category_limits
  set category_name = 'Boshqa'
  where category_name is null or btrim(category_name) = '';

  update public.category_limits
  set amount = 0
  where amount is null;

  update public.category_limits
  set alert_before = 0
  where alert_before is null;

  update public.category_limits
  set notify_bot = true
  where notify_bot is null;

  update public.category_limits
  set notify_app = true
  where notify_app is null;

  update public.category_limits
  set is_active = true
  where is_active is null;

  update public.category_limits
  set month_key = to_char(timezone('utc', coalesce(created_at, now())), 'YYYY-MM')
  where month_key is null or btrim(month_key) = '';

  alter table public.category_limits alter column category_name set not null;
  alter table public.category_limits alter column amount set not null;
  alter table public.category_limits alter column amount set default 0;
  alter table public.category_limits alter column alert_before set default 0;

  if has_type then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.category_limits'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) ilike '%user_id%'
        and pg_get_constraintdef(oid) ilike '%category%'
        and pg_get_constraintdef(oid) ilike '%type%'
    loop
      execute format('alter table public.category_limits drop constraint %I', c.conname);
    end loop;
  end if;
end $$;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(category_name), month_key
      order by coalesce(updated_at, created_at, timezone('utc', now())) desc, id desc
    ) as rn
  from public.category_limits
)
delete from public.category_limits t
using ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists uq_category_limits_user_category_month
  on public.category_limits (user_id, category_name, month_key);
