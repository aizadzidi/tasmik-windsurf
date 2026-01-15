-- CRM stages configuration per tenant and record type.
-- Run via Supabase SQL editor or psql as coordinated.

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  record_type text not null,
  stage_key text not null,
  label text not null,
  sort_order integer not null default 0,
  color_bg text,
  color_text text,
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists crm_stages_tenant_record_stage_key
  on public.crm_stages (tenant_id, record_type, stage_key);

create index if not exists crm_stages_tenant_record_order_idx
  on public.crm_stages (tenant_id, record_type, sort_order);

create index if not exists crm_stages_tenant_active_idx
  on public.crm_stages (tenant_id, is_active);

-- Default stages per tenant (adjust tenant id when running).
-- Example:
-- insert into public.crm_stages
--   (tenant_id, record_type, stage_key, label, sort_order, color_bg, color_text, is_active)
-- values
--   ('<tenant_id>', 'prospect', 'interested', 'Interested', 1, '#E0F2FE', '#0369A1', true),
--   ('<tenant_id>', 'prospect', 'interviewed', 'Interviewed', 2, '#FEF3C7', '#B45309', true),
--   ('<tenant_id>', 'prospect', 'trial', 'Done Trial', 3, '#CCFBF1', '#0F766E', true),
--   ('<tenant_id>', 'prospect', 'registered', 'Registered', 4, '#DCFCE7', '#15803D', true),
--   ('<tenant_id>', 'prospect', 'lost_interest', 'Lost Interest', 5, '#F1F5F9', '#475569', true),
--   ('<tenant_id>', 'student', 'active', 'Active', 1, '#DCFCE7', '#15803D', true),
--   ('<tenant_id>', 'student', 'discontinued', 'Discontinued', 2, '#F1F5F9', '#475569', true);
