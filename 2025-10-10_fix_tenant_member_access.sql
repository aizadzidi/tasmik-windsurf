-- Restores tenant-scoped access without recursion.
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
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'tenant_member_read_user_profiles'
  ) then
    create policy tenant_member_read_user_profiles
      on public.user_profiles
      for select
      to authenticated
      using (
        tenant_id = (
          select up.tenant_id
          from public.user_profiles up
          where up.user_id = auth.uid()
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'tenant_member_read_users'
  ) then
    create policy tenant_member_read_users
      on public.users
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = users.id
            and up.tenant_id = (
              select requester.tenant_id
              from public.user_profiles requester
              where requester.user_id = auth.uid()
            )
        )
      );
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
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'school_admin'
            and up.tenant_id = user_profiles.tenant_id
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'school_admin'
            and up.tenant_id = user_profiles.tenant_id
        )
      );
  end if;
end;
$$;
