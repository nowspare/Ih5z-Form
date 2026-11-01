-- ============================================================
-- Music Recommendation Platform — Supabase setup
-- Run this whole file once in: Supabase Dashboard → SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Admin allowlist ----------
-- Only emails listed here get admin powers (read/edit/delete requests, manage featured music, edit site settings).
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;  -- no policies = nobody can read it directly

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Requests (submitted by visitors) ----------
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 80),
  email       text check (email is null or char_length(email) <= 254),
  song_name   text check (song_name is null or char_length(song_name) <= 200),
  artist      text check (artist is null or char_length(artist) <= 200),
  genre       text check (genre is null or char_length(genre) <= 80),
  mood        text check (mood is null or char_length(mood) <= 40),
  language    text check (language is null or char_length(language) <= 60),
  link        text check (link is null or (char_length(link) <= 500 and link ~* '^https?://')),
  looking_for text check (looking_for is null or char_length(looking_for) <= 2000),
  message     text check (message is null or char_length(message) <= 2000),
  status      text not null default 'pending' check (status in ('pending','reviewed','accepted','completed')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 5000)
);

-- ---------- Featured music ----------
create table if not exists public.featured (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  title             text not null check (char_length(title) between 1 and 200),
  artist            text not null check (char_length(artist) between 1 and 200),
  artwork_url       text check (artwork_url is null or (char_length(artwork_url) <= 1000 and artwork_url ~* '^https?://')),
  genre             text check (genre is null or char_length(genre) <= 80),
  mood              text check (mood is null or char_length(mood) <= 40),
  description       text check (description is null or char_length(description) <= 1000),
  link              text check (link is null or (char_length(link) <= 500 and link ~* '^https?://')),
  category          text not null default 'favorites' check (category in ('weekly','favorites','underrated','requested')),
  sort_order        integer not null default 0,
  source_request_id uuid
);

-- ---------- Site settings (profile + social links; editable from the dashboard) ----------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_requests_touch on public.requests;
create trigger trg_requests_touch before update on public.requests
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_featured_touch on public.featured;
create trigger trg_featured_touch before update on public.featured
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_settings_touch on public.site_settings;
create trigger trg_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.requests      enable row level security;
alter table public.featured      enable row level security;
alter table public.site_settings enable row level security;

-- Requests: anyone can SUBMIT (as pending, with no admin notes). Only admins can read/edit/delete.
drop policy if exists "anyone can submit"     on public.requests;
drop policy if exists "admin read requests"   on public.requests;
drop policy if exists "admin update requests" on public.requests;
drop policy if exists "admin delete requests" on public.requests;

create policy "anyone can submit" on public.requests
  for insert to anon, authenticated
  with check (status = 'pending' and admin_notes is null);
create policy "admin read requests" on public.requests
  for select to authenticated using (public.is_admin());
create policy "admin update requests" on public.requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete requests" on public.requests
  for delete to authenticated using (public.is_admin());

-- Featured: public can read; only admins can write.
drop policy if exists "public read featured"  on public.featured;
drop policy if exists "admin write featured"  on public.featured;
create policy "public read featured" on public.featured
  for select to anon, authenticated using (true);
create policy "admin write featured" on public.featured
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Settings: public can read; only admins can write.
drop policy if exists "public read settings"  on public.site_settings;
drop policy if exists "admin write settings"  on public.site_settings;
create policy "public read settings" on public.site_settings
  for select to anon, authenticated using (true);
create policy "admin write settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Table privileges (RLS above is what actually restricts access) ----------
grant usage on schema public to anon, authenticated;
grant insert on public.requests to anon, authenticated;
grant select, update, delete on public.requests to authenticated;
grant select on public.featured, public.site_settings to anon, authenticated;
grant insert, update, delete on public.featured, public.site_settings to authenticated;

-- ============================================================
-- LAST STEP — make yourself the admin.
-- 1) Dashboard → Authentication → Users → "Add user" (email + password, tick "Auto confirm").
-- 2) Replace the email below with that SAME email and run this line:
--
-- insert into public.admins (email) values ('you@example.com');
--
-- 3) Dashboard → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
-- ============================================================
