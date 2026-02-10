-- Staging-based migration toolkit for moving students across campus/online/hybrid.
-- Safe flow:
-- 1) Insert target rows into public.student_program_migration_staging.
-- 2) Review public.student_program_migration_preview.
-- 3) Run: select * from public.apply_student_program_migration_staging('<tenant_uuid>');
--
-- Example: move selected students to online only (switch from campus)
-- insert into public.student_program_migration_staging (
--   tenant_id, student_id, target_program_type, transition_mode, close_previous_status, reason
-- )
-- select
--   s.tenant_id,
--   s.id,
--   'online',
--   'switch',
--   'paused',
--   'Jan 2026 online migration'
-- from public.students s
-- where s.student_id_no in ('A-1001', 'A-1002');

begin;

create table if not exists public.student_program_migration_staging (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  target_program_type text not null check (target_program_type in ('campus', 'online', 'hybrid')),
  transition_mode text not null default 'coexist' check (transition_mode in ('coexist', 'switch')),
  close_previous_status text not null default 'paused' check (close_previous_status in ('paused', 'cancelled')),
  clear_class_on_online_switch boolean not null default true,
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references public.users(id) on delete set null,
  apply_result text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.student_program_migration_staging'::regclass
      and conname = 'student_program_migration_staging_student_tenant_fk'
  ) then
    alter table public.student_program_migration_staging
      add constraint student_program_migration_staging_student_tenant_fk
      foreign key (student_id, tenant_id)
      references public.students(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists student_program_migration_staging_tenant_idx
  on public.student_program_migration_staging (tenant_id);
create index if not exists student_program_migration_staging_student_idx
  on public.student_program_migration_staging (student_id);
create index if not exists student_program_migration_staging_pending_idx
  on public.student_program_migration_staging (tenant_id, created_at)
  where applied_at is null;
create unique index if not exists uq_student_program_migration_staging_pending
  on public.student_program_migration_staging (tenant_id, student_id, target_program_type)
  where applied_at is null;

alter table public.student_program_migration_staging enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_program_migration_staging'
      and policyname = 'tenant_guard_student_program_migration_staging'
  ) then
    create policy tenant_guard_student_program_migration_staging
      on public.student_program_migration_staging
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = student_program_migration_staging.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = student_program_migration_staging.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_program_migration_staging'
      and policyname = 'student_program_migration_staging_admin_manage'
  ) then
    create policy student_program_migration_staging_admin_manage
      on public.student_program_migration_staging
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = student_program_migration_staging.tenant_id
          and up.role = 'school_admin'
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = student_program_migration_staging.tenant_id
          and up.role = 'school_admin'
      ));
  end if;
end;
$$;

create or replace view public.student_program_migration_preview as
select
  stg.id,
  stg.tenant_id,
  stg.student_id,
  s.name as student_name,
  s.student_id_no,
  s.class_id,
  stg.target_program_type,
  stg.transition_mode,
  stg.close_previous_status,
  stg.clear_class_on_online_switch,
  stg.reason,
  stg.created_at,
  stg.applied_at,
  stg.apply_result,
  coalesce(array_agg(distinct p.type) filter (where e.id is not null), '{}'::text[]) as current_program_types,
  coalesce(array_agg(distinct e.status) filter (where e.id is not null), '{}'::text[]) as current_enrollment_statuses
from public.student_program_migration_staging stg
join public.students s
  on s.id = stg.student_id
 and s.tenant_id = stg.tenant_id
left join public.enrollments e
  on e.student_id = stg.student_id
 and e.tenant_id = stg.tenant_id
 and e.status in ('active', 'paused', 'pending_payment')
left join public.programs p
  on p.id = e.program_id
 and p.tenant_id = e.tenant_id
group by
  stg.id,
  stg.tenant_id,
  stg.student_id,
  s.name,
  s.student_id_no,
  s.class_id,
  stg.target_program_type,
  stg.transition_mode,
  stg.close_previous_status,
  stg.clear_class_on_online_switch,
  stg.reason,
  stg.created_at,
  stg.applied_at,
  stg.apply_result;

