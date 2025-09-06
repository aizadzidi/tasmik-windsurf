-- EXAM SYSTEM DATABASE SETUP
-- This script adds exam functionality to the existing Tasmik database
-- Run this after the main supabase-complete-setup.sql

-- =====================================================
-- EXAM SYSTEM TABLES
-- =====================================================

-- 1. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default subjects
INSERT INTO subjects (name) VALUES 
  ('Math'),
  ('English'),
  ('Science'),
  ('BM'),
  ('BI'),
  ('Quran'),
  ('Arabic'),
  ('History')
ON CONFLICT (name) DO NOTHING;

-- Subjects RLS Policies
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_read_subjects" ON subjects;
CREATE POLICY "authenticated_users_can_read_subjects" ON subjects
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_users_can_modify_subjects" ON subjects;
CREATE POLICY "admin_users_can_modify_subjects" ON subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 2. Exams Table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'formal', -- 'formal', 'quiz', 'test'
  exam_start_date DATE NOT NULL,
  exam_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exams RLS Policies
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_read_exams" ON exams;
CREATE POLICY "authenticated_users_can_read_exams" ON exams
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_users_can_modify_exams" ON exams;
CREATE POLICY "admin_users_can_modify_exams" ON exams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 3. Exam-Subjects Junction Table
CREATE TABLE IF NOT EXISTS exam_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, subject_id)
);

-- Exam-Subjects indexes
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam_id ON exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_subject_id ON exam_subjects(subject_id);

-- Exam-Subjects RLS Policies
ALTER TABLE exam_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_read_exam_subjects" ON exam_subjects;
CREATE POLICY "authenticated_users_can_read_exam_subjects" ON exam_subjects
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_users_can_modify_exam_subjects" ON exam_subjects;
CREATE POLICY "admin_users_can_modify_exam_subjects" ON exam_subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 4. Exam-Classes Junction Table (with conduct weightage)
CREATE TABLE IF NOT EXISTS exam_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  conduct_weightage INTEGER DEFAULT 0 CHECK (conduct_weightage >= 0 AND conduct_weightage <= 50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, class_id)
);

-- Exam-Classes indexes
CREATE INDEX IF NOT EXISTS idx_exam_classes_exam_id ON exam_classes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_class_id ON exam_classes(class_id);

-- Exam-Classes RLS Policies
ALTER TABLE exam_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_read_exam_classes" ON exam_classes;
CREATE POLICY "authenticated_users_can_read_exam_classes" ON exam_classes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_users_can_modify_exam_classes" ON exam_classes;
CREATE POLICY "admin_users_can_modify_exam_classes" ON exam_classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 5. Exam Results Table
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  mark INTEGER CHECK (mark >= 0 AND mark <= 100),
  grade TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, student_id, subject_id)
);

-- Exam Results indexes
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_subject_id ON exam_results(subject_id);

-- Exam Results RLS Policies
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parents_can_view_children_exam_results" ON exam_results;
CREATE POLICY "parents_can_view_children_exam_results" ON exam_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = exam_results.student_id 
      AND students.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teachers_can_view_assigned_student_exam_results" ON exam_results;
CREATE POLICY "teachers_can_view_assigned_student_exam_results" ON exam_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = exam_results.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teachers_can_manage_assigned_student_exam_results" ON exam_results;
CREATE POLICY "teachers_can_manage_assigned_student_exam_results" ON exam_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = exam_results.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_can_manage_all_exam_results" ON exam_results;
CREATE POLICY "admins_can_manage_all_exam_results" ON exam_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 6. Conduct Scores Table
CREATE TABLE IF NOT EXISTS conduct_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_result_id UUID REFERENCES exam_results(id) ON DELETE CASCADE,
  discipline INTEGER DEFAULT 0 CHECK (discipline >= 0 AND discipline <= 100),
  effort INTEGER DEFAULT 0 CHECK (effort >= 0 AND effort <= 100),
  participation INTEGER DEFAULT 0 CHECK (participation >= 0 AND participation <= 100),
  motivational_level INTEGER DEFAULT 0 CHECK (motivational_level >= 0 AND motivational_level <= 100),
  character INTEGER DEFAULT 0 CHECK (character >= 0 AND character <= 100),
  leadership INTEGER DEFAULT 0 CHECK (leadership >= 0 AND leadership <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_result_id)
);

-- Conduct Scores indexes
CREATE INDEX IF NOT EXISTS idx_conduct_scores_exam_result_id ON conduct_scores(exam_result_id);

-- Conduct Scores RLS Policies
ALTER TABLE conduct_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parents_can_view_children_conduct_scores" ON conduct_scores;
CREATE POLICY "parents_can_view_children_conduct_scores" ON conduct_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exam_results
      JOIN students ON students.id = exam_results.student_id
      WHERE exam_results.id = conduct_scores.exam_result_id
      AND students.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teachers_can_view_assigned_student_conduct_scores" ON conduct_scores;
CREATE POLICY "teachers_can_view_assigned_student_conduct_scores" ON conduct_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exam_results
      JOIN students ON students.id = exam_results.student_id
      WHERE exam_results.id = conduct_scores.exam_result_id
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "teachers_can_manage_assigned_student_conduct_scores" ON conduct_scores;
CREATE POLICY "teachers_can_manage_assigned_student_conduct_scores" ON conduct_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM exam_results
      JOIN students ON students.id = exam_results.student_id
      WHERE exam_results.id = conduct_scores.exam_result_id
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_can_manage_all_conduct_scores" ON conduct_scores;
CREATE POLICY "admins_can_manage_all_conduct_scores" ON conduct_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Verify exam system setup
SELECT 'Exam system verification:' as info;

SELECT 'Subjects table:' as table_name, COUNT(*) as count FROM subjects
UNION ALL
SELECT 'Exams table:', COUNT(*) FROM exams
UNION ALL
SELECT 'Exam-Subjects table:', COUNT(*) FROM exam_subjects
UNION ALL
SELECT 'Exam-Classes table:', COUNT(*) FROM exam_classes
UNION ALL
SELECT 'Exam-Results table:', COUNT(*) FROM exam_results
UNION ALL
SELECT 'Conduct-Scores table:', COUNT(*) FROM conduct_scores;

SELECT 'Available subjects:' as info;
SELECT id, name FROM subjects ORDER BY name;

SELECT 'Exam system setup complete!' as status;