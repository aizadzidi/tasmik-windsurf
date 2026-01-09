-- Enforces tenant_id NOT NULL after backfill.
-- This will fail if any table still has tenant_id nulls.

begin;

do $$
begin
  if exists (select 1 from public.attendance_records where tenant_id is null) then
    raise exception 'attendance_records.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.child_fee_assignments where tenant_id is null) then
    raise exception 'child_fee_assignments.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.class_subjects where tenant_id is null) then
    raise exception 'class_subjects.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.classes where tenant_id is null) then
    raise exception 'classes.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.conduct_criterias where tenant_id is null) then
    raise exception 'conduct_criterias.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.conduct_entries where tenant_id is null) then
    raise exception 'conduct_entries.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.conduct_scores where tenant_id is null) then
    raise exception 'conduct_scores.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.conduct_scores_old_20250923 where tenant_id is null) then
    raise exception 'conduct_scores_old_20250923.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exam_class_subjects where tenant_id is null) then
    raise exception 'exam_class_subjects.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exam_classes where tenant_id is null) then
    raise exception 'exam_classes.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exam_excluded_students where tenant_id is null) then
    raise exception 'exam_excluded_students.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exam_results where tenant_id is null) then
    raise exception 'exam_results.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exam_subjects where tenant_id is null) then
    raise exception 'exam_subjects.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.exams where tenant_id is null) then
    raise exception 'exams.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.grading_systems where tenant_id is null) then
    raise exception 'grading_systems.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.juz_test_notifications where tenant_id is null) then
    raise exception 'juz_test_notifications.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.juz_tests where tenant_id is null) then
    raise exception 'juz_tests.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.lesson_class_subject_year where tenant_id is null) then
    raise exception 'lesson_class_subject_year.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.lesson_subtopic_progress where tenant_id is null) then
    raise exception 'lesson_subtopic_progress.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.lesson_topics where tenant_id is null) then
    raise exception 'lesson_topics.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.parent_balance_adjustments where tenant_id is null) then
    raise exception 'parent_balance_adjustments.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.payment_events where tenant_id is null) then
    raise exception 'payment_events.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.payment_fee_catalog where tenant_id is null) then
    raise exception 'payment_fee_catalog.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.payment_line_items where tenant_id is null) then
    raise exception 'payment_line_items.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.payments where tenant_id is null) then
    raise exception 'payments.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.reports where tenant_id is null) then
    raise exception 'reports.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.school_holiday_classes where tenant_id is null) then
    raise exception 'school_holiday_classes.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.school_holidays where tenant_id is null) then
    raise exception 'school_holidays.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.students where tenant_id is null) then
    raise exception 'students.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.subject_opt_outs where tenant_id is null) then
    raise exception 'subject_opt_outs.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.subjects where tenant_id is null) then
    raise exception 'subjects.tenant_id has NULLs';
  end if;
  if exists (select 1 from public.test_sessions where tenant_id is null) then
    raise exception 'test_sessions.tenant_id has NULLs';
  end if;
end $$;

alter table public.attendance_records alter column tenant_id set not null;
alter table public.child_fee_assignments alter column tenant_id set not null;
alter table public.class_subjects alter column tenant_id set not null;
alter table public.classes alter column tenant_id set not null;
alter table public.conduct_criterias alter column tenant_id set not null;
alter table public.conduct_entries alter column tenant_id set not null;
alter table public.conduct_scores alter column tenant_id set not null;
alter table public.conduct_scores_old_20250923 alter column tenant_id set not null;
alter table public.exam_class_subjects alter column tenant_id set not null;
alter table public.exam_classes alter column tenant_id set not null;
alter table public.exam_excluded_students alter column tenant_id set not null;
alter table public.exam_results alter column tenant_id set not null;
alter table public.exam_subjects alter column tenant_id set not null;
alter table public.exams alter column tenant_id set not null;
alter table public.grading_systems alter column tenant_id set not null;
alter table public.juz_test_notifications alter column tenant_id set not null;
alter table public.juz_tests alter column tenant_id set not null;
alter table public.lesson_class_subject_year alter column tenant_id set not null;
alter table public.lesson_subtopic_progress alter column tenant_id set not null;
alter table public.lesson_topics alter column tenant_id set not null;
alter table public.parent_balance_adjustments alter column tenant_id set not null;
alter table public.payment_events alter column tenant_id set not null;
alter table public.payment_fee_catalog alter column tenant_id set not null;
alter table public.payment_line_items alter column tenant_id set not null;
alter table public.payments alter column tenant_id set not null;
alter table public.reports alter column tenant_id set not null;
alter table public.school_holiday_classes alter column tenant_id set not null;
alter table public.school_holidays alter column tenant_id set not null;
alter table public.students alter column tenant_id set not null;
alter table public.subject_opt_outs alter column tenant_id set not null;
alter table public.subjects alter column tenant_id set not null;
alter table public.test_sessions alter column tenant_id set not null;

commit;
