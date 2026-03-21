# Legacy Scripts Cleanup — 2026-03-10

## Summary

A security audit found **hardcoded database passwords** (`QuotationPass123!`), **hardcoded JWT
tokens**, and **test credentials** (`TestPass123!`) in standalone scripts. All affected files
have been either deleted or refactored.

- **Deleted:** 118 files (97 root-level + 21 scripts/ directory)
- **Refactored:** 1 file (`scripts/fix-rls-policies.js`)
- **Root .js files remaining:** 4 (`server.js`, `db.js`, `cache.js`, `eslint.config.js`)

---

## Deleted Files — Root Directory (97 files)

### One-Time Schema/Fix Scripts (hardcoded `QuotationPass123!`)

These scripts ran one-time DDL against the database with hardcoded admin credentials.
All changes have long since been applied. Replaced by numbered migrations in `migrations/`.

| File | What it did |
|------|-------------|
| `run-migration.js` | Ran a one-time SQL migration file against RDS |
| `fix-products-table.js` | Made `name` nullable on products, backfilled NULLs |
| `fix-price-column.js` | Made `price` nullable on products, backfilled NULLs |
| `fix-unique-constraints.js` | Dropped unique constraint on products.name |
| `fix-all-constraints.js` | Dropped multiple constraints for CSV import compatibility |
| `fix-audit-log.js` | Patched audit_log table schema |
| `fix-quotations-table.js` | Patched quotations table schema |
| `update-customers-table.js` | Added missing columns to customers table |
| `setup-customers.js` | Created customers table from scratch |
| `setup-quotations.js` | Created quotations + quotation_items tables |
| `setup-security.js` | Created security-related tables |
| `check-and-fix-quotations.js` | Diagnostic: inspected quotations schema |

### Column/Table Addition Scripts (used `process.env` but one-time)

| File | What it did |
|------|-------------|
| `add-cost-column.js` | Added cost column to products |
| `add-internal-notes-column.js` | Added internal_notes column |
| `add-model-column.js` | Added model column to products |
| `add-status-column.js` | Added status column |
| `create-api-keys-table.js` | Created api_keys table |
| `create-approval-workflow-table.js` | Created approval workflow tables |
| `create-payment-terms-table.js` | Created payment_terms table |
| `create-product-favorites-table.js` | Created product_favorites table |
| `create-quote-events-table.js` | Created quote_events table |
| `create-quote-templates-table.js` | Created quote_templates table |
| `create-revenue-features.js` | Created revenue feature tables |

### Legacy Route Files (superseded by `routes/` directory)

| File | Replacement |
|------|-------------|
| `customers.js` | `routes/customers.js` |
| `quotations.js` | `routes/quotations.js` |

### Analysis/Import Utilities (one-time, data long since imported)

| File | What it did |
|------|-------------|
| `analyze-catalog.js` | Analyzed product catalog filter coverage |
| `analyze-import-errors.js` | Analyzed CSV import error patterns |
| `analyze-unknown.js` | Analyzed unknown product patterns |
| `convert-csv.js` | One-time CSV/XLSX format conversion |
| `add-test-customers.js` | Added test customers to SQLite (app now uses PostgreSQL) |
| `reset-db.js` | Reset SQLite database (app now uses PostgreSQL) |

### Diagnostic/Column-Check Scripts (hardcoded `TestPass123!`)

| File | What it did |
|------|-------------|
| `check-columns.js` | Logged in via API, printed JSON keys for debugging |
| `check-columns2.js` | Same as above, duplicate |
| `check-approval-config.js` | Checked approval rule configuration |
| `check-database.js` | Checked database connectivity |
| `check-db.js` | Duplicate database check |
| `check-import-errors-schema.js` | Inspected import_errors table schema |
| `check-payments.js` | Inspected payments table |
| `check-products-constraints.js` | Listed products table constraints |
| `check-products-schema.js` | Listed products table columns |
| `check-quotes.js` | Inspected quotations data |
| `check-tables.js` | Listed all database tables |

### Ad-Hoc Test Scripts (hardcoded JWT tokens and/or `TestPass123!`)

These were manual HTTP request scripts for testing API endpoints. All functionality
is covered by the Jest test suite in `__tests__/` (1,207 tests across 50 suites).

