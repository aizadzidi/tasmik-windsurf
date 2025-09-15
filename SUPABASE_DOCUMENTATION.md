# Supabase Database Documentation

## Overview
This document contains the complete database schema, RLS policies, and setup instructions for the Tasmik Windsurf project. This includes the original memorization report system and the enhanced student class assignment system.

**⚠️ IMPORTANT:** This file must be updated after every Supabase schema change!

## Project Evolution

### Phase 1: Original Memorization Report System
- **Users table**: Authentication for admin, teacher, parent roles
- **Students table**: Basic student records with teacher assignments
- **Reports table**: Memorization progress tracking
- **RLS policies**: Role-based access control

### Phase 2: Enhanced Student Class Assignment System
- **Classes table**: Added class/grade definitions
- **Students table**: Enhanced with class assignments
- **Admin dashboard**: Modern UI with class management
- **Advanced filtering**: Search and filter capabilities

## Database Schema

### 1. Users Table (Original - Phase 1)
```sql
-- Authentication and user management for memorization system
-- Created: Initial project setup
-- Purpose: Role-based authentication (admin, teacher, parent)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'parent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Original)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );
```

### 2. Students Table (Original + Enhanced)
```sql
-- Student records - originally for memorization, enhanced with class assignments
-- Created: Phase 1 (basic), Enhanced: Phase 2 (class assignments)
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES users(id), -- Phase 1: Parent assignment
  assigned_teacher_id UUID REFERENCES users(id), -- Phase 1: Teacher assignment
  class_id UUID REFERENCES classes(id), -- Phase 2: Class assignment (ADDED)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_students_parent_id ON students(parent_id);
CREATE INDEX idx_students_assigned_teacher_id ON students(assigned_teacher_id);
CREATE INDEX idx_students_class_id ON students(class_id); -- Phase 2: Added

-- RLS Policies (Original - Phase 1)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Parents can only see their children
CREATE POLICY "Parents can view own children" ON students
  FOR SELECT USING (parent_id = auth.uid());

-- Teachers can see their assigned students
CREATE POLICY "Teachers can view assigned students" ON students
  FOR SELECT USING (assigned_teacher_id = auth.uid());

-- Admins can see all students
CREATE POLICY "Admins can view all students" ON students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );
```

### 3. Classes Table (Phase 2 - New)
```sql
-- Class/Grade definitions for student assignment system
-- Created: Phase 2 (2025-01-21)
-- Purpose: Organize students into classes/grades
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Data (9 Islamic classes):
INSERT INTO classes (name) VALUES 
  ('Abu Dawood'),
  ('Bayhaqi'),
  ('Bukhari'),
  ('Darimi'),
  ('Ibn Majah'),
  ('Muslim'),
  ('Nasaie'),
  ('Tabrani'),
  ('Tirmidhi');

-- RLS Policies (Phase 2)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read classes
CREATE POLICY "authenticated_users_can_read_classes" ON classes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins can modify classes
CREATE POLICY "admin_users_can_modify_classes" ON classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );
```

### 4. Reports Table (Original - Phase 1)
```sql
-- Memorization progress reports - core functionality
-- Created: Phase 1 (original project purpose)
-- Purpose: Track student memorization progress
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  report_date DATE NOT NULL,
  verses_memorized INTEGER DEFAULT 0,
  verses_reviewed INTEGER DEFAULT 0,
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
  notes TEXT,
  teacher_id UUID REFERENCES users(id), -- Teacher who created the report
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_reports_student_id ON reports(student_id);
CREATE INDEX idx_reports_teacher_id ON reports(teacher_id);
CREATE INDEX idx_reports_date ON reports(report_date);

-- RLS Policies (Original - Phase 1)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Parents can see their children's reports
CREATE POLICY "Parents can view children reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.parent_id = auth.uid()
    )
  );

-- Teachers can see reports for their assigned students
CREATE POLICY "Teachers can view assigned student reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- Teachers can create/update reports for their students
CREATE POLICY "Teachers can manage assigned student reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = reports.student_id 
      AND students.assigned_teacher_id = auth.uid()
    )
  );

-- Admins can see all reports
CREATE POLICY "Admins can view all reports" ON reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );
```

## Row Level Security (RLS) Policies

### Classes Table Policies
```sql
-- Enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read classes
CREATE POLICY "authenticated_users_can_read_classes" ON classes
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);

-- Allow only admins to modify classes
CREATE POLICY "admin_users_can_modify_classes" ON classes
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );
```

### 5. Exam Excluded Students (New)
```sql
-- Per-exam exclusions so specific students are not included in an exam
-- Created: 2025-09-15
CREATE TABLE exam_excluded_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

ALTER TABLE exam_excluded_students ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "admin_can_manage_exam_excluded_students" ON exam_excluded_students
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
CREATE POLICY "authenticated_can_read_exam_excluded_students" ON exam_excluded_students
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

### Students Table Policies (Existing)
```sql
-- Students are managed based on user roles:
-- - Admins: Full access
-- - Teachers: Access to assigned students
-- - Parents: Access to their children only
```

## Database Indexes

### Performance Indexes
```sql
-- Student table indexes
CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_students_assigned_teacher_id ON students(assigned_teacher_id);
CREATE INDEX idx_students_parent_id ON students(parent_id);

