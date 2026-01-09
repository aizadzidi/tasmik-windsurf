-- Down migration (rollback): remove forced RLS.
begin;

do $$
declare
  tables text[] := array[
    'attendance_records',
    'child_fee_assignments',
    'class_subjects',
    'classes',
    'conduct_criterias',
    'conduct_entries',
    'conduct_scores',
    'conduct_scores_old_20250923',
    'exam_class_subjects',
    'exam_classes',
    'exam_excluded_students',
    'exam_results',
    'exam_subjects',
    'exams',
    'grading_systems',
    'juz_test_notifications',
    'juz_tests',
    'lesson_class_subject_year',
    'lesson_subtopic_progress',
    'lesson_topics',
    'parent_balance_adjustments',
    'payment_events',
    'payment_fee_catalog',
    'payment_line_items',
    'payments',
    'reports',
    'school_holiday_classes',
    'school_holidays',
    'students',
    'subject_opt_outs',
    'subjects',
    'tenant_domains',
    'tenant_payment_accounts',
    'tenant_payment_settings',
    'test_sessions'
  ];
  tbl text;
begin
  foreach tbl in array tables loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = tbl
    ) then
      raise notice 'Skipping missing table during rollback: %', tbl;
      continue;
    end if;

    execute format('alter table public.%I no force row level security', tbl);
  end loop;
end;
$$;

commit;
