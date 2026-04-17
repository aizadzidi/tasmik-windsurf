-- Adds teacher_scope to tenant_invites for teacher onboarding.

begin;

alter table public.tenant_invites
  add column if not exists teacher_scope text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_invites_teacher_scope_check'
      and conrelid = 'public.tenant_invites'::regclass
  ) then
    alter table public.tenant_invites
      add constraint tenant_invites_teacher_scope_check
      check (teacher_scope is null or teacher_scope in ('campus', 'online')) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_invites_teacher_scope_role_check'
      and conrelid = 'public.tenant_invites'::regclass
  ) then
    alter table public.tenant_invites
      add constraint tenant_invites_teacher_scope_role_check
      check (
        (target_role = 'teacher' and teacher_scope is not null) or
        (target_role = 'general_worker' and teacher_scope is null)
      ) not valid;
  end if;
end
$$;

commit;
