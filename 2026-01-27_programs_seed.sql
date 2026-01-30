-- Seeds campus + online programs and backfills existing students into campus enrollments.
-- Run this in Supabase SQL editor (write access required).

begin;

-- Ensure campus + online programs exist for the tenant
insert into public.programs (tenant_id, name, type, rules, is_active)
select t.id, 'Campus', 'campus', '{}'::jsonb, true
from public.tenants t
where t.slug = 'akademialkhayr'
  and not exists (
    select 1
    from public.programs p
    where p.tenant_id = t.id and p.type = 'campus'
  );

insert into public.programs (tenant_id, name, type, rules, is_active)
select t.id, 'Online', 'online', '{}'::jsonb, true
from public.tenants t
where t.slug = 'akademialkhayr'
  and not exists (
    select 1
    from public.programs p
    where p.tenant_id = t.id and p.type = 'online'
  );

-- Backfill existing students into campus enrollments
with campus_program as (
  select p.id, p.tenant_id
  from public.programs p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = 'akademialkhayr' and p.type = 'campus'
  limit 1
)
insert into public.enrollments (tenant_id, student_id, program_id, status, start_date)
select s.tenant_id, s.id, cp.id, 'active', current_date
from public.students s
join campus_program cp on cp.tenant_id = s.tenant_id
where s.record_type is null or s.record_type <> 'prospect'
  and not exists (
    select 1
    from public.enrollments e
    where e.student_id = s.id and e.program_id = cp.id and e.tenant_id = s.tenant_id
  );

commit;
