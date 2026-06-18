# Kirgo Control Tower — Data Dictionary
**Version:** v2.2 | **Schema applied:** 2026-06-17 | **Row counts:** live DB as of 2026-06-18  
**Database:** PostgreSQL (Supabase) · Project: `uyahdsngeiiwjokeiwhr`  
**Conventions:** All monetary values INR (no paise) · All timestamps UTC · `created_at DEFAULT now()` on all tables

---

## Legend

| Code | Meaning |
|------|---------|
| `WC` | WooCommerce CSV export |
| `SR` | Shiprocket yearly CSV exports |
| `RET` | Shiprocket returns exports |
| `BNK` | HDFC bank statement |
| `INV` | Purchase invoice |
| `EXP` | Launch expenses |
| `ADS` | Ad platform statements |
| `MAN` | Manual entry |
| `Calc` | Derived / computed |
| `Seed` | Pre-seeded reference value |

| Status | Meaning |
|--------|---------|
| ✅ | Populated — data present |
| ⚠️ | Data gap — manual action needed |
| 🔶 | Phase 2 — compute/forecast script needed |
| ⛔ | Blocked — depends on another empty table |

---

## Table Index

| # | Table | Domain | Rows | Status | Business Owner |
|---|-------|--------|-----:|--------|----------------|
| 1 | launches | Product | 4 | ✅ | Founder |
| 2 | products | Product | 10 | ✅ | Founder |
| 3 | product_variants | Product | 23 | ✅ | Founder |
| 4 | inventory_batches | Product | 0 | ⚠️ Seed needed | Operations |
| 5 | inventory_ledger | Product | 0 | ⛔ Blocked by #4 | Operations |
| 6 | customers | Orders | 620 | ✅ | Founder |
| 7 | orders | Orders | 916 | ✅ | Founder |
| 8 | order_lines | Orders | 1,153 | ⚠️ variant_id all NULL | Founder |
| 9 | shipments | Orders | 914 | ✅ | Operations |
| 10 | returns | Orders | 130 | ✅ | Operations |
| 11 | bank_transactions | Financial | 672 | ⚠️ 2026-only | Finance |
| 12 | gateway_settlements | Financial | 301 | ✅ | Finance |
| 13 | purchase_orders | Financial | 2 | ✅ | Finance |
| 14 | purchase_order_lines | Financial | 0 | ⚠️ Manual entry | Finance |
| 15 | launch_expenses | Financial | 0 | ⚠️ Manual entry | Finance |
| 16 | ad_campaigns | Marketing | 3 | ✅ | Marketing |
| 17 | ad_spend_daily | Marketing | 0 | ⚠️ Manual entry | Marketing |
| 18 | roles | Access Control | 3 | ✅ | Admin |
| 19 | users | Access Control | 1 | ✅ | Admin |
| 20 | expense_categories | Opex | 15 | ✅ | Admin |
| 21 | expenses | Opex | 0 | ⚠️ Manual entry | Finance |
| 22 | kpi_daily_snapshot | Intelligence | 0 | 🔶 Phase 2 compute | Analyst |
| 23 | kpi_monthly_snapshot | Intelligence | 0 | 🔶 Phase 2 compute | Analyst |
| 24 | revenue_forecasts | Intelligence | 0 | 🔶 Phase 2 forecast | Analyst |
| 25 | cashflow_forecasts | Intelligence | 0 | 🔶 Phase 2 forecast | Finance |
| 26 | inventory_forecasts | Intelligence | 0 | ⛔ Blocked by #5 | Operations |
| 27 | insights | Intelligence | 0 | 🔶 Phase 2 insights | Analyst |
| 28 | import_runs | Import Tracking | 7 | ✅ | Admin |
| 29 | import_errors | Import Tracking | 3,664 | ✅ | Admin |

---

## Domain 1: Product

---

### `launches`

**Purpose:** Top-level product collection entity. Everything in the schema is ultimately scoped to a launch. Each launch has its own investment, SKU set, inventory batch, and revenue attribution. The four current launches span all history: L1 Classic (2023), L2 Summer + Classic Restock (2024), L3 Core (2026), L4 Core Flare (planned).

**Row Count:** 4  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `code`  
**Foreign Keys (incoming):** products · inventory_batches · purchase_orders · launch_expenses · expenses · kpi_monthly_snapshot · revenue_forecasts · insights  
**Business Owner:** Founder  
**Dashboard Usage:** B-04 Revenue by Launch · D-05 Launch Profitability · E-05 Stock Cover Days · H-01 Revenue Forecast · H-02 Cash Forecast

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| code | text | N | Seed | `L1`/`L2`/`L3`/`L4` — machine key; UNIQUE |
| name | text | N | Seed | Display name e.g. `Core` |
| launched_at | date | Y | MAN | Actual go-live; NULL until launch |
| planned_launch_at | date | Y | MAN | Pre-launch target date |
| status | text | N | MAN | `planned`/`active`/`depleted` |
| total_investment_inr | numeric(12,2) | Y | Calc | Derived sum of launch_expenses; NULL until expenses entered |
| notes | text | Y | MAN | Free-form |

---

### `products`

**Purpose:** Garment-level product definitions. One row per distinct product SKU group (leggings, bra, or set) per launch. Three GENERATED columns (`cogs_total_inr`, `gross_margin_inr`, `gross_margin_pct`) auto-update when any input is changed. Bundle (set) products carry self-referential FKs to their component items.

**Row Count:** 10  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `launch_id` → launches.id · `bundle_leggings_id` → products.id · `bundle_bra_id` → products.id  
**Foreign Keys (incoming):** product_variants  
**Business Owner:** Founder  
**Dashboard Usage:** D-01 Blended GM% · D-04 Product Profitability · E-01 Inventory Value

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| launch_id | integer | N | Seed | FK → launches.id |
| name | text | N | Seed | e.g. `Core Leggings` |
| product_type | text | N | Seed | `leggings`/`sports_bra`/`set` |
| is_bundle | boolean | N | Seed | true for Set products |
| bundle_leggings_id | integer | Y | Seed | FK → products.id (set only) |
| bundle_bra_id | integer | Y | Seed | FK → products.id (set only) |
| selling_price_inr | numeric(10,2) | N | Seed | Current MRP |
| cogs_manufacture_inr | numeric(10,2) | N | Calc | Per-unit factory cost |
| cogs_shoot_import_inr | numeric(10,2) | N | Calc | Shoot + customs amortisation |
| cogs_shipping_pkg_inr | numeric(10,2) | N | Calc | Packaging + outbound provision |
| cogs_total_inr | numeric(10,2) | N | **GENERATED** | Sum of 3 COGS components |
| gross_margin_inr | numeric(10,2) | N | **GENERATED** | selling_price − cogs_total |
| gross_margin_pct | numeric(5,2) | N | **GENERATED** | gross_margin / selling_price × 100 |
| is_active | boolean | N | MAN | DEFAULT true |

