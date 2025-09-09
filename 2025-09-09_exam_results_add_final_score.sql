-- Migration: Add final_score to exam_results and keep it in sync
-- Run this in Supabase SQL Editor (or psql) on your project.

-- 1) Add column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'exam_results'
      AND column_name  = 'final_score'
  ) THEN
    ALTER TABLE public.exam_results
      ADD COLUMN final_score numeric; -- use numeric to support decimals
  END IF;
END$$;

-- 2) Backfill existing rows (final_score := mark where null)
UPDATE public.exam_results
SET final_score = mark
WHERE final_score IS NULL;

-- 3) Ensure NEW.final_score is always present on insert/update
CREATE OR REPLACE FUNCTION public.exam_results_set_final_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If client doesn't provide final_score, default it to mark
  IF NEW.final_score IS NULL THEN
    NEW.final_score := NEW.mark;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_results_set_final_score ON public.exam_results;
CREATE TRIGGER trg_exam_results_set_final_score
BEFORE INSERT OR UPDATE ON public.exam_results
FOR EACH ROW EXECUTE FUNCTION public.exam_results_set_final_score();

-- 4) (Optional but recommended) Ensure a proper unique constraint exists
--    covering exam + student + subject to support upserts from the app.
DO $$
DECLARE
  c_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'public.exam_results'::regclass
    AND    contype  = 'u'
    AND    conname  = 'exam_results_exam_id_student_id_subject_id_key'
  ) INTO c_exists;

  IF NOT c_exists THEN
    -- Create the unique constraint if it doesn't exist
    ALTER TABLE public.exam_results
      ADD CONSTRAINT exam_results_exam_id_student_id_subject_id_key
      UNIQUE (exam_id, student_id, subject_id);
  END IF;
END$$;

-- 5) Quick verification (safe to run multiple times)
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='exam_results'
-- ORDER BY ordinal_position;

