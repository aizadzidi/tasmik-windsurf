-- Add optional level/category for classes
ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS level TEXT;

ALTER TABLE public.classes
DROP CONSTRAINT IF EXISTS classes_level_check;

ALTER TABLE public.classes
ADD CONSTRAINT classes_level_check
CHECK (level IN ('Lower Primary', 'Upper Primary', 'Lower Secondary', 'Upper Secondary') OR level IS NULL);
