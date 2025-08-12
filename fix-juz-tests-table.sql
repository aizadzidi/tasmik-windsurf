-- FIX JUZ TESTS TABLE - COMPREHENSIVE UPDATE
-- Run this to fix all issues with the juz_tests table

-- 1. Drop the test_surah column completely
ALTER TABLE juz_tests DROP COLUMN IF EXISTS test_surah;

-- 2. Update constraints for tajweed and recitation scores
ALTER TABLE juz_tests DROP CONSTRAINT IF EXISTS juz_tests_tajweed_score_check;
ALTER TABLE juz_tests DROP CONSTRAINT IF EXISTS juz_tests_recitation_score_check;
ALTER TABLE juz_tests ADD CONSTRAINT juz_tests_tajweed_score_check CHECK (tajweed_score >= 0 AND tajweed_score <= 5);
ALTER TABLE juz_tests ADD CONSTRAINT juz_tests_recitation_score_check CHECK (recitation_score >= 0 AND recitation_score <= 5);

-- 3. Set proper defaults
ALTER TABLE juz_tests ALTER COLUMN test_juz SET DEFAULT true;
ALTER TABLE juz_tests ALTER COLUMN test_hizb SET DEFAULT false;
ALTER TABLE juz_tests ALTER COLUMN tajweed_score SET DEFAULT 0;
ALTER TABLE juz_tests ALTER COLUMN recitation_score SET DEFAULT 0;
ALTER TABLE juz_tests ALTER COLUMN passed SET DEFAULT false;
ALTER TABLE juz_tests ALTER COLUMN should_repeat SET DEFAULT false;

-- 4. Make sure all text fields allow NULL
ALTER TABLE juz_tests ALTER COLUMN halaqah_name DROP NOT NULL;
ALTER TABLE juz_tests ALTER COLUMN examiner_name DROP NOT NULL;
ALTER TABLE juz_tests ALTER COLUMN remarks DROP NOT NULL;

-- 5. Verify table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'juz_tests' 
ORDER BY ordinal_position;