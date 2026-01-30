-- Rollback for 2026-01-27_teacher_assignments_seed.sql
-- Removes campus teacher assignments created by seed.
-- Run this in Supabase SQL editor (write access required).

begin;

with campus_program as (
  select p.id, p.tenant_id
  from public.programs p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = 'akademialkhayr' and p.type = 'campus'
)
delete from public.teacher_assignments ta
using campus_program cp
where ta.program_id = cp.id
  and ta.tenant_id = cp.tenant_id
  and ta.role = 'teacher';

commit;
