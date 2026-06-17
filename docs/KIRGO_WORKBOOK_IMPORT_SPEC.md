# Kirgo Workbook Import Specification

**Version:** 2.0  
**Source file:** `imports/raw/Kirgo Numbers.xlsx`  
**Last analysed:** 2026-06-18  
**Total sheets:** 18  
**Import-target sheets:** 13 (Commerce × 1, Shipments × 4, Returns × 4, Finance × 4)  

---

## 1. Workbook Overview

| # | Sheet name | Rows | Classification | Import target | Destination |
|---|---|---|---|---|---|
| 1 | Master | ~30 | SKU summary | No — reference | — |
| 2 | Credentials | — | Login credentials | **EXCLUDED** | — |
| 3 | ProductionSKU | ~30 | Cost/margin data | No — manual seed | — |
| 4 | Monthly Revenue | ~40 | Calculated summary | No — cross-check only | — |
| 5 | First Lovers | ~50 | Customer email list | No — future phase | — |
| 6 | `2025 ` | ~248 | HDFC bank statement | **YES** | `bank_transactions`, `gateway_settlements` |
| 7 | `2024` | ~248 | HDFC bank statement | **YES** | `bank_transactions`, `gateway_settlements` |
| 8 | `2023` | ~30 | HDFC bank statement | **YES** | `bank_transactions`, `gateway_settlements` |
| 9 | `2026` | ~155 | HDFC bank statement | **YES** | `bank_transactions`, `gateway_settlements` |
| 10 | SR - 2023 | 61 | Shiprocket shipments | **YES** | `shipments` |
| 11 | SR - 2024 | 570 | Shiprocket shipments | **YES** | `shipments` |
| 12 | SR - 2025 | 249 | Shiprocket shipments | **YES** | `shipments` |
| 13 | SR - 2026 | 215 | Shiprocket shipments | **YES** | `shipments` |
| 14 | Returns - 2025 | 17 | Customer returns | **YES** | `returns`, `shipments` |
| 15 | Returns - 2023 | 4 | Customer returns | **YES** | `returns`, `shipments` |
| 16 | Returns - 2024 | 67 | Customer returns | **YES** | `returns`, `shipments` |
| 17 | `Returns 2025 - 2026 ` | 56 | Customer returns | **YES** | `returns`, `shipments` |
| 18 | Woocom - Orders | 916 | WooCommerce orders | **YES** | `customers`, `orders`, `order_lines` |

> **Note on sheet names:** Sheet `2025 ` has a trailing space. Sheet `Returns 2025 - 2026 ` has a trailing space. All sheet name lookups must use exact strings.

---

## 2. SHEET: `Woocom - Orders`

### 2.1 Purpose
Complete historical WooCommerce order ledger. 916 rows × 93 columns.  
Source of truth for all order financial amounts, customer identity, and line items.

### 2.2 Destination tables
`customers` → `orders` → `order_lines`

### 2.3 Column mapping

#### A — Customer fields → `customers`

| Sheet column | DB column | Transformation |
|---|---|---|
| `billing_email` | `customers.email` | `LOWER(TRIM)` — primary dedup key |
| `billing_first_name` | `customers.first_name` | `TRIM` |
| `billing_last_name` | `customers.last_name` | `TRIM` |
| `billing_phone` | `customers.phone` | normalise_phone: strip +91/0, validate `^[6-9][0-9]{9}$` |
| `meta:_wc_order_attribution_utm_source` | `customers.acquisition_source` | `LOWER(TRIM)`, NULL if blank |
| `order_date` | `customers.first_order_at` | Deferred aggregate — computed after all rows |
| (computed) | `customers.total_orders` | Deferred batch UPDATE after all rows |
| (computed) | `customers.total_revenue_inr` | Deferred — requires Shiprocket delivered_at (Step 5) |

**Dedup rule:** `ON CONFLICT (email) DO NOTHING`.

#### B — Order fields → `orders`

