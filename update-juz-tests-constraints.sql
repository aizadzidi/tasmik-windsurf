-- UPDATE JUZ TESTS CONSTRAINTS
-- Run this to update the existing table constraints to allow scores of 5 for tajweed and recitation

-- Drop existing constraints
ALTER TABLE juz_tests DROP CONSTRAINT IF EXISTS juz_tests_tajweed_score_check;
ALTER TABLE juz_tests DROP CONSTRAINT IF EXISTS juz_tests_recitation_score_check;

-- Add new constraints allowing scores up to 5
ALTER TABLE juz_tests ADD CONSTRAINT juz_tests_tajweed_score_check CHECK (tajweed_score >= 0 AND tajweed_score <= 5);
ALTER TABLE juz_tests ADD CONSTRAINT juz_tests_recitation_score_check CHECK (recitation_score >= 0 AND recitation_score <= 5);

-- Update default values
ALTER TABLE juz_tests ALTER COLUMN tajweed_score SET DEFAULT 5;
ALTER TABLE juz_tests ALTER COLUMN recitation_score SET DEFAULT 5;