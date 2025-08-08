-- Enable required extension for UUID generation
create extension if not exists pgcrypto;

-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- RLS policies for profiles
create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- Generic updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for profiles
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Handle new auth users to create a profile row automatically
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Habits table
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal_per_week int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.habits enable row level security;

-- RLS policies for habits
create policy "Users can view their own habits"
  on public.habits
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own habits"
  on public.habits
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own habits"
  on public.habits
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own habits"
  on public.habits
  for delete
  using (auth.uid() = user_id);

drop trigger if exists trg_habits_updated_at on public.habits;
create trigger trg_habits_updated_at
before update on public.habits
for each row execute function public.update_updated_at_column();

-- Habit entries table
create table if not exists public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

alter table public.habit_entries enable row level security;

-- Ensure the entry's habit belongs to the same user
create or replace function public.validate_entry_ownership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id
  ) then
    raise exception 'Habit does not belong to the user.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_entry_ownership on public.habit_entries;
create trigger trg_validate_entry_ownership
before insert or update on public.habit_entries
for each row execute function public.validate_entry_ownership();

-- RLS policies for habit entries
create policy "Users can view their own habit entries"
  on public.habit_entries
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own habit entries"
  on public.habit_entries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own habit entries"
  on public.habit_entries
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own habit entries"
  on public.habit_entries
  for delete
  using (auth.uid() = user_id);

drop trigger if exists trg_habit_entries_updated_at on public.habit_entries;
create trigger trg_habit_entries_updated_at
before update on public.habit_entries
for each row execute function public.update_updated_at_column();