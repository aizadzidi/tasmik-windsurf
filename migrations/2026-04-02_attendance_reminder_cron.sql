-- Migration: Setup pg_cron job for daily attendance reminder notifications
-- Triggers at 10:00 AM MYT (2:00 AM UTC) on weekdays (Mon-Fri)
-- Idempotent: safe to re-run
--
-- PREREQUISITES:
-- 1. Enable pg_cron extension from Supabase Dashboard > Database > Extensions
-- 2. Enable pg_net extension from Supabase Dashboard > Database > Extensions
-- 3. Deploy the check-attendance-reminders Edge Function
-- 4. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT as Edge Function secrets
--
-- IMPORTANT: Replace the placeholder values below before running:
-- - <SUPABASE_PROJECT_URL> → your Supabase project URL (e.g. https://xxxx.supabase.co)
-- - <SERVICE_ROLE_KEY> → your service role key (Project Settings > API > service_role)

-- Unschedule existing job if it exists (idempotent)
SELECT cron.unschedule('attendance-reminder-10am')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-reminder-10am');

-- Schedule the attendance reminder (10:00 AM MYT = 2:00 AM UTC, Mon-Fri)
SELECT cron.schedule(
  'attendance-reminder-10am',
  '0 2 * * 1-5',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/check-attendance-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To check job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- To unschedule:
-- SELECT cron.unschedule('attendance-reminder-10am');
