-- Rollback for 2026-01-27_programs_seed.sql
-- Removes campus enrollments created by the seed and deletes seeded programs (if no enrollments remain).
-- Run this in Supabase SQL editor (write access required).

begin;

with campus_program as (
  select p.id, p.tenant_id
  from public.programs p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = 'akademialkhayr' and p.type = 'campus'
)
delete from public.enrollments e
using campus_program cp
where e.program_id = cp.id
  and e.tenant_id = cp.tenant_id
  and e.status = 'active';

-- Remove programs only if they have no enrollments remaining
with target_programs as (
  select p.id
  from public.programs p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = 'akademialkhayr' and p.type in ('campus', 'online')
)
delete from public.programs p
using target_programs tp
where p.id = tp.id
  and not exists (select 1 from public.enrollments e where e.program_id = p.id);

commit;
