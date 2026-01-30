# Online + Campus Rollout Steps

## 1) Run Schema
- Run: `2026-01-27_programs_enrollments.sql`
- Run: `2026-01-27_teacher_assignments.sql`
- Run: `2026-01-27_program_access_rls.sql`
- Run: `2026-01-27_enrollment_lifecycle.sql`
- If you already ran the old status list, run: `2026-01-29_enrollments_status_simplify.sql`
- Rollback: `2026-01-27_programs_enrollments_rollback.sql`
- Rollback: `2026-01-27_teacher_assignments_rollback.sql`
- Rollback: `2026-01-27_program_access_rls_rollback.sql`
- Rollback: `2026-01-27_enrollment_lifecycle_rollback.sql`
- Rollback: `2026-01-29_enrollments_status_simplify_rollback.sql`

## 2) Seed Programs + Backfill Enrollments
- Run: `2026-01-27_programs_seed.sql`
- Run: `2026-01-27_teacher_assignments_seed.sql`
- Rollback: `2026-01-27_programs_seed_rollback.sql`
- Rollback: `2026-01-27_teacher_assignments_seed_rollback.sql`

## 3) Verification Queries
```sql
-- Programs
select type, name, count(*)
from public.programs
group by type, name;

-- Campus enrollments count
select count(*) as campus_enrollments
from public.enrollments e
join public.programs p on p.id = e.program_id
where p.type = 'campus';

-- Any students missing enrollments
select count(*) as students_without_enrollment
from public.students s
left join public.enrollments e on e.student_id = s.id and e.tenant_id = s.tenant_id
where (s.record_type is null or s.record_type <> 'prospect')
  and e.id is null;

-- Enrollment audit log sanity
select to_status, count(*)
from public.enrollment_status_events
group by to_status;
```

## 4) UI/Access Validation
- Online parent:
  - Can access `/parent` and `/parent/payments`.
  - Redirected away from `/parent/exam`.
- Online teacher:
  - Can access `/teacher` report dashboard.
  - Redirected away from `/teacher/attendance`, `/teacher/lesson`, `/teacher/exam`.
- Campus users:
  - All existing pages accessible as before.

## 5) Campus Regression Checklist
- Teacher:
  - Attendance load + save for a campus class.
  - Lesson planning + subtopic progress updates.
  - Exam creation + mark entry (if enabled).
- Parent:
  - Reports load (Tasmi/Murajaah/Juz tests).
  - Payments page loads and shows campus charges only.
- Admin:
  - Students CRUD works.
  - Teacher assignment and reports views load.

## 6) Verification Guardrails
- New signups must confirm email before login.
- Unverified users are signed out and redirected to `/login`.

## 7) Enrollment Lifecycle Ops
- Enrollment status changes are logged in `public.enrollment_status_events`.

## 8) Operational Notes
- All existing students are enrolled as `campus`.
- Add online enrollments manually for online users.
- If you later add `hybrid`, update gating logic and seed.
