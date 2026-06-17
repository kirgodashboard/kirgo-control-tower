# Kirgo Workbook Import Specification

**Version:** 1.0  
**Source file:** `imports/raw/Kirgo Numbers.xlsx`  
**Last analysed:** 2026-06-18  
**Total sheets:** 18  
**Import-target sheets:** 9  

---

## 1. Workbook Overview

| # | Sheet name | Rows | Classification | Import target |
|---|---|---|---|---|
| 1 | Master | ~30 | SKU summary | No — reference only |
| 2 | Credentials | — | Third-party login credentials | **EXCLUDED** |
| 3 | ProductionSKU | ~30 | Cost/margin per SKU | No — reference only |
| 4 | Monthly Revenue | ~40 | Calculated summary | No — reference only |
| 5 | First Lovers | ~50 | Customer email list | No — reference only |
| 6 | 2023 | — | HDFC bank statement | No — future phase |
| 7 | 2024 | — | HDFC bank statement | No — future phase |
| 8 | 2025 | — | HDFC bank statement | No — future phase |
| 9 | 2026 | — | HDFC bank statement | No — future phase |
| 10 | SR - 2023 | 61 | Shiprocket shipments | **YES** |
| 11 | SR - 2024 | 570 | Shiprocket shipments | **YES** |
| 12 | SR - 2025 | 249 | Shiprocket shipments | **YES** |
| 13 | SR - 2026 | 215 | Shiprocket shipments | **YES** |
| 14 | Returns - 2023 | 4 | Customer returns | **YES** |
| 15 | Returns - 2024 | 67 | Customer returns | **YES** |
| 16 | Returns - 2025 | 17 | Customer returns | **YES** |
| 17 | Returns 2025 - 2026 | 56 | Customer returns | **YES** |
| 18 | Woocom - Orders | 916 | WooCommerce orders | **YES** |

---

## 2. SHEET: `Woocom - Orders`

### 2.1 Purpose
Complete historical WooCommerce order ledger from first order to present.  
916 rows × 93 columns. This is the **single source of truth** for all order financial amounts, customer identity, and line items. No duplicate source exists.

### 2.2 Destination tables
`customers` → `orders` → `order_lines`

### 2.3 Column mapping

#### A — Customer fields → `customers`

| Sheet column | DB column | Transformation |
|---|---|---|
| `billing_email` | `customers.email` | `LOWER(TRIM)` — dedup key |
| `billing_first_name` | `customers.first_name` | `TRIM` |
| `billing_last_name` | `customers.last_name` | `TRIM` |
| `billing_phone` | `customers.phone` | normalise_phone: strip +91/0, validate ^[6-9][0-9]{9}$ |
| `meta:_wc_order_attribution_utm_source` | `customers.acquisition_source` | `LOWER(TRIM)`, NULL if blank |
| `order_date` | `customers.first_order_at` | See deferred aggregate note below |
| (computed) | `customers.total_orders` | Deferred: COUNT after all rows |
| (computed) | `customers.total_revenue_inr` | Deferred: requires Shiprocket delivered_at |

**Dedup rule:** `ON CONFLICT (email) DO NOTHING` — existing customers are not updated.  
**Deferred aggregates:** `first_order_at` and `total_orders` are computed in a single batch UPDATE after all 916 rows are inserted.  
`total_revenue_inr` is **not computed** during WC import — requires Shiprocket `delivered_at`.

#### B — Order fields → `orders`

