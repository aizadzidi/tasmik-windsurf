-- Adds teacher_assignments to map teachers to programs (online/campus/hybrid).
-- Run this in Supabase SQL editor (write access required).

begin;

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  program_id uuid not null,
  role text not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, program_id, tenant_id)
);

alter table public.teacher_assignments
  add constraint teacher_assignments_program_tenant_fk
  foreign key (program_id, tenant_id)
  references public.programs (id, tenant_id)
  on delete cascade;

create index if not exists teacher_assignments_tenant_id_idx on public.teacher_assignments (tenant_id);
create index if not exists teacher_assignments_teacher_id_idx on public.teacher_assignments (teacher_id);
create index if not exists teacher_assignments_program_id_idx on public.teacher_assignments (program_id);

alter table public.teacher_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_assignments'
      and policyname = 'tenant_guard_teacher_assignments'
  ) then
    create policy tenant_guard_teacher_assignments
      on public.teacher_assignments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = teacher_assignments.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = teacher_assignments.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_assignments'
      and policyname = 'tenant_member_read_teacher_assignments'
  ) then
    create policy tenant_member_read_teacher_assignments
      on public.teacher_assignments
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = teacher_assignments.tenant_id
      ));
  end if;
end;
$$;

commit;
