-- Add granular permissions for sub-admin features (assigning teachers to students).
-- Run via Supabase SQL editor or psql as coordinated.

begin;

create table if not exists public.permissions (
  key text primary key,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  user_id uuid not null references auth.users(id),
  permission_key text not null references public.permissions(key),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);

create unique index if not exists user_permissions_unique_idx
  on public.user_permissions (tenant_id, user_id, permission_key);

create index if not exists user_permissions_user_idx
  on public.user_permissions (user_id);

create index if not exists user_permissions_tenant_idx
  on public.user_permissions (tenant_id);

insert into public.permissions (key, description)
values ('student:assign_teacher', 'Can assign teachers to students')
on conflict (key) do nothing;

alter table public.permissions enable row level security;

create policy permissions_read_authenticated
  on public.permissions
  for select
  to authenticated
  using (true);

create policy permissions_manage_admin
  on public.permissions
  for all
  to authenticated
  using (public.is_school_admin())
  with check (public.is_school_admin());

alter table public.user_permissions enable row level security;

create policy tenant_guard_user_permissions
  on public.user_permissions
  as restrictive
  for all
  to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy tenant_admin_manage_user_permissions
  on public.user_permissions
  for all
  to authenticated
  using (public.is_school_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_school_admin() and tenant_id = public.current_tenant_id());

create policy user_read_own_permissions
  on public.user_permissions
  for select
  to authenticated
  using (user_id = auth.uid() and tenant_id = public.current_tenant_id());

grant select on public.permissions to authenticated;

grant select, insert, update, delete on public.user_permissions to authenticated;

create or replace function public.has_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_permissions up
    where up.user_id = p_user
      and up.tenant_id = public.current_tenant_id()
      and up.permission_key = p_permission
  );
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_permission);
$$;

create policy tenant_sub_admin_assign_teacher
  on public.students
  for update
  to authenticated
  using (
    public.has_permission('student:assign_teacher')
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.has_permission('student:assign_teacher')
    and tenant_id = public.current_tenant_id()
  );

create or replace function public.guard_student_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow service-role and SQL editor operations.
  if coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if public.is_school_admin() then
    return new;
  end if;

  if old.assigned_teacher_id = auth.uid() then
    return new;
  end if;

  if public.has_permission('student:assign_teacher') then
    if (to_jsonb(old) - 'assigned_teacher_id') is distinct from
       (to_jsonb(new) - 'assigned_teacher_id') then
      raise exception 'Only assigned_teacher_id can be updated' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update student' using errcode = '42501';
end;
$$;

drop trigger if exists guard_student_assignment_update on public.students;

create trigger guard_student_assignment_update
  before update on public.students
  for each row
  execute function public.guard_student_assignment_update();

commit;
