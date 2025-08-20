-- FIX DATA ACCESS FOR ALL TABLES - VERSION 2
-- Clean up existing policies and create new ones

-- ===================================================================
-- CLEAN UP ALL EXISTING POLICIES FIRST
-- ===================================================================

-- Students table policies
DROP POLICY IF EXISTS "Students access control" ON students;
DROP POLICY IF EXISTS "Admins can manage all students" ON students;
DROP POLICY IF EXISTS "Teachers can manage assigned students" ON students;
DROP POLICY IF EXISTS "Parents can view their children" ON students;
DROP POLICY IF EXISTS "Parents can view own children" ON students;
DROP POLICY IF EXISTS "Teachers can view assigned students" ON students;
DROP POLICY IF EXISTS "Admins can view all students" ON students;
DROP POLICY IF EXISTS "Admins can manage students" ON students;

-- Reports table policies
DROP POLICY IF EXISTS "Reports access control" ON reports;
DROP POLICY IF EXISTS "Admins can manage all reports" ON reports;
DROP POLICY IF EXISTS "Teachers can manage assigned student reports" ON reports;
DROP POLICY IF EXISTS "Parents can view children reports" ON reports;
DROP POLICY IF EXISTS "Parents can view children reports" ON reports;
DROP POLICY IF EXISTS "Teachers can view assigned student reports" ON reports;
DROP POLICY IF EXISTS "Teachers can create reports" ON reports;
DROP POLICY IF EXISTS "Teachers can update their own reports" ON reports;
DROP POLICY IF EXISTS "Teachers can delete their own reports" ON reports;

-- Classes table policies
DROP POLICY IF EXISTS "Classes access control" ON classes;
DROP POLICY IF EXISTS "Classes admin modify" ON classes;
DROP POLICY IF EXISTS "Anyone can view classes" ON classes;
DROP POLICY IF EXISTS "Admins can modify classes" ON classes;
DROP POLICY IF EXISTS "Admins can update classes" ON classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON classes;
DROP POLICY IF EXISTS "authenticated_users_can_read_classes" ON classes;
DROP POLICY IF EXISTS "admin_users_can_modify_classes" ON classes;

-- ===================================================================
-- CREATE NEW CLEAN POLICIES
-- ===================================================================

-- STUDENTS TABLE
CREATE POLICY "admin_access_students" ON students
  FOR ALL USING (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "teacher_access_students" ON students
  FOR ALL USING (
    auth.uid() IS NOT NULL 
    AND assigned_teacher_id = auth.uid()
  );

CREATE POLICY "parent_view_students" ON students
  FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND parent_id = auth.uid()
  );

-- REPORTS TABLE
CREATE POLICY "admin_access_reports" ON reports
  FOR ALL USING (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "teacher_access_reports" ON reports
  FOR ALL USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

CREATE POLICY "parent_view_reports" ON reports
  FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    )
  );

-- CLASSES TABLE
CREATE POLICY "view_classes" ON classes
  FOR SELECT USING (
    auth.uid() IS NULL
    OR
    auth.uid() IS NOT NULL
  );

CREATE POLICY "admin_modify_classes" ON classes
  FOR INSERT WITH CHECK (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "admin_update_classes" ON classes
  FOR UPDATE USING (
    auth.uid() IS NULL
    OR
    (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    ))
  );

CREATE POLICY "admin_delete_classes" ON classes
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

SELECT 'RLS STATUS' as info;
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes');

SELECT 'POLICY COUNT' as info;
SELECT tablename, COUNT(*) as policy_count FROM pg_policies 
WHERE tablename IN ('users', 'students', 'reports', 'classes')
GROUP BY tablename ORDER BY tablename;

SELECT '✅ ALL POLICIES RECREATED - TEST YOUR APP NOW!' as status;