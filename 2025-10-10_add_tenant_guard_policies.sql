-- Adds restrictive tenant guard RLS policies (phase 1).
-- These policies AND with existing role policies to prevent cross-tenant access.
-- Run this in Supabase SQL editor (write access required).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and policyname = 'tenant_guard_students'
  ) then
    create policy tenant_guard_students
      on public.students
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = students.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = students.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classes'
      and policyname = 'tenant_guard_classes'
  ) then
    create policy tenant_guard_classes
      on public.classes
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = classes.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = classes.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subjects'
      and policyname = 'tenant_guard_subjects'
  ) then
    create policy tenant_guard_subjects
      on public.subjects
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = subjects.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = subjects.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'tenant_guard_reports'
  ) then
    create policy tenant_guard_reports
      on public.reports
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = reports.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = reports.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_records'
      and policyname = 'tenant_guard_attendance_records'
  ) then
    create policy tenant_guard_attendance_records
      on public.attendance_records
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = attendance_records.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = attendance_records.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exams'
      and policyname = 'tenant_guard_exams'
  ) then
    create policy tenant_guard_exams
      on public.exams
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exams.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exams.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_classes'
      and policyname = 'tenant_guard_exam_classes'
  ) then
    create policy tenant_guard_exam_classes
      on public.exam_classes
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_classes.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_classes.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_subjects'
      and policyname = 'tenant_guard_exam_subjects'
  ) then
    create policy tenant_guard_exam_subjects
      on public.exam_subjects
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_subjects.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_subjects.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_results'
      and policyname = 'tenant_guard_exam_results'
  ) then
    create policy tenant_guard_exam_results
      on public.exam_results
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_results.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_results.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_class_subjects'
      and policyname = 'tenant_guard_exam_class_subjects'
  ) then
    create policy tenant_guard_exam_class_subjects
      on public.exam_class_subjects
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_class_subjects.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = exam_class_subjects.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_subjects'
      and policyname = 'tenant_guard_class_subjects'
  ) then
    create policy tenant_guard_class_subjects
      on public.class_subjects
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = class_subjects.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = class_subjects.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subject_opt_outs'
      and policyname = 'tenant_guard_subject_opt_outs'
  ) then
    create policy tenant_guard_subject_opt_outs
      on public.subject_opt_outs
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = subject_opt_outs.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = subject_opt_outs.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_topics'
      and policyname = 'tenant_guard_lesson_topics'
  ) then
    create policy tenant_guard_lesson_topics
      on public.lesson_topics
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_topics.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_topics.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_subtopic_progress'
      and policyname = 'tenant_guard_lesson_subtopic_progress'
  ) then
    create policy tenant_guard_lesson_subtopic_progress
      on public.lesson_subtopic_progress
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_subtopic_progress.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_subtopic_progress.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lesson_class_subject_year'
      and policyname = 'tenant_guard_lesson_class_subject_year'
  ) then
    create policy tenant_guard_lesson_class_subject_year
      on public.lesson_class_subject_year
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_class_subject_year.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = lesson_class_subject_year.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'school_holidays'
      and policyname = 'tenant_guard_school_holidays'
  ) then
    create policy tenant_guard_school_holidays
      on public.school_holidays
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = school_holidays.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = school_holidays.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'school_holiday_classes'
      and policyname = 'tenant_guard_school_holiday_classes'
  ) then
    create policy tenant_guard_school_holiday_classes
      on public.school_holiday_classes
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = school_holiday_classes.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = school_holiday_classes.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'juz_tests'
      and policyname = 'tenant_guard_juz_tests'
  ) then
    create policy tenant_guard_juz_tests
      on public.juz_tests
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = juz_tests.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = juz_tests.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'juz_test_notifications'
      and policyname = 'tenant_guard_juz_test_notifications'
  ) then
    create policy tenant_guard_juz_test_notifications
      on public.juz_test_notifications
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = juz_test_notifications.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = juz_test_notifications.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'test_sessions'
      and policyname = 'tenant_guard_test_sessions'
  ) then
    create policy tenant_guard_test_sessions
      on public.test_sessions
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = test_sessions.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = test_sessions.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_criterias'
      and policyname = 'tenant_guard_conduct_criterias'
  ) then
    create policy tenant_guard_conduct_criterias
      on public.conduct_criterias
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_criterias.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_criterias.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_entries'
      and policyname = 'tenant_guard_conduct_entries'
  ) then
    create policy tenant_guard_conduct_entries
      on public.conduct_entries
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_entries.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_entries.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_scores'
      and policyname = 'tenant_guard_conduct_scores'
  ) then
    create policy tenant_guard_conduct_scores
      on public.conduct_scores
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_scores.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_scores.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_scores_old_20250923'
      and policyname = 'tenant_guard_conduct_scores_old_20250923'
  ) then
    create policy tenant_guard_conduct_scores_old_20250923
      on public.conduct_scores_old_20250923
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_scores_old_20250923.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = conduct_scores_old_20250923.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'grading_systems'
      and policyname = 'tenant_guard_grading_systems'
  ) then
    create policy tenant_guard_grading_systems
      on public.grading_systems
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = grading_systems.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = grading_systems.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_fee_catalog'
      and policyname = 'tenant_guard_payment_fee_catalog'
  ) then
    create policy tenant_guard_payment_fee_catalog
      on public.payment_fee_catalog
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_fee_catalog.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_fee_catalog.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'child_fee_assignments'
      and policyname = 'tenant_guard_child_fee_assignments'
  ) then
    create policy tenant_guard_child_fee_assignments
      on public.child_fee_assignments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = child_fee_assignments.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = child_fee_assignments.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'tenant_guard_payments'
  ) then
    create policy tenant_guard_payments
      on public.payments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payments.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payments.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_line_items'
      and policyname = 'tenant_guard_payment_line_items'
  ) then
    create policy tenant_guard_payment_line_items
      on public.payment_line_items
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_line_items.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_line_items.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_events'
      and policyname = 'tenant_guard_payment_events'
  ) then
    create policy tenant_guard_payment_events
      on public.payment_events
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_events.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_events.tenant_id
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'parent_balance_adjustments'
      and policyname = 'tenant_guard_parent_balance_adjustments'
  ) then
    create policy tenant_guard_parent_balance_adjustments
      on public.parent_balance_adjustments
      as restrictive
      for all
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = parent_balance_adjustments.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = parent_balance_adjustments.tenant_id
      ));
  end if;
end;
$$;
