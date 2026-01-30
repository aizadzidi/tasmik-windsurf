# Support Playbook: Verification + Payments

## Common Cases

### 1) Contact details incorrect
- Confirm the email/phone is correct in the user profile.
- Update the profile if needed, then retry.

### 2) Cannot activate enrollment
- Confirm `students.parent_id` exists and matches the parent.
- Ensure enrollment status is updated to `active`.

### 3) Payment pending but user paid
- Check payment provider dashboard for transaction status.
- If paid, mark enrollment `active` and log reason in `metadata.status_reason`.
- If provider shows failed, keep `pending_payment` and notify user.

### 4) Payment page shows wrong charges
- Confirm child + program selection in UI.
- Verify enrollment record exists for that child/program.
- If mismatch persists, export: parent ID, enrollment ID, program type.

## Escalation Checklist
Provide:
- Parent email
- Student ID
- Enrollment ID
- Current status
- Payment reference (if any)
- Timestamp of last action
