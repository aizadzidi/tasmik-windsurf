-- Fixes login break caused by policy recursion between users and user_profiles.
-- Run this in Supabase SQL editor (write access required).

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'tenant_member_read_users'
  ) then
    execute 'drop policy tenant_member_read_users on public.users';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_manage_admin'
  ) then
    execute 'drop policy user_profiles_manage_admin on public.user_profiles';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_insert_own'
  ) then
    create policy user_profiles_insert_own
      on public.user_profiles
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy user_profiles_update_own
      on public.user_profiles
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end;
$$;
