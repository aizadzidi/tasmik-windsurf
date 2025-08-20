-- FIX DATA ACCESS FOR ALL TABLES
-- Users can login but can't see data - fix students, reports, classes policies

-- ===================================================================
-- FIX STUDENTS TABLE POLICIES
-- ===================================================================

-- Drop the overly complex policy and create clearer ones
DROP POLICY IF EXISTS "Students access control" ON students;

-- Allow admins full access to students
CREATE POLICY "Admins can manage all students" ON students
  FOR ALL USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access - use a more reliable check
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

-- Allow teachers to view and manage their assigned students
CREATE POLICY "Teachers can manage assigned students" ON students
  FOR ALL USING (
    auth.uid() IS NOT NULL 
    AND assigned_teacher_id = auth.uid()
  );

-- Allow parents to view their children
CREATE POLICY "Parents can view their children" ON students
  FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND parent_id = auth.uid()
  );

-- ===================================================================
-- FIX REPORTS TABLE POLICIES  
-- ===================================================================

-- Drop the complex policy and create clearer ones
DROP POLICY IF EXISTS "Reports access control" ON reports;

-- Allow admins full access to reports
CREATE POLICY "Admins can manage all reports" ON reports
  FOR ALL USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- App admin access
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

-- Allow teachers to manage reports for their assigned students
CREATE POLICY "Teachers can manage assigned student reports" ON reports
  FOR ALL USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- Allow parents to view reports for their children
CREATE POLICY "Parents can view children reports" ON reports
  FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    )
  );

-- ===================================================================
-- FIX CLASSES TABLE POLICIES
-- ===================================================================

-- Drop the complex policy and create clearer ones
DROP POLICY IF EXISTS "Classes access control" ON classes;
DROP POLICY IF EXISTS "Classes admin modify" ON classes;

-- Allow everyone to read classes (needed for dropdowns)
CREATE POLICY "Anyone can view classes" ON classes
  FOR SELECT USING (
    -- Database admin access
    auth.uid() IS NULL
    OR
    -- Any authenticated user can view classes
    auth.uid() IS NOT NULL
  );

-- Only admins can modify classes
CREATE POLICY "Admins can modify classes" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "Admins can update classes" ON classes
  FOR UPDATE USING (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "Admins can delete classes" ON classes
  FOR DELETE USING (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

-- ===================================================================
-- VERIFICATION
-- ===================================================================

-- Check all policies are correctly set
SELECT 'STUDENTS POLICIES' as table_name;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'students' ORDER BY cmd, policyname;

SELECT 'REPORTS POLICIES' as table_name;  
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'reports' ORDER BY cmd, policyname;

SELECT 'CLASSES POLICIES' as table_name;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'classes' ORDER BY cmd, policyname;

-- Test data access
SELECT 'DATA ACCESS TEST' as test_section;
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

SELECT '✅ DATA ACCESS SHOULD NOW WORK FOR ALL ROLES!' as status;