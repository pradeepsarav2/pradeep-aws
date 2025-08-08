-- Fix security linter: set search_path for functions
create or replace function public.update_updated_at_column()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_entry_ownership()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id
  ) then
    raise exception 'Habit does not belong to the user.';
  end if;
  return new;
end;
$$;