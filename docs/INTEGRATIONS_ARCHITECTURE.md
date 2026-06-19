# Integrations Architecture

> Version: 1.0 · Date: 2026-06-20
> Implements: Dynamic Integration Architecture — Phase 1–5

---

## Overview

The Kirgo Control Tower integration layer eliminates manual workbook imports by pulling live data from five source APIs. Workbook imports (`import_runs`) remain as the authoritative historical baseline and emergency fallback.

```
Workbook Import Track (legacy)          API Sync Track (new)
──────────────────────────────          ───────────────────────────────
import_runs + import_errors             integration_settings
  ↓                                     sync_jobs (watermark per entity)
Existing tables                           ↓
(orders, shipments, etc.)               sync_runs (audit trail)
                                        sync_errors (per-record failures)
                                          ↓
                                        Same existing tables (upsert)
```

Both tracks write to the same destination tables. KPI RPCs read from those tables — they are completely unaffected by this architecture.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  TRIGGER LAYER                                                  │
│                                                                 │
│  Vercel Cron (*/30 * * * *)                                     │
│    → POST /api/sync/schedule                                    │
│                                                                 │
│  Manual "Sync Now" button                                       │
│    → POST /api/sync/trigger { job_id }                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ Creates sync_run row (status=running)
                         │ Returns { run_id } immediately
┌────────────────────────▼────────────────────────────────────────┐
│  NEXT.JS API ROUTES (service role key)                          │
│                                                                 │
│  /api/sync/trigger   — manual trigger, single job               │
│  /api/sync/schedule  — cron dispatcher, all due jobs            │
│                                                                 │
│  Guards:                                                        │
│    • Job must exist + is_active = true                          │
│    • No run already status='running' for this job (409)         │
│    • CRON_SECRET header validation on /schedule                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ fetch() fire-and-forget (async)
┌────────────────────────▼────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTIONS (Deno, service role)                   │
│                                                                 │
│  sync-woocommerce  →  orders, order_lines, customers            │
│  sync-shiprocket   →  shipments                                 │
│  sync-razorpay     →  gateway_settlements                       │
│  sync-gokwik       →  gateway_settlements                       │
│  sync-bank-feed    →  bank_transactions                         │
│                                                                 │
│  Each function:                                                 │
│    1. Loads credentials from Supabase Vault                     │
│    2. Reads watermark from sync_jobs                            │
│    3. Paginates source API                                      │
│    4. Upserts into target table (idempotent)                    │
│    5. Logs errors to sync_errors                                │
│    6. Updates sync_runs (status, counts, watermark_to)          │
│    7. Advances sync_jobs.watermark_value on success/partial     │
└────────────────────────┬────────────────────────────────────────┘
                         │ writes
┌────────────────────────▼────────────────────────────────────────┐
│  SUPABASE POSTGRES (existing tables — unchanged)                │
│                                                                 │
│  orders, order_lines, customers, shipments                      │
│  gateway_settlements, bank_transactions                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sync Frequencies

| Integration | Entity            | Schedule        | Watermark field |
|-------------|-------------------|-----------------|-----------------|
| WooCommerce | orders            | Every 30 min    | `date_modified` |
| WooCommerce | products          | Daily at 2 AM   | `date_modified` |
| WooCommerce | customers         | Daily at 3 AM   | `date_modified` |
| Shiprocket  | shipments         | Every 30 min    | `updated_at`    |
| Shiprocket  | shipments_repair  | Weekly Sun 1 AM | Full (30 days)  |
| Razorpay    | payments          | Every 30 min    | `created_at`    |
| Razorpay    | settlements       | Daily at 6 AM   | `created_at`    |
| GoKwik      | orders            | Every 30 min    | `created_at`    |
| Bank Feed   | transactions      | Manual only     | `transaction_date` |

All schedules run via Vercel Cron → `/api/sync/schedule` every 30 minutes. The scheduler dispatches only the jobs due at that moment (matching their individual cron_schedule field). The Shiprocket repair job additionally fetches the last 30 days unconditionally to catch status changes on existing shipments.

---

## Incremental Sync Strategy

### Watermark mechanics

```
Run N:
  watermark_from = sync_jobs.watermark_value - overlap_minutes
  [fetch pages where field >= watermark_from]
  watermark_to   = max(field) seen in this run

On success/partial:
  sync_jobs.watermark_value = watermark_to

On failed:
  sync_jobs.watermark_value unchanged → next run re-fetches same window
```

### Overlap window

