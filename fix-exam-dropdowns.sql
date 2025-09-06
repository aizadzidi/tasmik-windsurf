-- Fix exam dropdown issues in /admin/exam page
-- This script fixes both classes RLS and missing subjects table

-- =====================================================
-- STEP 1: FIX CLASSES RLS POLICIES
-- =====================================================

-- First, re-enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Classes are viewable by authenticated users" ON classes;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON classes;
DROP POLICY IF EXISTS "authenticated_users_can_read_classes" ON classes;
DROP POLICY IF EXISTS "admin_users_can_modify_classes" ON classes;

-- Create a working policy for your authentication setup
-- This allows any authenticated user to read classes
CREATE POLICY "authenticated_users_can_read_classes" ON classes
    FOR SELECT 
    USING (
        -- Allow if user is authenticated (has a valid JWT token)
        auth.uid() IS NOT NULL
    );

-- Also create policies for admin operations (insert, update, delete)
-- Only users with admin role can modify classes
CREATE POLICY "admin_users_can_modify_classes" ON classes
    FOR ALL 
    USING (
        -- Check if user has admin role in your users table
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Ensure we have the 9 Islamic classes
INSERT INTO classes (name) VALUES 
  ('Abu Dawood'),
  ('Bayhaqi'),
  ('Bukhari'),
  ('Darimi'),
  ('Ibn Majah'),
  ('Muslim'),
  ('Nasaie'),
  ('Tabrani'),
  ('Tirmidhi')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- STEP 2: CREATE SUBJECTS TABLE (MISSING)
-- =====================================================

-- Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for subjects table
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subjects
CREATE POLICY "authenticated_users_can_read_subjects" ON subjects
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_users_can_modify_subjects" ON subjects
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Insert common subjects used in the CreateExamModal
INSERT INTO subjects (name, description) VALUES 
  ('Math', 'Mathematics'),
  ('English', 'English Language'),
  ('Science', 'Science subjects'),
  ('BM', 'Bahasa Malaysia'),
  ('BI', 'Bahasa Inggeris'),
  ('Quran', 'Quran Studies'),
  ('Arabic', 'Arabic Language'),
  ('History', 'History')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- STEP 3: CREATE EXAM-RELATED TABLES
-- =====================================================

-- Create exams table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('formal', 'quiz', 'test')),
  exam_start_date DATE NOT NULL,
  exam_end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for exams table
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_can_read_exams" ON exams
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_users_can_modify_exams" ON exams
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Create exam_classes junction table
CREATE TABLE IF NOT EXISTS exam_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  conduct_weightage INTEGER DEFAULT 0 CHECK (conduct_weightage >= 0 AND conduct_weightage <= 50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, class_id)
);

-- Enable RLS for exam_classes table
ALTER TABLE exam_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_can_read_exam_classes" ON exam_classes
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_users_can_modify_exam_classes" ON exam_classes
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Create exam_subjects junction table
CREATE TABLE IF NOT EXISTS exam_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, subject_id)
);

-- Enable RLS for exam_subjects table
ALTER TABLE exam_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_can_read_exam_subjects" ON exam_subjects
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_users_can_modify_exam_subjects" ON exam_subjects
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Create exam_results table (referenced in the delete API)
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  conduct_score INTEGER DEFAULT 0 CHECK (conduct_score >= 0 AND conduct_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, student_id, subject_id)
);

-- Enable RLS for exam_results table
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_users_can_read_exam_results" ON exam_results
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_users_can_modify_exam_results" ON exam_results
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- =====================================================
-- STEP 4: TEST THE SETUP
-- =====================================================

-- Test queries to verify everything works
SELECT 'Testing class access:' as info;
SELECT id, name FROM classes ORDER BY name;

SELECT 'Testing subject access:' as info;
SELECT id, name FROM subjects ORDER BY name;

SELECT 'Testing exam access:' as info;
SELECT id, name FROM exams ORDER BY created_at DESC;