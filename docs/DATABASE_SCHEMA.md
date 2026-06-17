# Kirgo Control Tower — Database Schema
**Database:** PostgreSQL via Supabase  
**Convention:** snake_case · monetary values in INR (no paise) · all timestamps UTC

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-06-17 | Initial schema — 17 tables across 4 domains |
| v2 | 2026-06-17 | +10 tables across 3 new domains; `launch_expenses.category` normalised to FK |

---

## Table Index

| # | Table | Domain | Version |
|---|-------|--------|---------|
| 1 | launches | Product | v1 |
| 2 | products | Product | v1 |
| 3 | product_variants | Product | v1 |
| 4 | inventory_batches | Product | v1 |
| 5 | inventory_ledger | Product | v1 |
| 6 | customers | Orders | v1 |
| 7 | orders | Orders | v1 |
| 8 | order_lines | Orders | v1 |
| 9 | shipments | Orders | v1 |
| 10 | returns | Orders | v1 |
| 11 | bank_transactions | Financial | v1 |
| 12 | gateway_settlements | Financial | v1 |
| 13 | purchase_orders | Financial | v1 |
| 14 | purchase_order_lines | Financial | v1 |
| 15 | launch_expenses | Financial | v1 · modified v2 |
| 16 | ad_campaigns | Marketing | v1 |
| 17 | ad_spend_daily | Marketing | v1 |
| 18 | roles | Access Control | **v2** |
| 19 | users | Access Control | **v2** |
| 20 | expense_categories | Operational Expenses | **v2** |
| 21 | expenses | Operational Expenses | **v2** |
| 22 | kpi_daily_snapshot | Intelligence | **v2** |
| 23 | kpi_monthly_snapshot | Intelligence | **v2** |
| 24 | revenue_forecasts | Intelligence | **v2** |
| 25 | cashflow_forecasts | Intelligence | **v2** |
| 26 | inventory_forecasts | Intelligence | **v2** |
| 27 | insights | Intelligence | **v2** |

---

## Domain 1: Product

### `launches`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| code | text | UNIQUE NOT NULL | `L1` / `L2` / `L3` / `L4` |
| name | text | NOT NULL | `Classic`, `Summer + Classic Restock`, `Core`, `Core Flare` |
| launched_at | date | | Actual go-live date |
| planned_launch_at | date | | Pre-launch placeholder |
| status | text | NOT NULL | `planned` / `active` / `depleted` |
| total_investment_inr | numeric(12,2) | | Derived sum from launch_expenses |
| notes | text | | |
| created_at | timestamptz | DEFAULT now() | |

---

### `products`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| launch_id | int | FK → launches.id | |
| name | text | NOT NULL | e.g. `Core Leggings` |
| product_type | text | NOT NULL | `leggings` / `sports_bra` / `set` |
| is_bundle | boolean | DEFAULT false | True for Set products |
| bundle_leggings_id | int | FK → products.id | Set only: component legging |
| bundle_bra_id | int | FK → products.id | Set only: component bra |
| selling_price_inr | numeric(10,2) | NOT NULL | Current listed price |
| cogs_manufacture_inr | numeric(10,2) | NOT NULL | Per-unit manufacturing cost |
| cogs_shoot_import_inr | numeric(10,2) | NOT NULL | Per-unit shoot + import amortisation |
| cogs_shipping_pkg_inr | numeric(10,2) | NOT NULL | Per-unit packaging + domestic ship |
| cogs_total_inr | numeric(10,2) | GENERATED | Sum of three COGS components |
| gross_margin_inr | numeric(10,2) | GENERATED | selling_price − cogs_total |
| gross_margin_pct | numeric(5,2) | GENERATED | gross_margin / selling_price × 100 |
| is_active | boolean | DEFAULT true | |
| created_at | timestamptz | DEFAULT now() | |

**Seeded values:**

| name | launch | selling_price | cogs_total | gm_pct |
|------|--------|--------------|------------|--------|
| Classic Leggings | L1 | 1,699 | 1,167 | 31.3% |
| Classic Sports Bra | L1 | 1,599 | 1,167 | 27.0% |
| Classic Set | L1 | 3,298 | 2,259 | 31.5% |
| Summer Leggings | L2 | 1,799 | 847 | 52.9% |
| Summer Sports Bra | L2 | 1,499 | 847 | 43.5% |
| Summer Set | L2 | 3,298 | 1,619 | 50.9% |
| Classic Leggings 2 | L2 | 1,699 | 847 | 50.1% |
| Core Leggings | L3 | 1,999 | 1,139 | 43.0% |
| Core Sports Bra | L3 | 1,799 | 1,139 | 36.7% |
| Core Set | L3 | 3,798 | 2,203 | 42.0% |

---

### `product_variants`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| product_id | int | FK → products.id NOT NULL | |
| sku | text | UNIQUE NOT NULL | Canonical SKU — see DATA_DICTIONARY |
| size | text | | `XS` / `S` / `M` / `L` / `XL` |
| colour | text | | e.g. `Black`, `Pink`, `Blue` |
| woocommerce_product_id | int | | WooCommerce variation ID |
| shiprocket_channel_sku | text | | Raw SKU in Shiprocket exports |
| is_active | boolean | DEFAULT true | |
| created_at | timestamptz | DEFAULT now() | |

