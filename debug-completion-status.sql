-- Check OSSUMANE's completion status and function result
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