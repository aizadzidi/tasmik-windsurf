begin;

-- Replace restrictive guard to avoid dependence on user_profiles for teachers/parents.
drop policy if exists reports_tenant_guard on public.reports;

create policy reports_tenant_guard
on public.reports
as restrictive
for all
to authenticated
using (
  public.is_assigned_teacher_for_student(reports.student_id)
  or public.is_parent_for_student(reports.student_id)
  or public.is_admin_for_student(reports.student_id)
)
with check (
  public.is_assigned_teacher_for_student(reports.student_id)
  or public.is_admin_for_student(reports.student_id)
);

commit;
