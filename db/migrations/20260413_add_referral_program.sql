begin;

alter table public.users
  add column if not exists username text,
  add column if not exists first_start_at timestamptz,
  add column if not exists referred_by_user_id bigint references public.users(user_id) on delete set null,
  add column if not exists referred_at timestamptz,
  add column if not exists referral_premium_granted_at timestamptz;

update public.users
set first_start_at = coalesce(first_start_at, last_start_date, created_at)
where first_start_at is null;

create index if not exists idx_users_referred_by_user
on public.users (referred_by_user_id, created_at desc);

create index if not exists idx_users_referral_reward_granted
on public.users (referral_premium_granted_at)
where referral_premium_granted_at is not null;

notify pgrst, 'reload schema';

commit;