create or replace function public.apply_student_program_migration_staging(
  p_tenant_id uuid default current_tenant_id(),
  p_limit integer default 1000
)
returns table (
  processed integer,
  enrollments_upserted integer,
  previous_enrollments_closed integer,
  class_assignments_cleared integer
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  rec record;
  v_target_program_id uuid;
  v_row_count integer;
  v_is_verified boolean;
  v_is_actor_admin boolean;
  v_target_status text;
  v_processed integer := 0;
  v_upserted integer := 0;
  v_closed integer := 0;
  v_cleared integer := 0;
begin
  perform set_config('row_security', 'off', true);

  if p_tenant_id is null then
    raise exception 'tenant_id is required';
  end if;

  -- Allow service role and SQL editor, but enforce tenant school_admin for authenticated calls.
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    select exists (
      select 1
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = p_tenant_id
        and up.role = 'school_admin'
    )
    into v_is_actor_admin;

    if not coalesce(v_is_actor_admin, false) then
      raise exception 'Only school_admin can apply student program migrations';
    end if;
  end if;

  for rec in
    select *
    from public.student_program_migration_staging
    where tenant_id = p_tenant_id
      and applied_at is null
    order by created_at, id
    limit greatest(coalesce(p_limit, 1000), 1)
  loop
    select p.id
      into v_target_program_id
    from public.programs p
    where p.tenant_id = rec.tenant_id
      and p.type = rec.target_program_type
      and p.is_active = true
    order by p.created_at
    limit 1;

    if v_target_program_id is null then
      raise exception 'No active program found for tenant %, type %', rec.tenant_id, rec.target_program_type;
    end if;

    insert into public.enrollments (
      tenant_id,
      student_id,
      program_id,
      status,
      start_date,
      end_date,
      metadata
    )
    values (
      rec.tenant_id,
      rec.student_id,
      v_target_program_id,
      'pending_payment',
      current_date,
      null,
      jsonb_strip_nulls(
        jsonb_build_object(
          'status_reason', coalesce(rec.reason, 'Program migration'),
          'migrated_from_staging_id', rec.id
        )
      )
    )
    on conflict (student_id, program_id, tenant_id) do nothing;

    get diagnostics v_row_count = row_count;
    v_upserted := v_upserted + coalesce(v_row_count, 0);

    update public.enrollments e
    set metadata = coalesce(e.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'status_reason', coalesce(rec.reason, 'Program migration'),
          'migrated_from_staging_id', rec.id
        )
      ),
      updated_at = now()
    where e.tenant_id = rec.tenant_id
      and e.student_id = rec.student_id
      and e.program_id = v_target_program_id;

    v_is_verified := public.is_verified_contact_for_student(rec.student_id);
    if v_is_verified then
      update public.enrollments e
      set status = 'active',
          end_date = null,
          metadata = coalesce(e.metadata, '{}'::jsonb)
            || jsonb_strip_nulls(
              jsonb_build_object(
                'status_reason', coalesce(rec.reason, 'Program migration'),
                'migrated_from_staging_id', rec.id
              )
            ),
          updated_at = now()
      where e.tenant_id = rec.tenant_id
        and e.student_id = rec.student_id
        and e.program_id = v_target_program_id
        and e.status in ('pending_payment', 'paused');

      get diagnostics v_row_count = row_count;
      v_upserted := v_upserted + coalesce(v_row_count, 0);
    end if;

    select e.status
      into v_target_status
    from public.enrollments e
    where e.tenant_id = rec.tenant_id
      and e.student_id = rec.student_id
      and e.program_id = v_target_program_id;

    if rec.transition_mode = 'switch'
       and v_target_status in ('active', 'pending_payment') then
      update public.enrollments e
      set status = rec.close_previous_status,
          end_date = coalesce(e.end_date, current_date),
          metadata = coalesce(e.metadata, '{}'::jsonb)
            || jsonb_strip_nulls(
              jsonb_build_object(
                'status_reason', coalesce(rec.reason, 'Program migration switch'),
                'migrated_from_staging_id', rec.id
              )
            ),
          updated_at = now()
      from public.programs p
      where e.tenant_id = rec.tenant_id
        and e.student_id = rec.student_id
        and p.id = e.program_id
        and p.tenant_id = e.tenant_id
        and p.type <> rec.target_program_type
        and e.status in ('active', 'pending_payment', 'paused');

      get diagnostics v_row_count = row_count;
      v_closed := v_closed + coalesce(v_row_count, 0);

      if rec.target_program_type = 'online'
         and rec.clear_class_on_online_switch then
        update public.students s
        set class_id = null
        where s.tenant_id = rec.tenant_id
          and s.id = rec.student_id
          and s.class_id is not null;

        get diagnostics v_row_count = row_count;
        v_cleared := v_cleared + coalesce(v_row_count, 0);
      end if;
    end if;

    update public.student_program_migration_staging
    set applied_at = now(),
        applied_by = coalesce(auth.uid(), rec.created_by),
        apply_result = case
          when v_target_status = 'active' then 'ok'
          when v_target_status = 'pending_payment' then 'ok_pending_payment'
          else 'ok_' || coalesce(v_target_status, 'unknown')
        end
    where id = rec.id;

    v_processed := v_processed + 1;
  end loop;

  return query
  select v_processed, v_upserted, v_closed, v_cleared;
end;
$$;

revoke all on function public.apply_student_program_migration_staging(uuid, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_student_program_migration_staging(uuid, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.apply_student_program_migration_staging(uuid, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_student_program_migration_staging(uuid, integer) to service_role';
  end if;
end;
$$;

commit;
