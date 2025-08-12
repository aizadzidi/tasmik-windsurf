-- Juz Test Notifications System Setup
-- Run this script to add the notification system for Juz test requests

-- Create juz_test_notifications table
CREATE TABLE IF NOT EXISTS juz_test_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  suggested_juz INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'completed')),
  teacher_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_teacher ON juz_test_notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_student ON juz_test_notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_juz_test_notifications_status ON juz_test_notifications(status);

-- Enable Row Level Security
ALTER TABLE juz_test_notifications ENABLE ROW LEVEL SECURITY;

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

-- Policy for admins/examiners to see all notifications
CREATE POLICY "Admins can view all notifications" 
ON juz_test_notifications FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy for admins/examiners to update notification status
CREATE POLICY "Admins can update notification status" 
ON juz_test_notifications FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_juz_test_notifications_updated_at 
BEFORE UPDATE ON juz_test_notifications 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON juz_test_notifications TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;