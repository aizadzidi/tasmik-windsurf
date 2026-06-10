-- Atomic recurring online package self-claim.
-- Prevents concurrent parent/student claims from reserving the same teacher slot
-- and releases expired pending holds before checking availability.

create or replace function public.claim_online_recurring_package_atomic(
  p_tenant_id uuid,
  p_student_id uuid,
  p_course_id uuid,
  p_slot_template_ids uuid[],
  p_effective_month date,
  p_source text,
  p_actor_user_id uuid
)
returns table (
  ok boolean,
  code text,
  message text,
  package_id uuid,
  assigned_teacher_id uuid,
  seat_hold_expires_at timestamptz,
  package_slots jsonb
)
language plpgsql
security definer
set search_path = public
as '
declare
  v_course record;
  v_slot_ids uuid[];
  v_slot_count integer;
  v_required_count integer;
  v_teacher_id uuid;
  v_package_id uuid;
  v_hold_expires_at timestamptz;
  v_lock_slot_id uuid;
begin
  select array_agg(distinct slot_id order by slot_id)
  into v_slot_ids
  from unnest(coalesce(p_slot_template_ids, array[]::uuid[])) as slot_id
  where slot_id is not null;

  v_slot_count := coalesce(array_length(v_slot_ids, 1), 0);

  if p_tenant_id is null or p_student_id is null or p_course_id is null or p_effective_month is null then
    return query select false, ''invalid_request'', ''Missing required claim fields.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  if v_slot_count = 0 then
    return query select false, ''invalid_slots'', ''At least one slot is required.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '':online-package-student:'' || p_student_id::text || '':'' || p_effective_month::text, 0));

  foreach v_lock_slot_id in array v_slot_ids loop
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '':online-package-slot:'' || p_effective_month::text || '':'' || v_lock_slot_id::text, 0));
  end loop;

  update public.online_recurring_packages
  set status = ''cancelled'',
      updated_at = now(),
      updated_by = coalesce(p_actor_user_id, updated_by)
  where tenant_id = p_tenant_id
    and status in (''draft'', ''pending_payment'')
    and hold_expires_at is not null
    and hold_expires_at <= now();

  select *
  into v_course
  from public.online_courses
  where tenant_id = p_tenant_id
    and id = p_course_id
    and is_active = true;

  if not found then
    return query select false, ''course_not_found'', ''Course not found.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  v_required_count := greatest(coalesce(v_course.sessions_per_week, v_slot_count), 1);
  if v_slot_count <> v_required_count then
    return query select false, ''invalid_slot_count'', format(''This course requires exactly %s weekly slot(s).'', v_required_count), null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  if (
    select count(*)
    from public.online_slot_templates template
    where template.tenant_id = p_tenant_id
      and template.course_id = p_course_id
      and template.is_active = true
      and template.id = any(v_slot_ids)
  ) <> v_slot_count then
    return query select false, ''slot_not_found'', ''All selected weekly slots must belong to the same active course.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  if exists (
    select 1
    from public.online_recurring_packages pkg
    where pkg.tenant_id = p_tenant_id
      and pkg.student_id = p_student_id
      and pkg.status in (''draft'', ''pending_payment'', ''active'')
      and pkg.effective_month <= p_effective_month
      and (pkg.effective_to is null or pkg.effective_to >= p_effective_month)
  ) then
    return query select false, ''student_package_exists'', ''This student already has a package draft or active package for that month.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  with teacher_candidates as (
    select
      pref.teacher_id,
      min(pref.last_assigned_at) as last_assigned_at
    from public.online_teacher_slot_preferences pref
    where pref.tenant_id = p_tenant_id
      and pref.is_available = true
      and pref.slot_template_id = any(v_slot_ids)
    group by pref.teacher_id
    having count(distinct pref.slot_template_id) = v_slot_count
  ),
  available_teachers as (
    select candidate.teacher_id, candidate.last_assigned_at
    from teacher_candidates candidate
    where not exists (
      select 1
      from public.online_recurring_packages pkg
      join public.online_recurring_package_slots slot
        on slot.tenant_id = pkg.tenant_id
       and slot.package_id = pkg.id
       and slot.status = ''active''
      where pkg.tenant_id = p_tenant_id
        and pkg.teacher_id = candidate.teacher_id
        and pkg.status in (''draft'', ''pending_payment'', ''active'')
        and pkg.effective_month <= p_effective_month
        and (pkg.effective_to is null or pkg.effective_to >= p_effective_month)
        and slot.slot_template_id = any(v_slot_ids)
    )
  ),
  teacher_loads as (
    select
      teacher.teacher_id,
      teacher.last_assigned_at,
      count(pkg.id) filter (where pkg.status in (''draft'', ''pending_payment'', ''active'')) as active_load
    from available_teachers teacher
    left join public.online_recurring_packages pkg
      on pkg.tenant_id = p_tenant_id
     and pkg.teacher_id = teacher.teacher_id
     and pkg.status in (''draft'', ''pending_payment'', ''active'')
    group by teacher.teacher_id, teacher.last_assigned_at
  )
  select teacher_id
  into v_teacher_id
  from teacher_loads
  order by active_load asc, last_assigned_at asc nulls first, teacher_id::text asc
  limit 1;

  if v_teacher_id is null then
    return query select false, ''no_teacher_available'', ''No teacher is available for the selected package slots.'', null::uuid, null::uuid, null::timestamptz, ''[]''::jsonb;
    return;
  end if;

  v_hold_expires_at := now() + interval ''30 minutes'';

  insert into public.online_recurring_packages (
    tenant_id,
    student_id,
    course_id,
    teacher_id,
    status,
    source,
    effective_month,
    effective_from,
    sessions_per_week,
    monthly_fee_cents_snapshot,
    hold_expires_at,
    created_by,
    updated_by
  )
  values (
    p_tenant_id,
    p_student_id,
    p_course_id,
    v_teacher_id,
    ''pending_payment'',
    coalesce(nullif(p_source, ''''), ''self_pick''),
    p_effective_month,
    p_effective_month,
    v_required_count,
    coalesce(v_course.monthly_fee_cents, 0),
    v_hold_expires_at,
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into v_package_id;

  insert into public.online_recurring_package_slots (
    tenant_id,
    package_id,
    slot_template_id,
    day_of_week_snapshot,
    start_time_snapshot,
    duration_minutes_snapshot,
    status
  )
  select
    p_tenant_id,
    v_package_id,
    template.id,
    template.day_of_week,
    template.start_time,
    template.duration_minutes,
    ''active''
  from public.online_slot_templates template
  where template.tenant_id = p_tenant_id
    and template.id = any(v_slot_ids)
  order by template.day_of_week, template.start_time;

  update public.online_teacher_slot_preferences
  set last_assigned_at = now(),
      updated_at = now()
  where tenant_id = p_tenant_id
    and teacher_id = v_teacher_id
    and slot_template_id = any(v_slot_ids);

  return query
  select
    true,
    ''claimed'',
    ''Package held successfully.'',
    v_package_id,
    v_teacher_id,
    v_hold_expires_at,
    coalesce(
      (
        select jsonb_agg(to_jsonb(slot.*) order by slot.day_of_week_snapshot, slot.start_time_snapshot)
        from public.online_recurring_package_slots slot
        where slot.tenant_id = p_tenant_id
          and slot.package_id = v_package_id
      ),
      ''[]''::jsonb
    );
end;
';

revoke all on function public.claim_online_recurring_package_atomic(uuid, uuid, uuid, uuid[], date, text, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_online_recurring_package_atomic(uuid, uuid, uuid, uuid[], date, text, uuid)
  to service_role;

create or replace function public.activate_paid_online_package_atomic(
  p_tenant_id uuid,
  p_package_id uuid,
  p_assignment_id uuid default null
)
returns table (
  ok boolean,
  code text,
  package_id uuid,
  assignment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package record;
  v_assignment_id uuid;
begin
  if p_tenant_id is null or p_package_id is null then
    return query select false, 'invalid_request', null::uuid, null::uuid;
    return;
  end if;

  select id, status, hold_expires_at, student_package_assignment_id
    into v_package
  from public.online_recurring_packages
  where tenant_id = p_tenant_id
    and id = p_package_id
  for update;

  if not found then
    return query select false, 'missing_package', p_package_id, p_assignment_id;
    return;
  end if;

  v_assignment_id := coalesce(p_assignment_id, v_package.student_package_assignment_id);

  if v_package.status = 'active' then
    if v_assignment_id is not null then
      update public.online_student_package_assignments
      set status = 'active',
          updated_at = now()
      where tenant_id = p_tenant_id
        and id = v_assignment_id
        and status in ('draft', 'pending_payment');
    end if;

    return query select true, 'already_active', p_package_id, v_assignment_id;
    return;
  end if;

  if v_package.status <> 'pending_payment' then
    return query select false, 'ignored_status', p_package_id, v_assignment_id;
    return;
  end if;

  if v_package.hold_expires_at is not null and v_package.hold_expires_at <= now() then
    return query select false, 'hold_expired', p_package_id, v_assignment_id;
    return;
  end if;

  update public.online_recurring_packages
  set status = 'active',
      hold_expires_at = null,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_package_id
    and status = 'pending_payment';

  if v_assignment_id is not null then
    update public.online_student_package_assignments
    set status = 'active',
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = v_assignment_id
      and status in ('draft', 'pending_payment');
  end if;

  return query select true, 'activated', p_package_id, v_assignment_id;
end;
$$;

revoke all on function public.activate_paid_online_package_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.activate_paid_online_package_atomic(uuid, uuid, uuid)
  to service_role;
