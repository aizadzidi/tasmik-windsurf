-- Validates tenant consistency constraints after data cleanup.
-- Deployment notes:
-- - Run during low traffic and monitor lock wait times.
-- - Each batch runs in its own transaction to reduce lock contention.
-- - Have a rollback plan ready (e.g., stop after a batch if locks spike).

-- Batch 1: exam_* tables.
begin;
alter table public.exam_classes validate constraint exam_classes_exam_tenant_fkey;
alter table public.exam_classes validate constraint exam_classes_class_tenant_fkey;

alter table public.exam_subjects validate constraint exam_subjects_exam_tenant_fkey;
alter table public.exam_subjects validate constraint exam_subjects_subject_tenant_fkey;

alter table public.exam_class_subjects validate constraint exam_class_subjects_exam_tenant_fkey;
alter table public.exam_class_subjects validate constraint exam_class_subjects_class_tenant_fkey;
alter table public.exam_class_subjects validate constraint exam_class_subjects_subject_tenant_fkey;

alter table public.exam_results validate constraint exam_results_exam_tenant_fkey;
alter table public.exam_results validate constraint exam_results_student_tenant_fkey;
alter table public.exam_results validate constraint exam_results_subject_tenant_fkey;

alter table public.exam_excluded_students validate constraint exam_excluded_students_exam_tenant_fkey;
alter table public.exam_excluded_students validate constraint exam_excluded_students_student_tenant_fkey;
alter table public.exam_excluded_students validate constraint exam_excluded_students_class_tenant_fkey;
commit;

-- Batch 2: attendance + lesson_* tables.
begin;
alter table public.attendance_records validate constraint attendance_records_student_tenant_fkey;
alter table public.attendance_records validate constraint attendance_records_class_tenant_fkey;

alter table public.lesson_topics validate constraint lesson_topics_class_tenant_fkey;
alter table public.lesson_topics validate constraint lesson_topics_subject_tenant_fkey;

alter table public.lesson_subtopic_progress
  validate constraint lesson_subtopic_progress_topic_tenant_fkey;

alter table public.lesson_class_subject_year
  validate constraint lesson_class_subject_year_class_tenant_fkey;
alter table public.lesson_class_subject_year
  validate constraint lesson_class_subject_year_subject_tenant_fkey;
commit;

-- Batch 3: class/subject + school holiday tables.
begin;
alter table public.class_subjects validate constraint class_subjects_class_tenant_fkey;
alter table public.class_subjects validate constraint class_subjects_subject_tenant_fkey;

alter table public.school_holiday_classes
  validate constraint school_holiday_classes_holiday_tenant_fkey;
alter table public.school_holiday_classes
  validate constraint school_holiday_classes_class_tenant_fkey;
commit;
