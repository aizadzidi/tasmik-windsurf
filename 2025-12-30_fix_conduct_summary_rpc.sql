begin;

-- Align with other exam RPCs by running with definer rights and explicit access checks.
create or replace function public.get_conduct_summary(p_exam_id uuid, p_student_id uuid)
returns table(
  source text,
  discipline numeric,
  effort numeric,
  participation numeric,
  motivational_level numeric,
  character_score numeric,
  leadership numeric,
  subjects_count integer,
  override_id uuid
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform set_config('row_security', 'off', true);

  if not (
    public.is_parent_for_student(p_student_id)
    or public.is_assigned_teacher_for_student(p_student_id)
    or public.is_admin_for_student(p_student_id)
  ) then
    return;
  end if;

  return query
  with override_row as (
    select *
    from public.conduct_scores
    where exam_id = p_exam_id
      and student_id = p_student_id
      and subject_id is null
    order by updated_at desc
    limit 1
  ),
  per_subject as (
    select
      avg(cs.discipline::numeric)         as discipline,
      avg(cs.effort::numeric)             as effort,
      avg(cs.participation::numeric)      as participation,
      avg(cs.motivational_level::numeric) as motivational_level,
      avg(cs.character_score::numeric)    as character_score,
      avg(cs.leadership::numeric)         as leadership,
      count(*)::int                       as subjects_count
    from public.conduct_scores cs
    where cs.exam_id = p_exam_id
      and cs.student_id = p_student_id
      and cs.subject_id is not null
  )
  select
    case when exists (select 1 from override_row) then 'override' else 'average' end as source,
    coalesce( (select o.discipline         from override_row o)::numeric,
              (select p.discipline         from per_subject p)),
    coalesce( (select o.effort             from override_row o)::numeric,
              (select p.effort             from per_subject p)),
    coalesce( (select o.participation      from override_row o)::numeric,
              (select p.participation      from per_subject p)),
    coalesce( (select o.motivational_level from override_row o)::numeric,
              (select p.motivational_level from per_subject p)),
    coalesce( (select o.character_score    from override_row o)::numeric,
              (select p.character_score    from per_subject p)),
    coalesce( (select o.leadership         from override_row o)::numeric,
              (select p.leadership         from per_subject p)),
    coalesce( (select p.subjects_count     from per_subject p), 0),
    (select o.id from override_row o);
end;
$$;

grant execute on function public.get_conduct_summary(uuid, uuid) to public;

commit;
