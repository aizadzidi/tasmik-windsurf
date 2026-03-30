alter table public.online_recurring_packages
  add column if not exists student_package_assignment_id uuid;

create table if not exists public.online_student_package_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  status text not null check (
    status in ('draft', 'pending_payment', 'active', 'paused', 'cancelled')
  ) default 'draft',
  effective_from date not null,
  effective_to date,
  sessions_per_week_snapshot integer not null check (sessions_per_week_snapshot > 0),
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  monthly_fee_cents_snapshot integer not null default 0,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_student_package_assignments_tenant_student_idx
  on public.online_student_package_assignments (tenant_id, student_id, effective_from desc);
create index if not exists online_student_package_assignments_tenant_teacher_idx
  on public.online_student_package_assignments (tenant_id, teacher_id, effective_from desc);
create index if not exists online_student_package_assignments_tenant_course_idx
  on public.online_student_package_assignments (tenant_id, course_id, effective_from desc);
create unique index if not exists online_student_package_assignments_active_course_unique
  on public.online_student_package_assignments (tenant_id, student_id, course_id)
  where status in ('pending_payment', 'active', 'paused');
create index if not exists online_recurring_packages_assignment_idx
  on public.online_recurring_packages (tenant_id, student_package_assignment_id)
  where student_package_assignment_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.online_recurring_packages'::regclass
      and conname = 'online_recurring_packages_student_package_assignment_id_fkey'
  ) then
    alter table public.online_recurring_packages
      add constraint online_recurring_packages_student_package_assignment_id_fkey
      foreign key (student_package_assignment_id)
      references public.online_student_package_assignments(id)
      on delete set null;
  end if;
end;
$$;

with ranked_packages as (
  select
    pkg.tenant_id,
    pkg.student_id,
    pkg.course_id,
    pkg.teacher_id,
    case
      when pkg.status in ('draft', 'pending_payment', 'active', 'paused') then pkg.status
      else 'draft'
    end as assignment_status,
    coalesce(pkg.effective_from, pkg.effective_month) as effective_from,
    pkg.effective_to,
    greatest(coalesce(pkg.sessions_per_week, 1), 1) as sessions_per_week_snapshot,
    greatest(co.default_slot_duration_minutes, 30) as duration_minutes_snapshot,
    coalesce(pkg.monthly_fee_cents_snapshot, 0) as monthly_fee_cents_snapshot,
    pkg.notes,
    pkg.created_by,
    pkg.updated_by,
    pkg.created_at,
    pkg.updated_at,
    row_number() over (
      partition by pkg.tenant_id, pkg.student_id, pkg.course_id
      order by
        case pkg.status
          when 'active' then 1
          when 'pending_payment' then 2
          when 'paused' then 3
          when 'draft' then 4
          when 'legacy_review_required' then 5
          else 99
        end,
        coalesce(pkg.effective_from, pkg.effective_month) desc,
        pkg.created_at desc
    ) as rn
  from public.online_recurring_packages pkg
  join public.online_courses co on co.id = pkg.course_id
  where pkg.status in ('draft', 'pending_payment', 'active', 'paused', 'legacy_review_required')
), inserted_assignments as (
  insert into public.online_student_package_assignments (
    tenant_id,
    student_id,
    course_id,
    teacher_id,
    status,
    effective_from,
    effective_to,
    sessions_per_week_snapshot,
    duration_minutes_snapshot,
    monthly_fee_cents_snapshot,
    notes,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  select
    ranked.tenant_id,
    ranked.student_id,
    ranked.course_id,
    ranked.teacher_id,
    ranked.assignment_status,
    ranked.effective_from,
    ranked.effective_to,
    ranked.sessions_per_week_snapshot,
    ranked.duration_minutes_snapshot,
    ranked.monthly_fee_cents_snapshot,
    ranked.notes,
    ranked.created_by,
    ranked.updated_by,
    ranked.created_at,
    ranked.updated_at
  from ranked_packages ranked
  where ranked.rn = 1
    and not exists (
      select 1
      from public.online_student_package_assignments existing
      where existing.tenant_id = ranked.tenant_id
        and existing.student_id = ranked.student_id
        and existing.course_id = ranked.course_id
        and existing.status in ('draft', 'pending_payment', 'active', 'paused')
    )
  returning id, tenant_id, student_id, course_id
)
update public.online_recurring_packages pkg
set student_package_assignment_id = assignment.id
from public.online_student_package_assignments assignment
where pkg.student_package_assignment_id is null
  and pkg.tenant_id = assignment.tenant_id
  and pkg.student_id = assignment.student_id
  and pkg.course_id = assignment.course_id
  and pkg.status in ('draft', 'pending_payment', 'active', 'paused', 'legacy_review_required');

alter table public.online_student_package_assignments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_package_assignments'
      and policyname = 'tenant_guard_online_student_package_assignments'
  ) then
    create policy tenant_guard_online_student_package_assignments
      on public.online_student_package_assignments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_student_package_assignments.tenant_id
      ))
      with check (exists (
        select 1
        from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = online_student_package_assignments.tenant_id
      ));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_package_assignments'
      and policyname = 'online_student_package_assignments_parent_read'
  ) then
    create policy online_student_package_assignments_parent_read
      on public.online_student_package_assignments
      for select
      to authenticated
      using (public.is_parent_for_student(online_student_package_assignments.student_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_package_assignments'
      and policyname = 'online_student_package_assignments_teacher_read'
  ) then
    create policy online_student_package_assignments_teacher_read
      on public.online_student_package_assignments
      for select
      to authenticated
      using (online_student_package_assignments.teacher_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'online_student_package_assignments'
      and policyname = 'online_student_package_assignments_admin_manage'
  ) then
    create policy online_student_package_assignments_admin_manage
      on public.online_student_package_assignments
      for all
      to authenticated
      using (public.is_admin_for_student(online_student_package_assignments.student_id))
      with check (public.is_admin_for_student(online_student_package_assignments.student_id));
  end if;
end;
$$;
