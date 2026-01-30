-- Rollback for 2026-01-27_enrollment_lifecycle.sql

begin;

drop trigger if exists trg_enrollments_log_status on public.enrollments;
drop trigger if exists trg_enrollments_set_updated_at on public.enrollments;

drop function if exists public.log_enrollment_status_change();
drop function if exists public.set_enrollments_updated_at();

drop policy if exists enrollment_status_events_parent_read on public.enrollment_status_events;
drop policy if exists enrollment_status_events_teacher_read on public.enrollment_status_events;
drop policy if exists enrollment_status_events_admin_manage on public.enrollment_status_events;
drop policy if exists tenant_guard_enrollment_status_events on public.enrollment_status_events;

drop table if exists public.enrollment_status_events;

commit;
