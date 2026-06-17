# Kirgo Control Tower — Import Status Tracking
**Version:** v1.0 | **Date:** 2026-06-17  
**Schema Reference:** DATABASE_SCHEMA.md v2  
**Purpose:** Design for tracking every import run — rows imported, rows failed, duplicates skipped, last run timestamp, and reconciliation status — so the admin always knows the health of the data pipeline.

---

## Overview

Import status tracking is stored in two tables (to be added to the schema):

1. **`import_runs`** — One row per import execution (source × date × user)
2. **`import_errors`** — One row per rejected/flagged row from any import run

These tables are **operational infrastructure**, not business data. They are admin-only and exempt from KPI computation.

---

## Table Design

### Table: `import_runs`

```sql
CREATE TABLE import_runs (
  id                      serial        NOT NULL,
  source                  text          NOT NULL,
  source_file             text,
  source_sheet            text,
  run_started_at          timestamptz   NOT NULL DEFAULT now(),
  run_completed_at        timestamptz,
  status                  text          NOT NULL DEFAULT 'running',
  rows_in_source          int,
  rows_imported           int           NOT NULL DEFAULT 0,
  rows_skipped_duplicate  int           NOT NULL DEFAULT 0,
  rows_failed             int           NOT NULL DEFAULT 0,
  rows_warnings           int           NOT NULL DEFAULT 0,
  reconciliation_status   text          NOT NULL DEFAULT 'pending',
  reconciliation_run_at   timestamptz,
  reconciliation_notes    text,
  hard_checks_passed      int,
  hard_checks_failed      int,
  soft_checks_passed      int,
  soft_checks_warned      int,
  triggered_by            int,          -- FK → users.id
  error_summary           text,
  notes                   text,
  created_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT import_runs_pkey          PRIMARY KEY (id),
  CONSTRAINT import_runs_user_fk       FOREIGN KEY (triggered_by) REFERENCES users (id),
  CONSTRAINT import_runs_status_chk    CHECK (status IN ('running','completed','failed','partial')),
  CONSTRAINT import_runs_recon_chk     CHECK (reconciliation_status IN ('pending','passed','failed','flagged','skipped')),
  CONSTRAINT import_runs_source_chk    CHECK (source IN (
    'woocommerce','shiprocket','returns','purchase_invoices','bank_statement','marketing_spend'
  ))
);

COMMENT ON TABLE  import_runs IS 'One row per import pipeline execution. Tracks row counts, errors, and reconciliation outcome.';
COMMENT ON COLUMN import_runs.source IS 'woocommerce | shiprocket | returns | purchase_invoices | bank_statement | marketing_spend';
COMMENT ON COLUMN import_runs.status IS 'running = in progress | completed = success | failed = hard error | partial = some rows failed';
COMMENT ON COLUMN import_runs.reconciliation_status IS 'pending = not yet run | passed = all checks green | failed = hard check failed | flagged = soft check warned | skipped = manual override';
COMMENT ON COLUMN import_runs.rows_skipped_duplicate IS 'Rows that matched existing dedup key and were intentionally skipped.';
COMMENT ON COLUMN import_runs.rows_warnings IS 'Rows imported but with a DQ_WARN or RECONCILE_WARN flag.';
```

---

### Table: `import_errors`

```sql
CREATE TABLE import_errors (
  id                  serial        NOT NULL,
  import_run_id       int           NOT NULL,
  row_number          int,
  source_row_snapshot jsonb,
  error_code          text          NOT NULL,
  error_message       text          NOT NULL,
  severity            text          NOT NULL DEFAULT 'error',
  field_name          text,
  field_value_raw     text,
  resolution_status   text          NOT NULL DEFAULT 'unresolved',
  resolved_by         int,
  resolved_at         timestamptz,
  resolution_notes    text,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT import_errors_pkey         PRIMARY KEY (id),
  CONSTRAINT import_errors_run_fk       FOREIGN KEY (import_run_id)  REFERENCES import_runs  (id),
  CONSTRAINT import_errors_user_fk      FOREIGN KEY (resolved_by)    REFERENCES users         (id),
  CONSTRAINT import_errors_severity_chk CHECK (severity IN ('error','warning','info')),
  CONSTRAINT import_errors_status_chk   CHECK (resolution_status IN ('unresolved','resolved','ignored','deferred'))
);

COMMENT ON TABLE  import_errors IS 'One row per rejected or flagged row from any import run. Preserves original source data for investigation.';
COMMENT ON COLUMN import_errors.source_row_snapshot IS 'Full JSON snapshot of the original source row that caused this error. Enables re-import after fix.';
COMMENT ON COLUMN import_errors.error_code IS 'Machine-readable error code from IMPORT_ARCHITECTURE.md (e.g. DUPLICATE_AWB, UNRESOLVED_SKU, DATE_SEQ_ERROR).';
COMMENT ON COLUMN import_errors.resolution_status IS 'unresolved = needs attention | resolved = fixed | ignored = known acceptable issue | deferred = handle in next release';
```

