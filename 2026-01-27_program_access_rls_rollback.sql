-- Rollback for 2026-01-27_program_access_rls.sql

begin;

drop policy if exists enrollments_parent_read on public.enrollments;
drop policy if exists enrollments_teacher_read on public.enrollments;
drop policy if exists enrollments_admin_manage on public.enrollments;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollments'
      and policyname = 'tenant_member_read_enrollments'
  ) then
    create policy tenant_member_read_enrollments
      on public.enrollments
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollments.tenant_id
      ));
  end if;
end;
$$;

drop policy if exists teacher_assignments_self_read on public.teacher_assignments;
drop policy if exists teacher_assignments_admin_manage on public.teacher_assignments;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_assignments'
      and policyname = 'tenant_member_read_teacher_assignments'
  ) then
    create policy tenant_member_read_teacher_assignments
      on public.teacher_assignments
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = teacher_assignments.tenant_id
      ));
  end if;
end;
$$;

commit;