---

### `inventory_batches`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| launch_id | int | FK → launches.id | |
| variant_id | int | FK → product_variants.id | |
| opening_quantity | int | NOT NULL | Units received from supplier |
| received_at | date | | |
| purchase_order_id | int | FK → purchase_orders.id | |
| notes | text | | |
| created_at | timestamptz | DEFAULT now() | |

**Opening stock from ProductionSKU sheet:**

| Variant | XS | S | M | L | XL | Total |
|---------|----|----|----|----|-----|-------|
| Classic Leggings | — | 150 | 150 | 150 | — | 450 |
| Classic Sports Bra | — | 150 | 150 | 150 | — | 450 |
| Summer Leggings | — | 100 | 100 | 100 | 100 | 400 |
| Summer Sports Bra | — | 100 | 100 | 100 | 100 | 400 |
| Classic Leggings 2 | — | 100 | 100 | — | 100 | 300 |
| Core Leggings | 10 | 60 | 60 | 60 | 10 | 200 |
| Core Sports Bra | 10 | 60 | 60 | 60 | 10 | 200 |

---

### `inventory_ledger`
Append-only stock movement log.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| variant_id | int | FK → product_variants.id NOT NULL | |
| batch_id | int | FK → inventory_batches.id | |
| movement_type | text | NOT NULL | `opening` / `sale` / `return` / `rto` / `adjustment` |
| quantity_delta | int | NOT NULL | Positive = stock in · Negative = stock out |
| reference_type | text | | `shipment` / `return_shipment` / `manual` |
| reference_id | int | | FK into shipments or returns |
| occurred_at | timestamptz | NOT NULL | |
| notes | text | | |

---

## Domain 2: Orders

### `customers`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| email | text | UNIQUE NOT NULL | Primary dedup key |
| phone | text | | Normalised: 10 digits, no +91 |
| first_name | text | | |
| last_name | text | | |
| first_order_at | timestamptz | | Min of orders.ordered_at |
| total_orders | int | | Maintained on each new order |
| total_revenue_inr | numeric(12,2) | | Maintained on each delivered order |
| acquisition_source | text | | UTM source on first order |
| created_at | timestamptz | DEFAULT now() | |

---

### `orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| woocommerce_order_id | int | UNIQUE NOT NULL | |
| woocommerce_order_number | text | | |
| customer_id | int | FK → customers.id | |
| status | text | NOT NULL | `processing` / `completed` / `cancelled` / `refunded` |
| payment_method | text | | `gokwik_prepaid` / `gokwik_cod` / `easebuzz` / `infibeam` / `cod` |
| payment_method_title | text | | Raw WooCommerce value |
| transaction_id | text | | Gateway reference |
| subtotal_inr | numeric(10,2) | | Pre-discount, pre-shipping |
| discount_inr | numeric(10,2) | DEFAULT 0 | |
| shipping_charged_inr | numeric(10,2) | DEFAULT 0 | Shipping collected from customer |
| order_total_inr | numeric(10,2) | NOT NULL | |
| attribution_source | text | | utm_source |
| attribution_medium | text | | utm_medium |
| attribution_campaign | text | | utm_campaign |
| attribution_device | text | | `desktop` / `mobile` / `tablet` |
| billing_city | text | | |
| billing_state | text | | |
| billing_pincode | text | | |
| ordered_at | timestamptz | NOT NULL | |
| paid_at | timestamptz | | |
| created_at | timestamptz | DEFAULT now() | |

**Source:** WooCommerce CSV (917 rows, 93 cols). Up to 4 line items per row — normalised into order_lines.

---

### `order_lines`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| order_id | int | FK → orders.id NOT NULL | |
| variant_id | int | FK → product_variants.id | Resolved via SKU lookup |
| woocommerce_line_item_id | int | | |
| sku_raw | text | | As exported from WooCommerce |
| product_name_raw | text | | |
| quantity | int | NOT NULL | |
| unit_price_inr | numeric(10,2) | | Actual (post-discount) price |
| line_total_inr | numeric(10,2) | | quantity × unit_price |
| line_subtotal_inr | numeric(10,2) | | Pre-discount line value |

---

