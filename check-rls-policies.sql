-- CHECK RLS POLICIES FOR JUZ_TESTS
-- Run this to verify and fix RLS policies

-- 1. Check current policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check 
FROM pg_policies 
WHERE tablename = 'juz_tests';

-- 2. Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'juz_tests';

-- 3. Temporarily disable RLS for testing (ONLY FOR DEBUGGING)
-- Uncomment these lines if you want to test without RLS:
-- ALTER TABLE juz_tests DISABLE ROW LEVEL SECURITY;

-- 4. Check what user role the current session has
SELECT current_user, session_user;

-- 5. Test if current user can insert (this will show permissions error if any)
-- This is a test query - replace UUIDs with actual values when testing:
/*
INSERT INTO juz_tests (
  student_id,
  juz_number,
  test_date,
  examiner_id,
  halaqah_name,
  examiner_name,
  remarks
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with real student ID
  1,
  CURRENT_DATE,
  auth.uid(), -- This should work if user is authenticated
  'Test Halaqah',
  'Test Examiner',
  'Test submission'
);
*/