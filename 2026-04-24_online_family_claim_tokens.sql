-- Online family account claim links.
-- One family claim token can link multiple existing online student records to
-- a family account via students.parent_id without touching student self-login
-- ownership in students.account_owner_user_id.

begin;

create table if not exists public.online_family_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_family_claim_token_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  family_claim_token_id uuid not null references public.online_family_claim_tokens(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (family_claim_token_id, student_id)
);

create index if not exists online_family_claim_tokens_active_idx
  on public.online_family_claim_tokens (tenant_id, expires_at)
  where consumed_at is null and revoked_at is null;

create index if not exists online_family_claim_token_students_token_idx
  on public.online_family_claim_token_students (tenant_id, family_claim_token_id);

create index if not exists online_family_claim_token_students_student_idx
  on public.online_family_claim_token_students (tenant_id, student_id);

alter table public.online_family_claim_tokens enable row level security;
alter table public.online_family_claim_token_students enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_family_claim_tokens'
      and policyname = 'tenant_guard_online_family_claim_tokens'
  ) then
    create policy tenant_guard_online_family_claim_tokens
      on public.online_family_claim_tokens
      as restrictive
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_family_claim_tokens.tenant_id
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_family_claim_tokens.tenant_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_family_claim_token_students'
      and policyname = 'tenant_guard_online_family_claim_token_students'
  ) then
    create policy tenant_guard_online_family_claim_token_students
      on public.online_family_claim_token_students
      as restrictive
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_family_claim_token_students.tenant_id
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_family_claim_token_students.tenant_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_family_claim_token_students'
      and policyname = 'online_family_claim_token_students_admin_manage'
  ) then
    create policy online_family_claim_token_students_admin_manage
      on public.online_family_claim_token_students
      for all
      to authenticated
      using (public.is_admin_for_student(online_family_claim_token_students.student_id))
      with check (public.is_admin_for_student(online_family_claim_token_students.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'online_family_claim_tokens'
      and policyname = 'online_family_claim_tokens_admin_manage'
  ) then
    create policy online_family_claim_tokens_admin_manage
      on public.online_family_claim_tokens
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.online_family_claim_token_students links
          where links.family_claim_token_id = online_family_claim_tokens.id
            and public.is_admin_for_student(links.student_id)
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = online_family_claim_tokens.tenant_id
            and up.role in ('school_admin', 'student_support')
        )
      );
  end if;
end;
$$;

commit;
