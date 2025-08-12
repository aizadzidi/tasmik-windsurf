-- REMOVE SURAH CATEGORY - DATABASE UPDATE
-- Run this to remove the test_surah column from existing juz_tests table

-- Drop the test_surah column if it exists
ALTER TABLE juz_tests DROP COLUMN IF EXISTS test_surah;

-- Update default for test_juz to be true (default test type)
ALTER TABLE juz_tests ALTER COLUMN test_juz SET DEFAULT true;