-- Create proper RLS policies for classes table only
-- This will provide security while maintaining functionality

-- First, re-enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Classes are viewable by authenticated users" ON classes;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON classes;
DROP POLICY IF EXISTS "authenticated_users_can_read_classes" ON classes;
DROP POLICY IF EXISTS "admin_users_can_modify_classes" ON classes;

-- Create a working policy for your authentication setup
-- This allows any authenticated user to read classes
CREATE POLICY "authenticated_users_can_read_classes" ON classes
    FOR SELECT 
    USING (
        -- Allow if user is authenticated (has a valid JWT token)
        auth.uid() IS NOT NULL
    );

-- Also create policies for admin operations (insert, update, delete)
-- Only users with admin role can modify classes
CREATE POLICY "admin_users_can_modify_classes" ON classes
    FOR ALL 
    USING (
        -- Check if user has admin role in your users table
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Test the new policies
SELECT 'Testing class access with proper RLS:' as info;
SELECT id, name FROM classes ORDER BY name;
