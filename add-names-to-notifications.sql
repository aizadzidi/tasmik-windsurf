-- Add student_name and teacher_name columns to juz_test_notifications table
-- This will eliminate the need for joins and RLS issues

-- Add the new columns
ALTER TABLE juz_test_notifications 
ADD COLUMN IF NOT EXISTS student_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(255);

-- Update existing notifications with names (if any exist)
-- Note: Existing notifications will show names as NULL until new ones are created
-- This is fine since we're storing names going forward

-- Verify the changes
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'juz_test_notifications';