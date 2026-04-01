-- Add juz_to column for multi-juz (contiguous range) test support
-- When NULL: single juz test (backward compatible)
-- When set: test covers juz_number through juz_to
ALTER TABLE public.juz_tests
  ADD COLUMN IF NOT EXISTS juz_to smallint;
