-- Hot-path indexes for teacher online attendance.
-- These keep first paint, daily marking, schedule save, and slot removal on narrow indexed scans.

create index if not exists online_recurring_occurrences_teacher_active_date_start_idx
  on public.online_recurring_occurrences (tenant_id, teacher_id, session_date, start_time)
  where cancelled_at is null;

create index if not exists online_recurring_occurrences_package_slot_active_date_idx
  on public.online_recurring_occurrences (tenant_id, package_slot_id, session_date)
  where cancelled_at is null;

create index if not exists online_recurring_package_slots_package_active_time_idx
  on public.online_recurring_package_slots (
    tenant_id,
    package_id,
    day_of_week_snapshot,
    start_time_snapshot
  )
  where status = 'active';

create index if not exists online_recurring_packages_teacher_active_month_idx
  on public.online_recurring_packages (tenant_id, teacher_id, effective_month, effective_to)
  where status in ('active', 'pending_payment', 'draft');

create index if not exists online_student_package_assignments_teacher_schedulable_idx
  on public.online_student_package_assignments (tenant_id, teacher_id, effective_to, effective_from desc)
  where status in ('active', 'pending_payment');