**Business Rule (BR-GM-03):** For set/bundle products, `cogs_total_inr` already includes all component costs. Never sum component COGS separately for bundles.

---

### `product_variants`

**Purpose:** Individual size × colour SKUs. The canonical lookup key for resolving raw WooCommerce and Shiprocket SKU strings. `sku` is the authoritative canonical format (`{CL1,SUM,COR}-{LEG,BRA,SET}-{XS,S,M,L,XL}`); `shiprocket_channel_sku` is the secondary match used by the SR importer.

**Row Count:** 23 (verify against 24 expected — 1 row discrepancy)  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `sku`  
**Foreign Keys (outgoing):** `product_id` → products.id  
**Foreign Keys (incoming):** order_lines · shipments · inventory_batches · inventory_ledger · inventory_forecasts · purchase_order_lines · insights  
**Business Owner:** Founder  
**Dashboard Usage:** B-05 Revenue by Product · D-04 Product Profitability · All E-group Inventory KPIs

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| product_id | integer | N | Seed | FK → products.id |
| sku | text | N | Seed | Canonical SKU; UNIQUE |
| size | text | Y | Seed | `XS`/`S`/`M`/`L`/`XL` |
| colour | text | Y | Seed | e.g. `Black`, `Pink` |
| woocommerce_product_id | integer | Y | WC | WC variation ID |
| shiprocket_channel_sku | text | Y | SR | Raw SR SKU; secondary match key |
| is_active | boolean | N | MAN | DEFAULT true |

**SKU resolution priority:** (1) shiprocket_channel_sku exact match → (2) sku exact match → (3) sku_manual_map.csv alias lookup.  
**Data gap:** `order_lines.variant_id` is NULL for all 1,153 rows — post-seed UPDATE must be run (see DATABASE_SCHEMA.md §product_variants for 2-pass UPDATE SQL).

---

### `inventory_batches`

**Purpose:** Physical stock receipts from supplier POs. One row per batch per variant. `opening_quantity` is units received. This table is the seed for `inventory_ledger` opening entries and the source for inventory value calculations.

**Row Count:** 0 — **⚠️ MUST SEED before any inventory KPI can be computed**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `launch_id` → launches.id · `variant_id` → product_variants.id · `purchase_order_id` → purchase_orders.id  
**Foreign Keys (incoming):** inventory_ledger  
**Business Owner:** Operations  
**Dashboard Usage:** Blocks E-01..E-06 and H-03 until seeded

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| launch_id | integer | Y | Seed | FK → launches.id |
| variant_id | integer | N | Seed | FK → product_variants.id |
| opening_quantity | integer | N | Seed | Units received from supplier |
| received_at | date | Y | Seed | |
| purchase_order_id | integer | Y | Seed | FK → purchase_orders.id |
| notes | text | Y | MAN | |

**Known opening stock (to seed):** 2,800 total units across 7 product × 5 sizes. See DATABASE_SCHEMA.md §inventory_batches for the full matrix.

---

### `inventory_ledger`

**Purpose:** Append-only stock movement journal. The running stock level for any variant = `SUM(quantity_delta) WHERE variant_id = X`. Movement types: `opening` (batch receipt), `sale` (shipment delivery), `return` (confirmed return), `rto` (RTO), `adjustment` (manual correction).

**Row Count:** 0 — **⛔ BLOCKED by empty inventory_batches**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `variant_id` → product_variants.id · `batch_id` → inventory_batches.id  
**Business Owner:** Operations  
**Dashboard Usage:** E-01 Inventory Value · E-02 Inventory Turnover · E-03 Days of Inventory · E-04 Dead Stock %

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| variant_id | integer | N | Calc | FK → product_variants.id |
| batch_id | integer | Y | Calc | Which batch being drawn (for `opening` type) |
| movement_type | text | N | Calc | `opening`/`sale`/`return`/`rto`/`adjustment` |
| quantity_delta | integer | N | Calc | +ve = stock in · −ve = stock out |
| reference_type | text | Y | Calc | `shipment`/`return_shipment`/`manual` |
| reference_id | integer | Y | Calc | FK into shipments.id or returns.id |
| occurred_at | timestamptz | N | Calc | |
| notes | text | Y | MAN | |

**Key invariant:** `SUM(quantity_delta)` per variant must never go below 0.

---

## Domain 2: Orders

---

### `customers`

**Purpose:** Deduplicated buyer profiles. Email is the primary dedup key. `total_orders` and `total_revenue_inr` are application-maintained denormalised counters updated on each order/delivery event (not computed on read).

**Row Count:** 620  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `email`  
**Foreign Keys (incoming):** orders  
**Business Owner:** Founder  
**Dashboard Usage:** A-05 Active Customers 30D · F-03 CAC · F-04 LTV · F-05 Repeat Purchase Rate

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| email | text | N | WC | Primary dedup; UNIQUE; normalised lowercase |
| phone | text | Y | WC | 10 digits, no +91 |
| first_name | text | Y | WC | |
| last_name | text | Y | WC | |
| first_order_at | timestamptz | Y | Calc | MIN(orders.ordered_at) per customer |
| total_orders | integer | Y | Calc | Denormalised count; incremented on new order |
| total_revenue_inr | numeric(12,2) | Y | Calc | Denormalised; incremented on DELIVERED order |
| acquisition_source | text | Y | WC | utm_source from first order |

**Data quality:** `total_orders` counts all statuses. For accurate repeat-purchase analysis use `COUNT(DISTINCT orders.id WHERE shipment.status='DELIVERED')` per customer.

