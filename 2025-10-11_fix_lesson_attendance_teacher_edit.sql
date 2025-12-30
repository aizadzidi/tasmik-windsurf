begin;

--------------------------------------------------------------------------------
-- 1) Helper functions (RLS-safe, definer)
--------------------------------------------------------------------------------
create or replace function public.is_teacher_for_class(p_class_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    where s.class_id = p_class_id
      and s.assigned_teacher_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_parent_for_class(p_class_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.students s
    where s.class_id = p_class_id
      and s.parent_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_admin_for_class(p_class_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.classes c
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = c.tenant_id
    where c.id = p_class_id
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_teacher_for_topic(p_topic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.lesson_topics lt
    join public.students s on s.class_id = lt.class_id
    where lt.id = p_topic_id
      and s.assigned_teacher_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_parent_for_topic(p_topic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.lesson_topics lt
    join public.students s on s.class_id = lt.class_id
    where lt.id = p_topic_id
      and s.parent_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

create or replace function public.is_admin_for_topic(p_topic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  ok boolean;
begin
  perform set_config('row_security', 'off', true);
  select exists (
    select 1
    from public.lesson_topics lt
    join public.classes c on c.id = lt.class_id
    join public.user_profiles up
      on up.user_id = auth.uid()
     and up.role = 'school_admin'
     and up.tenant_id = c.tenant_id
    where lt.id = p_topic_id
  ) into ok;
  return ok;
end;
$$;

--------------------------------------------------------------------------------
-- 2) Normalize tenant_id / creator fields on write
--------------------------------------------------------------------------------
create or replace function public.set_attendance_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);
  if new.recorded_by is null then
    new.recorded_by := auth.uid();
  end if;
  if new.student_id is not null then
    select s.tenant_id into new.tenant_id
    from public.students s
    where s.id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_attendance_defaults on public.attendance_records;
create trigger set_attendance_defaults
before insert or update of student_id, tenant_id, recorded_by
on public.attendance_records
for each row
execute function public.set_attendance_defaults();

create or replace function public.set_lesson_topic_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.class_id is not null then
    select c.tenant_id into new.tenant_id
    from public.classes c
    where c.id = new.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_lesson_topic_defaults on public.lesson_topics;
create trigger set_lesson_topic_defaults
before insert or update of class_id, tenant_id, created_by
on public.lesson_topics
for each row
execute function public.set_lesson_topic_defaults();

create or replace function public.set_lesson_class_subject_year_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.class_id is not null then
    select c.tenant_id into new.tenant_id
    from public.classes c
    where c.id = new.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_lesson_class_subject_year_defaults on public.lesson_class_subject_year;
create trigger set_lesson_class_subject_year_defaults
before insert or update of class_id, tenant_id, created_by
on public.lesson_class_subject_year
for each row
execute function public.set_lesson_class_subject_year_defaults();

create or replace function public.set_lesson_subtopic_progress_defaults()
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
  if new.topic_id is not null then
    select c.tenant_id into new.tenant_id
    from public.lesson_topics lt
    join public.classes c on c.id = lt.class_id
    where lt.id = new.topic_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_lesson_subtopic_progress_defaults on public.lesson_subtopic_progress;
create trigger set_lesson_subtopic_progress_defaults
before insert or update of topic_id, tenant_id, teacher_id
on public.lesson_subtopic_progress
for each row
execute function public.set_lesson_subtopic_progress_defaults();

--------------------------------------------------------------------------------
-- 3) Backfill tenant_id for existing rows
--------------------------------------------------------------------------------
update public.attendance_records ar
set tenant_id = s.tenant_id
from public.students s
where ar.tenant_id is null
  and ar.student_id = s.id;

update public.lesson_topics lt
set tenant_id = c.tenant_id
from public.classes c
where lt.tenant_id is null
  and lt.class_id = c.id;

update public.lesson_class_subject_year lcsy
set tenant_id = c.tenant_id
from public.classes c
where lcsy.tenant_id is null
  and lcsy.class_id = c.id;

update public.lesson_subtopic_progress lsp
set tenant_id = c.tenant_id
from public.lesson_topics lt
join public.classes c on c.id = lt.class_id
where lsp.tenant_id is null
  and lsp.topic_id = lt.id;

--------------------------------------------------------------------------------
-- 4) Reset RLS policies (remove conflicting public + restrictive guards)
--------------------------------------------------------------------------------
do $$
declare
  pol record;
  rel regclass;
begin
  foreach rel in ARRAY ARRAY[
    'public.attendance_records'::regclass,
    'public.lesson_topics'::regclass,
    'public.lesson_subtopic_progress'::regclass,
    'public.lesson_class_subject_year'::regclass
  ]
  loop
    for pol in
      select polname from pg_policy where polrelid = rel
    loop
      execute format('drop policy if exists %I on %s', pol.polname, rel::text);
    end loop;
  end loop;
end $$;

alter table public.attendance_records enable row level security;
alter table public.lesson_topics enable row level security;
alter table public.lesson_subtopic_progress enable row level security;
alter table public.lesson_class_subject_year enable row level security;

-- Attendance records
create policy attendance_teacher_manage
on public.attendance_records
for all
to authenticated
using (
  public.is_assigned_teacher_for_student(attendance_records.student_id)
  or public.is_teacher_for_class(attendance_records.class_id)
)
with check (
  public.is_assigned_teacher_for_student(attendance_records.student_id)
  or public.is_teacher_for_class(attendance_records.class_id)
);

create policy attendance_parent_read
on public.attendance_records
for select
to authenticated
using (public.is_parent_for_student(attendance_records.student_id));

create policy attendance_admin_manage
on public.attendance_records
for all
to authenticated
using (public.is_admin_for_student(attendance_records.student_id))
with check (public.is_admin_for_student(attendance_records.student_id));

-- Lesson topics
create policy lesson_topics_teacher_manage
on public.lesson_topics
for all
to authenticated
using (public.is_teacher_for_class(lesson_topics.class_id))
with check (public.is_teacher_for_class(lesson_topics.class_id));

create policy lesson_topics_parent_read
on public.lesson_topics
for select
to authenticated
using (public.is_parent_for_class(lesson_topics.class_id));

create policy lesson_topics_admin_manage
on public.lesson_topics
for all
to authenticated
using (public.is_admin_for_class(lesson_topics.class_id))
with check (public.is_admin_for_class(lesson_topics.class_id));

-- Lesson class/subject/year
create policy lesson_class_subject_year_teacher_manage
on public.lesson_class_subject_year
for all
to authenticated
using (public.is_teacher_for_class(lesson_class_subject_year.class_id))
with check (public.is_teacher_for_class(lesson_class_subject_year.class_id));

create policy lesson_class_subject_year_admin_manage
on public.lesson_class_subject_year
for all
to authenticated
using (public.is_admin_for_class(lesson_class_subject_year.class_id))
with check (public.is_admin_for_class(lesson_class_subject_year.class_id));

-- Lesson subtopic progress
create policy lesson_subtopic_progress_teacher_manage
on public.lesson_subtopic_progress
for all
to authenticated
using (public.is_teacher_for_topic(lesson_subtopic_progress.topic_id))
with check (public.is_teacher_for_topic(lesson_subtopic_progress.topic_id));

create policy lesson_subtopic_progress_parent_read
on public.lesson_subtopic_progress
for select
to authenticated
using (public.is_parent_for_topic(lesson_subtopic_progress.topic_id));

create policy lesson_subtopic_progress_admin_manage
on public.lesson_subtopic_progress
for all
to authenticated
using (public.is_admin_for_topic(lesson_subtopic_progress.topic_id))
with check (public.is_admin_for_topic(lesson_subtopic_progress.topic_id));

commit;
