-- Add leave_position column to users table
-- This allows admins to assign leave positions (admin/teacher/general_worker)
-- independently of the auth role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS leave_position TEXT;

-- Default existing users based on their role
UPDATE users SET leave_position = role WHERE leave_position IS NULL AND role IN ('admin', 'teacher');
UPDATE users SET leave_position = 'general_worker' WHERE leave_position IS NULL AND role NOT IN ('admin', 'teacher', 'parent');
