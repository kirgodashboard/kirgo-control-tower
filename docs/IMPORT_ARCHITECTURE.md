# Kirgo Control Tower — Import Architecture
**Version:** v1.0 | **Date:** 2026-06-17  
**Schema Reference:** DATABASE_SCHEMA.md v2 | **Data Reference:** DATA_DICTIONARY.md v2.1 | **Rules Reference:** BUSINESS_RULES.md v2.0  
**Currency:** INR throughout unless stated

---

## Overview

Six data sources feed the Control Tower database. Each source has a distinct file format, import frequency, transformation requirements, and reconciliation check. This document defines the complete field-level mapping, transformation logic, validation rules, duplicate handling, and error handling for each source.

**Import principle:** Never modify source files. All transformation happens in the import pipeline. Source files are archived after each import.

---

## Source Index

| # | Source | Format | Frequency | Destination Tables | Approx. Rows |
|---|--------|--------|-----------|-------------------|-------------|
| 1 | WooCommerce | CSV (Kirgo Numbers.xlsx → Woocom - Orders) | On demand | customers, orders, order_lines | 917 orders |
| 2 | Shiprocket | CSV (SR-2023/2024/2025/2026 sheets) | On demand | shipments | ~1,099 rows |
| 3 | Returns | CSV (Returns-2023/2024/2025, Returns 2025-2026 sheets) | On demand | returns | ~135 rows |
| 4 | Purchase Invoices | PDF / XLS | Per launch | purchase_orders, purchase_order_lines | ~10 POs |
| 5 | Bank Statements | CSV (2026 sheet in Kirgo Numbers.xlsx) | Monthly | bank_transactions, gateway_settlements | ~200 rows/month |
| 6 | Marketing Spend | PDF / CSV (Google Ads, Meta Ads) | Monthly | ad_campaigns, ad_spend_daily | ~30 rows/month |

---

## Source 1: WooCommerce

**Sheet:** `Woocom - Orders` (Kirgo Numbers.xlsx)  
**Row count:** 917 orders (Oct 2023 – Jun 2026)  
**Column count:** 93 columns (up to 4 line items per order, stored as column groups)  
**System of record:** WooCommerce is authoritative for all financial amounts. Per BR-012.

### 1.1 Source-to-Destination Field Map

#### → `customers` table

| Source Column | Destination Column | Transformation |
|--------------|-------------------|----------------|
| Billing Email | email | `LOWER(TRIM(value))` |
| Billing Phone | phone | Strip `+91`, leading `0`; keep 10 digits; validate `^[6-9][0-9]{9}$` |
| Billing First Name | first_name | `TRIM(value)` |
| Billing Last Name | last_name | `TRIM(value)` |
| Date Created | first_order_at | Set only if this is the customer's earliest order (resolved post-dedup) |
| Order Attribution Source | acquisition_source | From the customer's first order only |
| *(derived)* | total_orders | `COUNT(DISTINCT woocommerce_order_id)` per email — update on each import |
| *(derived)* | total_revenue_inr | `SUM(order_lines.line_total_inr)` for delivered orders only — update on each import |

#### → `orders` table

| Source Column | Destination Column | Transformation |
|--------------|-------------------|----------------|
| Order ID | woocommerce_order_id | Integer; UNIQUE dedup key |
| Order Number | woocommerce_order_number | Raw string (e.g. `#2051`) |
| *(derived from email)* | customer_id | FK → customers.id; resolve via `customers.email = LOWER(TRIM(Billing Email))` |
| Status | status | Normalise to lowercase: `Processing` → `processing`, etc. |
| Payment Method | payment_method | See §Payment Method Normalisation below |
| Payment Method Title | payment_method_title | Raw string; preserve as-is |
| Transaction ID | transaction_id | Raw string; NULL if blank |
| Cart Subtotal | subtotal_inr | `ROUND(CAST(value AS numeric), 2)`; NULL if blank |
| Cart Discount Amount | discount_inr | `ROUND(CAST(value AS numeric), 2)`; DEFAULT 0 if blank |
| Order Shipping | shipping_charged_inr | `ROUND(CAST(value AS numeric), 2)`; DEFAULT 0 if blank |
| Order Total | order_total_inr | NOT NULL; `ROUND(CAST(value AS numeric), 2)` |
| utm_source | attribution_source | NULL if blank; lowercase |
| utm_medium | attribution_medium | NULL if blank; lowercase |
| utm_campaign | attribution_campaign | NULL if blank |
| Device | attribution_device | Normalise: `mobile` / `desktop` / `tablet`; NULL if blank |
| Billing City | billing_city | `TRIM(value)` |
| Billing State | billing_state | `TRIM(value)` |
| Billing Postcode | billing_pincode | Validate `^[1-9][0-9]{5}$` |
| Date Created | ordered_at | Parse to timestamptz (UTC); WC exports in IST — subtract 05:30 |
| Date Paid | paid_at | Parse to timestamptz (UTC); NULL if blank |

