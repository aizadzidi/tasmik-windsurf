-- Attendance records: RLS + helper indexes/triggers (for existing table)
-- Run inside Supabase SQL editor or psql as coordinated.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_records'
  ) THEN
    RAISE EXCEPTION 'public.attendance_records does not exist';
  END IF;
END $$;

-- Helpful indexes for teacher roll-call queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_class_date
  ON public.attendance_records (class_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student_date
  ON public.attendance_records (student_id, attendance_date);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Policies: match the existing pattern used by other tables in this repo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'admin_manage_attendance_records'
  ) THEN
    CREATE POLICY admin_manage_attendance_records ON public.attendance_records
      FOR ALL USING (
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
      AND tablename = 'attendance_records'
      AND policyname = 'teachers_manage_attendance_records'
  ) THEN
    CREATE POLICY teachers_manage_attendance_records ON public.attendance_records
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
      );
  END IF;
END $$;

-- Keep updated_at fresh if the column exists
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_attendance_records_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attendance_records_set_updated_at'
    ) THEN
      CREATE TRIGGER trg_attendance_records_set_updated_at
      BEFORE UPDATE ON public.attendance_records
      FOR EACH ROW
      EXECUTE FUNCTION public.set_attendance_records_updated_at();
    END IF;
  END IF;
END $do$;

COMMIT;
