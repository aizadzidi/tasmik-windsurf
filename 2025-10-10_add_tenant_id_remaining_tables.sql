-- Adds tenant_id to remaining tables and backfills with default tenant.
-- Run this in Supabase SQL editor (write access required).

begin;

alter table public.class_subjects
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.subject_opt_outs
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.lesson_topics
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.lesson_subtopic_progress
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.lesson_class_subject_year
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.school_holidays
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.school_holiday_classes
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.juz_tests
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.juz_test_notifications
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.test_sessions
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.conduct_criterias
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.conduct_entries
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.conduct_scores
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.conduct_scores_old_20250923
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.grading_systems
  add column if not exists tenant_id uuid references public.tenants(id);

alter table public.payment_fee_catalog
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.child_fee_assignments
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.payment_line_items
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.parent_balance_adjustments
  add column if not exists tenant_id uuid references public.tenants(id);
-- Skipping views: due_fee_months, parent_outstanding_summary,
-- parent_child_outstanding, paid_line_items.

create index if not exists class_subjects_tenant_id_idx on public.class_subjects (tenant_id);
create index if not exists subject_opt_outs_tenant_id_idx on public.subject_opt_outs (tenant_id);
create index if not exists lesson_topics_tenant_id_idx on public.lesson_topics (tenant_id);
create index if not exists lesson_subtopic_progress_tenant_id_idx on public.lesson_subtopic_progress (tenant_id);
create index if not exists lesson_class_subject_year_tenant_id_idx on public.lesson_class_subject_year (tenant_id);
create index if not exists school_holidays_tenant_id_idx on public.school_holidays (tenant_id);
create index if not exists school_holiday_classes_tenant_id_idx on public.school_holiday_classes (tenant_id);
create index if not exists juz_tests_tenant_id_idx on public.juz_tests (tenant_id);
create index if not exists juz_test_notifications_tenant_id_idx on public.juz_test_notifications (tenant_id);
create index if not exists test_sessions_tenant_id_idx on public.test_sessions (tenant_id);
create index if not exists conduct_criterias_tenant_id_idx on public.conduct_criterias (tenant_id);
create index if not exists conduct_entries_tenant_id_idx on public.conduct_entries (tenant_id);
create index if not exists conduct_scores_tenant_id_idx on public.conduct_scores (tenant_id);
create index if not exists conduct_scores_old_20250923_tenant_id_idx on public.conduct_scores_old_20250923 (tenant_id);
create index if not exists grading_systems_tenant_id_idx on public.grading_systems (tenant_id);
create index if not exists payment_fee_catalog_tenant_id_idx on public.payment_fee_catalog (tenant_id);
create index if not exists child_fee_assignments_tenant_id_idx on public.child_fee_assignments (tenant_id);
create index if not exists payment_line_items_tenant_id_idx on public.payment_line_items (tenant_id);
create index if not exists parent_balance_adjustments_tenant_id_idx on public.parent_balance_adjustments (tenant_id);

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.class_subjects t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.subject_opt_outs t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.lesson_topics t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.lesson_subtopic_progress t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.lesson_class_subject_year t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.school_holidays t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.school_holiday_classes t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.juz_tests t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.juz_test_notifications t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.test_sessions t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.conduct_criterias t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.conduct_entries t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.conduct_scores t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.conduct_scores_old_20250923 t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.grading_systems t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.payment_fee_catalog t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.child_fee_assignments t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.payment_line_items t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;

with tenant_row as (
  select id from public.tenants where slug = 'akademialkhayr' limit 1
)
update public.parent_balance_adjustments t
set tenant_id = tr.id
from tenant_row tr
where t.tenant_id is null;


commit;