#### → `order_lines` table

WooCommerce exports up to 4 line items as column groups (`Item 1 Name`, `Item 1 SKU`, `Item 1 Quantity`, `Item 1 Price`, etc.). These must be **unpivoted** into one row per non-empty line item.

| Source Column (per item N) | Destination Column | Transformation |
|---------------------------|-------------------|----------------|
| Item N Name | product_name_raw | `TRIM(value)` |
| Item N SKU | sku_raw | `TRIM(value)` |
| Item N Quantity | quantity | `CAST(value AS int)`; skip if 0 or blank |
| Item N Price | unit_price_inr | `ROUND(CAST(value AS numeric), 2)` |
| *(derived)* | line_total_inr | `quantity × unit_price_inr` |
| Item N Total | line_subtotal_inr | `ROUND(CAST(value AS numeric), 2)` |
| *(SKU lookup)* | variant_id | Resolve via `product_variants.sku = sku_raw`; log as UNRESOLVED if no match |

### 1.2 Payment Method Normalisation

| Raw WooCommerce Value | Normalised `payment_method` |
|-----------------------|----------------------------|
| `Gokwik (prepaid)`, `gokwik_prepaid`, `gokwik-prepaid` | `gokwik_prepaid` |
| `Gokwik (COD)`, `gokwik_cod`, `gokwik-cod` | `gokwik_cod` |
| `EaseBuzz`, `easebuzz` | `easebuzz` |
| `Infibeam`, `infibeam`, `CCAvenue` | `infibeam` |
| `Cash on delivery`, `cod`, `COD` | `cod` |

### 1.3 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-WC-01 | `woocommerce_order_id` NOT NULL and > 0 | Reject row; log to error table |
| V-WC-02 | `order_total_inr` NOT NULL and ≥ 0 | Reject row |
| V-WC-03 | `ordered_at` is a valid datetime ≤ now() | Reject row |
| V-WC-04 | `status` IN allowed values | Normalise or log as UNRECOGNISED |
| V-WC-05 | `Billing Email` is non-empty and matches `^\S+@\S+\.\S+$` | Log as PII_ERROR; import order without customer_id |
| V-WC-06 | `order_total_inr` ≈ `SUM(line_total_inr) + shipping_charged_inr − discount_inr` (±₹1 tolerance) | Log as RECONCILE_WARN; do not reject |
| V-WC-07 | At least one non-blank line item per order | Reject order from order_lines; log as EMPTY_ORDER |
| V-WC-08 | `billing_pincode` matches `^[1-9][0-9]{5}$` if present | Nullify field; log as DQ_WARN |
| V-WC-09 | `phone` after normalisation matches `^[6-9][0-9]{9}$` if present | Nullify field; log as DQ_WARN |

### 1.4 Duplicate Handling

| Entity | Dedup Key | Action on Duplicate |
|--------|-----------|-------------------|
| orders | `woocommerce_order_id` | SKIP; log as DUPLICATE — do not update existing row |
| customers | `LOWER(TRIM(email))` | UPDATE `total_orders`, `total_revenue_inr`, `first_order_at` if earlier; do not overwrite PII |
| order_lines | `(order_id, sku_raw, quantity)` | SKIP exact duplicates; allow two lines with same SKU if quantities differ |

### 1.5 Error Handling

| Error Type | Example | Resolution |
|------------|---------|-----------|
| REJECT | `order_total_inr` is NULL | Row excluded; written to `import_errors` with source row snapshot |
| DQ_WARN | Invalid pincode format | Field nullified; import continues; review report generated |
| UNRESOLVED_SKU | `sku_raw = 'OLD-SKU-2023'` has no matching `product_variants.sku` | `variant_id` set NULL; row imported; must be resolved before KPI compute |
| PII_ERROR | Missing or invalid email | Order imported without customer_id; customer record not created |
| RECONCILE_WARN | Line totals don't sum to order total | Imported; flagged for manual review |

