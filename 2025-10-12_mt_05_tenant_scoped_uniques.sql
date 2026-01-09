-- Replaces global unique constraints with tenant-scoped uniques.

begin;

do $$
begin
  if exists (select 1 from public.classes where tenant_id is null) then
    raise exception 'classes.tenant_id contains NULLs';
  end if;
  if exists (select 1 from public.subjects where tenant_id is null) then
    raise exception 'subjects.tenant_id contains NULLs';
  end if;
end $$;

alter table public.classes
  alter column tenant_id set not null;
alter table public.subjects
  alter column tenant_id set not null;

create unique index if not exists classes_tenant_name_key
  on public.classes (tenant_id, name);
create unique index if not exists subjects_tenant_name_key
  on public.subjects (tenant_id, name);

alter table public.classes
  drop constraint if exists classes_name_key;
alter table public.subjects
  drop constraint if exists subjects_name_key;

commit;
