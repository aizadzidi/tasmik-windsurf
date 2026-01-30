-- Rollback for 2026-01-27_programs_enrollments.sql
-- Run this in Supabase SQL editor (write access required).

begin;

drop policy if exists tenant_member_read_enrollments on public.enrollments;
drop policy if exists tenant_member_read_programs on public.programs;
drop policy if exists tenant_guard_enrollments on public.enrollments;
drop policy if exists tenant_guard_programs on public.programs;

drop table if exists public.enrollments;
drop table if exists public.programs;

commit;
