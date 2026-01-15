-- Add CRM and extended info fields to students.
-- Run via Supabase SQL editor or psql as coordinated.

alter table public.students
  add column if not exists record_type text default 'student',
  add column if not exists crm_stage text default 'active',
  add column if not exists crm_status_reason text,
  add column if not exists identification_number text,
  add column if not exists address text,
  add column if not exists parent_name text,
  add column if not exists parent_contact_number text,
  add column if not exists parent_occupation text,
  add column if not exists household_income text,
  add column if not exists interviewer_remark text;

update public.students
set record_type = coalesce(record_type, 'student'),
    crm_stage = coalesce(crm_stage, 'active');

create index if not exists students_record_type_idx
  on public.students (record_type);

create index if not exists students_crm_stage_idx
  on public.students (crm_stage);
