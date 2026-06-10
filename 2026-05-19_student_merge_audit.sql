-- Student merge audit and archival metadata.
-- Run in Supabase SQL editor or psql before relying on full merge audit fields.

begin;

alter table public.students
  add column if not exists merged_into_student_id uuid references public.students(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references public.users(id) on delete set null;

create index if not exists students_merged_into_idx
  on public.students (tenant_id, merged_into_student_id)
  where merged_into_student_id is not null;

create table if not exists public.student_merge_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  canonical_student_id uuid not null references public.students(id) on delete restrict,
  duplicate_student_id uuid not null references public.students(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  reason text not null default 'admin_duplicate_merge',
  canonical_snapshot jsonb not null default '{}'::jsonb,
  duplicate_snapshot jsonb not null default '{}'::jsonb,
  reference_updates jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_merge_audit_tenant_created_idx
  on public.student_merge_audit (tenant_id, created_at desc);

create index if not exists student_merge_audit_canonical_idx
  on public.student_merge_audit (tenant_id, canonical_student_id);

create index if not exists student_merge_audit_duplicate_idx
  on public.student_merge_audit (tenant_id, duplicate_student_id);

alter table public.student_merge_audit enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'student_merge_audit'
      and policyname = 'tenant_guard_student_merge_audit'
  ) then
    create policy tenant_guard_student_merge_audit
      on public.student_merge_audit
      as restrictive
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = student_merge_audit.tenant_id
        )
      )
      with check (
        exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = student_merge_audit.tenant_id
        )
      );
  end if;
end;
$$;