---

## Error Code Reference

| Code | Source | Severity | Meaning |
|------|--------|----------|---------|
| `DUPLICATE_ORDER` | WooCommerce | info | `woocommerce_order_id` already exists; row skipped |
| `DUPLICATE_CUSTOMER` | WooCommerce | info | Customer email already exists; counts updated |
| `DUPLICATE_AWB` | Shiprocket | warning | Same AWB code seen twice across year sheets |
| `DUPLICATE_SHIPMENT` | Shiprocket | info | Exact duplicate row; skipped |
| `DUPLICATE_RETURN` | Returns | info | Same order + AWB already imported |
| `DUPLICATE_BANK_ROW` | Bank Statement | info | Identical bank row; skipped |
| `DUPLICATE_SETTLEMENT` | Bank Statement | info | Same settlement_reference already exists |
| `DUPLICATE_AD_SPEND` | Marketing | info | Same (campaign_id, spend_date) already exists |
| `DUPLICATE_PO` | Purchase Invoices | info | Same invoice_number already exists |
| `UNRESOLVED_SKU` | WooCommerce, Shiprocket, Returns | warning | `sku_raw` or `master_sku` has no match in `product_variants` |
| `ORPHAN_SHIPMENT` | Shiprocket | error | `shiprocket_order_id` has no matching WooCommerce order |
| `ORPHAN_RETURN` | Returns | error | Return has no matching shipment |
| `DATE_SEQ_ERROR` | Shiprocket, Returns | warning | Date fields violate expected sequence (e.g. delivered < shipped) |
| `DATE_RANGE_WARN` | Any | warning | Date falls outside expected data period |
| `INVALID_DIRECTION` | Bank Statement | error | Row has both withdrawal and deposit populated |
| `BALANCE_BREAK` | Bank Statement | warning | Closing balance continuity broken |
| `UNCLASSIFIED_NARRATION` | Bank Statement | info | No narration pattern matched; `transaction_type = 'unclassified'` |
| `PII_ERROR` | WooCommerce | warning | Missing or invalid email; order imported without customer_id |
| `TOTAL_MISMATCH` | WooCommerce, Purchase Invoices | warning | Order total or PO total doesn't match component sum |
| `LINE_SUM_MISMATCH` | Purchase Invoices | warning | PO line items don't sum to PO subtotal |
| `RECONCILE_WARN` | Any | warning | Row imported but flagged for reconciliation review |
| `DQ_WARN` | Any | warning | Field-level data quality issue; field nullified |
| `FORMAT_BLOCKED` | Purchase Invoices | error | File format cannot be parsed (e.g. `.xls` without xlrd) |
| `OCR_REQUIRED` | Purchase Invoices | error | File is image-only; requires manual OCR |
| `UNKNOWN_CAMPAIGN` | Marketing | error | Campaign not found in `ad_campaigns` |
| `FIELD_REJECTED` | Any | error | Required field is NULL or invalid; entire row rejected |

---

## Status Dashboard Design

The following queries power the import status view in the admin panel.

### Last Run Per Source

```sql
SELECT 
  source,
  MAX(run_completed_at) AS last_run_at,
  status,
  rows_imported,
  rows_failed,
  rows_skipped_duplicate,
  rows_warnings,
  reconciliation_status
FROM import_runs
WHERE id IN (
  SELECT MAX(id) FROM import_runs GROUP BY source
)
GROUP BY source, status, rows_imported, rows_failed, rows_skipped_duplicate, rows_warnings, reconciliation_status
ORDER BY source;
```

### Open Error Queue (Unresolved Errors)

```sql
SELECT 
  ie.error_code,
  ir.source,
  ir.source_file,
  ie.severity,
  ie.field_name,
  ie.error_message,
  ie.created_at
FROM import_errors ie
JOIN import_runs ir ON ir.id = ie.import_run_id
WHERE ie.resolution_status = 'unresolved'
  AND ie.severity IN ('error', 'warning')
ORDER BY ie.severity DESC, ie.created_at DESC;
```

