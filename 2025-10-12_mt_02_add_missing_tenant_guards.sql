-- Adds restrictive tenant guards for tables missing them.
-- Safe to run multiple times.

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
        where up.user_id = auth.uid()
          and up.tenant_id = attendance_records.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = attendance_records.tenant_id
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
        where up.user_id = auth.uid()
          and up.tenant_id = classes.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = classes.tenant_id
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
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_class_subject_year.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_class_subject_year.tenant_id
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
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_subtopic_progress.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_subtopic_progress.tenant_id
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
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_topics.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = lesson_topics.tenant_id
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
        where up.user_id = auth.uid()
          and up.tenant_id = reports.tenant_id
      ))
      with check (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid()
          and up.tenant_id = reports.tenant_id
      ));
  end if;
end;
$$;
