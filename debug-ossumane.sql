-- DEBUG OSSUMANE SPECIFICALLY
-- Run this to see exactly what's happening with OSSUMANE

-- Check OSSUMANE's reports and completion status
SELECT 
    s.name,
    s.memorization_completed,
    s.memorization_completed_date,
    MAX(r.page_to) as max_page_reached,
    COUNT(r.id) as total_tasmi_reports,
    check_student_memorization_completion(s.id) as function_says_completed
FROM students s
LEFT JOIN reports r ON s.id = r.student_id AND r.type = 'Tasmi'
WHERE s.name ILIKE '%OSSUMANE%'
GROUP BY s.id, s.name, s.memorization_completed, s.memorization_completed_date;

-- Show OSSUMANE's latest Tasmi reports
SELECT 
    'Latest Tasmi reports:' as info,
    r.type,
    r.page_from,
    r.page_to,
    r.date
FROM reports r
JOIN students s ON r.student_id = s.id
WHERE s.name ILIKE '%OSSUMANE%' 
AND r.type = 'Tasmi'
ORDER BY r.date DESC
LIMIT 10;