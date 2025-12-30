begin;

-- Ensure reports are tenant-aligned for existing data.
update public.reports r
set tenant_id = s.tenant_id
from public.students s
where r.tenant_id is null
  and r.student_id = s.id;

-- Make sure RLS is enabled.
alter table public.reports enable row level security;

-- Replace restrictive guard to avoid current_tenant_id dependency.
drop policy if exists tenant_guard_reports on public.reports;
create policy tenant_guard_reports
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

-- Allow teachers to create/update reports for their assigned students.
drop policy if exists teacher_manage_reports_insert on public.reports;
drop policy if exists teacher_manage_reports_update on public.reports;

create policy teacher_manage_reports_insert
on public.reports
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

create policy teacher_manage_reports_update
on public.reports
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

commit;
