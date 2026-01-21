-- Rollback: remove exam_roster snapshot table and policies.

begin;

drop policy if exists tenant_member_read_exam_roster on public.exam_roster;
drop policy if exists tenant_admin_manage_exam_roster on public.exam_roster;
drop policy if exists tenant_guard_exam_roster on public.exam_roster;

drop table if exists public.exam_roster;

commit;
