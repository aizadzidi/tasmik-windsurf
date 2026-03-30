-- Migration: Create tenant_invites table for teacher invitation system
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  max_uses INT NOT NULL DEFAULT 20,
  use_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_tenant_invites_code ON tenant_invites(code);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant_id ON tenant_invites(tenant_id);

-- RLS policies
ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites for their tenant
CREATE POLICY "Admins can view tenant invites"
  ON tenant_invites
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert tenant invites"
  ON tenant_invites
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update tenant invites"
  ON tenant_invites
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete tenant invites"
  ON tenant_invites
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role needs full access for public API validation
CREATE POLICY "Service role full access to tenant_invites"
  ON tenant_invites
  FOR ALL
  USING (auth.role() = 'service_role');

-- Atomic increment with capacity check to avoid race conditions.
-- Returns true if the increment succeeded, false if the invite is
-- exhausted / inactive / expired (no row matched the WHERE clause).
CREATE OR REPLACE FUNCTION increment_invite_use_count(invite_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE tenant_invites
  SET use_count = use_count + 1, updated_at = NOW()
  WHERE id = invite_id
    AND is_active = TRUE
    AND use_count < max_uses
    AND expires_at > NOW();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
