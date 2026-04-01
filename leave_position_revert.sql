-- Revert: remove leave_position column from users table
ALTER TABLE users DROP COLUMN IF EXISTS leave_position;
