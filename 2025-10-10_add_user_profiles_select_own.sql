-- Allows authenticated users to read their own profile (needed for tenant guards).
-- Run this in Supabase SQL editor (write access required).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own
      on public.user_profiles
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end;
$$;
