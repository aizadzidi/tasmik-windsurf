-- TASMIK WINDSURF - COMPLETE DATABASE SETUP
-- Version: 2.0 (Phase 2 Complete)
-- Last Updated: 2025-01-21
-- 
-- This script sets up the complete database from scratch
-- Includes: Users, Students, Classes, Reports tables with RLS policies
-- 
-- USAGE: Run this script in Supabase SQL Editor for new installations

-- =====================================================
-- PHASE 1: ORIGINAL MEMORIZATION SYSTEM
-- =====================================================

-- 1. Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'parent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 2. Students Table (Basic + Class Assignment)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES users(id),
  assigned_teacher_id UUID REFERENCES users(id),
  class_id UUID REFERENCES classes(id), -- Will be added after classes table
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students Indexes
CREATE INDEX IF NOT EXISTS idx_students_parent_id ON students(parent_id);
CREATE INDEX IF NOT EXISTS idx_students_assigned_teacher_id ON students(assigned_teacher_id);

-- Students RLS Policies
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view own children" ON students;
CREATE POLICY "Parents can view own children" ON students
  FOR SELECT USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can view assigned students" ON students;
CREATE POLICY "Teachers can view assigned students" ON students
  FOR SELECT USING (assigned_teacher_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all students" ON students;
CREATE POLICY "Admins can view all students" ON students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 3. Reports Table (Memorization Tracking)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  report_date DATE NOT NULL,
  verses_memorized INTEGER DEFAULT 0,
  verses_reviewed INTEGER DEFAULT 0,
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  notes TEXT,
  teacher_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports Indexes
CREATE INDEX IF NOT EXISTS idx_reports_student_id ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_teacher_id ON reports(teacher_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date);

-- Reports RLS Policies
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view children reports" ON reports;
CREATE POLICY "Parents can view children reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can view assigned student reports" ON reports;
CREATE POLICY "Teachers can view assigned student reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can manage assigned student reports" ON reports;
CREATE POLICY "Teachers can manage assigned student reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all reports" ON reports;
CREATE POLICY "Admins can view all reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- PHASE 2: CLASS ASSIGNMENT SYSTEM
-- =====================================================

-- 4. Classes Table (New in Phase 2)
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert 9 Islamic Classes
INSERT INTO classes (name) VALUES 
  ('Abu Dawood'),
  ('Bayhaqi'),
  ('Bukhari'),
  ('Darimi'),
  ('Ibn Majah'),
  ('Muslim'),
  ('Nasaie'),
  ('Tabrani'),
  ('Tirmidhi')
ON CONFLICT (name) DO NOTHING;

-- Classes RLS Policies
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_read_classes" ON classes;
CREATE POLICY "authenticated_users_can_read_classes" ON classes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admin_users_can_modify_classes" ON classes;
CREATE POLICY "admin_users_can_modify_classes" ON classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- 5. Add class_id column to students (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'class_id'
  ) THEN
    ALTER TABLE students ADD COLUMN class_id UUID REFERENCES classes(id);
  END IF;
END $$;

-- Add class_id index
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Verify setup
SELECT 'Setup verification:' as info;
SELECT 'Users table:' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'Students table:', COUNT(*) FROM students
UNION ALL
SELECT 'Classes table:', COUNT(*) FROM classes
UNION ALL
SELECT 'Reports table:', COUNT(*) FROM reports;

SELECT 'Classes available:' as info;
SELECT id, name FROM classes ORDER BY name;

SELECT 'Setup complete!' as status;
