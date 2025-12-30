-- Adds tenant domains and user profiles for multi-tenant mapping.
-- Run this in Supabase SQL editor (write access required).

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists tenant_domains_one_primary
  on public.tenant_domains (tenant_id)
  where is_primary;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null check (role in ('school_admin', 'teacher', 'parent', 'student_support')),
  display_name text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_tenant_id_idx
  on public.user_profiles (tenant_id);

alter table public.tenant_domains enable row level security;
alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_domains'
      and policyname = 'tenant_domains_manage_admin'
  ) then
    create policy tenant_domains_manage_admin
      on public.tenant_domains
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_manage_admin'
  ) then
    create policy user_profiles_manage_admin
      on public.user_profiles
      for all
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end;
$$;
