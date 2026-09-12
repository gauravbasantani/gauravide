-- Gauravide — initial schema (ARCHITECTURE.md §6)
--
-- One table for splits, not three. The app performs exactly two reads:
-- "list my splits" and "open one split". It never queries inside line items,
-- so normalising them would buy joins and migrations and return nothing.
--
-- Apply in the Supabase SQL editor. Never edit a migration after it has run.

create table if not exists splits (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  data        jsonb not null,                  -- merchant, date, items, shares, totals
  expense_ids text[] not null default '{}',    -- 1, or 2 for the guest route
  image_path  text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists splits_owner_created_idx on splits (owner_id, created_at desc);

-- Analytics. Financial content physically cannot enter this table (MET-1).
create table if not exists events (
  id         bigserial primary key,
  user_key   text not null,                    -- opaque id, never an email (MET-2)
  name       text not null,
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_created_idx on events (created_at desc);

-- Feedback. Separate from both splits and events (FB-4).
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_key    text not null,
  category    text not null check (category in ('bug', 'suggestion', 'question', 'other')),
  message     text not null,
  contact     text,
  diagnostics jsonb,                           -- only when opted in (FB-5)
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

-- RLS on, no policies: deny-all from any browser key. Server routes hold the
-- secret key and bypass this after checking ownership themselves (DB-3, DB-4).
alter table splits   enable row level security;
alter table events   enable row level security;
alter table feedback enable row level security;