| Sheet column | DB column | Transformation |
|---|---|---|
| `order_id` | `orders.woocommerce_order_id` | `parse_int` — idempotency key (SKIP if exists) |
| `order_number` | `orders.woocommerce_order_number` | `TRIM` |
| `order_date` | `orders.ordered_at` | IST → UTC (subtract 05:30) |
| `paid_date` | `orders.paid_at` | IST → UTC; NULL if blank |
| `status` | `orders.status` | Direct — values: `processing`, `completed`, `cancelled`, `failed`, `pending`, `on-hold` |
| `payment_method` | `orders.payment_method` | Map: `ccavenue`/`razorpay`/`gokwik_prepaid`/`cheque`/`bacs` → `prepaid`; `cod` → `cod` |
| `payment_method_title` | `orders.payment_method_title` | `TRIM` |
| `transaction_id` | `orders.transaction_id` | `TRIM`, NULL if blank |
| `order_subtotal` | `orders.subtotal_inr` | `parse_decimal` |
| `discount_total` | `orders.discount_inr` | `parse_decimal` — includes `cart_discount` + `order_discount` |
| `shipping_total` | `orders.shipping_charged_inr` | `parse_decimal` — **excluded from all revenue KPIs (BR-004)** |
| `order_total` | `orders.order_total_inr` | `parse_decimal` |
| `meta:_wc_order_attribution_utm_source` | `orders.attribution_source` | `LOWER(TRIM)`, NULL if blank |
| `meta:_wc_order_attribution_source_type` | `orders.attribution_medium` | `LOWER(TRIM)` — values: `typein`, `organic`, `referral`, `utm` |
| _(absent in workbook)_ | `orders.attribution_campaign` | Always NULL for historical data |
| `meta:_wc_order_attribution_device_type` | `orders.attribution_device` | `Mobile`/`Phone` → `mobile`; `Desktop` → `desktop`; `Tablet` → `tablet` |
| `billing_city` | `orders.billing_city` | `TRIM` |
| `billing_state` | `orders.billing_state` | `TRIM` |
| `billing_postcode` | `orders.billing_pincode` | Validate `^[1-9][0-9]{5}$`; NULL if invalid |

**Payment method values observed in data:**

| Raw | Count | Canonical |
|---|---|---|
| `ccavenue` | 575 | `prepaid` |
| `cod` | 249 | `cod` |
| `gokwik_prepaid` | 79 | `prepaid` |
| `razorpay` | 11 | `prepaid` |
| `cheque` | 1 | `prepaid` |
| `bacs` | 1 | `prepaid` |

#### C — Line item fields → `order_lines`

4 slots: `Product Item N Name / id / SKU / Quantity / Total / Subtotal` (N = 1..4).

| Sheet column | DB column | Transformation |
|---|---|---|
| `Product Item N Name` | `order_lines.product_name_raw` | `TRIM` |
| `Product Item N id` | `order_lines.woocommerce_line_item_id` | `parse_int` |
| `Product Item N SKU` | `order_lines.sku_raw` | `TRIM` — used for SKU resolution |
| `Product Item N Quantity` | `order_lines.quantity` | `parse_int`; skip slot if ≤ 0 |
| `Product Item N Total` | `order_lines.line_total_inr` | `parse_decimal` — post-discount, **authoritative revenue field** |
| `Product Item N Subtotal` | `order_lines.line_subtotal_inr` | `parse_decimal` — pre-discount |
| (derived) | `order_lines.unit_price_inr` | `line_total_inr / quantity`; NULL if quantity = 0 |
| (resolved) | `order_lines.variant_id` | 4-step SKU lookup (see §2.4) |

**Slot skipping:** Skip if both `Name` and `SKU` are blank.  
**No unit price column in workbook** — derive as `line_total / quantity`.

### 2.4 SKU resolution (4-step priority)

1. `sku_raw` → `product_variants.sku` (exact canonical)
2. `sku_raw` → `product_variants.shiprocket_channel_sku`
3. `Product Item N id` → `product_variants.woocommerce_product_id`
4. `imports/config/sku_manual_map.csv` → canonical → step 1

NULL result: `variant_id = NULL`; log `UNRESOLVED_SKU`; RC-REV-04 blocks KPI.

### 2.5 Validation rules

**Hard** (row rejected): V-WC-01 order_id NOT NULL >0 | V-WC-02 order_total >= 0 | V-WC-03 order_date parseable | V-WC-07 at least one line item with qty > 0

**Soft** (warn, row imports): V-WC-04 status known | V-WC-05 email format | V-WC-06 total ≈ Σ(lines) + shipping - discount ±₹1 | V-WC-08 postcode | V-WC-09 phone | V-WC-11 paid_date ≥ order_date | V-WC-13 payment_method known

### 2.6 Idempotency
`orders.woocommerce_order_id` UNIQUE. On re-run: skip duplicates.

---

## 3. SHEET GROUP: `SR - 2023 / 2024 / 2025 / 2026`

### 3.1 Purpose
Shiprocket shipment records. One row per SKU per shipment attempt.  
A WC order with 2 SKUs = 2 SR rows sharing the same Forward ID.

