-- FIXED EXAM SYSTEM DATABASE SETUP
-- This creates exam tables with DISABLED RLS to match the emergency fix pattern
-- Run this in Supabase SQL Editor

-- 1. Exams table
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'formal' CHECK (type IN ('formal', 'quiz', 'midterm', 'final')),
  exam_start_date DATE NOT NULL,
  exam_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Subjects table (if not exists)
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Classes table (if not exists) 
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Exam-Subject junction table
CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, subject_id)
);

-- 5. Exam-Class junction table with conduct weightage
CREATE TABLE IF NOT EXISTS public.exam_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  conduct_weightage INTEGER DEFAULT 0 CHECK (conduct_weightage >= 0 AND conduct_weightage <= 50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, class_id)
);

-- 6. Exam Results table (for student exam scores)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_score DECIMAL(5,2) CHECK (academic_score >= 0 AND academic_score <= 100),
  conduct_score DECIMAL(5,2) CHECK (conduct_score >= 0 AND conduct_score <= 100),
  final_score DECIMAL(5,2) CHECK (final_score >= 0 AND final_score <= 100),
  grade TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, student_id, subject_id)
);

-- DISABLE RLS on all exam tables to match the emergency fix pattern
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results DISABLE ROW LEVEL SECURITY;

-- Drop any existing problematic RLS policies
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies 
           WHERE tablename IN ('exams', 'subjects', 'classes', 'exam_subjects', 'exam_classes', 'exam_results')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Insert seed data for subjects (if not exists)
INSERT INTO public.subjects (name) VALUES 
  ('Math'),
  ('English'), 
  ('Science'),
  ('BM'),
  ('BI'),
  ('Quran'),
  ('Arabic'),
  ('History')
ON CONFLICT (name) DO NOTHING;

-- Insert seed data for classes (Islamic classes - if not exists)
INSERT INTO public.classes (name) VALUES 
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

-- Insert sample exam data
INSERT INTO public.exams (name, type, exam_start_date, exam_end_date) VALUES 
  ('SPM Trial 2025', 'formal', '2025-09-15', '2025-09-20'),
  ('Midterm Exam', 'midterm', '2025-09-10', '2025-09-12'),
  ('Final Exam', 'final', '2025-12-01', '2025-12-05'),
  ('Quiz 1', 'quiz', '2025-09-05', '2025-09-05')
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exams_type ON public.exams(type);
CREATE INDEX IF NOT EXISTS idx_exams_start_date ON public.exams(exam_start_date);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam_id ON public.exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_subject_id ON public.exam_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_exam_id ON public.exam_classes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_class_id ON public.exam_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON public.exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON public.exam_results(student_id);

-- Verify setup
SELECT 'Exam System Setup Complete!' as status;

SELECT 'Table Status:' as info;
SELECT 
  tablename,
  CASE WHEN rowsecurity = false THEN '✅ RLS DISABLED - WORKING' ELSE '❌ RLS ENABLED - PROBLEMATIC' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('exams', 'subjects', 'classes', 'exam_subjects', 'exam_classes', 'exam_results')
ORDER BY tablename;

-- Show data counts
SELECT 'Data Counts:' as info;
SELECT 'Subjects' as table_name, COUNT(*) as count FROM public.subjects
UNION ALL
SELECT 'Classes', COUNT(*) FROM public.classes
UNION ALL
SELECT 'Exams', COUNT(*) FROM public.exams;