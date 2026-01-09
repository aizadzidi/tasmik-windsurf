-- Replaces global unique constraints with tenant-scoped uniques.

begin;

create unique index if not exists classes_tenant_name_key
  on public.classes (tenant_id, name);
create unique index if not exists subjects_tenant_name_key
  on public.subjects (tenant_id, name);

alter table public.classes
  drop constraint if exists classes_name_key;
alter table public.subjects
  drop constraint if exists subjects_name_key;

commit;
