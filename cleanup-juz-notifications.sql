-- Clean up existing juz_test_notifications setup
-- Run this first if you get policy already exists errors

-- Drop existing policies (if they exist)
DROP POLICY IF EXISTS "Teachers can view their own notifications" ON juz_test_notifications;
DROP POLICY IF EXISTS "Teachers can create notifications for their students" ON juz_test_notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON juz_test_notifications;
DROP POLICY IF EXISTS "Admins can update notification status" ON juz_test_notifications;

-- Drop the trigger (if it exists)
DROP TRIGGER IF EXISTS update_juz_test_notifications_updated_at ON juz_test_notifications;

-- Drop the table (if it exists)
DROP TABLE IF EXISTS juz_test_notifications;

-- Drop the function (if it exists)
DROP FUNCTION IF EXISTS update_updated_at_column();