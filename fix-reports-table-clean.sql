-- FIX REPORTS TABLE STRUCTURE
-- This script updates the reports table to match the current application requirements
-- Run this in Supabase SQL Editor to fix the "reports_type_check" constraint error

-- Add missing columns to reports table if they don't exist
DO $$ 
BEGIN
  -- Add type column with proper constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'type'
  ) THEN
    ALTER TABLE reports ADD COLUMN type TEXT;
  END IF;

  -- Add surah column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'surah'
  ) THEN
    ALTER TABLE reports ADD COLUMN surah TEXT;
  END IF;

  -- Add juzuk column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'juzuk'
  ) THEN
    ALTER TABLE reports ADD COLUMN juzuk INTEGER;
  END IF;

  -- Add ayat_from column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'ayat_from'
  ) THEN
    ALTER TABLE reports ADD COLUMN ayat_from INTEGER;
  END IF;

  -- Add ayat_to column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'ayat_to'
  ) THEN
    ALTER TABLE reports ADD COLUMN ayat_to INTEGER;
  END IF;

  -- Add page_from column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'page_from'
  ) THEN
    ALTER TABLE reports ADD COLUMN page_from INTEGER;
  END IF;

  -- Add page_to column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'page_to'
  ) THEN
    ALTER TABLE reports ADD COLUMN page_to INTEGER;
  END IF;

  -- Add grade column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'grade'
  ) THEN
    ALTER TABLE reports ADD COLUMN grade TEXT;
  END IF;

  -- Add date column (rename report_date if it exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'date'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'reports' AND column_name = 'report_date'
    ) THEN
      ALTER TABLE reports RENAME COLUMN report_date TO date;
    ELSE
      ALTER TABLE reports ADD COLUMN date DATE;
    END IF;
  END IF;
END $$;

-- Drop any existing constraint on type column
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'reports' AND constraint_name = 'reports_type_check'
  ) THEN
    ALTER TABLE reports DROP CONSTRAINT reports_type_check;
  END IF;
END $$;

-- Add the correct type constraint that allows all the values the application uses
ALTER TABLE reports 
ADD CONSTRAINT reports_type_check 
CHECK (type IN ('Tasmi', 'Murajaah', 'Old Murajaah', 'New Murajaah', 'juz_test') OR type IS NULL);

-- Add grade constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'reports' AND constraint_name = 'reports_grade_check'
  ) THEN
    ALTER TABLE reports 
    ADD CONSTRAINT reports_grade_check 
    CHECK (grade IN ('mumtaz', 'jayyid jiddan', 'jayyid') OR grade IS NULL);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_surah ON reports(surah);
CREATE INDEX IF NOT EXISTS idx_reports_juzuk ON reports(juzuk);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);

-- Display the updated table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'reports' 
ORDER BY ordinal_position;

SELECT 'Reports table structure updated successfully!' as status;