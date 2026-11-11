-- Dunwell core records. Postgres (Supabase). Run once in the SQL editor.
-- Every table is private to the account that owns it (row level security).
-- Money is stored in minor units (pence, cents) with a currency code.

create extension if not exists pgcrypto;

create table accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text,
  address text,
  country text,
  pay_details text,            -- the user's own bank details, shown on documents
  pay_link text,               -- the user's own payment link, if any
  paddle_customer_id text unique,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  address text,
  country text,
  created_at timestamptz not null default now()
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  title text not null,
  jurisdiction text not null,             -- 'uk' or 'intl' in version one
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'ended')),
  currency text not null default 'GBP',
  value_minor bigint,
  payment_terms_days int,
  deposit_percent numeric(5, 2),
  starts_on date,
  ends_on date,
  terms jsonb not null default '{}',      -- answers and chosen clause ids
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  contract_id uuid references contracts (id) on delete set null,
  number text not null,
  currency text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  issued_on date not null,
  due_on date not null,
  regime text not null default 'none',    -- interest regime: uk, eu, contract, none
  contract_rate numeric(6, 3),
  status text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
  paid_on date,
  lines jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (account_id, number)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  kind text not null,                     -- contract, invoice, letter, statement ...
  contract_id uuid references contracts (id) on delete set null,
  invoice_id uuid references invoices (id) on delete set null,
  title text not null,
  body jsonb not null,                    -- structured content the renderer prints
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  invoice_id uuid references invoices (id) on delete cascade,
  step text not null,                     -- nudge, follow-up, interest, final, lbc ...
  direction text not null default 'out' check (direction in ('out', 'in')),
  subject text,
  body text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per plan an account holds. Written only by the Paddle webhook.
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  plan text not null check (plan in ('chase', 'contracts', 'billing', 'all')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),
  period_end timestamptz not null,
  paddle_subscription_id text not null unique,
  updated_at timestamptz not null default now()
);

-- Quick-job credits: +n when granted or bought, -1 when a job is run.
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  delta int not null,
  reason text not null,                   -- monthly-allowance, purchase, job:<id>
  paddle_transaction_id text unique,      -- stops a webhook retry granting twice
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index on clients (account_id);
create index on contracts (account_id);
create index on invoices (account_id, status, due_on);
create index on documents (account_id);
create index on messages (account_id, scheduled_for) where sent_at is null;
create index on entitlements (account_id);
create index on credit_ledger (account_id);

alter table accounts enable row level security;
alter table clients enable row level security;
alter table contracts enable row level security;
alter table invoices enable row level security;
alter table documents enable row level security;
alter table messages enable row level security;
alter table entitlements enable row level security;
alter table credit_ledger enable row level security;

create policy own_account on accounts for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_rows on clients for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy own_rows on contracts for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy own_rows on invoices for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy own_rows on documents for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy own_rows on messages for all using (account_id = auth.uid()) with check (account_id = auth.uid());
-- Users can read what they hold but never grant themselves a plan or credits.
create policy read_own on entitlements for select using (account_id = auth.uid());
create policy read_own on credit_ledger for select using (account_id = auth.uid());

-- Create the account row when someone signs up.
create function public.new_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (id) values (new.id);
  return new;
end $$;

create trigger on_signup after insert on auth.users
for each row execute function public.new_account();
