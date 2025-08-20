-- Fix RLS policies to allow admin access for notification system
-- Run this in your Supabase SQL editor

-- Allow admins to read all students for notifications
CREATE POLICY IF NOT EXISTS "Admins can read all students for notifications" ON students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Allow admins to read all users for notifications  
CREATE POLICY IF NOT EXISTS "Admins can read all users for notifications" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Alternative: If the above doesn't work, try updating existing policies
-- You may need to drop and recreate existing policies that are too restrictive

-- Check current policies (uncomment to see what exists):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('students', 'users');