---

### `orders`

**Purpose:** WooCommerce order header records. One row per WC order. The dedup key `woocommerce_order_id` prevents reimport. Multi-item orders are normalised into `order_lines`.

**Row Count:** 916  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `woocommerce_order_id`  
**Foreign Keys (outgoing):** `customer_id` → customers.id  
**Foreign Keys (incoming):** order_lines · shipments  
**Business Owner:** Founder  
**Dashboard Usage:** A-01..A-04 Revenue KPIs · B-01..B-06 Sales KPIs · COD mix

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| woocommerce_order_id | integer | N | WC | Dedup key; UNIQUE |
| woocommerce_order_number | text | Y | WC | Human-readable order ref |
| customer_id | integer | Y | WC | FK → customers.id |
| status | text | N | WC | `processing`/`completed`/`cancelled`/`refunded` |
| payment_method | text | Y | WC | `gokwik_prepaid`/`gokwik_cod`/`easebuzz`/`infibeam`/`cod`/`razorpay` |
| payment_method_title | text | Y | WC | Raw WC value |
| transaction_id | text | Y | WC | Gateway reference |
| subtotal_inr | numeric(10,2) | Y | WC | Pre-discount, pre-shipping |
| discount_inr | numeric(10,2) | Y | WC | DEFAULT 0 |
| shipping_charged_inr | numeric(10,2) | Y | WC | Shipping collected; **excluded from all revenue KPIs** (BR-004) |
| order_total_inr | numeric(10,2) | N | WC | |
| attribution_source | text | Y | WC | utm_source |
| attribution_medium | text | Y | WC | utm_medium |
| attribution_campaign | text | Y | WC | utm_campaign |
| attribution_device | text | Y | WC | `desktop`/`mobile`/`tablet` |
| billing_city | text | Y | WC | |
| billing_state | text | Y | WC | Used for B-06 Revenue by State |
| billing_pincode | text | Y | WC | |
| ordered_at | timestamptz | N | WC | IST→UTC converted at import |
| paid_at | timestamptz | Y | WC | |

**Business Rule (BR-REV-01):** Revenue recognised at `shipments.status = 'DELIVERED' AND delivered_at IS NOT NULL`. `orders.order_total_inr` is NOT the revenue figure.  
**Business Rule (BR-DQ-01):** Order volume = `COUNT(DISTINCT orders.woocommerce_order_id)` — never count shipment rows directly.

---

### `order_lines`

**Purpose:** Normalised line items from WooCommerce orders. One row per product per order. A 3-item order produces 3 `order_lines` rows. `line_total_inr` (actual post-discount price × quantity) is the per-line revenue amount used in all revenue KPIs.

**Row Count:** 1,153  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `order_id` → orders.id · `variant_id` → product_variants.id  
**Business Owner:** Founder  
**Dashboard Usage:** A-01 Gross Revenue · B-01..B-06 · D-01 Blended GM · D-04 Product Profitability

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| order_id | integer | N | WC | FK → orders.id |
| variant_id | integer | Y | Calc | FK → product_variants.id; **NULL for all 1,153 rows** pending post-seed UPDATE |
| woocommerce_line_item_id | integer | Y | WC | WC product item N id |
| sku_raw | text | Y | WC | Raw WC SKU before canonical resolution |
| product_name_raw | text | Y | WC | Raw product name |
| quantity | integer | N | WC | |
| unit_price_inr | numeric(10,2) | Y | WC | Actual post-discount unit price |
| line_total_inr | numeric(10,2) | Y | WC | quantity × unit_price; **the revenue figure** |
| line_subtotal_inr | numeric(10,2) | Y | WC | Pre-discount line value |

**Active data gap (RC-REV-04):** `variant_id` is NULL for all rows — blocks D-04 (Product Profitability) and B-05 (Revenue by Product). Run post-seed UPDATE SQL after seeding product_variants.

---

### `shipments`

**Purpose:** Shiprocket shipment records. One row per AWB (airway bill). A single WooCommerce order may produce multiple shipment rows when it contains multiple SKUs. Revenue recognition anchor: the delivery timestamp.

**Row Count:** 914  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `awb_code`  
**Foreign Keys (outgoing):** `order_id` → orders.id · `variant_id` → product_variants.id  
**Foreign Keys (incoming):** returns  
**Business Owner:** Operations  
**Dashboard Usage:** A-01..A-04 (revenue recognition base) · C-01..C-07 Operations KPIs · G-06 COD Outstanding

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| order_id | integer | Y | SR | FK → orders.id |
| shiprocket_order_id | bigint | Y | SR | Not unique for multi-item orders |
| awb_code | text | N | SR | Dedup key; UNIQUE |
| channel | text | Y | SR | `WOOCOMMERCE`/`CUSTOM` |
| status | text | N | SR | `DELIVERED`/`RTO_DELIVERED`/`IN_TRANSIT`/`OUT_FOR_DELIVERY`/`CANCELLED`/etc. |
| variant_id | integer | Y | Calc | FK → product_variants.id |
| channel_sku | text | Y | SR | Raw channel SKU |
| master_sku | text | Y | SR | SR normalised SKU |
| product_quantity | integer | N | SR | |
| payment_method | text | Y | SR | `prepaid`/`cod` |
| product_price_inr | numeric(10,2) | Y | SR | Price per unit |
| order_total_inr | numeric(10,2) | Y | SR | Full order total (shared across multi-item rows) |
| courier_company | text | Y | SR | `Delhivery`/`Blue Dart`/`Amazon` |
| zone | text | Y | SR | `z_a`/`z_b`/`z_c`/`z_d`/`z_e` |
| freight_total_inr | numeric(10,2) | Y | SR | Courier cost to Kirgo; **excluded from revenue** |
| cod_charges_inr | numeric(10,2) | N | SR | DEFAULT 0; always ≥ 0 (normalised in importer) |
| cod_crf_id | text | Y | SR | Links to bank_transactions.extracted_reference |
| cod_remittance_date | date | Y | SR | |
| cod_payable_inr | numeric(10,2) | Y | SR | |
| remitted_inr | numeric(10,2) | Y | SR | Actual amount remitted |
| shiprocket_created_at | timestamptz | Y | SR | IST→UTC |
| channel_created_at | timestamptz | Y | SR | WC order creation; IST→UTC |
| picked_up_at | timestamptz | Y | SR | IST→UTC; guarded: NULL if < 2000-01-01 |
| shipped_at | timestamptz | Y | SR | IST→UTC; guarded |
| **delivered_at** | timestamptz | Y | SR | **Revenue recognition timestamp**; IST→UTC; guarded |
| edd | date | Y | SR | Estimated delivery date |
| rto_initiated_at | timestamptz | Y | SR | IST→UTC; guarded |
| rto_delivered_at | timestamptz | Y | SR | IST→UTC; guarded |
| ndr_attempts | integer | N | SR | DEFAULT 0 |
| latest_ndr_reason | text | Y | SR | |
| customer_city | text | Y | SR | |
| customer_state | text | Y | SR | |
| customer_pincode | text | Y | SR | |
| rto_risk | text | Y | SR | `low`/`medium`/`high` (Shiprocket RAD score) |

