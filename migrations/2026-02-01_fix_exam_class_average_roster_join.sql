begin;

create or replace function public.get_subject_class_averages(
  exam_id uuid,
  class_id uuid default null,
  allowed_subject_ids uuid[] default null
)
returns table(
  subject_id uuid,
  avg_mark numeric,
  n_marks integer
)
language sql
security definer
stable
as $$
  select
    er.subject_id,
    avg(er.mark)::numeric as avg_mark,
    count(er.mark)::int   as n_marks
  from public.exam_results er
  join public.students s on s.id = er.student_id
  left join public.exam_roster r
    on r.exam_id = er.exam_id
   and r.student_id = er.student_id
  where er.exam_id = get_subject_class_averages.exam_id
    and er.mark is not null
    and (get_subject_class_averages.class_id is null
         or coalesce(r.class_id, s.class_id) = get_subject_class_averages.class_id)
    and (allowed_subject_ids is null or er.subject_id = any(allowed_subject_ids))
  group by er.subject_id
  order by er.subject_id;
$$;

create or replace function public.get_class_average_weighted(
  exam_id uuid,
  w_conduct numeric,
  class_id uuid default null,
  allowed_subject_ids uuid[] default null
)
returns numeric
language sql
security definer
stable
as $$
  with per_student_academic as (
    select er.student_id,
           avg(er.mark)::numeric as academic_avg
    from public.exam_results er
    join public.students s on s.id = er.student_id
    left join public.exam_roster r
      on r.exam_id = er.exam_id
     and r.student_id = er.student_id
    where er.exam_id = get_class_average_weighted.exam_id
      and er.mark is not null
      and (get_class_average_weighted.class_id is null
           or coalesce(r.class_id, s.class_id) = get_class_average_weighted.class_id)
      and (allowed_subject_ids is null or er.subject_id = any(allowed_subject_ids))
    group by er.student_id
  ),
  conduct_override as (
    select cs.student_id,
      (
        coalesce(cs.discipline,0)::numeric +
        coalesce(cs.effort,0)::numeric +
        coalesce(cs.participation,0)::numeric +
        coalesce(cs.motivational_level,0)::numeric +
        coalesce(cs.character_score,0)::numeric +
        coalesce(cs.leadership,0)::numeric
      )
      /
      nullif(
        (cs.discipline is not null)::int +
        (cs.effort is not null)::int +
        (cs.participation is not null)::int +
        (cs.motivational_level is not null)::int +
        (cs.character_score is not null)::int +
        (cs.leadership is not null)::int
      , 0) as override_score
    from public.conduct_scores cs
    join public.students s on s.id = cs.student_id
    left join public.exam_roster r
      on r.exam_id = cs.exam_id
     and r.student_id = cs.student_id
    where cs.exam_id = get_class_average_weighted.exam_id
      and cs.subject_id is null
      and (get_class_average_weighted.class_id is null
           or coalesce(r.class_id, s.class_id) = get_class_average_weighted.class_id)
  ),
  conduct_ps as (
    select cs.student_id,
      avg(
        (
          coalesce(cs.discipline,0)::numeric +
          coalesce(cs.effort,0)::numeric +
          coalesce(cs.participation,0)::numeric +
          coalesce(cs.motivational_level,0)::numeric +
          coalesce(cs.character_score,0)::numeric +
          coalesce(cs.leadership,0)::numeric
        )
        /
        nullif(
          (cs.discipline is not null)::int +
          (cs.effort is not null)::int +
          (cs.participation is not null)::int +
          (cs.motivational_level is not null)::int +
          (cs.character_score is not null)::int +
          (cs.leadership is not null)::int
        , 0)
      ) as ps_avg
    from public.conduct_scores cs
    join public.students s on s.id = cs.student_id
    left join public.exam_roster r
      on r.exam_id = cs.exam_id
     and r.student_id = cs.student_id
    where cs.exam_id = get_class_average_weighted.exam_id
      and cs.subject_id is not null
      and (get_class_average_weighted.class_id is null
           or coalesce(r.class_id, s.class_id) = get_class_average_weighted.class_id)
      and (allowed_subject_ids is null or cs.subject_id = any(allowed_subject_ids))
    group by cs.student_id
  ),
  finals as (
    select a.student_id,
           a.academic_avg,
           coalesce(o.override_score, p.ps_avg, a.academic_avg) as conduct_avg,
           greatest(
             0,
             least(
               100,
               a.academic_avg*(1 - get_class_average_weighted.w_conduct)
               + coalesce(o.override_score, p.ps_avg, a.academic_avg)*get_class_average_weighted.w_conduct
             )
           ) as final_mark
    from per_student_academic a
    left join conduct_override o on o.student_id = a.student_id
    left join conduct_ps       p on p.student_id = a.student_id
  )
  select avg(final_mark) from finals;
$$;

commit;