### `shipments`
One row per Shiprocket order-line. A WooCommerce order maps to ≥1 Shiprocket rows (one per SKU).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| order_id | int | FK → orders.id | Resolved from SR Order ID |
| shiprocket_order_id | bigint | | Not unique for multi-item orders |
| awb_code | text | UNIQUE | Airway bill |
| channel | text | | `WOOCOMMERCE` / `CUSTOM` |
| status | text | NOT NULL | `DELIVERED` / `RTO_DELIVERED` / `IN_TRANSIT` / `CANCELLED` / etc. |
| variant_id | int | FK → product_variants.id | Resolved from Master SKU |
| channel_sku | text | | Raw channel SKU |
| master_sku | text | | Shiprocket normalised SKU |
| product_quantity | int | NOT NULL | |
| payment_method | text | | `prepaid` / `cod` |
| product_price_inr | numeric(10,2) | | Price per unit |
| order_total_inr | numeric(10,2) | | Full order total (shared across multi-item rows) |
| courier_company | text | | `Delhivery` / `Blue Dart` / `Amazon` |
| zone | text | | `z_a` / `z_b` / `z_c` / `z_d` / `z_e` |
| freight_total_inr | numeric(10,2) | | Courier cost to Kirgo |
| cod_charges_inr | numeric(10,2) | DEFAULT 0 | |
| cod_crf_id | text | | Links to bank_transactions narration |
| cod_remittance_date | date | | |
| cod_payable_inr | numeric(10,2) | | |
| remitted_inr | numeric(10,2) | | Actual amount remitted |
| shiprocket_created_at | timestamptz | | |
| channel_created_at | timestamptz | | WooCommerce order creation time |
| picked_up_at | timestamptz | | |
| shipped_at | timestamptz | | |
| delivered_at | timestamptz | | |
| edd | date | | Estimated delivery date |
| rto_initiated_at | timestamptz | | |
| rto_delivered_at | timestamptz | | |
| ndr_attempts | int | DEFAULT 0 | |
| latest_ndr_reason | text | | |
| customer_city | text | | |
| customer_state | text | | |
| customer_pincode | text | | |
| rto_risk | text | | `low` / `medium` / `high` (Shiprocket RAD score) |
| created_at | timestamptz | DEFAULT now() | |

**Source:** Shiprocket yearly CSV exports — SR-2023 (62 rows), SR-2024 (571), SR-2025 (250), SR-2026 (216). 118 columns per export.

---

### `returns`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| shipment_id | int | FK → shipments.id | Original forward shipment |
| shiprocket_order_id | bigint | | |
| awb_code | text | | Reverse AWB |
| status | text | | |
| return_reason | text | | Customer-stated reason (free text) |
| qc_status | text | | Shiprocket QC outcome |
| qc_failure_reason | text | | |
| refund_amount_inr | numeric(10,2) | | |
| refund_status | text | | `pending` / `processed` |
| refund_mode | text | | `original_payment_method` / `bank_transfer` |
| returned_at | timestamptz | | |
| created_at | timestamptz | DEFAULT now() | |

**Source:** Returns 2025-2026 sheet (57 rows), Returns-2023/2024/2025 sheets. 121 columns per export.

---

## Domain 3: Financial

### `bank_transactions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| transaction_date | date | NOT NULL | |
| value_date | date | | |
| narration_raw | text | NOT NULL | Original bank narration string |
| reference_number | text | | Chq/Ref No. |
| withdrawal_inr | numeric(12,2) | | NULL if credit |
| deposit_inr | numeric(12,2) | | NULL if debit |
| closing_balance_inr | numeric(12,2) | | Running balance after transaction |
| transaction_type | text | | Classified via narration parser (BUSINESS_RULES §3) |
| counterparty | text | | Extracted from narration |
| extracted_reference | text | | CRF ID / UTR / YESF code |
| linked_settlement_id | int | FK → gateway_settlements.id | |
| linked_purchase_order_id | int | FK → purchase_orders.id | |
| notes | text | | |
| created_at | timestamptz | DEFAULT now() | |

**Source:** HDFC bank statement 01/01/2026–15/06/2026 (2026 sheet in Excel).

---

### `gateway_settlements`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| gateway | text | NOT NULL | `easebuzz` / `infibeam` / `shiprocket_cod` |
| settlement_reference | text | UNIQUE | UTR / YESF code / CRF ID |
| amount_inr | numeric(12,2) | NOT NULL | |
| settled_at | date | | |
| order_count | int | | Orders included in this batch |
| bank_transaction_id | int | FK → bank_transactions.id | Matched bank entry |
| created_at | timestamptz | DEFAULT now() | |

---

### `purchase_orders`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| launch_id | int | FK → launches.id | |
| supplier_name | text | NOT NULL | |
| invoice_number | text | | e.g. `JSKS-240801` |
| invoice_date | date | | |
| currency | text | DEFAULT 'USD' | `USD` / `INR` |
| subtotal_foreign | numeric(12,2) | | In supplier currency |
| shipping_cost_foreign | numeric(12,2) | | |
| total_foreign | numeric(12,2) | | |
| fx_rate_inr | numeric(8,4) | | INR per 1 foreign unit at payment date |
| total_inr | numeric(12,2) | | Converted total |
| payment_terms | text | | e.g. `35% advance, 65% before shipment` |
| payment_method | text | | `swift` / `paypal` |
| status | text | | `draft` / `partial_paid` / `paid` / `received` |
| created_at | timestamptz | DEFAULT now() | |

**Seeded purchase orders:**

| Invoice | Supplier | Launch | Total | Currency |
|---------|---------|--------|-------|---------|
| JSKS-240801 | Shanghai Jspeed Industry Co. | L2 | 6,120.00 | USD |
| BURN-251006 | Burning Active Apparel Co. | L3 | 4,228.60 | USD |

---

