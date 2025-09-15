-- Create table to configure per-class subjects for an exam
-- Run this in Supabase SQL editor or psql

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_class_subjects_exam ON public.exam_class_subjects (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_class_subjects_exam_class ON public.exam_class_subjects (exam_id, class_id);

ALTER TABLE public.exam_class_subjects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'exam_class_subjects' 
      AND policyname = 'admin_can_manage_exam_class_subjects'
  ) THEN
    CREATE POLICY "admin_can_manage_exam_class_subjects" ON public.exam_class_subjects
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'exam_class_subjects' 
      AND policyname = 'authenticated_can_read_exam_class_subjects'
  ) THEN
    CREATE POLICY "authenticated_can_read_exam_class_subjects" ON public.exam_class_subjects
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

COMMIT;

