-- Simplify enrollments status check (remove pending_verification).
-- Run this only if the table was created with pending_verification.

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
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%pending_verification%';

  if constraint_name is not null then
    execute format('alter table public.enrollments drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.enrollments
  add constraint enrollments_status_check
  check (status in (
    'draft',
    'pending_payment',
    'active',
    'paused',
    'cancelled',
    'completed'
  ));

commit;