### `purchase_order_lines`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| purchase_order_id | int | FK → purchase_orders.id NOT NULL | |
| variant_id | int | FK → product_variants.id | Resolved post-import |
| supplier_style_no | text | | e.g. `JSKS2403` |
| description | text | | Fabric/style description |
| size | text | | |
| colour_code | text | | Pantone/TCX code, e.g. `18-2326 TCX` |
| quantity | int | NOT NULL | |
| unit_price_foreign | numeric(8,2) | | |
| line_total_foreign | numeric(12,2) | | |
| created_at | timestamptz | DEFAULT now() | |

---

### `launch_expenses`
> **v2 change:** `category` (text) replaced by `category_id` (FK → expense_categories.id)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| launch_id | int | FK → launches.id NOT NULL | |
| expense_name | text | NOT NULL | e.g. `Instalment 1 (Pink + Black)` |
| category_id | int | FK → expense_categories.id NOT NULL | Replaces v1 free-text category |
| amount_inr | numeric(12,2) | NOT NULL | |
| currency_original | text | DEFAULT 'INR' | |
| amount_foreign | numeric(12,2) | | If paid in USD |
| fx_rate_inr | numeric(8,4) | | At time of payment |
| paid_at | date | | |
| status | text | | `paid` / `pending` / `tbd` |
| notes | text | | |
| created_at | timestamptz | DEFAULT now() | |

**Launch totals:** L1 ₹6,43,500 · L2 ₹10,37,760 · L3 ₹5,05,000

---

## Domain 4: Marketing

### `ad_campaigns`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| platform | text | NOT NULL | `google` / `meta` |
| platform_account_id | text | | Google: `736-944-6064`; Meta: `729422043560314` |
| campaign_name | text | | e.g. `Sid - PMAX - 15 May` |
| campaign_type | text | | `pmax` / `search` / `shopping` / `advantage_plus` |
| started_at | date | | |
| ended_at | date | | NULL = active |
| is_active | boolean | DEFAULT true | |
| created_at | timestamptz | DEFAULT now() | |

**Seeded campaigns:** `Sid - PMAX - 15 May` (Google PMAX) · `Kirgo Test 1` (Google) · Meta Kirgo Ad account.

---

### `ad_spend_daily`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| campaign_id | int | FK → ad_campaigns.id NOT NULL | |
| spend_date | date | NOT NULL | |
| impressions | bigint | DEFAULT 0 | |
| clicks | int | DEFAULT 0 | |
| spend_inr | numeric(10,2) | NOT NULL | Net (after overdelivery credit) |
| gst_inr | numeric(10,2) | DEFAULT 0 | 18% IGST (Google only) |
| total_inr | numeric(10,2) | | spend_inr + gst_inr |
| invoice_reference | text | | Google invoice # or Meta receipt ID |
| created_at | timestamptz | DEFAULT now() | |

**Known spend (May 2026):**  
`Sid - PMAX - 15 May`: 18,432 clicks · ₹6,688.87  
`Kirgo Test 1`: 652 clicks · ₹3,897.86  
Meta: ₹10,000 funded (no campaign breakdown available)

---

## Domain 5: Access Control *(new in v2)*

### `roles`

**Business purpose:** Defines the permission sets available in the Control Tower. Controls what each user category can see and do — separating a read-only founder view, an analyst who can run forecasts, and an admin who manages the platform. Prevents accidental modification of historical data by lower-privilege users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| code | text | UNIQUE NOT NULL | Machine-readable slug |
| name | text | NOT NULL | Display name |
| description | text | | What this role can do |
| can_view_financials | boolean | DEFAULT false | Bank statements, cashflow, expenses |
| can_view_customers | boolean | DEFAULT false | Customer PII (email, phone, address) |
| can_edit_forecasts | boolean | DEFAULT false | Create / update forecast records |
| can_manage_expenses | boolean | DEFAULT false | Create / edit expense entries |
| can_dismiss_insights | boolean | DEFAULT false | Dismiss or archive insight cards |
| can_manage_users | boolean | DEFAULT false | Add / deactivate users, assign roles |
| created_at | timestamptz | DEFAULT now() | |

**Seeded roles:**

| code | name | financials | customers | edit_forecasts | manage_expenses | dismiss_insights | manage_users |
|------|------|-----------|-----------|---------------|----------------|-----------------|-------------|
| `admin` | Administrator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `analyst` | Analyst | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `viewer` | Viewer | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

### `users`

**Business purpose:** Extends Supabase `auth.users` with application-level profile data and role assignment. Every action that modifies data (creating a forecast, dismissing an insight, logging an expense) is attributed to a user record. Enables audit trails throughout the platform.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | Internal application ID used for FK references |
| auth_user_id | uuid | UNIQUE NOT NULL | References Supabase `auth.users.id` |
| role_id | int | FK → roles.id NOT NULL | Primary role assignment |
| full_name | text | | |
| email | text | UNIQUE NOT NULL | Mirrored from auth.users for readability |
| avatar_url | text | | |
| is_active | boolean | DEFAULT true | Soft deactivation without deleting auth user |
| last_login_at | timestamptz | | Updated on each successful login |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**Note:** `auth_user_id` is the join key back to Supabase's auth system. `id` (serial) is used for all FK references within the application schema to keep FK columns as integers.

---

## Domain 6: Operational Expenses *(new in v2)*

### `expense_categories`

