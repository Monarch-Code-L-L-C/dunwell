-- Quick-job credits: which job a credit is for, and which pool a row belongs to.
--   purchase : +1 when a quick job is bought, -1 when that job is run
--   allowance: -1 when a job is run on the monthly allowance of a plan
alter table credit_ledger add column if not exists job text;
alter table credit_ledger add column if not exists source text not null default 'purchase'
  check (source in ('purchase', 'allowance'));
