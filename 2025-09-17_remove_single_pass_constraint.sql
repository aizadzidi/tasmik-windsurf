-- Remove the "only one passed juz per student" restriction
-- Run in Supabase SQL editor

-- 1) Drop any unique constraints on (student_id, juz_number) in juz_tests
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.juz_tests'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%student_id%'
    AND pg_get_constraintdef(oid) ILIKE '%juz_number%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.juz_tests DROP CONSTRAINT %I;', constraint_name);
  END IF;
END $$;

-- 2) Drop any partial unique index that enforces passed = TRUE for the same columns
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'juz_tests'
      AND indexdef ILIKE '%student_id%'
      AND indexdef ILIKE '%juz_number%'
      AND indexdef ILIKE '%unique%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I;', idx.indexname);
  END LOOP;
END $$;

-- 3) Optional: add a non-unique index to keep lookups fast
CREATE INDEX IF NOT EXISTS idx_juz_tests_student_juz
  ON public.juz_tests(student_id, juz_number);