**Business purpose:** A single controlled vocabulary for categorising both pre-launch capital expenditure (`launch_expenses`) and ongoing operational spending (`expenses`). Replaces the free-text `category` field in `launch_expenses` (v1) with a normalised lookup. Enables consistent P&L grouping across all cost lines — manufacturing vs marketing vs logistics vs SaaS — without relying on string matching.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| code | text | UNIQUE NOT NULL | Machine-readable slug, e.g. `manufacturing` |
| name | text | NOT NULL | Display name, e.g. `Manufacturing` |
| category_group | text | NOT NULL | P&L grouping: `cogs` / `capex` / `opex` / `marketing` / `financing` |
| applies_to | text | NOT NULL | `launch` / `operations` / `both` |
| description | text | | What costs belong here |
| is_active | boolean | DEFAULT true | |
| created_at | timestamptz | DEFAULT now() | |

**Seeded values:**

| code | name | category_group | applies_to |
|------|------|---------------|-----------|
| `manufacturing` | Manufacturing | capex | launch |
| `sample` | Sampling | capex | launch |
| `shoot` | Shoot & Creative | capex | launch |
| `packaging` | Packaging | capex | both |
| `website` | Website & Tech | capex | launch |
| `logistics_inbound` | Inbound Logistics | capex | launch |
| `legal` | Legal & Compliance | capex | launch |
| `founder_credit` | Founder Capital | financing | launch |
| `shipping_outbound` | Outbound Shipping | cogs | operations |
| `shipping_inbound` | Inbound Returns Shipping | cogs | operations |
| `ad_spend` | Advertising | marketing | both |
| `platform_saas` | Platform & SaaS | opex | operations |
| `customer_refund` | Customer Refunds | opex | operations |
| `bank_charges` | Bank & FX Charges | opex | operations |
| `misc` | Miscellaneous | opex | both |

---

### `expenses`

**Business purpose:** Structured ledger of all ongoing operational costs not covered by `launch_expenses` (which handles pre-launch capex). Captures recurring subscriptions (Google Workspace ₹1,227/month), Shiprocket wallet top-ups, one-off service costs, bank charges, and any other outflow from the business. Together with `launch_expenses`, this table provides the full cost picture for P&L and cashflow analysis. Each row is reconcilable back to a `bank_transactions` entry.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| expense_date | date | NOT NULL | Date expense was incurred |
| category_id | int | FK → expense_categories.id NOT NULL | |
| description | text | NOT NULL | Human-readable label, e.g. `Google Workspace - June 2026` |
| amount_inr | numeric(12,2) | NOT NULL | |
| vendor | text | | e.g. `Google`, `Shiprocket`, `Delhivery` |
| payment_method | text | | `upi` / `bank_transfer` / `paypal` / `debit_card` / `swift` |
| bank_transaction_id | int | FK → bank_transactions.id | Linked bank entry for reconciliation |
| launch_id | int | FK → launches.id | If expense is tied to a specific launch |
| campaign_id | int | FK → ad_campaigns.id | If expense is an ad spend line |
| is_recurring | boolean | DEFAULT false | True for monthly subscriptions, etc. |
| recurrence_period | text | | `weekly` / `monthly` / `annual` |
| notes | text | | |
| created_by | int | FK → users.id | |
| created_at | timestamptz | DEFAULT now() | |

**Relationship to other tables:**  
- `bank_transaction_id` enables one-to-one reconciliation with raw bank data.  
- `campaign_id` provides a link to ad campaigns; for ad spend the authoritative detail is in `ad_spend_daily`, making `expenses` the aggregate monthly line.  
- `launch_id` is set only when a recurring operational cost (e.g. Shiprocket recharges during a launch window) is explicitly attributed to a launch for payback period analysis.

---

## Domain 7: Intelligence *(new in v2)*

### `kpi_daily_snapshot`

**Business purpose:** Pre-computed daily aggregate of the most time-sensitive KPIs. Powers the top-line dashboard without running expensive joins over raw tables on every page load. One row per calendar day. Recomputed nightly (or on-demand after data imports). When actuals are not yet available (future dates), the row is absent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| snapshot_date | date | UNIQUE NOT NULL | One row per calendar day |
| gross_revenue_inr | numeric(12,2) | DEFAULT 0 | Revenue from orders with delivered_at = snapshot_date |
| net_revenue_inr | numeric(12,2) | DEFAULT 0 | Gross minus refunds and discounts settled that day |
| orders_placed | int | DEFAULT 0 | WooCommerce orders created on this date |
| orders_delivered | int | DEFAULT 0 | Shipments with delivered_at on this date |
| units_sold | int | DEFAULT 0 | Sum of order_lines.quantity for delivered orders |
| avg_order_value_inr | numeric(10,2) | | gross_revenue / orders_delivered |
| new_customers | int | DEFAULT 0 | Customers whose first_order_at = this date |
| returns_count | int | DEFAULT 0 | |
| returns_value_inr | numeric(12,2) | DEFAULT 0 | Sum of refund_amount_inr settled this day |
| rto_count | int | DEFAULT 0 | Shipments with rto_delivered_at = this date |
| rto_cost_inr | numeric(12,2) | DEFAULT 0 | Estimated two-way freight on RTOs |
| cod_orders | int | DEFAULT 0 | Delivered orders where payment_method = cod |
| prepaid_orders | int | DEFAULT 0 | Delivered orders where payment_method = prepaid |
| cash_deposited_inr | numeric(12,2) | DEFAULT 0 | Sum of bank_transactions.deposit_inr on this date |
| cash_withdrawn_inr | numeric(12,2) | DEFAULT 0 | Sum of bank_transactions.withdrawal_inr on this date |
| closing_bank_balance_inr | numeric(12,2) | | Last bank_transactions.closing_balance_inr of the day |
| ad_spend_inr | numeric(10,2) | DEFAULT 0 | Sum of ad_spend_daily.spend_inr on this date |
| computed_at | timestamptz | NOT NULL | When this snapshot was last recomputed |
| created_at | timestamptz | DEFAULT now() | |

