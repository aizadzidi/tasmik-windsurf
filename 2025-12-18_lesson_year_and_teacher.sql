-- Lesson planning renewal: academic year + subject teacher name
-- Run inside Supabase SQL editor (or via psql) as coordinated.

BEGIN;

-- Store teacher name per class/subject/year (syllabus stays in lesson_topics).
CREATE TABLE IF NOT EXISTS public.lesson_class_subject_year (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_year INTEGER NOT NULL,
  subject_teacher_name TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_lcsy_class_subject_year
  ON public.lesson_class_subject_year (class_id, subject_id, academic_year);

-- updated_at helper for the new table
CREATE OR REPLACE FUNCTION public.set_lcsy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lcsy_set_updated_at') THEN
    CREATE TRIGGER trg_lcsy_set_updated_at
      BEFORE UPDATE ON public.lesson_class_subject_year
      FOR EACH ROW
      EXECUTE FUNCTION public.set_lcsy_updated_at();
  END IF;
END $$;

-- Add academic_year to lesson_subtopic_progress if the table exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lesson_subtopic_progress'
  ) THEN
    ALTER TABLE public.lesson_subtopic_progress
      ADD COLUMN IF NOT EXISTS academic_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER;

    -- If the old unique constraint exists (default naming), drop it and replace with year-aware uniqueness.
    ALTER TABLE public.lesson_subtopic_progress
      DROP CONSTRAINT IF EXISTS lesson_subtopic_progress_topic_id_subtopic_index_teacher_id_key;

    ALTER TABLE public.lesson_subtopic_progress
      ADD CONSTRAINT lesson_subtopic_progress_unique_per_teacher_year
      UNIQUE (topic_id, subtopic_index, teacher_id, academic_year);

    CREATE INDEX IF NOT EXISTS idx_lesson_subtopic_progress_topic_teacher_year
      ON public.lesson_subtopic_progress (topic_id, teacher_id, academic_year);
  END IF;
END $$;

-- Backwards-compat: add academic_year to lesson_progress if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lesson_progress'
  ) THEN
    ALTER TABLE public.lesson_progress
      ADD COLUMN IF NOT EXISTS academic_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER;

    -- Default constraint name from the original script.
    ALTER TABLE public.lesson_progress
      DROP CONSTRAINT IF EXISTS lesson_progress_topic_id_key;

    ALTER TABLE public.lesson_progress
      ADD CONSTRAINT lesson_progress_unique_per_teacher_year
      UNIQUE (topic_id, teacher_id, academic_year);

    CREATE INDEX IF NOT EXISTS idx_lesson_progress_topic_teacher_year
      ON public.lesson_progress (topic_id, teacher_id, academic_year);
  END IF;
END $$;

-- RLS for new table
ALTER TABLE public.lesson_class_subject_year ENABLE ROW LEVEL SECURITY;

-- Admins: full control
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_class_subject_year'
      AND policyname = 'admin_manage_lesson_class_subject_year'
  ) THEN
    CREATE POLICY admin_manage_lesson_class_subject_year ON public.lesson_class_subject_year
      FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));
  END IF;
END $$;

-- Teachers: read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_class_subject_year'
      AND policyname = 'teachers_manage_lesson_class_subject_year'
  ) THEN
    CREATE POLICY teachers_manage_lesson_class_subject_year ON public.lesson_class_subject_year
      FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'));
  END IF;
END $$;

COMMIT;