**Source:** SR-2023 (62), SR-2024 (571), SR-2025 (250), SR-2026 (216).  
**Business Rule (BR-004):** `freight_total_inr` and `cod_charges_inr` are costs to Kirgo — excluded from all revenue KPIs. `shipping_charged_inr` on orders is what the customer paid — also excluded.  
**Date guard:** `_MIN_VALID_DATE = 2000-01-01` applied to all SR date fields; Excel serial 0 (1900-01-01) is stored as NULL.

---

### `returns`

**Purpose:** Reverse logistics records for customer-initiated returns. Covers QC, refund status, and refund mode. RTOs (Return To Origin) are tracked separately in `shipments.status = 'RTO_DELIVERED'`.

**Row Count:** 130  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `shipment_id` → shipments.id  
**Business Owner:** Operations  
**Dashboard Usage:** C-01 Return Rate · C-02 Return Value · A-02 Net Revenue (refunds deducted)

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| shipment_id | integer | Y | RET | FK → shipments.id (original forward shipment) |
| shiprocket_order_id | bigint | Y | RET | |
| awb_code | text | Y | RET | Reverse AWB |
| status | text | Y | RET | |
| return_reason | text | Y | RET | Customer-stated reason (free text) |
| qc_status | text | Y | RET | Shiprocket QC outcome |
| qc_failure_reason | text | Y | RET | |
| refund_amount_inr | numeric(10,2) | Y | RET | Refund issued to customer |
| refund_status | text | Y | RET | `pending`/`processed` |
| refund_mode | text | Y | RET | `original_payment_method`/`bank_transfer` |
| returned_at | timestamptz | Y | RET | |

**Sources:** Returns 2025-2026 sheet (57 rows), Returns-2023/2024/2025 sheets (73 rows).

---

## Domain 3: Financial

---

### `bank_transactions`

**Purpose:** HDFC bank statement raw records. One row per bank debit/credit entry. The narration classifier assigns `transaction_type` and extracts `counterparty` and `extracted_reference`. Dedup is enforced at code level (SELECT-before-INSERT); there is no DB UNIQUE constraint.

**Row Count:** 672 — **⚠️ 2026-only** (01/01/2026–15/06/2026); 2023–2025 not yet imported  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `linked_settlement_id` → gateway_settlements.id · `linked_purchase_order_id` → purchase_orders.id  
**Foreign Keys (incoming):** gateway_settlements · expenses  
**Business Owner:** Finance/Founder  
**Dashboard Usage:** A-06 Cash Position · G-01 Cash Inflow · G-02 Cash Outflow · G-03 Net Cash Flow · G-06 COD Outstanding

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| transaction_date | date | N | BNK | |
| value_date | date | Y | BNK | |
| narration_raw | text | N | BNK | Original bank narration string |
| reference_number | text | Y | BNK | Chq/Ref No. |
| withdrawal_inr | numeric(12,2) | Y | BNK | NULL if credit; always ≥ 0 (abs() normalised) |
| deposit_inr | numeric(12,2) | Y | BNK | NULL if debit; always ≥ 0 |
| closing_balance_inr | numeric(12,2) | Y | BNK | Running balance after transaction |
| transaction_type | text | Y | Calc | Narration-classifier output (see vocabulary below) |
| counterparty | text | Y | Calc | Extracted entity name |
| extracted_reference | text | Y | Calc | CRF ID / UTR / YESF code |
| linked_settlement_id | integer | Y | Calc | FK → gateway_settlements.id (set post-insert) |
| linked_purchase_order_id | integer | Y | Calc | FK → purchase_orders.id |
| notes | text | Y | MAN | |

**Transaction type vocabulary:** `gateway_settlement` · `cod_remittance` · `shiprocket_recharge` · `courier_payment` · `ad_spend_meta` · `ad_spend_google` · `saas_subscription` · `customer_refund` · `bank_charge` · `founder_transfer` · `supplier_payment` · `unclassified`  
**Dedup key (code-level):** `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)` with `IS NOT DISTINCT FROM`.  
**Circular FK note:** `bank_transactions.linked_settlement_id` ↔ `gateway_settlements.bank_transaction_id` — resolved via 3-step atomic INSERT pattern.

---

### `gateway_settlements`

**Purpose:** Payment gateway batch settlement records. Each NEFT credit from EaseBuzz/Infibeam/GoKwik/Razorpay or COD batch remittance from Shiprocket maps to one row here, and back to the originating bank transaction.

**Row Count:** 301  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `settlement_reference`  
**Foreign Keys (outgoing):** `bank_transaction_id` → bank_transactions.id  
**Foreign Keys (incoming):** bank_transactions  
**Business Owner:** Finance  
**Dashboard Usage:** G-01 Cash Inflow · RC-BANK reconciliation  
**Check Constraint:** `gateway IN ('easebuzz','infibeam','shiprocket_cod','gokwik','razorpay')`

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| gateway | text | N | Calc | Domain value — see constraint above |
| settlement_reference | text | Y | Calc | UTR / YESF code / CRF ID; UNIQUE |
| amount_inr | numeric(12,2) | N | BNK | Settlement amount |
| settled_at | date | Y | BNK | |
| order_count | integer | Y | BNK | Orders in this batch |
| bank_transaction_id | integer | Y | Calc | FK → bank_transactions.id |

