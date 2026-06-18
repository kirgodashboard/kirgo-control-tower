# Kirgo Control Tower — Domain Map
**Version:** 1.0 | **Date:** 2026-06-18  
**Purpose:** Structural overview of all 8 data domains — what each domain owns, which tables belong to it, how domains depend on one another, and the build order for populating data.

---

## Domain Overview

| # | Domain | Tables | Live Rows | Status | Purpose |
|---|--------|--------|----------:|--------|---------|
| 1 | Product | launches, products, product_variants, inventory_batches, inventory_ledger | 37 + 0 + 0 | ⚠️ Partial | SKU catalogue, stock |
| 2 | Orders | customers, orders, order_lines, shipments, returns | 3,833 | ✅ Loaded | All transaction history |
| 3 | Financial | bank_transactions, gateway_settlements, purchase_orders, purchase_order_lines, launch_expenses | 975 + 0 | ⚠️ Partial | Cash and costs |
| 4 | Marketing | ad_campaigns, ad_spend_daily | 3 + 0 | ⚠️ Partial | Ad spend and campaigns |
| 5 | Access Control | roles, users | 4 | ✅ Seeded | Auth and permissions |
| 6 | Operational Expenses | expense_categories, expenses | 15 + 0 | ⚠️ Partial | Opex ledger |
| 7 | Intelligence | kpi_daily_snapshot, kpi_monthly_snapshot, revenue_forecasts, cashflow_forecasts, inventory_forecasts, insights | 0 | 🔶 Phase 2 | KPI compute and forecasts |
| 8 | Import Tracking | import_runs, import_errors | 3,671 | ✅ Active | Audit trail |

---

## Entity Relationship Map