---

### `kpi_monthly_snapshot`

**Business purpose:** Monthly P&L-grade KPI roll-up. Goes beyond the daily snapshot to include margin calculations, launch-level revenue splits, COD mix, ROAS, and contribution margin — metrics that are only meaningful at a monthly granularity. One row per month per launch (plus one aggregate row per month where launch_id IS NULL). Used by the BI module to render monthly trend charts and the P&L summary card.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| snapshot_month | date | NOT NULL | First day of month, e.g. `2026-01-01` |
| launch_id | int | FK → launches.id | NULL = all-launches aggregate for this month |
| gross_revenue_inr | numeric(12,2) | DEFAULT 0 | |
| net_revenue_inr | numeric(12,2) | DEFAULT 0 | After returns and discounts |
| orders_delivered | int | DEFAULT 0 | |
| units_sold | int | DEFAULT 0 | |
| avg_order_value_inr | numeric(10,2) | | |
| new_customers | int | DEFAULT 0 | |
| returning_customers | int | DEFAULT 0 | |
| gross_margin_inr | numeric(12,2) | DEFAULT 0 | Revenue − COGS (unit-level) |
| gross_margin_pct | numeric(5,2) | | |
| total_shipping_cost_inr | numeric(12,2) | DEFAULT 0 | Sum of shipments.freight_total_inr |
| total_cod_charges_inr | numeric(12,2) | DEFAULT 0 | |
| total_ad_spend_inr | numeric(12,2) | DEFAULT 0 | |
| total_opex_inr | numeric(12,2) | DEFAULT 0 | Sum of expenses.amount_inr for the month |
| contribution_margin_inr | numeric(12,2) | | gross_margin − shipping − cod − ad spend |
| contribution_margin_pct | numeric(5,2) | | |
| rto_count | int | DEFAULT 0 | |
| rto_rate_pct | numeric(5,2) | | |
| return_rate_pct | numeric(5,2) | | |
| cod_mix_pct | numeric(5,2) | | COD orders / total orders |
| roas | numeric(6,2) | | net_revenue / total_ad_spend |
| cash_collected_inr | numeric(12,2) | DEFAULT 0 | Actual bank deposits from gateway + COD |
| computed_at | timestamptz | NOT NULL | |
| created_at | timestamptz | DEFAULT now() | |

**UNIQUE constraint:** (snapshot_month, launch_id) — with the implementation note that NULL launch_id (aggregate row) requires a partial unique index since SQL NULLs are not equal to each other.

---

### `revenue_forecasts`

**Business purpose:** Stores the output of the Launch-Adjusted Weighted Moving Average (LA-WMA) model described in `FORECASTING_MODEL.md`. One forecast record per month per launch, generated on a snapshot date. When a new forecast is generated, prior forecasts for the same month/launch are marked `is_current = false`, preserving the full forecast history for accuracy tracking. The `actual_revenue_inr` column is back-filled from `kpi_monthly_snapshot` once the month closes, enabling forecast vs actual comparison.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| forecast_month | date | NOT NULL | First day of the month being forecast |
| launch_id | int | FK → launches.id | Collection being forecast · NULL = total business |
| snapshot_date | date | NOT NULL | Date this forecast was generated |
| model_version | text | NOT NULL | e.g. `la-wma-v1` |
| forecast_revenue_inr | numeric(12,2) | NOT NULL | Point estimate |
| confidence_low_inr | numeric(12,2) | | 80% CI lower bound |
| confidence_high_inr | numeric(12,2) | | 80% CI upper bound |
| forecast_orders | int | | Estimated order count |
| forecast_aov_inr | numeric(10,2) | | Estimated AOV |
| launch_phase_month | int | | Months since this launch went live |
| launch_phase_factor | numeric(4,3) | | Decay factor applied, e.g. 0.75 |
| stock_availability_factor | numeric(4,3) | | Stock gate factor, 0.0–1.0 |
| planned_ad_spend_inr | numeric(12,2) | DEFAULT 0 | Operator-provided ad budget input |
| actual_revenue_inr | numeric(12,2) | | Back-filled after month closes |
| forecast_accuracy_pct | numeric(6,2) | | 1 − |actual − forecast| / actual × 100 |
| input_params | jsonb | | Full input parameter snapshot |
| is_current | boolean | DEFAULT true | False once superseded by a newer forecast |
| created_by | int | FK → users.id | |
| created_at | timestamptz | DEFAULT now() | |

