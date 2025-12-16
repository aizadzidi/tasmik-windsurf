-- Migration: fix get_grade_summary signature and logic for optional class filter
-- Applies new signature (exam_id, student_id, class_id nullable) and aggregates grades safely.

-- Drop the legacy signature that used p_exam_id/p_class_id/p_student_id param names
drop function if exists public.get_grade_summary(uuid, uuid, uuid);

create or replace function public.get_grade_summary(
  exam_id uuid,
  student_id uuid,
  class_id uuid default null
)
returns table(
  grade text,
  cnt integer
)
language sql
security definer
stable
as $$
with allowed as (
  -- Subjects allowed for the exam and optionally the given class.
  select distinct ecs.subject_id
  from public.exam_class_subjects ecs
  where ecs.exam_id = get_grade_summary.exam_id
    and (get_grade_summary.class_id is null or ecs.class_id = get_grade_summary.class_id)
  union
  select distinct es.subject_id
  from public.exam_subjects es
  where es.exam_id = get_grade_summary.exam_id
),
allowed_exists as (
  select exists (select 1 from allowed) as has_allowed
),
taken as (
  select
    er.subject_id,
    upper(er.grade) as grade
  from public.exam_results er
  where er.exam_id = get_grade_summary.exam_id
    and er.student_id = get_grade_summary.student_id
    and er.grade is not null
)
select
  t.grade,
  count(*)::int as cnt
from taken t
where (select has_allowed from allowed_exists) = false
   or t.subject_id in (select subject_id from allowed)
group by t.grade
order by t.grade;
$$;
