-- Backfills tenant_id for existing rows when there is a single tenant.
-- Sets tenant_id default to current_tenant_id() for new rows.
-- Safe to run multiple times.

begin;

do $$
declare
  tenant_count int;
  default_tenant uuid;
begin
  select count(*), max(id)
    into tenant_count, default_tenant
  from public.tenants;

  if tenant_count = 1 then
    update public.attendance_records set tenant_id = default_tenant where tenant_id is null;
    update public.child_fee_assignments set tenant_id = default_tenant where tenant_id is null;
    update public.class_subjects set tenant_id = default_tenant where tenant_id is null;
    update public.classes set tenant_id = default_tenant where tenant_id is null;
    update public.conduct_criterias set tenant_id = default_tenant where tenant_id is null;
    update public.conduct_entries set tenant_id = default_tenant where tenant_id is null;
    update public.conduct_scores set tenant_id = default_tenant where tenant_id is null;
    update public.conduct_scores_old_20250923 set tenant_id = default_tenant where tenant_id is null;
    update public.exam_class_subjects set tenant_id = default_tenant where tenant_id is null;
    update public.exam_classes set tenant_id = default_tenant where tenant_id is null;
    update public.exam_excluded_students set tenant_id = default_tenant where tenant_id is null;
    update public.exam_results set tenant_id = default_tenant where tenant_id is null;
    update public.exam_subjects set tenant_id = default_tenant where tenant_id is null;
    update public.exams set tenant_id = default_tenant where tenant_id is null;
    update public.grading_systems set tenant_id = default_tenant where tenant_id is null;
    update public.juz_test_notifications set tenant_id = default_tenant where tenant_id is null;
    update public.juz_tests set tenant_id = default_tenant where tenant_id is null;
    update public.lesson_class_subject_year set tenant_id = default_tenant where tenant_id is null;
    update public.lesson_subtopic_progress set tenant_id = default_tenant where tenant_id is null;
    update public.lesson_topics set tenant_id = default_tenant where tenant_id is null;
    update public.parent_balance_adjustments set tenant_id = default_tenant where tenant_id is null;
    update public.payment_events set tenant_id = default_tenant where tenant_id is null;
    update public.payment_fee_catalog set tenant_id = default_tenant where tenant_id is null;
    update public.payment_line_items set tenant_id = default_tenant where tenant_id is null;
    update public.payments set tenant_id = default_tenant where tenant_id is null;
    update public.reports set tenant_id = default_tenant where tenant_id is null;
    update public.school_holiday_classes set tenant_id = default_tenant where tenant_id is null;
    update public.school_holidays set tenant_id = default_tenant where tenant_id is null;
    update public.students set tenant_id = default_tenant where tenant_id is null;
    update public.subject_opt_outs set tenant_id = default_tenant where tenant_id is null;
    update public.subjects set tenant_id = default_tenant where tenant_id is null;
    update public.test_sessions set tenant_id = default_tenant where tenant_id is null;
  else
    raise notice 'Skipping tenant_id backfill: multiple tenants found.';
  end if;
end $$;

alter table public.attendance_records
  alter column tenant_id set default public.current_tenant_id();
alter table public.child_fee_assignments
  alter column tenant_id set default public.current_tenant_id();
alter table public.class_subjects
  alter column tenant_id set default public.current_tenant_id();
alter table public.classes
  alter column tenant_id set default public.current_tenant_id();
alter table public.conduct_criterias
  alter column tenant_id set default public.current_tenant_id();
alter table public.conduct_entries
  alter column tenant_id set default public.current_tenant_id();
alter table public.conduct_scores
  alter column tenant_id set default public.current_tenant_id();
alter table public.conduct_scores_old_20250923
  alter column tenant_id set default public.current_tenant_id();
alter table public.exam_class_subjects
  alter column tenant_id set default public.current_tenant_id();
alter table public.exam_classes
  alter column tenant_id set default public.current_tenant_id();
alter table public.exam_excluded_students
  alter column tenant_id set default public.current_tenant_id();
alter table public.exam_results
  alter column tenant_id set default public.current_tenant_id();
alter table public.exam_subjects
  alter column tenant_id set default public.current_tenant_id();
alter table public.exams
  alter column tenant_id set default public.current_tenant_id();
alter table public.grading_systems
  alter column tenant_id set default public.current_tenant_id();
alter table public.juz_test_notifications
  alter column tenant_id set default public.current_tenant_id();
alter table public.juz_tests
  alter column tenant_id set default public.current_tenant_id();
alter table public.lesson_class_subject_year
  alter column tenant_id set default public.current_tenant_id();
alter table public.lesson_subtopic_progress
  alter column tenant_id set default public.current_tenant_id();
alter table public.lesson_topics
  alter column tenant_id set default public.current_tenant_id();
alter table public.parent_balance_adjustments
  alter column tenant_id set default public.current_tenant_id();
alter table public.payment_events
  alter column tenant_id set default public.current_tenant_id();
alter table public.payment_fee_catalog
  alter column tenant_id set default public.current_tenant_id();
alter table public.payment_line_items
  alter column tenant_id set default public.current_tenant_id();
alter table public.payments
  alter column tenant_id set default public.current_tenant_id();
alter table public.reports
  alter column tenant_id set default public.current_tenant_id();
alter table public.school_holiday_classes
  alter column tenant_id set default public.current_tenant_id();
alter table public.school_holidays
  alter column tenant_id set default public.current_tenant_id();
alter table public.students
  alter column tenant_id set default public.current_tenant_id();
alter table public.subject_opt_outs
  alter column tenant_id set default public.current_tenant_id();
alter table public.subjects
  alter column tenant_id set default public.current_tenant_id();
alter table public.test_sessions
  alter column tenant_id set default public.current_tenant_id();

commit;
