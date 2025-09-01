-- Add support for tracking which hizb (1st or 2nd) was tested
-- Run this in Supabase SQL Editor to add hizb_number tracking

-- Add hizb_number column to juz_tests table
ALTER TABLE juz_tests ADD COLUMN IF NOT EXISTS hizb_number INTEGER CHECK (hizb_number IN (1, 2));

-- Add comment for clarity
COMMENT ON COLUMN juz_tests.hizb_number IS 'Tracks which hizb was tested when test_hizb is true: 1 for first half, 2 for second half of juz';

-- Update the unique constraint to include hizb_number
-- This allows students to have separate passed tests for each hizb of the same juz
DROP INDEX IF EXISTS idx_juz_tests_unique_passed;
CREATE UNIQUE INDEX IF NOT EXISTS idx_juz_tests_unique_passed_with_hizb ON juz_tests(student_id, juz_number, COALESCE(hizb_number, 0)) 
WHERE passed = true;

-- Verification
SELECT 'hizb_number column added successfully' as status 
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'juz_tests' 
  AND column_name = 'hizb_number'
);