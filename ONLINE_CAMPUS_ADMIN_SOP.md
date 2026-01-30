# Admin SOP: Verification + Enrollment Approval

## Purpose
Keep enrollment status aligned with verification and payment while protecting access.

## Roles
- **Admin (school_admin):** Owns enrollment status changes.
- **Parent:** Completes verification + payment.
- **Teacher:** Read-only visibility for assigned students.

## Enrollment Status Rules
Allowed lifecycle:
`draft → pending_payment → active → (paused | cancelled | completed)`

Other notes:
- `cancelled` can be restarted to `pending_payment` by Admin.
- `completed` is terminal (no reactivation).
- `active` requires verified contact (email or phone).

## Daily Checklist
1. **Review pending_payment**
   - Confirm payment is received (Billplz/admin payments).
   - If paid, move to `active`.
2. **Review paused**
   - Decide: resume (`active`) or end (`cancelled`).
3. **Draft cleanup**
   - Review old drafts periodically and cancel if inactive.

## Status Change Process
1. Open the enrollment record (via SQL or Admin UI when available).
2. Update `status` and include `metadata.status_reason` when needed.
3. Verify audit log entry in `public.enrollment_status_events`.

## Common Issues
- **Enrollment fails to activate**
  - Ensure the student has a valid `parent_id`.
- **Enrollment stuck in pending_payment**
  - Verify payment record exists and is marked paid.
  - If paid, update to `active` with reason.
- **Parent says verification email missing**
  - Re-send confirmation in Supabase Auth.
  - Ask parent to check spam or whitelist sender.

## Escalation
If payment data is inconsistent, keep enrollment in `pending_payment`
and notify engineering with:
- Parent email
- Student ID
- Enrollment ID
- Current status