---

## Source 2: Shiprocket

**Sheets:** SR-2023 (62 rows), SR-2024 (571 rows), SR-2025 (250 rows), SR-2026 (216 rows)  
**Total rows:** ~1,099  
**Column count:** 118 columns  
**Key constraint:** One WooCommerce order can produce multiple Shiprocket rows (one per SKU). `shiprocket_order_id` is NOT UNIQUE. Per BR-011.

### 2.1 Source-to-Destination Field Map

#### → `shipments` table

| Source Column | Destination Column | Transformation |
|--------------|-------------------|----------------|
| Order ID | shiprocket_order_id | `CAST(value AS bigint)` |
| AWB Code | awb_code | `TRIM(value)`; NULL if blank |
| Channel | channel | Normalise: `WooCommerce` → `WOOCOMMERCE`; `Custom` → `CUSTOM` |
| Current Status | status | `UPPER(TRIM(value))`; see §Shiprocket Status Normalisation |
| Channel Order ID | *(used to resolve order_id)* | Join to `orders.woocommerce_order_id` |
| *(derived)* | order_id | FK → orders.id via `woocommerce_order_id = CAST(Channel Order ID AS int)` |
| Channel Product ID / SKU | channel_sku | `TRIM(value)` |
| SKU | master_sku | `TRIM(value)` |
| *(derived from master_sku)* | variant_id | Resolve via `product_variants.shiprocket_channel_sku = master_sku` |
| Units | product_quantity | `CAST(value AS int)` |
| Payment | payment_method | Normalise: `COD` → `cod`, `Prepaid` → `prepaid` |
| Product Price | product_price_inr | `ROUND(CAST(value AS numeric), 2)` |
| Order Total | order_total_inr | `ROUND(CAST(value AS numeric), 2)` — shared across multi-item rows; do NOT sum |
| Company | courier_company | `TRIM(value)` |
| Zone | zone | Normalise: `Zone A` → `z_a`, `Zone B` → `z_b`, etc. |
| Freight Total | freight_total_inr | `ROUND(CAST(value AS numeric), 2)` |
| COD Charges | cod_charges_inr | `ROUND(CAST(value AS numeric), 2)`; DEFAULT 0 for prepaid |
| CRF ID | cod_crf_id | `TRIM(CAST(value AS text))`; NULL for prepaid |
| COD Remittance Date | cod_remittance_date | Parse to date; NULL for prepaid |
| COD Payble Amount *(sic)* | cod_payable_inr | `ROUND(CAST(value AS numeric), 2)`; NULL for prepaid |
| Remitted Amount | remitted_inr | `ROUND(CAST(value AS numeric), 2)`; NULL for prepaid |
| Created at (Shiprocket) | shiprocket_created_at | Parse to timestamptz (UTC) |
| Created at (Channel) | channel_created_at | Parse to timestamptz (UTC) |
| Pickup Date | picked_up_at | Parse to timestamptz (UTC); NULL if blank |
| Shipped Date | shipped_at | Parse to timestamptz (UTC); NULL if blank |
| Delivered Date | delivered_at | Parse to timestamptz (UTC); NULL if blank |
| Expected Delivery Date | edd | Parse to date; NULL if blank |
| RTO Initiated | rto_initiated_at | Parse to timestamptz (UTC); NULL if blank |
| RTO Delivered Date | rto_delivered_at | Parse to timestamptz (UTC); NULL if blank |
| NDR Attempts | ndr_attempts | `CAST(value AS int)`; DEFAULT 0 |
| Latest NDR Reason | latest_ndr_reason | `TRIM(value)`; NULL if blank |
| City | customer_city | `TRIM(value)` |
| State | customer_state | `TRIM(value)` |
| Pincode | customer_pincode | `TRIM(value)` |
| RAD Recommendation | rto_risk | Normalise: `Good` → `low`, `At Risk` → `high`, `Moderate` → `medium` |

### 2.2 Shiprocket Status Normalisation

