# Online Self-Enrollment Flow

This document records the intended student self-enrollment and teacher availability flow.
The self-service student purchase UI is intentionally hidden until teacher availability,
same-teacher validation, and recurring package visibility are stable.

## Manual-Assign MVP

Self-enrollment is postponed for the current deploy. The production MVP is:

1. Admin creates or updates the student's online package manually.
2. Student sees the admin-assigned current plan, billing history, and payment action.
3. Teacher availability can be configured and refined, but it is preparation for the
   future self-enrollment release.

Do not enable the student or family `Available plans` picker for this MVP. The package
picker should remain behind `SHOW_SELF_SERVICE_AVAILABLE_PLANS = false` until the
same-teacher validation and availability preview are ready for real users.

The deploy must include:

- `2026-06-11_online_recurring_package_slot_effective_dates.sql`
- `2026-06-11_online_teacher_availability_source.sql`

## Target Student Flow

This is the deferred future flow, not the current MVP:

1. Student signs up or logs in.
2. Student browses available online packages.
3. Student selects one course package and the required weekly class slots.
4. UI validates the selected combination before hold:
   - each selected slot belongs to the selected active course,
   - each selected slot is an active slot template,
   - at least one same teacher is available for every selected weekly slot.
5. Backend creates a held package through the recurring package claim authority.
6. Student pays through the existing Billplz flow.
7. Successful payment activates the package.
8. Teacher receives the primary notification only after paid activation.

If no valid combinations exist, the student UI should show `Contact Admin to Enroll`
and link to the admin Telegram contact instead of allowing a broken hold.

## Current Phase

- Student self-service package selection remains hidden.
- `Current plan`, `Billing history`, and `Make payment` stay available.
- Current plans are driven by admin-configured online packages.
- Teachers can configure availability for future online self-enrollments at
  `/teacher/online-availability`.

## Teacher Availability Rules

- Teachers do not need to configure slots before adjusting existing student classes.
- The availability page is for future new online enrollments only.
- Availability changes do not move current classes.
- Availability days are collapsed by default. Teachers expand one day at a time to keep
  the page clean.
- Teacher availability is selected per day/time for flexibility, but the page dedupes
  templates so each visible slot is unique by `day_of_week + start_time`.
- Clicking an available time opens a same-time day editor so teachers can set that time
  across multiple days without scrolling through every day section.
- Teacher availability for new enrollment uses canonical 30-minute blocks only:
  `:00` and `:30` start times with `duration_minutes = 30`.
- Legacy or flexible-schedule templates with custom minutes, such as `10:25 AM`, are
  kept for existing scheduling history but are not shown in the self-enrollment
  availability grid.
- When active templates define a day/time range but have gaps, the teacher availability
  API repairs the range by creating missing canonical 30-minute templates. For example,
  if `6:00 AM` and `7:00 AM` exist, `6:30 AM` should also exist for availability.
- Availability is teacher-level in this phase; teachers do not choose availability per
  course.
- Any available time must have at least 2 free, unoccupied days. For example, `6:00 AM`
  on Monday only is not useful for new enrollment and should be blocked until another
  free day is selected or the time is turned off.
- Occupied/in-use slots do not count as free availability for new enrollment capacity.
- Weekend slots appear only when admin has active weekend slot templates; teachers can
  select or skip those days manually.
- Teacher availability rows are stored in `online_teacher_slot_preferences`.
- `availability_source` tracks how the row was created:
  - `manual`: explicitly set by teacher/admin availability tools.
  - `auto_schedule`: created implicitly because a teacher flexibly scheduled a student there.
- One teacher-slot supports one active, pending-payment, or draft package for MVP.

## Same-Teacher Guardrail

Students see aggregated available class times, not teacher-specific slots.

The backend must only allow a selected slot combination if at least one same teacher can
cover all selected weekly slots. This prevents the invalid case where each individual
slot exists, but the selected set is split across different teachers.

Final authority stays in `claim_online_recurring_package_atomic`:

