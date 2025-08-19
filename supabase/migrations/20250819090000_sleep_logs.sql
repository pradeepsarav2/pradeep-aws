-- Sleep logs to support SleepTracker
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  duration_minutes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sleep_logs enable row level security;

-- RLS policies
create policy "Users can view their own sleep logs"
  on public.sleep_logs
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own sleep logs"
  on public.sleep_logs
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sleep logs"
  on public.sleep_logs
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own sleep logs"
  on public.sleep_logs
  for delete
  using (auth.uid() = user_id);

-- Updated_at trigger
create trigger trg_sleep_logs_updated_at
before update on public.sleep_logs
for each row execute function public.update_updated_at_column();

-- Helpful indexes
create index if not exists idx_sleep_logs_user_date on public.sleep_logs (user_id, date);