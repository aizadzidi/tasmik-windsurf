-- Rollback helper for multi-tenant migrations.
-- Prefer restoring a DB backup for full rollback.

begin;

-- Unforce RLS on tenant tables.
alter table public.attendance_records no force row level security;
alter table public.child_fee_assignments no force row level security;
alter table public.class_subjects no force row level security;
alter table public.classes no force row level security;
alter table public.conduct_criterias no force row level security;
alter table public.conduct_entries no force row level security;
alter table public.conduct_scores no force row level security;
alter table public.conduct_scores_old_20250923 no force row level security;
alter table public.exam_class_subjects no force row level security;
alter table public.exam_classes no force row level security;
alter table public.exam_excluded_students no force row level security;
alter table public.exam_results no force row level security;
alter table public.exam_subjects no force row level security;
alter table public.exams no force row level security;
alter table public.grading_systems no force row level security;
alter table public.juz_test_notifications no force row level security;
alter table public.juz_tests no force row level security;
alter table public.lesson_class_subject_year no force row level security;
alter table public.lesson_subtopic_progress no force row level security;
alter table public.lesson_topics no force row level security;
alter table public.parent_balance_adjustments no force row level security;
alter table public.payment_events no force row level security;
alter table public.payment_fee_catalog no force row level security;
alter table public.payment_line_items no force row level security;
alter table public.payments no force row level security;
alter table public.reports no force row level security;
alter table public.school_holiday_classes no force row level security;
alter table public.school_holidays no force row level security;
alter table public.students no force row level security;
alter table public.subject_opt_outs no force row level security;
alter table public.subjects no force row level security;
alter table public.tenant_domains no force row level security;
alter table public.tenant_payment_accounts no force row level security;
alter table public.tenant_payment_settings no force row level security;
alter table public.test_sessions no force row level security;

-- Drop new tenant admin policies.
drop policy if exists tenant_admin_manage_grading_systems on public.grading_systems;
drop policy if exists tenant_admin_manage_juz_tests on public.juz_tests;
drop policy if exists tenant_admin_manage_juz_test_notifications on public.juz_test_notifications;
drop policy if exists tenant_admin_manage_conduct_criterias on public.conduct_criterias;
drop policy if exists tenant_admin_manage_conduct_scores_old_20250923 on public.conduct_scores_old_20250923;
drop policy if exists tenant_admin_manage_parent_balance_adjustments on public.parent_balance_adjustments;
drop policy if exists tenant_admin_manage_child_fee_assignments on public.child_fee_assignments;

-- Drop tenant guard policies added in this migration set.
drop policy if exists tenant_guard_attendance_records on public.attendance_records;
drop policy if exists tenant_guard_classes on public.classes;
drop policy if exists tenant_guard_lesson_class_subject_year on public.lesson_class_subject_year;
drop policy if exists tenant_guard_lesson_subtopic_progress on public.lesson_subtopic_progress;
drop policy if exists tenant_guard_lesson_topics on public.lesson_topics;
drop policy if exists tenant_guard_reports on public.reports;

-- Drop exam_excluded_students policies added in mt_01.
drop policy if exists tenant_guard_exam_excluded_students on public.exam_excluded_students;
drop policy if exists tenant_admin_manage_exam_excluded_students on public.exam_excluded_students;
drop policy if exists tenant_member_read_exam_excluded_students on public.exam_excluded_students;

-- Restore legacy policies (users.role/raw meta).
create policy "Allow admin to manage conduct criteria"
  on public.conduct_criterias
  for all
  using (exists (
    select 1 from auth.users
    where users.id = auth.uid()
      and (users.raw_user_meta_data ->> 'role') = 'admin'
  ));

create policy admins_can_manage_all_conduct_scores
  on public.conduct_scores_old_20250923
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy conduct_scores_manage_policy
  on public.conduct_scores_old_20250923
  for all
  using (
    (exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'admin'
    ))
    or exists (
      select 1
      from exam_results er
      join students s on er.student_id = s.id
      where er.id = conduct_scores_old_20250923.exam_result_id
        and s.assigned_teacher_id = auth.uid()
    )
  );

create policy "Admins can manage exam classes"
  on public.exam_classes
  for all
  using (exists (
    select 1 from auth.users
    where users.id = auth.uid()
      and (users.raw_user_meta_data ->> 'role') = 'admin'
  ));

create policy admin_users_can_modify_exam_classes
  on public.exam_classes
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy "Admins can manage exam subjects"
  on public.exam_subjects
  for all
  using (exists (
    select 1 from auth.users
    where users.id = auth.uid()
      and (users.raw_user_meta_data ->> 'role') = 'admin'
  ));