### Reconciliation Health Summary

```sql
SELECT 
  source,
  COUNT(*) FILTER (WHERE reconciliation_status = 'passed') AS passed,
  COUNT(*) FILTER (WHERE reconciliation_status = 'flagged') AS flagged,
  COUNT(*) FILTER (WHERE reconciliation_status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE reconciliation_status = 'pending') AS pending,
  MAX(reconciliation_run_at) AS last_recon_at
FROM import_runs
WHERE run_completed_at >= NOW() - INTERVAL '90 days'
GROUP BY source
ORDER BY source;
```

### Import Volume Trend (last 12 imports per source)

```sql
SELECT 
  source,
  run_completed_at::date AS run_date,
  rows_imported,
  rows_failed,
  rows_skipped_duplicate,
  status,
  reconciliation_status
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY source ORDER BY id DESC) AS rn
  FROM import_runs
  WHERE status IN ('completed', 'partial')
) ranked
WHERE rn <= 12
ORDER BY source, run_date;
```

### Unresolved SKU Report (critical — blocks KPI compute)

```sql
SELECT 
  ir.source,
  ie.field_value_raw AS raw_sku,
  COUNT(*) AS affected_rows,
  MIN(ir.run_completed_at) AS first_seen
FROM import_errors ie
JOIN import_runs ir ON ir.id = ie.import_run_id
WHERE ie.error_code = 'UNRESOLVED_SKU'
  AND ie.resolution_status = 'unresolved'
GROUP BY ir.source, ie.field_value_raw
ORDER BY affected_rows DESC;
```

---

## Import Run Lifecycle

```
CREATED → RUNNING → COMPLETED
                  ↘ FAILED
                  ↘ PARTIAL (some rows failed; others imported)
```

| Transition | Trigger | Action |
|------------|---------|--------|
| `running` | Import job starts | Set `run_started_at = now()` |
| `completed` | All rows processed; 0 HARD errors | Set `run_completed_at`; trigger reconciliation |
| `partial` | Some rows failed; others succeeded | Set `status = 'partial'`; trigger reconciliation with WARNING |
| `failed` | HARD error (e.g. can't read file; schema violation) | Set `status = 'failed'`; `error_summary` populated; no reconciliation |

---

## Reconciliation Status Lifecycle

```
PENDING → PASSED      (all HARD checks green)
        ↘ FLAGGED     (HARD pass; SOFT warn)
        ↘ FAILED      (HARD check failed)
        ↘ SKIPPED     (admin manually bypassed — use with care)
```

| Status | Meaning | KPI Compute Allowed? |
|--------|---------|---------------------|
| `pending` | Reconciliation not yet run | No |
| `passed` | All HARD and SOFT checks green | Yes |
| `flagged` | SOFT warnings present; HARD checks passed | Yes (with flag) |
| `failed` | At least one HARD check failed | No — halt pipeline |
| `skipped` | Admin override (rare; document reason) | Yes (admin risk-accepted) |

---

## Data Retention Policy

| Table | Retention | Rationale |
|-------|-----------|-----------|
| `import_runs` | Permanent | Audit trail for every data import |
| `import_errors` (resolved) | 1 year | Resolved errors no longer actionable after 1 year |
| `import_errors` (unresolved) | Permanent | Must be resolved or explicitly ignored |
| `imports/raw/` files | Permanent | Original source files must not be deleted |
| `imports/processed/` files | 90 days | Intermediate; original is in raw/ |
| `imports/errors/` CSV logs | 90 days | Supplementary to import_errors table |

---

## Import Run Alerts

The following conditions should generate an alert to the admin:

| Condition | Alert Type | Message |
|-----------|-----------|---------|
| `status = 'failed'` | CRITICAL | Import failed: {source} on {date}. No data loaded. |
| `rows_failed > 0` after run | ERROR | {n} rows rejected in {source} import. Review import_errors. |
| `reconciliation_status = 'failed'` | CRITICAL | Reconciliation failed for {source}. KPI compute halted. |
| `UNRESOLVED_SKU` error count > 0 | WARNING | {n} unresolved SKUs in {source}. KPI compute blocked. |
| `BALANCE_BREAK` error present | WARNING | Bank balance continuity break detected. Review required. |
| Last run > 14 days ago for WooCommerce/Shiprocket | INFO | Data may be stale. Last {source} import: {date}. |
| `reconciliation_status = 'pending'` > 48 hours | WARNING | Reconciliation not run for {source} since {date}. |
