# Supabase Migrations

## 001_tier0_fixes.sql

Tier 0 fixes for the multi-tenant schema. Applies three groups of changes:

1. **Fixes the `leads.status` CHECK constraint (critical bug).** The original
   constraint only allowed `('new','contacted','interested','not_interested')`,
   but the application writes `'hot'` and `'closed'` after calls
   (`server.js` → `updateLeadStatus`). Those updates silently failed with
   Postgres error `23514` (check_violation). The constraint is dropped and
   re-added allowing the full set:
   `('new','contacted','interested','not_interested','hot','closed','callback')`.

2. **Adds the `leads.updated_at` column.** The code writes `leads.updated_at`,
   but the column didn't exist (there is a runtime fallback that retries the
   update without it). This adds `updated_at timestamptz not null default now()`.

3. **Adds missing indexes** for performance at scale:
   - `idx_leads_company_phone` — partial UNIQUE index on `(company_id, phone)`
     where `phone is not null`. Prevents duplicate leads and speeds phone lookup.
   - `idx_calls_company_lead` on `calls(company_id, lead_id)`.
   - `idx_calls_company_lead_phone` on `calls(company_id, lead_phone)`.
   - `idx_agent_configs_company` — UNIQUE index on `agent_configs(company_id)`,
     enforcing one config per company.

**Not in this migration:** RLS, pgvector, and partitioning changes are deferred
to a separate later migration.

### Idempotent

The migration is safe to run more than once. It uses `if exists` / `if not exists`
and a catalog-guarded drop-then-add for the constraint (the same pattern used for
`users_platform_role_check` in `schema.sql`).

### How to apply

**Supabase SQL editor:** open the SQL editor for your project, paste the contents
of `001_tier0_fixes.sql`, and run it.

**Supabase CLI:**

```bash
supabase db push
```

or run the file directly against your database:

```bash
psql "$DATABASE_URL" -f backend/supabase/migrations/001_tier0_fixes.sql
```

### De-dupe first (caveats for the UNIQUE indexes)

Two of the new indexes are UNIQUE and will **fail to create** if the data already
violates uniqueness. De-duplicate before running (or the migration will error):

1. **`idx_leads_company_phone`** — fails if duplicate `(company_id, phone)` rows
   already exist (for non-null `phone`). Find and resolve duplicates first:

   ```sql
   select company_id, phone, count(*)
   from leads
   where phone is not null
   group by company_id, phone
   having count(*) > 1;
   ```

2. **`idx_agent_configs_company`** — fails if a company has more than one
   `agent_configs` row. Keep a single config per company first:

   ```sql
   select company_id, count(*)
   from agent_configs
   group by company_id
   having count(*) > 1;
   ```
