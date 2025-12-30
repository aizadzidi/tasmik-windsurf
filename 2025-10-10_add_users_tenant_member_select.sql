-- Allows tenant members to read user rows within the same tenant.
-- This unblocks joins like users!assigned_teacher_id for parents/teachers.
-- Run this in Supabase SQL editor (write access required).

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
          from public.user_profiles requester
          join public.user_profiles target
            on target.tenant_id = requester.tenant_id
          where requester.user_id = auth.uid()
            and target.user_id = users.id
        )
      );
  end if;
end;
$$;