**Row counts:** 2023: 61 | 2024: 570 | 2025: 249 | 2026: 215 | **Total: 1,095**

### 3.2 Destination table
`shipments`

### 3.3 Column mapping → `shipments`

| Sheet column | DB column | Transformation |
|---|---|---|
| `Order ID` | (join key only) | Cast to int; match `orders.woocommerce_order_id` → `shipments.order_id`. If no match: NULL. See §3.4. |
| `Forward ID` | `shipments.shiprocket_order_id` | `parse_bigint` — shared across SKUs in multi-item orders |
| `Channel` | `shipments.channel` | `TRIM` |
| `Status` | `shipments.status` | Normalise (see §3.5) |
| `Channel SKU` | `shipments.channel_sku` | `TRIM` |
| `Master SKU` | `shipments.master_sku` | `TRIM`; also used for variant_id resolution |
| `Master SKU` | `shipments.variant_id` | Resolve via `product_variants.sku` (steps 1–2 only) |
| `Product Quantity` | `shipments.product_quantity` | `parse_int`; must be > 0 |
| `Payment Method` | `shipments.payment_method` | `COD` → `cod`; all others → `prepaid`; NULL if blank |
| `Product Price` | `shipments.product_price_inr` | `parse_decimal` |
| `Order Total` | `shipments.order_total_inr` | `parse_decimal` — reference only; **do not sum for revenue** |
| `Courier Company` | `shipments.courier_company` | `TRIM` |
| `AWB Code` | `shipments.awb_code` | `TRIM`; NULL if blank |
| `Zone` | `shipments.zone` | Normalise to `z_a`..`z_e`; NULL if blank |
| `Freight Total Amount` | `shipments.freight_total_inr` | `parse_decimal_clean` — strips Go artefact `%!f(string=N.)` |
| `COD Charges` | `shipments.cod_charges_inr` | `parse_decimal_clean` — same artefact |
| `CRF ID` | `shipments.cod_crf_id` | `TRIM` — **COD reconciliation key** |
| `COD Remittance Date` | `shipments.cod_remittance_date` | `parse_date` (date only); NULL if blank |
| `COD Payble Amount` | `shipments.cod_payable_inr` | `parse_decimal` |
| `Remitted Amount` | `shipments.remitted_inr` | `parse_decimal` |
| `Shiprocket Created At` | `shipments.shiprocket_created_at` | IST → UTC |
| `Channel Created At` | `shipments.channel_created_at` | IST → UTC |
| `Pickedup Timestamp` | `shipments.picked_up_at` | IST → UTC; NULL if blank |
| `Order Shipped Date` | `shipments.shipped_at` | IST → UTC; NULL if blank |
| `Order Delivered Date` | `shipments.delivered_at` | IST → UTC; NULL if blank or `N/A` — **revenue recognition date (BR-001)** |
| `EDD` | `shipments.edd` | `parse_date`; NULL if blank |
| `RTO Initiated Date` | `shipments.rto_initiated_at` | IST → UTC; NULL if blank |
| `RTO Delivered Date` | `shipments.rto_delivered_at` | IST → UTC; NULL if blank |
| NDR attempt date cols | `shipments.ndr_attempts` | Count of non-blank `NDR N Attempt Date` columns (N = 1–3) |
| `Latest NDR Reason` | `shipments.latest_ndr_reason` | `TRIM`; NULL if blank |
| `Address City` | `shipments.customer_city` | `TRIM` |
| `Address State` | `shipments.customer_state` | `TRIM` |
| `Address Pincode` | `shipments.customer_pincode` | `TRIM` |
| `RTO Risk` | `shipments.rto_risk` | `Low` → `low` | `Medium` → `medium` | `High` → `high`; NULL if blank |

### 3.4 Order ID → WC order join

```python
# Strip '-C' cancellation suffix, cast to int, look up in orders
clean = sr_order_id.split('-')[0].strip()
wc_order_id = int(float(clean))  # if parseable
order_id = order_id_map.get(wc_order_id)  # None if not found
```

WC order_ids are small numeric values (hundreds to low thousands). 10-digit SR-internal IDs (e.g. `8381141515`) will not match.

### 3.5 Status normalisation

| Raw | Canonical | Notes |
|---|---|---|
| `DELIVERED` | `DELIVERED` | Revenue trigger |
| `CANCELED` | `CANCELED` | Shiprocket spelling (single L) |
| `RTO_DELIVERED` | `RTO_DELIVERED` | 2023–2024 |
| `RTO DELIVERED` | `RTO_DELIVERED` | 2025–2026 — normalise space→underscore |
| `RTO_ACKNOWLEDGED` | `RTO_ACKNOWLEDGED` | In-transit RTO |
| `NEW_ORDER` | `NEW_ORDER` | In-queue |
| `LOST` | `LOST` | Courier lost |

