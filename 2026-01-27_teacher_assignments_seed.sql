-- Seeds teacher_assignments: all existing teachers -> campus program.
-- Run this in Supabase SQL editor (write access required).

begin;

with campus_program as (
  select p.id, p.tenant_id
  from public.programs p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = 'akademialkhayr' and p.type = 'campus'
  limit 1
)
insert into public.teacher_assignments (tenant_id, teacher_id, program_id, role)
select up.tenant_id, u.id, cp.id, 'teacher'
from public.users u
join public.user_profiles up on up.user_id = u.id
join campus_program cp on cp.tenant_id = up.tenant_id
where u.role = 'teacher'
  and not exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = u.id and ta.program_id = cp.id and ta.tenant_id = up.tenant_id
  );

commit;
