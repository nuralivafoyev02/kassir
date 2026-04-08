begin;

create index if not exists idx_users_created_at_desc
on public.users (created_at desc, user_id desc);

create index if not exists idx_users_last_start_date
on public.users (last_start_date desc);

create index if not exists idx_users_daily_reminder_queue
on public.users (user_id asc, last_daily_reminder_at asc)
where daily_reminder_enabled = true;

create index if not exists idx_users_daily_report_queue
on public.users (user_id asc, last_daily_report_at asc)
where daily_reminder_enabled = true;

create index if not exists idx_category_limits_user_created_at
on public.category_limits (user_id, created_at desc);

create index if not exists idx_broadcasts_created_at_desc
on public.broadcasts (created_at desc);

create index if not exists idx_notification_logs_setting_sent_at
on public.notification_logs (setting_key, sent_at desc);

create index if not exists idx_debts_remind_queue
on public.debts (remind_at asc, id asc)
where status = 'open'
  and reminder_sent_at is null
  and remind_at is not null;

create index if not exists idx_debts_due_queue
on public.debts (due_at asc, id asc)
where status = 'open'
  and reminder_sent_at is null
  and remind_at is null
  and due_at is not null;

analyze public.users;
analyze public.debts;
analyze public.broadcasts;
analyze public.category_limits;
analyze public.notification_logs;

notify pgrst, 'reload schema';

commit;
