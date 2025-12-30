begin;

--------------------------------------------------------------------------------
-- Remove restrictive guard that blocks inserts (root cause)
--------------------------------------------------------------------------------
drop policy if exists reports_tenant_guard on public.reports;

--------------------------------------------------------------------------------
-- Ensure teacher manage policy exists and is definitive
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

drop policy if exists reports_teacher_manage on public.reports;
create policy reports_teacher_manage
on public.reports
for all
to authenticated
using (public.is_assigned_teacher_for_student(student_id))
with check (public.is_assigned_teacher_for_student(student_id));

commit;
