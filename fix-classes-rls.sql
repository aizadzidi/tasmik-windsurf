-- Fix RLS policies for classes table
-- Run this if classes aren't showing up in dropdowns

-- Drop existing policies
DROP POLICY IF EXISTS "Classes are viewable by authenticated users" ON classes;

-- Create more permissive policies for testing
CREATE POLICY "Enable read access for all authenticated users" ON classes
    FOR SELECT USING (true);

-- Also ensure subjects table has proper access (for future use)
DROP POLICY IF EXISTS "Subjects are viewable by authenticated users" ON subjects;
CREATE POLICY "Enable read access for all authenticated users" ON subjects
    FOR SELECT USING (true);

-- Test the access
SELECT 'Testing class access after policy fix:' as info;
SELECT id, name FROM classes ORDER BY name;
