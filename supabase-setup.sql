-- Supabase SQL Editor 에 붙여넣고 실행하세요.

create table if not exists public.pocket_sessions (
  session_id text primary key,
  sheet_title text,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pocket_sessions enable row level security;

create policy "pocket_sessions_public_all"
  on public.pocket_sessions
  for all
  using (true)
  with check (true);

create index if not exists pocket_sessions_updated_at_idx
  on public.pocket_sessions (updated_at desc);
