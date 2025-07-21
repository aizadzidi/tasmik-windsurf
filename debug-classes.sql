-- Debug script to check classes table and RLS policies
-- Run this in Supabase SQL Editor to debug class assignment issues

-- 1. Check if classes exist
SELECT 'Classes in database:' as info;
SELECT id, name, created_at FROM classes ORDER BY name;

-- 2. Check RLS policies on classes table
SELECT 'RLS policies on classes table:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'classes';

-- 3. Check if RLS is enabled
SELECT 'RLS status:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'classes';

-- 4. Test if current user can read classes (this should work for authenticated users)
SELECT 'Testing class access:' as info;
SELECT COUNT(*) as class_count FROM classes;

-- 5. Check students table structure
SELECT 'Students table columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
ORDER BY ordinal_position;
