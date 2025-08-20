-- ADD MEMORIZATION COMPLETION TRACKING
-- This script adds automatic completion detection for students who finished memorizing the Quran
-- Run this in Supabase SQL Editor to add completion tracking functionality

-- =====================================================
-- STEP 1: ADD COMPLETION FIELDS TO STUDENTS TABLE
-- =====================================================

-- Add memorization_completed boolean field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'memorization_completed'
  ) THEN
    ALTER TABLE students ADD COLUMN memorization_completed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add memorization_completed_date timestamp field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'memorization_completed_date'
  ) THEN
    ALTER TABLE students ADD COLUMN memorization_completed_date TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_memorization_completed ON students(memorization_completed);
CREATE INDEX IF NOT EXISTS idx_students_memorization_completed_date ON students(memorization_completed_date);

-- =====================================================
-- STEP 2: CREATE COMPLETION DETECTION FUNCTION
-- =====================================================

-- Function to check if a student has completed memorization
CREATE OR REPLACE FUNCTION check_student_memorization_completion(student_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    max_page_reached INTEGER;
BEGIN
    -- Get the highest page_to value from Tasmik reports for this student
    SELECT COALESCE(MAX(page_to), 0) INTO max_page_reached
    FROM reports 
    WHERE student_id = student_uuid 
    AND type = 'Tasmi' 
    AND page_to IS NOT NULL;
    
    -- Check if student has reached page 604 (end of Quran)
    RETURN max_page_reached >= 604;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: CREATE AUTO-UPDATE TRIGGER
-- =====================================================

-- Function to automatically update completion status when reports are added/updated
CREATE OR REPLACE FUNCTION auto_update_memorization_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process Tasmik reports
    IF NEW.type = 'Tasmi' AND NEW.page_to IS NOT NULL THEN
        -- Check if this student has completed memorization
        IF check_student_memorization_completion(NEW.student_id) THEN
            -- Update student as completed if not already marked
            UPDATE students 
            SET 
                memorization_completed = TRUE,
                memorization_completed_date = COALESCE(memorization_completed_date, NOW())
            WHERE id = NEW.student_id 
            AND memorization_completed = FALSE;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on reports table
DROP TRIGGER IF EXISTS trigger_auto_update_memorization_completion ON reports;
CREATE TRIGGER trigger_auto_update_memorization_completion
    AFTER INSERT OR UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_memorization_completion();

-- =====================================================
-- STEP 4: MANUAL COMPLETION FUNCTIONS FOR ADMIN
-- =====================================================

-- Function for admin to manually mark student as completed
CREATE OR REPLACE FUNCTION admin_mark_student_completed(student_uuid UUID, completed BOOLEAN)
RETURNS VOID AS $$
BEGIN
    UPDATE students 
    SET 
        memorization_completed = completed,
        memorization_completed_date = CASE 
            WHEN completed AND memorization_completed_date IS NULL THEN NOW()
            WHEN NOT completed THEN NULL
            ELSE memorization_completed_date
        END
    WHERE id = student_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: BULK UPDATE EXISTING STUDENTS
-- =====================================================

-- Check and update completion status for all existing students
DO $$
DECLARE
    student_record RECORD;
BEGIN
    FOR student_record IN 
        SELECT id FROM students WHERE memorization_completed = FALSE
    LOOP
        IF check_student_memorization_completion(student_record.id) THEN
            PERFORM admin_mark_student_completed(student_record.id, TRUE);
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Show updated table structure
SELECT 'Students table structure:' as info;
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'students' 
AND column_name IN ('memorization_completed', 'memorization_completed_date')
ORDER BY ordinal_position;

-- Show completion statistics
SELECT 'Completion statistics:' as info;
SELECT 
    COUNT(*) as total_students,
    COUNT(CASE WHEN memorization_completed = TRUE THEN 1 END) as completed_students,
    COUNT(CASE WHEN memorization_completed = FALSE THEN 1 END) as active_students
FROM students;

-- Show recently completed students
SELECT 'Recently completed students:' as info;
SELECT 
    name,
    memorization_completed_date,
    memorization_completed
FROM students 
WHERE memorization_completed = TRUE
ORDER BY memorization_completed_date DESC
LIMIT 10;

SELECT 'Memorization completion tracking setup complete!' as status;