| Raw Shiprocket Status | Normalised `status` |
|----------------------|-------------------|
| `Delivered` | `DELIVERED` |
| `RTO Delivered` | `RTO_DELIVERED` |
| `In Transit` | `IN_TRANSIT` |
| `Out for Delivery` | `OUT_FOR_DELIVERY` |
| `Cancelled` | `CANCELLED` |
| `Pickup Scheduled` | `PICKUP_SCHEDULED` |
| `Picked Up` | `PICKED_UP` |
| `NDR` | `NDR` |

### 2.3 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-SR-01 | `shiprocket_order_id` NOT NULL | Reject row |
| V-SR-02 | `awb_code` is UNIQUE when not NULL | Log as DUPLICATE_AWB; reject second row |
| V-SR-03 | `delivered_at >= shipped_at` when both present | Log as DATE_SEQ_ERROR; import with flag |
| V-SR-04 | `rto_delivered_at >= rto_initiated_at` when both present | Log as DATE_SEQ_ERROR; import with flag |
| V-SR-05 | `payment_method IN ('prepaid', 'cod')` after normalisation | Log as UNRECOGNISED_PAYMENT; import with NULL |
| V-SR-06 | `cod_crf_id` is NULL when `payment_method = 'prepaid'` | Nullify if present; log DQ_WARN |
| V-SR-07 | `freight_total_inr >= 0` | Set 0 if negative; log DQ_WARN |
| V-SR-08 | `product_quantity > 0` | Reject row |
| V-SR-09 | `channel_created_at` falls within known date ranges (Oct 2023 – present) | Log DATE_RANGE_WARN; do not reject |

### 2.4 Order Resolution (SR → WC join)

The join from Shiprocket to WooCommerce uses `shiprocket_order_id` = `woocommerce_order_id`:

```
shipments.order_id = orders.id
WHERE orders.woocommerce_order_id = shipments.shiprocket_order_id
```

If no matching WooCommerce order exists:
- For `channel = 'CUSTOM'`: create a stub `orders` row with `status = 'processing'` and `source = 'shiprocket_custom'`
- For `channel = 'WOOCOMMERCE'`: log as ORPHAN_SHIPMENT; do not import row until WC orders are imported

### 2.5 Duplicate Handling

| Entity | Dedup Key | Action on Duplicate |
|--------|-----------|-------------------|
| shipments | `awb_code` (when NOT NULL) | SKIP; log as DUPLICATE_AWB |
| shipments | `(shiprocket_order_id, channel_sku)` when `awb_code IS NULL` | SKIP if exact match; log |

### 2.6 Error Handling

| Error Type | Example | Resolution |
|------------|---------|-----------|
| ORPHAN_SHIPMENT | SR row references WC order not in DB | Hold in staging; re-run after WC import |
| UNRESOLVED_SKU | `master_sku = 'OLD-SKU'` has no variant match | `variant_id` NULL; flag for manual SKU mapping |
| DATE_SEQ_ERROR | `delivered_at < shipped_at` | Import with flag; date fields preserved; do not use for revenue recognition |
| DUPLICATE_AWB | Same AWB appears in two year sheets | Keep the row with more populated date fields; log both |

---

## Source 3: Returns

**Sheets:** Returns-2023, Returns-2024, Returns-2025, Returns 2025-2026 (57 rows, 121 columns)  
**Total rows:** ~135  
**Distinction:** Customer-initiated returns (has `return_reason`) vs RTOs (NULL `return_reason`). Per BR-013, BR-014.

### 3.1 Source-to-Destination Field Map

#### → `returns` table

| Source Column | Destination Column | Transformation |
|--------------|-------------------|----------------|
| Order ID | shiprocket_order_id | `CAST(value AS bigint)` |
| AWB Code | awb_code | `TRIM(value)` (reverse AWB; may differ from forward AWB) |
| *(derived)* | shipment_id | Resolve via `shipments.shiprocket_order_id = returns.shiprocket_order_id`; log ORPHAN if no match |
| Status | status | `UPPER(TRIM(value))` |
| Reason for Return | return_reason | `TRIM(value)`; NULL if blank or `'NA'` |
| QC Status | qc_status | Normalise: `Pass` → `pass`, `Fail` → `fail`; NULL if blank |
| QC Failure Reason | qc_failure_reason | `TRIM(value)`; NULL if blank |
| Refund Amount | refund_amount_inr | `ROUND(CAST(value AS numeric), 2)`; DEFAULT 0 for RTOs |
| Refund Status | refund_status | Normalise: `Processed` → `processed`, `Pending` → `pending`; NULL if blank |
| Refund Mode | refund_mode | Normalise to `original_payment_method` or `bank_transfer`; NULL if blank |
| Return Date | returned_at | Parse to timestamptz (UTC); NULL if blank |

