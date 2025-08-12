-- JUZ TESTS FEATURE - DATABASE SETUP
-- This script adds Juz Test tracking functionality to the existing Tasmik system
-- Run this in Supabase SQL Editor after the main setup is complete

-- =====================================================
-- JUZ TESTS TABLE
-- =====================================================

-- Create juz_tests table
CREATE TABLE IF NOT EXISTS juz_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  juz_number INTEGER NOT NULL CHECK (juz_number >= 1 AND juz_number <= 30),
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Test Details
  examiner_id UUID REFERENCES users(id),
  halaqah_name TEXT,
  
  -- Section 1: Page Range & Test Categories
  page_from INTEGER,
  page_to INTEGER,
  test_juz BOOLEAN DEFAULT true,
  test_hizb BOOLEAN DEFAULT false,
  
  -- Section 2: Detailed Scoring (stored as JSONB for flexibility)
  section2_scores JSONB DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "memorization": {"1": 5, "2": 5, "3": 5, "4": 5, "5": 5},
  --   "middle_verse": {"1": 5, "2": 0},
  --   "last_words": {"1": 5, "2": 5},
  --   "reversal_reading": {"1": 5, "2": 5, "3": 5},
  --   "page_no": {"1": 5},
  --   "verse_position": {"2": 5},
  --   "verse_number": {"3": 5},
  --   "read_verse_no": {"2": 5, "3": 5, "1": 0},
  --   "understanding": {"2": 5, "3": 0}
  -- }
  
  -- Section 2: Summary Scores
  tajweed_score INTEGER DEFAULT 5 CHECK (tajweed_score >= 0 AND tajweed_score <= 5),
  recitation_score INTEGER DEFAULT 5 CHECK (recitation_score >= 0 AND recitation_score <= 5),
  total_percentage INTEGER CHECK (total_percentage >= 0 AND total_percentage <= 100),
  
  -- Section 3: Results
  passed BOOLEAN DEFAULT false,
  should_repeat BOOLEAN DEFAULT false,
  examiner_name TEXT,
  remarks TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_juz_tests_student_id ON juz_tests(student_id);
CREATE INDEX IF NOT EXISTS idx_juz_tests_juz_number ON juz_tests(juz_number);
CREATE INDEX IF NOT EXISTS idx_juz_tests_test_date ON juz_tests(test_date);
CREATE INDEX IF NOT EXISTS idx_juz_tests_passed ON juz_tests(passed);

-- Add unique constraint to prevent duplicate tests for same student-juz combination
-- But allow retests by making it conditional on passed=false
CREATE UNIQUE INDEX IF NOT EXISTS idx_juz_tests_unique_passed ON juz_tests(student_id, juz_number) 
WHERE passed = true;

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE juz_tests ENABLE ROW LEVEL SECURITY;

-- Parents can view their children's juz test results
DROP POLICY IF EXISTS "Parents can view children juz tests" ON juz_tests;
CREATE POLICY "Parents can view children juz tests" ON juz_tests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = juz_tests.student_id 
      AND students.parent_id = auth.uid()
    )
  );

-- Teachers can view juz tests for their assigned students
DROP POLICY IF EXISTS "Teachers can view assigned student juz tests" ON juz_tests;
CREATE POLICY "Teachers can view assigned student juz tests" ON juz_tests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = juz_tests.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- Teachers can insert/update juz tests for their assigned students
DROP POLICY IF EXISTS "Teachers can manage assigned student juz tests" ON juz_tests;
CREATE POLICY "Teachers can manage assigned student juz tests" ON juz_tests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = juz_tests.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- Admins can view and manage all juz tests
DROP POLICY IF EXISTS "Admins can manage all juz tests" ON juz_tests;
CREATE POLICY "Admins can manage all juz tests" ON juz_tests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate total percentage from section2_scores
CREATE OR REPLACE FUNCTION calculate_juz_test_percentage(scores JSONB, tajweed INTEGER, recitation INTEGER)
RETURNS INTEGER AS $$
DECLARE
  total_marks INTEGER := 0;
  max_marks INTEGER := 0;
  category_key TEXT;
  question_key TEXT;
  question_score INTEGER;
BEGIN
  -- Calculate scores from section2_scores
  FOR category_key IN SELECT jsonb_object_keys(scores) LOOP
    FOR question_key IN SELECT jsonb_object_keys(scores->category_key) LOOP
      question_score := (scores->category_key->>question_key)::INTEGER;
      total_marks := total_marks + question_score;
      max_marks := max_marks + 5; -- Each question is worth 5 marks
    END LOOP;
  END LOOP;
  
  -- Add tajweed and recitation scores (each out of 5)
  total_marks := total_marks + tajweed + recitation;
  max_marks := max_marks + 10; -- 5 + 5
  
  -- Calculate percentage
  IF max_marks = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN ROUND((total_marks::DECIMAL / max_marks::DECIMAL) * 100);
END;
$$ LANGUAGE plpgsql;

-- Function to get student's highest juz in memorization
CREATE OR REPLACE FUNCTION get_student_highest_memorized_juz(student_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  highest_juz INTEGER := 0;
BEGIN
  SELECT COALESCE(MAX(juzuk), 0) INTO highest_juz
  FROM reports 
  WHERE student_id = student_uuid 
  AND type = 'Tasmi'
  AND juzuk IS NOT NULL;
  
  RETURN highest_juz;
END;
$$ LANGUAGE plpgsql;

-- Function to get student's highest passed juz test
CREATE OR REPLACE FUNCTION get_student_highest_passed_juz_test(student_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  highest_juz INTEGER := 0;
BEGIN
  SELECT COALESCE(MAX(juz_number), 0) INTO highest_juz
  FROM juz_tests 
  WHERE student_id = student_uuid 
  AND passed = true;
  
  RETURN highest_juz;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SAMPLE DATA (Optional - for testing)
-- =====================================================

-- Uncomment the following lines to insert sample test data
/*
-- Insert sample juz test for testing (replace UUIDs with actual student/teacher IDs)
INSERT INTO juz_tests (
  student_id, 
  juz_number, 
  examiner_id,
  halaqah_name,
  page_from,
  page_to,
  test_juz,
  section2_scores,
  tajweed_score,
  recitation_score,
  total_percentage,
  passed,
  examiner_name,
  remarks
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual student ID
  1,
  '00000000-0000-0000-0000-000000000002', -- Replace with actual teacher ID
  'Ustazah Zainab',
  2,
  21,
  true,
  '{
    "memorization": {"1": 5, "2": 5, "3": 5, "4": 5, "5": 5},
    "middle_verse": {"1": 5, "2": 0},
    "last_words": {"1": 5, "2": 5},
    "reversal_reading": {"1": 5, "2": 5, "3": 5}
  }',
  4,
  4,
  85,
  true,
  'Ust Aizad',
  'Barakallahu feeha'
);
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if table was created successfully
SELECT 'juz_tests table created successfully' as status 
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'juz_tests');

-- Check RLS policies
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'juz_tests';

-- Check helper functions
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name LIKE '%juz%' 
AND routine_schema = 'public';