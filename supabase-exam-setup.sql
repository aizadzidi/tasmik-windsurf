-- Supabase Setup for Exam/Quiz Management System
-- Run this script in your Supabase SQL Editor

-- First, update existing students table to add class_id
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_assigned_teacher_id ON public.students(assigned_teacher_id);

-- 1. Classes table
CREATE TABLE public.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Subjects table
CREATE TABLE public.subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Teacher assignments (many-to-many: teachers can teach multiple classes/subjects)
CREATE TABLE public.teacher_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) NOT NULL,
  class_id UUID REFERENCES public.classes(id) NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(teacher_id, class_id, subject_id)
);

-- 4. Assessments (Exams/Quizzes)
CREATE TABLE public.assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Exam', 'Quiz')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Assessment assignments (which classes/subjects an assessment covers)
CREATE TABLE public.assessment_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES public.assessments(id) NOT NULL,
  class_id UUID REFERENCES public.classes(id) NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assessment_id, class_id, subject_id)
);

-- 6. Student marks
CREATE TABLE public.student_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES public.assessments(id) NOT NULL,
  student_id UUID REFERENCES public.students(id) NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) NOT NULL,
  mark DECIMAL(5,2),
  grade TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assessment_id, student_id, subject_id)
);

-- 7. Student conduct (only for exams)
CREATE TABLE public.student_conduct (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES public.assessments(id) NOT NULL,
  student_id UUID REFERENCES public.students(id) NOT NULL,
  leadership INTEGER CHECK (leadership >= 0 AND leadership <= 100),
  social INTEGER CHECK (social >= 0 AND social <= 100),
  akhlak INTEGER CHECK (akhlak >= 0 AND akhlak <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assessment_id, student_id)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_conduct ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Classes (readable by all authenticated users)
CREATE POLICY "Classes are viewable by authenticated users" ON public.classes
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS Policies for Subjects (readable by all authenticated users)
CREATE POLICY "Subjects are viewable by authenticated users" ON public.subjects
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS Policies for Teacher Assignments
CREATE POLICY "Teachers can view their own assignments" ON public.teacher_assignments
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "Admins can manage all teacher assignments" ON public.teacher_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Assessments
CREATE POLICY "Users can view assessments for their classes" ON public.assessments
  FOR SELECT USING (
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
    OR
    -- Teachers can see assessments for their assigned classes
    EXISTS (
      SELECT 1 FROM public.assessment_assignments aa
      JOIN public.teacher_assignments ta ON ta.class_id = aa.class_id AND ta.subject_id = aa.subject_id
      WHERE aa.assessment_id = assessments.id
      AND ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Admins can create assessments" ON public.assessments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Assessment Assignments
CREATE POLICY "Assessment assignments are viewable by relevant users" ON public.assessment_assignments
  FOR SELECT USING (
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
    OR
    -- Teachers can see assignments for their classes
    EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      WHERE ta.class_id = assessment_assignments.class_id
      AND ta.subject_id = assessment_assignments.subject_id
      AND ta.teacher_id = auth.uid()
    )
  );

-- RLS Policies for Student Marks
CREATE POLICY "Teachers can manage marks for their students" ON public.student_marks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_marks.student_id
      AND (
        -- Student assigned directly to teacher
        s.assigned_teacher_id = auth.uid()
        OR
        -- Student in class taught by teacher for this subject
        EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.class_id = s.class_id
          AND ta.subject_id = student_marks.subject_id
          AND ta.teacher_id = auth.uid()
        )
      )
    )
    OR
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for Student Conduct
CREATE POLICY "Teachers can manage conduct for their students" ON public.student_conduct
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_conduct.student_id
      AND (
        -- Student assigned directly to teacher
        s.assigned_teacher_id = auth.uid()
        OR
        -- Student in class taught by teacher
        EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.class_id = s.class_id
          AND ta.teacher_id = auth.uid()
        )
      )
    )
    OR
    -- Admins can see all
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Insert seed data for classes
INSERT INTO public.classes (name) VALUES 
  ('Bukhari'),
  ('Muslim'),
  ('Darimi'),
  ('Tirmidhi'),
  ('Abu Dawood'),
  ('Tabrani'),
  ('Bayhaqi'),
  ('Nasaie'),
  ('Ibn Majah');

-- Insert seed data for subjects (in A-Z order as requested)
INSERT INTO public.subjects (name) VALUES 
  ('Art'),
  ('B. Melayu'),
  ('Bahasa Arab SPM'),
  ('Biology'),
  ('Chemistry'),
  ('English'),
  ('Kitabah'),
  ('PAI'),
  ('PQS'),
  ('PSI'),
  ('Physic'),
  ('Qiraah'),
  ('Sejarah');

-- Create function to auto-calculate grade from mark
CREATE OR REPLACE FUNCTION calculate_grade(mark DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF mark >= 85 THEN RETURN 'A';
  ELSIF mark >= 75 THEN RETURN 'A-';
  ELSIF mark >= 65 THEN RETURN 'B';
  ELSIF mark >= 55 THEN RETURN 'C';
  ELSIF mark >= 45 THEN RETURN 'D';
  ELSE RETURN 'F';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update grade when mark changes
CREATE OR REPLACE FUNCTION update_grade_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.grade = calculate_grade(NEW.mark);
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_marks_grade_trigger
  BEFORE INSERT OR UPDATE ON public.student_marks
  FOR EACH ROW
  EXECUTE FUNCTION update_grade_trigger();

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_conduct_updated_at_trigger
  BEFORE UPDATE ON public.student_conduct
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
