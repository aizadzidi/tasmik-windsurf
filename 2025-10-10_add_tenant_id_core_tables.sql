-- Adds tenant_id to core academic tables and backfills with default tenant.
-- Run this in Supabase SQL editor (write access required).

begin;

alter table public.students
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.classes
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.subjects
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.reports
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.attendance_records
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.exams
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.exam_classes
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.exam_subjects
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.exam_results
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.exam_class_subjects
  add column if not exists tenant_id uuid references public.tenants(id);

create index if not exists students_tenant_id_idx on public.students (tenant_id);
create index if not exists classes_tenant_id_idx on public.classes (tenant_id);
create index if not exists subjects_tenant_id_idx on public.subjects (tenant_id);
create index if not exists reports_tenant_id_idx on public.reports (tenant_id);
create index if not exists attendance_records_tenant_id_idx on public.attendance_records (tenant_id);
create index if not exists exams_tenant_id_idx on public.exams (tenant_id);
create index if not exists exam_classes_tenant_id_idx on public.exam_classes (tenant_id);
create index if not exists exam_subjects_tenant_id_idx on public.exam_subjects (tenant_id);
create index if not exists exam_results_tenant_id_idx on public.exam_results (tenant_id);
create index if not exists exam_class_subjects_tenant_id_idx on public.exam_class_subjects (tenant_id);

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.students s
set tenant_id = t.id
from tenant_row t
where s.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.classes c
set tenant_id = t.id
from tenant_row t
where c.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.subjects s
set tenant_id = t.id
from tenant_row t
where s.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.reports r
set tenant_id = t.id
from tenant_row t
where r.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.attendance_records a
set tenant_id = t.id
from tenant_row t
where a.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.exams e
set tenant_id = t.id
from tenant_row t
where e.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.exam_classes ec
set tenant_id = t.id
from tenant_row t
where ec.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.exam_subjects es
set tenant_id = t.id
from tenant_row t
where es.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.exam_results er
set tenant_id = t.id
from tenant_row t
where er.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.exam_class_subjects ecs
set tenant_id = t.id
from tenant_row t
where ecs.tenant_id is null;

commit;