```
╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 1: PRODUCT                                                       ║
║                                                                          ║
║  launches ──────────── products ──────────── product_variants            ║
║     │                    │ (self-ref for sets)      │                    ║
║     │                    └── bundle_leggings_id     │                    ║
║     │                    └── bundle_bra_id          │                    ║
║     │                                               │                    ║
║     ├── inventory_batches ─────────────────────────►│                    ║
║     │         │                                                          ║
║     │         └── inventory_ledger ◄────────────────┘                    ║
╚══════════════════════════════════════════════════════════════════════════╝
         │                     │
         │                     │ variant_id
         ▼                     ▼
╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 2: ORDERS                                                        ║
║                                                                          ║
║  customers ──── orders ──── order_lines ──► product_variants             ║
║                   │                                                      ║
║                   └── shipments ──── returns                             ║
╚══════════════════════════════════════════════════════════════════════════╝
                   │
                   │ (COD CRF ID match)
                   ▼
╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 3: FINANCIAL                                                     ║
║                                                                          ║
║  bank_transactions ◄──────────────────── gateway_settlements             ║
║       │                                        (circular FK resolved     ║
║       │                                         via 3-step atomic INSERT)║
║  purchase_orders ──── purchase_order_lines ──► product_variants          ║
║       │                                                                  ║
║  launch_expenses ──► expense_categories                                  ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 4: MARKETING                                                     ║
║                                                                          ║
║  ad_campaigns ──── ad_spend_daily                                        ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 6: OPERATIONAL EXPENSES                                          ║
║                                                                          ║
║  expense_categories ──── expenses ──► bank_transactions                  ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 5: ACCESS CONTROL                                                ║
║                                                                          ║
║  roles ──── users                                                        ║
║    users.id referenced as created_by / triggered_by across all domains  ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 7: INTELLIGENCE  (reads from Domains 1–4, 6; writes snapshots)  ║
║                                                                          ║
║  kpi_daily_snapshot ◄── compute_kpi_daily_snapshot()                     ║
║  kpi_monthly_snapshot ◄─ compute_kpi_monthly_snapshot() ──► launches     ║
║  revenue_forecasts ◄──── LA-WMA model ──► launches                       ║
║  cashflow_forecasts ◄─── settlement lag model                            ║
║  inventory_forecasts ◄── velocity model ──► product_variants             ║
║  insights ◄──────────── rule engine (reads all snapshot tables)          ║
╚══════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════╗
║  DOMAIN 8: IMPORT TRACKING  (observer — writes only; never read by KPIs)║
║                                                                          ║
║  import_runs ──── import_errors                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Cross-Domain FK Dependencies

| FK (from → to) | Source Domain | Target Domain | Purpose |
|----------------|--------------|---------------|---------|
| products.launch_id → launches.id | Product | Product | Scopes product to a collection |
| product_variants.product_id → products.id | Product | Product | Variant belongs to product |
| inventory_batches.launch_id → launches.id | Product | Product | Batch scoped to collection |
| inventory_batches.variant_id → product_variants.id | Product | Product | Stock receipt for a SKU |
| inventory_batches.purchase_order_id → purchase_orders.id | Product | Financial | Links stock receipt to PO |
| inventory_ledger.variant_id → product_variants.id | Product | Product | Movement on SKU |
| inventory_ledger.batch_id → inventory_batches.id | Product | Product | Draws from specific batch |
| orders.customer_id → customers.id | Orders | Orders | Order belongs to customer |
| order_lines.order_id → orders.id | Orders | Orders | Line items of an order |
| order_lines.variant_id → product_variants.id | Orders | Product | What was ordered |
| shipments.order_id → orders.id | Orders | Orders | Shipment fulfils order |
| shipments.variant_id → product_variants.id | Orders | Product | What was shipped |
| returns.shipment_id → shipments.id | Orders | Orders | Return against shipment |
| bank_transactions.linked_settlement_id → gateway_settlements.id | Financial | Financial | Circular (3-step INSERT) |
| bank_transactions.linked_purchase_order_id → purchase_orders.id | Financial | Financial | PO payment in bank |
| gateway_settlements.bank_transaction_id → bank_transactions.id | Financial | Financial | Circular (3-step INSERT) |
| purchase_orders.launch_id → launches.id | Financial | Product | PO scoped to launch |
| purchase_order_lines.purchase_order_id → purchase_orders.id | Financial | Financial | PO line items |
| purchase_order_lines.variant_id → product_variants.id | Financial | Product | What was ordered from supplier |
| launch_expenses.launch_id → launches.id | Financial | Product | Capex scoped to launch |
| launch_expenses.category_id → expense_categories.id | Financial | Opex | Classifies expense |
| ad_spend_daily.campaign_id → ad_campaigns.id | Marketing | Marketing | Spend belongs to campaign |
| expenses.category_id → expense_categories.id | Opex | Opex | Classifies expense |
| expenses.bank_transaction_id → bank_transactions.id | Opex | Financial | Reconciliation link |
| expenses.launch_id → launches.id | Opex | Product | Opex attributed to launch |
| expenses.campaign_id → ad_campaigns.id | Opex | Marketing | Opex attributed to campaign |
| expenses.created_by → users.id | Opex | Access Control | Audit trail |
| users.role_id → roles.id | Access Control | Access Control | Permission assignment |
| kpi_monthly_snapshot.launch_id → launches.id | Intelligence | Product | Snapshot per collection |
| revenue_forecasts.launch_id → launches.id | Intelligence | Product | Forecast per collection |
| revenue_forecasts.created_by → users.id | Intelligence | Access Control | Who ran forecast |
| cashflow_forecasts.created_by → users.id | Intelligence | Access Control | Who ran forecast |
| inventory_forecasts.variant_id → product_variants.id | Intelligence | Product | Forecast per SKU |
| insights.linked_launch_id → launches.id | Intelligence | Product | Insight scoped to launch |
| insights.linked_variant_id → product_variants.id | Intelligence | Product | Insight scoped to SKU |
| insights.linked_campaign_id → ad_campaigns.id | Intelligence | Marketing | Insight scoped to campaign |
| insights.dismissed_by → users.id | Intelligence | Access Control | Dismissal audit |
| import_runs.triggered_by → users.id | Import Tracking | Access Control | Who triggered import |
| import_errors.import_run_id → import_runs.id | Import Tracking | Import Tracking | Error belongs to run |
| import_errors.resolved_by → users.id | Import Tracking | Access Control | Who resolved error |

---

## Data Flow Diagram

```
                     ┌─────────────────────────────────┐
                     │   SOURCE DATA (Excel Workbook)   │
                     │  Woocom-Orders · SR-20xx sheets  │
                     │  Returns · Bank · Ads · Invoices │
                     └────────────────┬────────────────┘
                                      │ importers/workbook/run_import.py
                                      ▼
                     ┌─────────────────────────────────┐
                     │   DOMAIN 8: IMPORT TRACKING      │
                     │   import_runs · import_errors    │
                     └─────────────────────────────────┘
                                      │ on success
                     ┌────────────────┼──────────────────────────────┐
                     ▼                ▼                              ▼
         ┌──────────────────┐  ┌─────────────┐            ┌──────────────────┐
         │ DOMAIN 2: ORDERS │  │  DOMAIN 3:  │            │  DOMAIN 4:       │
         │ customers 620    │  │  FINANCIAL  │            │  MARKETING       │
         │ orders 916       │  │  bank 672   │            │  campaigns 3     │
         │ order_lines 1153 │  │  gw_stl 301 │            │  ad_spend 0 ⚠️   │
         │ shipments 914    │  │  po 2       │            └──────────────────┘
         │ returns 130      │  └─────────────┘
         └──────────────────┘
                     │
                     │ product_variants.variant_id resolution
                     ▼
         ┌──────────────────────────────────────────┐
         │ DOMAIN 1: PRODUCT                        │
         │ launches 4 · products 10 · variants 23   │
         │ inventory_batches 0 ⚠️                   │
         │ inventory_ledger  0 ⚠️ (blocked)         │
         └──────────────────────────────────────────┘
                     │
                     │ Phase 2 compute scripts (nightly Python)
                     ▼
         ┌───────────────────────────────────────────────────┐
         │ DOMAIN 7: INTELLIGENCE                            │
         │                                                   │
         │  compute_kpi_daily_snapshot()                     │
         │    → kpi_daily_snapshot (1 row/day)               │
         │                                                   │
         │  compute_kpi_monthly_snapshot()                   │
         │    → kpi_monthly_snapshot (1 row/month/launch)    │
         │                                                   │
         │  inventory_forecast.py                            │
         │    → inventory_forecasts (1 row/variant)          │
         │                                                   │
         │  revenue_forecast.py (LA-WMA)                     │
         │    → revenue_forecasts (3-month horizon)          │
         │                                                   │
         │  cashflow_forecast.py                             │
         │    → cashflow_forecasts (3-month horizon)         │
         │                                                   │
         │  run_insights_engine.py                           │
         │    → insights (rule-based alerts)                 │
         └───────────────────────────────────────────────────┘
                     │
                     │ Supabase RPC endpoints (8 × get_*_kpis functions)
                     ▼
         ┌──────────────────────────────────────┐
         │  DASHBOARD API                       │
         │  get_executive_kpis(date)            │
         │  get_sales_kpis(start, end)          │
         │  get_operations_kpis(start, end)     │
         │  get_profitability_kpis(month)       │
         │  get_inventory_kpis()                │
         │  get_finance_kpis(start, end)        │
         │  get_marketing_kpis(month)           │
         │  get_forecast_kpis()                 │
         └──────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────────────────┐
         │  FRONTEND (Phase 3)                  │
         │  Executive · Sales · Operations      │
         │  Profitability · Inventory           │
         │  Marketing · Finance · Forecasts     │
         └──────────────────────────────────────┘