All integrations subtract `overlap_minutes` (default 15 min) from the watermark before querying. This handles API eventual consistency — records created just before the prior run's window may not have been indexed yet.

Bank feed uses 1440 minutes (1 day) overlap because statement-based ingestion is date-granular, not timestamp-granular.

### First run (null watermark)

When `sync_jobs.watermark_value IS NULL`, the worker uses `integration_settings.config.full_pull_from` (default: `"2023-01-01"`). This triggers a full historical pull, establishing the baseline from API data.

### Dedup safety

All upserts use the natural unique key of the destination table:

| Table                | Upsert key               |
|----------------------|--------------------------|
| `orders`             | `woocommerce_order_id`   |
| `order_lines`        | `woocommerce_line_item_id` |
| `customers`          | `woocommerce_customer_id` |
| `shipments`          | `awb_code`               |
| `gateway_settlements`| `razorpay_payment_id` / `razorpay_settlement_id` / `gokwik_order_id` |
| `bank_transactions`  | `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)` |

Re-running a sync window is always safe.

---

## Retry Logic

### Transient errors (HTTP 429, 5xx, network timeout)

Each page fetch uses `fetchWithRetry()` with exponential backoff:

```
Attempt 0: immediate
Attempt 1: wait 2s
Attempt 2: wait 4s
Attempt 3: wait 8s
→ If all 4 attempts fail: throw (marks run as failed)
```

### Record-level errors

Validation failures, mapping errors, and FK misses are caught per-record:
- Row written to `sync_errors` with `raw_payload` preserved
- `records_failed` counter incremented
- Processing continues with the next record

### Run status resolution

```
records_failed == 0              → success
records_failed > 0 AND ok > 0   → partial  (watermark still advances)
records_failed == total > 0      → failed   (watermark does NOT advance)
records_fetched == 0             → success  (empty window, normal)
```

### Concurrency guard

Before creating a new `sync_run`, the API route checks for an existing row with `status='running'` on the same `sync_job_id`. If found → `409 Conflict`. Prevents overlapping runs from the same job.

---

## Failure Handling

| Scenario | Behaviour |
|----------|-----------|
| Auth failure (401/403) | Run → `failed`. `integration_settings.connection_status` updated to `'error'`. Visible on integrations dashboard immediately. |
| Rate limit (429) | 3 retries with backoff. If all fail → run `failed`. `connection_status` → `'rate_limited'`. |
| Edge Function invocation failure | API route catches fetch error, marks run `failed` with `error_summary`. |
| Partial failure (some records fail) | Run → `partial`. Watermark advances. Failed records in `sync_errors` for review. |
| Fatal DB error | Run → `failed`. Watermark unchanged. |
| Concurrent duplicate trigger | Second trigger returns `409` with existing `run_id`. |

---

## Security Model

### Credential storage

```
integration_settings.secret_ref = "woocommerce_api_key"
                                          ↓
                              Supabase Vault (pgsodium)
                              stores: { consumer_key, consumer_secret, store_url }
```

**Raw API keys are never stored in any database column, log line, or HTTP response body.**

The Edge Function reads credentials at runtime:
```ts
const { data } = await db
  .from("vault.decrypted_secrets")
  .select("decrypted_secret")
  .eq("name", secretRef)
  .single();
const creds = JSON.parse(data.decrypted_secret);
```

### Vault secret naming convention

| Integration | Vault key name           | Payload fields                              |
|-------------|--------------------------|---------------------------------------------|
| WooCommerce | `woocommerce_api_key`    | `{ store_url, consumer_key, consumer_secret }` |
| Shiprocket  | `shiprocket_credentials` | `{ email, password }`                       |
| Razorpay    | `razorpay_credentials`   | `{ key_id, key_secret }`                    |
| GoKwik      | `gokwik_credentials`     | `{ merchant_id, api_key }`                  |
| Bank Feed   | N/A (no auth needed)     | —                                           |

### Row-Level Security

All four new tables have RLS enabled. Client access:

| Table                  | Anon | Authenticated (admin role) | Service role |
|------------------------|------|---------------------------|--------------|
| `integration_settings` | ❌   | SELECT only               | Full         |
| `sync_jobs`            | ❌   | SELECT only               | Full         |
| `sync_runs`            | ❌   | SELECT only               | Full         |
| `sync_errors`          | ❌   | SELECT only               | Full         |

Writes (INSERT/UPDATE) only via service role — used by Edge Functions and API routes. No client-side write path exists.

### Webhook validation (Razorpay)

