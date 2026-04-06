-- Migration: Push Subscriptions for Web Push Notifications
-- Purpose: Store browser push subscription data for teachers to receive attendance reminders
-- Idempotent: safe to re-run

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)  -- one endpoint = one user (prevents shared device notification leaks)
);

-- RLS: users can only manage their own subscriptions + tenant must match user_profiles
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can insert own push subscriptions'
  ) THEN
    CREATE POLICY "Users can insert own push subscriptions"
      ON push_subscriptions FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid()
            AND up.tenant_id = push_subscriptions.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can view own push subscriptions'
  ) THEN
    CREATE POLICY "Users can view own push subscriptions"
      ON push_subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can update own push subscriptions'
  ) THEN
    CREATE POLICY "Users can update own push subscriptions"
      ON push_subscriptions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = auth.uid()
            AND up.tenant_id = push_subscriptions.tenant_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Users can delete own push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete own push subscriptions"
      ON push_subscriptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- SECURITY DEFINER function to safely upsert push subscriptions.
-- Handles shared device case: if another user previously subscribed on the same browser,
-- their old row is removed first (which RLS would block for a normal user).
-- Validates tenant ownership before inserting.
CREATE OR REPLACE FUNCTION upsert_push_subscription(
  p_user_id UUID,
  p_tenant_id UUID,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the user they claim to be
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  -- Verify the user belongs to the claimed tenant
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.user_id = p_user_id AND up.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'tenant_id mismatch';
  END IF;

  -- Remove any existing subscription for this endpoint (handles shared devices)
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;

  -- Insert the new subscription
  INSERT INTO push_subscriptions (user_id, tenant_id, endpoint, p256dh, auth)
  VALUES (p_user_id, p_tenant_id, p_endpoint, p_p256dh, p_auth);

  RETURN TRUE;
END;
$$;

-- Note: service_role bypasses RLS by default in Supabase,
-- so no explicit service role policy is needed for Edge Functions.

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON push_subscriptions(tenant_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trigger_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscriptions_updated_at();
