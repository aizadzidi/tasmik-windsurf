# Online + Campus Merge Implementation Checklist

## 1) Product & Scope Decisions
- [x] Define program types: `online`, `campus`, `hybrid` (and freeze naming).
- [ ] Define what is shared vs. program-specific across: curriculum, schedule, attendance, reports, comms, payments.
- [ ] Decide enrollment ownership: parent vs. student vs. admin (and fallback paths).
- [ ] Define supported user journeys: new signup, existing campus parent adding online child, online-only parent adding campus child.
- [ ] Define success metrics (conversion, retention, completion) for each program type.

## 2) Roles, Context, and Permissions
- [ ] Roles are stable (Parent, Student, Teacher, Admin) and do NOT change by program type.
- [ ] Use *context* to determine scope: `selected_child + selected_program`.
- [ ] Parent can see only their children; Student can see only self.
- [ ] Teacher can see only assigned classes (no global visibility).
- [ ] Admin can see all within tenant.
- [ ] Document role x program matrix for all pages/routes.

## 3) Data Model (Core)
- [x] `programs` with `type`, `rules`, `location/virtual`, `pricing_model`.
- [ ] `students` linked to `parent` (guardian).
- [x] `enrollments` link `student_id + program_id` with lifecycle status.
- [ ] `classes` tied to `program_id` and `teacher_assignment`.
- [x] `teacher_assignments` scoped to specific classes/programs.
- [ ] Payment entity attached to `enrollment` (not just user).
- [x] Include `tenant_id` on all new tables and joins (if multi-tenant).

## 4) Enrollment Lifecycle & Status
- [x] Define statuses: `draft`, `pending_payment`, `active`, `paused`, `cancelled`, `completed`.
- [x] Audit log for status changes (who/when/why).
- [ ] Auto-expire inactive drafts (e.g., 30 days).
- [x] Define reactivation rules for paused/cancelled.

## 5) Verification & Identity
- [x] Enable email/phone verification in Supabase.
- [ ] Do NOT allow `active` enrollment without verified contact.
- [x] In-app handling for unverified users (UI + route guards).
- [ ] Allow resend verification with throttle.
- [ ] Decide if phone OTP or email confirm is required for enrollment.

## 6) UI/UX Structure
- [x] Single app, single dashboard per role.
- [x] UI gating by `program_type` and `teaching_assignment`.
- [x] No UI redesign; preserve existing UI structure for campus flows.
- [ ] Child switcher for Parent (shows program badge).
- [ ] Program badge visible in key screens (avoid context confusion).
- [x] Separate online vs campus modules inside the same role UI.
- [x] Online UI scope (no redesign):
  - [x] Teacher (online): report dashboard only.
  - [x] Student/Parent (online): report dashboard + payments only.

## 7) Feature Gating (Front + Back)
- [ ] Build a `featureGate(program_type, role)` map.
- [x] Frontend hides irrelevant modules for online users.
- [x] Backend enforces access (do not rely on UI only).
- [ ] Use consistent gate checks in routes and API calls.

## 8) Security & RLS
- [ ] RLS policies enforce:
  - [ ] Parent = own children only
  - [ ] Teacher = assigned classes only
  - [ ] Student = self only
  - [ ] Program scoping in all joins (no cross-program leakage)
- [x] Tenant scoping applied to all policies and queries (if multi-tenant).
- [ ] Verify tenant isolation (if multi-tenant).
- [ ] Review data access for reports/exports.

## 9) Payments & Billing
- [ ] Pricing models per program type (subscription vs one-off).
- [ ] Parent-level billing per enrollment.
- [ ] Payment status tied to enrollment lifecycle.
- [ ] Avoid campus charges showing in online UI and vice versa.

## 10) Notifications & Comms
- [ ] Notification templates by program type.
- [ ] Ensure only relevant notifications per child/program.
- [ ] Verify SMS/email opt-out & consent (if applicable).

## 11) Reports & Analytics
- [ ] Separate KPIs for online vs campus.
- [ ] Filters by program type on dashboards/reports.
- [ ] Track conversion: verified → enrolled → active.

## 12) Migration Plan
- [x] Map existing campus data to `programs` and `enrollments`.
- [x] Backfill `program_id` for historical records.
- [x] Verify teacher assignments migration.
- [x] Validate RLS & access after migration.
- [x] Backfill `tenant_id` on new tables and add constraints (if multi-tenant).

## 13) Teacher Experience
- [ ] Teacher home is role-based, not program-based.
- [ ] Online teacher modules: live link, recordings, online attendance.
- [ ] Campus teacher modules: physical attendance, location, onsite assets.
- [ ] Shared modules: lesson plan, student progress, assessments.

## 14) Parent & Student Experience
- [ ] Parent can manage multiple children with mixed programs.
- [ ] Student views are program-specific and simplified.
- [ ] Enrollment flow uses shared steps with program-specific differences.

## 15) Edge Cases
- [ ] Parent with multiple children, different program types.
- [ ] Student switching from online → campus (or hybrid upgrade).
- [ ] Teacher assigned to both online and campus.
- [ ] Parent verified but no enrollment (lead follow-up).
- [ ] Incomplete payment after verification.

## 16) Operational Controls
- [ ] Admin override for enrollment status.
- [ ] Bulk import for offline registrations.
- [ ] Data review queue for pending_payment.
- [ ] Audit logs for admin actions.

## 17) Testing & QA
- [ ] Unit tests for gating logic & lifecycle transitions.
- [ ] RLS tests (simulate each role).
- [ ] E2E: signup → verify → enroll → payment → dashboard.
- [x] Regression checks for existing campus flows.

## 18) Documentation & Runbooks
- [x] Update README/implementation docs with new program model.
- [x] Admin SOP for verification + enrollment approval.
- [x] Support playbook for user issues (OTP failure, payment pending).
