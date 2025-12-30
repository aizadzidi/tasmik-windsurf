begin;

-- Allow per-teacher/per-year progress rows; drop legacy uniqueness blocks.
alter table public.lesson_subtopic_progress
  drop constraint if exists lesson_subtopic_progress_topic_id_subtopic_index_key;

alter table public.lesson_subtopic_progress
  drop constraint if exists lesson_subtopic_progress_topic_sub_teacher_key;

-- Ensure the intended unique constraint exists (upsert uses these columns).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lesson_subtopic_progress_unique_per_teacher_year'
      and conrelid = 'public.lesson_subtopic_progress'::regclass
  ) then
    execute 'alter table public.lesson_subtopic_progress add constraint lesson_subtopic_progress_unique_per_teacher_year unique (topic_id, subtopic_index, teacher_id, academic_year)';
  end if;
end $$;

commit;