| Sheet column | DB column | Transformation |
|---|---|---|
| `order_id` | `orders.woocommerce_order_id` | `int` — idempotency key (SKIP if exists) |
| `order_number` | `orders.woocommerce_order_number` | `TRIM` |
| `order_date` | `orders.ordered_at` | IST → UTC (subtract 05:30) |
| `paid_date` | `orders.paid_at` | IST → UTC; NULL if blank |
| `status` | `orders.status` | Direct — values in data: `processing`, `completed`, `cancelled`, `failed`, `pending`, `on-hold` |
| `payment_method` | `orders.payment_method` | Map via PAYMENT_METHOD_MAP (see §2.5) |
| `payment_method_title` | `orders.payment_method_title` | `TRIM` |
| `transaction_id` | `orders.transaction_id` | `TRIM`, NULL if blank |
| `order_subtotal` | `orders.subtotal_inr` | `parse_decimal` |
| `discount_total` | `orders.discount_inr` | `parse_decimal`; includes both `cart_discount` + `order_discount` |
| `shipping_total` | `orders.shipping_charged_inr` | `parse_decimal` — **excluded from all revenue KPIs (BR-004)** |
| `order_total` | `orders.order_total_inr` | `parse_decimal` |
| `meta:_wc_order_attribution_utm_source` | `orders.attribution_source` | `LOWER(TRIM)`, NULL if blank |
| `meta:_wc_order_attribution_source_type` | `orders.attribution_medium` | `LOWER(TRIM)` — values: `typein`, `organic`, `referral`, `utm` |
| _(not present in workbook)_ | `orders.attribution_campaign` | Always NULL for historical data |
| `meta:_wc_order_attribution_device_type` | `orders.attribution_device` | Normalise: `Mobile` → `mobile`, `Phone` → `mobile`, `Desktop` → `desktop`, `Tablet` → `tablet` |
| `billing_city` | `orders.billing_city` | `TRIM` |
| `billing_state` | `orders.billing_state` | `TRIM` |
| `billing_postcode` | `orders.billing_pincode` | Validate `^[1-9][0-9]{5}$`; NULL if invalid |

**Not imported:** `customer_ip_address`, `customer_user_agent`, `customer_note`, `wt_import_key`, `tax_items`, `shipping_items`, `fee_items`, `coupon_items`, `refund_items`, `order_notes`, `order_key`, `order_currency`, all `shipping_*` address fields, `billing_address_1/2`, `billing_company`, `billing_country`.

#### C — Line item fields → `order_lines`

The workbook uses **4 line item slots** with consistent column groups. Each slot is `Product Item N Name/id/SKU/Quantity/Total/Subtotal` (N = 1..4).

| Sheet column | DB column | Transformation |
|---|---|---|
| `Product Item N Name` | `order_lines.product_name_raw` | `TRIM` |
| `Product Item N id` | `order_lines.woocommerce_line_item_id` | `parse_int` |
| `Product Item N SKU` | `order_lines.sku_raw` | `TRIM` |
| `Product Item N Quantity` | `order_lines.quantity` | `parse_int` — reject slot if ≤ 0 |
| `Product Item N Total` | `order_lines.line_total_inr` | `parse_decimal` — post-discount line amount |
| `Product Item N Subtotal` | `order_lines.line_subtotal_inr` | `parse_decimal` — pre-discount line amount |
| (computed) | `order_lines.unit_price_inr` | `line_total_inr / quantity`; NULL if quantity = 0 |
| (resolved) | `order_lines.variant_id` | 4-step SKU lookup (see §2.4) |

**Slot skipping:** A slot is skipped if both `Name` and `SKU` are blank.  
**Unit price:** The workbook has no per-unit price column. Derive as `line_total_inr / quantity`.

> **Note:** `line_item_1..4` columns contain free-text WooCommerce serialised strings — do not parse. Use the `Product Item N` columns instead.

### 2.4 SKU resolution (4-step priority)

1. `sku_raw` → `product_variants.sku` (exact canonical match)
2. `sku_raw` → `product_variants.shiprocket_channel_sku`
3. `Product Item N id` (wc_product_id) → `product_variants.woocommerce_product_id`
4. `imports/config/sku_manual_map.csv`: `raw_sku → canonical_sku` → step 1

If all steps fail: `variant_id = NULL`; log `UNRESOLVED_SKU` warning; RC-REV-04 blocks KPI compute.

### 2.5 Payment method map

| Raw value | Canonical | Notes |
|---|---|---|
| `ccavenue` | `prepaid` | 575 orders — CCAvenue gateway |
| `cod` | `cod` | 249 orders |
| `gokwik_prepaid` | `prepaid` | 79 orders |
| `razorpay` | `prepaid` | 11 orders |
| `cheque` | `prepaid` | 1 order (manual/test) |
| `bacs` | `prepaid` | 1 order (bank transfer) |
| _(unknown)_ | NULL | Log `DQ_WARN` |

> **Important:** The payment_method values in the workbook differ from those in the CSV importer's constants. The workbook uses `ccavenue` as the dominant prepaid method (575/916 orders), not `easebuzz`. Update `constants.py` before using the CSV importer for incremental imports.

### 2.6 Validation rules

#### Hard (row rejected on failure)

