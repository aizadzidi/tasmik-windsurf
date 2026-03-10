alter table public.online_courses
  add column if not exists default_slot_duration_minutes integer not null default 30;

alter table public.online_slot_claims
  add column if not exists package_id uuid,
  add column if not exists package_change_request_id uuid;

create table if not exists public.online_recurring_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  status text not null check (
    status in ('draft', 'pending_payment', 'active', 'paused', 'cancelled', 'legacy_review_required')
  ) default 'draft',
  source text not null default 'admin_direct',
  effective_month date not null,
  effective_from date not null,
  effective_to date,
  sessions_per_week integer not null check (sessions_per_week > 0),
  monthly_fee_cents_snapshot integer not null default 0,
  notes text,
  hold_expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_recurring_packages_tenant_teacher_idx
  on public.online_recurring_packages (tenant_id, teacher_id, effective_month);
create index if not exists online_recurring_packages_tenant_student_idx
  on public.online_recurring_packages (tenant_id, student_id, effective_month);
create index if not exists online_recurring_packages_hold_expiry_idx
  on public.online_recurring_packages (tenant_id, hold_expires_at)
  where status in ('draft', 'pending_payment');

create table if not exists public.online_recurring_package_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.online_recurring_packages(id) on delete cascade,
  slot_template_id uuid not null references public.online_slot_templates(id) on delete restrict,
  day_of_week_snapshot smallint not null check (day_of_week_snapshot between 0 and 6),
  start_time_snapshot time not null,
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  status text not null check (status in ('active', 'moved', 'cancelled')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, package_id, slot_template_id)
);

create index if not exists online_recurring_package_slots_tenant_slot_idx
  on public.online_recurring_package_slots (tenant_id, slot_template_id);
create index if not exists online_recurring_package_slots_tenant_package_idx
  on public.online_recurring_package_slots (tenant_id, package_id);

create table if not exists public.online_recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.online_recurring_packages(id) on delete cascade,
  package_slot_id uuid not null references public.online_recurring_package_slots(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  slot_template_id uuid not null references public.online_slot_templates(id) on delete restrict,
  session_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  attendance_status text check (attendance_status in ('present', 'absent')),
  attendance_notes text,
  recorded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, package_slot_id, session_date)
);

create index if not exists online_recurring_occurrences_tenant_teacher_idx
  on public.online_recurring_occurrences (tenant_id, teacher_id, session_date);
create index if not exists online_recurring_occurrences_tenant_student_idx
  on public.online_recurring_occurrences (tenant_id, student_id, session_date);

create table if not exists public.online_package_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  current_package_id uuid not null references public.online_recurring_packages(id) on delete cascade,
  next_package_id_draft uuid not null references public.online_recurring_packages(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  effective_month date not null,
  pricing_delta_cents integer not null default 0,
  billing_status text not null check (billing_status in ('not_required', 'pending_payment', 'paid', 'credit_due')) default 'not_required',
  status text not null check (status in ('draft', 'pending_payment', 'scheduled', 'cancelled', 'applied')) default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_package_change_requests_tenant_effective_idx
  on public.online_package_change_requests (tenant_id, effective_month, status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_claims'::regclass
      and conname = 'online_slot_claims_package_id_fkey'
  ) then
    alter table public.online_slot_claims
      add constraint online_slot_claims_package_id_fkey
      foreign key (package_id) references public.online_recurring_packages(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_claims'::regclass
      and conname = 'online_slot_claims_package_change_request_id_fkey'
  ) then
    alter table public.online_slot_claims
      add constraint online_slot_claims_package_change_request_id_fkey
      foreign key (package_change_request_id) references public.online_package_change_requests(id) on delete set null;
  end if;
end;
$$;

alter table public.online_recurring_packages enable row level security;
alter table public.online_recurring_package_slots enable row level security;
alter table public.online_recurring_occurrences enable row level security;
alter table public.online_package_change_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_packages'
      and policyname = 'tenant_guard_online_recurring_packages'
  ) then
    create policy tenant_guard_online_recurring_packages
      on public.online_recurring_packages
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_packages.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_packages.tenant_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_packages'
      and policyname = 'online_recurring_packages_parent_read'
  ) then
    create policy online_recurring_packages_parent_read
      on public.online_recurring_packages
      for select
      to authenticated
      using (public.is_parent_for_student(online_recurring_packages.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_packages'
      and policyname = 'online_recurring_packages_teacher_read'
  ) then
    create policy online_recurring_packages_teacher_read
      on public.online_recurring_packages
      for select
      to authenticated
      using (online_recurring_packages.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_packages'
      and policyname = 'online_recurring_packages_admin_manage'
  ) then
    create policy online_recurring_packages_admin_manage
      on public.online_recurring_packages
      for all
      to authenticated
      using (public.is_admin_for_student(online_recurring_packages.student_id))
      with check (public.is_admin_for_student(online_recurring_packages.student_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_package_slots'
      and policyname = 'tenant_guard_online_recurring_package_slots'
  ) then
    create policy tenant_guard_online_recurring_package_slots
      on public.online_recurring_package_slots
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_package_slots.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_package_slots.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_occurrences'
      and policyname = 'tenant_guard_online_recurring_occurrences'
  ) then
    create policy tenant_guard_online_recurring_occurrences
      on public.online_recurring_occurrences
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_occurrences.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_recurring_occurrences.tenant_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_occurrences'
      and policyname = 'online_recurring_occurrences_teacher_manage'
  ) then
    create policy online_recurring_occurrences_teacher_manage
      on public.online_recurring_occurrences
      for all
      to authenticated
      using (online_recurring_occurrences.teacher_id = auth.uid())
      with check (online_recurring_occurrences.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_occurrences'
      and policyname = 'online_recurring_occurrences_parent_read'
  ) then
    create policy online_recurring_occurrences_parent_read
      on public.online_recurring_occurrences
      for select
      to authenticated
      using (public.is_parent_for_student(online_recurring_occurrences.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_recurring_occurrences'
      and policyname = 'online_recurring_occurrences_admin_manage'
  ) then
    create policy online_recurring_occurrences_admin_manage
      on public.online_recurring_occurrences
      for all
      to authenticated
      using (public.is_admin_for_student(online_recurring_occurrences.student_id))
      with check (public.is_admin_for_student(online_recurring_occurrences.student_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_package_change_requests'
      and policyname = 'tenant_guard_online_package_change_requests'
  ) then
    create policy tenant_guard_online_package_change_requests
      on public.online_package_change_requests
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_package_change_requests.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_package_change_requests.tenant_id
      ));
  end if;
end;
$$;
