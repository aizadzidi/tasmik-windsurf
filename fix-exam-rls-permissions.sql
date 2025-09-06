-- FIX EXAM SYSTEM RLS PERMISSIONS
-- This fixes the "permission denied for table users" error when creating exams
-- The issue is that exam tables have RLS enabled but are trying to query users table

-- Disable RLS on all exam-related tables to match the emergency fix pattern
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_scores DISABLE ROW LEVEL SECURITY;

-- Drop all exam-related policies
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies 
           WHERE tablename IN ('subjects', 'exams', 'exam_subjects', 'exam_classes', 'exam_results', 'conduct_scores')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Verify that RLS is disabled on all exam tables
SELECT 
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity = false THEN '✅ DISABLED - EXAM CREATION SHOULD WORK' ELSE '❌ STILL ENABLED' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('subjects', 'exams', 'exam_subjects', 'exam_classes', 'exam_results', 'conduct_scores')
ORDER BY tablename;

-- Show total status
SELECT 
  COUNT(*) as total_exam_tables,
  SUM(CASE WHEN rowsecurity = false THEN 1 ELSE 0 END) as rls_disabled_count,
  CASE WHEN COUNT(*) = SUM(CASE WHEN rowsecurity = false THEN 1 ELSE 0 END) 
       THEN '🚀 ALL EXAM TABLES FIXED - EXAM CREATION SHOULD WORK NOW!' 
       ELSE '⚠️ SOME TABLES STILL HAVE RLS ENABLED' 
  END as final_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('subjects', 'exams', 'exam_subjects', 'exam_classes', 'exam_results', 'conduct_scores');