| ID | Field | Rule |
|---|---|---|
| V-WC-01 | `order_id` | NOT NULL, `int > 0` |
| V-WC-02 | `order_total` | NOT NULL, `numeric >= 0` |
| V-WC-03 | `order_date` | Parseable datetime, not in future |
| V-WC-07 | Line items | At least one slot with `Quantity > 0` |

#### Soft (field nullified, row imports with warning)

| ID | Field | Rule |
|---|---|---|
| V-WC-04 | `status` | Must be in known set; warn if unknown |
| V-WC-05 | `billing_email` | Basic format check; NULL = no customer link |
| V-WC-06 | Order total | `order_total ≈ Σ(line_total) + shipping_total − discount_total` ± ₹1 |
| V-WC-08 | `billing_postcode` | `^[1-9][0-9]{5}$`; NULL if invalid |
| V-WC-09 | `billing_phone` | normalise_phone; NULL if invalid |
| V-WC-11 | `paid_date` | Must be ≥ `order_date` if present; NULL if invalid |
| V-WC-13 | `payment_method` | Must be in map; NULL if unknown |

### 2.7 Idempotency
**Key:** `orders.woocommerce_order_id` (UNIQUE constraint).  
**Behaviour:** `INSERT ... ON CONFLICT (woocommerce_order_id) DO NOTHING` — re-running skips existing orders; rows_skipped_duplicate counter incremented.

---

## 3. SHEET GROUP: `SR - 2023 / 2024 / 2025 / 2026`

### 3.1 Purpose
Shiprocket shipment records for all years. Each row is one shipment attempt for one SKU.  
A single WooCommerce order with 2 SKUs generates 2 SR rows sharing the same `Forward ID`.

**Row counts:** SR-2023: 61 | SR-2024: 570 | SR-2025: 249 | SR-2026: 215  
**Total:** 1,095 rows across 4 sheets.

### 3.2 Destination table
`shipments`

### 3.3 Column mapping → `shipments`

| Sheet column | DB column | Transformation |
|---|---|---|
| `Order ID` | (join key) | Try `CAST(Order ID AS int)` → match `orders.woocommerce_order_id`; set `shipments.order_id = orders.id`. If no match or non-numeric: `order_id = NULL`. |
| `Forward ID` | `shipments.shiprocket_order_id` | `parse_bigint` — idempotency key (see §3.7) |
| `Channel` | `shipments.channel` | `TRIM` |
| `Status` | `shipments.status` | Normalise (see §3.5) |
| `Channel SKU` | `shipments.channel_sku` | `TRIM` |
| `Master SKU` | `shipments.master_sku` | `TRIM`; also used as `sku_raw` for SKU resolution |
| `Master SKU` | `shipments.variant_id` | Resolve via `product_variants.sku` (steps 1–2 only, no wc_product_id available) |
| `Product Quantity` | `shipments.product_quantity` | `parse_int`; must be > 0 |
| `Payment Method` | `shipments.payment_method` | `COD` → `cod`, all others → `prepaid`; NULL if blank |
| `Product Price` | `shipments.product_price_inr` | `parse_decimal` |
| `Order Total` | `shipments.order_total_inr` | `parse_decimal` — store for reference; **do not sum for revenue** |
| `Courier Company` | `shipments.courier_company` | `TRIM` |
| `AWB Code` | `shipments.awb_code` | `TRIM`; NULL if blank |
| `Zone` | `shipments.zone` | Normalise: `z_a`→`z_a`, `z_b`→`z_b` … `z_e`→`z_e`; NULL if blank |
| `Freight Total Amount` | `shipments.freight_total_inr` | `parse_decimal_clean` — strip Go artefact `%!f(string=...)` before parse |
| `COD Charges` | `shipments.cod_charges_inr` | `parse_decimal_clean` — same artefact issue |
| `CRF ID` | `shipments.cod_crf_id` | `TRIM`; NULL if blank |
| `COD Remittance Date` | `shipments.cod_remittance_date` | `parse_date` (date only, no time); NULL if blank |
| `COD Payble Amount` | `shipments.cod_payable_inr` | `parse_decimal` |
| `Remitted Amount` | `shipments.remitted_inr` | `parse_decimal` |
| `Shiprocket Created At` | `shipments.shiprocket_created_at` | IST → UTC |
| `Channel Created At` | `shipments.channel_created_at` | IST → UTC |
| `Pickedup Timestamp` | `shipments.picked_up_at` | IST → UTC; NULL if blank |
| `Order Shipped Date` | `shipments.shipped_at` | IST → UTC; NULL if blank |
| `Order Delivered Date` | `shipments.delivered_at` | IST → UTC; NULL if blank or `N/A` — **revenue recognition date (BR-001)** |
| `EDD` | `shipments.edd` | `parse_date` (date only); NULL if blank |
| `RTO Initiated Date` | `shipments.rto_initiated_at` | IST → UTC; NULL if blank |
| `RTO Delivered Date` | `shipments.rto_delivered_at` | IST → UTC; NULL if blank |
| `NDR 1 Attempt Date` (latest non-blank) | (ndr_attempts counter) | Count non-blank NDR attempt date columns → `shipments.ndr_attempts` |
| `Latest NDR Reason` | `shipments.latest_ndr_reason` | `TRIM`; NULL if blank |
| `Address City` | `shipments.customer_city` | `TRIM` |
| `Address State` | `shipments.customer_state` | `TRIM` |
| `Address Pincode` | `shipments.customer_pincode` | `TRIM` |
| `RTO Risk` | `shipments.rto_risk` | Normalise: `Low` → `low`, `Medium` → `medium`, `High` → `high`; NULL if blank |

