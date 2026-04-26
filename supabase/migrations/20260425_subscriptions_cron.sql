-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-charge daily cron job for subscription billing
--
-- BEFORE running this migration:
--   1. Enable extensions in Supabase Dashboard → Database → Extensions:
--        - pg_cron
--        - pg_net
--   2. Replace YOUR_SERVICE_ROLE_KEY below with the key from:
--        Supabase Dashboard → Settings → API → service_role (secret)
-- ─────────────────────────────────────────────────────────────────────────────

-- Schedule: every day at 08:00 UTC
select cron.schedule(
  'charge-subscriptions-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://gvloygqbavibmpakzdma.supabase.co/functions/v1/charge-due-subscriptions',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- To verify the job was created:
--   select * from cron.job;

-- To remove the job:
--   select cron.unschedule('charge-subscriptions-daily');

-- To change the schedule (e.g. 6 AM):
--   select cron.alter_job(job_id, schedule := '0 6 * * *')
--     from cron.job where jobname = 'charge-subscriptions-daily';
