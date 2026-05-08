-- Taalreis backend schema (v2)
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  interface_language text not null default 'nl' check (interface_language in ('nl', 'en')),
  level text not null default 'B1',
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journey_chapters (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_number text not null,
  title text not null,
  subtitle text not null default '',
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  total_words integer not null default 0 check (total_words >= 0),
  is_done boolean not null default false,
  is_active boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Keep PK migration non-destructive: older databases may have FKs depending on the existing PK.
-- We avoid dropping/recreating the primary key in this script to prevent SQL Editor failures.
-- Instead, ensure we still have a uniqueness guarantee on (user_id, id) for app-level lookups.
create unique index if not exists journey_chapters_user_id_id_idx
  on public.journey_chapters (user_id, id);
alter table public.journey_chapters add column if not exists subtitle text not null default '';

create unique index if not exists journey_chapters_user_sort_order_idx
  on public.journey_chapters (user_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_journey_chapters_updated_at on public.journey_chapters;
create trigger set_journey_chapters_updated_at
before update on public.journey_chapters
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.journey_chapters enable row level security;

drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner"
  on public.profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "Profiles are writable by owner" on public.profiles;
create policy "Profiles are writable by owner"
  on public.profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Journey chapters are readable by owner" on public.journey_chapters;
create policy "Journey chapters are readable by owner"
  on public.journey_chapters
  for select
  using (auth.uid() = user_id);

drop policy if exists "Journey chapters are writable by owner" on public.journey_chapters;
create policy "Journey chapters are writable by owner"
  on public.journey_chapters
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
