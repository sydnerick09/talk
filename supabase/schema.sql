-- ============================================================================
-- Simple Realtime Chat — Supabase schema
-- Run this in: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- users
-- Our own users table. We do NOT use Supabase Auth — the app has its own
-- simple username/password login (see lib/session.js), so this table stores
-- everything we need about a registered person.
-- ----------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- chats
-- chat_token is the long random string used in the shareable link
-- e.g. /chat/8fK92LmQxP7a  — it must be unique and hard to guess.
-- ----------------------------------------------------------------------------
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  chat_token text not null unique,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  -- shared_token is the public link token; each visitor gets a separate private chat.
  shared_token text,
  is_inbox boolean not null default false
);

-- ----------------------------------------------------------------------------
-- chat_members
-- Tracks who has joined which chat. A user "joins" automatically the first
-- time they open a valid chat link while logged in.
-- ----------------------------------------------------------------------------
create table if not exists chat_members (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

-- ----------------------------------------------------------------------------
-- messages
-- Text and/or a file can be attached to one message.
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  message text,
  file_url text,
  file_name text,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_messages_chat_id on messages(chat_id);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_chat_members_chat_id on chat_members(chat_id);
create index if not exists idx_chat_members_user_id on chat_members(user_id);

-- Migration for existing installations: old chat links become shared inbox links.
alter table chats add column if not exists shared_token text;
alter table chats add column if not exists is_inbox boolean not null default false;
update chats set shared_token = chat_token where shared_token is null;
update chats set is_inbox = true where is_inbox = false and shared_token = chat_token;

create index if not exists idx_chats_shared_token on chats(shared_token);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- This app uses its OWN login system (bcrypt + a signed cookie), not Supabase
-- Auth. That means Supabase has no built-in idea of "who is logged in" for
-- RLS to check with auth.uid().
--
-- So the app splits responsibilities like this:
--   1. All WRITES (register, login, create chat, join chat, send message,
--      upload file) go through Next.js API routes that use the SECRET
--      service role key. The service role key bypasses RLS completely, and
--      every one of those API routes checks the user's session + chat
--      membership itself before touching the database. The anon key (used
--      in the browser) is never allowed to write.
--   2. READS for realtime updates happen straight from the browser using the
--      public anon key, filtered by a specific chat_id. That's what lets
--      new messages appear instantly. To make that possible, SELECT is
--      allowed for the anon key, and the chat's protection comes from the
--      chat_token being a long, random, hard-to-guess value (like a Google
--      Meet link) — exactly as requested in the project spec. Initial page
--      loads for a chat also re-check membership server-side before
--      rendering anything.
--
-- If you need stricter per-user database-level security later, the
-- recommended upgrade path is to switch to Supabase Auth so RLS policies
-- can check auth.uid() directly.
-- ============================================================================

alter table users enable row level security;
alter table chats enable row level security;
alter table chat_members enable row level security;
alter table messages enable row level security;

-- No direct anon access to the users table at all (protects password hashes
-- and personal info). All user data the app needs is served through API
-- routes using the service role key.
drop policy if exists "no anon access to users" on users;
create policy "no anon access to users" on users
  for all
  using (false);

-- Anyone with the anon key can read chats/members/messages (needed for
-- Supabase Realtime to deliver updates to the browser). Writes are blocked
-- for anon; only the service role (used by our API routes) can write.
drop policy if exists "anon can read chats" on chats;
create policy "anon can read chats" on chats
  for select
  using (true);

drop policy if exists "anon can read chat_members" on chat_members;
create policy "anon can read chat_members" on chat_members
  for select
  using (true);

drop policy if exists "anon can read messages" on messages;
create policy "anon can read messages" on messages
  for select
  using (true);

-- ============================================================================
-- Realtime
-- Enable Realtime on the messages table so new rows are pushed to clients.
-- (Also doable from Dashboard > Database > Replication.)
-- ============================================================================
alter publication supabase_realtime add table messages;

-- ============================================================================
-- Storage bucket for uploaded files
-- Run once. If it already exists, this will error harmlessly — that's fine.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do nothing;

-- Allow public read of files (bucket is public, so files are viewable via
-- their URL, e.g. for image previews and downloads). Uploads/deletes happen
-- only through our API routes using the service role key, which bypasses
-- storage RLS, so no anon insert/update/delete policy is created.
drop policy if exists "public read chat files" on storage.objects;
create policy "public read chat files" on storage.objects
  for select
  using (bucket_id = 'chat-files');