create policy admin_users_can_modify_exam_subjects
  on public.exam_subjects
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy "Admins can manage all exams"
  on public.exams
  for all
  using (exists (
    select 1 from auth.users
    where users.id = auth.uid()
      and (users.raw_user_meta_data ->> 'role') = 'admin'
  ));

create policy admin_users_can_modify_exams
  on public.exams
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy exams_admin_policy
  on public.exams
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy admins_can_manage_all_exam_results
  on public.exam_results
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy exam_results_manage_policy
  on public.exam_results
  for all
  using (
    (exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'admin'
    ))
    or exists (
      select 1 from students
      where students.id = exam_results.student_id
        and students.assigned_teacher_id = auth.uid()
    )
  );

create policy grading_systems_delete
  on public.grading_systems
  for delete
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy grading_systems_insert
  on public.grading_systems
  for insert
  with check (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy grading_systems_select
  on public.grading_systems
  for select
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = any (array['admin','teacher'])
  ));

create policy grading_systems_update
  on public.grading_systems
  for update
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ))
  with check (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy "Admins can update notification status"
  on public.juz_test_notifications
  for update
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy "Admins can view all notifications"
  on public.juz_test_notifications
  for select
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy "Admins can manage all juz tests"
  on public.juz_tests
  for all
  using (exists (
    select 1 from users
    where users.id = auth.uid()
      and users.role = 'admin'
  ));

create policy admin_manage_parent_balance_adjustments
  on public.parent_balance_adjustments
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_payment_events
  on public.payment_events
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_fee_catalog
  on public.payment_fee_catalog
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_payment_line_items
  on public.payment_line_items
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_payments
  on public.payments
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_child_fee_assignments
  on public.child_fee_assignments
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ))
  with check (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy admin_can_manage_exam_excluded_students
  on public.exam_excluded_students
  for all
  using (exists (
    select 1 from users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ));

create policy authenticated_can_read_exam_excluded_students
  on public.exam_excluded_students
  for select
  using (auth.uid() is not null);

-- Drop tenant defaults and relax NOT NULL.
alter table public.attendance_records alter column tenant_id drop not null;
alter table public.child_fee_assignments alter column tenant_id drop not null;
alter table public.class_subjects alter column tenant_id drop not null;
alter table public.classes alter column tenant_id drop not null;
alter table public.conduct_criterias alter column tenant_id drop not null;
alter table public.conduct_entries alter column tenant_id drop not null;
alter table public.conduct_scores alter column tenant_id drop not null;
alter table public.conduct_scores_old_20250923 alter column tenant_id drop not null;
alter table public.exam_class_subjects alter column tenant_id drop not null;
alter table public.exam_classes alter column tenant_id drop not null;
alter table public.exam_excluded_students alter column tenant_id drop not null;
alter table public.exam_results alter column tenant_id drop not null;
alter table public.exam_subjects alter column tenant_id drop not null;
alter table public.exams alter column tenant_id drop not null;
alter table public.grading_systems alter column tenant_id drop not null;
alter table public.juz_test_notifications alter column tenant_id drop not null;
alter table public.juz_tests alter column tenant_id drop not null;
alter table public.lesson_class_subject_year alter column tenant_id drop not null;
alter table public.lesson_subtopic_progress alter column tenant_id drop not null;
alter table public.lesson_topics alter column tenant_id drop not null;
alter table public.parent_balance_adjustments alter column tenant_id drop not null;
alter table public.payment_events alter column tenant_id drop not null;
alter table public.payment_fee_catalog alter column tenant_id drop not null;
alter table public.payment_line_items alter column tenant_id drop not null;
alter table public.payments alter column tenant_id drop not null;
alter table public.reports alter column tenant_id drop not null;
alter table public.school_holiday_classes alter column tenant_id drop not null;
alter table public.school_holidays alter column tenant_id drop not null;
alter table public.students alter column tenant_id drop not null;
alter table public.subject_opt_outs alter column tenant_id drop not null;
alter table public.subjects alter column tenant_id drop not null;
alter table public.test_sessions alter column tenant_id drop not null;

alter table public.attendance_records alter column tenant_id drop default;
alter table public.child_fee_assignments alter column tenant_id drop default;
alter table public.class_subjects alter column tenant_id drop default;
alter table public.classes alter column tenant_id drop default;
alter table public.conduct_criterias alter column tenant_id drop default;
alter table public.conduct_entries alter column tenant_id drop default;
alter table public.conduct_scores alter column tenant_id drop default;
alter table public.conduct_scores_old_20250923 alter column tenant_id drop default;
alter table public.exam_class_subjects alter column tenant_id drop default;
alter table public.exam_classes alter column tenant_id drop default;
alter table public.exam_excluded_students alter column tenant_id drop default;
alter table public.exam_results alter column tenant_id drop default;
alter table public.exam_subjects alter column tenant_id drop default;
alter table public.exams alter column tenant_id drop default;
alter table public.grading_systems alter column tenant_id drop default;
alter table public.juz_test_notifications alter column tenant_id drop default;
alter table public.juz_tests alter column tenant_id drop default;
alter table public.lesson_class_subject_year alter column tenant_id drop default;
alter table public.lesson_subtopic_progress alter column tenant_id drop default;
alter table public.lesson_topics alter column tenant_id drop default;
alter table public.parent_balance_adjustments alter column tenant_id drop default;
alter table public.payment_events alter column tenant_id drop default;
alter table public.payment_fee_catalog alter column tenant_id drop default;
alter table public.payment_line_items alter column tenant_id drop default;
alter table public.payments alter column tenant_id drop default;
alter table public.reports alter column tenant_id drop default;
alter table public.school_holiday_classes alter column tenant_id drop default;
alter table public.school_holidays alter column tenant_id drop default;
alter table public.students alter column tenant_id drop default;
alter table public.subject_opt_outs alter column tenant_id drop default;
alter table public.subjects alter column tenant_id drop default;
alter table public.test_sessions alter column tenant_id drop default;

-- Drop tenant scoped unique indexes and restore global uniques.
drop index if exists public.classes_tenant_name_key;
drop index if exists public.subjects_tenant_name_key;
alter table public.classes add constraint classes_name_key unique (name);
alter table public.subjects add constraint subjects_name_key unique (name);

-- Drop tenant consistency constraints.
alter table public.exam_classes drop constraint if exists exam_classes_exam_tenant_fkey;
alter table public.exam_classes drop constraint if exists exam_classes_class_tenant_fkey;
alter table public.exam_subjects drop constraint if exists exam_subjects_exam_tenant_fkey;
alter table public.exam_subjects drop constraint if exists exam_subjects_subject_tenant_fkey;
alter table public.exam_class_subjects drop constraint if exists exam_class_subjects_exam_tenant_fkey;
alter table public.exam_class_subjects drop constraint if exists exam_class_subjects_class_tenant_fkey;
alter table public.exam_class_subjects drop constraint if exists exam_class_subjects_subject_tenant_fkey;
alter table public.exam_results drop constraint if exists exam_results_exam_tenant_fkey;
alter table public.exam_results drop constraint if exists exam_results_student_tenant_fkey;
alter table public.exam_results drop constraint if exists exam_results_subject_tenant_fkey;
alter table public.exam_excluded_students drop constraint if exists exam_excluded_students_exam_tenant_fkey;
alter table public.exam_excluded_students drop constraint if exists exam_excluded_students_student_tenant_fkey;
alter table public.exam_excluded_students drop constraint if exists exam_excluded_students_class_tenant_fkey;
alter table public.attendance_records drop constraint if exists attendance_records_student_tenant_fkey;
alter table public.attendance_records drop constraint if exists attendance_records_class_tenant_fkey;
alter table public.lesson_topics drop constraint if exists lesson_topics_class_tenant_fkey;
alter table public.lesson_topics drop constraint if exists lesson_topics_subject_tenant_fkey;
alter table public.lesson_subtopic_progress drop constraint if exists lesson_subtopic_progress_topic_tenant_fkey;
alter table public.lesson_class_subject_year drop constraint if exists lesson_class_subject_year_class_tenant_fkey;
alter table public.lesson_class_subject_year drop constraint if exists lesson_class_subject_year_subject_tenant_fkey;
alter table public.class_subjects drop constraint if exists class_subjects_class_tenant_fkey;
alter table public.class_subjects drop constraint if exists class_subjects_subject_tenant_fkey;
alter table public.school_holiday_classes drop constraint if exists school_holiday_classes_holiday_tenant_fkey;
alter table public.school_holiday_classes drop constraint if exists school_holiday_classes_class_tenant_fkey;

alter table public.students drop constraint if exists students_id_tenant_key;
alter table public.classes drop constraint if exists classes_id_tenant_key;
alter table public.subjects drop constraint if exists subjects_id_tenant_key;
alter table public.exams drop constraint if exists exams_id_tenant_key;
alter table public.lesson_topics drop constraint if exists lesson_topics_id_tenant_key;
alter table public.school_holidays drop constraint if exists school_holidays_id_tenant_key;

commit;
