-- Bible Quest: initial schema
-- Content tables (passages, worlds, verses, questions) are readable only by signed-in users,
-- so the NKJV text is never public. Player tables are private to each player, except the
-- small public part of the profile used for the team leaderboard.

create table if not exists public.passages (
  id          text primary key,              -- e.g. 'acts-9-8'
  title       text not null,                 -- e.g. 'Acts 9:8 – 11:16'
  book        text not null default 'Acts',
  start_c     int not null, start_v int not null,
  end_c       int not null, end_v   int not null,
  sort        int not null default 0,
  videos      jsonb not null default '{}'::jsonb   -- { "9": "youtubeId", ... }
);

create table if not exists public.worlds (
  passage_id  text not null references public.passages(id) on delete cascade,
  idx         int  not null,
  name        text not null,
  start_c     int not null, start_v int not null,
  end_c       int not null, end_v   int not null,
  icon        text not null default '📖',
  color       text not null default '#6c4cff',
  story       text not null default '',
  boss        jsonb not null default '{}'::jsonb,  -- { name, emoji, taunt }
  primary key (passage_id, idx)
);

create table if not exists public.verses (
  book  text not null default 'Acts',
  c     int  not null,
  v     int  not null,
  text  text not null,
  primary key (book, c, v)
);

create table if not exists public.questions (
  id          bigserial primary key,
  passage_id  text not null references public.passages(id) on delete cascade,
  world_idx   int  not null,
  ref         text not null,                -- '9:13-14'
  prompt      text not null,
  answer      text not null,
  wrong       text[] not null,
  active      boolean not null default true
);
create index if not exists questions_passage_idx on public.questions(passage_id, world_idx);

-- When each verse starts in the chapter's YouTube video (shared by everyone).
create table if not exists public.verse_timings (
  book        text not null default 'Acts',
  c           int  not null,
  v           int  not null,
  video_id    text not null,
  start_sec   numeric(8,2) not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (book, c, v, video_id)
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 30),
  avatar        text not null default '🧒',
  passage_id    text references public.passages(id),
  xp            int not null default 0,
  level         int not null default 1,
  mastery       int not null default 0,     -- % of the passage's verses mastered
  streak        int not null default 0,
  bosses        int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.progress (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Row level security ---------------------------------------------------------
alter table public.passages      enable row level security;
alter table public.worlds        enable row level security;
alter table public.verses        enable row level security;
alter table public.questions     enable row level security;
alter table public.verse_timings enable row level security;
alter table public.profiles      enable row level security;
alter table public.progress      enable row level security;

drop policy if exists "read passages" on public.passages;
create policy "read passages" on public.passages for select to authenticated using (true);
drop policy if exists "read worlds" on public.worlds;
create policy "read worlds" on public.worlds for select to authenticated using (true);
drop policy if exists "read verses" on public.verses;
create policy "read verses" on public.verses for select to authenticated using (true);
drop policy if exists "read questions" on public.questions;
create policy "read questions" on public.questions for select to authenticated using (active);

drop policy if exists "read timings" on public.verse_timings;
create policy "read timings" on public.verse_timings for select to authenticated using (true);
drop policy if exists "write timings" on public.verse_timings;
create policy "write timings" on public.verse_timings for insert to authenticated with check (updated_by = auth.uid());
drop policy if exists "update timings" on public.verse_timings;
create policy "update timings" on public.verse_timings for update to authenticated using (true) with check (updated_by = auth.uid());

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Passage list is shown on the sign-up screen before login, without any Bible text.
create or replace function public.passage_list()
returns table (id text, title text, sort int)
language sql stable security definer set search_path = public
as $$ select id, title, sort from public.passages order by sort $$;
grant execute on function public.passage_list() to anon, authenticated;
