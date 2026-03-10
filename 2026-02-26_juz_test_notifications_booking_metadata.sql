-- Add metadata so notifications can deep-link into booked Juz Test schedule entries

alter table public.juz_test_notifications
  add column if not exists notification_type text;

update public.juz_test_notifications
set notification_type = 'examiner_request'
where notification_type is null;

alter table public.juz_test_notifications
  alter column notification_type set default 'examiner_request';

alter table public.juz_test_notifications
  alter column notification_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'juz_test_notifications_notification_type_check'
      and conrelid = 'public.juz_test_notifications'::regclass
  ) then
    alter table public.juz_test_notifications
      add constraint juz_test_notifications_notification_type_check
      check (notification_type in ('examiner_request', 'teacher_booking'));
  end if;
end $$;

alter table public.juz_test_notifications
  add column if not exists session_id uuid references public.test_sessions(id) on delete set null;

alter table public.juz_test_notifications
  add column if not exists scheduled_date date;

alter table public.juz_test_notifications
  add column if not exists slot_number smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'juz_test_notifications_slot_number_check'
      and conrelid = 'public.juz_test_notifications'::regclass
  ) then
    alter table public.juz_test_notifications
      add constraint juz_test_notifications_slot_number_check
      check (slot_number is null or slot_number between 1 and 5);
  end if;
end $$;

create index if not exists juz_test_notifications_type_status_created_idx
  on public.juz_test_notifications (notification_type, status, created_at desc);

create index if not exists juz_test_notifications_session_id_idx
  on public.juz_test_notifications (session_id);