**Gateway domain mapping:** `easebuzz` = YesBank escrow (YESF narration) · `infibeam` = ICICI nodal (IN ref) · `gokwik` = Bigfoot Retail Solutions Pvt Ltd via ICICI · `razorpay` = NEFT RAZORPAY narration · `shiprocket_cod` = CRF batch remittance

---

### `purchase_orders`

**Purpose:** Supplier PO headers for inventory procurement. Two POs seeded: JSKS-240801 (L2, Shanghai Jspeed, USD) and BURN-251006 (L3, Burning Active Apparel, USD).

**Row Count:** 2  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `launch_id` → launches.id  
**Foreign Keys (incoming):** purchase_order_lines · inventory_batches · bank_transactions  
**Business Owner:** Finance/Founder  
**Dashboard Usage:** D-05 Launch Profitability

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| launch_id | integer | Y | Seed | FK → launches.id |
| supplier_name | text | N | Seed | e.g. `Shanghai Jspeed Industry Co.` |
| invoice_number | text | Y | Seed | e.g. `JSKS-240801` |
| invoice_date | date | Y | Seed | |
| currency | text | Y | Seed | DEFAULT `USD` |
| subtotal_foreign | numeric(12,2) | Y | Seed | In supplier currency |
| shipping_cost_foreign | numeric(12,2) | Y | Seed | |
| total_foreign | numeric(12,2) | Y | Seed | |
| fx_rate_inr | numeric(8,4) | Y | Seed | INR per foreign unit at payment date |
| total_inr | numeric(12,2) | Y | Seed | Converted total |
| payment_terms | text | Y | Seed | e.g. `35% advance, 65% before shipment` |
| payment_method | text | Y | Seed | `swift`/`paypal` |
| status | text | Y | MAN | `draft`/`partial_paid`/`paid`/`received` |

---

### `purchase_order_lines`

**Purpose:** Individual SKU × quantity line items within each PO. Required to reconcile supplier invoices against inventory batches.

**Row Count:** 0 — **⚠️ awaiting manual data entry**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `purchase_order_id` → purchase_orders.id · `variant_id` → product_variants.id  
**Business Owner:** Finance  
**Dashboard Usage:** D-05 Launch Profitability (cost per unit validation)

---

### `launch_expenses`

**Purpose:** Capital expenditure line items per launch. Covers manufacturing instalments, sampling, shoot, packaging, import logistics. `SUM(amount_inr)` per launch should equal `launches.total_investment_inr`. Populating this table unlocks D-05 Launch Profitability.

**Row Count:** 0 — **⚠️ awaiting manual data entry**  
**Known totals to enter:** L1 ₹6,43,500 · L2 ₹10,37,760 · L3 ₹5,05,000  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `launch_id` → launches.id · `category_id` → expense_categories.id  
**Business Owner:** Finance/Founder  
**Dashboard Usage:** D-05 Launch Profitability · D-02 Contribution Margin (amortised)

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| launch_id | integer | N | EXP | FK → launches.id |
| expense_name | text | N | EXP | e.g. `Instalment 1 (Pink + Black)` |
| category_id | integer | N | EXP | FK → expense_categories.id |
| amount_inr | numeric(12,2) | N | EXP | |
| currency_original | text | Y | EXP | DEFAULT `INR` |
| amount_foreign | numeric(12,2) | Y | EXP | If paid in USD |
| fx_rate_inr | numeric(8,4) | Y | EXP | At payment date |
| paid_at | date | Y | EXP | |
| status | text | Y | EXP | `paid`/`pending`/`tbd` |
| notes | text | Y | MAN | |

---

## Domain 4: Marketing

---

### `ad_campaigns`

**Purpose:** Google and Meta campaign definitions. Campaigns are the FK parent for all daily spend rows. Three campaigns seeded.

**Row Count:** 3  
**Primary Key:** `id` (serial)  
**Foreign Keys (incoming):** ad_spend_daily · expenses · insights  
**Business Owner:** Marketing/Founder  
**Dashboard Usage:** F-01 ROAS · F-02 MER · F-03 CAC

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| platform | text | N | Seed | `google`/`meta` |
| platform_account_id | text | Y | Seed | Google: `736-944-6064` · Meta: `729422043560314` |
| campaign_name | text | Y | Seed | e.g. `Sid - PMAX - 15 May` |
| campaign_type | text | Y | Seed | `pmax`/`search`/`shopping`/`advantage_plus` |
| started_at | date | Y | Seed | |
| ended_at | date | Y | Seed | NULL = active |
| is_active | boolean | N | MAN | DEFAULT true |

---

### `ad_spend_daily`

**Purpose:** Daily ad spend by campaign. `spend_inr` (net, after overdelivery credits) is used for ROAS and contribution margin. `total_inr = spend_inr + gst_inr` is used for MER (includes 18% IGST from Google).

**Row Count:** 0 — **⚠️ awaiting manual data entry**  
**Known data to enter:** May 2026 — Sid-PMAX-15-May ₹6,688.87 + Kirgo-Test-1 ₹3,897.86 + Meta ₹10,000  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `campaign_id` → ad_campaigns.id  
**Business Owner:** Marketing  
**Dashboard Usage:** D-02 Contribution Margin · F-01 ROAS · F-02 MER · F-03 CAC

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| campaign_id | integer | N | ADS | FK → ad_campaigns.id |
| spend_date | date | N | ADS | |
| impressions | bigint | N | ADS | DEFAULT 0 |
| clicks | integer | N | ADS | DEFAULT 0 |
| spend_inr | numeric(10,2) | N | ADS | Net spend; use for ROAS/CAC/CM |
| gst_inr | numeric(10,2) | N | ADS | DEFAULT 0; 18% IGST for Google |
| total_inr | numeric(10,2) | N | ADS | spend + gst; use for MER |
| invoice_reference | text | Y | ADS | Google invoice # or Meta receipt ID |

---

## Domain 5: Access Control

---

### `roles`

**Purpose:** RBAC role definitions controlling dashboard permissions. Three roles seeded.

**Row Count:** 3 · **PK:** `id` (serial) · **Unique:** `code`  
**Foreign Keys (incoming):** users  
**Business Owner:** Admin

