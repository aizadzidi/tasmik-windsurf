-- Replaces legacy admin policies (users.role/raw meta) with tenant-scoped admin policies.

-- Create missing tenant admin policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'grading_systems'
      and policyname = 'tenant_admin_manage_grading_systems'
  ) then
    create policy tenant_admin_manage_grading_systems
      on public.grading_systems
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = grading_systems.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = grading_systems.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'juz_tests'
      and policyname = 'tenant_admin_manage_juz_tests'
  ) then
    create policy tenant_admin_manage_juz_tests
      on public.juz_tests
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = juz_tests.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = juz_tests.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'juz_test_notifications'
      and policyname = 'tenant_admin_manage_juz_test_notifications'
  ) then
    create policy tenant_admin_manage_juz_test_notifications
      on public.juz_test_notifications
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = juz_test_notifications.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = juz_test_notifications.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_criterias'
      and policyname = 'tenant_admin_manage_conduct_criterias'
  ) then
    create policy tenant_admin_manage_conduct_criterias
      on public.conduct_criterias
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = conduct_criterias.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = conduct_criterias.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conduct_scores_old_20250923'
      and policyname = 'tenant_admin_manage_conduct_scores_old_20250923'
  ) then
    create policy tenant_admin_manage_conduct_scores_old_20250923
      on public.conduct_scores_old_20250923
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = conduct_scores_old_20250923.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = conduct_scores_old_20250923.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'parent_balance_adjustments'
      and policyname = 'tenant_admin_manage_parent_balance_adjustments'
  ) then
    create policy tenant_admin_manage_parent_balance_adjustments
      on public.parent_balance_adjustments
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = parent_balance_adjustments.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = parent_balance_adjustments.tenant_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'child_fee_assignments'
      and policyname = 'tenant_admin_manage_child_fee_assignments'
  ) then
    create policy tenant_admin_manage_child_fee_assignments
      on public.child_fee_assignments
      for all
      to authenticated
      using (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = child_fee_assignments.tenant_id
        )
      )
      with check (
        is_school_admin()
        and exists (
          select 1 from public.user_profiles up
          where up.user_id = auth.uid()
            and up.tenant_id = child_fee_assignments.tenant_id
        )
      );
  end if;
end;
$$;

-- Drop legacy policies that rely on users.role or auth.user meta.
drop policy if exists "Allow admin to manage conduct criteria" on public.conduct_criterias;

drop policy if exists admins_can_manage_all_conduct_scores on public.conduct_scores_old_20250923;
drop policy if exists conduct_scores_manage_policy on public.conduct_scores_old_20250923;

drop policy if exists "Admins can manage exam classes" on public.exam_classes;
drop policy if exists admin_users_can_modify_exam_classes on public.exam_classes;

drop policy if exists "Admins can manage exam subjects" on public.exam_subjects;
drop policy if exists admin_users_can_modify_exam_subjects on public.exam_subjects;

drop policy if exists "Admins can manage all exams" on public.exams;
drop policy if exists admin_users_can_modify_exams on public.exams;
drop policy if exists exams_admin_policy on public.exams;

drop policy if exists admins_can_manage_all_exam_results on public.exam_results;
drop policy if exists exam_results_manage_policy on public.exam_results;

drop policy if exists grading_systems_delete on public.grading_systems;
drop policy if exists grading_systems_insert on public.grading_systems;
drop policy if exists grading_systems_select on public.grading_systems;
drop policy if exists grading_systems_update on public.grading_systems;

drop policy if exists "Admins can update notification status" on public.juz_test_notifications;
drop policy if exists "Admins can view all notifications" on public.juz_test_notifications;

drop policy if exists "Admins can manage all juz tests" on public.juz_tests;

drop policy if exists admin_manage_parent_balance_adjustments on public.parent_balance_adjustments;

drop policy if exists admin_can_manage_payment_events on public.payment_events;
drop policy if exists admin_can_manage_fee_catalog on public.payment_fee_catalog;
drop policy if exists admin_can_manage_payment_line_items on public.payment_line_items;
drop policy if exists admin_can_manage_payments on public.payments;

drop policy if exists admin_can_manage_child_fee_assignments on public.child_fee_assignments;
