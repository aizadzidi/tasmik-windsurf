-- Comprehensive fix for juz_test_notifications table
-- This script ensures the table exists with proper structure and populated data

-- First, ensure the table exists with all required columns
CREATE TABLE IF NOT EXISTS juz_test_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(255),
  teacher_name VARCHAR(255),
  suggested_juz INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'completed')),
  teacher_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add the name columns if they don't exist (for existing tables)
ALTER TABLE juz_test_notifications 
ADD COLUMN IF NOT EXISTS student_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(255);

-- Update existing records with proper names from related tables
UPDATE juz_test_notifications 
SET 
  student_name = s.name,
  teacher_name = u.name
FROM students s, users u
WHERE juz_test_notifications.student_id = s.id 
  AND juz_test_notifications.teacher_id = u.id
  AND (juz_test_notifications.student_name IS NULL OR juz_test_notifications.teacher_name IS NULL);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_teacher ON juz_test_notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_student ON juz_test_notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_status ON juz_test_notifications(status);

-- Enable Row Level Security
ALTER TABLE juz_test_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Teachers can view their own notifications" ON juz_test_notifications;
DROP POLICY IF EXISTS "Teachers can create notifications for their students" ON juz_test_notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON juz_test_notifications;
DROP POLICY IF EXISTS "Admins can update notification status" ON juz_test_notifications;

-- Create new policies

-- Policy for teachers to see only their own notifications
CREATE POLICY "Teachers can view their own notifications" 
ON juz_test_notifications FOR SELECT 
USING (teacher_id = auth.uid());

-- Policy for teachers to create notifications for their students
CREATE POLICY "Teachers can create notifications for their students" 
ON juz_test_notifications FOR INSERT 
WITH CHECK (
  teacher_id = auth.uid() AND 
  EXISTS (
    SELECT 1 FROM students 
    WHERE id = student_id AND assigned_teacher_id = auth.uid()
  )
);

-- Policy for admins to see all notifications
CREATE POLICY "Admins can view all notifications" 
ON juz_test_notifications FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy for admins to update notification status
CREATE POLICY "Admins can update notification status" 
ON juz_test_notifications FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Create or replace function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger to avoid conflicts
DROP TRIGGER IF EXISTS update_juz_test_notifications_updated_at ON juz_test_notifications;

-- Create trigger for updated_at
CREATE TRIGGER update_juz_test_notifications_updated_at 
BEFORE UPDATE ON juz_test_notifications 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON juz_test_notifications TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Insert some test data to verify the system works (optional - uncomment to test)
/*
INSERT INTO juz_test_notifications (
  teacher_id, 
  student_id, 
  student_name, 
  teacher_name, 
  suggested_juz, 
  teacher_notes, 
  status
) 
SELECT 
  t.id as teacher_id,
  s.id as student_id,
  s.name as student_name,
  t.name as teacher_name,
  1 as suggested_juz,
  'Test notification - Student ready for Juz 1 test' as teacher_notes,
  'pending' as status
FROM users t
JOIN students s ON s.assigned_teacher_id = t.id
WHERE t.role = 'teacher'
  AND s.name IS NOT NULL
  AND t.name IS NOT NULL
LIMIT 2;
*/

-- Verify the setup
SELECT 
  count(*) as total_notifications,
  count(CASE WHEN student_name IS NOT NULL THEN 1 END) as notifications_with_student_names,
  count(CASE WHEN teacher_name IS NOT NULL THEN 1 END) as notifications_with_teacher_names,
  count(CASE WHEN status = 'pending' THEN 1 END) as pending_notifications
FROM juz_test_notifications;