-- Classes table indexes (automatic via PRIMARY KEY and UNIQUE constraints)
```

## Database Setup History

### Phase 1: Original Memorization System Setup
```sql
-- 1. Create users table with authentication
-- 2. Create students table with teacher/parent assignments
-- 3. Create reports table for memorization tracking
-- 4. Set up RLS policies for role-based access
-- 5. Create indexes for performance
```

### Phase 2: Class Assignment Enhancement (2025-01-21)
```sql
-- 1. Create classes table with 9 Islamic class names
-- 2. Add class_id column to existing students table
-- 3. Set up RLS policies for classes table
-- 4. Create performance indexes
-- 5. Enhanced admin dashboard with class management
```

## Current Active Setup Scripts

### 1. Complete Database Setup
**File:** `supabase-complete-setup.sql` (Master Script)
```sql
-- Complete database setup from scratch
-- Includes all tables, RLS policies, indexes, and seed data
-- Use this for new installations
```

### 2. Classes System Only
**File:** `classes-rls-only.sql` (Active)
```sql
-- Sets up classes table and working RLS policies
-- Use this to add class functionality to existing installation
```

### 3. Debug and Verification
**File:** `debug-classes.sql` (Active)
```sql
-- Comprehensive debugging for classes table
-- Use this to troubleshoot class assignment issues
```

## Debugging Scripts

### 1. Debug Classes Access
**File:** `debug-classes.sql`
```sql
-- Comprehensive debugging for classes table issues
-- Checks: table existence, RLS policies, data access, table structure
```

### 2. Check Tables
**File:** `check-tables.sql`
```sql
-- Lists all tables in the public schema
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

## Environment Variables

### Required Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Authentication Setup

### User Roles
- **admin**: Full access to all features, can manage students, teachers, parents
- **teacher**: Access to assigned students and classes
- **parent**: Access to their children's data only

### RLS Pattern
```sql
-- Standard pattern for authenticated user access
USING (auth.uid() IS NOT NULL)

-- Standard pattern for admin-only access
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'
    )
)
```

## Common Issues & Solutions

### Issue: Class Dropdowns Empty
**Cause:** RLS policies blocking access
**Solution:** Run `classes-rls-only.sql` to fix policies

### Issue: "relation does not exist" errors
**Cause:** Tables not created or wrong schema
**Solution:** Run setup scripts in order:
1. `create-classes-only.sql`
2. `add-class-column.sql`
3. `classes-rls-only.sql`

### Issue: Permission denied errors
**Cause:** RLS policies too restrictive
**Debug:** Run `debug-classes.sql` to check policies
**Temporary fix:** `disable-classes-rls.sql` (for testing only)

## Future Expansion

### Planned Tables (for exam/quiz system)
```sql
-- These tables are designed but not yet implemented:
subjects (id, name, created_at)
teacher_assignments (teacher_id, class_id, subject_id)
assessments (id, name, type, class_id, subject_id)
student_marks (student_id, assessment_id, marks, grade)
student_conduct (student_id, assessment_id, conduct_scores)
```

### Migration Path
When adding new features:
1. Create table schema
2. Add RLS policies following existing patterns
3. Add indexes for performance
4. Update this documentation
5. Create debug scripts for troubleshooting

## Backup & Recovery

### Important Data to Backup
- `users` table (authentication data)
- `students` table (student records and assignments)
- `classes` table (class definitions)
- `reports` table (memorization data)

### Schema Backup
```sql
-- Export schema
pg_dump --schema-only your_database > schema_backup.sql

-- Export data
pg_dump --data-only your_database > data_backup.sql
```

## Change Log

### 2025-01-21 - Phase 2: Class Assignment System
- ✅ Added `classes` table with 9 Islamic class names
- ✅ Enhanced `students` table with `class_id` column
- ✅ Implemented proper RLS policies for classes
- ✅ Created modern admin dashboard with class management
- ✅ Added advanced search and filtering capabilities
- ✅ Enhanced UI/UX with modern card-based design

### Original - Phase 1: Memorization Report System
- ✅ Created `users` table with role-based authentication
- ✅ Created `students` table with teacher/parent assignments
- ✅ Created `reports` table for memorization tracking
- ✅ Implemented RLS policies for secure access
- ✅ Built dashboards for admin, teacher, and parent roles

---

**Last Updated:** 2025-01-21  
**Version:** 2.0 (Phase 2 Complete)  
**Status:** Production Ready  
**Next Update:** When adding exam/quiz system (Phase 3)
