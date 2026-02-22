-- Online mode operations foundation:
-- - fixed 30 minute slot templates (admin-managed)
-- - teacher availability toggles (no custom teacher slots)
-- - atomic slot claim with 30 minute hold and deterministic conflict codes
-- - online attendance by session
-- - teacher-only notifications on assignment

begin;

create table if not exists public.online_courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid,
  name text not null,
  description text,
  monthly_fee_cents integer not null default 0 check (monthly_fee_cents >= 0),
  sessions_per_week integer not null default 3 check (sessions_per_week between 1 and 14),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_courses'::regclass
      and conname = 'online_courses_program_tenant_fk'
  ) then
    alter table public.online_courses
      add constraint online_courses_program_tenant_fk
      foreign key (program_id, tenant_id)
      references public.programs(id, tenant_id)
      on delete set null;
  end if;
end;
$$;

create index if not exists online_courses_tenant_idx
  on public.online_courses (tenant_id);
create index if not exists online_courses_active_idx
  on public.online_courses (tenant_id, is_active);

create table if not exists public.online_slot_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 30 check (duration_minutes = 30),
  timezone text not null default 'Asia/Kuala_Lumpur',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_templates'::regclass
      and conname = 'online_slot_templates_course_tenant_fk'
  ) then
    alter table public.online_slot_templates
      add constraint online_slot_templates_course_tenant_fk
      foreign key (course_id, tenant_id)
      references public.online_courses(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists online_slot_templates_tenant_idx
  on public.online_slot_templates (tenant_id);
create index if not exists online_slot_templates_course_idx
  on public.online_slot_templates (course_id, day_of_week, start_time);
create index if not exists online_slot_templates_active_idx
  on public.online_slot_templates (tenant_id, is_active);

create table if not exists public.online_teacher_slot_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slot_template_id uuid not null references public.online_slot_templates(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  is_available boolean not null default true,
  last_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slot_template_id, teacher_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_teacher_slot_preferences'::regclass
      and conname = 'online_teacher_slot_preferences_slot_tenant_fk'
  ) then
    alter table public.online_teacher_slot_preferences
      add constraint online_teacher_slot_preferences_slot_tenant_fk
      foreign key (slot_template_id, tenant_id)
      references public.online_slot_templates(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists online_teacher_slot_preferences_tenant_idx
  on public.online_teacher_slot_preferences (tenant_id);
create index if not exists online_teacher_slot_preferences_teacher_idx
  on public.online_teacher_slot_preferences (tenant_id, teacher_id);
create index if not exists online_teacher_slot_preferences_available_idx
  on public.online_teacher_slot_preferences (tenant_id, slot_template_id)
  where is_available = true;

create table if not exists public.online_slot_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete restrict,
  slot_template_id uuid not null references public.online_slot_templates(id) on delete restrict,
  session_date date not null,
  student_id uuid not null,
  parent_id uuid not null references public.users(id) on delete restrict,
  assigned_teacher_id uuid not null references public.users(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  status text not null check (status in ('pending_payment', 'active', 'expired', 'released', 'cancelled')),
  seat_hold_expires_at timestamptz,
  assignment_strategy text not null default 'least_load_round_robin',
  assignment_snapshot jsonb not null default '{}'::jsonb,
  payment_reference text,
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending_payment' and seat_hold_expires_at is not null)
    or (status <> 'pending_payment')
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_claims'::regclass
      and conname = 'online_slot_claims_student_tenant_fk'
  ) then
    alter table public.online_slot_claims
      add constraint online_slot_claims_student_tenant_fk
      foreign key (student_id, tenant_id)
      references public.students(id, tenant_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_claims'::regclass
      and conname = 'online_slot_claims_course_tenant_fk'
  ) then
    alter table public.online_slot_claims
      add constraint online_slot_claims_course_tenant_fk
      foreign key (course_id, tenant_id)
      references public.online_courses(id, tenant_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_slot_claims'::regclass
      and conname = 'online_slot_claims_slot_tenant_fk'
  ) then
    alter table public.online_slot_claims
      add constraint online_slot_claims_slot_tenant_fk
      foreign key (slot_template_id, tenant_id)
      references public.online_slot_templates(id, tenant_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists online_slot_claims_tenant_idx
  on public.online_slot_claims (tenant_id);
create index if not exists online_slot_claims_parent_idx
  on public.online_slot_claims (tenant_id, parent_id, claimed_at desc);
create index if not exists online_slot_claims_teacher_idx
  on public.online_slot_claims (tenant_id, assigned_teacher_id, session_date);
create index if not exists online_slot_claims_student_idx
  on public.online_slot_claims (tenant_id, student_id, session_date);
create index if not exists online_slot_claims_hold_expiry_idx
  on public.online_slot_claims (tenant_id, seat_hold_expires_at)
  where status = 'pending_payment';
create unique index if not exists online_slot_claims_single_active_slot_idx
  on public.online_slot_claims (tenant_id, slot_template_id, session_date)
  where status in ('pending_payment', 'active');
create unique index if not exists online_slot_claims_single_active_student_idx
  on public.online_slot_claims (tenant_id, student_id)
  where status in ('pending_payment', 'active');

create table if not exists public.online_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  claim_id uuid not null references public.online_slot_claims(id) on delete cascade,
  student_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete restrict,
  session_date date not null,
  status text not null check (status in ('present', 'absent')),
  notes text,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, claim_id, session_date)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_attendance_sessions'::regclass
      and conname = 'online_attendance_sessions_student_tenant_fk'
  ) then
    alter table public.online_attendance_sessions
      add constraint online_attendance_sessions_student_tenant_fk
      foreign key (student_id, tenant_id)
      references public.students(id, tenant_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_attendance_sessions'::regclass
      and conname = 'online_attendance_sessions_claim_tenant_fk'
  ) then
    alter table public.online_attendance_sessions
      add constraint online_attendance_sessions_claim_tenant_fk
      foreign key (claim_id, tenant_id)
      references public.online_slot_claims(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists online_attendance_sessions_tenant_idx
  on public.online_attendance_sessions (tenant_id);
create index if not exists online_attendance_sessions_teacher_month_idx
  on public.online_attendance_sessions (tenant_id, teacher_id, session_date);
create index if not exists online_attendance_sessions_student_month_idx
  on public.online_attendance_sessions (tenant_id, student_id, session_date);

create table if not exists public.online_teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  teacher_id uuid not null references public.users(id) on delete cascade,
  claim_id uuid not null references public.online_slot_claims(id) on delete cascade,
  event_type text not null default 'new_assignment',
  status text not null default 'unread' check (status in ('unread', 'read')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_teacher_notifications'::regclass
      and conname = 'online_teacher_notifications_claim_tenant_fk'
  ) then
    alter table public.online_teacher_notifications
      add constraint online_teacher_notifications_claim_tenant_fk
      foreign key (claim_id, tenant_id)
      references public.online_slot_claims(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists online_teacher_notifications_tenant_teacher_idx
  on public.online_teacher_notifications (tenant_id, teacher_id, status, created_at desc);

create or replace function public.set_online_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_online_courses_updated_at on public.online_courses;
create trigger trg_online_courses_updated_at
before update on public.online_courses
for each row
execute function public.set_online_updated_at();

drop trigger if exists trg_online_slot_templates_updated_at on public.online_slot_templates;
create trigger trg_online_slot_templates_updated_at
before update on public.online_slot_templates
for each row
execute function public.set_online_updated_at();

drop trigger if exists trg_online_teacher_slot_preferences_updated_at on public.online_teacher_slot_preferences;
create trigger trg_online_teacher_slot_preferences_updated_at
before update on public.online_teacher_slot_preferences
for each row
execute function public.set_online_updated_at();

drop trigger if exists trg_online_slot_claims_updated_at on public.online_slot_claims;
create trigger trg_online_slot_claims_updated_at
before update on public.online_slot_claims
for each row
execute function public.set_online_updated_at();

drop trigger if exists trg_online_attendance_sessions_updated_at on public.online_attendance_sessions;
create trigger trg_online_attendance_sessions_updated_at
before update on public.online_attendance_sessions
for each row
execute function public.set_online_updated_at();

create or replace function public.expire_online_slot_holds(
  p_tenant_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer := 0;
begin
  perform set_config('row_security', 'off', true);

  update public.online_slot_claims c
  set status = 'expired',
      released_at = now(),
      updated_at = now()
  where c.status = 'pending_payment'
    and c.seat_hold_expires_at <= now()
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.claim_online_slot_atomic(
  p_tenant_id uuid,
  p_parent_id uuid,
  p_student_id uuid,
  p_slot_template_id uuid,
  p_session_date date,
  p_actor_user_id uuid default auth.uid()
)
returns table (
  ok boolean,
  code text,
  message text,
  claim_id uuid,
  assigned_teacher_id uuid,
  seat_hold_expires_at timestamptz,
  enrollment_id uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_slot record;
  v_assigned_teacher_id uuid;
  v_hold_expires_at timestamptz;
  v_claim_id uuid;
  v_enrollment_id uuid;
  v_online_program_id uuid;
  v_existing_claim_id uuid;
begin
  perform set_config('row_security', 'off', true);

  if p_tenant_id is null or p_parent_id is null or p_student_id is null
     or p_slot_template_id is null or p_session_date is null then
    return query
    select false, 'invalid_request', 'Missing required claim fields.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  if extract(dow from p_session_date) in (0, 6) then
    return query
    select false, 'weekend_not_allowed', 'Online sessions are only available Monday to Friday.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  select st.id, st.course_id, st.day_of_week
    into v_slot
  from public.online_slot_templates st
  where st.id = p_slot_template_id
    and st.tenant_id = p_tenant_id
    and st.is_active = true
  for update;

  if not found then
    return query
    select false, 'slot_not_found', 'Slot template not found or inactive.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  if coalesce(v_slot.day_of_week, -1) <> extract(dow from p_session_date)::smallint then
    return query
    select false, 'slot_day_mismatch', 'Selected date does not match slot template day.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  perform public.expire_online_slot_holds(p_tenant_id);

  select c.id
    into v_existing_claim_id
  from public.online_slot_claims c
  where c.tenant_id = p_tenant_id
    and c.slot_template_id = p_slot_template_id
    and c.session_date = p_session_date
    and c.status in ('pending_payment', 'active')
  limit 1;

  if v_existing_claim_id is not null then
    return query
    select false, 'slot_taken', 'Slot already claimed.', v_existing_claim_id, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  select p.id
    into v_online_program_id
  from public.programs p
  where p.tenant_id = p_tenant_id
    and p.type in ('online', 'hybrid')
    and p.is_active = true
  order by case when p.type = 'online' then 0 else 1 end, p.created_at
  limit 1;

  if v_online_program_id is null then
    return query
    select false, 'program_not_found', 'No active online program configured.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  select pref.teacher_id
    into v_assigned_teacher_id
  from public.online_teacher_slot_preferences pref
  join public.users u
    on u.id = pref.teacher_id
   and u.role = 'teacher'
  left join lateral (
    select count(*)::integer as active_load
    from public.online_slot_claims c
    where c.tenant_id = p_tenant_id
      and c.assigned_teacher_id = pref.teacher_id
      and c.status in ('pending_payment', 'active')
  ) load on true
  where pref.tenant_id = p_tenant_id
    and pref.slot_template_id = p_slot_template_id
    and pref.is_available = true
    and exists (
      select 1
      from public.teacher_assignments ta
      join public.programs p
        on p.id = ta.program_id
       and p.tenant_id = ta.tenant_id
      where ta.tenant_id = p_tenant_id
        and ta.teacher_id = pref.teacher_id
        and p.type in ('online', 'hybrid')
    )
  order by coalesce(load.active_load, 0) asc, pref.last_assigned_at asc nulls first, pref.teacher_id asc
  limit 1;

  if v_assigned_teacher_id is null then
    return query
    select false, 'no_teacher_available', 'No teacher available for this slot.', null::uuid, null::uuid, null::timestamptz, null::uuid;
    return;
  end if;

  v_hold_expires_at := now() + interval '30 minutes';

  begin
    insert into public.online_slot_claims (
      tenant_id,
      course_id,
      slot_template_id,
      session_date,
      student_id,
      parent_id,
      assigned_teacher_id,
      status,
      seat_hold_expires_at,
      assignment_strategy,
      assignment_snapshot
    )
    values (
      p_tenant_id,
      v_slot.course_id,
      p_slot_template_id,
      p_session_date,
      p_student_id,
      p_parent_id,
      v_assigned_teacher_id,
      'pending_payment',
      v_hold_expires_at,
      'least_load_round_robin',
      jsonb_build_object(
        'assigned_at', now(),
        'assigned_by', p_actor_user_id,
        'algorithm', 'least_load_round_robin'
      )
    )
    returning id into v_claim_id;
  exception
    when unique_violation then
      select c.id
        into v_existing_claim_id
      from public.online_slot_claims c
      where c.tenant_id = p_tenant_id
        and c.slot_template_id = p_slot_template_id
        and c.session_date = p_session_date
        and c.status in ('pending_payment', 'active')
      limit 1;

      return query
      select false, 'slot_taken', 'Slot already claimed.', v_existing_claim_id, null::uuid, null::timestamptz, null::uuid;
      return;
  end;

  insert into public.enrollments (
    tenant_id,
    student_id,
    program_id,
    status,
    start_date,
    metadata
  )
  values (
    p_tenant_id,
    p_student_id,
    v_online_program_id,
    'pending_payment',
    current_date,
    jsonb_build_object(
      'status_reason', 'Online slot claimed',
      'online_claim_id', v_claim_id
    )
  )
  on conflict (student_id, program_id, tenant_id)
  do update set
    status = case when public.enrollments.status = 'active' then 'active' else 'pending_payment' end,
    end_date = null,
    metadata = coalesce(public.enrollments.metadata, '{}'::jsonb)
      || jsonb_build_object('online_claim_id', v_claim_id, 'status_reason', 'Online slot claimed'),
    updated_at = now()
  returning id into v_enrollment_id;

  update public.online_slot_claims
  set enrollment_id = v_enrollment_id
  where id = v_claim_id;

  update public.online_teacher_slot_preferences
  set last_assigned_at = now(),
      updated_at = now()
  where tenant_id = p_tenant_id
    and slot_template_id = p_slot_template_id
    and teacher_id = v_assigned_teacher_id;

  insert into public.online_teacher_notifications (
    tenant_id,
    teacher_id,
    claim_id,
    event_type,
    message,
    metadata
  )
  values (
    p_tenant_id,
    v_assigned_teacher_id,
    v_claim_id,
    'new_assignment',
    'New online slot assignment pending payment confirmation.',
    jsonb_build_object(
      'student_id', p_student_id,
      'slot_template_id', p_slot_template_id,
      'session_date', p_session_date
    )
  );

  return query
  select true, 'claimed', 'Slot claimed successfully.', v_claim_id, v_assigned_teacher_id, v_hold_expires_at, v_enrollment_id;
end;
$$;

create or replace function public.confirm_online_slot_payment(
  p_tenant_id uuid,
  p_claim_id uuid,
  p_payment_reference text default null,
  p_actor_user_id uuid default auth.uid()
)
returns table (
  ok boolean,
  code text,
  message text,
  enrollment_id uuid,
  claim_status text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_claim public.online_slot_claims%rowtype;
begin
  perform set_config('row_security', 'off', true);

  if p_tenant_id is null or p_claim_id is null then
    return query
    select false, 'invalid_request', 'Missing tenant or claim id.', null::uuid, null::text;
    return;
  end if;

  perform public.expire_online_slot_holds(p_tenant_id);

  select *
    into v_claim
  from public.online_slot_claims c
  where c.tenant_id = p_tenant_id
    and c.id = p_claim_id
  for update;

  if not found then
    return query
    select false, 'claim_not_found', 'Claim does not exist.', null::uuid, null::text;
    return;
  end if;

  if v_claim.status = 'active' then
    return query
    select true, 'already_active', 'Claim already active.', v_claim.enrollment_id, v_claim.status;
    return;
  end if;

  if v_claim.status = 'pending_payment'
     and coalesce(v_claim.seat_hold_expires_at, now() - interval '1 second') <= now() then
    update public.online_slot_claims
    set status = 'expired',
        released_at = now(),
        updated_at = now()
    where id = v_claim.id;

    return query
    select false, 'hold_expired', 'Seat hold expired.', v_claim.enrollment_id, 'expired'::text;
    return;
  end if;

  if v_claim.status <> 'pending_payment' then
    return query
    select false, 'invalid_status', 'Claim cannot be activated from current status.', v_claim.enrollment_id, v_claim.status;
    return;
  end if;

  update public.online_slot_claims
  set status = 'active',
      seat_hold_expires_at = null,
      payment_reference = coalesce(p_payment_reference, payment_reference),
      released_at = null,
      assignment_snapshot = assignment_snapshot || jsonb_build_object('payment_confirmed_by', p_actor_user_id, 'payment_confirmed_at', now()),
      updated_at = now()
  where id = v_claim.id;

  if v_claim.enrollment_id is not null then
    update public.enrollments e
    set status = 'active',
        end_date = null,
        metadata = coalesce(e.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'status_reason', 'Online payment confirmed',
            'online_claim_id', v_claim.id,
            'payment_reference', coalesce(p_payment_reference, '')
          ),
        updated_at = now()
    where e.id = v_claim.enrollment_id
      and e.tenant_id = p_tenant_id;
  end if;

  return query
  select true, 'activated', 'Payment confirmed and enrollment activated.', v_claim.enrollment_id, 'active'::text;
end;
$$;

create or replace function public.release_online_slot_claim(
  p_tenant_id uuid,
  p_claim_id uuid,
  p_reason text default 'released'
)
returns table (
  ok boolean,
  code text,
  message text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_claim public.online_slot_claims%rowtype;
begin
  perform set_config('row_security', 'off', true);

  select *
    into v_claim
  from public.online_slot_claims c
  where c.tenant_id = p_tenant_id
    and c.id = p_claim_id
  for update;

  if not found then
    return query select false, 'claim_not_found', 'Claim not found.';
    return;
  end if;

  if v_claim.status = 'active' then
    return query select false, 'active_claim', 'Active claim cannot be released directly.';
    return;
  end if;

  if v_claim.status in ('released', 'expired', 'cancelled') then
    return query select true, 'already_released', 'Claim already released.';
    return;
  end if;

  update public.online_slot_claims
  set status = 'released',
      released_at = now(),
      assignment_snapshot = assignment_snapshot || jsonb_build_object('release_reason', p_reason),
      updated_at = now()
  where id = v_claim.id;

  return query select true, 'released', 'Claim released.';
end;
$$;

create or replace view public.online_attendance_monthly_rollup as
select
  tenant_id,
  date_trunc('month', session_date)::date as month_start,
  count(*) filter (where status = 'present') as present_count,
  count(*) filter (where status = 'absent') as absent_count,
  count(*) as total_sessions
from public.online_attendance_sessions
group by tenant_id, date_trunc('month', session_date)::date;

alter table public.online_courses enable row level security;
alter table public.online_slot_templates enable row level security;
alter table public.online_teacher_slot_preferences enable row level security;
alter table public.online_slot_claims enable row level security;
alter table public.online_attendance_sessions enable row level security;
alter table public.online_teacher_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_courses'
      and policyname = 'tenant_guard_online_courses'
  ) then
    create policy tenant_guard_online_courses
      on public.online_courses
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_courses.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_courses.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_slot_templates'
      and policyname = 'tenant_guard_online_slot_templates'
  ) then
    create policy tenant_guard_online_slot_templates
      on public.online_slot_templates
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_slot_templates.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_slot_templates.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_teacher_slot_preferences'
      and policyname = 'tenant_guard_online_teacher_slot_preferences'
  ) then
    create policy tenant_guard_online_teacher_slot_preferences
      on public.online_teacher_slot_preferences
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_teacher_slot_preferences.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_teacher_slot_preferences.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_slot_claims'
      and policyname = 'tenant_guard_online_slot_claims'
  ) then
    create policy tenant_guard_online_slot_claims
      on public.online_slot_claims
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_slot_claims.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_slot_claims.tenant_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_slot_claims'
      and policyname = 'online_slot_claims_parent_read'
  ) then
    create policy online_slot_claims_parent_read
      on public.online_slot_claims
      for select
      to authenticated
      using (public.is_parent_for_student(online_slot_claims.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_slot_claims'
      and policyname = 'online_slot_claims_teacher_read'
  ) then
    create policy online_slot_claims_teacher_read
      on public.online_slot_claims
      for select
      to authenticated
      using (online_slot_claims.assigned_teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_slot_claims'
      and policyname = 'online_slot_claims_admin_manage'
  ) then
    create policy online_slot_claims_admin_manage
      on public.online_slot_claims
      for all
      to authenticated
      using (public.is_admin_for_student(online_slot_claims.student_id))
      with check (public.is_admin_for_student(online_slot_claims.student_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_attendance_sessions'
      and policyname = 'tenant_guard_online_attendance_sessions'
  ) then
    create policy tenant_guard_online_attendance_sessions
      on public.online_attendance_sessions
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_attendance_sessions.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_attendance_sessions.tenant_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_attendance_sessions'
      and policyname = 'online_attendance_sessions_teacher_manage'
  ) then
    create policy online_attendance_sessions_teacher_manage
      on public.online_attendance_sessions
      for all
      to authenticated
      using (online_attendance_sessions.teacher_id = auth.uid())
      with check (online_attendance_sessions.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_attendance_sessions'
      and policyname = 'online_attendance_sessions_parent_read'
  ) then
    create policy online_attendance_sessions_parent_read
      on public.online_attendance_sessions
      for select
      to authenticated
      using (public.is_parent_for_student(online_attendance_sessions.student_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_attendance_sessions'
      and policyname = 'online_attendance_sessions_admin_manage'
  ) then
    create policy online_attendance_sessions_admin_manage
      on public.online_attendance_sessions
      for all
      to authenticated
      using (public.is_admin_for_student(online_attendance_sessions.student_id))
      with check (public.is_admin_for_student(online_attendance_sessions.student_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_teacher_notifications'
      and policyname = 'tenant_guard_online_teacher_notifications'
  ) then
    create policy tenant_guard_online_teacher_notifications
      on public.online_teacher_notifications
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_teacher_notifications.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_teacher_notifications.tenant_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_teacher_notifications'
      and policyname = 'online_teacher_notifications_teacher_read'
  ) then
    create policy online_teacher_notifications_teacher_read
      on public.online_teacher_notifications
      for select
      to authenticated
      using (online_teacher_notifications.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_teacher_notifications'
      and policyname = 'online_teacher_notifications_teacher_update'
  ) then
    create policy online_teacher_notifications_teacher_update
      on public.online_teacher_notifications
      for update
      to authenticated
      using (online_teacher_notifications.teacher_id = auth.uid())
      with check (online_teacher_notifications.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'online_teacher_notifications'
      and policyname = 'online_teacher_notifications_admin_manage'
  ) then
    create policy online_teacher_notifications_admin_manage
      on public.online_teacher_notifications
      for all
      to authenticated
      using (exists (
        select 1
        from public.online_slot_claims c
        where c.id = online_teacher_notifications.claim_id
          and public.is_admin_for_student(c.student_id)
      ))
      with check (exists (
        select 1
        from public.online_slot_claims c
        where c.id = online_teacher_notifications.claim_id
          and public.is_admin_for_student(c.student_id)
      ));
  end if;
end;
$$;

revoke all on function public.expire_online_slot_holds(uuid) from public;
revoke all on function public.claim_online_slot_atomic(uuid, uuid, uuid, uuid, date, uuid) from public;
revoke all on function public.confirm_online_slot_payment(uuid, uuid, text, uuid) from public;
revoke all on function public.release_online_slot_claim(uuid, uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.expire_online_slot_holds(uuid) to service_role';
    execute 'grant execute on function public.claim_online_slot_atomic(uuid, uuid, uuid, uuid, date, uuid) to service_role';
    execute 'grant execute on function public.confirm_online_slot_payment(uuid, uuid, text, uuid) to service_role';
    execute 'grant execute on function public.release_online_slot_claim(uuid, uuid, text) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.expire_online_slot_holds(uuid) to authenticated';
    execute 'grant execute on function public.claim_online_slot_atomic(uuid, uuid, uuid, uuid, date, uuid) to authenticated';
    execute 'grant execute on function public.confirm_online_slot_payment(uuid, uuid, text, uuid) to authenticated';
    execute 'grant execute on function public.release_online_slot_claim(uuid, uuid, text) to authenticated';
  end if;
end;
$$;

commit;
