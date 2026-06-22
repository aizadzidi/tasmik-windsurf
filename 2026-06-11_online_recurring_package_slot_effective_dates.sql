-- Keep recurring package slot history instead of mutating schedule rows in-place.

alter table public.online_recurring_package_slots
  add column if not exists effective_from date,
  add column if not exists effective_to date;

update public.online_recurring_package_slots slot
set
  effective_from = coalesce(slot.effective_from, pkg.effective_from, pkg.effective_month),
  effective_to = coalesce(slot.effective_to, pkg.effective_to)
from public.online_recurring_packages pkg
where pkg.id = slot.package_id
  and pkg.tenant_id = slot.tenant_id;

alter table public.online_recurring_package_slots
  alter column effective_from set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.online_recurring_package_slots'::regclass
      and conname = 'online_recurring_package_slots_effective_window_check'
  ) then
    alter table public.online_recurring_package_slots
      add constraint online_recurring_package_slots_effective_window_check
      check (effective_to is null or effective_to >= effective_from);
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.online_recurring_package_slots'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%tenant_id%package_id%slot_template_id%'
  loop
    execute format(
      'alter table public.online_recurring_package_slots drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

create index if not exists online_recurring_package_slots_effective_idx
  on public.online_recurring_package_slots (
    tenant_id,
    package_id,
    status,
    effective_from,
    effective_to
  );

create or replace function public.set_online_recurring_package_slot_effective_dates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_effective_from date;
begin
  if new.effective_from is null then
    select coalesce(pkg.effective_from, pkg.effective_month)
    into parent_effective_from
    from public.online_recurring_packages pkg
    where pkg.tenant_id = new.tenant_id
      and pkg.id = new.package_id;

    new.effective_from := coalesce(parent_effective_from, current_date);
  end if;

  if new.effective_to is not null and new.effective_to < new.effective_from then
    raise exception 'online_recurring_package_slots effective_to cannot be before effective_from';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_online_recurring_package_slots_effective_dates
  on public.online_recurring_package_slots;

create trigger trg_online_recurring_package_slots_effective_dates
before insert or update of effective_from, effective_to, package_id, tenant_id
on public.online_recurring_package_slots
for each row
execute function public.set_online_recurring_package_slot_effective_dates();

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
as $$
declare
  v_course record;
  v_slot_ids uuid[];
  v_slot_count integer;
  v_required_count integer;
  v_teacher_id uuid;
  v_package_id uuid;
  v_hold_expires_at timestamptz;
  v_lock_slot_id uuid;
  v_effective_month_end date;
begin
  select array_agg(distinct slot_id order by slot_id)
  into v_slot_ids
  from unnest(coalesce(p_slot_template_ids, array[]::uuid[])) as slot_id
  where slot_id is not null;

  v_slot_count := coalesce(array_length(v_slot_ids, 1), 0);
  v_effective_month_end := (date_trunc('month', p_effective_month)::date + interval '1 month - 1 day')::date;

  if p_tenant_id is null or p_student_id is null or p_course_id is null or p_effective_month is null then
    return query select false, 'invalid_request', 'Missing required claim fields.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  if v_slot_count = 0 then
    return query select false, 'invalid_slots', 'At least one slot is required.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':online-package-student:' || p_student_id::text || ':' || p_effective_month::text, 0));

  foreach v_lock_slot_id in array v_slot_ids loop
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':online-package-slot:' || p_effective_month::text || ':' || v_lock_slot_id::text, 0));
  end loop;

  update public.online_recurring_packages
  set status = 'cancelled',
      updated_at = now(),
      updated_by = coalesce(p_actor_user_id, updated_by)
  where tenant_id = p_tenant_id
    and status in ('draft', 'pending_payment')
    and hold_expires_at is not null
    and hold_expires_at <= now();

  select *
  into v_course
  from public.online_courses
  where tenant_id = p_tenant_id
    and id = p_course_id
    and is_active = true;

  if not found then
    return query select false, 'course_not_found', 'Course not found.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  v_required_count := greatest(coalesce(v_course.sessions_per_week, v_slot_count), 1);
  if v_slot_count <> v_required_count then
    return query select false, 'invalid_slot_count', format('This course requires exactly %s weekly slot(s).', v_required_count), null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
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
    return query select false, 'slot_not_found', 'All selected weekly slots must belong to the same active course.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  if (
    select count(distinct template.day_of_week)
    from public.online_slot_templates template
    where template.tenant_id = p_tenant_id
      and template.id = any(v_slot_ids)
  ) <> v_slot_count then
    return query select false, 'invalid_slots', 'A package cannot have more than one slot on the same weekday.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  if exists (
    select 1
    from public.online_recurring_packages pkg
    where pkg.tenant_id = p_tenant_id
      and pkg.student_id = p_student_id
      and pkg.status in ('draft', 'pending_payment', 'active')
      and pkg.effective_month <= p_effective_month
      and (pkg.effective_to is null or pkg.effective_to >= p_effective_month)
  ) then
    return query select false, 'student_package_exists', 'This student already has a package draft or active package for that month.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  with selected_slot_times as (
    select distinct
      template.day_of_week,
      template.start_time
    from public.online_slot_templates template
    where template.tenant_id = p_tenant_id
      and template.id = any(v_slot_ids)
  ),
  teacher_candidates as (
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
       and slot.status = 'active'
       and slot.effective_from <= v_effective_month_end
       and (slot.effective_to is null or slot.effective_to >= p_effective_month)
      where pkg.tenant_id = p_tenant_id
        and pkg.teacher_id = candidate.teacher_id
        and pkg.status in ('draft', 'pending_payment', 'active')
        and pkg.effective_month <= p_effective_month
        and (pkg.effective_to is null or pkg.effective_to >= p_effective_month)
        and exists (
          select 1
          from selected_slot_times selected
          where selected.day_of_week = slot.day_of_week_snapshot
            and selected.start_time = slot.start_time_snapshot
        )
    )
  ),
  teacher_loads as (
    select
      teacher.teacher_id,
      teacher.last_assigned_at,
      count(pkg.id) filter (where pkg.status in ('draft', 'pending_payment', 'active')) as active_load
    from available_teachers teacher
    left join public.online_recurring_packages pkg
      on pkg.tenant_id = p_tenant_id
     and pkg.teacher_id = teacher.teacher_id
     and pkg.status in ('draft', 'pending_payment', 'active')
    group by teacher.teacher_id, teacher.last_assigned_at
  )
  select teacher_id
  into v_teacher_id
  from teacher_loads
  order by active_load asc, last_assigned_at asc nulls first, teacher_id::text asc
  limit 1;

  if v_teacher_id is null then
    return query select false, 'no_teacher_available', 'No teacher is available for the selected package slots.', null::uuid, null::uuid, null::timestamptz, '[]'::jsonb;
    return;
  end if;

  v_hold_expires_at := now() + interval '30 minutes';

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
    'pending_payment',
    coalesce(nullif(p_source, ''), 'self_pick'),
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
    status,
    effective_from,
    effective_to
  )
  select
    p_tenant_id,
    v_package_id,
    template.id,
    template.day_of_week,
    template.start_time,
    template.duration_minutes,
    'active',
    p_effective_month,
    null::date
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
    'claimed',
    'Package held successfully.',
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
      '[]'::jsonb
    );
end;
$$;

revoke all on function public.claim_online_recurring_package_atomic(uuid, uuid, uuid, uuid[], date, text, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_online_recurring_package_atomic(uuid, uuid, uuid, uuid[], date, text, uuid)
  to service_role;
