begin;

--------------------------------------------------------------------------------
-- 1) Harden helper functions (RLS-safe checks)
--------------------------------------------------------------------------------
create or replace function public.is_tenant_member_for_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.tenant_id = s.tenant_id
    where s.id = p_student_id
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_assigned_teacher_for_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.assigned_teacher_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_parent_for_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.parent_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_admin_for_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = s.tenant_id
    where s.id = p_student_id
  ) into ok;
  return ok;
end;
$$;

--------------------------------------------------------------------------------
-- 2) Ensure report fields are normalized on write
--------------------------------------------------------------------------------
create or replace function public.set_report_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);

  if new.teacher_id is null then
    new.teacher_id := auth.uid();
  end if;

  if new.student_id is not null then
    select s.tenant_id into new.tenant_id
    from public.students s
    where s.id = new.student_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_report_defaults on public.reports;
create trigger set_report_defaults
before insert or update of student_id, teacher_id, tenant_id
on public.reports
for each row
execute function public.set_report_defaults();

--------------------------------------------------------------------------------
-- 3) Reset reports RLS and use definer helpers to avoid recursion/denials
--------------------------------------------------------------------------------
alter table public.reports enable row level security;

do $$
declare
  pol record;
begin
  if to_regclass('public.reports') is null then
    raise notice 'reports table not found, skipping';
    return;
  end if;

  for pol in
    select polname from pg_policy where polrelid = 'public.reports'::regclass
  loop
    execute format('drop policy if exists %I on public.reports', pol.polname);
  end loop;
end $$;

create policy reports_tenant_guard
on public.reports
as restrictive
for all
to authenticated
using (public.is_tenant_member_for_student(reports.student_id))
with check (public.is_tenant_member_for_student(reports.student_id));

create policy reports_teacher_manage
on public.reports
for all
to authenticated
using (public.is_assigned_teacher_for_student(reports.student_id))
with check (public.is_assigned_teacher_for_student(reports.student_id));

create policy reports_parent_read
on public.reports
for select
to authenticated
using (public.is_parent_for_student(reports.student_id));

create policy reports_admin_manage
on public.reports
for all
to authenticated
using (public.is_admin_for_student(reports.student_id))
with check (public.is_admin_for_student(reports.student_id));

commit;
