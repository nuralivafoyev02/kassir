alter table public.users
  add column if not exists plan_code text not null default 'free',
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_start_at timestamp with time zone,
  add column if not exists subscription_end_at timestamp with time zone,
  add column if not exists trial_end_at timestamp with time zone,
  add column if not exists canceled_at timestamp with time zone,
  add column if not exists grace_until timestamp with time zone;

update public.users
set
  plan_code = coalesce(nullif(plan_code, ''), 'free'),
  subscription_status = coalesce(nullif(subscription_status, ''), 'free')
where plan_code is null
   or plan_code = ''
   or subscription_status is null
   or subscription_status = '';