**Not imported:** `SRX Premium LM AWB`, `Shipping Bill URL`, `Manifested Date`, `Pickup Location ID`, `Pickup Address Name`, `Pickup Scheduled Date`, `Order Picked Up Date`, `Pickup First Attempt Date`, `EDD`, `Delayed Reason`, `RTO Address`, `UTR No`, `Customer_invoice_id`, `Shipping Charges`, `Pickup Exception Reason`, `NPR*`, `Buyer's Lat/long`, `Order Type`, `Order Tags`, `Invoice Date`, `Pickup Code`, `Eway Bill Nos`, `Last Updated AT`, `Partial COD *`, `RTO Score *`, `Delivery Boost *`, `WhatsApp Tracking *`, `Brand Boost *`, `Bridge Call Recording`, `Hub Address`, `RAD Score`, `RAD Datetimestamp`, `BAG ID`, `Pickup Pincode`, `Verifier *`, `Attempt Count`, `Pickup Generated Date`, `RTO WayBill`, `Order Risk`, `Address Risk`, `Address Score`, `Lost Date`, `Latest OFD Date`, `Master Courier`, `Is Reverse`, `Promise EDD`, `Updated New EDD`, `Exchange Order Type`, `Cancellation Reason`.

### 3.4 Order ID → `orders` join logic

```
IF Order ID is numeric AND CAST(int) matches orders.woocommerce_order_id:
    shipments.order_id = matched orders.id
ELSE:
    shipments.order_id = NULL
    log ADVISORY: "Shiprocket Order ID {X} has no matching WC order — order_id stored as NULL"
```

WC order_id range in workbook: appears to span ~800–2057 (numeric, 3–4 digits).  
SR rows with 10-digit numeric Order IDs (e.g. `8381141515`) are Shiprocket-internal and will not match.

### 3.5 Status normalisation

| Raw value | Canonical stored | Notes |
|---|---|---|
| `DELIVERED` | `DELIVERED` | Revenue recognition trigger |
| `CANCELED` | `CANCELED` | Shiprocket uses CANCELED (single L) |
| `RTO_DELIVERED` | `RTO_DELIVERED` | 2023-2024 format |
| `RTO DELIVERED` | `RTO_DELIVERED` | 2025-2026 format — normalise underscore |
| `RTO_ACKNOWLEDGED` | `RTO_ACKNOWLEDGED` | In-transit RTO |
| `NEW_ORDER` | `NEW_ORDER` | In-queue, no shipment yet |
| `LOST` | `LOST` | Courier lost shipment |

### 3.6 Data quality issues to handle

| Issue | Column(s) | Fix |
|---|---|---|
| Go format artefact `%!f(string=N.)` | `COD Charges`, `Freight Total Amount` | Strip with regex `^%!f\(string=(.*)\)$` → extract inner value |
| `N/A` string in date fields | `Order Delivered Date` (2025-2026) | Treat as NULL |
| Blank string `""` in date fields | All date columns | Treat as NULL |
| `0.` as a float string | Numeric fields | `parse_decimal` handles |
| Order ID with `-C` suffix | `Order ID` | Strip suffix before numeric cast; `-C` indicates cancellation variation |

