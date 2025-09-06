-- SUPABASE EXAM SYSTEM MIGRATION
-- This creates the exam tables needed for the admin/exam functionality
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

-- Enable Row Level Security
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Exams
CREATE POLICY "Admins can manage all exams" ON public.exams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Teachers can view exams" ON public.exams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' IN ('teacher', 'admin')
    )
  );

-- RLS Policies for Subjects
CREATE POLICY "All authenticated users can view subjects" ON public.subjects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage subjects" ON public.subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Classes
CREATE POLICY "All authenticated users can view classes" ON public.classes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage classes" ON public.classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Exam Subjects
CREATE POLICY "Users can view exam subjects" ON public.exam_subjects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage exam subjects" ON public.exam_subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Exam Classes  
CREATE POLICY "Users can view exam classes" ON public.exam_classes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage exam classes" ON public.exam_classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Exam Results
CREATE POLICY "Teachers can manage results for their classes" ON public.exam_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' IN ('teacher', 'admin')
    )
  );

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

-- Create functions for automatic grade calculation
CREATE OR REPLACE FUNCTION calculate_exam_grade(score DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF score >= 85 THEN RETURN 'A';
  ELSIF score >= 75 THEN RETURN 'A-';
  ELSIF score >= 65 THEN RETURN 'B+';
  ELSIF score >= 55 THEN RETURN 'B';
  ELSIF score >= 45 THEN RETURN 'C+';
  ELSIF score >= 35 THEN RETURN 'C';
  ELSIF score >= 25 THEN RETURN 'D';
  ELSE RETURN 'F';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate grade and final score
CREATE OR REPLACE FUNCTION update_exam_result_trigger()
RETURNS TRIGGER AS $$
DECLARE
  conduct_weight INTEGER;
  academic_weight INTEGER;
BEGIN
  -- Get conduct weightage for this exam-class combination
  SELECT COALESCE(ec.conduct_weightage, 0) INTO conduct_weight
  FROM public.exam_classes ec
  JOIN public.students s ON s.class_id = ec.class_id
  WHERE ec.exam_id = NEW.exam_id AND s.id = NEW.student_id;
  
  -- Calculate academic weight (100 - conduct weight)
  academic_weight := 100 - COALESCE(conduct_weight, 0);
  
  -- Calculate final score as weighted average
  IF NEW.academic_score IS NOT NULL THEN
    NEW.final_score := (
      (COALESCE(NEW.academic_score, 0) * academic_weight / 100.0) +
      (COALESCE(NEW.conduct_score, 0) * conduct_weight / 100.0)
    );
    NEW.grade := calculate_exam_grade(NEW.final_score);
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_results_calculation_trigger
  BEFORE INSERT OR UPDATE ON public.exam_results
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_result_trigger();

-- Add some sample exam-class and exam-subject relationships
DO $$
DECLARE
  exam_id UUID;
  class_id UUID;
  subject_id UUID;
BEGIN
  -- Get SPM Trial 2025 exam ID
  SELECT id INTO exam_id FROM public.exams WHERE name = 'SPM Trial 2025' LIMIT 1;
  
  IF exam_id IS NOT NULL THEN
    -- Add all classes to SPM Trial 2025 with default 20% conduct weightage
    FOR class_id IN SELECT id FROM public.classes LOOP
      INSERT INTO public.exam_classes (exam_id, class_id, conduct_weightage)
      VALUES (exam_id, class_id, 20)
      ON CONFLICT (exam_id, class_id) DO NOTHING;
    END LOOP;
    
    -- Add all subjects to SPM Trial 2025
    FOR subject_id IN SELECT id FROM public.subjects LOOP
      INSERT INTO public.exam_subjects (exam_id, subject_id)
      VALUES (exam_id, subject_id)
      ON CONFLICT (exam_id, subject_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;