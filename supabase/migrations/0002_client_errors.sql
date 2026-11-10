-- Errors reported by players' browsers, so problems on a child's device can be diagnosed remotely.
create table if not exists public.client_errors (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade default auth.uid(),
  message     text not null,
  detail      text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
alter table public.client_errors enable row level security;
drop policy if exists "report own errors" on public.client_errors;
create policy "report own errors" on public.client_errors for insert to authenticated with check (user_id = auth.uid());
