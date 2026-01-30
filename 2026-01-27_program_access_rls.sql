-- Tighten RLS for enrollments + teacher assignments to enforce program access.
-- Run this in Supabase SQL editor (write access required).

begin;

--------------------------------------------------------------------------------
-- Helper functions (RLS-safe, definer)
--------------------------------------------------------------------------------
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

create or replace function public.is_admin_for_program(p_program_id uuid)
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
    from public.programs p
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = p.tenant_id
    where p.id = p_program_id
  ) into ok;
  return ok;
end;
$$;

--------------------------------------------------------------------------------
-- Enrollments: replace broad tenant read with role-scoped access
--------------------------------------------------------------------------------
alter table public.enrollments enable row level security;

drop policy if exists tenant_member_read_enrollments on public.enrollments;
drop policy if exists enrollments_parent_read on public.enrollments;
drop policy if exists enrollments_teacher_read on public.enrollments;
drop policy if exists enrollments_admin_manage on public.enrollments;

create policy enrollments_parent_read
on public.enrollments
for select
to authenticated
using (public.is_parent_for_student(enrollments.student_id));

create policy enrollments_teacher_read
on public.enrollments
for select
to authenticated
using (public.is_assigned_teacher_for_student(enrollments.student_id));

create policy enrollments_admin_manage
on public.enrollments
for all
to authenticated
using (public.is_admin_for_student(enrollments.student_id))
with check (public.is_admin_for_student(enrollments.student_id));

--------------------------------------------------------------------------------
-- Teacher assignments: restrict reads to self, admin can manage
--------------------------------------------------------------------------------
alter table public.teacher_assignments enable row level security;

drop policy if exists tenant_member_read_teacher_assignments on public.teacher_assignments;
drop policy if exists teacher_assignments_self_read on public.teacher_assignments;
drop policy if exists teacher_assignments_admin_manage on public.teacher_assignments;

create policy teacher_assignments_self_read
on public.teacher_assignments
for select
to authenticated
using (teacher_assignments.teacher_id = auth.uid());

create policy teacher_assignments_admin_manage
on public.teacher_assignments
for all
to authenticated
using (public.is_admin_for_program(teacher_assignments.program_id))
with check (public.is_admin_for_program(teacher_assignments.program_id));

commit;
