-- Rollback for 2026-01-29_enrollments_status_simplify.sql

begin;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.enrollments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if constraint_name is not null then
    execute format('alter table public.enrollments drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.enrollments
  add constraint enrollments_status_check
  check (status in (
    'draft',
    'pending_verification',
    'pending_payment',
    'active',
    'paused',
    'cancelled',
    'completed'
  ));

commit;
