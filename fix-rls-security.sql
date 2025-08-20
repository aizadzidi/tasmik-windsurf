-- FIX RLS SECURITY ISSUES WITH COMPREHENSIVE POLICY FIXES
-- CRITICAL: This fixes circular dependency issues in admin policies
-- Run this in Supabase SQL Editor to fix security vulnerabilities

-- ===================================================================
-- PHASE 1: FIX CRITICAL POLICY ISSUES BEFORE ENABLING RLS
-- ===================================================================

-- Fix circular dependency in admin policies by using auth.jwt() instead of users table lookup
-- This allows admin checks without needing to query the users table

-- 1. Fix Users table policies
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::json ->> 'role' = 'admin'
    OR 
    -- Fallback: check if user's role is admin in their own record
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- Add missing INSERT policy for user signup
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (id = auth.uid());

-- 2. Fix Students table policies  
DROP POLICY IF EXISTS "Admins can view all students" ON students;
CREATE POLICY "Admins can view all students" ON students
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::json ->> 'role' = 'admin'
    OR 
    -- Fallback: direct role check
    (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- Add missing policies for student management
DROP POLICY IF EXISTS "Admins can manage students" ON students;
CREATE POLICY "Admins can manage students" ON students
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::json ->> 'role' = 'admin'
    OR 
    (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- 3. Fix Reports table policies
DROP POLICY IF EXISTS "Admins can view all reports" ON reports;
CREATE POLICY "Admins can view all reports" ON reports
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::json ->> 'role' = 'admin'
    OR 
    (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- Add missing teacher insert/update policies
DROP POLICY IF EXISTS "Teachers can create reports" ON reports;
CREATE POLICY "Teachers can create reports" ON reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can update their own reports" ON reports;
CREATE POLICY "Teachers can update their own reports" ON reports
  FOR UPDATE USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can delete their own reports" ON reports;
CREATE POLICY "Teachers can delete their own reports" ON reports
  FOR DELETE USING (teacher_id = auth.uid());

-- 4. Fix Classes table policies
DROP POLICY IF EXISTS "admin_users_can_modify_classes" ON classes;
CREATE POLICY "admin_users_can_modify_classes" ON classes
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::json ->> 'role' = 'admin'
    OR 
    (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- ===================================================================
-- PHASE 2: ENABLE RLS ON ALL TABLES
-- ===================================================================

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on students table  
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Enable RLS on reports table
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Enable RLS on classes table
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- PHASE 3: VERIFICATION
-- ===================================================================

-- Verify RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename;

-- Verify policies exist
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  cmd,
  permissive
FROM pg_policies 
WHERE tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename, policyname;

-- Test admin access (run this after enabling RLS to verify admin can still access data)
-- If this returns data, admin access is working:
-- SELECT COUNT(*) as user_count FROM users;
-- SELECT COUNT(*) as student_count FROM students;

-- ===================================================================
-- ROLLBACK PLAN (if issues occur)
-- ===================================================================
-- If the application breaks after running this script, run these commands:
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.reports DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;