-- SAFE RLS ENABLEMENT FOR ADMIN ACCESS
-- This approach handles the case where SQL is run as database admin (auth.uid() = null)

-- ===================================================================
-- PHASE 1: CREATE SAFE ADMIN-FRIENDLY POLICIES
-- ===================================================================

-- Strategy: Allow database admin users (where auth.uid() is null) to bypass RLS
-- while still enforcing policies for authenticated app users

-- 1. Users table - Allow admin access + authenticated users
DROP POLICY IF EXISTS "Users access control" ON users;
CREATE POLICY "Users access control" ON users
  FOR ALL USING (
    -- Database admin access (when running SQL directly)
    auth.uid() IS NULL
    OR
    -- App admin access  
    (auth.uid() IS NOT NULL AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin')
    OR
    -- Users can access their own profile
    (auth.uid() IS NOT NULL AND id = auth.uid())
  );

-- 2. Students table - Allow admin access + role-based access
DROP POLICY IF EXISTS "Students access control" ON students;
CREATE POLICY "Students access control" ON students
  FOR ALL USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access
    (auth.uid() IS NOT NULL AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin')
    OR
    -- Teachers can view assigned students
    (auth.uid() IS NOT NULL AND assigned_teacher_id = auth.uid())
    OR
    -- Parents can view their children
    (auth.uid() IS NOT NULL AND parent_id = auth.uid())
  );

-- 3. Reports table - Allow admin access + role-based access  
DROP POLICY IF EXISTS "Reports access control" ON reports;
CREATE POLICY "Reports access control" ON reports
  FOR ALL USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access
    (auth.uid() IS NOT NULL AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin')
    OR
    -- Teachers can manage reports for assigned students
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    ))
    OR
    -- Parents can view reports for their children
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    ))
  );

-- 4. Classes table - Allow admin access + authenticated read
DROP POLICY IF EXISTS "Classes access control" ON classes;
CREATE POLICY "Classes access control" ON classes
  FOR ALL USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin can manage
    (auth.uid() IS NOT NULL AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin')
    OR
    -- Authenticated users can read classes
    (auth.uid() IS NOT NULL)
  );

-- Separate INSERT policy for classes (only admins)
DROP POLICY IF EXISTS "Classes admin modify" ON classes;
CREATE POLICY "Classes admin modify" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin')
  );

-- ===================================================================
-- PHASE 2: ENABLE RLS SAFELY
-- ===================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- PHASE 3: VERIFICATION
-- ===================================================================

-- This should work even with auth.uid() = null
SELECT 'VERIFICATION' as test_section;

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename;

-- Test data access (should work for database admin)
SELECT 'DATA ACCESS TEST' as test_section;

SELECT 
  'users' as table_name,
  COUNT(*) as record_count
FROM users
UNION ALL
SELECT 
  'students' as table_name,
  COUNT(*) as record_count
FROM students
UNION ALL
SELECT 
  'reports' as table_name,
  COUNT(*) as record_count
FROM reports
UNION ALL
SELECT 
  'classes' as table_name,
  COUNT(*) as record_count
FROM classes;

-- Show current auth status
SELECT 
  'Auth Status' as info,
  COALESCE(auth.uid()::text, 'DATABASE_ADMIN') as current_user,
  CASE 
    WHEN auth.uid() IS NULL THEN 'Database Admin (RLS Bypassed)'
    ELSE 'App User (RLS Applied)'
  END as access_mode;

SELECT '✅ RLS ENABLED SAFELY - Your app should continue working!' as status;