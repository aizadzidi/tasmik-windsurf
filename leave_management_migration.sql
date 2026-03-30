-- Leave Management Migration
-- Creates leave_entitlements, leave_applications, and leave_balances tables

-- 1. Leave Entitlements (configurable annual leave quotas per position per tenant)
CREATE TABLE IF NOT EXISTS leave_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  days_per_year INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, position, leave_type)
);

-- 2. Leave Applications
CREATE TABLE IF NOT EXISTS leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  review_remarks TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_applications_tenant
  ON leave_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_user_tenant
  ON leave_applications(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status_tenant
  ON leave_applications(status, tenant_id);

-- 3. Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  entitled_days INTEGER NOT NULL,
  used_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, leave_type, year)
);

-- Enable RLS on all tables
ALTER TABLE leave_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

-- RLS policies for leave_entitlements
CREATE POLICY "leave_entitlements_select" ON leave_entitlements
  FOR SELECT USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

CREATE POLICY "leave_entitlements_service" ON leave_entitlements
  FOR ALL USING (true) WITH CHECK (true);

-- RLS policies for leave_applications
CREATE POLICY "leave_applications_select_own" ON leave_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id = (current_setting('app.tenant_id', true))::uuid
  );

CREATE POLICY "leave_applications_service" ON leave_applications
  FOR ALL USING (true) WITH CHECK (true);

-- RLS policies for leave_balances
CREATE POLICY "leave_balances_select_own" ON leave_balances
  FOR SELECT USING (
    user_id = auth.uid()
    OR tenant_id = (current_setting('app.tenant_id', true))::uuid
  );

CREATE POLICY "leave_balances_service" ON leave_balances
  FOR ALL USING (true) WITH CHECK (true);