1. Load candidate teachers available for each selected slot.
2. Intersect candidates across all selected slots.
3. Reject if the intersection is empty.
4. Exclude candidates with active/pending/draft conflicts.
5. Assign deterministically by:
   - lowest active load,
   - oldest `last_assigned_at`,
   - stable teacher id.

The future student preview/helper endpoint should use the same combination logic so the
UI can disable invalid combinations before claim, but the atomic claim must still enforce
the rule.

## Flexible Teacher Reschedule Behavior

Teachers can continue adjusting student slots flexibly from attendance/scheduling flows.
Teacher-created slot edits use fixed 30-minute controls (`:00` or `:30`) so they stay
compatible with availability and self-enrollment.

When a teacher schedules or reschedules a student into a slot:

- Resolve or create the matching `online_slot_templates` row if needed.
- Write teacher availability for the new teacher-slot as `auto_schedule` only when the
  row is created implicitly.
- If the row already exists as `manual`, preserve `manual`.

When a teacher moves a student away from an old slot:

- Keep availability if the old teacher-slot is `manual`.
- Disable the old availability only if it is `auto_schedule` and no active,
  pending-payment, or draft recurring package still uses that teacher-slot.

This keeps teacher-controlled availability stable while cleaning up implicit slots that
only existed because of flexible scheduling.

## Admin Reassignment Behavior

Admin reassignment remains the source of truth for correcting teacher and slot assignment.
Admin can change teacher/slot using the current setup. After admin changes, the assigned
teacher should still see the student in the existing teacher scheduling/attendance flow.

Admin-created or admin-toggled availability should be stored as `manual`.

## Notifications And Visibility

- Do not notify teachers on `pending_payment` as the main alert.
- Admin should be able to see pending holds and payments.
- Teacher primary notification should happen after paid package activation.
- New notification and visibility logic should use `online_recurring_packages`, not the
  older `online_slot_claims` data path.

## Edge Cases

- Multiple teachers qualify for the same selected combination:
  assign by lowest active load, oldest `last_assigned_at`, then stable teacher id.
- Slots exist but are split across teachers:
  reject the combination because no same teacher covers all selected slots.
- Teacher cannot take a newly assigned student:
  admin reassigns teacher/slot through the current admin setup.
- Teacher removes availability for a slot currently in use:
  the slot remains visible as in use; current classes are not moved by availability changes.
- Teacher selects only one free day for a time:
  block save and ask for at least 2 free days for that time, or turn the time off.
- Active templates contain duplicate course rows for the same day/time:
  teacher availability UI shows one visible slot and saves availability to all matching
  active slot templates.
- Active templates contain custom-minute legacy rows:
  teacher availability hides those rows and only uses canonical 30-minute enrollment
  blocks.
- No active slot templates exist:
  teacher availability page shows an empty state and asks admin to create online slot templates.
- No valid student combinations exist:
  show `Contact Admin to Enroll`.

## Test Coverage To Keep

- Migration backfills existing availability rows as `manual`.
- Teacher can save and discard availability changes.
- Teacher availability UI does not show duplicate slots for the same day/time.
- Teacher availability day sections are collapsed by default and expand one day at a time.
- Same-time day editor can update multiple days in the draft before save.
- Teacher availability UI does not show custom-minute times like `10:25 AM`.
- Teacher schedule edit UI rejects custom-minute values and only allows `:00` or `:30`.
- Teacher availability includes missing half-hour blocks inside active day ranges, such
  as `6:30 AM` between `6:00 AM` and `7:00 AM`.
- Teacher cannot save a time with only 1 free available day.
- Manual availability is not removed after rescheduling a student away.
- Auto-created availability is removed only when no active, pending-payment, or draft
  package still uses it.
- Student cannot enroll in combinations split across different teachers.
- Student can enroll when one teacher covers every selected slot.
- Multiple eligible teachers assign deterministically by load, `last_assigned_at`, and id.
- Existing attendance and flexible teacher reschedule continue to work.
- Admin reassignment flow remains unchanged.
- `npm run lint` and `npm run build` pass.