### 3.7 Idempotency
**Primary key:** `(shiprocket_order_id, master_sku)` — Forward ID + SKU.  
If `Forward ID` is blank: fall back to `(order_id, awb_code, master_sku)`.  
**Behaviour:** Check existence before insert; skip if found; increment `rows_skipped_duplicate`.

> **Note:** The `shipments` table has no unique constraint. The importer must perform the dedup check in Python before attempting INSERT.

### 3.8 Validation rules

#### Hard

| ID | Field | Rule |
|---|---|---|
| V-SR-01 | `Master SKU` | NOT NULL (required for SKU resolution) |
| V-SR-02 | `Product Quantity` | `int > 0` |
| V-SR-03 | `Status` | NOT NULL |
| V-SR-04 | `Channel Created At` | Parseable datetime |

#### Soft

| ID | Field | Rule |
|---|---|---|
| V-SR-05 | `Order Delivered Date` | If Status=DELIVERED, must be parseable and not future |
| V-SR-06 | `AWB Code` | Warn if blank and Status=DELIVERED |
| V-SR-07 | `Freight Total Amount` | Warn if blank (needed for cost analysis) |
| V-SR-08 | `COD Remittance Date` | If COD, warn if blank |
| V-SR-09 | `Zone` | Warn if blank |

---

## 4. SHEET GROUP: `Returns - 2023 / 2024 / 2025` and `Returns 2025 - 2026`

### 4.1 Purpose
Customer-initiated returns routed through Shiprocket's reverse logistics.  
These are **distinct from RTOs** (which are recorded on the SR sheets as `RTO_DELIVERED`).

**Row counts:** Returns-2023: 4 | Returns-2024: 67 | Returns-2025: 17 | Returns-2025-2026: 56  
**Total:** 144 rows across 4 sheets.

### 4.2 Schema differences vs SR sheets