| code | name | financials | customers | edit_forecasts | manage_users |
|------|------|-----------|-----------|---------------|-------------|
| `admin` | Administrator | ✓ | ✓ | ✓ | ✓ |
| `analyst` | Analyst | ✓ | ✓ | ✓ | ✗ |
| `viewer` | Viewer | ✗ | ✗ | ✗ | ✗ |

---

### `users`

**Purpose:** Application user profiles linked to Supabase `auth.users`. `id` (serial) is used for all FK references within the schema to keep FK columns as integers.

**Row Count:** 1 (Jiten, admin role)  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `auth_user_id`, `email`  
**Foreign Keys (outgoing):** `role_id` → roles.id  
**Business Owner:** Admin

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | Serial PK; used for all FK references |
| auth_user_id | uuid | N | AUTH | Supabase auth.users.id |
| role_id | integer | N | MAN | FK → roles.id |
| full_name | text | Y | MAN | |
| email | text | N | AUTH | Mirrored from auth.users |
| is_active | boolean | N | MAN | DEFAULT true |
| last_login_at | timestamptz | Y | Auth | Updated on login |

---

## Domain 6: Operational Expenses

---

### `expense_categories`

**Purpose:** Controlled vocabulary for classifying both launch capex (`launch_expenses`) and operational costs (`expenses`). 15 categories across 4 `category_group` values.

**Row Count:** 15 · **PK:** `id` (serial) · **Unique:** `code`  
**Foreign Keys (incoming):** launch_expenses · expenses  
**Business Owner:** Admin/Finance

| code | name | category_group | applies_to |
|------|------|---------------|-----------|
| manufacturing | Manufacturing | capex | launch |
| sample | Sampling | capex | launch |
| shoot | Shoot & Creative | capex | launch |
| packaging | Packaging | capex | both |
| website | Website & Tech | capex | launch |
| logistics_inbound | Inbound Logistics | capex | launch |
| legal | Legal & Compliance | capex | launch |
| founder_credit | Founder Capital | financing | launch |
| shipping_outbound | Outbound Shipping | cogs | operations |
| shipping_inbound | Inbound Returns Shipping | cogs | operations |
| ad_spend | Advertising | marketing | both |
| platform_saas | Platform & SaaS | opex | operations |
| customer_refund | Customer Refunds | opex | operations |
| bank_charges | Bank & FX Charges | opex | operations |
| misc | Miscellaneous | opex | both |

---

### `expenses`

**Purpose:** Recurring operational cost ledger (SaaS subscriptions, Shiprocket wallet top-ups, bank charges). Each row reconcilable to a `bank_transactions` entry. Together with `launch_expenses`, provides the full cost picture for P&L and cashflow KPIs.

**Row Count:** 0 — **⚠️ awaiting manual data entry**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `category_id` → expense_categories.id · `bank_transaction_id` → bank_transactions.id · `launch_id` → launches.id · `campaign_id` → ad_campaigns.id · `created_by` → users.id  
**Business Owner:** Finance  
**Dashboard Usage:** D-02 Contribution Margin · D-03 Net Margin % · G-02 Cash Outflow · G-04 Burn Rate

| Column | Type | N? | Source | Description |
|--------|------|----|--------|-------------|
| id | integer | N | Auto | PK |
| expense_date | date | N | MAN | |
| category_id | integer | N | MAN | FK → expense_categories.id |
| description | text | N | MAN | e.g. `Google Workspace - June 2026` |
| amount_inr | numeric(12,2) | N | MAN | |
| vendor | text | Y | MAN | e.g. `Google`, `Shiprocket` |
| payment_method | text | Y | MAN | `upi`/`bank_transfer`/`debit_card`/`swift` |
| bank_transaction_id | integer | Y | Calc | Reconciliation link |
| launch_id | integer | Y | MAN | If cost attributed to a specific launch |
| campaign_id | integer | Y | MAN | If cost is ad spend |
| is_recurring | boolean | N | MAN | DEFAULT false |
| recurrence_period | text | Y | MAN | `weekly`/`monthly`/`annual` |
| notes | text | Y | MAN | |
| created_by | integer | Y | Auth | FK → users.id |

---

## Domain 7: Intelligence

---

### `kpi_daily_snapshot`

**Purpose:** Pre-computed daily KPI rollup for fast dashboard queries. One row per calendar date, recomputed nightly by `compute_kpi_daily_snapshot()`. Powers all P1 executive KPIs without runtime aggregation over raw tables.

**Row Count:** 0 — **🔶 Phase 2 compute script needed** (will backfill to Jan 2023 on first run)  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `snapshot_date`  
**Business Owner:** Analyst  
**Dashboard Usage:** ALL P1 Executive KPIs (A-01..A-06) · G-01..G-03 Finance daily view

| Column | Type | Description |
|--------|------|-------------|
| snapshot_date | date | One row per calendar day; UNIQUE |
| gross_revenue_inr | numeric | SUM(line_total_inr) for orders delivered on this date |
| net_revenue_inr | numeric | Gross minus refunds and discounts settled this day |
| orders_placed | integer | WC orders created on this date |
| orders_delivered | integer | Shipments with delivered_at on this date |
| units_sold | integer | SUM(order_lines.quantity) for delivered orders |
| avg_order_value_inr | numeric | gross_revenue / orders_delivered |
| new_customers | integer | Customers with first_order_at = this date |
| returns_count | integer | |
| returns_value_inr | numeric | SUM(refund_amount_inr) settled this day |
| rto_count | integer | Shipments with rto_delivered_at = this date |
| rto_cost_inr | numeric | Two-way freight estimate for RTOs |
| cod_orders | integer | Delivered orders with payment_method = 'cod' |
| prepaid_orders | integer | |
| cash_deposited_inr | numeric | SUM(bank_transactions.deposit_inr) on this date |
| cash_withdrawn_inr | numeric | SUM(bank_transactions.withdrawal_inr) on this date |
| closing_bank_balance_inr | numeric | Last closing_balance_inr of the day |
| ad_spend_inr | numeric | SUM(ad_spend_daily.spend_inr) on this date |
| computed_at | timestamptz | When last recomputed |

---

### `kpi_monthly_snapshot`

