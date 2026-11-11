-- When a plan has been cancelled but is still inside its paid period,
-- this holds the date it will end. Null means it renews as normal.
alter table entitlements add column if not exists cancel_at timestamptz;