### 3.6 Data quality issues

| Issue | Columns | Fix |
|---|---|---|
| Go artefact `%!f(string=N.)` | `COD Charges`, `Freight Total Amount` | Strip with `^%!f\(string=(.*)\)$` |
| `N/A` string in date fields | `Order Delivered Date` (2025-2026) | Treat as NULL |
| Blank `""` in date columns | All date columns | Treat as NULL |
| `-C` suffix in Order ID | `Order ID` | Strip before int cast |

### 3.7 Idempotency
**Key:** `(shiprocket_order_id, master_sku)`. If Forward ID is blank: fall back to `(order_id, awb_code, master_sku)`. Check existence before INSERT.

---

## 4. SHEET GROUP: Returns sheets

### 4.1 Sheets

| Sheet | Year | Rows | Order ID format |
|---|---|---|---|
| `Returns - 2023` | 2023 | 4 | 9-digit Shiprocket order IDs |
| `Returns - 2024` | 2024 | 67 | 9-digit Shiprocket order IDs |
| `Returns - 2025` | 2025 | 17 | 9-digit Shiprocket order IDs |
| `Returns 2025 - 2026 ` | 2025–2026 | 56 | Kirgo-internal `R_NNNN` / `RC_R_NNNN` |

**Total:** 144 rows

### 4.2 Destination tables
`returns` (and reverse-leg rows in `shipments`)

### 4.3 Column mapping → `returns`

| Sheet column | DB column | Transformation |
|---|---|---|
| `Forward ID` | `returns.shiprocket_order_id` | `parse_bigint` |
| `AWB Code` | `returns.awb_code` | `TRIM` |
| `Status` | `returns.status` | `TRIM` — `RETURN ACKNOWLEDGED` / `RETURN DELIVERED` / `RETURN CANCELLED` / `RETURN PENDING` / `LOST` |
| `Return Reason` | `returns.return_reason` | `TRIM` — free text |
| `QC Status` | `returns.qc_status` | Normalise: `Pass` → `pass` | `Fail` → `fail` | `Pending` → `pending` |
| `QC Failure Reason` | `returns.qc_failure_reason` | `TRIM` |
| `Refund Amount` | `returns.refund_amount_inr` | `parse_decimal` |
| `Refund Status` | `returns.refund_status` | `Pending` → `pending` | `Refunded` → `processed` |
| `Refund Mode` | `returns.refund_mode` | `Original Payment Method` → `original_payment_method` | `Bank Transfer` → `bank_transfer` |
| `Order Delivered Date` | `returns.returned_at` | IST → UTC — date return reached warehouse |
| (from shipment join) | `returns.shipment_id` | FK to matched forward shipment (see §4.4) |

### 4.4 Forward shipment matching

**Returns-2023 / 2024 / 2025:** Match `Forward ID` → `shipments.shiprocket_order_id` → `returns.shipment_id`.

**Returns 2025-2026** (Kirgo-internal IDs): Match `AWB Code` → `shipments.awb_code` → `returns.shipment_id`.

If no match: `shipment_id = NULL`; log `MISSING_SHIPMENT` advisory.

### 4.5 Return reason values observed
`Does not fit`, `Size not as expected`, `Quality not as expected`, `Item is damaged`, `Parcel damaged on arrival`, `Not as described`, `Performance not adequate`, `Received wrong item`, `Changed my mind`, `Other`

---

## 5. SHEET GROUP: Finance — `2023 / 2024 / 2025  / 2026`

### 5.1 Purpose
HDFC bank statement exports covering account 50200082476640 from 15 Oct 2023 to 15 Jun 2026.  
725 raw rows; ~681 actual transactions after filtering headers and footers.

### 5.2 Statement periods

| Sheet | Period | Transactions |
|---|---|---|
| `2023` | 15 Oct 2023 – 31 Dec 2023 | ~30 |
| `2024` | 01 Jan 2024 – 31 Dec 2024 | ~248 |
| `2025 ` | 01 Jan 2025 – 31 Dec 2025 | ~248 |
| `2026` | 01 Jan 2026 – 15 Jun 2026 | ~155 |

### 5.3 Sheet layout
Header at **row index 20** (0-based). Data starts at row 22.  
Row 21 is an asterisk separator. Footer rows at the end contain statement summary and disclaimers.  
Parse row 15 to extract statement period dates.

