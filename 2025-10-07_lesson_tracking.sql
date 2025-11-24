-- Lesson tracking (topics + taught dates per class/subject)
-- Run inside Supabase SQL editor or psql

BEGIN;

-- Topics that belong to a class + subject combination
CREATE TABLE IF NOT EXISTS public.lesson_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id, title)
);

CREATE INDEX IF NOT EXISTS idx_lesson_topics_class_subject
  ON public.lesson_topics (class_id, subject_id);

-- Progress toggle (one row per topic once it is taught)
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.lesson_topics(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  taught_on DATE NOT NULL DEFAULT CURRENT_DATE,
  teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_topic ON public.lesson_progress (topic_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_class_subject ON public.lesson_progress (class_id, subject_id);

-- Keep class_id / subject_id in sync with the topic to avoid mismatches
CREATE OR REPLACE FUNCTION public.sync_lesson_progress_topic_refs()
RETURNS TRIGGER AS $$
BEGIN
  SELECT lt.class_id, lt.subject_id INTO NEW.class_id, NEW.subject_id
  FROM public.lesson_topics lt
  WHERE lt.id = NEW.topic_id;

  IF NEW.class_id IS NULL OR NEW.subject_id IS NULL THEN
    RAISE EXCEPTION 'lesson_progress.topic_id % does not match an existing lesson topic', NEW.topic_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lesson_progress_sync_refs') THEN
    CREATE TRIGGER trg_lesson_progress_sync_refs
      BEFORE INSERT OR UPDATE ON public.lesson_progress
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_lesson_progress_topic_refs();
  END IF;
END $$;

-- updated_at helpers
CREATE OR REPLACE FUNCTION public.set_lesson_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lesson_topics_set_updated_at') THEN
    CREATE TRIGGER trg_lesson_topics_set_updated_at
      BEFORE UPDATE ON public.lesson_topics
      FOR EACH ROW
      EXECUTE FUNCTION public.set_lesson_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lesson_progress_set_updated_at') THEN
    CREATE TRIGGER trg_lesson_progress_set_updated_at
      BEFORE UPDATE ON public.lesson_progress
      FOR EACH ROW
      EXECUTE FUNCTION public.set_lesson_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.lesson_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Admins: full control
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_topics'
      AND policyname = 'admin_manage_lesson_topics'
  ) THEN
    CREATE POLICY admin_manage_lesson_topics ON public.lesson_topics
      USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_progress'
      AND policyname = 'admin_manage_lesson_progress'
  ) THEN
    CREATE POLICY admin_manage_lesson_progress ON public.lesson_progress
      USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));
  END IF;
END $$;

-- Teachers: manage topics and progress for any class/subject
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_topics'
      AND policyname = 'teachers_manage_lesson_topics'
  ) THEN
    CREATE POLICY teachers_manage_lesson_topics ON public.lesson_topics
      FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_progress'
      AND policyname = 'teachers_manage_lesson_progress'
  ) THEN
    CREATE POLICY teachers_manage_lesson_progress ON public.lesson_progress
      FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'teacher'));
  END IF;
END $$;

-- Parents: read-only for their child's class
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_topics'
      AND policyname = 'parents_read_lesson_topics'
  ) THEN
    CREATE POLICY parents_read_lesson_topics ON public.lesson_topics
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.parent_id = auth.uid() AND s.class_id = lesson_topics.class_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_progress'
      AND policyname = 'parents_read_lesson_progress'
  ) THEN
    CREATE POLICY parents_read_lesson_progress ON public.lesson_progress
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.students s
          JOIN public.lesson_topics lt ON lt.id = lesson_progress.topic_id
          WHERE s.parent_id = auth.uid() AND s.class_id = lt.class_id
        )
      );
  END IF;
END $$;

COMMIT;
