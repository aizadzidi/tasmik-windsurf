-- EMERGENCY ADMIN ACCESS FIX
-- This completely disables RLS to get admins working immediately

-- Disable RLS on all tables (emergency fix)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;

-- Drop all problematic policies
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies 
           WHERE tablename IN ('users', 'students', 'reports', 'classes')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Check that RLS is disabled
SELECT 
  tablename,
  rowsecurity,
  CASE WHEN rowsecurity = false THEN '✅ DISABLED - ADMINS CAN ACCESS' ELSE '❌ STILL ENABLED' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'students', 'reports', 'classes')
ORDER BY tablename;

SELECT '🚀 EMERGENCY FIX COMPLETE - ADMINS SHOULD NOW WORK!' as result;