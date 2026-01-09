begin;

-- Store subject teacher assignment per class/subject/year.
alter table public.lesson_class_subject_year
  add column if not exists subject_teacher_id uuid references public.users(id) on delete set null;

create index if not exists idx_lcsy_subject_teacher_id
  on public.lesson_class_subject_year (subject_teacher_id);

-- Deduplicate shared progress rows before applying new uniqueness.
with ranked as (
  select id,
    row_number() over (
      partition by topic_id, subtopic_index, academic_year
      order by taught_on desc nulls last, id desc
    ) as rn
  from public.lesson_subtopic_progress
)
delete from public.lesson_subtopic_progress lsp
using ranked r
where lsp.id = r.id
  and r.rn > 1;

alter table public.lesson_subtopic_progress
  drop constraint if exists lesson_subtopic_progress_unique_per_teacher_year;

alter table public.lesson_subtopic_progress
  add constraint lesson_subtopic_progress_unique_per_year
  unique (topic_id, subtopic_index, academic_year);

create index if not exists idx_lesson_subtopic_progress_topic_year
  on public.lesson_subtopic_progress (topic_id, academic_year);

create or replace function public.is_subject_teacher_for_topic_year(p_topic_id uuid, p_academic_year integer)
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
    join public.lesson_class_subject_year lcsy
      on lcsy.class_id = lt.class_id
     and lcsy.subject_id = lt.subject_id
     and lcsy.academic_year = p_academic_year
    where lt.id = p_topic_id
      and lcsy.subject_teacher_id = auth.uid()
  ) into ok;
  return ok;
end;
$$;

drop policy if exists lesson_subtopic_progress_teacher_manage on public.lesson_subtopic_progress;

create policy lesson_subtopic_progress_teacher_manage
on public.lesson_subtopic_progress
for all
to authenticated
using (public.is_subject_teacher_for_topic_year(lesson_subtopic_progress.topic_id, lesson_subtopic_progress.academic_year))
with check (public.is_subject_teacher_for_topic_year(lesson_subtopic_progress.topic_id, lesson_subtopic_progress.academic_year));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_subtopic_progress'
      and policyname = 'lesson_subtopic_progress_teacher_read_all'
  ) then
    create policy lesson_subtopic_progress_teacher_read_all
      on public.lesson_subtopic_progress
      for select
      to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'teacher'
            and up.tenant_id = lesson_subtopic_progress.tenant_id
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_class_subject_year'
      and policyname = 'lesson_class_subject_year_teacher_read_all'
  ) then
    create policy lesson_class_subject_year_teacher_read_all
      on public.lesson_class_subject_year
      for select
      to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'teacher'
            and up.tenant_id = lesson_class_subject_year.tenant_id
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_topics'
      and policyname = 'lesson_topics_teacher_read_all'
  ) then
    create policy lesson_topics_teacher_read_all
      on public.lesson_topics
      for select
      to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'teacher'
            and up.tenant_id = lesson_topics.tenant_id
        )
      );
  end if;
end $$;

commit;
