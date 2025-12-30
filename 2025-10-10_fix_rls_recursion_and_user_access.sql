-- Fix RLS recursion by using SECURITY DEFINER helpers and re-create key policies.
-- Run this in Supabase SQL editor (write access required).

begin;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.user_profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((current_user_role() = 'school_admin'), false)
$$;

drop policy if exists tenant_member_read_user_profiles on public.user_profiles;
drop policy if exists user_profiles_manage_admin on public.user_profiles;

create policy tenant_member_read_user_profiles
  on public.user_profiles
  for select
  using (tenant_id = current_tenant_id());

create policy user_profiles_manage_admin
  on public.user_profiles
  for all
  using (is_school_admin() and tenant_id = current_tenant_id())
  with check (is_school_admin() and tenant_id = current_tenant_id());

drop policy if exists tenant_member_read_users on public.users;

create policy tenant_member_read_users
  on public.users
  for select
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.user_id = users.id
        and up.tenant_id = current_tenant_id()
    )
  );

commit;