### 5.4 Destination tables
`bank_transactions`, `gateway_settlements`

### 5.5 Column mapping → `bank_transactions`

| Sheet column | DB column | Transformation |
|---|---|---|
| `Date` | `bank_transactions.transaction_date` | `parse_date('%d/%m/%y')` |
| `Narration` | `bank_transactions.narration_raw` | `TRIM` |
| `Chq./Ref.No.` | `bank_transactions.reference_number` | `TRIM` (preserve raw) |
| `Value Dt` | `bank_transactions.value_date` | `parse_date('%d/%m/%y')`; NULL if blank |
| `Withdrawal Amt.` | `bank_transactions.withdrawal_inr` | `parse_decimal`; NULL if blank |
| `Deposit Amt.` | `bank_transactions.deposit_inr` | `parse_decimal`; NULL if blank |
| `Closing Balance` | `bank_transactions.closing_balance_inr` | `parse_decimal`; NULL if blank |
| (classified) | `bank_transactions.transaction_type` | From narration classifier (see BANK_IMPORT_SPEC.md §3) |
| (extracted) | `bank_transactions.extracted_reference` | CRF ID / CMS ref / YESF ref |
| (extracted) | `bank_transactions.counterparty` | From narration |

### 5.6 Transaction categories observed

| Type | Count | Net INR |
|---|---|---|
| `gateway_settlement` (Infibeam CCAvenue) | 108 | +9,50,967 |
| `cod_remittance` (Shiprocket COD) | 112 | +3,84,741 |
| `gateway_settlement` (EaseBuzz) | 70 | +2,17,574 |
| `gateway_settlement` (UPI customer payments) | 54 | +8,61,608 |
| `shiprocket_recharge` | 125 | −60,962 |
| `customer_refund` | 49 | −89,593 |
| `supplier_payment` (import bills) | 6 | −12,46,932 |
| `supplier_payment` (PayPal) | 14 | −1,23,360 |
| `gateway_settlement` (Gokwik) | 6 | +17,490 |
| `saas_subscription` | 13 | −12,274 |
| `bank_charge` | 17 | −22 |
| `unclassified` | ~73 | −8,19,867 (manual review needed) |

### 5.7 COD reconciliation link

```
bank narration: "...SHIPROCKET COD CRF ID {crf_id}..."
→ bank_transactions.extracted_reference = crf_id
→ gateway_settlements.settlement_reference = crf_id
→ shipments.cod_crf_id = crf_id
```

Full spec: see [BANK_IMPORT_SPEC.md](BANK_IMPORT_SPEC.md).

### 5.8 Idempotency
**Key:** `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)`

---

## 6. Reference-only sheets (not imported)

### 6.1 `Master`
SKU-level order counts and margins. Use post-import to cross-check order counts per SKU.

### 6.2 `ProductionSKU`
Cost price, selling price, margin, stock by size. Future phase: seed `product_variants.cost_price_inr`.

### 6.3 `Monthly Revenue`
Manually maintained monthly summary. Use as cross-check against DB revenue queries after full import.

### 6.4 `First Lovers`
~50 first customer emails. Future phase: tag in customers table.

---

## 7. EXCLUDED sheet: `Credentials`

Contains live platform credentials (WooCommerce, Shiprocket, Gokwik usernames and passwords).  
**MUST NOT be imported or read by the importer.**  
The importer detects this sheet by name and logs an advisory without reading its contents.  
These credentials should be rotated and moved to a secrets manager.

---

## 8. Timestamp Handling

All timestamps in WooCommerce and Shiprocket sheets are in **IST (UTC+05:30)** with no timezone marker.  
Bank statement dates are date-only (`dd/mm/yy`) — no timezone conversion needed; store as `date`.  
All `timestamptz` columns store UTC.  
Conversion: `utc = naive_ist - timedelta(hours=5, minutes=30)`, then `.replace(tzinfo=timezone.utc)`.

---

## 9. Cross-Sheet Idempotency

| Sheets | Tables | Overlap type |
|---|---|---|
| WC + SR | `orders` + `shipments` | Expected: same order in both. No conflict — different tables. |
| SR forward + Returns reverse | `shipments` | Possible same `(shiprocket_order_id, master_sku)`. The Returns leg inserts a separate reverse shipment row. Dedup check prevents double-inserting the same forward row. |
| Bank 2023–2026 | `bank_transactions` | No cross-year overlap. Each year sheet is a separate period. |
