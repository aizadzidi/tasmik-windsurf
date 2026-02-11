-- Allow same topic title across New vs Revision within the same class/subject.
-- Keeps duplicate protection inside the same topic_type.

BEGIN;

DO $$
DECLARE
  legacy_constraint_name TEXT;
BEGIN
  SELECT c.conname
  INTO legacy_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'lesson_topics'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (class_id, subject_id, title%'
  LIMIT 1;

  IF legacy_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.lesson_topics DROP CONSTRAINT %I',
      legacy_constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_topics_class_subject_title_type_key'
      AND conrelid = 'public.lesson_topics'::regclass
  ) THEN
    ALTER TABLE public.lesson_topics
      ADD CONSTRAINT lesson_topics_class_subject_title_type_key
      UNIQUE (class_id, subject_id, title, topic_type);
  END IF;
END $$;

COMMIT;
