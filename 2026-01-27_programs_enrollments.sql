-- Adds programs + enrollments for online/campus/hybrid support.
-- Run this in Supabase SQL editor (write access required).

begin;

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  type text not null check (type in ('campus', 'online', 'hybrid')),
  rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists programs_tenant_id_idx on public.programs (tenant_id);
create index if not exists programs_type_idx on public.programs (type);
alter table public.programs
  add constraint programs_id_tenant_key unique (id, tenant_id);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  program_id uuid not null,
  status text not null check (status in (
    'draft',
    'pending_payment',
    'active',
    'paused',
    'cancelled',
    'completed'
  )),
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, program_id, tenant_id)
);

alter table public.enrollments
  add constraint enrollments_student_tenant_fk
  foreign key (student_id, tenant_id)
  references public.students (id, tenant_id)
  on delete cascade;

alter table public.enrollments
  add constraint enrollments_program_tenant_fk
  foreign key (program_id, tenant_id)
  references public.programs (id, tenant_id)
  on delete cascade;

create index if not exists enrollments_tenant_id_idx on public.enrollments (tenant_id);
create index if not exists enrollments_student_id_idx on public.enrollments (student_id);
create index if not exists enrollments_program_id_idx on public.enrollments (program_id);
create index if not exists enrollments_status_idx on public.enrollments (status);

alter table public.programs enable row level security;
alter table public.enrollments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'programs'
      and policyname = 'tenant_guard_programs'
  ) then
    create policy tenant_guard_programs
      on public.programs
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = programs.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = programs.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollments'
      and policyname = 'tenant_guard_enrollments'
  ) then
    create policy tenant_guard_enrollments
      on public.enrollments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollments.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollments.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'programs'
      and policyname = 'tenant_member_read_programs'
  ) then
    create policy tenant_member_read_programs
      on public.programs
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = programs.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollments'
      and policyname = 'tenant_member_read_enrollments'
  ) then
    create policy tenant_member_read_enrollments
      on public.enrollments
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollments.tenant_id
      ));
  end if;
end;
$$;

commit;