Returns sheets have 121 columns vs SR's 118. The 3 extra columns are:
- `Refund Amount`, `Return Reason`, `Refund Status`, `Refund Mode`
- `Return Logs`, `QC Failure Reason`, `QC Applicable`, `QC Status`
- `Warehouse Name/Mobile/Address*`, `Cancelled`, `Cancelled By`
- `partial_cod_collected`, `partial_cod_value` (lowercase, unlike SR's `Partial COD *`)
- `Previously Assigned AWBs`, `ReAssignment Count`, `Last Shipment Cancelled On`, `Last Pickup Failed On`
- Additional NPR fields: `NPR Reason`, `No of NPR Attempts`, `NPR Action By`, `NPR Remark`, `NPR Buyer Response`, `Last Shipment-NPR *`

### 4.3 Destination tables
`shipments` (reverse shipment record) + `returns`

### 4.4 Order ID differences

| Sheet group | Order ID format | Interpretation |
|---|---|---|
| Returns-2023 | `437281021` (9-digit numeric) | Shiprocket Forward ID of original shipment |
| Returns-2024 | `548987018` (9-digit numeric) | Same |
| Returns-2025 | `833832437` (9-digit numeric) | Same |
| Returns 2025-2026 | `R_2023`, `RC_R_1653` | Kirgo-internal return order IDs |

**Matching logic for `Returns 2023/2024/2025`:**  
Try `Forward ID` → `shipments.shiprocket_order_id` to find the original forward shipment → `returns.shipment_id`.

**Matching logic for `Returns 2025 - 2026`:**  
Try `AWB Code` → `shipments.awb_code` (reverse AWB lookup). If no match: `shipment_id = NULL`.

### 4.5 Column mapping

#### A — Reverse shipment record → `shipments` (Is Reverse = true)

Same mapping as §3.3, with `shipments.channel = 'return'`.  
`delivered_at` here means the return reached the warehouse, not the customer.

#### B — Return record → `returns`

| Sheet column | DB column | Transformation |
|---|---|---|
| (from shipment join) | `returns.shipment_id` | FK to matched forward shipment |
| `Forward ID` | `returns.shiprocket_order_id` | `parse_bigint` |
| `AWB Code` | `returns.awb_code` | `TRIM` |
| `Status` | `returns.status` | `TRIM` — values: `RETURN ACKNOWLEDGED`, `RETURN DELIVERED`, `RETURN CANCELLED`, `RETURN PENDING`, `LOST` |
| `Return Reason` | `returns.return_reason` | `TRIM`; see §4.6 |
| `QC Status` | `returns.qc_status` | Normalise: `pass`/`fail`/`pending` (all lowercase) |
| `QC Failure Reason` | `returns.qc_failure_reason` | `TRIM` |
| `Refund Amount` | `returns.refund_amount_inr` | `parse_decimal` |
| `Refund Status` | `returns.refund_status` | `Pending` → `pending`, `Refunded` → `processed` |
| `Refund Mode` | `returns.refund_mode` | Map: `Original Payment Method` → `original_payment_method`, `Bank Transfer` → `bank_transfer` |
| `Order Delivered Date` | `returns.returned_at` | IST → UTC — date return was received at warehouse |

### 4.6 Return reason values (observed)

`Does not fit`, `Size not as expected`, `Quality not as expected`, `Item is damaged`, `Parcel damaged on arrival`, `Not as described`, `Performance not adequate`, `Received wrong item`, `Changed my mind`, `Other`

Store as-is (free text). Future phase: normalise to enum.

### 4.7 Idempotency
**Primary key:** `returns.shiprocket_order_id` + `returns.awb_code`.  
For `Returns 2025-2026` where Order ID is Kirgo-format: deduplicate by `awb_code` alone.

### 4.8 Validation rules

#### Hard

| ID | Field | Rule |
|---|---|---|
| V-RT-01 | `Status` | NOT NULL |
| V-RT-02 | `Return Reason` | NOT NULL (distinguishes customer return from RTO) |

#### Soft

| ID | Field | Rule |
|---|---|---|
| V-RT-03 | `Refund Amount` | Warn if blank and `Refund Status = Pending` |
| V-RT-04 | `QC Status` | Warn if blank |
| V-RT-05 | `Forward ID` | Warn if no matching shipment found |

---

## 5. Reference-only sheets (not imported)

### 5.1 `Master`
6 columns: SKU, Orders, Cost per unit, Selling Price, Gross Margin per unit, Total Sale.  
Purpose: high-level SKU performance summary. Does not add data beyond what WC + SR sheets provide.  
**Action:** Do not import. Use to cross-check order counts per SKU post-import (advisory reconciliation).

### 5.2 `ProductionSKU`
14 columns: Manufacture cost, Shoot/Import, Shipping+Packaging, Cost Price, Selling Price, Margin, Stock levels by size.  
Purpose: cost and inventory snapshot.  
**Action:** Do not import in this phase. Future phase: seed `product_variants.cost_price_inr` and `product_variants.selling_price_inr`.

### 5.3 `Monthly Revenue`
8 columns: Launch, Year, Month, Sale, Orders, AOV, Monthly Avg Revenue.  
Purpose: manually maintained revenue summary.  
**Action:** Use as reconciliation cross-check after full import (compare Σ monthly revenue to DB query).

### 5.4 `First Lovers`
1 column: email addresses (~50 rows).  
Purpose: Kirgo's first customer cohort.  
**Action:** Do not import. Future phase: tag matching customers with a `segment = 'first_lovers'` flag.

### 5.5 `2023`, `2024`, `2025`, `2026`
HDFC bank statement exports (unstructured, single merged column).  
**Action:** Do not import. Future phase: parse for `bank_transactions` table (COD remittance reconciliation per BR-067).

---

## 6. EXCLUDED sheet

### 6.1 `Credentials`
Contains third-party platform login credentials (usernames and passwords for WooCommerce, Shiprocket, Gokwik).  
**MUST NOT be imported into the database under any circumstances.**  
These credentials must be rotated and moved to a secrets manager.  
The importer must detect this sheet and explicitly skip it with a log entry.

---

## 7. Cross-sheet idempotency considerations

The same physical order may appear in both `Woocom - Orders` (as an order) and an `SR - YYYY` sheet (as a shipment). This is expected and correct — they populate different tables. There is no conflict.

The same `shiprocket_order_id` may appear in both an `SR - YYYY` sheet and a `Returns` sheet. The SR row is the forward shipment; the Returns row is the reverse. The importer must handle both without creating duplicate `shipments` rows: check `(shiprocket_order_id, master_sku)` for existence before inserting.

---

## 8. Timestamp handling

All timestamps in the workbook (WooCommerce and Shiprocket) are in **IST (UTC+05:30)**.  
No timezone marker is present in the raw values.  
Convert all timestamps to UTC by subtracting 5 hours 30 minutes before storing.  
The schema stores all timestamps as `timestamptz` (UTC).
