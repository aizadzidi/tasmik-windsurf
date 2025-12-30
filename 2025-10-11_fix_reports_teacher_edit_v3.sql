begin;

--------------------------------------------------------------------------------
-- SECURITY DEFINER HELPERS (bypass RLS safely with auth.uid() only)
--------------------------------------------------------------------------------
create or replace function public.is_tenant_member(p_tenant_id uuid)
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
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.tenant_id = p_tenant_id
  ) into ok;
  return ok;
end;
$$;

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
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.tenant_id = s.tenant_id
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
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.tenant_id = s.tenant_id
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
     and up.tenant_id = s.tenant_id
     and up.role = 'school_admin'
    where s.id = p_student_id
  ) into ok;
  return ok;
end;
$$;

--------------------------------------------------------------------------------
-- REPORTS: backfill tenant_id, reset policies, and apply robust RLS
--------------------------------------------------------------------------------
update public.reports r
set tenant_id = s.tenant_id
from public.students s
where r.tenant_id is null
  and r.student_id = s.id;

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

--------------------------------------------------------------------------------
-- CLASSES: ensure tenant-scoped read for teachers/parents
--------------------------------------------------------------------------------
alter table public.classes enable row level security;

do $$
declare
  pol record;
begin
  if to_regclass('public.classes') is null then
    raise notice 'classes table not found, skipping';
    return;
  end if;

  for pol in
    select polname from pg_policy where polrelid = 'public.classes'::regclass
  loop
    execute format('drop policy if exists %I on public.classes', pol.polname);
  end loop;
end $$;

create policy classes_tenant_guard
on public.classes
as restrictive
for all
to authenticated
using (public.is_tenant_member(classes.tenant_id))
with check (public.is_tenant_member(classes.tenant_id));

create policy classes_tenant_read
on public.classes
for select
to authenticated
using (public.is_tenant_member(classes.tenant_id));

create policy classes_admin_manage
on public.classes
for all
to authenticated
using (public.is_school_admin() and public.is_tenant_member(classes.tenant_id))
with check (public.is_school_admin() and public.is_tenant_member(classes.tenant_id));

commit;