### 3.2 Customer Return vs RTO Classification

| `return_reason` | `status` | Classification | Revenue Impact |
|----------------|----------|---------------|---------------|
| NOT NULL | Any | Customer-initiated return | Revenue reversal if refund_status = 'processed' (BR-016) |
| NULL | `RTO_DELIVERED` | Logistics RTO | No revenue recognised for this order (BR-013) |
| NULL | Other | Ambiguous — treat as RTO | No revenue (conservative; log as AMBIGUOUS_RETURN) |

### 3.3 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-RET-01 | `shiprocket_order_id` NOT NULL | Reject row |
| V-RET-02 | `refund_amount_inr >= 0` | Set 0; log DQ_WARN |
| V-RET-03 | `returned_at >= shipments.shipped_at` for matched shipment | Log DATE_SEQ_ERROR; import with flag |
| V-RET-04 | `qc_failure_reason IS NULL` when `qc_status = 'pass'` | Nullify; log DQ_WARN |
| V-RET-05 | `refund_status NOT NULL` when `refund_amount_inr > 0` | Set to `pending`; log DQ_WARN |

### 3.4 Inventory Ledger Trigger (Post-Import)

After returns are imported, create `inventory_ledger` entries:

| Condition | Movement Type | `quantity_delta` | Notes |
|-----------|--------------|-----------------|-------|
| `qc_status = 'pass'` | `return` | `+product_quantity` | Stock restocked |
| `qc_status = 'fail'` | `write_off` | `0` (no ledger entry) | Damaged; write-off entry added by ops team manually |
| `qc_status IS NULL` (RTO) | `rto` | `+product_quantity` | Auto-restock on RTO delivery |

### 3.5 Duplicate Handling

| Entity | Dedup Key | Action |
|--------|-----------|--------|
| returns | `(shiprocket_order_id, awb_code)` | SKIP; log DUPLICATE |
| returns | `shiprocket_order_id` when `awb_code IS NULL` | Allow — multiple return attempts are valid |

---

## Source 4: Purchase Invoices

**Files:** PDF invoices and one XLS (L4 blocked — xlrd required)  
**Known invoices:** JSKS-240801 (L2, Jspeed, USD 6,120), BURN-251006 (L3, Burning Active, USD 4,228.60), L1 Classic (JPEG — OCR required), L4 Flare (XLS — blocked)

### 4.1 Source-to-Destination Field Map

#### → `purchase_orders` table

| Source Field (PDF) | Destination Column | Transformation |
|-------------------|-------------------|----------------|
| Invoice number / PO reference | invoice_number | `TRIM(value)` |
| Invoice date | invoice_date | Parse to date |
| Supplier company name | supplier_name | `TRIM(value)` |
| Subtotal (foreign) | subtotal_foreign | `ROUND(CAST(value AS numeric), 2)` |
| Shipping / freight (foreign) | shipping_cost_foreign | `ROUND(CAST(value AS numeric), 2)`; 0 if FOB |
| Invoice total (foreign) | total_foreign | `ROUND(CAST(value AS numeric), 2)` |
| Currency | currency | Normalise to `USD` / `INR` / `EUR` |
| Payment terms (text from invoice) | payment_terms | Free text; preserve as-is |
| Payment method (PDF header or manual) | payment_method | `paypal` or `swift` |
| *(Manual entry at import time)* | fx_rate_inr | INR/USD at payment date — from bank transaction record |
| *(derived)* | total_inr | `total_foreign × fx_rate_inr` |
| *(Manual)* | launch_id | FK → launches.id; set by operator at import time |

#### → `purchase_order_lines` table

