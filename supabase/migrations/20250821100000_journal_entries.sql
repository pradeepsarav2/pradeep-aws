-- Journal entries table
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

-- RLS policies
create policy if not exists "Users can view their own journal entries"
  on public.journal_entries
  for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own journal entries"
  on public.journal_entries
  for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update their own journal entries"
  on public.journal_entries
  for update
  using (auth.uid() = user_id);

create policy if not exists "Users can delete their own journal entries"
  on public.journal_entries
  for delete
  using (auth.uid() = user_id);

-- updated_at trigger
create trigger if not exists trg_journal_entries_updated_at
before update on public.journal_entries
for each row execute function public.update_updated_at_column();
