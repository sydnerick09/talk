
-- ============================================================================
-- Simple Realtime Chat — Supabase schema
-- Updated / migration-safe version
-- ============================================================================
--
-- This version is designed to work with an existing database.
-- It does NOT delete existing tables.
--
-- IMPORTANT:
-- If an old messages table already exists without chat_id, this script adds
-- chat_id instead of failing with:
-- ERROR: 42703: column "chat_id" does not exist
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

create extension if not exists pgcrypto;


-- ============================================================================
-- USERS
-- ============================================================================

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  username text not null unique,

  password_hash text not null,

  created_at timestamptz not null default now(),

  last_active timestamptz not null default now()
);


-- ============================================================================
-- USERS — MIGRATIONS
-- ============================================================================

alter table public.users
  add column if not exists name text;

alter table public.users
  add column if not exists username text;

alter table public.users
  add column if not exists password_hash text;

alter table public.users
  add column if not exists created_at timestamptz not null default now();

alter table public.users
  add column if not exists last_active timestamptz not null default now();


-- ============================================================================
-- CHATS
-- ============================================================================

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),

  chat_token text not null unique,

  created_by uuid not null
    references public.users(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  last_activity timestamptz not null default now(),

  shared_token text,

  is_inbox boolean not null default false
);


-- ============================================================================
-- CHATS — MIGRATIONS
-- ============================================================================

alter table public.chats
  add column if not exists chat_token text;

alter table public.chats
  add column if not exists created_by uuid;

alter table public.chats
  add column if not exists created_at timestamptz not null default now();

alter table public.chats
  add column if not exists last_activity timestamptz not null default now();

alter table public.chats
  add column if not exists shared_token text;

alter table public.chats
  add column if not exists is_inbox boolean not null default false;


-- ============================================================================
-- CHAT TOKEN INDEX
-- ============================================================================

create unique index if not exists idx_chats_chat_token_unique
on public.chats(chat_token)
where chat_token is not null;


-- ============================================================================
-- EXISTING CHATS
-- ============================================================================
--
-- Existing chats that do not have a shared token will use their chat token.
-- ============================================================================

update public.chats
set shared_token = chat_token
where shared_token is null
  and chat_token is not null;


update public.chats
set is_inbox = true
where shared_token = chat_token
  and is_inbox = false;


-- ============================================================================
-- SHARED CHAT INDEX
-- ============================================================================

create index if not exists idx_chats_shared_token
on public.chats(shared_token);


-- ============================================================================
-- CHAT MEMBERS
-- ============================================================================

create table if not exists public.chat_members (
  id uuid primary key default gen_random_uuid(),

  chat_id uuid not null
    references public.chats(id)
    on delete cascade,

  user_id uuid not null
    references public.users(id)
    on delete cascade,

  joined_at timestamptz not null default now(),

  unique (chat_id, user_id)
);


-- ============================================================================
-- CHAT MEMBERS — MIGRATIONS
-- ============================================================================

alter table public.chat_members
  add column if not exists chat_id uuid;

alter table public.chat_members
  add column if not exists user_id uuid;

alter table public.chat_members
  add column if not exists joined_at timestamptz not null default now();


-- ============================================================================
-- CHAT MEMBERS INDEXES
-- ============================================================================

create index if not exists idx_chat_members_chat_id
on public.chat_members(chat_id);

create index if not exists idx_chat_members_user_id
on public.chat_members(user_id);


-- ============================================================================
-- MESSAGES
-- ============================================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),

  chat_id uuid not null
    references public.chats(id)
    on delete cascade,

  sender_id uuid not null
    references public.users(id)
    on delete cascade,

  message text,

  file_url text,

  file_name text,

  file_type text,

  file_size bigint,

  created_at timestamptz not null default now()
);


-- ============================================================================
-- MESSAGES — IMPORTANT MIGRATIONS
-- ============================================================================
--
-- This is the main fix for:
--
-- ERROR: 42703: column "chat_id" does not exist
--
-- If messages already existed from an older schema, CREATE TABLE IF NOT EXISTS
-- does nothing. Therefore we explicitly add missing columns here.
-- ============================================================================

