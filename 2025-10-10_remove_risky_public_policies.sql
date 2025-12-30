-- Removes overly permissive policies that can leak cross-tenant data.
-- Run this in Supabase SQL editor (write access required).

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'classes'
      and policyname = 'All authenticated users can view classes'
  ) then
    execute 'drop policy "All authenticated users can view classes" on public.classes';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'classes'
      and policyname = 'public_read_classes'
  ) then
    execute 'drop policy public_read_classes on public.classes';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subjects'
      and policyname = 'All authenticated users can view subjects'
  ) then
    execute 'drop policy "All authenticated users can view subjects" on public.subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subjects'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subjects'
      and policyname = 'public_read_subjects'
  ) then
    execute 'drop policy public_read_subjects on public.subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subjects'
      and policyname = 'subjects_select_policy'
  ) then
    execute 'drop policy subjects_select_policy on public.subjects';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_subtopic_progress'
      and policyname = 'read_all'
  ) then
    execute 'drop policy read_all on public.lesson_subtopic_progress';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exams'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.exams';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exams'
      and policyname = 'exams_select_policy'
  ) then
    execute 'drop policy exams_select_policy on public.exams';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exams'
      and policyname = 'public_read_exams'
  ) then
    execute 'drop policy public_read_exams on public.exams';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_classes'
      and policyname = 'Users can view exam classes'
  ) then
    execute 'drop policy "Users can view exam classes" on public.exam_classes';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_classes'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.exam_classes';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_classes'
      and policyname = 'exam_classes_select_policy'
  ) then
    execute 'drop policy exam_classes_select_policy on public.exam_classes';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_classes'
      and policyname = 'public_read_exam_classes'
  ) then
    execute 'drop policy public_read_exam_classes on public.exam_classes';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_subjects'
      and policyname = 'Users can view exam subjects'
  ) then
    execute 'drop policy "Users can view exam subjects" on public.exam_subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_subjects'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.exam_subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_subjects'
      and policyname = 'exam_subjects_select_policy'
  ) then
    execute 'drop policy exam_subjects_select_policy on public.exam_subjects';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_subjects'
      and policyname = 'public_read_exam_subjects'
  ) then
    execute 'drop policy public_read_exam_subjects on public.exam_subjects';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_results'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.exam_results';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exam_results'
      and policyname = 'exam_results_select_policy'
  ) then
    execute 'drop policy exam_results_select_policy on public.exam_results';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conduct_scores_old_20250923'
      and policyname = 'authenticated_users_all'
  ) then
    execute 'drop policy authenticated_users_all on public.conduct_scores_old_20250923';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conduct_scores_old_20250923'
      and policyname = 'conduct_scores_select_policy'
  ) then
    execute 'drop policy conduct_scores_select_policy on public.conduct_scores_old_20250923';
  end if;
end;
$$;
