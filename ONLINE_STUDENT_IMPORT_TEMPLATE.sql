-- Sanitized template for online student import staging.
-- Keep real source CSV and generated SQL outside git.

begin;

create temporary table _migration_ctx (
  tenant_id uuid not null
) on commit drop;

-- Replace with target tenant ID at runtime.
insert into _migration_ctx (tenant_id)
values ('00000000-0000-0000-0000-000000000000'::uuid);

create temporary table _source_input_rows (
  source_row integer,
  teacher_name text,
  course_name text,
  student_identifier text
) on commit drop;

-- Insert sanitized rows here at runtime from secure source.
-- Example:
-- insert into _source_input_rows (source_row, teacher_name, course_name, student_identifier)
-- values (1, 'Teacher A', '3x (250)', 'STUDENT-001');

-- Map source rows to existing students in tenant using secure matching rules.
-- Then insert into public.student_program_migration_staging.
-- Do not commit real source data into this repository.

commit;
