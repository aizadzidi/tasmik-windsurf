-- Backfill a default tenant and map existing users + payments.
-- Replace the placeholder values before running.

begin;

with new_tenant as (
  insert into public.tenants (name, slug, metadata)
  values ('Akademi Al Khayr', 'akademialkhayr', '{}'::jsonb)
  on conflict (slug)
  do update set name = excluded.name
  returning id
),
tenant_row as (
  select id from new_tenant
  union all
  select id from public.tenants where slug = 'akademialkhayr'
  limit 1
)
insert into public.tenant_domains (tenant_id, domain, is_primary)
select id, 'class.akademialkhayr.com', true
from tenant_row
on conflict (domain) do nothing;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr'
  limit 1
),
mapped_users as (
  select
    u.id as user_id,
    t.id as tenant_id,
    case
      when u.role = 'admin' then 'school_admin'
      when u.role = 'teacher' then 'teacher'
      when u.role = 'parent' then 'parent'
      else 'student_support'
    end as role,
    u.name as display_name
  from public.users u
  cross join tenant_row t
)
insert into public.user_profiles (user_id, tenant_id, role, display_name)
select user_id, tenant_id, role, display_name
from mapped_users
on conflict (user_id)
do update set
  tenant_id = excluded.tenant_id,
  role = excluded.role,
  display_name = excluded.display_name,
  updated_at = now();

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr'
  limit 1
)
insert into public.tenant_payment_settings (tenant_id)
select id from tenant_row
on conflict (tenant_id) do nothing;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr'
  limit 1
),
billplz_provider as (
  select id from public.payment_providers where key = 'billplz' limit 1
)
update public.payments p
set
  tenant_id = t.id,
  provider_id = b.id,
  provider_payment_id = coalesce(p.provider_payment_id, p.billplz_id),
  provider_status = coalesce(p.provider_status, p.status)
from tenant_row t, billplz_provider b
where p.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr'
  limit 1
),
billplz_provider as (
  select id from public.payment_providers where key = 'billplz' limit 1
)
update public.payment_events e
set
  tenant_id = t.id,
  provider_id = b.id
from tenant_row t, billplz_provider b
where e.tenant_id is null;

commit;
