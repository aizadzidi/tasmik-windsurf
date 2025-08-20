-- FIX MEMORIZATION COMPLETION TRIGGER
-- This script fixes the issue where completion status doesn't update properly
-- Run this in Supabase SQL Editor after the main migration

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_auto_update_memorization_completion ON reports;

-- Create improved trigger function that handles all cases
CREATE OR REPLACE FUNCTION auto_update_memorization_completion()
RETURNS TRIGGER AS $$
DECLARE
    target_student_id UUID;
    is_completed BOOLEAN;
BEGIN
    -- Determine which student to check based on operation type
    IF TG_OP = 'DELETE' THEN
        target_student_id := OLD.student_id;
    ELSE
        target_student_id := NEW.student_id;
    END IF;
    
    -- Only process if it's a Tasmik report
    IF (TG_OP = 'DELETE' AND OLD.type = 'Tasmi') OR 
       (TG_OP != 'DELETE' AND NEW.type = 'Tasmi') THEN
        
        -- Check current completion status
        SELECT check_student_memorization_completion(target_student_id) INTO is_completed;
        
        -- Update student completion status
        UPDATE students 
        SET 
            memorization_completed = is_completed,
            memorization_completed_date = CASE 
                WHEN is_completed AND memorization_completed_date IS NULL THEN NOW()
                WHEN NOT is_completed THEN NULL
                ELSE memorization_completed_date
            END
        WHERE id = target_student_id;
        
    END IF;
    
    -- Return appropriate value based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT, UPDATE, and DELETE
CREATE TRIGGER trigger_auto_update_memorization_completion
    AFTER INSERT OR UPDATE OR DELETE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_memorization_completion();

-- Manually recalculate completion status for all existing students
DO $$
DECLARE
    student_record RECORD;
    is_completed BOOLEAN;
BEGIN
    FOR student_record IN 
        SELECT id FROM students
    LOOP
        SELECT check_student_memorization_completion(student_record.id) INTO is_completed;
        
        UPDATE students 
        SET 
            memorization_completed = is_completed,
            memorization_completed_date = CASE 
                WHEN is_completed AND memorization_completed_date IS NULL THEN NOW()
                WHEN NOT is_completed THEN NULL
                ELSE memorization_completed_date
            END
        WHERE id = student_record.id;
    END LOOP;
END $$;

SELECT 'Completion trigger fixed! All students recalculated.' as status;