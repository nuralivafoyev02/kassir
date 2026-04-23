begin;

alter table public.transactions
add column if not exists currency text;

alter table public.transactions
add column if not exists original_amount numeric(18,2);

alter table public.transactions
add column if not exists exchange_rate_used numeric(12,2);

update public.transactions
set currency = 'UZS'
where currency is null
   or currency not in ('UZS', 'USD');

with usd_rows as (
  select
    id,
    replace((regexp_match(category, '\(\$([0-9]+(?:[.,][0-9]+)?)\)\s*$'))[1], ',', '.')::numeric as original_usd
  from public.transactions
  where category ~ '\(\$[0-9]+(?:[.,][0-9]+)?\)\s*$'
)
update public.transactions tx
set currency = 'USD',
    original_amount = usd_rows.original_usd,
    exchange_rate_used = case
      when usd_rows.original_usd > 0 then round(tx.amount::numeric / usd_rows.original_usd, 2)
      else tx.exchange_rate_used
    end,
    category = regexp_replace(tx.category, '\s*\(\$[0-9]+(?:[.,][0-9]+)?\)\s*$', '')
from usd_rows
where tx.id = usd_rows.id;

update public.transactions
set original_amount = amount::numeric
where original_amount is null;

alter table public.transactions
alter column currency set default 'UZS';

alter table public.transactions
alter column currency set not null;

alter table public.transactions
alter column original_amount set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_currency_chk'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
    add constraint transactions_currency_chk
    check (currency in ('UZS', 'USD'));
  end if;
exception
  when duplicate_object then
    null;
end $$;

create index if not exists idx_transactions_user_currency
on public.transactions (user_id, currency, date desc);

notify pgrst, 'reload schema';

commit;