alter table public.messages
  add column if not exists chat_id uuid;

alter table public.messages
  add column if not exists sender_id uuid;

alter table public.messages
  add column if not exists message text;

alter table public.messages
  add column if not exists file_url text;

alter table public.messages
  add column if not exists file_name text;

alter table public.messages
  add column if not exists file_type text;

alter table public.messages
  add column if not exists file_size bigint;

alter table public.messages
  add column if not exists created_at timestamptz not null default now();


-- ============================================================================
-- MESSAGES INDEXES
-- ============================================================================

create index if not exists idx_messages_chat_id
on public.messages(chat_id);

create index if not exists idx_messages_created_at
on public.messages(created_at);


-- ============================================================================
-- CHAT / MESSAGE INDEXES
-- ============================================================================

create index if not exists idx_chats_created_by
on public.chats(created_by);


-- ============================================================================
-- FOREIGN KEY FOR MESSAGES.CHAT_ID
-- ============================================================================
--
-- Add the relationship only if it does not already exist.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_chat_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then

    alter table public.messages
      add constraint messages_chat_id_fkey
      foreign key (chat_id)
      references public.chats(id)
      on delete cascade;

  end if;
end
$$;


-- ============================================================================
-- FOREIGN KEY FOR CHAT MEMBERS
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_members_chat_id_fkey'
      and conrelid = 'public.chat_members'::regclass
  ) then

    alter table public.chat_members
      add constraint chat_members_chat_id_fkey
      foreign key (chat_id)
      references public.chats(id)
      on delete cascade;

  end if;
end
$$;


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_members_user_id_fkey'
      and conrelid = 'public.chat_members'::regclass
  ) then

    alter table public.chat_members
      add constraint chat_members_user_id_fkey
      foreign key (user_id)
      references public.users(id)
      on delete cascade;

  end if;
end
$$;


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.users enable row level security;

alter table public.chats enable row level security;

alter table public.chat_members enable row level security;

alter table public.messages enable row level security;


-- ============================================================================
-- USERS SECURITY
-- ============================================================================

drop policy if exists "no anon access to users"
on public.users;

create policy "no anon access to users"
on public.users
for all
using (false);


-- ============================================================================
-- CHATS SECURITY
-- ============================================================================

drop policy if exists "anon can read chats"
on public.chats;

create policy "anon can read chats"
on public.chats
for select
using (true);


-- ============================================================================
-- CHAT MEMBERS SECURITY
-- ============================================================================

drop policy if exists "anon can read chat_members"
on public.chat_members;

create policy "anon can read chat_members"
on public.chat_members
for select
using (true);


-- ============================================================================
-- MESSAGES SECURITY
-- ============================================================================

drop policy if exists "anon can read messages"
on public.messages;

create policy "anon can read messages"
on public.messages
for select
using (true);


-- ============================================================================
-- REALTIME
-- ============================================================================

do $$
begin

  begin
    alter publication supabase_realtime
      add table public.messages;
  exception
    when duplicate_object then
      null;
  end;

end
$$;


-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

insert into storage.buckets (
  id,
  name,
  public
)
values (
  'chat-files',
  'chat-files',
  true
)
on conflict (id) do nothing;


-- ============================================================================
-- STORAGE READ POLICY
-- ============================================================================

drop policy if exists "public read chat files"
on storage.objects;

create policy "public read chat files"
on storage.objects
for select
using (
  bucket_id = 'chat-files'
);


-- ============================================================================
-- DONE
-- ============================================================================
--
-- Main fix:
--
--   ALTER TABLE public.messages
--   ADD COLUMN IF NOT EXISTS chat_id uuid;
--
-- This allows an existing messages table to receive the missing chat_id
-- column instead of causing ERROR 42703.
--
-- ============================================================================