Razorpay signs webhook payloads with HMAC-SHA256. The `/api/webhooks/razorpay` route (Phase 4+ feature) must verify `X-Razorpay-Signature` against the raw request body before processing. Secret stored in `RAZORPAY_WEBHOOK_SECRET` Vercel env var — never in the database.

### API key rotation procedure

1. Create new Vault secret with a versioned name (e.g. `woocommerce_api_key_v2`)
2. Update `integration_settings.secret_ref = 'woocommerce_api_key_v2'`
3. Trigger a test connection — if `ok`, delete old Vault secret
4. Zero downtime, no code deploy required

### Vercel Cron authorisation

The `/api/sync/schedule` route validates `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET` as a Vercel environment variable. Vercel automatically injects this header on cron invocations.

---

## Bank Feed — Setup Paths

### Path A: Statement upload (current)

1. Export HDFC statement as CSV from NetBanking
2. Upload to `bank-statements` Supabase Storage bucket
3. Call POST `/api/sync/trigger` with `{ job_id, file_path }`
4. Edge Function parses CSV, classifies, upserts into `bank_transactions`

### Path B: Account Aggregator (recommended for production)

1. Register as a Financial Information User (FIU) with a Sahamati AA provider (Finvu or Onemoney)
2. Complete customer consent flow — one-time per bank account
3. Set `integration_settings.config.aa_mode = true`
4. Replace the stub in `sync-bank-feed/index.ts` with AA SDK calls
5. AA delivers encrypted FI data → decrypt with JOSE → parse → upsert

AA is the RBI-mandated standard for bank data access. It removes the manual export step entirely.

---

## Rollback Procedure

**Schema rollback** (if the migration must be undone):
```sql
DROP FUNCTION IF EXISTS get_sync_jobs(text);
DROP FUNCTION IF EXISTS get_recent_sync_runs(text, int);
DROP FUNCTION IF EXISTS get_integration_summary();
DROP TABLE IF EXISTS sync_errors          CASCADE;
DROP TABLE IF EXISTS sync_runs            CASCADE;
DROP TABLE IF EXISTS sync_jobs            CASCADE;
DROP TABLE IF EXISTS integration_settings CASCADE;
```

**No effect on existing tables** — `orders`, `shipments`, `gateway_settlements`, `bank_transactions` are unmodified by this architecture. Existing data is preserved entirely.

---

## Files Changed

### Schema
| File | Purpose |
|------|---------|
| `supabase/migrations/20260620_integrations_schema.sql` | 4 tables + indexes + RLS + seed data + 3 RPCs |

### Edge Functions
| File | Purpose |
|------|---------|
| `supabase/functions/_shared/sync-base.ts` | Shared utilities: DB client, retry, watermark, run lifecycle |
| `supabase/functions/sync-woocommerce/index.ts` | Orders, products, customers |
| `supabase/functions/sync-shiprocket/index.ts` | Shipments + repair scan |
| `supabase/functions/sync-razorpay/index.ts` | Payments + settlements |
| `supabase/functions/sync-gokwik/index.ts` | GoKwik orders |
| `supabase/functions/sync-bank-feed/index.ts` | Statement upload + AA stub |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/types/integrations.ts` | TypeScript types + traffic-light logic |
| `frontend/src/lib/supabase/server.ts` | Service-role Supabase client for API routes |
| `frontend/src/lib/data/integrations.ts` | Data fetchers (3 RPCs + trigger fetch) |
| `frontend/src/lib/hooks/use-integrations.ts` | React Query hooks (auto-refresh 30s) |
| `frontend/src/app/api/sync/trigger/route.ts` | Manual sync API route |
| `frontend/src/app/api/sync/schedule/route.ts` | Vercel Cron dispatcher |
| `frontend/src/app/dashboard/integrations/page.tsx` | Integration dashboard UI |
| `frontend/src/components/layout/sidebar.tsx` | Added Integrations nav item |
| `frontend/vercel.json` | Added `*/30 * * * *` cron for `/api/sync/schedule` |

### Docs
| File | Purpose |
|------|---------|
| `docs/INTEGRATIONS_ARCHITECTURE.md` | This document |

---

## Environment Variables Required

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Supabase project URL (already set) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (non-public) | Service role for API routes |
| `CRON_SECRET` | Vercel | Authorises Vercel Cron → /api/sync/schedule |
| `SUPABASE_URL` | Edge Function env | Supabase URL for Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function env | Service role for Edge Functions |

Vault secrets (per integration) must be created in Supabase Vault — see §Vault secret naming convention above.