| Source Field (PDF line items) | Destination Column | Transformation |
|------------------------------|-------------------|----------------|
| Style No. | supplier_style_no | `TRIM(value)` |
| Description | description | `TRIM(value)` |
| Size (column or note) | size | `TRIM(value)` |
| Colour (Pantone/TCX code) | colour_code | `TRIM(value)` |
| Quantity / PCS | quantity | `CAST(value AS int)` |
| Unit price (foreign) | unit_price_foreign | `ROUND(CAST(value AS numeric), 2)` |
| Amount (foreign) | line_total_foreign | `ROUND(CAST(value AS numeric), 2)` |
| *(post-import SKU resolution)* | variant_id | Match `supplier_style_no` + `size` to `product_variants.sku`; NULL until resolved |

### 4.2 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-INV-01 | `total_foreign = subtotal_foreign + shipping_cost_foreign` (±0.01) | Log TOTAL_MISMATCH; import with flag |
| V-INV-02 | `SUM(purchase_order_lines.line_total_foreign) ≈ purchase_orders.subtotal_foreign` (±0.01) | Log LINE_SUM_MISMATCH |
| V-INV-03 | `fx_rate_inr > 0` if `currency ≠ 'INR'` | Block import; fx_rate is mandatory |
| V-INV-04 | `quantity > 0` for all lines | Reject line; log |
| V-INV-05 | `invoice_number` NOT NULL | Reject PO |

### 4.3 Duplicate Handling

| Entity | Dedup Key | Action |
|--------|-----------|--------|
| purchase_orders | `invoice_number` | SKIP if already imported; log |
| purchase_order_lines | `(purchase_order_id, supplier_style_no, size)` | SKIP exact match |

### 4.4 Error Handling

| Error Type | Example | Resolution |
|------------|---------|-----------|
| OCR_REQUIRED | L1 Classic invoice is JPEG | Manual data entry required; mark PO as `status = 'draft'` until verified |
| FORMAT_BLOCKED | L4 Flare invoice is `.xls` | Convert to PDF or CSV first; import blocked until converted |
| UNRESOLVED_SKU | Supplier style no. has no canonical SKU | `variant_id` set NULL; add to SKU mapping table for manual resolution |

---

## Source 5: Bank Statements

**Sheet:** `2026` (Kirgo Numbers.xlsx)  
**Period:** Jan 2026 – Jun 2026 (current)  
**Format:** 7 columns: Date, Narration, Ref No./Cheque No., Withdrawal, Deposit, Closing Balance, *(derived)* Value Date  
**Post-import processing:** Narration classifier assigns `transaction_type`, `counterparty`, `extracted_reference`.

### 5.1 Source-to-Destination Field Map

#### → `bank_transactions` table

| Source Column | Destination Column | Transformation |
|--------------|-------------------|----------------|
| Date | transaction_date | Parse to date (`DD/MM/YYYY` format) |
| Value Date | value_date | Parse to date; same as transaction_date if absent |
| Narration | narration_raw | Preserve exactly; do NOT trim or modify |
| Ref No./Cheque No. | reference_number | `TRIM(value)`; NULL if blank |
| Withdrawal (Dr) | withdrawal_inr | `ROUND(CAST(value AS numeric), 2)`; NULL if blank |
| Deposit (Cr) | deposit_inr | `ROUND(CAST(value AS numeric), 2)`; NULL if blank |
| Closing Balance | closing_balance_inr | `ROUND(CAST(value AS numeric), 2)` |
| *(classifier)* | transaction_type | Assigned by narration parser (see §Narration Classification Rules) |
| *(classifier)* | counterparty | Extracted by narration parser |
| *(classifier)* | extracted_reference | CRF ID, YESF code, or UTR extracted by narration parser |

### 5.2 Narration Classification Rules

