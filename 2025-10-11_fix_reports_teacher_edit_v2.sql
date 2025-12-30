begin;

-- Backfill reports.tenant_id from students (safe to re-run).
update public.reports r
set tenant_id = s.tenant_id
from public.students s
where r.tenant_id is null
  and r.student_id = s.id;

-- Ensure RLS is enabled.
alter table public.reports enable row level security;

-- Reset policies for reports to avoid conflicting restrictive guards.
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

-- Tenant boundary guard (must pass for all commands).
create policy reports_tenant_guard
on public.reports
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
);

-- Teacher access: only for assigned students.
create policy reports_teacher_select
on public.reports
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'teacher'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

create policy reports_teacher_insert
on public.reports
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'teacher'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

create policy reports_teacher_update
on public.reports
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'teacher'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'teacher'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

create policy reports_teacher_delete
on public.reports
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'teacher'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

-- Parent read: only their own children.
create policy reports_parent_select
on public.reports
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'parent'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
      and s.parent_id = auth.uid()
  )
);

-- Admin manage within tenant.
create policy reports_admin_manage
on public.reports
for all
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
);

commit;
