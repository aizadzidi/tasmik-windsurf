begin;

--------------------------------------------------------------------------------
-- 1) Normalize report fields on write (tenant_id + teacher_id)
--------------------------------------------------------------------------------
create or replace function public.set_report_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);

  if new.teacher_id is null then
    new.teacher_id := auth.uid();
  end if;

  if new.student_id is not null then
    select s.tenant_id into new.tenant_id
    from public.students s
    where s.id = new.student_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_report_defaults on public.reports;
create trigger set_report_defaults
before insert or update of student_id, teacher_id, tenant_id
on public.reports
for each row
execute function public.set_report_defaults();

--------------------------------------------------------------------------------
-- 2) Reset reports RLS (avoid user_profiles dependency for teachers/parents)
--------------------------------------------------------------------------------
alter table public.reports enable row level security;

do $$
declare
  pol record;
begin
  if to_regclass('public.reports') is null then
    raise notice 'reports table not found, skipping';
    return;
  end if;

  for pol in
    select polname from pg_policy where polrelid = 'public.reports'::regclass
  loop
    execute format('drop policy if exists %I on public.reports', pol.polname);
  end loop;
end $$;

-- Ensure report row matches its student's tenant
create policy reports_tenant_guard
on public.reports
as restrictive
for all
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.tenant_id = reports.tenant_id
  )
)
with check (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.tenant_id = reports.tenant_id
  )
);

-- Teacher can manage reports for assigned students
create policy reports_teacher_manage
on public.reports
for all
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.assigned_teacher_id = auth.uid()
  )
);

-- Parent can read reports for their children
create policy reports_parent_read
on public.reports
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = reports.student_id
      and s.parent_id = auth.uid()
  )
);

-- Admin manage within tenant (still tenant-scoped)
create policy reports_admin_manage
on public.reports
for all
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = s.tenant_id
    where s.id = reports.student_id
  )
);

--------------------------------------------------------------------------------
-- 3) Fix classes read (avoid 403 for teachers/parents)
--------------------------------------------------------------------------------
alter table public.classes enable row level security;

do $$
declare
  pol record;
begin
  if to_regclass('public.classes') is null then
    raise notice 'classes table not found, skipping';
    return;
  end if;

  for pol in
    select polname from pg_policy where polrelid = 'public.classes'::regclass
  loop
    execute format('drop policy if exists %I on public.classes', pol.polname);
  end loop;
end $$;

create policy classes_read
on public.classes
for select
to authenticated
using (
  public.is_tenant_member(classes.tenant_id)
  or exists (
    select 1
    from public.students s
    where s.class_id = classes.id
      and (s.assigned_teacher_id = auth.uid() or s.parent_id = auth.uid())
  )
);

create policy classes_admin_manage
on public.classes
for all
to authenticated
using (public.is_school_admin() and public.is_tenant_member(classes.tenant_id))
with check (public.is_school_admin() and public.is_tenant_member(classes.tenant_id));

commit;