| Priority | Pattern (case-insensitive) | `transaction_type` | `extracted_reference` extraction |
|----------|---------------------------|-------------------|--------------------------------|
| 1 | Contains `YESB` + `EASEBUZZ` | `gateway_settlement` | Extract `YESF[0-9]+` |
| 2 | Contains `ICIC` + `INFIBEAM` | `gateway_settlement` | Extract `IN[0-9]{14}` |
| 3 | Contains `SHIPROCKET` + `CRF` | `cod_remittance` | Extract numeric after `CRF ID ` |
| 4 | Contains `BIGFOOT RETAIL` | `shiprocket_recharge` | NULL |
| 5 | Contains `DELHIVERY` | `courier_payment` | NULL |
| 6 | Contains `FACEBOOK` or `META` | `ad_spend_meta` | NULL |
| 7 | Contains `GOOGLE` + (`ADS` or `PAYMENT`) | `ad_spend_google` | NULL |
| 8 | Contains `GOOGLE WORKSPACE` or `GOOGLE LLC` + workspace pattern | `saas_subscription` | NULL |
| 9 | Contains `PAYPAL` | `supplier_payment` | NULL |
| 10 | Contains `KANIKA` or known personal account | `founder_transfer` | NULL |
| 11 | Contains `REFUND` | `customer_refund` | NULL |
| 12 | Contains `CHARGES` or `FEE` or `COMMISSION` | `bank_charge` | NULL |
| 13 | No pattern matched | `unclassified` | NULL |

**Important:** Multiple patterns can match. Apply in priority order — first match wins.

#### → `gateway_settlements` table (created during bank statement import)

For each row where `transaction_type IN ('gateway_settlement', 'cod_remittance')`:

| Derived From | Destination Column | Logic |
|-------------|-------------------|-------|
| `transaction_type` | gateway | `gateway_settlement` → determine sub-type from narration: `YESB` → `easebuzz`, `ICIC` → `infibeam`; `cod_remittance` → `shiprocket_cod` |
| `extracted_reference` | settlement_reference | Direct copy |
| `deposit_inr` | amount_inr | Direct copy |
| `transaction_date` | settled_at | Direct copy |
| `bank_transactions.id` | bank_transaction_id | Set after both rows are inserted |

### 5.3 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-BNK-01 | `transaction_date` is a valid date and ≤ today | Reject row |
| V-BNK-02 | NOT (withdrawal_inr NOT NULL AND deposit_inr NOT NULL) — only one direction per row | Reject row; log INVALID_DIRECTION |
| V-BNK-03 | At least one of withdrawal_inr, deposit_inr is NOT NULL | Reject row (blank row in export) |
| V-BNK-04 | `closing_balance_inr` continuity: current balance = prior balance + deposit − withdrawal (±₹1) | Log BALANCE_BREAK; do not reject; flag for review |
| V-BNK-05 | `withdrawal_inr >= 0` and `deposit_inr >= 0` | Reject row |
| V-BNK-06 | `narration_raw` NOT NULL and NOT empty | Reject row |
| V-BNK-07 | No duplicate row: `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)` | SKIP; log DUPLICATE |

### 5.4 Duplicate Handling

| Entity | Dedup Key | Action |
|--------|-----------|--------|
| bank_transactions | `(transaction_date, narration_raw, COALESCE(withdrawal_inr, 0), COALESCE(deposit_inr, 0))` | SKIP exact duplicate; log |
| gateway_settlements | `settlement_reference` | SKIP; link to existing gateway_settlements row if already present |

### 5.5 Error Handling

| Error Type | Example | Resolution |
|------------|---------|-----------|
| BALANCE_BREAK | ₹500 discrepancy between consecutive rows | Flag for manual review; continue import |
| UNCLASSIFIED | Narration has no matching pattern | Leave as `unclassified`; add to manual review queue |
| DUPLICATE_SETTLEMENT | Same YESF code appears twice (re-import) | Keep existing; log |

---

## Source 6: Marketing Spend

**Files:** Google Ads invoice PDFs (monthly), Meta Ads funding receipt PDFs/emails  
**Known data:** Google May 2026 (₹6,688.87 PMAX + ₹3,897.86 Test1), Google Apr 2026 (₹5,000 total), Meta May 2026 (₹10,000 total)

### 6.1 Source-to-Destination Field Map

#### → `ad_campaigns` table (one-time seeding; update only)

| Source Field (PDF) | Destination Column | Transformation |
|-------------------|-------------------|----------------|
| Campaign name | campaign_name | `TRIM(value)` |
| Account ID | platform_account_id | `TRIM(value)` |
| Campaign start date | started_at | Parse to date |
| *(manual)* | platform | `google` or `meta` |
| *(manual)* | campaign_type | `pmax`, `search`, `advantage_plus`, etc. |

#### → `ad_spend_daily` table

