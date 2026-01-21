-- Adds exam_roster snapshot table for historical exam rosters.

begin;

create table if not exists public.exam_roster (
  exam_id uuid not null,
  student_id uuid not null,
  class_id uuid,
  snapshot_at timestamptz not null default now(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id),
  primary key (exam_id, student_id)
);

create index if not exists exam_roster_tenant_id_idx
  on public.exam_roster (tenant_id);

create index if not exists exam_roster_exam_class_idx
  on public.exam_roster (exam_id, class_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exam_roster_exam_tenant_fkey') then
    alter table public.exam_roster
      add constraint exam_roster_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_roster_student_tenant_fkey') then
    alter table public.exam_roster
      add constraint exam_roster_student_tenant_fkey
      foreign key (student_id, tenant_id)
      references public.students (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_roster_class_tenant_fkey') then
    alter table public.exam_roster
      add constraint exam_roster_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
end;
$$;

alter table public.exam_roster enable row level security;

grant select, insert, update, delete on public.exam_roster to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_roster'
      and policyname = 'tenant_guard_exam_roster'
  ) then
    create policy tenant_guard_exam_roster
      on public.exam_roster
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_roster.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_roster.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_roster'
      and policyname = 'tenant_admin_manage_exam_roster'
  ) then
    create policy tenant_admin_manage_exam_roster
      on public.exam_roster
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = exam_roster.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = exam_roster.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_roster'
      and policyname = 'tenant_member_read_exam_roster'
  ) then
    create policy tenant_member_read_exam_roster
      on public.exam_roster
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = exam_roster.tenant_id
      ));
  end if;
end;
$$;

alter table public.exam_roster force row level security;

commit;
