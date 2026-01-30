-- Rollback for 2026-01-27_teacher_assignments.sql
-- Run this in Supabase SQL editor (write access required).

begin;

drop policy if exists tenant_member_read_teacher_assignments on public.teacher_assignments;
drop policy if exists tenant_guard_teacher_assignments on public.teacher_assignments;

drop table if exists public.teacher_assignments;

commit;
