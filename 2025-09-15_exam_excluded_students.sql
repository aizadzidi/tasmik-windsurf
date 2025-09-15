-- Create table to store per-exam student exclusions
-- Run this in Supabase SQL editor or psql

BEGIN;

-- Table: exam_excluded_students
CREATE TABLE IF NOT EXISTS public.exam_excluded_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure a student is excluded at most once per exam
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_excluded_students_exam_student
  ON public.exam_excluded_students (exam_id, student_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_exam_excluded_students_exam_id
  ON public.exam_excluded_students (exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_excluded_students_class_id
  ON public.exam_excluded_students (class_id);

-- Enable RLS (policies can be refined as needed)
ALTER TABLE public.exam_excluded_students ENABLE ROW LEVEL SECURITY;

-- Allow admins full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'exam_excluded_students' 
      AND policyname = 'admin_can_manage_exam_excluded_students'
  ) THEN
    CREATE POLICY "admin_can_manage_exam_excluded_students" ON public.exam_excluded_students
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      );
  END IF;
END $$;

-- Allow authenticated users to read exclusions (optional; frontend uses service role via API)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'exam_excluded_students' 
      AND policyname = 'authenticated_can_read_exam_excluded_students'
  ) THEN
    CREATE POLICY "authenticated_can_read_exam_excluded_students" ON public.exam_excluded_students
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

COMMIT;

