-- 1) Enable required extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2) Add a daily notification time to habits
alter table public.habits
  add column if not exists notify_time time without time zone null;

create index if not exists idx_habits_notify_time on public.habits (notify_time);

-- 3) Store user email in profiles so Edge Functions can read it without auth
alter table public.profiles
  add column if not exists email text;

-- 4) Create or replace a cron job that invokes the reminder function every minute
--    We unschedule any existing job with the same name first to avoid duplicates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'habit-reminders-every-minute') THEN
    PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'habit-reminders-every-minute'));
  END IF;
END $$;

select
  cron.schedule(
    'habit-reminders-every-minute',
    '* * * * *',
    $$
    select
      net.http_post(
        url:='https://fyieceytlwhkujccfjpk.supabase.co/functions/v1/send-reminders',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aWVjZXl0bHdoa3VqY2NmanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2NjY1MTksImV4cCI6MjA3MDI0MjUxOX0.igIa3tQzFSSeOQ6pf4z0x-QX2Q7j4y_6vpVQVcmzDjQ"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
  );