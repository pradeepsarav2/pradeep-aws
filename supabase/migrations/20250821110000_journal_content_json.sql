-- filepath: supabase/migrations/20250821110000_journal_content_json.sql
-- Add rich content support and ensure single entry per day per user
alter table public.journal_entries
  add column if not exists content_json jsonb;

-- Enforce one entry per user per date (single-page daily journal)
create unique index if not exists journal_entries_unique_user_date
  on public.journal_entries (user_id, date);
