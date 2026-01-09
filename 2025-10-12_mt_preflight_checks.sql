-- Preflight checks before multi-tenant migrations.
-- Run in Supabase SQL Editor.

-- 1A) Confirm tenant context helpers.
select n.nspname as schema, p.proname as name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_tenant_id','current_user_role','is_school_admin')
order by p.proname;

-- 1B) exam_excluded_students tenant_id (after mt_01).
select
  count(*) as total_rows,
  count(*) filter (where tenant_id is null) as tenant_id_null
from public.exam_excluded_students;

-- 1C) NULL tenant_id check across core tables (must be 0 before mt_04).
select table_name,
       count(*) filter (where tenant_id is null) as nulls
from (
  select 'attendance_records' as table_name, tenant_id from public.attendance_records
  union all select 'child_fee_assignments', tenant_id from public.child_fee_assignments
  union all select 'class_subjects', tenant_id from public.class_subjects
  union all select 'classes', tenant_id from public.classes
  union all select 'conduct_criterias', tenant_id from public.conduct_criterias
  union all select 'conduct_entries', tenant_id from public.conduct_entries
  union all select 'conduct_scores', tenant_id from public.conduct_scores
  union all select 'conduct_scores_old_20250923', tenant_id from public.conduct_scores_old_20250923
  union all select 'exam_class_subjects', tenant_id from public.exam_class_subjects
  union all select 'exam_classes', tenant_id from public.exam_classes
  union all select 'exam_excluded_students', tenant_id from public.exam_excluded_students
  union all select 'exam_results', tenant_id from public.exam_results
  union all select 'exam_subjects', tenant_id from public.exam_subjects
  union all select 'exams', tenant_id from public.exams
  union all select 'grading_systems', tenant_id from public.grading_systems
  union all select 'juz_test_notifications', tenant_id from public.juz_test_notifications
  union all select 'juz_tests', tenant_id from public.juz_tests
  union all select 'lesson_class_subject_year', tenant_id from public.lesson_class_subject_year
  union all select 'lesson_subtopic_progress', tenant_id from public.lesson_subtopic_progress
  union all select 'lesson_topics', tenant_id from public.lesson_topics
  union all select 'parent_balance_adjustments', tenant_id from public.parent_balance_adjustments
  union all select 'payment_events', tenant_id from public.payment_events
  union all select 'payment_fee_catalog', tenant_id from public.payment_fee_catalog
  union all select 'payment_line_items', tenant_id from public.payment_line_items
  union all select 'payments', tenant_id from public.payments
  union all select 'reports', tenant_id from public.reports
  union all select 'school_holiday_classes', tenant_id from public.school_holiday_classes
  union all select 'school_holidays', tenant_id from public.school_holidays
  union all select 'students', tenant_id from public.students
  union all select 'subject_opt_outs', tenant_id from public.subject_opt_outs
  union all select 'subjects', tenant_id from public.subjects
  union all select 'test_sessions', tenant_id from public.test_sessions
) t
group by table_name
order by table_name;
