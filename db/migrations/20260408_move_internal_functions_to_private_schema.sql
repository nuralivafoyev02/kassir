begin;

create schema if not exists private;
revoke all on schema private from public;

grant usage on schema public, storage, graphql_public to authenticator;
grant select on all tables in schema public, storage, graphql_public to authenticator;
grant usage, select on all sequences in schema public, storage, graphql_public to authenticator;
grant execute on all functions in schema public, storage, graphql_public to authenticator;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if row_to_json(NEW)::jsonb ? 'updated_at' then
     NEW.updated_at = now();
  end if;
  return NEW;
end;
$$;

create or replace function private.enforce_subscription_gate_on_debts()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_open_count integer := 0;
  v_reminder_changed boolean := false;
begin
  if NEW.user_id is null then
    return NEW;
  end if;

  if NEW.status = 'open' and not public.user_has_premium_access(NEW.user_id) then
    select count(*)
    into v_open_count
    from public.debts
    where user_id = NEW.user_id
      and status = 'open'
      and (TG_OP = 'INSERT' or id <> NEW.id);

    if v_open_count >= 1 then
      raise exception
        using errcode = 'P0001',
          message = 'Siz bepul tarifda faqat 1 ta faol qarz yaratishingiz mumkin.',
          detail = 'upgrade_required:debt_create';
    end if;

    if TG_OP = 'INSERT' then
      v_reminder_changed := true;
    else
      v_reminder_changed := NEW.remind_at is distinct from OLD.remind_at
        or NEW.due_at is distinct from OLD.due_at;
    end if;

    if v_reminder_changed and not public.is_allowed_free_debt_reminder(NEW.due_at, NEW.remind_at) then
      raise exception
        using errcode = 'P0001',
          message = 'Custom eslatma vaqti Premium tarifida mavjud.',
          detail = 'upgrade_required:custom_reminder_time';
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function private.enforce_subscription_gate_on_category_limits()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_active_count integer := 0;
begin
  if NEW.user_id is null then
    return NEW;
  end if;

  if coalesce(NEW.is_active, true) and not public.user_has_premium_access(NEW.user_id) then
    select count(*)
    into v_active_count
    from public.category_limits
    where user_id = NEW.user_id
      and coalesce(is_active, true) = true
      and (TG_OP = 'INSERT' or id <> NEW.id);

    if v_active_count >= 1 then
      raise exception
        using errcode = 'P0001',
          message = 'Siz bepul tarifda faqat 1 ta faol reja yaratishingiz mumkin.',
          detail = 'upgrade_required:plan_create';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function private.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function private.set_updated_at();

drop trigger if exists trg_broadcast_failures_updated_at on public.broadcast_failures;
create trigger trg_broadcast_failures_updated_at
before update on public.broadcast_failures
for each row execute function private.set_updated_at();

drop trigger if exists trg_broadcasts_updated_at on public.broadcasts;
create trigger trg_broadcasts_updated_at
before update on public.broadcasts
for each row execute function private.set_updated_at();

drop trigger if exists trg_debts_updated_at on public.debts;
create trigger trg_debts_updated_at
before update on public.debts
for each row execute function private.set_updated_at();

drop trigger if exists trg_category_limits_updated_at on public.category_limits;
create trigger trg_category_limits_updated_at
before update on public.category_limits
for each row execute function private.set_updated_at();

drop trigger if exists trg_notification_jobs_updated_at on public.notification_jobs;
create trigger trg_notification_jobs_updated_at
before update on public.notification_jobs
for each row execute function private.set_updated_at();

drop trigger if exists trg_notification_settings_updated_at on public.notification_settings;
create trigger trg_notification_settings_updated_at
before update on public.notification_settings
for each row execute function private.set_updated_at();

drop trigger if exists trg_user_push_tokens_updated_at on public.user_push_tokens;
create trigger trg_user_push_tokens_updated_at
before update on public.user_push_tokens
for each row execute function private.set_updated_at();

drop trigger if exists trg_debts_subscription_gate on public.debts;
create trigger trg_debts_subscription_gate
before insert or update on public.debts
for each row execute function private.enforce_subscription_gate_on_debts();

drop trigger if exists trg_category_limits_subscription_gate on public.category_limits;
create trigger trg_category_limits_subscription_gate
before insert or update on public.category_limits
for each row execute function private.enforce_subscription_gate_on_category_limits();

drop function if exists public.enforce_subscription_gate_on_category_limits();
drop function if exists public.enforce_subscription_gate_on_debts();
drop function if exists public.set_updated_at();

notify pgrst, 'reload schema';

commit;
