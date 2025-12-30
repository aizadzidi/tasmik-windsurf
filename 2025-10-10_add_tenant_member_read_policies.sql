-- Adds permissive SELECT policies for tenant members on reference/config tables.
-- Run this in Supabase SQL editor (write access required).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subjects'
      and policyname = 'tenant_member_read_subjects'
  ) then
    create policy tenant_member_read_subjects
      on public.subjects
      for select
      to authenticated
      using (exists (
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
      and tablename = 'grading_systems'
      and policyname = 'tenant_member_read_grading_systems'
  ) then
    create policy tenant_member_read_grading_systems
      on public.grading_systems
      for select
      to authenticated
      using (exists (
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
      and tablename = 'class_subjects'
      and policyname = 'tenant_member_read_class_subjects'
  ) then
    create policy tenant_member_read_class_subjects
      on public.class_subjects
      for select
      to authenticated
      using (exists (
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
      and tablename = 'exam_subjects'
      and policyname = 'tenant_member_read_exam_subjects'
  ) then
    create policy tenant_member_read_exam_subjects
      on public.exam_subjects
      for select
      to authenticated
      using (exists (
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
      and tablename = 'exam_classes'
      and policyname = 'tenant_member_read_exam_classes'
  ) then
    create policy tenant_member_read_exam_classes
      on public.exam_classes
      for select
      to authenticated
      using (exists (
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
      and tablename = 'exam_class_subjects'
      and policyname = 'tenant_member_read_exam_class_subjects'
  ) then
    create policy tenant_member_read_exam_class_subjects
      on public.exam_class_subjects
      for select
      to authenticated
      using (exists (
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
      and tablename = 'lesson_class_subject_year'
      and policyname = 'tenant_member_read_lesson_class_subject_year'
  ) then
    create policy tenant_member_read_lesson_class_subject_year
      on public.lesson_class_subject_year
      for select
      to authenticated
      using (exists (
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
      and tablename = 'payment_fee_catalog'
      and policyname = 'tenant_member_read_payment_fee_catalog'
  ) then
    create policy tenant_member_read_payment_fee_catalog
      on public.payment_fee_catalog
      for select
      to authenticated
      using (exists (
        select 1 from public.user_profiles up
        where up.user_id = auth.uid() and up.tenant_id = payment_fee_catalog.tenant_id
      ));
  end if;
end;
$$;
