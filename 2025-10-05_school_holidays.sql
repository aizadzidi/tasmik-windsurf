-- School holiday / break calendar for attendance suppression
-- Run inside Supabase SQL editor or psql

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'holiday', -- holiday | break | closure | others
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_school_holidays_range
  ON public.school_holidays (start_date, end_date);

ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

-- Allow admins full control; authenticated users can read for UI gating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'school_holidays'
      AND policyname = 'admin_manage_school_holidays'
  ) THEN
    CREATE POLICY admin_manage_school_holidays ON public.school_holidays
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'school_holidays'
      AND policyname = 'authenticated_read_school_holidays'
  ) THEN
    CREATE POLICY authenticated_read_school_holidays ON public.school_holidays
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_school_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_school_holidays_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_school_holidays_set_updated_at
    BEFORE UPDATE ON public.school_holidays
    FOR EACH ROW
    EXECUTE FUNCTION public.set_school_holidays_updated_at();
  END IF;
END $$;

COMMIT;
