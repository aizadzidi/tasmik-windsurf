-- STUDENT REASSIGNMENT WITH PROPER RLS ACCESS CONTROL
-- This ensures that when a student is reassigned:
-- 1. New teacher gets access to ALL historical reports
-- 2. Previous teacher loses access to ALL reports for that student
-- 3. Historical reports remain unchanged (don't update teacher_id)

-- =============================================================================
-- STEP 1: UPDATE RLS POLICIES FOR PROPER TEACHER ACCESS
-- =============================================================================

-- Drop existing teacher policies
DROP POLICY IF EXISTS "Teachers can view assigned student reports" ON reports;
DROP POLICY IF EXISTS "Teachers can manage assigned student reports" ON reports;

-- NEW POLICY: Teachers can see ALL reports for students CURRENTLY assigned to them
-- This means when a student is reassigned, access automatically transfers
CREATE POLICY "Teachers can view assigned student reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- NEW POLICY: Teachers can manage ALL reports for students CURRENTLY assigned to them
CREATE POLICY "Teachers can manage assigned student reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- =============================================================================
-- STEP 2: CREATE HELPER FUNCTION FOR STUDENT REASSIGNMENT (OPTIONAL)
-- =============================================================================

-- This function can be used by admins to safely reassign students
CREATE OR REPLACE FUNCTION reassign_student_to_teacher(
  p_student_id UUID,
  p_new_teacher_id UUID
) RETURNS TEXT AS $$
BEGIN
  -- Verify the new teacher exists and is a teacher
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_new_teacher_id 
    AND role = 'teacher'
  ) THEN
    RETURN 'ERROR: New teacher not found or not a teacher role';
  END IF;
  
  -- Verify the student exists
  IF NOT EXISTS (
    SELECT 1 FROM students 
    WHERE id = p_student_id
  ) THEN
    RETURN 'ERROR: Student not found';
  END IF;
  
  -- Update student assignment
  UPDATE students 
  SET 
    assigned_teacher_id = p_new_teacher_id,
    updated_at = NOW()
  WHERE id = p_student_id;
  
  RETURN 'SUCCESS: Student reassigned successfully. New teacher now has access to all historical reports.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to admins (adjust as needed)
-- GRANT EXECUTE ON FUNCTION reassign_student_to_teacher TO authenticated;

-- =============================================================================
-- STEP 3: TEST THE REASSIGNMENT BEHAVIOR
-- =============================================================================

-- Test scenario setup (for verification - you can skip this part)
/*
-- Example usage of the function:
SELECT reassign_student_to_teacher(
  '5874e629-153d-4b2f-b8f1-8075db04c278'::UUID,  -- HAZIM's ID
  '8175651f-4173-4ac4-ada9-b4d75eb034fb'::UUID   -- Ustaz Azmir's ID
);
*/

-- =============================================================================
-- STEP 4: VERIFICATION QUERIES
-- =============================================================================

-- Check current RLS policies
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual 
FROM pg_policies 
WHERE tablename = 'reports' 
AND policyname LIKE '%Teachers%'
ORDER BY policyname;

-- Check student assignments
SELECT 
  s.id,
  s.name as student_name,
  s.assigned_teacher_id,
  u.name as assigned_teacher_name,
  COUNT(r.id) as total_reports
FROM students s
LEFT JOIN users u ON s.assigned_teacher_id = u.id
LEFT JOIN reports r ON s.id = r.student_id
WHERE s.name ILIKE '%HAZIM%'
GROUP BY s.id, s.name, s.assigned_teacher_id, u.name;

-- Summary
SELECT '✅ Student reassignment system configured successfully!' as status,
       'New teachers will inherit ALL historical reports when students are reassigned' as note,
       'Previous teachers will lose access automatically via RLS policies' as security;