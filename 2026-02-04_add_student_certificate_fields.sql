-- Add certificate detail fields to students for school-leaving certificates.
-- Run via Supabase SQL editor or psql as coordinated.

alter table public.students
  add column if not exists student_id_no text,
  add column if not exists date_of_birth date,
  add column if not exists birth_place text,
  add column if not exists gender text,
  add column if not exists religion text,
  add column if not exists admission_date date,
  add column if not exists leaving_date date,
  add column if not exists admission_age text,
  add column if not exists leaving_age text,
  add column if not exists reason_leaving text,
  add column if not exists conduct_record text,
  add column if not exists attendance_record text,
  add column if not exists club_sport text,
  add column if not exists club_position text,
  add column if not exists participation_achievement text,
  add column if not exists hafazan_surah text,
  add column if not exists hafazan_page text,
  add column if not exists hafazan_ayah text,
  add column if not exists hafazan_grade text;