**Purpose:** Monthly P&L-grade KPI rollup. One row per (month × launch), plus one aggregate row per month (`launch_id IS NULL`). Includes margin calculations, COD mix, ROAS — all metrics that are only meaningful at monthly granularity.

**Row Count:** 0 — **🔶 Phase 2 compute script needed**  
**Primary Key:** `id` (serial)  
**Unique Constraints:** `(snapshot_month, launch_id)` — partial unique index for NULL launch_id  
**Foreign Keys (outgoing):** `launch_id` → launches.id  
**Business Owner:** Analyst  
**Dashboard Usage:** B-01..B-06 · D-01 Blended GM · D-02 Contribution Margin · F-01 ROAS · Monthly trend charts

| Column | Type | Description |
|--------|------|-------------|
| snapshot_month | date | First day of month |
| launch_id | integer | NULL = all-launches aggregate |
| gross_revenue_inr | numeric | |
| net_revenue_inr | numeric | After returns and discounts |
| orders_delivered | integer | |
| units_sold | integer | |
| avg_order_value_inr | numeric | |
| new_customers | integer | |
| returning_customers | integer | |
| gross_margin_inr | numeric | Revenue − COGS (unit-level) |
| gross_margin_pct | numeric | |
| total_shipping_cost_inr | numeric | SUM(shipments.freight_total_inr) |
| total_cod_charges_inr | numeric | |
| total_ad_spend_inr | numeric | |
| total_opex_inr | numeric | SUM(expenses.amount_inr) |
| contribution_margin_inr | numeric | gross_margin − shipping − cod − ad_spend |
| contribution_margin_pct | numeric | |
| rto_count | integer | |
| rto_rate_pct | numeric | |
| return_rate_pct | numeric | |
| cod_mix_pct | numeric | COD orders / total orders |
| roas | numeric | net_revenue / total_ad_spend |
| cash_collected_inr | numeric | Actual bank deposits from gateway + COD |
| computed_at | timestamptz | |

---

### `revenue_forecasts`

**Purpose:** LA-WMA (Launch-Adjusted Weighted Moving Average) model outputs. One forecast per (month × launch). Prior forecasts marked `is_current = false` to preserve history. `actual_revenue_inr` back-filled after month closes, enabling H-04 Forecast Accuracy.

**Row Count:** 0 — **🔶 Phase 2 forecast engine needed**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `launch_id` → launches.id · `created_by` → users.id  
**Business Owner:** Analyst/Founder  
**Dashboard Usage:** H-01 Revenue Forecast · H-04 Forecast Accuracy

Key columns: `forecast_month` · `launch_id` · `model_version` · `forecast_revenue_inr` · `confidence_low_inr` · `confidence_high_inr` · `launch_phase_factor` · `stock_availability_factor` · `actual_revenue_inr` · `forecast_accuracy_pct` · `is_current`

---

### `cashflow_forecasts`

**Purpose:** Monthly cash position projections. Models settlement lag (prepaid T+3, COD T+10), planned outflows (ad spend, supplier payments, SaaS), and RTO/return provisions. Critical for L4 deposit timing decisions.

**Row Count:** 0 — **🔶 Phase 2 forecast engine needed**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `created_by` → users.id  
**Business Owner:** Finance/Founder  
**Dashboard Usage:** H-02 Cash Forecast · G-05 Cash Runway

Key columns: `forecast_month` · `opening_balance_inr` · `expected_total_inflow_inr` · `expected_total_outflow_inr` · `expected_closing_balance_inr` · `actual_closing_balance_inr` · `prepaid_settlement_lag_days` (DEFAULT 3) · `cod_settlement_lag_days` (DEFAULT 10) · `is_current`

---

### `inventory_forecasts`

**Purpose:** Per-variant stockout projections computed from 7-day and 30-day rolling sales velocity. `alert_level` drives inventory alert cards. `reorder_recommended = true` triggers the reorder queue.

**Row Count:** 0 — **⛔ BLOCKED** (requires inventory_ledger rows, which require inventory_batches seed)  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `variant_id` → product_variants.id  
**Business Owner:** Operations/Founder  
**Dashboard Usage:** E-03 Days of Inventory · E-05 Stock Cover Days · E-06 Reorder Quantity · H-03 Depletion Forecast

| Column | Type | Description |
|--------|------|-------------|
| variant_id | integer | NOT NULL — FK → product_variants.id |
| snapshot_date | date | Date of projection |
| current_stock | integer | Stock on hand at snapshot |
| daily_velocity_30d | numeric | Units/day, 30-day rolling avg |
| daily_velocity_7d | numeric | Units/day, 7-day rolling avg (spike detection) |
| days_to_stockout_30d | integer | current_stock / daily_velocity_30d |
| projected_stockout_date | date | snapshot_date + days_to_stockout_30d |
| alert_level | text | NOT NULL — `ok`/`watch`/`warning`/`critical` |
| reorder_recommended | boolean | true when days_to_stockout_30d < 30 |
| units_to_reorder | integer | MAX(0, velocity_30d × 90 − current_stock) |
| is_current | boolean | Latest snapshot per variant |

**Alert thresholds:** > 60 days → ok · 30–60 → watch · 14–30 → warning · < 14 → critical

---

### `insights`

**Purpose:** Rule-based and AI-generated business observations. The insights engine evaluates 20+ KPI threshold rules nightly and writes structured alerts here. Users with `can_dismiss_insights` permission can dismiss resolved alerts.

**Row Count:** 0 — **🔶 Phase 2 insights engine needed**  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `linked_launch_id` → launches.id · `linked_variant_id` → product_variants.id · `linked_campaign_id` → ad_campaigns.id · `dismissed_by` → users.id  
**Business Owner:** Analyst/Founder  
**Dashboard Usage:** All dashboards — floating alert cards sorted by `severity` DESC

| Column | Type | Description |
|--------|------|-------------|
| insight_date | date | Date the insight is relevant to |
| source | text | `ai`/`rule` |
| category | text | `revenue`/`inventory`/`cashflow`/`marketing`/`operations`/`forecast` |
| severity | text | `opportunity`/`info`/`warning`/`alert` (alert = highest urgency) |
| title | text | Max 80 chars — shown in alert card |
| body | text | Full narrative |
| metric_name | text | e.g. `rto_rate` |
| metric_value | numeric | Current value |
| metric_benchmark | numeric | Historical average or target |
| metric_delta_pct | numeric | % deviation from benchmark |
| is_dismissed | boolean | DEFAULT false |
| raw_context | jsonb | Data snapshot used to generate — audit trail |

