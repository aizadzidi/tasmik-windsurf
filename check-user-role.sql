-- CHECK YOUR USER ROLE
-- This helps debug authentication issues

-- 1. Check current authentication context
SELECT 
  current_user as database_user,
  auth.uid() as authenticated_user_id,
  auth.email() as user_email,
  auth.role() as auth_role;

-- 2. Check your user details in the users table
SELECT 
  id,
  name,
  email,
  role,
  created_at
FROM users 
WHERE id = auth.uid()
OR email = auth.email();

-- 3. Check all users with admin role
SELECT 
  id,
  name,
  email,
  role
FROM users 
WHERE role = 'admin';

-- 4. If you need to make yourself an admin, run:
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';