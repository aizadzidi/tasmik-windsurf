-- TEST RLS READINESS
-- Run this BEFORE fix-rls-security.sql to validate your setup
-- This helps identify potential issues before enabling RLS

-- ===================================================================
-- PHASE 1: CURRENT STATE ASSESSMENT
-- ===================================================================

SELECT 'CURRENT RLS STATUS' as test_section;

-- Check current RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity = true THEN '✓ ENABLED' 
        ELSE '✗ DISABLED' 
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename;

-- Check existing policies
SELECT 'EXISTING POLICIES' as test_section;

SELECT 
  tablename, 
  COUNT(*) as policy_count,
  array_agg(policyname) as policy_names
FROM pg_policies 
WHERE tablename IN ('users', 'students', 'reports', 'classes')
GROUP BY tablename
ORDER BY tablename;

-- ===================================================================
-- PHASE 2: AUTHENTICATION VALIDATION
-- ===================================================================

SELECT 'AUTHENTICATION TEST' as test_section;

-- Check current user authentication
SELECT 
  CASE 
    WHEN auth.uid() IS NOT NULL THEN '✓ AUTHENTICATED' 
    ELSE '✗ NOT AUTHENTICATED' 
  END as auth_status,
  auth.uid() as user_id,
  auth.email() as user_email;

-- Check if current user exists in users table
SELECT 'USER PROFILE CHECK' as test_section;

SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ USER PROFILE EXISTS' 
    ELSE '✗ USER PROFILE MISSING' 
  END as profile_status,
  COUNT(*) as profile_count
FROM users 
WHERE id = auth.uid();

-- Check user role if profile exists
SELECT 
  name,
  email,
  role,
  CASE 
    WHEN role = 'admin' THEN '✓ ADMIN ACCESS' 
    WHEN role = 'teacher' THEN '✓ TEACHER ACCESS'
    WHEN role = 'parent' THEN '✓ PARENT ACCESS'
    ELSE '✗ UNKNOWN ROLE' 
  END as role_status
FROM users 
WHERE id = auth.uid();

-- ===================================================================
-- PHASE 3: DATA ACCESS VALIDATION  
-- ===================================================================

SELECT 'DATA ACCESS TEST' as test_section;

-- Test current data access (this works because RLS is disabled)
SELECT 
  'users' as table_name,
  COUNT(*) as record_count,
  '✓ ACCESSIBLE' as current_status
FROM users
UNION ALL
SELECT 
  'students' as table_name,
  COUNT(*) as record_count,
  '✓ ACCESSIBLE' as current_status
FROM students
UNION ALL
SELECT 
  'reports' as table_name,
  COUNT(*) as record_count,
  '✓ ACCESSIBLE' as current_status  
FROM reports
UNION ALL
SELECT 
  'classes' as table_name,
  COUNT(*) as record_count,
  '✓ ACCESSIBLE' as current_status
FROM classes
ORDER BY table_name;

-- ===================================================================
-- PHASE 4: POLICY SIMULATION
-- ===================================================================

SELECT 'POLICY SIMULATION' as test_section;

-- Simulate what would happen with RLS enabled
-- Test admin access simulation
SELECT 
  'Admin Policy Test' as test_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    ) THEN '✓ ADMIN ACCESS WOULD WORK'
    ELSE '✗ ADMIN ACCESS WOULD FAIL'
  END as simulation_result;

-- Test teacher access simulation  
SELECT 
  'Teacher Policy Test' as test_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM students 
      WHERE assigned_teacher_id = auth.uid()
    ) THEN '✓ TEACHER ACCESS WOULD WORK'
    ELSE '⚠ TEACHER HAS NO ASSIGNED STUDENTS'
  END as simulation_result;

-- Test parent access simulation
SELECT 
  'Parent Policy Test' as test_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM students 
      WHERE parent_id = auth.uid()
    ) THEN '✓ PARENT ACCESS WOULD WORK'
    ELSE '⚠ PARENT HAS NO CHILDREN ASSIGNED'
  END as simulation_result;

-- ===================================================================
-- PHASE 5: RECOMMENDATIONS
-- ===================================================================

SELECT 'RECOMMENDATIONS' as test_section;

-- Check for potential issues
SELECT 
  CASE 
    WHEN auth.uid() IS NULL THEN 
      '🚨 CRITICAL: You are not authenticated. Login first before enabling RLS.'
    WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) THEN
      '🚨 CRITICAL: Your user profile is missing. Create user profile first.'
    WHEN (SELECT role FROM users WHERE id = auth.uid()) != 'admin' THEN
      '⚠ WARNING: You are not an admin. Ensure you have admin access before enabling RLS.'
    ELSE 
      '✅ READY: You can proceed with enabling RLS.'
  END as readiness_status;

-- Final recommendation
SELECT 
  '📋 NEXT STEPS:' as info,
  CASE 
    WHEN auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid()) THEN
      'Fix authentication and user profile issues before proceeding.'
    ELSE
      'Run fix-rls-security.sql to enable RLS with corrected policies.'
  END as recommendation;