---

## Domain 8: Import Tracking

---

### `import_runs`

**Purpose:** One row per import pipeline execution. Complete audit trail of rows read, imported, skipped, failed, and warned. Also records reconciliation check outcomes. A `reconciliation_status = 'failed'` (HARD check failed) blocks KPI compute for that source.

**Row Count:** 7  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `triggered_by` → users.id  
**Foreign Keys (incoming):** import_errors  
**Business Owner:** Admin/Analyst  
**Dashboard Usage:** Admin Dashboard → Import Health panel

| Column | Type | Description |
|--------|------|-------------|
| source | text | `woocommerce`/`shiprocket`/`returns`/`bank_statement`/`marketing_spend` |
| source_file | text | Filename of imported file |
| source_sheet | text | Sheet name within file |
| run_started_at | timestamptz | NOT NULL DEFAULT now() |
| run_completed_at | timestamptz | NULL while running |
| status | text | `running`/`completed`/`failed`/`partial` |
| rows_in_source | integer | Total rows read from source |
| rows_imported | integer | Successfully written to DB |
| rows_skipped_duplicate | integer | Matched dedup key — intentionally skipped |
| rows_failed | integer | Rejected due to hard validation error |
| rows_warnings | integer | Imported with DQ_WARN flag |
| reconciliation_status | text | `pending`/`passed`/`failed`/`flagged`/`skipped` |
| hard_checks_passed | integer | |
| hard_checks_failed | integer | |
| triggered_by | integer | FK → users.id |

**Import run history (7 rows):** WC ×1 · SR ×4 (one per year) · bank ×2 (partial runs)

---

### `import_errors`

**Purpose:** One row per rejected or flagged source row. Preserves the original row as JSONB for re-import investigation. Severity distinguishes `error` (excluded), `warning` (imported with flag), and `info` (expected skip).

**Row Count:** 3,664 — primarily `UNRESOLVED_SKU` warnings from SR importer (variant_id not resolved)  
**Primary Key:** `id` (serial)  
**Foreign Keys (outgoing):** `import_run_id` → import_runs.id · `resolved_by` → users.id  
**Business Owner:** Admin  
**Dashboard Usage:** Admin → Error Queue; filter: `severity='error' AND resolution_status='unresolved'`

| Column | Type | Description |
|--------|------|-------------|
| import_run_id | integer | NOT NULL — FK → import_runs.id |
| row_number | integer | Row # in source file |
| source_row_snapshot | jsonb | Full original row data — enables re-import after fix |
| error_code | text | Machine code e.g. `DUPLICATE_AWB`/`UNRESOLVED_SKU`/`BALANCE_BREAK` |
| error_message | text | Human description |
| severity | text | `error`/`warning`/`info` |
| field_name | text | Offending column |
| field_value_raw | text | Raw value of offending field |
| resolution_status | text | `unresolved`/`resolved`/`ignored`/`deferred` |
| resolved_by | integer | FK → users.id |
| resolved_at | timestamptz | |
| resolution_notes | text | |

---

## Appendix A: Foreign Key Reference Map

```
launches
  ← products.launch_id
  ← inventory_batches.launch_id
  ← purchase_orders.launch_id
  ← launch_expenses.launch_id
  ← expenses.launch_id
  ← kpi_monthly_snapshot.launch_id
  ← revenue_forecasts.launch_id
  ← insights.linked_launch_id

products
  ← product_variants.product_id
  → products.bundle_leggings_id  (self-ref: set components)
  → products.bundle_bra_id       (self-ref: set components)

product_variants
  ← order_lines.variant_id
  ← shipments.variant_id
  ← inventory_batches.variant_id
  ← inventory_ledger.variant_id
  ← inventory_forecasts.variant_id
  ← purchase_order_lines.variant_id
  ← insights.linked_variant_id

customers     ← orders.customer_id
orders        ← order_lines.order_id
              ← shipments.order_id
shipments     ← returns.shipment_id
inventory_batches ← inventory_ledger.batch_id

bank_transactions
  → gateway_settlements.linked_settlement_id  (circular — 3-step atomic INSERT)
  → purchase_orders.linked_purchase_order_id
  ← gateway_settlements.bank_transaction_id
  ← expenses.bank_transaction_id

purchase_orders    ← purchase_order_lines.purchase_order_id
expense_categories ← launch_expenses.category_id
                   ← expenses.category_id
ad_campaigns       ← ad_spend_daily.campaign_id
                   ← expenses.campaign_id
                   ← insights.linked_campaign_id
roles    ← users.role_id
users    ← import_runs.triggered_by · expenses.created_by
         ← revenue_forecasts.created_by · cashflow_forecasts.created_by
         ← import_errors.resolved_by · insights.dismissed_by
import_runs ← import_errors.import_run_id
```

---

## Appendix B: Data Population Priority

To unblock all KPI groups in the correct order:

| Priority | Action | Unlocks |
|----------|--------|---------|
| 1 | Seed `inventory_batches` (2,800 units across 7 products) | inventory_ledger, E-group, H-03 |
| 2 | Run post-seed `order_lines` UPDATE (2-pass variant_id resolution) | D-04, B-05 |
| 3 | Enter `launch_expenses` for L1/L2/L3 (3 batches × ~5 line items) | D-05, launches.total_investment_inr |
| 4 | Enter `ad_spend_daily` (May 2026 known; backfill earlier months) | D-02, F-01..F-03 |
| 5 | Enter `expenses` (recurring opex from bank_transactions) | D-02, D-03, G-02, G-04 |
| 6 | Run Phase 2 `compute_kpi_snapshots.py` (backfill to Jan 2023) | All A-group, B-group, G-group daily KPIs |
| 7 | Run Phase 2 inventory + revenue + cash forecast scripts | All E-group, H-group |
| 8 | Run Phase 2 insights engine | All insight alerts |

**Import bank_transactions for 2023–2025** (separate task — unlocks historical G-group cashflow analysis).