create or replace function public.merge_student_duplicate(
  p_tenant_id uuid,
  p_canonical_student_id uuid,
  p_duplicate_student_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical public.students%rowtype;
  duplicate public.students%rowtype;
  duplicate_enrollment record;
  canonical_enrollment_id uuid;
  conflict_spec record;
  ref_spec record;
  key_column text;
  join_sql text;
  tenant_sql text;
  status_sql text;
  update_sql text;
  set_sql text;
  has_conflict boolean;
  affected_rows integer;
  enrollment_rows integer := 0;
  reference_updates jsonb := '[]'::jsonb;
  moved_portal_user_id uuid := null;
  merged_at_ts timestamptz := now();
begin
  if p_canonical_student_id = p_duplicate_student_id then
    raise exception 'Cannot merge a student into itself.';
  end if;

  select *
    into canonical
  from public.students
  where tenant_id = p_tenant_id
    and id = p_canonical_student_id
  for update;

  select *
    into duplicate
  from public.students
  where tenant_id = p_tenant_id
    and id = p_duplicate_student_id
  for update;

  if canonical.id is null or duplicate.id is null then
    raise exception 'Student record was not found.';
  end if;

  if canonical.record_type = 'prospect' or canonical.crm_stage = 'discontinued' then
    raise exception 'Canonical record cannot be archived or discontinued.';
  end if;

  if canonical.account_owner_user_id is not null and duplicate.account_owner_user_id is not null then
    raise exception 'Both records already have portal accounts. Resolve manually.';
  end if;

  for conflict_spec in
    select *
    from (
      values
        ('exam_results', 'student_id', array['exam_id', 'subject_id'], null, null::text[]),
        ('exam_roster', 'student_id', array['exam_id'], 'tenant_id', null::text[]),
        ('exam_excluded_students', 'student_id', array['exam_id'], 'tenant_id', null::text[]),
        ('subject_opt_outs', 'student_id', array['exam_id', 'subject_id'], null, null::text[]),
        ('campus_session_roster_snapshots', 'student_id', array['session_instance_id'], 'tenant_id', null::text[]),
        ('campus_attendance_marks', 'student_id', array['session_instance_id'], 'tenant_id', null::text[]),
        (
          'online_student_package_assignments',
          'student_id',
          array['course_id'],
          'tenant_id',
          array['draft', 'pending_payment', 'active', 'paused']
        ),
        ('online_family_claim_token_students', 'student_id', array['family_claim_token_id'], 'tenant_id', null::text[]),
        ('child_fee_assignments', 'child_id', array['fee_id'], null, null::text[])
    ) as specs(table_name, ref_column, key_columns, tenant_column, status_values)
  loop
    if to_regclass(format('public.%I', conflict_spec.table_name)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = conflict_spec.table_name
        and column_name = conflict_spec.ref_column
    ) then
      continue;
    end if;

    if conflict_spec.tenant_column is not null and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = conflict_spec.table_name
        and column_name = conflict_spec.tenant_column
    ) then
      continue;
    end if;

    join_sql := '';
    foreach key_column in array conflict_spec.key_columns loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = conflict_spec.table_name
          and column_name = key_column
      ) then
        join_sql := null;
        exit;
      end if;

      join_sql := concat_ws(
        ' and ',
        nullif(join_sql, ''),
        format('c.%1$I is not distinct from d.%1$I', key_column)
      );
    end loop;

    if join_sql is null or join_sql = '' then
      continue;
    end if;

    tenant_sql := case
      when conflict_spec.tenant_column is null then ''
      else format(' and c.%1$I = $3 and d.%1$I = $3', conflict_spec.tenant_column)
    end;
    status_sql := case
      when conflict_spec.status_values is null then ''
      else ' and c.status = any($4) and d.status = any($4)'
    end;

    execute format(
      'select exists (
        select 1
        from public.%1$I c
        join public.%1$I d on %2$s
        where c.%3$I = $1
          and d.%3$I = $2
          %4$s
          %5$s
      )',
      conflict_spec.table_name,
      join_sql,
      conflict_spec.ref_column,
      tenant_sql,
      status_sql
    )
    using p_canonical_student_id, p_duplicate_student_id, p_tenant_id, conflict_spec.status_values
    into has_conflict;

    if has_conflict then
      raise exception 'Merge conflict in %. Resolve overlapping records manually.', conflict_spec.table_name
        using errcode = '23505';
    end if;
  end loop;

  if canonical.account_owner_user_id is null and duplicate.account_owner_user_id is not null then
    moved_portal_user_id := duplicate.account_owner_user_id;

    update public.students
    set account_owner_user_id = duplicate.account_owner_user_id,
        parent_contact_number = coalesce(
          nullif(canonical.parent_contact_number, ''),
          nullif(duplicate.parent_contact_number, '')
        )
    where tenant_id = p_tenant_id
      and id = canonical.id;
  end if;

  for duplicate_enrollment in
    select id, program_id, metadata
    from public.enrollments
    where tenant_id = p_tenant_id
      and student_id = duplicate.id
    for update
  loop
    select id
      into canonical_enrollment_id
    from public.enrollments
    where tenant_id = p_tenant_id
      and student_id = canonical.id
      and program_id = duplicate_enrollment.program_id
    limit 1;

    if canonical_enrollment_id is not null then
      update public.enrollments
      set status = 'cancelled',
          metadata = coalesce(duplicate_enrollment.metadata, '{}'::jsonb) ||
            jsonb_build_object(
              'source', 'duplicate_merge',
              'merged_into_student_id', canonical.id,
              'merged_duplicate_student_id', duplicate.id,
              'merged_by', p_actor_user_id,
              'merged_at', merged_at_ts,
              'status_reason', 'Merged into ' || canonical.id,
              'canonical_enrollment_id', canonical_enrollment_id
            )
      where tenant_id = p_tenant_id
        and id = duplicate_enrollment.id;
    else
      update public.enrollments
      set student_id = canonical.id,
          metadata = coalesce(duplicate_enrollment.metadata, '{}'::jsonb) ||
            jsonb_build_object(
              'source', 'duplicate_merge',
              'merged_into_student_id', canonical.id,
              'merged_duplicate_student_id', duplicate.id,
              'merged_by', p_actor_user_id,
              'merged_at', merged_at_ts
            )
      where tenant_id = p_tenant_id
        and id = duplicate_enrollment.id;
    end if;

    enrollment_rows := enrollment_rows + 1;
    canonical_enrollment_id := null;
  end loop;

  reference_updates := reference_updates || jsonb_build_array(
    jsonb_build_object('table', 'enrollments', 'column', 'student_id', 'rows', enrollment_rows)
  );

  for ref_spec in
    select *
    from (
      values
        ('reports', 'student_id', 'tenant_id', null),
        ('juz_tests', 'student_id', 'tenant_id', null),
        ('test_sessions', 'student_id', null, null),
        ('attendance_records', 'student_id', 'tenant_id', null),
        ('exam_results', 'student_id', null, null),
        ('exam_roster', 'student_id', 'tenant_id', null),
        ('exam_excluded_students', 'student_id', 'tenant_id', null),
        ('subject_opt_outs', 'student_id', null, null),
        ('campus_session_roster_snapshots', 'student_id', 'tenant_id', null),
        ('campus_attendance_marks', 'student_id', 'tenant_id', null),
        ('student_program_migration_staging', 'student_id', 'tenant_id', null),
        ('online_student_package_assignments', 'student_id', 'tenant_id', 'updated_by'),
        ('online_recurring_packages', 'student_id', 'tenant_id', 'updated_by'),
        ('online_recurring_occurrences', 'student_id', 'tenant_id', null),
        ('online_package_change_requests', 'student_id', 'tenant_id', null),
        ('online_slot_claims', 'student_id', 'tenant_id', null),
        ('online_student_claim_tokens', 'student_id', 'tenant_id', null),
        ('online_family_claim_token_students', 'student_id', 'tenant_id', null),
        ('child_fee_assignments', 'child_id', null, null),
        ('payment_line_items', 'child_id', null, null),
        ('parent_balance_adjustments', 'child_id', null, null)
    ) as specs(table_name, ref_column, tenant_column, actor_column)
  loop
    if to_regclass(format('public.%I', ref_spec.table_name)) is null then
      reference_updates := reference_updates || jsonb_build_array(
        jsonb_build_object('table', ref_spec.table_name, 'column', ref_spec.ref_column, 'rows', 0, 'skipped', true)
      );
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ref_spec.table_name
        and column_name = ref_spec.ref_column
    ) then
      reference_updates := reference_updates || jsonb_build_array(
        jsonb_build_object('table', ref_spec.table_name, 'column', ref_spec.ref_column, 'rows', 0, 'skipped', true)
      );
      continue;
    end if;

    if ref_spec.tenant_column is not null and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ref_spec.table_name
        and column_name = ref_spec.tenant_column
    ) then
      reference_updates := reference_updates || jsonb_build_array(
        jsonb_build_object('table', ref_spec.table_name, 'column', ref_spec.ref_column, 'rows', 0, 'skipped', true)
      );
      continue;
    end if;

    set_sql := format('%I = $1', ref_spec.ref_column);
    if ref_spec.actor_column is not null and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ref_spec.table_name
        and column_name = ref_spec.actor_column
    ) then
      set_sql := set_sql || format(', %I = $2', ref_spec.actor_column);
    end if;

    if ref_spec.tenant_column is null then
      update_sql := format(
        'update public.%1$I set %2$s where %3$I = $3',
        ref_spec.table_name,
        set_sql,
        ref_spec.ref_column
      );
      execute update_sql using canonical.id, p_actor_user_id, duplicate.id;
    else
      update_sql := format(
        'update public.%1$I set %2$s where %3$I = $3 and %4$I = $4',
        ref_spec.table_name,
        set_sql,
        ref_spec.ref_column,
        ref_spec.tenant_column
      );
      execute update_sql using canonical.id, p_actor_user_id, duplicate.id, p_tenant_id;
    end if;

    get diagnostics affected_rows = row_count;
    reference_updates := reference_updates || jsonb_build_array(
      jsonb_build_object('table', ref_spec.table_name, 'column', ref_spec.ref_column, 'rows', affected_rows)
    );
  end loop;

  update public.students
  set record_type = 'prospect',
      crm_stage = 'discontinued',
      crm_status_reason = 'Merged into ' || coalesce(canonical.name, canonical.id::text),
      account_owner_user_id = null,
      merged_into_student_id = canonical.id,
      merged_at = merged_at_ts,
      merged_by = p_actor_user_id
  where tenant_id = p_tenant_id
    and id = duplicate.id;

  insert into public.student_merge_audit (
    tenant_id,
    canonical_student_id,
    duplicate_student_id,
    actor_user_id,
    reason,
    canonical_snapshot,
    duplicate_snapshot,
    reference_updates,
    metadata
  )
  values (
    p_tenant_id,
    canonical.id,
    duplicate.id,
    p_actor_user_id,
    'admin_duplicate_merge',
    to_jsonb(canonical),
    to_jsonb(duplicate),
    reference_updates,
    jsonb_build_object('moved_portal_user_id', moved_portal_user_id)
  );

  return jsonb_build_object(
    'canonical_student_id', canonical.id,
    'archived_student_id', duplicate.id,
    'moved_portal_user_id', moved_portal_user_id,
    'reference_updates', reference_updates
  );
end;
$$;

revoke all on function public.merge_student_duplicate(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.merge_student_duplicate(uuid, uuid, uuid, uuid)
  to service_role;

commit;
