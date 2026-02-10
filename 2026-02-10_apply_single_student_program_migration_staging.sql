-- Deterministic single-row apply for student program migration staging.
-- Fixes race/mismatch risk when API requests should apply one specific student only.

begin;

create or replace function public.apply_single_student_program_migration_staging(
  p_tenant_id uuid default current_tenant_id(),
  p_staging_id uuid default null
)
returns table (
  processed integer,
  enrollments_upserted integer,
  previous_enrollments_closed integer,
  class_assignments_cleared integer,
  processed_staging_id uuid,
  processed_student_id uuid,
  target_status text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  rec public.student_program_migration_staging%rowtype;
  v_target_program_id uuid;
  v_row_count integer;
  v_is_verified boolean;
  v_target_status text;
  v_upserted integer := 0;
  v_closed integer := 0;
  v_cleared integer := 0;
begin
  perform set_config('row_security', 'off', true);

  if p_tenant_id is null then
    raise exception 'tenant_id is required';
  end if;

  if p_staging_id is null then
    raise exception 'staging_id is required';
  end if;

  -- Allow service role and SQL editor, but enforce tenant school_admin for authenticated calls.
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    if not exists (
      select 1
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.tenant_id = p_tenant_id
        and up.role = 'school_admin'
    ) then
      raise exception 'Only school_admin can apply student program migrations';
    end if;
  end if;

  select stg.*
  into rec
  from public.student_program_migration_staging stg
  where stg.tenant_id = p_tenant_id
    and stg.id = p_staging_id
    and stg.applied_at is null
  for update skip locked;

  if not found then
    raise exception 'Staging row not found, already applied, or locked';
  end if;

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

  v_is_verified := public.is_verified_contact_for_student(rec.student_id);
  v_target_status := case when v_is_verified then 'active' else 'pending_payment' end;

  update public.enrollments e
  set status = v_target_status,
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
    and e.status in ('draft', 'pending_payment', 'active', 'paused', 'cancelled', 'completed');

  get diagnostics v_row_count = row_count;
  v_upserted := v_upserted + coalesce(v_row_count, 0);

  select e.status
    into v_target_status
  from public.enrollments e
  where e.tenant_id = rec.tenant_id
    and e.student_id = rec.student_id
    and e.program_id = v_target_program_id;

  if v_target_status not in ('active', 'pending_payment') then
    raise exception 'Target enrollment status invalid after apply: %', coalesce(v_target_status, 'null');
  end if;

  if rec.transition_mode = 'switch' then
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

  return query
  select
    1::integer,
    v_upserted,
    v_closed,
    v_cleared,
    rec.id,
    rec.student_id,
    v_target_status;
end;
$$;

revoke all on function public.apply_single_student_program_migration_staging(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_single_student_program_migration_staging(uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.apply_single_student_program_migration_staging(uuid, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_single_student_program_migration_staging(uuid, uuid) to service_role';
  end if;
end;
$$;

commit;
