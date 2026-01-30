-- Adds enrollment lifecycle enforcement, audit log, and draft expiry helper.
-- Run this in Supabase SQL editor (write access required).

begin;

--------------------------------------------------------------------------------
-- 1) Audit log table
--------------------------------------------------------------------------------
create table if not exists public.enrollment_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists enrollment_status_events_tenant_id_idx
  on public.enrollment_status_events (tenant_id);
create index if not exists enrollment_status_events_enrollment_id_idx
  on public.enrollment_status_events (enrollment_id);

alter table public.enrollment_status_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollment_status_events'
      and policyname = 'tenant_guard_enrollment_status_events'
  ) then
    create policy tenant_guard_enrollment_status_events
      on public.enrollment_status_events
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollment_status_events.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = enrollment_status_events.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollment_status_events'
      and policyname = 'enrollment_status_events_parent_read'
  ) then
    create policy enrollment_status_events_parent_read
      on public.enrollment_status_events
      for select
      to authenticated
      using (exists (
        select 1
        from public.enrollments e
        where e.id = enrollment_status_events.enrollment_id
          and public.is_parent_for_student(e.student_id)
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollment_status_events'
      and policyname = 'enrollment_status_events_teacher_read'
  ) then
    create policy enrollment_status_events_teacher_read
      on public.enrollment_status_events
      for select
      to authenticated
      using (exists (
        select 1
        from public.enrollments e
        where e.id = enrollment_status_events.enrollment_id
          and public.is_assigned_teacher_for_student(e.student_id)
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'enrollment_status_events'
      and policyname = 'enrollment_status_events_admin_manage'
  ) then
    create policy enrollment_status_events_admin_manage
      on public.enrollment_status_events
      for all
      to authenticated
      using (exists (
        select 1
        from public.enrollments e
        where e.id = enrollment_status_events.enrollment_id
          and public.is_admin_for_student(e.student_id)
      ))
      with check (exists (
        select 1
        from public.enrollments e
        where e.id = enrollment_status_events.enrollment_id
          and public.is_admin_for_student(e.student_id)
      ));
  end if;
end;
$$;

--------------------------------------------------------------------------------
-- 2) Enrollment lifecycle audit logging
--------------------------------------------------------------------------------
create or replace function public.set_enrollments_updated_at()
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

drop trigger if exists trg_enrollments_set_updated_at on public.enrollments;
create trigger trg_enrollments_set_updated_at
before update on public.enrollments
for each row
execute function public.set_enrollments_updated_at();

create or replace function public.log_enrollment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);

  if tg_op = 'INSERT' or (old.status is distinct from new.status) then
    insert into public.enrollment_status_events (
      tenant_id,
      enrollment_id,
      from_status,
      to_status,
      changed_by,
      reason,
      metadata
    )
    values (
      new.tenant_id,
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      auth.uid(),
      nullif(new.metadata->>'status_reason', ''),
      new.metadata
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrollments_log_status on public.enrollments;
create trigger trg_enrollments_log_status
after insert or update of status on public.enrollments
for each row
execute function public.log_enrollment_status_change();

commit;
