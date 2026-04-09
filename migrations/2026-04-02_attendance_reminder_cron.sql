-- Migration: Setup pg_cron job for daily attendance reminder notifications
-- Triggers at 10:00 AM MYT (2:00 AM UTC) on weekdays (Mon-Fri)
-- Calls the Next.js API route which sends Web Push notifications via Node.js
-- Idempotent: safe to re-run
--
-- PREREQUISITES:
-- 1. Enable pg_cron extension from Supabase Dashboard > Database > Extensions
-- 2. Enable pg_net extension from Supabase Dashboard > Database > Extensions
-- 3. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and CRON_SECRET in your deployment environment (.env)
--
-- IMPORTANT: Replace the placeholder values below before running:
-- - <APP_URL> → a URL reachable from your Supabase database (e.g. https://yourapp.vercel.app)
--   Do not use localhost here; pg_net runs inside the database environment.
-- - <CRON_SECRET> → the CRON_SECRET value from your .env

-- Unschedule existing job if it exists (idempotent)
SELECT cron.unschedule('attendance-reminder-10am')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-reminder-10am');

-- Schedule the attendance reminder (10:00 AM MYT = 2:00 AM UTC, Mon-Fri)
SELECT cron.schedule(
  'attendance-reminder-10am',
  '0 2 * * 1-5',
  $$
  SELECT net.http_post(
    url := '<APP_URL>/api/cron/attendance-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
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
