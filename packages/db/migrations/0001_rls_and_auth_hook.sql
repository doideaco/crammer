-- Supabase-specific wiring that Drizzle does not model: a trigger keeping our profile
-- table in step with auth.users, and row-level security.
--
-- The app's own queries run as the database owner and always filter by user id in
-- code. RLS is defence in depth, and it is what makes it safe to read these tables
-- from the browser with the anon key (Realtime, a future client-side library view).

-- Mirror new auth users into public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill anyone who signed up before this migration.
insert into public.users (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.videos enable row level security;
alter table public.video_events enable row level security;

-- A user may read their own profile and their own videos, and nothing else.
create policy "users read self" on public.users
  for select to authenticated using (auth.uid() = id);

create policy "videos read own" on public.videos
  for select to authenticated using (auth.uid() = user_id);

-- Events are readable through the video they belong to.
create policy "events read own" on public.video_events
  for select to authenticated using (
    exists (
      select 1 from public.videos v
      where v.id = video_events.video_id and v.user_id = auth.uid()
    )
  );

-- No insert/update/delete policies: every write goes through the server, which holds
-- the service role. A client that somehow got a token still cannot start a video and
-- bypass the daily limit, or edit a cost.
