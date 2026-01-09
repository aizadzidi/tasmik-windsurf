-- Adds composite tenant consistency constraints (NOT VALID).
-- Run validation after verifying data.

begin;

-- Parent composite uniques.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_id_tenant_key') then
    alter table public.students
      add constraint students_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'classes_id_tenant_key') then
    alter table public.classes
      add constraint classes_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subjects_id_tenant_key') then
    alter table public.subjects
      add constraint subjects_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exams_id_tenant_key') then
    alter table public.exams
      add constraint exams_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_topics_id_tenant_key') then
    alter table public.lesson_topics
      add constraint lesson_topics_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_holidays_id_tenant_key') then
    alter table public.school_holidays
      add constraint school_holidays_id_tenant_key unique (id, tenant_id);
  end if;
end;
$$;

-- Exam tables.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exam_classes_exam_tenant_fkey') then
    alter table public.exam_classes
      add constraint exam_classes_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_classes_class_tenant_fkey') then
    alter table public.exam_classes
      add constraint exam_classes_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_subjects_exam_tenant_fkey') then
    alter table public.exam_subjects
      add constraint exam_subjects_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_subjects_subject_tenant_fkey') then
    alter table public.exam_subjects
      add constraint exam_subjects_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_class_subjects_exam_tenant_fkey') then
    alter table public.exam_class_subjects
      add constraint exam_class_subjects_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_class_subjects_class_tenant_fkey') then
    alter table public.exam_class_subjects
      add constraint exam_class_subjects_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_class_subjects_subject_tenant_fkey') then
    alter table public.exam_class_subjects
      add constraint exam_class_subjects_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_results_exam_tenant_fkey') then
    alter table public.exam_results
      add constraint exam_results_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_results_student_tenant_fkey') then
    alter table public.exam_results
      add constraint exam_results_student_tenant_fkey
      foreign key (student_id, tenant_id)
      references public.students (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_results_subject_tenant_fkey') then
    alter table public.exam_results
      add constraint exam_results_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
end;
$$;

-- Exam excluded students.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exam_excluded_students_exam_tenant_fkey') then
    alter table public.exam_excluded_students
      add constraint exam_excluded_students_exam_tenant_fkey
      foreign key (exam_id, tenant_id)
      references public.exams (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_excluded_students_student_tenant_fkey') then
    alter table public.exam_excluded_students
      add constraint exam_excluded_students_student_tenant_fkey
      foreign key (student_id, tenant_id)
      references public.students (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exam_excluded_students_class_tenant_fkey') then
    alter table public.exam_excluded_students
      add constraint exam_excluded_students_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
end;
$$;

-- Attendance and lesson tables.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_student_tenant_fkey') then
    alter table public.attendance_records
      add constraint attendance_records_student_tenant_fkey
      foreign key (student_id, tenant_id)
      references public.students (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_records_class_tenant_fkey') then
    alter table public.attendance_records
      add constraint attendance_records_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_topics_class_tenant_fkey') then
    alter table public.lesson_topics
      add constraint lesson_topics_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_topics_subject_tenant_fkey') then
    alter table public.lesson_topics
      add constraint lesson_topics_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_subtopic_progress_topic_tenant_fkey') then
    alter table public.lesson_subtopic_progress
      add constraint lesson_subtopic_progress_topic_tenant_fkey
      foreign key (topic_id, tenant_id)
      references public.lesson_topics (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_class_subject_year_class_tenant_fkey') then
    alter table public.lesson_class_subject_year
      add constraint lesson_class_subject_year_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_class_subject_year_subject_tenant_fkey') then
    alter table public.lesson_class_subject_year
      add constraint lesson_class_subject_year_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
end;
$$;

-- Class subjects and holidays.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_subjects_class_tenant_fkey') then
    alter table public.class_subjects
      add constraint class_subjects_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_subjects_subject_tenant_fkey') then
    alter table public.class_subjects
      add constraint class_subjects_subject_tenant_fkey
      foreign key (subject_id, tenant_id)
      references public.subjects (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_holiday_classes_holiday_tenant_fkey') then
    alter table public.school_holiday_classes
      add constraint school_holiday_classes_holiday_tenant_fkey
      foreign key (holiday_id, tenant_id)
      references public.school_holidays (id, tenant_id)
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_holiday_classes_class_tenant_fkey') then
    alter table public.school_holiday_classes
      add constraint school_holiday_classes_class_tenant_fkey
      foreign key (class_id, tenant_id)
      references public.classes (id, tenant_id)
      not valid;
  end if;
end;
$$;

commit;