---

### `cashflow_forecasts`

**Business purpose:** Monthly cash position projection. Models the timing gap between revenue recognition (delivery date) and actual cash receipt (settlement lag), and the timing of large outflows (supplier payments, ad budgets). Answers the critical question: *will the bank account have enough cash to fund the next supplier instalment?* Uses the settlement lag model and RTO/COD assumptions from `FORECASTING_MODEL.md §4`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| forecast_month | date | NOT NULL | Month being projected |
| snapshot_date | date | NOT NULL | Date forecast was generated |
| model_version | text | NOT NULL | |
| opening_balance_inr | numeric(12,2) | NOT NULL | Actual or estimated opening bank balance |
| expected_prepaid_inflow_inr | numeric(12,2) | DEFAULT 0 | Prepaid order settlements (T+3 lag applied) |
| expected_cod_inflow_inr | numeric(12,2) | DEFAULT 0 | COD remittances expected (T+10 lag applied) |
| expected_total_inflow_inr | numeric(12,2) | DEFAULT 0 | Sum of inflows |
| expected_shipping_cost_inr | numeric(12,2) | DEFAULT 0 | Outbound courier costs |
| expected_ad_spend_inr | numeric(12,2) | DEFAULT 0 | Budget input from operator |
| expected_supplier_payment_inr | numeric(12,2) | DEFAULT 0 | Scheduled purchase order instalments |
| expected_saas_cost_inr | numeric(12,2) | DEFAULT 0 | Recurring subscriptions |
| expected_rto_cost_inr | numeric(12,2) | DEFAULT 0 | Two-way freight on estimated RTOs |
| expected_refund_cost_inr | numeric(12,2) | DEFAULT 0 | Customer refund outflows |
| expected_other_opex_inr | numeric(12,2) | DEFAULT 0 | Remaining operational outflows |
| expected_total_outflow_inr | numeric(12,2) | DEFAULT 0 | Sum of all outflows |
| expected_net_cashflow_inr | numeric(12,2) | | expected_total_inflow − expected_total_outflow |
| expected_closing_balance_inr | numeric(12,2) | | opening_balance + expected_net_cashflow |
| actual_net_cashflow_inr | numeric(12,2) | | Back-filled from bank_transactions |
| actual_closing_balance_inr | numeric(12,2) | | Back-filled after month closes |
| cod_mix_assumption_pct | numeric(5,2) | | Assumed COD % for lag calculation |
| rto_rate_assumption_pct | numeric(5,2) | | Assumed RTO rate |
| prepaid_settlement_lag_days | int | DEFAULT 3 | |
| cod_settlement_lag_days | int | DEFAULT 10 | |
| input_params | jsonb | | Full parameter snapshot |
| is_current | boolean | DEFAULT true | |
| created_by | int | FK → users.id | |
| created_at | timestamptz | DEFAULT now() | |

---

### `inventory_forecasts`

**Business purpose:** Per-variant stock depletion projections. Computes sell-through velocity at two windows (7-day and 30-day rolling) and translates current stock into a projected stockout date. The `alert_level` column drives the inventory alert cards on the dashboard — red for critical, yellow for warning. `reorder_recommended` triggers a prompt to begin the next purchase order. One row per variant per snapshot; historical snapshots are retained with `is_current = false` to track velocity trends over time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| variant_id | int | FK → product_variants.id NOT NULL | |
| snapshot_date | date | NOT NULL | Date of this projection |
| current_stock | int | NOT NULL | Stock on hand at snapshot time |
| daily_velocity_30d | numeric(6,3) | | Units sold per day, 30-day rolling average |
| daily_velocity_7d | numeric(6,3) | | Units sold per day, 7-day rolling average |
| days_to_stockout_30d | int | | current_stock / daily_velocity_30d |
| days_to_stockout_7d | int | | current_stock / daily_velocity_7d · more reactive |
| projected_stockout_date | date | | snapshot_date + days_to_stockout_30d |
| alert_level | text | NOT NULL | `ok` / `watch` / `warning` / `critical` |
| reorder_recommended | boolean | DEFAULT false | True when days_to_stockout_30d < 30 |
| units_to_reorder | int | | Estimated reorder quantity based on 90-day demand |
| is_current | boolean | DEFAULT true | Latest snapshot per variant |
| created_at | timestamptz | DEFAULT now() | |

**Alert level thresholds (from FORECASTING_MODEL.md §3.3):**

| days_to_stockout | alert_level |
|-----------------|-------------|
| > 60 | `ok` |
| 30–60 | `watch` |
| 14–30 | `warning` |
| < 14 | `critical` |

---

### `insights`

