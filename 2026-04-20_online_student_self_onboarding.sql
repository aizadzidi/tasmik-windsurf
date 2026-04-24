-- Online student self-onboarding v1.
-- Adds:
-- - student role support
-- - autonomous student ownership via students.account_owner_user_id
-- - temporary claim tokens for legacy manual online students
-- - helper functions / read policies for student-owned records

begin;

--------------------------------------------------------------------------------
-- Role constraints
--------------------------------------------------------------------------------
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.users'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint %I', constraint_name);
  end loop;

  alter table public.users
    add constraint users_role_check
    check (role in ('admin', 'teacher', 'parent', 'general_worker', 'student'));
exception
  when duplicate_object then null;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.user_profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.user_profiles drop constraint %I', constraint_name);
  end loop;

  alter table public.user_profiles
    add constraint user_profiles_role_check
    check (role in ('school_admin', 'teacher', 'parent', 'student_support', 'student'));
exception
  when duplicate_object then null;
end;
$$;

--------------------------------------------------------------------------------
-- Student ownership
--------------------------------------------------------------------------------
alter table public.students
  add column if not exists account_owner_user_id uuid references public.users(id) on delete set null;

create unique index if not exists students_account_owner_user_id_uidx
  on public.students (account_owner_user_id)
  where account_owner_user_id is not null;

create index if not exists students_account_owner_user_id_idx
  on public.students (tenant_id, account_owner_user_id);

--------------------------------------------------------------------------------
-- Temporary claim bridge for legacy manual online students
--------------------------------------------------------------------------------
create table if not exists public.online_student_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_student_claim_tokens_student_idx
  on public.online_student_claim_tokens (tenant_id, student_id, created_at desc);

create index if not exists online_student_claim_tokens_active_idx
  on public.online_student_claim_tokens (tenant_id, expires_at)
  where consumed_at is null and revoked_at is null;

alter table public.online_student_claim_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_claim_tokens'
      and policyname = 'tenant_guard_online_student_claim_tokens'
  ) then
    create policy tenant_guard_online_student_claim_tokens
      on public.online_student_claim_tokens
      as restrictive
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_student_claim_tokens.tenant_id
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_student_claim_tokens.tenant_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_claim_tokens'
      and policyname = 'online_student_claim_tokens_admin_manage'
  ) then
    create policy online_student_claim_tokens_admin_manage
      on public.online_student_claim_tokens
      for all
      to authenticated
      using (public.is_admin_for_student(online_student_claim_tokens.student_id))
      with check (public.is_admin_for_student(online_student_claim_tokens.student_id));
  end if;
end;
$$;

--------------------------------------------------------------------------------
-- Helper functions
--------------------------------------------------------------------------------
create or replace function public.is_student_owner_for_student(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.account_owner_user_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

--------------------------------------------------------------------------------
-- Add student-owner read policies for online self-service access
--------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollments'
      and policyname = 'enrollments_student_owner_read'
  ) then
    create policy enrollments_student_owner_read
      on public.enrollments
      for select
      to authenticated
      using (public.is_student_owner_for_student(enrollments.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_recurring_packages'
      and policyname = 'online_recurring_packages_student_owner_read'
  ) then
    create policy online_recurring_packages_student_owner_read
      on public.online_recurring_packages
      for select
      to authenticated
      using (public.is_student_owner_for_student(online_recurring_packages.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_recurring_occurrences'
      and policyname = 'online_recurring_occurrences_student_owner_read'
  ) then
    create policy online_recurring_occurrences_student_owner_read
      on public.online_recurring_occurrences
      for select
      to authenticated
      using (public.is_student_owner_for_student(online_recurring_occurrences.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_package_assignments'
      and policyname = 'online_student_package_assignments_student_owner_read'
  ) then
    create policy online_student_package_assignments_student_owner_read
      on public.online_student_package_assignments
      for select
      to authenticated
      using (public.is_student_owner_for_student(online_student_package_assignments.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_package_change_requests'
      and policyname = 'online_package_change_requests_student_owner_read'
  ) then
    create policy online_package_change_requests_student_owner_read
      on public.online_package_change_requests
      for select
      to authenticated
      using (public.is_student_owner_for_student(online_package_change_requests.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_slot_claims'
      and policyname = 'online_slot_claims_student_owner_read'
  ) then
    create policy online_slot_claims_student_owner_read
      on public.online_slot_claims
      for select
      to authenticated
      using (public.is_student_owner_for_student(online_slot_claims.student_id));
  end if;
end;
$$;

commit;
