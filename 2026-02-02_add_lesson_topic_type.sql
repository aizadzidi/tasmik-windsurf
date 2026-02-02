-- Add topic_type to lesson_topics for new vs revision topics
-- Run inside Supabase SQL editor or psql

BEGIN;

ALTER TABLE public.lesson_topics
  ADD COLUMN IF NOT EXISTS topic_type TEXT NOT NULL DEFAULT 'new';

UPDATE public.lesson_topics
SET topic_type = 'new'
WHERE topic_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_topics_topic_type_check'
  ) THEN
    ALTER TABLE public.lesson_topics
      ADD CONSTRAINT lesson_topics_topic_type_check
      CHECK (topic_type IN ('new', 'revision'));
  END IF;
END $$;

COMMIT;