**Business purpose:** Stores AI-generated and rule-based observations about business performance. The AI Analysis layer (detailed in `AI_ANALYST_SPEC.md`) reads from all other tables and writes structured, actionable observations here. Each insight has a severity level (`opportunity`, `info`, `warning`, `alert`) so the dashboard can surface the most urgent items first. Users with appropriate permissions can dismiss insights once addressed. The `raw_context` jsonb column preserves the data snapshot used to generate each insight, enabling audit and retraining.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | serial | PK | |
| insight_date | date | NOT NULL | Date the insight is relevant to |
| source | text | NOT NULL | `ai` / `rule` — AI-generated vs deterministic alert |
| category | text | NOT NULL | `revenue` / `inventory` / `cashflow` / `marketing` / `operations` / `forecast` |
| severity | text | NOT NULL | `opportunity` / `info` / `warning` / `alert` |
| title | text | NOT NULL | Short headline, max 80 characters |
| body | text | NOT NULL | Full narrative explanation |
| metric_name | text | | KPI this relates to, e.g. `rto_rate` |
| metric_value | numeric(12,2) | | Current value of the metric |
| metric_benchmark | numeric(12,2) | | Historical average or target |
| metric_delta_pct | numeric(7,2) | | % deviation from benchmark |
| linked_launch_id | int | FK → launches.id | If insight is collection-specific |
| linked_variant_id | int | FK → product_variants.id | If insight is SKU-specific |
| linked_campaign_id | int | FK → ad_campaigns.id | If insight is marketing-specific |
| is_dismissed | boolean | DEFAULT false | |
| dismissed_by | int | FK → users.id | |
| dismissed_at | timestamptz | | |
| model_version | text | | AI model version or rule set version |
| raw_context | jsonb | | Data context used to generate (audit trail) |
| created_at | timestamptz | DEFAULT now() | |

---

## Key Indexes (Advisory)

| Table | Columns | Reason |
|-------|---------|--------|
| orders | woocommerce_order_id | Dedup on import |
| orders | ordered_at | Time-range queries |
| order_lines | order_id, variant_id | Join performance |
| shipments | shiprocket_order_id | Multi-item grouping |
| shipments | awb_code | Dedup |
| shipments | delivered_at | Revenue timing |
| inventory_ledger | variant_id, occurred_at | Running stock balance |
| bank_transactions | transaction_date | Cashflow range |
| bank_transactions | reference_number | Settlement matching |
| ad_spend_daily | campaign_id, spend_date | ROAS calculation |
| kpi_daily_snapshot | snapshot_date | Unique, dashboard lookup |
| kpi_monthly_snapshot | snapshot_month, launch_id | Unique per month/launch |
| revenue_forecasts | forecast_month, launch_id, is_current | Active forecast lookup |
| cashflow_forecasts | forecast_month, is_current | Active forecast lookup |
| inventory_forecasts | variant_id, is_current | Per-variant latest projection |
| insights | insight_date, severity | Dashboard priority sort |
| insights | is_dismissed, category | Active insight filter |
| expenses | expense_date, category_id | P&L period queries |

---

## Row-Level Security (Supabase)

| Table(s) | Readable by | Writable by |
|----------|-------------|-------------|
| All tables | `analyst`, `admin` | — |
| `bank_transactions`, `customers` | `admin` only | `admin` only |
| `kpi_daily_snapshot`, `kpi_monthly_snapshot` | `viewer`, `analyst`, `admin` | System (computed) |
| `revenue_forecasts`, `cashflow_forecasts`, `inventory_forecasts` | `analyst`, `admin` | `analyst`, `admin` |
| `insights` | `viewer`, `analyst`, `admin` | System · dismiss by `analyst`, `admin` |
| `expenses`, `launch_expenses` | `analyst`, `admin` | `analyst`, `admin` |
| `users`, `roles` | `admin` only | `admin` only |
| No table | public | — |

---

## Foreign Key Dependency Map (v2)

```
auth.users (Supabase)
    └── users.auth_user_id

roles ──────────────────────── users.role_id

launches
    ├── products.launch_id
    ├── inventory_batches.launch_id
    ├── purchase_orders.launch_id
    ├── launch_expenses.launch_id
    ├── expenses.launch_id
    ├── kpi_monthly_snapshot.launch_id
    ├── revenue_forecasts.launch_id
    └── insights.linked_launch_id

products
    ├── products.bundle_leggings_id (self)
    ├── products.bundle_bra_id (self)
    └── product_variants.product_id

product_variants
    ├── inventory_batches.variant_id
    ├── inventory_ledger.variant_id
    ├── order_lines.variant_id
    ├── shipments.variant_id
    ├── purchase_order_lines.variant_id
    ├── inventory_forecasts.variant_id
    └── insights.linked_variant_id

purchase_orders
    ├── purchase_order_lines.purchase_order_id
    ├── inventory_batches.purchase_order_id
    └── bank_transactions.linked_purchase_order_id

expense_categories
    ├── launch_expenses.category_id
    └── expenses.category_id

bank_transactions
    ├── bank_transactions.linked_settlement_id → gateway_settlements
    └── expenses.bank_transaction_id

gateway_settlements
    └── bank_transactions.linked_settlement_id

ad_campaigns
    ├── ad_spend_daily.campaign_id
    ├── expenses.campaign_id
    └── insights.linked_campaign_id

customers
    └── orders.customer_id

orders
    └── order_lines.order_id

shipments
    ├── returns.shipment_id
    └── inventory_ledger.reference_id (via reference_type)

users
    ├── expenses.created_by
    ├── revenue_forecasts.created_by
    ├── cashflow_forecasts.created_by
    └── insights.dismissed_by
```