**`test-*` files (55):** `test-ai-features.js`, `test-ai-routes.js`,
`test-all-marketplace.js`, `test-all-modified-routes.js`, `test-all-queries.js`,
`test-all-routes.js`, `test-analytics-endpoint.js`, `test-analytics-http.js`,
`test-analytics.js`, `test-approval-debug.js`, `test-approval-routes-self.js`,
`test-approval-routes.js`, `test-approval-system-comprehensive.js`,
`test-approval-system.js`, `test-ar-query.js`, `test-auth-endpoints.js`,
`test-bundle-routes.js`, `test-bundles.js`, `test-category-query.js`,
`test-csv-format.js`, `test-debug-error.js`, `test-discount-analytics.js`,
`test-discount-approve.js`, `test-discount-authority.js`, `test-escalations.js`,
`test-fixed-routes.js`, `test-fixed-routes2.js`, `test-forecaster-routes.js`,
`test-forecaster.js`, `test-frontend-pages.js`, `test-frontend-routes.js`,
`test-insights-detail.js`, `test-marketplace-ai.js`, `test-new-endpoints.js`,
`test-onboarding.js`, `test-pos-checkout.js`, `test-pos-routes.js`,
`test-report-generator.js`, `test-report-routes.js`, `test-revenue-apis.js`,
`test-route-debug.js`, `test-security-audit.js`, `test-service-direct.js`,
`test-shipping-routes.js`, `test-shipping.js`, `test-skulytics-endpoints.js`,
`test-tasks-debug.js`, `test-tax-engine.js`, `test-tax-routes.js`,
`test-tenant-routes.js`, `test-tenant.js`, `test-validate-full.js`,
`test-validate-full2.js`, `test-websocket-events.js`, `test-write-ops.js`

**`_`-prefixed files (18):** `_api_audit.js`, `_api_audit_phase2.js`,
`_api_audit_phase3.js`, `_check_cols.js`, `_create_miller_quote.js`,
`_debug_barcode.js`, `_fix_columns.js`, `_merge_hisense.js`, `_retest.js`,
`_test_api.js`, `_test_bin_service.js`, `_test_employee_monitor.js`,
`_test_fix.js`, `_test_fraud_scoring.js`, `_test_reimport.js`,
`_test_summary.js`, `_test_velocity.js`, `_verify_fraud.js`

**Other:** `tmp-test-approvals.js`, `tmp-test-routes.js`, `write-test.js`

---

## Deleted Files — `scripts/` Directory (21 files)

### One-Time Migration Runner (hardcoded `QuotationPass123!`)

| File | What it did |
|------|-------------|
| `scripts/run-096-migration.js` | Ran migration 096 with enum-outside-transaction handling |

### Ad-Hoc Test/Debug Scripts (hardcoded `TestPass123!`)

| File | What it did |
|------|-------------|
| `scripts/test-ai-chat.js` | Tested AI chat endpoint |
| `scripts/test-bestbuy-connection.js` | Tested Best Buy Mirakl API connection |
| `scripts/test-endpoints.js` | Tested multiple API endpoints |
| `scripts/test-excelsior-warranties.js` | Tested warranty API |
| `scripts/test-feature-flags.js` | Tested feature flags |
| `scripts/test-lookup.js` | Tested product lookup |
| `scripts/test-null-category-fix.js` | Tested category null fix |
| `scripts/test-quote-expiry.js` | Tested quote expiry logic |
| `scripts/test-quote-flow.js` | Tested full quote creation flow |
| `scripts/test-returns-e2e.js` | Tested returns end-to-end |
| `scripts/test-thor-update.js` | Tested Thor product update |
| `scripts/test-three-issues.js` | Tested three specific bug fixes |
| `scripts/test-warranty-product.js` | Tested warranty product lookup |
| `scripts/pos-debug.js` | POS debugging utility |
| `scripts/pos-api-test.js` | POS API endpoint tester |
| `scripts/frontend-api-test.js` | Frontend API endpoint tester |
| `scripts/seed-test-store-credit.js` | Seeded test store credit data |
| `scripts/seed-approval-rules.js` | Seeded approval rules via API |
| `scripts/reset-manager-pw.js` | Reset manager password (uses shared db module, not hardcoded) |

---

## Refactored Files (1 file)

### `scripts/fix-rls-policies.js`

**What it does:** Drops and recreates all `tenant_isolation` RLS policies with
`NULLIF()` wrappers to handle empty-string tenant settings.

**Why kept:** Reusable for future RLS policy debugging. Already used `dotenv` for
host/port/database but had the password hardcoded on line 31.

**Changes made:**
- Replaced `password: 'QuotationPass123!'` with `process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD`
- Replaced `user: 'dbadmin'` with `process.env.DB_ADMIN_USER || 'dbadmin'`
- Added env var validation at the top (exits with error if no password set)

**How to run:**
```bash
cd backend
node scripts/fix-rls-policies.js
# Reads credentials from .env automatically
```

---

## Other Cleanup

| Item | Action |
|------|--------|
| `services/New Text Document.txt` | Deleted (empty stray file) |

---

## What Remains in `backend/`

### Root `.js` files (4 — all core application):
- `server.js` — Express application entry point
- `db.js` — PostgreSQL connection pool (uses `process.env`)
- `cache.js` — In-memory cache module
- `eslint.config.js` — ESLint configuration

### `scripts/` directory — legitimate utilities:
- `migrate.js` / `migrate-baseline.js` — Migration runner
- `create-admin-user.js` / `create-test-users.js` — User management
- `import-*.js` — Product data importers (30+ files)
- `analyze-*.js` / `check-*.js` — Data analysis utilities
- `fix-*.js` — Schema/data fix utilities (all use `process.env`)
- `debug-*.js` — Product debugging utilities
- Various other operational scripts

All remaining scripts use `dotenv` + `process.env` for credentials.
