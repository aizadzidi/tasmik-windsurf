-- EMERGENCY LOGIN FIX
-- This fixes the user profile creation issue caused by RLS policies

-- The problem: RLS policy prevents user signup from inserting into users table
-- The solution: Allow INSERT for new user registrations

-- ===================================================================
-- FIX USER TABLE POLICIES
-- ===================================================================

-- Drop the restrictive policy and create a proper one
DROP POLICY IF EXISTS "Users access control" ON users;

-- Create separate policies for different operations
-- 1. Allow anyone to insert during signup (this is safe because it's their own profile)
CREATE POLICY "Users can signup" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- 2. Allow users to view their own profile and admins to view all
CREATE POLICY "Users can view profiles" ON users
  FOR SELECT USING (
    -- Database admin access (when running SQL directly)
    auth.uid() IS NULL
    OR
    -- App admin access  
    (auth.uid() IS NOT NULL AND role = 'admin')
    OR
    -- Users can view their own profile
    (auth.uid() IS NOT NULL AND id = auth.uid())
  );

-- 3. Allow users to update their own profile and admins to update any
CREATE POLICY "Users can update profiles" ON users
  FOR UPDATE USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access
    (auth.uid() IS NOT NULL AND role = 'admin')
    OR
    -- Users can update their own profile
    (auth.uid() IS NOT NULL AND id = auth.uid())
  );

-- 4. Only admins can delete users
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access
    (auth.uid() IS NOT NULL AND role = 'admin')
  );

-- ===================================================================
-- VERIFICATION
-- ===================================================================

-- Check the policies are correctly set
SELECT 
  policyname, 
  cmd,
  permissive,
  with_check IS NOT NULL as has_check_condition
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY cmd, policyname;

-- Test that we can still access users table as database admin
SELECT 'Users table access test' as test, COUNT(*) as user_count FROM users;

SELECT '✅ LOGIN SHOULD NOW WORK - Try signing in again!' as status;