-- Migration 001: Tier 0 fixes
-- Idempotent: safe to run more than once (uses if exists / if not exists and
-- catalog-guarded drop-then-add, mirroring the platform_role pattern in schema.sql).
-- Scope: leads.status constraint fix, leads.updated_at column, and missing indexes.
-- Explicitly NOT included: RLS, pgvector, partitioning (separate later migration).

-- =============================================================================
-- 1. Fix leads.status CHECK constraint (CRITICAL bug)
-- -----------------------------------------------------------------------------
-- The original constraint (defined inline in schema.sql) only allowed
-- ('new','contacted','interested','not_interested'). The application writes
-- 'hot' and 'closed' after calls (server.js updateLeadStatus), so those updates
-- silently fail with Postgres error 23514 (check_violation).
--
-- An inline CHECK on leads.status is auto-named `leads_status_check` by Postgres.
-- We drop it (guarded by a catalog existence check) and re-add it with the full
-- allowed set, including 'callback'.
-- =============================================================================
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_check'
  ) then
    alter table leads drop constraint leads_status_check;
  end if;
exception
  when undefined_table then null;
end $$;

alter table leads
  add constraint leads_status_check
  check (status in ('new','contacted','interested','not_interested','hot','closed','callback'));

-- =============================================================================
-- 2. Add leads.updated_at column
-- -----------------------------------------------------------------------------
-- The application writes leads.updated_at, but the column does not exist in
-- schema.sql (there is a runtime fallback that retries the update without it).
-- Adding it lets the primary code path succeed.
-- =============================================================================
alter table leads add column if not exists updated_at timestamptz not null default now();

-- =============================================================================
-- 3. Add missing indexes (performance at scale)
-- =============================================================================

-- Prevent duplicate leads and speed up phone lookups within a company.
-- WARNING: If duplicate (company_id, phone) rows already exist, creating this
-- UNIQUE index will FAIL. De-duplicate existing rows first, then re-run.
create unique index if not exists idx_leads_company_phone
  on leads(company_id, phone)
  where phone is not null;

-- Speed up call lookups by company + lead. Both columns exist on calls
-- (lead_id: schema.sql; lead_phone: added via alter table in schema.sql).
create index if not exists idx_calls_company_lead
  on calls(company_id, lead_id);

create index if not exists idx_calls_company_lead_phone
  on calls(company_id, lead_phone);

-- Enforce a single agent_config per company.
-- WARNING: If more than one agent_configs row already exists for the same
-- company_id, creating this UNIQUE index will FAIL. De-duplicate existing rows
-- first (keep one config per company), then re-run.
create unique index if not exists idx_agent_configs_company
  on agent_configs(company_id);
