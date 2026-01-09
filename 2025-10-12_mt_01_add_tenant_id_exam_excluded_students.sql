-- Adds tenant_id to exam_excluded_students and replaces legacy policies.
-- Safe to run multiple times.

begin;

alter table public.exam_excluded_students
  add column if not exists tenant_id uuid references public.tenants(id);

create index if not exists exam_excluded_students_tenant_id_idx
  on public.exam_excluded_students (tenant_id);

-- Backfill tenant_id from related records, fallback to single-tenant default.
do $$
declare
  tenant_count int;
  default_tenant uuid;
begin
  select count(*), max(id)
    into tenant_count, default_tenant
  from public.tenants;

  update public.exam_excluded_students ees
  set tenant_id = coalesce(
    e.tenant_id,
    s.tenant_id,
    c.tenant_id,
    case when tenant_count = 1 then default_tenant else null end
  )
  from public.exams e
  left join public.students s on s.id = ees.student_id
  left join public.classes c on c.id = ees.class_id
  where ees.exam_id = e.id
    and ees.tenant_id is null;
end $$;

-- Drop legacy policies.
drop policy if exists admin_can_manage_exam_excluded_students
  on public.exam_excluded_students;
drop policy if exists authenticated_can_read_exam_excluded_students
  on public.exam_excluded_students;

-- Add tenant guard and tenant-scoped access.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_excluded_students'
      and policyname = 'tenant_guard_exam_excluded_students'
  ) then
    create policy tenant_guard_exam_excluded_students
      on public.exam_excluded_students
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_excluded_students.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_excluded_students.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_excluded_students'
      and policyname = 'tenant_admin_manage_exam_excluded_students'
  ) then
    create policy tenant_admin_manage_exam_excluded_students
      on public.exam_excluded_students
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = exam_excluded_students.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = exam_excluded_students.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_excluded_students'
      and policyname = 'tenant_member_read_exam_excluded_students'
  ) then
    create policy tenant_member_read_exam_excluded_students
      on public.exam_excluded_students
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_excluded_students.tenant_id
      ));
  end if;
end;
$$;

commit;
