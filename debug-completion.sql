-- DEBUG COMPLETION DETECTION
-- This script helps debug why completion detection isn't working

-- 1. Check what reports exist for OSSUMANE
SELECT 
    'Reports for OSSUMANE:' as info,
    r.type,
    r.page_from,
    r.page_to,
    r.date,
    s.name as student_name
FROM reports r
JOIN students s ON r.student_id = s.id
WHERE s.name ILIKE '%OSSUMANE%'
ORDER BY r.date DESC;

-- 2. Check current completion status
SELECT 
    'Current completion status:' as info,
    name,
    memorization_completed,
    memorization_completed_date
FROM students 
WHERE name ILIKE '%OSSUMANE%';

-- 3. Test the completion function directly
SELECT 
    'Testing completion function:' as info,
    s.name,
    s.id,
    check_student_memorization_completion(s.id) as should_be_completed
FROM students s
WHERE s.name ILIKE '%OSSUMANE%';

-- 4. Check max page_to for Tasmi reports
SELECT 
    'Max page reached:' as info,
    s.name,
    MAX(r.page_to) as max_page_to,
    COUNT(*) as total_tasmi_reports
FROM students s
LEFT JOIN reports r ON s.id = r.student_id AND r.type = 'Tasmi'
WHERE s.name ILIKE '%OSSUMANE%'
GROUP BY s.name, s.id;

-- 5. Check report types to see if there's a mismatch
SELECT DISTINCT 
    'Report types in database:' as info,
    type,
    COUNT(*) as count
FROM reports 
GROUP BY type
ORDER BY type;