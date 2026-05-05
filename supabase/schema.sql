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
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_number text not null,
  title text not null,
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  total_words integer not null default 0 check (total_words >= 0),
  is_done boolean not null default false,
  is_active boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists journey_chapters_user_sort_order_idx
  on public.journey_chapters (user_id, sort_order);

create table if not exists public.reading_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.journey_chapters(id) on delete cascade,
  chapter_label text not null,
  status text not null check (status in ('active', 'completed')),
  duration_minutes integer not null check (duration_minutes > 0),
  level text not null,
  story_title text not null,
  story text not null,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  self_scores jsonb not null default '{}'::jsonb,
  score integer,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reading_attempts_user_created_idx
  on public.reading_attempts (user_id, created_at desc);

create index if not exists reading_attempts_chapter_idx
  on public.reading_attempts (chapter_id);

alter table public.profiles enable row level security;
alter table public.journey_chapters enable row level security;
alter table public.reading_attempts enable row level security;

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

drop policy if exists "Reading attempts are readable by owner" on public.reading_attempts;
create policy "Reading attempts are readable by owner"
  on public.reading_attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Reading attempts are writable by owner" on public.reading_attempts;
create policy "Reading attempts are writable by owner"
  on public.reading_attempts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