| Source Field (PDF/CSV) | Destination Column | Transformation |
|-----------------------|-------------------|----------------|
| *(resolved from campaign name)* | campaign_id | FK → ad_campaigns.id |
| Date | spend_date | Parse to date |
| Impressions | impressions | `CAST(value AS bigint)`; DEFAULT 0 |
| Clicks | clicks | `CAST(value AS int)`; DEFAULT 0 |
| Net spend (excl. GST) | spend_inr | `ROUND(CAST(value AS numeric), 2)` |
| GST (18% for Google; 0 for Meta) | gst_inr | `ROUND(CAST(value AS numeric), 2)`; DEFAULT 0 |
| Invoice number / receipt ID | invoice_reference | `TRIM(value)` |

### 6.2 Google Ads — Daily Distribution

Google Ads PDFs provide monthly totals per campaign, not daily breakdown. When daily data is unavailable:

1. **If bank statement shows the debit date:** Use debit date as the single `spend_date` row for the full monthly amount.
2. **If Google Ads CSV export is available:** Use actual daily spend data (preferred).
3. **Fallback:** Distribute monthly spend uniformly across active days in the invoice period.

Document the distribution method used in `ad_spend_daily.invoice_reference`.

### 6.3 Meta Ads — Funding Event vs Spend

Meta invoices record funding events (wallet top-ups), not actual daily spend. Until Meta Ads CSV API data is integrated:

- Insert one row per funding event: `spend_date = funding_date`, `spend_inr = funding_amount`, `gst_inr = 0`
- Mark `invoice_reference = 'FUNDING_EVENT_<receipt_id>'`
- This is a known data quality limitation (see DATA_DICTIONARY.md Appendix E)

### 6.4 Validation Rules

| Rule | Check | Action on Failure |
|------|-------|------------------|
| V-ADS-01 | `spend_inr >= 0` | Reject row |
| V-ADS-02 | `campaign_id` resolves to a known campaign | Reject row; log UNKNOWN_CAMPAIGN |
| V-ADS-03 | `(campaign_id, spend_date)` UNIQUE | SKIP if duplicate; log; update if spend_inr differs and new value is higher |
| V-ADS-04 | `gst_inr = 0` for Meta campaigns | Nullify if non-zero; log DQ_WARN |
| V-ADS-05 | `spend_date` falls within `ad_campaigns.started_at` and `ended_at` range | Log DATE_RANGE_WARN; do not reject |
| V-ADS-06 | `spend_inr` reconciles with `bank_transactions.withdrawal_inr` for matched ad spend debit (±₹1) | Log RECONCILE_WARN |

### 6.5 Duplicate Handling

| Entity | Dedup Key | Action |
|--------|-----------|--------|
| ad_campaigns | `(platform, platform_account_id, campaign_name)` | SKIP; do not create duplicate campaign |
| ad_spend_daily | `(campaign_id, spend_date)` | SKIP if exact match; log |

---

## Appendix A: SKU Resolution Strategy

All three sources (WooCommerce, Shiprocket, Returns) must resolve raw SKUs to `product_variants.id`. Resolution priority order:

1. **Exact match:** `product_variants.sku = source_sku`
2. **Shiprocket channel SKU:** `product_variants.shiprocket_channel_sku = source_sku`
3. **WooCommerce product ID:** `product_variants.woocommerce_product_id = source_product_id`
4. **Manual mapping table:** Pre-built lookup from known legacy SKU formats to canonical SKU
5. **Unresolved:** `variant_id = NULL`; row imported; logged in `import_errors`

Zero unresolved SKUs is a hard requirement before the first KPI compute. Per DATA_DICTIONARY.md Appendix C.

---

## Appendix B: IST to UTC Conversion

All WooCommerce and Shiprocket timestamps are in IST (UTC+5:30). Convert to UTC before storing:

```
UTC = IST − 05:30
```

Example: `2026-01-15 11:42:00 IST` → `2026-01-15 06:12:00 UTC`

---

## Appendix C: Import File Storage

| Stage | Location | Retention |
|-------|----------|-----------|
| Raw (pre-import) | `imports/raw/YYYY-MM-DD/{source}/` | Permanent |
| Processed (imported) | `imports/processed/YYYY-MM-DD/{source}/` | 90 days |
| Archived | `imports/archive/{source}/YYYY/` | Permanent |
| Error logs | `imports/errors/YYYY-MM-DD/{source}/` | 90 days |

Never overwrite raw files. Archive immediately after successful import.
