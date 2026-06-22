-- Track whether a teacher availability row was explicitly configured
-- or created implicitly when a teacher scheduled/rescheduled a student.

alter table public.online_teacher_slot_preferences
  add column if not exists availability_source text not null default 'manual';

update public.online_teacher_slot_preferences
set availability_source = 'manual'
where availability_source is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.online_teacher_slot_preferences'::regclass
      and conname = 'online_teacher_slot_preferences_availability_source_check'
  ) then
    alter table public.online_teacher_slot_preferences
      add constraint online_teacher_slot_preferences_availability_source_check
      check (availability_source in ('manual', 'auto_schedule'));
  end if;
end;
$$;

create index if not exists online_teacher_slot_preferences_source_idx
  on public.online_teacher_slot_preferences (tenant_id, teacher_id, availability_source)
  where is_available = true;

do $$
begin
  drop table if exists pg_temp.online_slot_template_dedupe;

  create temporary table online_slot_template_dedupe
  on commit drop
  as
  with ranked as (
    select
      id,
      tenant_id,
      first_value(id) over (
        partition by tenant_id, course_id, day_of_week, start_time, duration_minutes
        order by is_active desc, created_at asc, id asc
      ) as canonical_id
    from public.online_slot_templates
  )
  select
    tenant_id,
    id as duplicate_id,
    canonical_id
  from ranked
  where id <> canonical_id;

  if exists (select 1 from pg_temp.online_slot_template_dedupe) then
    insert into public.online_teacher_slot_preferences (
      tenant_id,
      slot_template_id,
      teacher_id,
      is_available,
      last_assigned_at,
      availability_source
    )
    select
      pref.tenant_id,
      dedupe.canonical_id,
      pref.teacher_id,
      bool_or(pref.is_available),
      max(pref.last_assigned_at),
      case
        when bool_or(pref.availability_source = 'manual') then 'manual'
        else 'auto_schedule'
      end
    from public.online_teacher_slot_preferences pref
    join pg_temp.online_slot_template_dedupe dedupe
      on dedupe.tenant_id = pref.tenant_id
     and dedupe.duplicate_id = pref.slot_template_id
    group by pref.tenant_id, dedupe.canonical_id, pref.teacher_id
    on conflict (tenant_id, slot_template_id, teacher_id) do update
    set
      is_available = public.online_teacher_slot_preferences.is_available or excluded.is_available,
      last_assigned_at = case
        when public.online_teacher_slot_preferences.last_assigned_at is null then excluded.last_assigned_at
        when excluded.last_assigned_at is null then public.online_teacher_slot_preferences.last_assigned_at
        else greatest(public.online_teacher_slot_preferences.last_assigned_at, excluded.last_assigned_at)
      end,
      availability_source = case
        when public.online_teacher_slot_preferences.availability_source = 'manual'
          or excluded.availability_source = 'manual'
          then 'manual'
        else 'auto_schedule'
      end,
      updated_at = now();

    delete from public.online_teacher_slot_preferences pref
    using pg_temp.online_slot_template_dedupe dedupe
    where pref.tenant_id = dedupe.tenant_id
      and pref.slot_template_id = dedupe.duplicate_id;

    if to_regclass('public.online_slot_claims') is not null then
      drop table if exists pg_temp.online_slot_claim_dedupe;

      create temporary table online_slot_claim_dedupe
      on commit drop
      as
      with affected_templates as (
        select tenant_id, canonical_id, canonical_id as slot_template_id
        from pg_temp.online_slot_template_dedupe
        union
        select tenant_id, canonical_id, duplicate_id as slot_template_id
        from pg_temp.online_slot_template_dedupe
      ),
      ranked_claims as (
        select
          claim.id,
          claim.tenant_id,
          first_value(claim.id) over (
            partition by claim.tenant_id, affected.canonical_id, claim.session_date
            order by
              case claim.status
                when 'active' then 0
                when 'pending_payment' then 1
                else 2
              end,
              case when claim.slot_template_id = affected.canonical_id then 0 else 1 end,
              claim.claimed_at asc,
              claim.created_at asc,
              claim.id asc
          ) as keeper_claim_id
        from public.online_slot_claims claim
        join affected_templates affected
          on affected.tenant_id = claim.tenant_id
         and affected.slot_template_id = claim.slot_template_id
        where claim.status in ('pending_payment', 'active')
      )
      select id, tenant_id
      from ranked_claims
      where id <> keeper_claim_id;

      update public.online_slot_claims claim
      set
        status = 'cancelled',
        seat_hold_expires_at = null,
        released_at = coalesce(claim.released_at, now()),
        updated_at = now()
      from pg_temp.online_slot_claim_dedupe claim_dedupe
      where claim.tenant_id = claim_dedupe.tenant_id
        and claim.id = claim_dedupe.id;

      update public.online_slot_claims claim
      set
        slot_template_id = dedupe.canonical_id,
        updated_at = now()
      from pg_temp.online_slot_template_dedupe dedupe
      where claim.tenant_id = dedupe.tenant_id
        and claim.slot_template_id = dedupe.duplicate_id;
    end if;

    if to_regclass('public.online_recurring_package_slots') is not null then
      update public.online_recurring_package_slots slot
      set
        slot_template_id = dedupe.canonical_id,
        updated_at = now()
      from pg_temp.online_slot_template_dedupe dedupe
      where slot.tenant_id = dedupe.tenant_id
        and slot.slot_template_id = dedupe.duplicate_id;
    end if;

    if to_regclass('public.online_recurring_occurrences') is not null then
      update public.online_recurring_occurrences occurrence
      set
        slot_template_id = dedupe.canonical_id,
        updated_at = now()
      from pg_temp.online_slot_template_dedupe dedupe
      where occurrence.tenant_id = dedupe.tenant_id
        and occurrence.slot_template_id = dedupe.duplicate_id;
    end if;

    delete from public.online_slot_templates template
    using pg_temp.online_slot_template_dedupe dedupe
    where template.tenant_id = dedupe.tenant_id
      and template.id = dedupe.duplicate_id;
  end if;
end;
$$;

create unique index if not exists online_slot_templates_tenant_course_day_time_duration_uidx
  on public.online_slot_templates (
    tenant_id,
    course_id,
    day_of_week,
    start_time,
    duration_minutes
  );
