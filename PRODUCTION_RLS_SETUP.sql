-- PRODUCTION-GRADE RLS SETUP
-- This setup works with the dual-client architecture
-- Service role bypasses RLS, regular users get proper security

-- ===================================================================
-- PHASE 1: ENABLE RLS WITH SERVICE ROLE BYPASS
-- ===================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- PHASE 2: SIMPLE, BULLETPROOF POLICIES
-- ===================================================================

-- USERS TABLE: Only authenticated users can see their own profile
CREATE POLICY "users_own_profile" ON users
  FOR ALL USING (auth.uid() = id);

-- STUDENTS TABLE: Teachers see assigned students, parents see children
CREATE POLICY "teachers_assigned_students" ON students
  FOR ALL USING (assigned_teacher_id = auth.uid());

CREATE POLICY "parents_own_children" ON students
  FOR SELECT USING (parent_id = auth.uid());

-- REPORTS TABLE: Teachers manage reports for assigned students, parents view
CREATE POLICY "teachers_student_reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

CREATE POLICY "parents_children_reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    )
  );

-- CLASSES TABLE: Everyone can read, no one can modify (admin uses service role)
CREATE POLICY "everyone_read_classes" ON classes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ===================================================================
-- PHASE 3: VERIFICATION
-- ===================================================================

-- Check RLS is enabled
SELECT 
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity THEN '✅ SECURED' ELSE '❌ UNSECURED' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename;

-- Count policies
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename IN ('users', 'students', 'reports', 'classes')
GROUP BY tablename
ORDER BY tablename;

SELECT '🔒 PRODUCTION RLS SETUP COMPLETE!' as status;
SELECT '📋 NEXT: Update your app to use the service client for admin operations' as next_step;