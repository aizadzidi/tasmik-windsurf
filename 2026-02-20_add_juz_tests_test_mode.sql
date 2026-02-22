-- Add explicit test mode for Juz tests.
-- Supports: PMMM (legacy default) and normal_memorization (Without PMMM).

ALTER TABLE public.juz_tests
  ADD COLUMN IF NOT EXISTS test_mode text;

UPDATE public.juz_tests
SET test_mode = 'pmmm'
WHERE test_mode IS NULL;

ALTER TABLE public.juz_tests
  ALTER COLUMN test_mode SET DEFAULT 'pmmm';

ALTER TABLE public.juz_tests
  ALTER COLUMN test_mode SET NOT NULL;

ALTER TABLE public.juz_tests
  DROP CONSTRAINT IF EXISTS juz_tests_test_mode_check;

ALTER TABLE public.juz_tests
  ADD CONSTRAINT juz_tests_test_mode_check
  CHECK (test_mode IN ('pmmm', 'normal_memorization'));
