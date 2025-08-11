-- ADMIN REPORTS PAGE DATABASE ENHANCEMENT
-- This script enhances the existing reports table for tasmik/murajaah tracking

-- Add reading_progress column to existing reports table for flexible murajaah storage
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reports' AND column_name = 'reading_progress'
  ) THEN
    ALTER TABLE reports ADD COLUMN reading_progress JSONB;
  END IF;
END $$;

-- Update the reports table structure for better progress tracking
ALTER TABLE reports 
ADD COLUMN IF NOT EXISTS latest_reading TEXT,
ADD COLUMN IF NOT EXISTS last_read_date DATE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_reading_progress ON reports USING GIN (reading_progress);
CREATE INDEX IF NOT EXISTS idx_reports_last_read_date ON reports(last_read_date);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- Create a view for easy admin reporting
CREATE OR REPLACE VIEW admin_student_progress AS
SELECT 
    s.id as student_id,
    s.name as student_name,
    u.name as teacher_name,
    c.name as class_name,
    r.type as report_type,
    r.latest_reading,
    r.last_read_date,
    r.date as report_date,
    CASE 
        WHEN r.last_read_date IS NULL THEN 999
        ELSE EXTRACT(DAYS FROM (CURRENT_DATE - r.last_read_date))
    END as days_since_last_read
FROM students s
LEFT JOIN users u ON s.assigned_teacher_id = u.id
LEFT JOIN classes c ON s.class_id = c.id
LEFT JOIN LATERAL (
    SELECT DISTINCT ON (student_id, type) 
        type, latest_reading, last_read_date, date
    FROM reports 
    WHERE student_id = s.id 
    ORDER BY student_id, type, date DESC
) r ON true
ORDER BY days_since_last_read DESC;

-- Grant permissions for the view
GRANT SELECT ON admin_student_progress TO authenticated;

-- Add RLS policy for the view (admins only)
ALTER VIEW admin_student_progress SET (security_invoker = true);

COMMENT ON VIEW admin_student_progress IS 'Admin view for tracking student progress across tasmik and murajaah';