```

---

## Domain Build Order

The following order resolves all FK dependencies and data blocking relationships:

### Step 1 — Seed Reference Data (complete)
- `roles` (3 rows) ✅
- `users` (1 row) ✅
- `expense_categories` (15 rows) ✅
- `launches` (4 rows) ✅
- `products` (10 rows) ✅
- `product_variants` (23 rows) ✅
- `ad_campaigns` (3 rows) ✅
- `purchase_orders` (2 rows) ✅

### Step 2 — Load Historical Data (complete for core tables)
- `customers` (620 rows) ✅
- `orders` (916 rows) ✅
- `order_lines` (1,153 rows) ✅ — variant_id NULL, fix in Step 4
- `shipments` (914 rows) ✅
- `returns` (130 rows) ✅
- `bank_transactions` (672 rows — 2026 only) ✅
- `gateway_settlements` (301 rows) ✅
- `import_runs` (7 rows) ✅
- `import_errors` (3,664 rows) ✅

### Step 3 — Seed Inventory (⚠️ BLOCKING — must complete before Phase 2)
- `inventory_batches` — 2,800 units across 7 products × sizes (see DATABASE_SCHEMA.md §inventory_batches for matrix)
- `inventory_ledger` — seed `opening` entries from inventory_batches; then `sale` entries from delivered shipments

### Step 4 — Resolve Order Lines (⚠️ BLOCKING for B-05, D-01, D-04)
- Run 2-pass UPDATE SQL to populate `order_lines.variant_id` using shiprocket_channel_sku match + sku_manual_map.csv aliases

### Step 5 — Enter Manual Data (⚠️ Unlocks D-group, F-group)
- `launch_expenses` — L1/L2/L3 capex (unlocks D-05 Launch Profitability)
- `ad_spend_daily` — May 2026 + historical months (unlocks D-02 CM%, F-01 ROAS, F-02 MER, F-03 CAC)
- `expenses` — recurring opex from bank_transactions (unlocks D-03 Net Margin, G-02 Outflow, G-04 Burn)
- `purchase_order_lines` — line items for L2/L3 POs

### Step 6 — Import Bank History (⚠️ Unlocks historical G-group)
- Re-run bank_transactions importer for 2023, 2024, 2025 HDFC sheets (currently only 2026 loaded)

### Step 7 — Phase 2 Compute (🔶 KPI engine scripts)
Run in order:
1. `scripts/etl/backfill_kpi_snapshots.py` → populates kpi_daily_snapshot (Jan 2023–today) and kpi_monthly_snapshot
2. `scripts/forecasting/inventory_forecast.py` → populates inventory_forecasts
3. `scripts/forecasting/revenue_forecast.py` → populates revenue_forecasts (LA-WMA)
4. `scripts/forecasting/cashflow_forecast.py` → populates cashflow_forecasts
5. `scripts/insights/run_insights_engine.py` → populates insights

### Step 8 — Phase 2 API (🔶 RPC functions)
Deploy `supabase/migrations/20260619_kpi_rpc_endpoints.sql` to create 8 `get_*_kpis()` RPC functions.

---

## KPI Coverage by Domain

| Domain | KPI Groups | KPIs Available Now | KPIs Blocked | Blocking Reason |
|--------|-----------|-------------------|-------------|-----------------|
| Product | E-group (6) | None | All 6 | inventory_batches empty |
| Orders | A-group (6), B-group (6), C-group (7) | A-01..A-06, A-03, B-01..B-03, B-06, C-01..C-07 | B-04, B-05, D-01, D-04 | variant_id NULL |
| Financial | G-group (6) | G-01..G-03, G-06 (partial) | G-02, G-04, G-05 | expenses empty |
| Marketing | F-group (5) | None | All 5 | ad_spend_daily empty |
| Access Control | — | — | — | — |
| Opex | D-02, D-03 | None | Both | expenses + ad_spend empty |
| Intelligence | All groups (Phase 2) | None | All | Phase 2 scripts not yet run |
| Launches/Product | D-05 | None | D-05 | launch_expenses empty |

---

## Notes on `launches` as the Universal Anchor

`launches` is the single most connected entity in the schema, referenced by:
- products (what was sold under this launch)
- inventory_batches (stock received for this launch)
- purchase_orders (supplier PO for this launch)
- launch_expenses (investment for this launch)
- expenses (opex attributed to this launch)
- kpi_monthly_snapshot (revenue per month per launch)
- revenue_forecasts (forecast per month per launch)
- insights (alerts scoped to launch)

Any KPI that requires per-launch breakdown (B-04, D-05, E-05, H-01) ultimately joins back to this 4-row reference table. It is the top-level entity equivalent of a "company" in a multi-tenant system — except Kirgo has only one company, with `launches` acting as the multi-tenant dimension.

---

## Notes on the Circular FK (`bank_transactions` ↔ `gateway_settlements`)

These two tables have a mutual FK relationship:
- `bank_transactions.linked_settlement_id` → `gateway_settlements.id`
- `gateway_settlements.bank_transaction_id` → `bank_transactions.id`

This is resolved via a 3-step atomic INSERT pattern in `bank_transactions.py`:
```
BEGIN
  INSERT bank_transaction (linked_settlement_id = NULL)  → get bt.id
  INSERT gateway_settlement (bank_transaction_id = bt.id) → get gs.id
  UPDATE bank_transaction SET linked_settlement_id = gs.id WHERE id = bt.id
COMMIT
```
Do NOT attempt to INSERT both rows simultaneously. The INSERT order must be `bank_transactions` first.

---

## Domain Ownership Summary

| Domain | Business Owner | Who Enters Data | Who Reads Dashboards |
|--------|---------------|-----------------|---------------------|
| Product | Founder | Founder (seed) / Admin | Founder, Analyst |
| Orders | Founder | WC/SR importers (automated) | Founder, Analyst |
| Financial | Finance/Founder | Bank importer + manual entry | Founder |
| Marketing | Marketing/Founder | Manual entry (monthly) | Founder |
| Access Control | Admin | Admin only | Admin |
| Operational Expenses | Finance | Manual entry (monthly) | Founder, Analyst |
| Intelligence | Analyst | Phase 2 scripts (automated) | All roles |
| Import Tracking | Admin | Import pipeline (automated) | Admin |
