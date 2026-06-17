# Kirgo Control Tower — Data Dictionary
**Version:** v2.1 | **Date:** 2026-06-17  
**Schema version:** v2 (27 tables, 7 domains, ~424 columns)  
**Currency:** INR throughout unless stated

---

## Legend

### Source Codes
| Code | Meaning |
|------|---------|
| `WC` | WooCommerce CSV export (`Woocom - Orders` sheet in Kirgo Numbers.xlsx) |
| `SR` | Shiprocket yearly exports (SR-2023 / SR-2024 / SR-2025 / SR-2026 sheets) |
| `RET` | Shiprocket returns exports (Returns-2023/2024/2025, Returns 2025-2026 sheets) |
| `BNK` | HDFC bank statement (2026 sheet in Kirgo Numbers.xlsx) |
| `INV` | Purchase invoice PDF (from Purchase Invoices zip) |
| `EXP` | Launch expenses source (Notion CSV / Markdown files) |
| `ADS` | Ad platform statements (Google Ads PDFs, Meta receipts) |
| `MAN` | Manual entry in Control Tower |
| `Calc` | Calculated / derived at import or compute time |
| `Seed` | Pre-seeded reference / lookup value (loaded once at DB init) |
| `AUTH` | Supabase Auth system |

### Editability Codes
| Code | Meaning |
|------|---------|
| `Auto` | Database auto-generated (PK serials, `DEFAULT now()`, GENERATED columns) |
| `Import` | Loaded from source file; immutable after import |
| `✓` | Editable by an authorised user |
| `Calc` | Computed field; not directly edited — recomputed on demand |
| `Seed` | Seeded at init; editable only by admin |

---

## Part 1: Column-Level Dictionaries

---

## Domain 1: Product

---

### Table: `launches`
**Domain:** Product | **Version:** v1 | **Primary source:** Manual / Seed  
One row per production collection. The top-level entity everything else links to.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `3` | PK, auto-increment | Auto |
| code | text | Short collection code used in SKUs and reports | Seed | `L3` | UNIQUE NOT NULL; pattern `L[0-9]+` | Seed |
| name | text | Display name of the collection | Seed | `Core` | NOT NULL | ✓ |
| launched_at | date | Actual go-live date (when products became purchasable) | MAN | `2026-01-15` | Must be ≤ today for active/depleted launches | ✓ |
| planned_launch_at | date | Pre-launch placeholder date, set before launch is confirmed | MAN | `2026-07-01` | May be NULL for already-launched collections | ✓ |
| status | text | Lifecycle stage of the collection | MAN | `active` | NOT NULL; IN (`planned`, `active`, `depleted`) | ✓ |
| total_investment_inr | numeric(12,2) | Derived sum of all `launch_expenses.amount_inr` for this launch | Calc | `505000.00` | ≥ 0; recomputed when expenses change | Calc |
| notes | text | Free-form notes about the launch (delays, decisions, etc.) | MAN | `L4 deposit due July 2026` | — | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `products`
**Domain:** Product | **Version:** v1 | **Primary source:** Manual / Seed  
One row per sellable product (legging, bra, or set) per launch. Bundle (set) products carry self-referential FKs to their component legging and bra.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `8` | PK | Auto |
| launch_id | int | Which collection this product belongs to | Seed | `3` | FK → launches.id; NOT NULL | Seed |
| name | text | Human-readable product name | Seed | `Core Leggings` | NOT NULL | ✓ |
| product_type | text | Category of the product | Seed | `leggings` | NOT NULL; IN (`leggings`, `sports_bra`, `set`) | Seed |
| is_bundle | boolean | True for Set products (composed of one legging + one bra) | Seed | `false` | DEFAULT false | Seed |
| bundle_leggings_id | int | For Set products: FK to the component legging product | Seed | `8` | FK → products.id; NULL if not a bundle | Seed |
| bundle_bra_id | int | For Set products: FK to the component bra product | Seed | `9` | FK → products.id; NULL if not a bundle | Seed |
| selling_price_inr | numeric(10,2) | Current listed selling price (MRP) | Seed | `1999.00` | NOT NULL; > 0 | ✓ |
| cogs_manufacture_inr | numeric(10,2) | Per-unit manufacturing cost (supplier invoice ÷ units) | Calc | `785.00` | NOT NULL; ≥ 0 | ✓ |
| cogs_shoot_import_inr | numeric(10,2) | Per-unit amortisation of shoot + import/customs costs | Calc | `279.00` | NOT NULL; ≥ 0 | ✓ |
| cogs_shipping_pkg_inr | numeric(10,2) | Per-unit packaging material + outbound shipping provision | Calc | `75.00` | NOT NULL; ≥ 0 | ✓ |
| cogs_total_inr | numeric(10,2) | Sum of three COGS components (DB GENERATED column) | Calc | `1139.00` | GENERATED; = cogs_manufacture + cogs_shoot_import + cogs_shipping_pkg | Calc |
| gross_margin_inr | numeric(10,2) | Revenue − COGS per unit (DB GENERATED column) | Calc | `860.00` | GENERATED; = selling_price − cogs_total | Calc |
| gross_margin_pct | numeric(5,2) | Gross margin as % of selling price (DB GENERATED column) | Calc | `43.02` | GENERATED; = gross_margin_inr / selling_price × 100 | Calc |
| is_active | boolean | Whether this product is currently available for sale | MAN | `true` | DEFAULT true | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

**Seeded values:** See DATABASE_SCHEMA.md §Domain 1 `products` table for the 10-row seed.

---

### Table: `product_variants`
**Domain:** Product | **Version:** v1 | **Primary source:** Manual / Seed  
One row per SKU (product × size × colour combination). The unit of stock management, order fulfilment, and inventory tracking.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `21` | PK | Auto |
| product_id | int | Which product this variant belongs to | Seed | `8` | FK → products.id; NOT NULL | Seed |
| sku | text | Canonical SKU in pattern `[COLLECTION]-[TYPE]-[SIZE]` | Seed | `COR-LEG-M` | UNIQUE NOT NULL; see §SKU Taxonomy | Seed |
| size | text | Garment size | Seed | `M` | IN (`XS`, `S`, `M`, `L`, `XL`); NULL for virtual/bundle | Seed |
| colour | text | Colourway name | Seed | `Black` | — | ✓ |
| woocommerce_product_id | int | WooCommerce variation ID (extracted at import) | WC | `3421` | NULL until WC import runs | Import |
| shiprocket_channel_sku | text | Raw SKU as it appears in Shiprocket exports | SR | `SLP-M-1` | NULL until SR import confirms match | Import |
| is_active | boolean | Whether this SKU is currently being sold | MAN | `true` | DEFAULT true | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `inventory_batches`
**Domain:** Product | **Version:** v1 | **Primary source:** Manual / Seed  
One row per production run per variant. Records opening stock received from the supplier. Source of truth for initial `inventory_ledger` entries.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `14` | PK | Auto |
| launch_id | int | Which collection this batch belongs to | Seed | `3` | FK → launches.id | Seed |
| variant_id | int | Which SKU was received | Seed | `21` | FK → product_variants.id | Seed |
| opening_quantity | int | Units received from supplier at this batch | Seed | `60` | NOT NULL; > 0 | Seed |
| received_at | date | Date goods were received at warehouse | MAN | `2025-12-20` | Should be ≤ launch's launched_at | ✓ |
| purchase_order_id | int | Which PO this batch was sourced from | Seed | `2` | FK → purchase_orders.id; may be NULL for L1 (no PO on file) | Seed |
| notes | text | Any notes about the batch (partial delivery, damage, etc.) | MAN | `Full quantity received` | — | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `inventory_ledger`
**Domain:** Product | **Version:** v1 | **Primary source:** Calc / Import  
Append-only stock movement log. Every unit change is one row. Running sum of `quantity_delta` per variant gives current stock on hand. Never delete or update rows — corrections are new adjustment entries.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `1041` | PK | Auto |
| variant_id | int | Which SKU this movement affects | Calc | `21` | FK → product_variants.id; NOT NULL | Auto |
| batch_id | int | Source inventory batch (for opening entries and traceability) | Calc | `14` | FK → inventory_batches.id; may be NULL for adjustments | Auto |
| movement_type | text | Category of stock movement | Calc | `sale` | NOT NULL; IN (`opening`, `sale`, `return`, `rto`, `adjustment`) | Auto |
| quantity_delta | int | Change in stock (+ve = in, −ve = out) | Calc | `-1` | NOT NULL; ≠ 0 | Auto |
| reference_type | text | Type of record that caused this movement | Calc | `shipment` | IN (`shipment`, `return_shipment`, `manual`); NULL for opening | Auto |
| reference_id | int | PK of the shipment or return record causing this movement | Calc | `529` | Must match a row in shipments or returns per reference_type | Auto |
| occurred_at | timestamptz | When the movement was effective | Calc | `2026-03-15T14:22:00Z` | NOT NULL; ≤ now() | Auto |
| notes | text | For manual adjustments: reason (e.g. `stocktake correction`) | MAN | `Damaged unit written off` | Required when movement_type = `adjustment` | ✓ |

---

## Domain 2: Orders

---

### Table: `customers`
**Domain:** Orders | **Version:** v1 | **Primary source:** WC  
One row per unique customer email. Deduplicated on import from WooCommerce. Contains PII — readable by `analyst` and `admin` roles only.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `312` | PK | Auto |
| email | text | Primary customer identifier; dedup key on import | WC | `priya.sharma@gmail.com` | UNIQUE NOT NULL; lowercase; trim whitespace | Import |
| phone | text | Mobile number normalised to 10 digits (no +91) | WC | `9820112345` | Pattern `^[6-9][0-9]{9}$`; may be NULL | Import |
| first_name | text | Billing first name from WooCommerce | WC | `Priya` | — | Import |
| last_name | text | Billing last name from WooCommerce | WC | `Sharma` | — | Import |
| first_order_at | timestamptz | Timestamp of the customer's earliest order | Calc | `2024-02-14T10:30:00Z` | = MIN(orders.ordered_at) for this customer | Calc |
| total_orders | int | Running count of orders placed (all statuses) | Calc | `3` | ≥ 1; increment on each new order | Calc |
| total_revenue_inr | numeric(12,2) | Cumulative revenue from delivered orders only | Calc | `9798.00` | ≥ 0; updated on each delivery confirmation | Calc |
| acquisition_source | text | UTM source from the customer's first order | WC | `facebook` | May be NULL if UTM was not tracked | Import |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `orders`
**Domain:** Orders | **Version:** v1 | **Primary source:** WC  
One row per WooCommerce order. 917 orders from Oct 2023 to Jun 2026. Up to 4 line items per order — normalised into `order_lines`. WooCommerce is the system of record for order data (BR-DQ-02).

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `917` | PK | Auto |
| woocommerce_order_id | int | Native WooCommerce order ID | WC | `2051` | UNIQUE NOT NULL | Import |
| woocommerce_order_number | text | WooCommerce order number (may differ from ID in some plugins) | WC | `#2051` | — | Import |
| customer_id | int | FK to the customer who placed this order | Calc | `312` | FK → customers.id | Calc |
| status | text | Order lifecycle status (normalised from WC) | WC | `completed` | NOT NULL; IN (`processing`, `completed`, `cancelled`, `refunded`, `on-hold`, `failed`) | Import |
| payment_method | text | Normalised payment method code | WC | `gokwik_cod` | IN (`gokwik_prepaid`, `gokwik_cod`, `easebuzz`, `infibeam`, `cod`); see §Payment Methods | Import |
| payment_method_title | text | Raw WooCommerce payment method title as exported | WC | `Gokwik (COD)` | — | Import |
| transaction_id | text | Gateway transaction/reference ID | WC | `GK-TX-88120034` | May be NULL for COD orders at order time | Import |
| subtotal_inr | numeric(10,2) | Order total before discounts and shipping | WC | `3798.00` | ≥ 0 | Import |
| discount_inr | numeric(10,2) | Total discount amount applied to the order | WC | `0.00` | ≥ 0; DEFAULT 0 | Import |
| shipping_charged_inr | numeric(10,2) | Shipping fee collected from the customer | WC | `99.00` | ≥ 0; DEFAULT 0; per BR-REV-04 shipping is net-neutral | Import |
| order_total_inr | numeric(10,2) | Final order total collected from customer | WC | `3897.00` | NOT NULL; = subtotal − discount + shipping | Import |
| attribution_source | text | UTM source (e.g. `instagram`, `google`, `direct`) | WC | `instagram` | May be NULL | Import |
| attribution_medium | text | UTM medium (e.g. `cpc`, `social`, `organic`) | WC | `social` | May be NULL | Import |
| attribution_campaign | text | UTM campaign name | WC | `core_launch_jan26` | May be NULL | Import |
| attribution_device | text | Device type at time of order | WC | `mobile` | IN (`desktop`, `mobile`, `tablet`); may be NULL | Import |
| billing_city | text | Customer billing city | WC | `Mumbai` | — | Import |
| billing_state | text | Customer billing state | WC | `Maharashtra` | — | Import |
| billing_pincode | text | Customer billing postal code | WC | `400058` | Pattern `^[1-9][0-9]{5}$` | Import |
| ordered_at | timestamptz | Timestamp when order was placed | WC | `2026-01-15T11:42:00Z` | NOT NULL; ≤ now() | Import |
| paid_at | timestamptz | Timestamp when payment was confirmed | WC | `2026-01-15T11:43:00Z` | May be NULL (COD paid at delivery) | Import |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `order_lines`
**Domain:** Orders | **Version:** v1 | **Primary source:** WC  
One row per SKU per order (unpivoted from WooCommerce's columnar line items 1–4). Orders with multiple products produce multiple rows here sharing the same `order_id`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `1104` | PK | Auto |
| order_id | int | FK to the parent order | Calc | `917` | FK → orders.id; NOT NULL | Auto |
| variant_id | int | Resolved canonical SKU FK (may be NULL if SKU could not be matched) | Calc | `21` | FK → product_variants.id; log unresolved for manual fix | Calc |
| woocommerce_line_item_id | int | WooCommerce internal line item ID | WC | `4422` | May be NULL in older exports | Import |
| sku_raw | text | Raw SKU string as exported from WooCommerce | WC | `SLP-M-1` | — | Import |
| product_name_raw | text | Product name string as exported from WooCommerce | WC | `Core Leggings - M` | — | Import |
| quantity | int | Units ordered for this line | WC | `1` | NOT NULL; > 0 | Import |
| unit_price_inr | numeric(10,2) | Actual per-unit price (post-discount) | WC | `1999.00` | ≥ 0 | Import |
| line_total_inr | numeric(10,2) | Total for this line = quantity × unit_price | WC | `1999.00` | = quantity × unit_price_inr | Import |
| line_subtotal_inr | numeric(10,2) | Pre-discount value of this line | WC | `1999.00` | ≥ line_total_inr | Import |

---

### Table: `shipments`
**Domain:** Orders | **Version:** v1 | **Primary source:** SR  
One row per Shiprocket order-line. A single WooCommerce order maps to one or more Shiprocket rows (one per SKU in the order). AWB code is unique per physical shipment. ~1,099 rows across 4 yearly sheets.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `529` | PK | Auto |
| order_id | int | FK to the WooCommerce order | Calc | `917` | FK → orders.id; resolved from shiprocket_order_id | Calc |
| shiprocket_order_id | bigint | Shiprocket Order ID (= WooCommerce order_id for WC channel) | SR | `2051` | NOT UNIQUE — multi-item orders share one ID | Import |
| awb_code | text | Airway bill number — unique per physical shipment | SR | `1091390699093` | UNIQUE; NOT NULL when shipment is dispatched | Import |
| channel | text | Originating sales channel in Shiprocket | SR | `WOOCOMMERCE` | IN (`WOOCOMMERCE`, `CUSTOM`) | Import |
| status | text | Current shipment status from Shiprocket | SR | `DELIVERED` | NOT NULL; see §Shiprocket Status Codes | Import |
| variant_id | int | Resolved canonical SKU FK | Calc | `21` | FK → product_variants.id; resolved from master_sku | Calc |
| channel_sku | text | SKU as entered in WooCommerce channel | SR | `COR-LEG-M` | — | Import |
| master_sku | text | Shiprocket-normalised master SKU | SR | `SLP-M-1` | Used for variant_id resolution | Import |
| product_quantity | int | Units in this shipment line | SR | `1` | NOT NULL; > 0 | Import |
| payment_method | text | Payment type for this shipment | SR | `prepaid` | IN (`prepaid`, `cod`) | Import |
| product_price_inr | numeric(10,2) | Declared product price per unit | SR | `1999.00` | ≥ 0 | Import |
| order_total_inr | numeric(10,2) | Full order total — shared across all rows for the same SR order | SR | `1999.00` | De-dup on shiprocket_order_id before using for revenue | Import |
| courier_company | text | Courier used for this shipment | SR | `Delhivery` | See §Courier Companies | Import |
| zone | text | Shiprocket delivery zone | SR | `z_c` | IN (`z_a`, `z_b`, `z_c`, `z_d`, `z_e`) | Import |
| freight_total_inr | numeric(10,2) | Courier cost charged to Kirgo for this shipment | SR | `120.00` | ≥ 0 | Import |
| cod_charges_inr | numeric(10,2) | COD handling fee charged by Shiprocket | SR | `0.00` | ≥ 0; DEFAULT 0; 0 for prepaid | Import |
| cod_crf_id | text | Cash Remittance File ID — join key to bank narration for COD reconciliation | SR | `12269675` | NULL for prepaid; see §COD CRF ID | Import |
| cod_remittance_date | date | Date COD funds were remitted by Shiprocket | SR | `2026-02-01` | NULL for prepaid | Import |
| cod_payable_inr | numeric(10,2) | Amount payable by Shiprocket after COD deductions | SR | `1850.00` | NULL for prepaid; note: source column is `COD Payble Amount` (typo) | Import |
| remitted_inr | numeric(10,2) | Actual amount remitted (may differ from payable due to batch rounding) | SR | `1850.00` | NULL for prepaid | Import |
| shiprocket_created_at | timestamptz | When this order was created in Shiprocket | SR | `2026-01-15T12:00:00Z` | — | Import |
| channel_created_at | timestamptz | WooCommerce order creation time (mirrored in SR export) | SR | `2026-01-15T11:42:00Z` | Should match orders.ordered_at | Import |
| picked_up_at | timestamptz | Timestamp of courier pickup | SR | `2026-01-16T10:00:00Z` | Must be ≥ channel_created_at | Import |
| shipped_at | timestamptz | Timestamp when shipment was dispatched (left warehouse) | SR | `2026-01-16T14:00:00Z` | Must be ≥ picked_up_at | Import |
| delivered_at | timestamptz | Timestamp of successful delivery to customer | SR | `2026-01-19T11:00:00Z` | Must be ≥ shipped_at; NULL for RTOs | Import |
| edd | date | Estimated delivery date (Shiprocket commitment) | SR | `2026-01-20` | — | Import |
| rto_initiated_at | timestamptz | Timestamp when RTO was triggered | SR | `null` | Must be ≥ shipped_at; NULL for delivered | Import |
| rto_delivered_at | timestamptz | Timestamp when returned goods arrived back at warehouse | SR | `null` | Must be ≥ rto_initiated_at; NULL for delivered | Import |
| ndr_attempts | int | Count of failed delivery attempts before resolution | SR | `0` | ≥ 0; DEFAULT 0 | Import |
| latest_ndr_reason | text | Last NDR reason from Shiprocket (free text) | SR | `Customer not available` | NULL when ndr_attempts = 0 | Import |
| customer_city | text | Delivery city (from Shiprocket address) | SR | `Pune` | — | Import |
| customer_state | text | Delivery state | SR | `Maharashtra` | — | Import |
| customer_pincode | text | Delivery pincode | SR | `411001` | — | Import |
| rto_risk | text | Shiprocket RAD model risk score | SR | `low` | IN (`low`, `medium`, `high`) | Import |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `returns`
**Domain:** Orders | **Version:** v1 | **Primary source:** RET  
One row per return shipment. Covers both customer-initiated returns and RTOs. ~135 rows across 4 sheets. An RTO is also a return — distinguished by `status` = `RTO_DELIVERED` on the forward `shipments` record (BR-INV-04).

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `57` | PK | Auto |
| shipment_id | int | FK to the original forward shipment | Calc | `529` | FK → shipments.id; resolved from order_id + awb | Calc |
| shiprocket_order_id | bigint | Shiprocket Order ID (same as forward shipment) | RET | `2051` | — | Import |
| awb_code | text | Reverse AWB code for the return shipment | RET | `4056289100021` | May differ from forward AWB | Import |
| status | text | Return shipment status | RET | `RTO_DELIVERED` | — | Import |
| return_reason | text | Customer-stated reason (free text from Shiprocket) | RET | `Size too small` | NULL for RTOs (no customer reason) | Import |
| qc_status | text | QC inspection outcome | RET | `Pass` | — | Import |
| qc_failure_reason | text | Reason for QC failure if applicable | RET | `null` | NULL if qc_status = Pass | Import |
| refund_amount_inr | numeric(10,2) | Amount refunded to the customer | RET | `1999.00` | ≥ 0; 0 for RTOs (no customer refund on RTO) | Import |
| refund_status | text | Whether refund has been issued | RET | `processed` | IN (`pending`, `processed`) | Import |
| refund_mode | text | How the refund was returned to the customer | RET | `original_payment_method` | IN (`original_payment_method`, `bank_transfer`) | Import |
| returned_at | timestamptz | Date return was received at warehouse | RET | `2026-02-10T09:00:00Z` | Must be ≥ shipments.shipped_at | Import |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

## Domain 3: Financial

---

### Table: `bank_transactions`
**Domain:** Financial | **Version:** v1 | **Primary source:** BNK  
One row per HDFC bank transaction. Jan–Jun 2026. Narration is unstructured text — the narration parser (BUSINESS_RULES §3) classifies each row post-import. Contains financial PII — `admin` role only.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `88` | PK | Auto |
| transaction_date | date | Date as shown on bank statement | BNK | `2026-01-18` | NOT NULL; within statement period | Import |
| value_date | date | Value date (when transaction was actually settled) | BNK | `2026-01-18` | May equal transaction_date | Import |
| narration_raw | text | Original narration string from bank statement | BNK | `NEFT CR-YESB0000001-EASEBUZZ PVT LTD PA ESCROW A/C-KIRGO-YESF260475119837` | NOT NULL | Import |
| reference_number | text | Cheque or reference number from bank statement | BNK | `YESF260475119837` | — | Import |
| withdrawal_inr | numeric(12,2) | Debit amount — NULL for credit rows | BNK | `null` | NULL if this is a credit; ≥ 0 if populated | Import |
| deposit_inr | numeric(12,2) | Credit amount — NULL for debit rows | BNK | `24750.00` | NULL if this is a debit; ≥ 0 if populated | Import |
| closing_balance_inr | numeric(12,2) | Running balance after this transaction | BNK | `142388.50` | Continuity check: each row's balance = prior balance ± amounts | Import |
| transaction_type | text | Classified transaction category (from narration parser) | Calc | `gateway_settlement` | IN (`gateway_settlement`, `cod_remittance`, `founder_transfer`, `shiprocket_recharge`, `courier_payment`, `ad_spend_meta`, `ad_spend_google`, `customer_refund`, `supplier_payment`, `saas_subscription`, `bank_charge`, `unclassified`) | Calc |
| counterparty | text | Extracted counterparty name from narration | Calc | `EaseBuzz Pvt Ltd` | NULL until classifier runs | Calc |
| extracted_reference | text | CRF ID, YESF code, or UTR extracted from narration | Calc | `YESF260475119837` | Used to join to gateway_settlements or shipments.cod_crf_id | Calc |
| linked_settlement_id | int | FK to matched gateway settlement record | Calc | `12` | FK → gateway_settlements.id; NULL until matched | Calc |
| linked_purchase_order_id | int | FK to matched purchase order (for supplier payments) | Calc | `null` | FK → purchase_orders.id; NULL if not a supplier payment | Calc |
| notes | text | Manual annotation for unclassified or disputed rows | MAN | `Founder personal withdrawal — exclude from ops` | — | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `gateway_settlements`
**Domain:** Financial | **Version:** v1 | **Primary source:** Calc / BNK  
One row per settlement batch received from a payment gateway. Bridges the payment gateway to the bank statement. Each row corresponds to one bank credit entry matched via the settlement reference.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `12` | PK | Auto |
| gateway | text | Which payment gateway remitted this settlement | Calc | `easebuzz` | NOT NULL; IN (`easebuzz`, `infibeam`, `shiprocket_cod`) | Calc |
| settlement_reference | text | Unique reference for this settlement batch | BNK | `YESF260475119837` | UNIQUE; YESF code (EaseBuzz), IN code (Infibeam), or CRF ID (COD) | Calc |
| amount_inr | numeric(12,2) | Settlement amount received | BNK | `24750.00` | NOT NULL; > 0 | Import |
| settled_at | date | Date funds arrived in HDFC account | BNK | `2026-01-18` | — | Import |
| order_count | int | Number of orders included in this settlement batch | Calc | `13` | ≥ 1; derived from matching orders to gateway + date | Calc |
| bank_transaction_id | int | FK to the matching bank statement entry | Calc | `88` | FK → bank_transactions.id; NULL until matched | Calc |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `purchase_orders`
**Domain:** Financial | **Version:** v1 | **Primary source:** INV  
One row per supplier purchase order. Records the foreign currency amounts, FX rate, and payment terms. Two seeded POs: L2 (Jspeed, $6,120) and L3 (Burning Active, $4,228.60).

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `2` | PK | Auto |
| launch_id | int | Which launch collection this PO supports | Seed | `3` | FK → launches.id | Seed |
| supplier_name | text | Full legal name of the supplier | INV | `Burning Active Apparel Co., Ltd` | NOT NULL | ✓ |
| invoice_number | text | Supplier's invoice number | INV | `BURN-251006` | Unique per supplier; may be NULL for L1 (no invoice on file) | ✓ |
| invoice_date | date | Date printed on the supplier's invoice | INV | `2025-10-06` | — | ✓ |
| currency | text | Supplier billing currency | INV | `USD` | DEFAULT `USD`; IN (`USD`, `INR`) | ✓ |
| subtotal_foreign | numeric(12,2) | Invoice subtotal in supplier currency (before shipping) | INV | `3880.00` | ≥ 0 | ✓ |
| shipping_cost_foreign | numeric(12,2) | Shipping cost in supplier currency (0 for FOB) | INV | `348.60` | ≥ 0 | ✓ |
| total_foreign | numeric(12,2) | Total invoice amount in supplier currency | INV | `4228.60` | = subtotal_foreign + shipping_cost_foreign | ✓ |
| fx_rate_inr | numeric(8,4) | INR per 1 unit of supplier currency at payment date | MAN | `84.2500` | > 0; required to compute total_inr | ✓ |
| total_inr | numeric(12,2) | Converted total in INR (= total_foreign × fx_rate_inr) | Calc | `356057.25` | Calc | Calc |
| payment_terms | text | Agreed payment schedule | INV | `30% deposit + 70% before shipment` | — | ✓ |
| payment_method | text | How the supplier is paid | INV | `paypal` | IN (`swift`, `paypal`) | ✓ |
| status | text | Payment/receipt lifecycle | MAN | `received` | IN (`draft`, `partial_paid`, `paid`, `received`) | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `purchase_order_lines`
**Domain:** Financial | **Version:** v1 | **Primary source:** INV  
One row per line item on a supplier invoice. Records style numbers, colours, quantities, and unit prices in the supplier's currency. The basis for computing per-unit COGS.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `5` | PK | Auto |
| purchase_order_id | int | FK to the parent purchase order | Seed | `2` | FK → purchase_orders.id; NOT NULL | Seed |
| variant_id | int | Resolved canonical variant FK (set post-import once SKU map is built) | Calc | `21` | FK → product_variants.id; NULL until resolved | Calc |
| supplier_style_no | text | Supplier's internal style reference number | INV | `JSKS2403` | — | ✓ |
| description | text | Fabric specification and style description from invoice | INV | `Vest (Summer Sports Bra) 87% poly 13% elastane, 18-2326 TCX` | — | ✓ |
| size | text | Size code (may be a range for the line, e.g. `S/M/L/XL`) | INV | `S/M/L/XL` | — | ✓ |
| colour_code | text | Pantone/TCX colour code | INV | `18-2326 TCX` | — | ✓ |
| quantity | int | Total units ordered on this line | INV | `400` | NOT NULL; > 0 | ✓ |
| unit_price_foreign | numeric(8,2) | Per-unit price in supplier currency | INV | `5.15` | > 0 | ✓ |
| line_total_foreign | numeric(12,2) | Total for this line = quantity × unit_price_foreign | INV | `2060.00` | = quantity × unit_price_foreign | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `launch_expenses`
**Domain:** Financial | **Version:** v1 (modified in v2) | **Primary source:** EXP  
One row per pre-launch expense line item (manufacturing, shoot, packaging, website, logistics, etc.). `category` (v1 free text) was replaced by `category_id` FK → `expense_categories` in v2. Launch totals: L1 ₹6,43,500 · L2 ₹10,37,760 · L3 ₹5,05,000.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `34` | PK | Auto |
| launch_id | int | Which launch this expense belongs to | EXP | `3` | FK → launches.id; NOT NULL | Import |
| expense_name | text | Description of the specific expense line | EXP | `Instalment 1 (Pink + Black)` | NOT NULL | ✓ |
| category_id | int | FK to expense category (replaces v1 free-text category) | EXP | `1` | FK → expense_categories.id; NOT NULL | ✓ |
| amount_inr | numeric(12,2) | Amount paid in INR | EXP | `175000.00` | NOT NULL; > 0 | ✓ |
| currency_original | text | Original currency if paid in foreign currency | EXP | `USD` | DEFAULT `INR` | ✓ |
| amount_foreign | numeric(12,2) | Original foreign currency amount if paid in USD | EXP | `2081.00` | NULL if paid in INR | ✓ |
| fx_rate_inr | numeric(8,4) | INR/USD rate at time of payment | EXP | `84.1200` | NULL if currency_original = INR | ✓ |
| paid_at | date | Date the expense was paid | EXP | `2025-11-10` | — | ✓ |
| status | text | Payment status | EXP | `paid` | IN (`paid`, `pending`, `tbd`) | ✓ |
| notes | text | Additional context | EXP | `Swift transfer via HDFC` | — | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

## Domain 4: Marketing

---

### Table: `ad_campaigns`
**Domain:** Marketing | **Version:** v1 | **Primary source:** ADS / MAN  
One row per ad campaign across Google and Meta. Seeded from Google Ads PDFs (May 2026, Apr 2026) and Meta receipt. Campaign-level spend is in `ad_spend_daily`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `1` | PK | Auto |
| platform | text | Ad platform | MAN | `google` | NOT NULL; IN (`google`, `meta`) | ✓ |
| platform_account_id | text | Platform's own account identifier | MAN | `736-944-6064` | Google: `736-944-6064`; Meta: `729422043560314` | ✓ |
| campaign_name | text | Campaign name as it appears in the platform | ADS | `Sid - PMAX - 15 May` | — | ✓ |
| campaign_type | text | Campaign format | MAN | `pmax` | IN (`pmax`, `search`, `shopping`, `advantage_plus`); NULL for Meta until detailed data available | ✓ |
| started_at | date | Campaign start date | ADS | `2026-05-15` | — | ✓ |
| ended_at | date | Campaign end date (NULL = still active) | ADS | `null` | Must be ≥ started_at if set | ✓ |
| is_active | boolean | Whether the campaign is currently running | MAN | `true` | DEFAULT true | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `ad_spend_daily`
**Domain:** Marketing | **Version:** v1 | **Primary source:** ADS  
One row per campaign per day. Stores net spend, GST (Google only), impressions, and clicks. Google PMAX May 2026: 18,432 clicks · ₹6,688.87 net. Kirgo Test 1: 652 clicks · ₹3,897.86. Meta May 2026: ₹10,000 (single funding event, no campaign breakdown).

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `17` | PK | Auto |
| campaign_id | int | FK to the ad campaign | ADS | `1` | FK → ad_campaigns.id; NOT NULL | Import |
| spend_date | date | Date on which this spend was incurred | ADS | `2026-05-31` | NOT NULL | Import |
| impressions | bigint | Ad impressions on this date | ADS | `18432` | ≥ 0; DEFAULT 0 | Import |
| clicks | int | Clicks recorded on this date | ADS | `1202` | ≥ 0; DEFAULT 0 | Import |
| spend_inr | numeric(10,2) | Net ad spend (after any overdelivery credit) in INR | ADS | `6688.87` | NOT NULL; ≥ 0 | Import |
| gst_inr | numeric(10,2) | 18% IGST applied by Google (0 for Meta) | ADS | `1203.99` | ≥ 0; DEFAULT 0 | Import |
| total_inr | numeric(10,2) | spend_inr + gst_inr | Calc | `7892.86` | = spend_inr + gst_inr | Calc |
| invoice_reference | text | Google invoice number or Meta receipt ID | ADS | `5594350843` | — | Import |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

## Domain 5: Access Control

---

### Table: `roles`
**Domain:** Access Control | **Version:** v2 | **Primary source:** Seed  
One row per RBAC role. Three seeded roles: `admin`, `analyst`, `viewer`. Controls what users can see and do across the platform.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `2` | PK | Auto |
| code | text | Machine-readable role slug | Seed | `analyst` | UNIQUE NOT NULL; lowercase, no spaces | Seed |
| name | text | Display name | Seed | `Analyst` | NOT NULL | Seed |
| description | text | Human-readable summary of what this role can do | Seed | `Can run forecasts, view financials, dismiss insights` | — | ✓ |
| can_view_financials | boolean | Access to bank_transactions, gateway_settlements, cashflow data | Seed | `true` | DEFAULT false | Seed |
| can_view_customers | boolean | Access to customer PII (email, phone, address) | Seed | `true` | DEFAULT false | Seed |
| can_edit_forecasts | boolean | Create or update revenue/cashflow/inventory forecast records | Seed | `true` | DEFAULT false | Seed |
| can_manage_expenses | boolean | Create or edit entries in expenses and launch_expenses | Seed | `true` | DEFAULT false | Seed |
| can_dismiss_insights | boolean | Dismiss or archive insight cards | Seed | `true` | DEFAULT false | Seed |
| can_manage_users | boolean | Add, deactivate, or reassign users | Seed | `false` | DEFAULT false; only admin has this | Seed |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `users`
**Domain:** Access Control | **Version:** v2 | **Primary source:** AUTH / MAN  
One row per Control Tower user. Extends Supabase `auth.users` with application profile and role assignment. `auth_user_id` is the bridge to the auth system; `id` (serial) is used for all FK references within the application schema.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Internal application PK used for FK references | Auto | `1` | PK | Auto |
| auth_user_id | uuid | Supabase `auth.users.id` — bridge key to auth system | AUTH | `a1b2c3d4-...` | UNIQUE NOT NULL | Auto |
| role_id | int | Primary role assignment | MAN | `1` | FK → roles.id; NOT NULL | ✓ |
| full_name | text | Display name | MAN | `Kanika Rodrigues` | — | ✓ |
| email | text | Email address (mirrored from auth.users for readability) | AUTH | `kanika@doriame.com` | UNIQUE NOT NULL | Auto |
| avatar_url | text | URL to profile picture | AUTH | `https://...` | — | ✓ |
| is_active | boolean | Soft-deactivation flag (true = can log in) | MAN | `true` | DEFAULT true; set false to deactivate without deleting auth user | ✓ |
| last_login_at | timestamptz | Updated on each successful login | AUTH | `2026-06-17T09:00:00Z` | Updated by auth callback | Auto |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |
| updated_at | timestamptz | Last update timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now(); updated on each change | Auto |

---

## Domain 6: Operational Expenses

---

### Table: `expense_categories`
**Domain:** Operational Expenses | **Version:** v2 | **Primary source:** Seed  
One row per expense category. Controlled vocabulary for both `launch_expenses` (pre-launch capex) and `expenses` (recurring opex). 15 seeded values. Replaces the v1 free-text `category` column on `launch_expenses`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `1` | PK | Auto |
| code | text | Machine-readable slug | Seed | `manufacturing` | UNIQUE NOT NULL; lowercase, underscores | Seed |
| name | text | Display name | Seed | `Manufacturing` | NOT NULL | Seed |
| category_group | text | P&L classification bucket | Seed | `capex` | NOT NULL; IN (`cogs`, `capex`, `opex`, `marketing`, `financing`) | Seed |
| applies_to | text | Which expense table(s) this category is valid for | Seed | `launch` | NOT NULL; IN (`launch`, `operations`, `both`) | Seed |
| description | text | What types of costs belong in this category | Seed | `Supplier manufacturing payments and deposits` | — | ✓ |
| is_active | boolean | Whether this category is available for new entries | MAN | `true` | DEFAULT true | ✓ |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

### Table: `expenses`
**Domain:** Operational Expenses | **Version:** v2 | **Primary source:** BNK / MAN  
One row per operational cost not covered by `launch_expenses`. Captures recurring subscriptions (Google Workspace), Shiprocket recharges, ad spend aggregate lines, bank charges, and refunds. Each row should be reconcilable to a `bank_transactions` entry via `bank_transaction_id`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `22` | PK | Auto |
| expense_date | date | Date the expense was incurred | BNK / MAN | `2026-06-03` | NOT NULL; ≤ today | ✓ |
| category_id | int | FK to expense category | MAN | `12` | FK → expense_categories.id; NOT NULL | ✓ |
| description | text | Human-readable label for this expense | MAN | `Google Workspace - June 2026` | NOT NULL | ✓ |
| amount_inr | numeric(12,2) | Expense amount in INR | BNK / MAN | `1227.20` | NOT NULL; > 0 | ✓ |
| vendor | text | Vendor or payee name | MAN | `Google` | — | ✓ |
| payment_method | text | How this was paid | MAN | `bank_transfer` | IN (`upi`, `bank_transfer`, `paypal`, `debit_card`, `swift`) | ✓ |
| bank_transaction_id | int | FK to the matching bank statement entry (for reconciliation) | Calc | `88` | FK → bank_transactions.id; NULL until reconciled | Calc |
| launch_id | int | Which launch this expense is attributed to (if applicable) | MAN | `null` | FK → launches.id; NULL for general opex | ✓ |
| campaign_id | int | FK to ad campaign if this is an ad spend line | MAN | `null` | FK → ad_campaigns.id; NULL for non-ad expenses | ✓ |
| is_recurring | boolean | True for regular subscription expenses | MAN | `true` | DEFAULT false | ✓ |
| recurrence_period | text | How often this expense recurs | MAN | `monthly` | IN (`weekly`, `monthly`, `annual`); NULL if not recurring | ✓ |
| notes | text | Additional context | MAN | `Auto-debited 3rd of each month` | — | ✓ |
| created_by | int | FK to the user who logged this expense | AUTH | `1` | FK → users.id | Auto |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T08:00:00Z` | DEFAULT now() | Auto |

---

## Domain 7: Intelligence

---

### Table: `kpi_daily_snapshot`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc  
One row per calendar day. Pre-computed daily aggregate of time-sensitive KPIs. Powers the top-line dashboard without running expensive real-time joins. Recomputed nightly after data imports. Future dates have no row (only actuals are stored).

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `168` | PK | Auto |
| snapshot_date | date | The calendar day this snapshot represents | Calc | `2026-06-16` | UNIQUE NOT NULL; ≤ today | Calc |
| gross_revenue_inr | numeric(12,2) | Sum of order_lines.line_total_inr for orders delivered on this date | Calc | `12500.00` | ≥ 0; DEFAULT 0 | Calc |
| net_revenue_inr | numeric(12,2) | Gross minus refunds and discounts settled on this date | Calc | `11800.00` | ≥ 0; DEFAULT 0 | Calc |
| orders_placed | int | WooCommerce orders created on this date (all statuses) | Calc | `7` | ≥ 0; DEFAULT 0 | Calc |
| orders_delivered | int | Shipments with delivered_at on this date | Calc | `5` | ≥ 0; DEFAULT 0 | Calc |
| units_sold | int | Sum of order_lines.quantity for delivered orders on this date | Calc | `6` | ≥ 0; DEFAULT 0 | Calc |
| avg_order_value_inr | numeric(10,2) | gross_revenue / orders_delivered (NULL if orders_delivered = 0) | Calc | `2500.00` | ≥ 0; NULL if no deliveries | Calc |
| new_customers | int | Count of customers whose first_order_at = this date | Calc | `3` | ≥ 0; DEFAULT 0 | Calc |
| returns_count | int | Returns created (returned_at) on this date | Calc | `0` | ≥ 0; DEFAULT 0 | Calc |
| returns_value_inr | numeric(12,2) | Sum of returns.refund_amount_inr settled this date | Calc | `0.00` | ≥ 0; DEFAULT 0 | Calc |
| rto_count | int | Shipments with rto_delivered_at on this date | Calc | `1` | ≥ 0; DEFAULT 0 | Calc |
| rto_cost_inr | numeric(12,2) | Estimated two-way freight cost for RTOs delivered today | Calc | `240.00` | ≥ 0; DEFAULT 0 | Calc |
| cod_orders | int | Delivered orders on this date where payment_method IN ('gokwik_cod', 'cod') | Calc | `2` | ≥ 0; DEFAULT 0 | Calc |
| prepaid_orders | int | Delivered orders on this date where payment_method is prepaid | Calc | `3` | ≥ 0; DEFAULT 0 | Calc |
| cash_deposited_inr | numeric(12,2) | Sum of bank_transactions.deposit_inr on this date | Calc | `24750.00` | ≥ 0; DEFAULT 0 | Calc |
| cash_withdrawn_inr | numeric(12,2) | Sum of bank_transactions.withdrawal_inr on this date | Calc | `1227.20` | ≥ 0; DEFAULT 0 | Calc |
| closing_bank_balance_inr | numeric(12,2) | Last bank_transactions.closing_balance_inr of the day | Calc | `142388.50` | NULL if no bank transactions on this date | Calc |
| ad_spend_inr | numeric(10,2) | Sum of ad_spend_daily.spend_inr on this date | Calc | `0.00` | ≥ 0; DEFAULT 0 | Calc |
| computed_at | timestamptz | When this snapshot was last recomputed | Calc | `2026-06-17T02:00:00Z` | NOT NULL; updated on each recompute | Calc |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T02:00:00Z` | DEFAULT now() | Auto |

---

### Table: `kpi_monthly_snapshot`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc  
One row per month per launch, plus one aggregate row per month where `launch_id IS NULL`. Includes margin calculations, launch-level revenue splits, COD mix, ROAS, and contribution margin. Used by the BI module for monthly trend charts and P&L cards. UNIQUE constraint: (snapshot_month, launch_id) — implemented as a partial unique index for the NULL launch_id aggregate rows.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `42` | PK | Auto |
| snapshot_month | date | First day of the month this snapshot covers | Calc | `2026-02-01` | NOT NULL | Calc |
| launch_id | int | Which launch's slice this row covers; NULL = all-launches aggregate | Calc | `3` | FK → launches.id; NULL for aggregate | Calc |
| gross_revenue_inr | numeric(12,2) | Total revenue from delivered orders in this month/launch slice | Calc | `98000.00` | ≥ 0; DEFAULT 0 | Calc |
| net_revenue_inr | numeric(12,2) | Gross minus returns and discounts | Calc | `95200.00` | ≥ 0; DEFAULT 0 | Calc |
| orders_delivered | int | Count of shipments with delivered_at in this month | Calc | `34` | ≥ 0; DEFAULT 0 | Calc |
| units_sold | int | Total units sold (delivered) in this month | Calc | `40` | ≥ 0; DEFAULT 0 | Calc |
| avg_order_value_inr | numeric(10,2) | gross_revenue / orders_delivered | Calc | `2882.35` | ≥ 0; NULL if no deliveries | Calc |
| new_customers | int | First-time buyers delivered in this month | Calc | `22` | ≥ 0; DEFAULT 0 | Calc |
| returning_customers | int | Repeat buyers delivered in this month | Calc | `12` | ≥ 0; DEFAULT 0 | Calc |
| gross_margin_inr | numeric(12,2) | Revenue minus COGS (unit-level, from products table) | Calc | `42140.00` | ≥ 0; DEFAULT 0 | Calc |
| gross_margin_pct | numeric(5,2) | gross_margin_inr / gross_revenue_inr × 100 | Calc | `43.00` | 0–100 | Calc |
| total_shipping_cost_inr | numeric(12,2) | Sum of shipments.freight_total_inr for this period | Calc | `3400.00` | ≥ 0; DEFAULT 0 | Calc |
| total_cod_charges_inr | numeric(12,2) | Sum of shipments.cod_charges_inr for this period | Calc | `1200.00` | ≥ 0; DEFAULT 0 | Calc |
| total_ad_spend_inr | numeric(12,2) | Sum of ad_spend_daily.spend_inr for this month | Calc | `20440.00` | ≥ 0; DEFAULT 0 | Calc |
| total_opex_inr | numeric(12,2) | Sum of expenses.amount_inr for this month | Calc | `2500.00` | ≥ 0; DEFAULT 0 | Calc |
| contribution_margin_inr | numeric(12,2) | gross_margin − shipping − cod_charges − ad_spend | Calc | `17100.00` | May be negative | Calc |
| contribution_margin_pct | numeric(5,2) | contribution_margin_inr / net_revenue_inr × 100 | Calc | `17.96` | May be negative | Calc |
| rto_count | int | RTOs delivered back to warehouse in this month | Calc | `4` | ≥ 0; DEFAULT 0 | Calc |
| rto_rate_pct | numeric(5,2) | rto_count / (orders_delivered + rto_count) × 100 | Calc | `10.53` | 0–100 | Calc |
| return_rate_pct | numeric(5,2) | Returns processed / orders_delivered × 100 | Calc | `2.94` | 0–100 | Calc |
| cod_mix_pct | numeric(5,2) | COD orders / total orders × 100 | Calc | `35.29` | 0–100 | Calc |
| roas | numeric(6,2) | net_revenue_inr / total_ad_spend_inr (NULL if no ad spend) | Calc | `4.66` | ≥ 0; NULL if total_ad_spend = 0 | Calc |
| cash_collected_inr | numeric(12,2) | Actual bank deposits from gateway settlements + COD remittances | Calc | `88400.00` | ≥ 0; DEFAULT 0 | Calc |
| computed_at | timestamptz | When this snapshot was last recomputed | Calc | `2026-06-17T02:00:00Z` | NOT NULL | Calc |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T02:00:00Z` | DEFAULT now() | Auto |

---

### Table: `revenue_forecasts`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc  
Stores LA-WMA model output. One forecast per month per launch. When a new forecast is generated, prior forecasts for the same month/launch are marked `is_current = false`. `actual_revenue_inr` is back-filled from `kpi_monthly_snapshot` once the month closes.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `18` | PK | Auto |
| forecast_month | date | First day of the month being forecast | Calc | `2026-07-01` | NOT NULL | Calc |
| launch_id | int | Which collection is being forecast; NULL = total business | Calc | `3` | FK → launches.id | Calc |
| snapshot_date | date | Date this forecast was generated | Calc | `2026-06-17` | NOT NULL | Calc |
| model_version | text | Forecasting model version identifier | MAN | `la-wma-v1` | NOT NULL; see FORECASTING_MODEL.md | Calc |
| forecast_revenue_inr | numeric(12,2) | Point estimate for total revenue in the forecast month | Calc | `52000.00` | NOT NULL; ≥ 0 | Calc |
| confidence_low_inr | numeric(12,2) | 80% confidence interval lower bound | Calc | `38000.00` | ≥ 0; < forecast_revenue_inr | Calc |
| confidence_high_inr | numeric(12,2) | 80% confidence interval upper bound | Calc | `66000.00` | ≥ forecast_revenue_inr | Calc |
| forecast_orders | int | Estimated number of orders in the forecast month | Calc | `18` | ≥ 0 | Calc |
| forecast_aov_inr | numeric(10,2) | Estimated Average Order Value | Calc | `2889.00` | ≥ 0 | Calc |
| launch_phase_month | int | Months since this collection launched (1 = launch month) | Calc | `6` | ≥ 1 | Calc |
| launch_phase_factor | numeric(4,3) | Decay factor applied — from FORECASTING_MODEL.md §2.2 | Calc | `0.600` | 0.0–1.0; see decay curve table | Calc |
| stock_availability_factor | numeric(4,3) | Stock gate factor (0.0 = sold out, 1.0 = fully stocked) | Calc | `0.700` | 0.0–1.0; see FORECASTING_MODEL.md §2.3 | Calc |
| planned_ad_spend_inr | numeric(12,2) | Operator-provided ad budget for this month (input to model) | MAN | `20000.00` | ≥ 0; DEFAULT 0 | ✓ |
| actual_revenue_inr | numeric(12,2) | Back-filled actual revenue from kpi_monthly_snapshot | Calc | `null` | NULL until month closes; then filled from actuals | Calc |
| forecast_accuracy_pct | numeric(6,2) | 1 − |actual − forecast| / actual × 100 | Calc | `null` | NULL until actual_revenue_inr is filled | Calc |
| input_params | jsonb | Full snapshot of all operator inputs and model parameters | Calc | `{"planned_ad_spend": 20000, "rto_rate": 0.10}` | — | Calc |
| is_current | boolean | False once a newer forecast for this month/launch supersedes this one | Calc | `true` | Only one row per (forecast_month, launch_id) should be true | Calc |
| created_by | int | FK to the user who triggered this forecast run | AUTH | `1` | FK → users.id | Auto |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T09:00:00Z` | DEFAULT now() | Auto |

---

### Table: `cashflow_forecasts`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc  
Monthly cash position projection. Models the timing gap between revenue recognition and cash receipt (settlement lag) and the timing of large outflows (supplier payments, ad spend). One row per month. Historical rows retained with `is_current = false`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `6` | PK | Auto |
| forecast_month | date | Month being projected | Calc | `2026-07-01` | NOT NULL | Calc |
| snapshot_date | date | Date forecast was generated | Calc | `2026-06-17` | NOT NULL | Calc |
| model_version | text | Model version identifier | MAN | `cf-v1` | NOT NULL | Calc |
| opening_balance_inr | numeric(12,2) | Actual or estimated bank balance at start of month | BNK / MAN | `142388.50` | NOT NULL | ✓ |
| expected_prepaid_inflow_inr | numeric(12,2) | Prepaid order settlements expected after T+3 lag | Calc | `38000.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_cod_inflow_inr | numeric(12,2) | COD remittances expected after T+10 lag | Calc | `12000.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_total_inflow_inr | numeric(12,2) | Sum of all expected inflows | Calc | `50000.00` | = prepaid + cod inflows | Calc |
| expected_shipping_cost_inr | numeric(12,2) | Outbound courier costs for expected orders | Calc | `4200.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_ad_spend_inr | numeric(12,2) | Planned ad budget (from operator input) | MAN | `20000.00` | ≥ 0; DEFAULT 0 | ✓ |
| expected_supplier_payment_inr | numeric(12,2) | Scheduled purchase order instalment(s) in this month | MAN | `0.00` | ≥ 0; DEFAULT 0 | ✓ |
| expected_saas_cost_inr | numeric(12,2) | Recurring SaaS subscriptions (Google Workspace ₹1,227/month) | Calc | `1227.20` | ≥ 0; DEFAULT 0 | Calc |
| expected_rto_cost_inr | numeric(12,2) | Two-way freight on estimated RTO shipments | Calc | `960.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_refund_cost_inr | numeric(12,2) | Customer refund outflows in this month | Calc | `3996.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_other_opex_inr | numeric(12,2) | Other operational expenses (Shiprocket recharges, etc.) | Calc | `2000.00` | ≥ 0; DEFAULT 0 | Calc |
| expected_total_outflow_inr | numeric(12,2) | Sum of all expected outflows | Calc | `32383.20` | = sum of all expected_*_inr outflow columns | Calc |
| expected_net_cashflow_inr | numeric(12,2) | expected_total_inflow − expected_total_outflow | Calc | `17616.80` | May be negative (signals cash squeeze) | Calc |
| expected_closing_balance_inr | numeric(12,2) | opening_balance + expected_net_cashflow | Calc | `160005.30` | = opening_balance + expected_net_cashflow | Calc |
| actual_net_cashflow_inr | numeric(12,2) | Back-filled actual net cashflow from bank_transactions | Calc | `null` | NULL until month closes | Calc |
| actual_closing_balance_inr | numeric(12,2) | Actual closing balance from bank statement | BNK | `null` | NULL until month closes | Calc |
| cod_mix_assumption_pct | numeric(5,2) | Assumed COD order % used in lag calculation | MAN | `35.00` | 0–100; default from most recent kpi_monthly_snapshot | ✓ |
| rto_rate_assumption_pct | numeric(5,2) | Assumed RTO rate % used in cost calculation | MAN | `10.00` | 0–100; default from historical average | ✓ |
| prepaid_settlement_lag_days | int | Assumed T+N lag for prepaid settlements | MAN | `3` | ≥ 0; DEFAULT 3 | ✓ |
| cod_settlement_lag_days | int | Assumed T+N lag for COD remittances | MAN | `10` | ≥ 0; DEFAULT 10 | ✓ |
| input_params | jsonb | Full snapshot of all inputs used for this forecast | Calc | `{"opening_balance": 142388.5, "rto_rate": 0.10}` | — | Calc |
| is_current | boolean | False once superseded by a newer forecast for this month | Calc | `true` | Only one row per forecast_month should be true | Calc |
| created_by | int | FK to the user who triggered this forecast | AUTH | `1` | FK → users.id | Auto |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T09:00:00Z` | DEFAULT now() | Auto |

---

### Table: `inventory_forecasts`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc  
Per-variant stock depletion projections. One row per variant per snapshot date. Computes sell-through velocity at 7-day and 30-day windows. `alert_level` drives dashboard inventory alert cards. Historical snapshots are retained with `is_current = false`.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `105` | PK | Auto |
| variant_id | int | Which SKU this projection is for | Calc | `21` | FK → product_variants.id; NOT NULL | Calc |
| snapshot_date | date | Date of this projection | Calc | `2026-06-17` | NOT NULL | Calc |
| current_stock | int | Stock on hand at snapshot time (from inventory_ledger) | Calc | `28` | NOT NULL; ≥ 0 | Calc |
| daily_velocity_30d | numeric(6,3) | Units sold per day averaged over the last 30 days | Calc | `0.933` | ≥ 0; NULL if no sales in last 30 days | Calc |
| daily_velocity_7d | numeric(6,3) | Units sold per day averaged over the last 7 days | Calc | `1.143` | ≥ 0; NULL if no sales in last 7 days | Calc |
| days_to_stockout_30d | int | current_stock / daily_velocity_30d (30-day basis) | Calc | `30` | ≥ 0; NULL if daily_velocity_30d = 0 | Calc |
| days_to_stockout_7d | int | current_stock / daily_velocity_7d (7-day, more reactive) | Calc | `24` | ≥ 0; NULL if daily_velocity_7d = 0 | Calc |
| projected_stockout_date | date | snapshot_date + days_to_stockout_30d | Calc | `2026-07-17` | NULL if days_to_stockout_30d is NULL | Calc |
| alert_level | text | Dashboard alert colour based on days_to_stockout_30d | Calc | `warning` | NOT NULL; IN (`ok`, `watch`, `warning`, `critical`); see thresholds table | Calc |
| reorder_recommended | boolean | True when days_to_stockout_30d < 30 | Calc | `true` | DEFAULT false | Calc |
| units_to_reorder | int | Estimated reorder quantity based on 90-day demand | Calc | `84` | ≥ 0; NULL if not recommended | Calc |
| is_current | boolean | False once superseded by a newer snapshot for this variant | Calc | `true` | Only one row per variant_id should be true | Calc |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T02:00:00Z` | DEFAULT now() | Auto |

---

### Table: `insights`
**Domain:** Intelligence | **Version:** v2 | **Primary source:** Calc / MAN  
AI-generated and rule-based observations about business performance. Written by the AI Analysis layer (detailed in `AI_ANALYST_SPEC.md`). Users can dismiss insights once actioned. `raw_context` preserves the data snapshot used to generate each insight for audit and AI retraining.

| Column | Type | Business Meaning | Source | Example | Validation | Editable |
|--------|------|-----------------|--------|---------|------------|----------|
| id | serial | Surrogate PK | Auto | `74` | PK | Auto |
| insight_date | date | The date the insight is relevant to | Calc | `2026-06-17` | NOT NULL; ≤ today | Calc |
| source | text | Whether this was AI-generated or a deterministic rule alert | Calc | `rule` | NOT NULL; IN (`ai`, `rule`) | Calc |
| category | text | Business area this insight relates to | Calc | `inventory` | NOT NULL; IN (`revenue`, `inventory`, `cashflow`, `marketing`, `operations`, `forecast`) | Calc |
| severity | text | Urgency level for dashboard surfacing priority | Calc | `warning` | NOT NULL; IN (`opportunity`, `info`, `warning`, `alert`) | Calc |
| title | text | Short headline (max 80 characters) | Calc | `COR-LEG-M: 24 days to stockout` | NOT NULL; max 80 chars | Calc |
| body | text | Full narrative explanation of the insight | Calc | `At current 7-day velocity of 1.1 units/day, Core Leggings M will exhaust stock by ~July 11. Reorder window is now.` | NOT NULL | Calc |
| metric_name | text | KPI this insight relates to | Calc | `days_to_stockout` | — | Calc |
| metric_value | numeric(12,2) | Current observed value of the metric | Calc | `24.00` | — | Calc |
| metric_benchmark | numeric(12,2) | Historical average or target threshold | Calc | `60.00` | — | Calc |
| metric_delta_pct | numeric(7,2) | % deviation from benchmark (negative = below target) | Calc | `-60.00` | — | Calc |
| linked_launch_id | int | If insight is specific to a launch/collection | Calc | `3` | FK → launches.id; NULL for cross-collection | Calc |
| linked_variant_id | int | If insight is specific to a SKU/variant | Calc | `21` | FK → product_variants.id; NULL for broader insights | Calc |
| linked_campaign_id | int | If insight relates to a specific ad campaign | Calc | `null` | FK → ad_campaigns.id; NULL for non-marketing | Calc |
| is_dismissed | boolean | Whether the insight has been dismissed by a user | MAN | `false` | DEFAULT false | ✓ |
| dismissed_by | int | FK to the user who dismissed this insight | AUTH | `null` | FK → users.id; NULL until dismissed | ✓ |
| dismissed_at | timestamptz | When the insight was dismissed | MAN | `null` | NULL until dismissed; must be ≥ created_at | Auto |
| model_version | text | AI model version or rule set version that generated this | Calc | `rule-v1` | — | Calc |
| raw_context | jsonb | Full data snapshot used to generate this insight (audit trail) | Calc | `{"variant_id": 21, "current_stock": 28, "velocity_7d": 1.143}` | — | Calc |
| created_at | timestamptz | Row creation timestamp | Auto | `2026-06-17T02:00:00Z` | DEFAULT now() | Auto |

---

## Part 2: Reference Data

---

## 1. SKU Taxonomy

SKUs follow the pattern: `[COLLECTION]-[TYPE]-[SIZE]`

### Canonical SKU Map

| Canonical SKU | Collection | Type | Size | WooCommerce product_id | Shiprocket Channel SKU (observed) |
|--------------|-----------|------|------|------------------------|----------------------------------|
| CL1-LEG-S | Classic (L1) | Leggings | S | — | — |
| CL1-LEG-M | Classic (L1) | Leggings | M | — | BCLM01 |
| CL1-LEG-L | Classic (L1) | Leggings | L | — | — |
| CL1-BRA-S | Classic (L1) | Sports Bra | S | — | — |
| CL1-BRA-M | Classic (L1) | Sports Bra | M | — | BCSBM01 |
| CL1-BRA-L | Classic (L1) | Sports Bra | L | — | — |
| SUM-LEG-S | Summer (L2) | Leggings | S | — | — |
| SUM-LEG-M | Summer (L2) | Leggings | M | — | — |
| SUM-LEG-L | Summer (L2) | Leggings | L | — | — |
| SUM-LEG-XL | Summer (L2) | Leggings | XL | — | — |
| SUM-BRA-S | Summer (L2) | Sports Bra | S | — | — |
| SUM-BRA-M | Summer (L2) | Sports Bra | M | — | — |
| SUM-BRA-L | Summer (L2) | Sports Bra | L | — | — |
| SUM-BRA-XL | Summer (L2) | Sports Bra | XL | — | — |
| CL2-LEG-S | Classic Leggings 2 (L2) | Leggings | S | — | — |
| CL2-LEG-M | Classic Leggings 2 (L2) | Leggings | M | — | — |
| CL2-LEG-XL | Classic Leggings 2 (L2) | Leggings | XL | — | — |
| COR-LEG-XS | Core (L3) | Leggings | XS | — | — |
| COR-LEG-S | Core (L3) | Leggings | S | — | — |
| COR-LEG-M | Core (L3) | Leggings | M | — | SLP-M-1 |
| COR-LEG-L | Core (L3) | Leggings | L | — | — |
| COR-LEG-XL | Core (L3) | Leggings | XL | — | — |
| COR-BRA-XS | Core (L3) | Sports Bra | XS | — | — |
| COR-BRA-S | Core (L3) | Sports Bra | S | — | — |
| COR-BRA-M | Core (L3) | Sports Bra | M | — | SBP-M-1 |
| COR-BRA-L | Core (L3) | Sports Bra | L | — | SBP-L-1 |
| COR-BRA-XL | Core (L3) | Sports Bra | XL | — | — |
| COR-SET-L | Core Set (L3) | Bundle | L | — | SBLP-L-1 |

**SKU decode pattern:** `BCLM01` = Brand Classic Legging Medium batch 01. `SLP-M-1` = Summer Legging Pink Medium variant 1. WooCommerce product IDs must be extracted from WooCommerce at import time (not available in offline exports).

---

## 2. Product Types

| Code | Meaning | Inventory Behaviour |
|------|---------|-------------------|
| `leggings` | Yoga/activewear legging (individual piece) | Has independent stock; one unit per order line |
| `sports_bra` | Sports bra (individual piece) | Has independent stock; one unit per order line |
| `set` | Leggings + Sports Bra bundle (virtual product) | No independent stock; consumes 1 legging + 1 bra variant per sale (BR-INV-01) |

---

## 3. Launch Codes

| Code | Name | Status | Live Date | Investment |
|------|------|--------|-----------|-----------|
| L1 | Classic | Depleted / clearing | Oct 2023 | ₹6,43,500 |
| L2 | Summer + Classic Restock | Active | May 2025 | ₹10,37,760 |
| L3 | Core | Active | Jan 2026 | ₹5,05,000 |
| L4 | Core Flare | Planned | Jun 2026 | ~₹5,00,000 est. |

---

## 4. Order Statuses

### WooCommerce `orders.status`
| Value | Meaning |
|-------|---------|
| `processing` | Payment received; not yet fulfilled by Shiprocket |
| `completed` | Fulfilled and delivered; revenue recognisable |
| `cancelled` | Cancelled before dispatch |
| `refunded` | Full refund issued |
| `on-hold` | Payment pending confirmation |
| `failed` | Payment attempt failed |

### Shiprocket `shipments.status`
| Value | Meaning |
|-------|---------|
| `DELIVERED` | Successfully delivered to customer (BR-REV-01: revenue recognised here) |
| `RTO_DELIVERED` | Return to Origin — goods returned to warehouse; zero revenue |
| `IN_TRANSIT` | En route to customer |
| `OUT_FOR_DELIVERY` | Last-mile delivery in progress |
| `CANCELLED` | Shipment cancelled before dispatch |
| `PICKUP_SCHEDULED` | Pickup request raised with courier |
| `PICKED_UP` | Courier has collected from warehouse |
| `NDR` | Non-Delivery Report raised (failed delivery attempt) |

---

## 5. Payment Methods

| Normalised Value | Raw WooCommerce Title | Gateway | Settlement Path |
|-----------------|-----------------------|---------|----------------|
| `gokwik_prepaid` | Gokwik (prepaid) | Gokwik → EaseBuzz or Infibeam | Via EaseBuzz escrow (YESB) or Infibeam nodal (ICICI); T+2 to T+3 lag |
| `gokwik_cod` | Gokwik (COD) | Gokwik → Shiprocket COD | Via Shiprocket CRF remittance; T+7 to T+14 lag |
| `cod` | Cash on Delivery | Direct COD | Via Shiprocket CRF remittance |
| `easebuzz` | EaseBuzz | EaseBuzz | YESB escrow settlements; T+2 to T+3 lag |
| `infibeam` | Infibeam / CCAvenue | Infibeam | ICICI nodal settlements; T+2 to T+3 lag |

---

## 6. Shipping Zones (Shiprocket)

| Zone Code | Coverage | Indicative Freight Range |
|-----------|----------|--------------------------|
| `z_a` | Local (same city as warehouse) | Lowest (~₹60–80) |
| `z_b` | Regional (nearby cities, same state) | Low (~₹80–110) |
| `z_c` | Metro to Metro (cross-state) | Medium (~₹98–150) |
| `z_d` | Cross-zone (distant regions) | High (~₹160–300) |
| `z_e` | Remote / hilly / difficult terrain | Highest (₹300+) |

Warehouse location: Amboli, Andheri West, Mumbai 400058.

---

## 7. Courier Companies

| Name in Shiprocket export | Normalised Name | Notes |
|---------------------------|-----------------|-------|
| `Delhivery Air` | Delhivery | Air mode, faster |
| `Delhivery Surface` | Delhivery | Surface mode, cheaper |
| `Blue Dart Surface` | Blue Dart | Premium surface; better for heavy items |
| `Amazon Prepaid Surface 500g` | Amazon Logistics | Prepaid shipments only |
| `Amazon COD Surface 500gm` | Amazon Logistics | COD enabled |

---

## 8. Bank Transaction Types

| transaction_type | Direction | Description | Narration Pattern |
|-----------------|-----------|-------------|------------------|
| `gateway_settlement` | IN | EaseBuzz or Infibeam batch remittance | Contains `EASEBUZZ`, `YESF`, `INFIBEAM`, or `IN226` |
| `cod_remittance` | IN | Shiprocket COD collection payout | Contains `SHIPROCKET` + CRF numeric ID |
| `founder_transfer` | IN / OUT | Personal fund injection or withdrawal by Kanika Rodrigues | Contains `KANIKA` or known personal account reference |
| `shiprocket_recharge` | OUT | Shiprocket prepaid wallet top-up | Contains `BIGFOOT RETAIL SOLUTIONS` |
| `courier_payment` | OUT | Direct Delhivery or Amazon payment | Contains `DELHIVERY` or `AMAZON` (non-ad) |
| `ad_spend_meta` | OUT | Meta/Facebook Ads wallet funding | Contains `FACEBOOK` or `META` |
| `ad_spend_google` | OUT | Google Ads payments | Contains `GOOGLE` |
| `customer_refund` | OUT | Direct refund to customer bank account | Contains `REFUND` + customer name pattern |
| `supplier_payment` | OUT | PayPal USD payment to supplier | Contains `PAYPAL` |
| `saas_subscription` | OUT | Google Workspace (₹1,227.20/month; debited 3rd of month) | Contains `GOOGLE WORKSPACE` or `GOOGLE LLC` |
| `bank_charge` | OUT | DC international transaction fee, NEFT charges | Contains `CHARGES` or `FEE` |
| `unclassified` | — | No pattern matched; requires manual review | — |

---

## 9. COD CRF ID

**CRF = Cash Remittance File.** Each COD remittance batch from Shiprocket is assigned a CRF ID (numeric string, typically 8 digits). The CRF ID is the join key between Shiprocket data and HDFC bank credits.

It appears in:
- Shiprocket export column: `CRF ID` → stored in `shipments.cod_crf_id`
- HDFC bank narration: e.g. `SHIPROCKET COD CRF ID 12269675` → extracted into `bank_transactions.extracted_reference`

Example CRF ID: `12269675`

---

## 10. Gateway Settlement Reference Keys

| Gateway | Settlement Reference Format | Example | Bank Narration Pattern |
|---------|-----------------------------|---------|----------------------|
| EaseBuzz | YESF reference (YESB escrow) | `YESF260475119837` | `NEFT CR-YESB0000001-EASEBUZZ PVT LTD PA ESCROW A/C-KIRGO-YESF260475119837` |
| Infibeam / CCAvenue | IN reference (ICICI nodal) | `IN22612345678901` | `NEFT CR-ICIC0000001-INFIBEAM AVENUES LTD-KIRGO-IN22612345678901` |
| Shiprocket COD | CRF ID (numeric) | `12269675` | `SHIPROCKET COD CRF ID 12269675` |

YESF format decode: `YESF` + `YY` (year) + `DDD` (day of year) + sequence number.

---

## 11. Supplier Details

| Supplier | Launch | Country | Payment Method | Bank / SWIFT |
|---------|--------|---------|---------------|--------------|
| ASTSW (full name unknown) | L1 Classic | China | Unknown | — |
| Shanghai Jspeed Industry Co., Ltd | L2 Summer + Restock | Shanghai, China | SWIFT | Zhejiang Chouzhou Commercial Bank; SWIFT: CZCBCN2X |
| Burning Active Apparel Co., Ltd (via Shenzhen Merrycoo) | L3 Core | Guangzhou, China | PayPal | @songlu481 |

---

## 12. Advertising Accounts

| Platform | Account / ID | Account Name | Owner |
|----------|-------------|-------------|-------|
| Google Ads | 736-944-6064 | Kirgo Store | Siddharth Bajpai |
| Google Payments | 6826-1049-1408-1495 | Siddharth Bajpai | Siddharth Bajpai |
| Meta Ads | 729422043560314 | Kirgo Ad account | — |

---

## 13. Operational Platform Accounts

| Platform | Login | Notes |
|----------|-------|-------|
| WooCommerce | `doriame` | kirgostore.com/wp-admin |
| Shiprocket | +91 9819798663 (OTP-based) | app.shiprocket.in |
| Gokwik | kanika@doriame.com | dashboard.gokwik.co |

**CRITICAL:** Platform credentials exist in the source Excel (`Credentials` sheet). These must NOT be stored in the application database or committed to git. Use environment variables / Supabase Vault exclusively.

---

## 14. Expense Category Seed Values

| code | name | category_group | applies_to | Description |
|------|------|---------------|-----------|-------------|
| `manufacturing` | Manufacturing | capex | launch | Supplier manufacturing payments and deposits |
| `sample` | Sampling | capex | launch | Fabric samples, prototype units |
| `shoot` | Shoot & Creative | capex | launch | Photographer, MUA, lighting, studio rental |
| `packaging` | Packaging | capex | both | Custom boxes, labels, hang tags, poly bags |
| `website` | Website & Tech | capex | launch | Domain renewal, redesign, WooCommerce plugins |
| `logistics_inbound` | Inbound Logistics | capex | launch | DHL/FedEx to India, customs duty, shipping tax |
| `legal` | Legal & Compliance | capex | launch | Trademark registration, filing fees |
| `founder_credit` | Founder Capital | financing | launch | Capital injection from Kanika Rodrigues |
| `shipping_outbound` | Outbound Shipping | cogs | operations | Shiprocket courier charges for outbound orders |
| `shipping_inbound` | Inbound Returns Shipping | cogs | operations | Return / reverse logistics costs |
| `ad_spend` | Advertising | marketing | both | Google Ads, Meta Ads spend |
| `platform_saas` | Platform & SaaS | opex | operations | Google Workspace, Gokwik platform fee |
| `customer_refund` | Customer Refunds | opex | operations | Direct customer refund outflows |
| `bank_charges` | Bank & FX Charges | opex | operations | HDFC DC charges, NEFT fees, FX conversion costs |
| `misc` | Miscellaneous | opex | both | Travel, food during shoot, incidentals |

---

## Appendix A: Source-to-Table Mapping Matrix

| Source File / Sheet | Tables Populated | Key Columns Used |
|--------------------|-----------------|-----------------|
| `Kirgo Numbers.xlsx` → `ProductionSKU` | products, product_variants, inventory_batches | SKU, size, opening qty, selling price, COGS |
| `Kirgo Numbers.xlsx` → `Woocom - Orders` | customers, orders, order_lines | order_id, email, status, totals, line item columns 1–4 |
| `Kirgo Numbers.xlsx` → `SR - 2023` | shipments | All 118 Shiprocket columns; 62 rows |
| `Kirgo Numbers.xlsx` → `SR - 2024` | shipments | All 118 Shiprocket columns; 571 rows |
| `Kirgo Numbers.xlsx` → `SR - 2025` | shipments | All 118 Shiprocket columns; 250 rows |
| `Kirgo Numbers.xlsx` → `SR - 2026` | shipments | All 118 Shiprocket columns; 216 rows |
| `Kirgo Numbers.xlsx` → `Returns - 2023` | returns | Shiprocket + returns columns |
| `Kirgo Numbers.xlsx` → `Returns - 2024` | returns | Shiprocket + returns columns |
| `Kirgo Numbers.xlsx` → `Returns - 2025` | returns | Shiprocket + returns columns |
| `Kirgo Numbers.xlsx` → `Returns 2025-2026` | returns | 57 rows; 121 columns |
| `Kirgo Numbers.xlsx` → `2026` | bank_transactions | Date, Narration, Ref, Withdrawal, Deposit, Balance |
| `Kirgo Numbers.xlsx` → `Monthly Revenue` | *(validation only — do NOT use as data source; BR-DQ-03)* | — |
| `Expenses e537ebe9a6c3459aac82fa94dfdb26ff.csv` (L1) | launch_expenses | Expense, Amount, Category, Date, Status |
| `KIRGO LAUNCH 2 SPENDS.md` | launch_expenses | Markdown table: expense rows for L2 |
| `KIRGO LAUNCH 3 SPENDS.md` | launch_expenses | Markdown table: expense rows for L3 |
| `Kirgo Summer + Classic Restock Invoice.pdf` (L2) | purchase_orders, purchase_order_lines | Invoice JSKS-240801; $6,120 USD |
| `Kirgo Core - Invoice.pdf` (L3) | purchase_orders, purchase_order_lines | Invoice BURN-251006; $4,228.60 USD |
| `Kirgo Classic - Invoice.jpg` (L1) | purchase_orders | L1 PO reference only — OCR required; no PO lines |
| `Kirgo Flare - Invoice.xls` (L4) | *(blocked — .xls format requires xlrd; L4 not yet confirmed)* | — |
| Google Ads PDF — May 2026 | ad_campaigns, ad_spend_daily | Campaign: Sid-PMAX-15May, Kirgo Test 1; invoice 5594350843 |
| Google Ads PDF — Apr 2026 | ad_spend_daily | ₹5,000 payment only; no campaign breakdown |
| Meta Ads receipt — May 2026 | ad_campaigns, ad_spend_daily | ₹10,000 funded 12 May; account 729422043560314 |

---

## Appendix B: Import Dependency Order

The following sequence must be followed to satisfy foreign key constraints. Never import a table before all tables it depends on are fully imported and validated.

```
Step  1  expense_categories    (no dependencies — seed before all expense tables)
Step  2  roles                 (no dependencies — seed before users)
Step  3  launches              (no dependencies)
Step  4  products              (depends on: launches)
Step  5  product_variants      (depends on: products)
Step  6  purchase_orders       (depends on: launches)
Step  7  purchase_order_lines  (depends on: purchase_orders, product_variants)
Step  8  inventory_batches     (depends on: product_variants, purchase_orders, launches)
Step  9  launch_expenses       (depends on: launches, expense_categories)
Step 10  customers             (no dependencies)
Step 11  orders                (depends on: customers)
Step 12  order_lines           (depends on: orders, product_variants)
Step 13  shipments             (depends on: orders, product_variants)
Step 14  returns               (depends on: shipments)
Step 15  bank_transactions     (no dependencies)
Step 16  gateway_settlements   (depends on: bank_transactions)
Step 17  ad_campaigns          (no dependencies)
Step 18  ad_spend_daily        (depends on: ad_campaigns)
Step 19  expenses              (depends on: expense_categories, bank_transactions, launches, ad_campaigns)
Step 20  inventory_ledger      (depends on: inventory_batches, product_variants, shipments, returns)
Step 21  users                 (depends on: roles; requires Supabase auth.users to exist)
```

**Post-import computed tables (populated by the application layer, not direct import):**
- `kpi_daily_snapshot` — computed from orders, shipments, returns, bank_transactions, ad_spend_daily
- `kpi_monthly_snapshot` — computed from kpi_daily_snapshot + products (for margins)
- `revenue_forecasts` — computed from kpi_monthly_snapshot + product_variants (stock)
- `cashflow_forecasts` — computed from revenue_forecasts + bank_transactions + expenses
- `inventory_forecasts` — computed from inventory_ledger + product_variants
- `insights` — generated by AI/rule engine from all other tables

---

## Appendix C: Data Quality Checks

The following checks should be run after each data import and before any forecast or KPI computation.

### C1. Referential Integrity

| Check | Query Logic | Expected Result |
|-------|-------------|----------------|
| All order_lines have a valid order_id | order_lines.order_id must exist in orders | 0 orphan rows |
| All order_lines have a resolved variant_id | order_lines.variant_id NOT NULL | 0 unresolved SKUs before go-live |
| All shipments have a valid order_id | shipments.order_id must exist in orders | 0 orphan rows (CUSTOM channel creates stub orders) |
| All returns have a valid shipment_id | returns.shipment_id must exist in shipments | 0 orphan rows |
| All launch_expenses have a valid category_id | launch_expenses.category_id must exist in expense_categories | 0 orphan rows |

### C2. WooCommerce Order Count

| Check | Expected |
|-------|---------|
| Total rows in orders | 917 |
| Sum of order_lines rows | ≥ 917 (most orders have ≥ 1 line) |
| Orders with no order_lines | Must be 0 before go-live |
| Duplicate woocommerce_order_id | Must be 0 |

### C3. Shiprocket De-duplication

| Check | Logic | Expected |
|-------|-------|---------|
| Total shipments rows | Sum of all 4 SR sheets | ~1,099 |
| Distinct shiprocket_order_id count | Less than row count | < 1,099 (multi-item orders inflate row count) |
| AWB uniqueness | COUNT(awb_code) = COUNT(DISTINCT awb_code) | 0 duplicates |
| Rows with NULL awb_code | Shipments without AWB | Flag for review; valid for cancelled before pickup |

### C4. Inventory Non-Negative

| Check | Logic | Expected |
|-------|-------|---------|
| Running stock per variant | SUM(inventory_ledger.quantity_delta) GROUP BY variant_id | ≥ 0 for all variants at all points in time |
| Negative stock at any point | Run ledger in order_id sequence | Must be 0; negative signals a data sequencing error |

### C5. Date Sequence Validation

| Check | Rule |
|-------|------|
| Shipment dates | picked_up_at ≤ shipped_at ≤ delivered_at (if delivered) |
| RTO dates | rto_initiated_at ≤ rto_delivered_at; both must be ≥ shipped_at |
| Order dates | ordered_at ≤ picked_up_at (for associated shipments) |
| Return dates | returned_at ≥ shipments.shipped_at for the forward shipment |

### C6. Bank Balance Continuity

| Check | Rule |
|-------|------|
| Closing balance continuity | For each bank row: closing_balance = prior_closing_balance + deposit_inr − withdrawal_inr |
| Tolerance | Allow ±₹1 for rounding |
| Opening balance Jan 2026 | Must match known HDFC opening balance |

### C7. Revenue Reconciliation

| Check | Rule |
|-------|------|
| WC order totals | orders.order_total_inr ≈ SUM(order_lines.line_total_inr) + shipping_charged − discount |
| Tolerance | ±₹1 per order |
| Monthly Revenue sheet | Do NOT use as reconciliation source (BR-DQ-03 — known errors: Apr 2025 shows 15 orders with ₹0 revenue) |
| Shiprocket vs WC revenue | Compare shiprocket order_total_inr (de-duped by shiprocket_order_id) vs WC order totals for same period; expect minor differences |

### C8. COGS Consistency

| Check | Rule |
|-------|------|
| products.cogs_total_inr | Must equal cogs_manufacture + cogs_shoot_import + cogs_shipping_pkg |
| products.gross_margin_inr | Must equal selling_price − cogs_total |
| products.gross_margin_pct | Must equal gross_margin_inr / selling_price × 100 |
| Bundle COGS | For `is_bundle = true`: cogs_total = component_legging.cogs_total + component_bra.cogs_total + 75 (packaging offset; BR-GM-03) |

### C9. Forecast State

| Check | Rule |
|-------|------|
| revenue_forecasts is_current uniqueness | Only one row per (forecast_month, launch_id) should have is_current = true |
| cashflow_forecasts is_current uniqueness | Only one row per forecast_month should have is_current = true |
| inventory_forecasts is_current uniqueness | Only one row per variant_id should have is_current = true |

### C10. COD Reconciliation

| Check | Rule |
|-------|------|
| CRF ID match | Every shipments.cod_crf_id that has a cod_remittance_date should have a matching bank_transactions.extracted_reference |
| Unmatched CRF IDs | Flag for manual review — likely a statement period boundary issue |
| COD remittance amounts | SUM(shipments.remitted_inr WHERE cod_crf_id = X) ≈ bank_transactions.deposit_inr for the matched CRF row |

---

## Appendix D: Required Indexes

All indexes are advisory — no SQL is generated here. The implementation phase will create these as part of the Supabase migration.

### D1. Core Transaction Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| orders | woocommerce_order_id | UNIQUE | Import dedup; join from Shiprocket |
| orders | ordered_at | B-Tree | Time-range revenue queries |
| orders | customer_id | B-Tree | Customer order history |
| order_lines | order_id | B-Tree | Join from orders |
| order_lines | variant_id | B-Tree | Sales by SKU |
| order_lines | (order_id, variant_id) | Composite B-Tree | Order detail page |

### D2. Shipment Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| shipments | awb_code | UNIQUE | Dedup; AWB lookup |
| shipments | shiprocket_order_id | B-Tree | Multi-item grouping; WC join |
| shipments | delivered_at | B-Tree | Revenue timing; daily snapshot computation |
| shipments | status | B-Tree | Filtering DELIVERED vs RTO |
| shipments | cod_crf_id | B-Tree | COD reconciliation join |
| shipments | (variant_id, delivered_at) | Composite | SKU velocity queries |
| returns | shipment_id | B-Tree | Join from shipments |

### D3. Financial Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| bank_transactions | transaction_date | B-Tree | Date-range cashflow queries |
| bank_transactions | extracted_reference | B-Tree | Settlement matching |
| bank_transactions | transaction_type | B-Tree | Filter by payment type |
| gateway_settlements | settlement_reference | UNIQUE | Settlement dedup |
| gateway_settlements | bank_transaction_id | B-Tree | Reverse join |
| purchase_order_lines | purchase_order_id | B-Tree | PO detail |
| launch_expenses | launch_id | B-Tree | Cost rollup per launch |
| launch_expenses | category_id | B-Tree | P&L grouping |
| expenses | expense_date | B-Tree | Monthly P&L queries |
| expenses | category_id | B-Tree | P&L grouping |

### D4. Product Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| product_variants | sku | UNIQUE | Canonical SKU lookup |
| product_variants | product_id | B-Tree | All variants for a product |
| inventory_ledger | variant_id | B-Tree | Running stock per SKU |
| inventory_ledger | (variant_id, occurred_at) | Composite B-Tree | Time-ordered stock history |
| inventory_batches | variant_id | B-Tree | Batch lookup per SKU |

### D5. Marketing Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| ad_spend_daily | (campaign_id, spend_date) | Composite B-Tree | ROAS computation; date range |
| ad_spend_daily | spend_date | B-Tree | Cross-campaign daily totals |

### D6. Intelligence Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| kpi_daily_snapshot | snapshot_date | UNIQUE | Dashboard date lookup |
| kpi_monthly_snapshot | (snapshot_month, launch_id) | Composite UNIQUE | Per-launch monthly P&L |
| kpi_monthly_snapshot | snapshot_month | B-Tree | All-months aggregate lookup; partial index for NULL launch_id |
| revenue_forecasts | (forecast_month, launch_id, is_current) | Composite B-Tree | Active forecast lookup |
| cashflow_forecasts | (forecast_month, is_current) | Composite B-Tree | Active cashflow forecast |
| inventory_forecasts | (variant_id, is_current) | Composite B-Tree | Latest per-variant projection |
| inventory_forecasts | alert_level | B-Tree | Dashboard alert filter |
| insights | (insight_date, severity) | Composite B-Tree | Dashboard priority sort |
| insights | (is_dismissed, category) | Composite B-Tree | Active insight filter |

### D7. Access Control Indexes

| Table | Column(s) | Index Type | Purpose |
|-------|-----------|-----------|---------|
| users | auth_user_id | UNIQUE | Supabase auth bridge |
| users | email | UNIQUE | Login lookup |
| roles | code | UNIQUE | Role lookup by slug |

---

## Appendix E: Missing Data Fields

The following data fields are not currently captured in the source files and should be prioritised for collection once the Control Tower is live. Each is categorised by impact.

### E1. High Impact — Needed for Core KPIs

| Field | Where it belongs | Why it's missing | Impact if absent |
|-------|-----------------|-----------------|-----------------|
| WooCommerce variation product IDs | product_variants.woocommerce_product_id | Not reliably in offline CSV export; must be extracted from WooCommerce API | Cannot auto-resolve SKUs from WC orders without manual mapping |
| Meta Ads campaign-level spend breakdown | ad_spend_daily | Meta receipt only shows total funding event; no campaign detail | ROAS calculation is blended across all Meta campaigns; cannot optimise by campaign |
| UTM attribution completeness | orders.attribution_source | Many WooCommerce orders arrive without UTM parameters (direct, organic) | CAC and ROAS attributable to only ~30% of orders |
| Actual RTO rate by zone/courier/payment_method | Computed from shipments | Currently NULL because historical shipment data has no status fill-back | Cannot calibrate cashflow forecast RTO assumption |
| Gateway fee per transaction | gateway_settlements (new column) | EaseBuzz and Infibeam settlement reports not available — estimated at 2% | Contribution margin is understated; need actual fee to compute net revenue precisely |

### E2. Medium Impact — Needed for AI Analysis and Forecasting

| Field | Where it belongs | Why it's missing | Impact if absent |
|-------|-----------------|-----------------|-----------------|
| Customer city tier (Tier 1/2/3) | customers (new column `city_tier`) | No city tier classification data loaded | Cannot segment RTO risk and CAC by market tier |
| Structured return reason taxonomy | returns.return_reason (currently free text) | Shiprocket exports free text; no dropdown enforced | Cannot cluster returns by root cause; AI analysis relies on unstructured text |
| NDR reason taxonomy | shipments.latest_ndr_reason (currently free text) | Shiprocket exports free text | Cannot analyse which NDR reasons lead to RTO vs successful re-delivery |
| Repeat purchase timing (cohort) | customers (new columns: `second_order_at`, `cohort_month`) | Not captured; total_orders is a count only | Cannot measure retention or compute LTV accurately |
| Discount code usage | order_lines (new column `discount_code`) | WooCommerce has this field but it may not be in the CSV export | Cannot attribute revenue impact to specific promo codes |

### E3. Lower Impact — Operational Improvements

| Field | Where it belongs | Why it's missing | Impact if absent |
|-------|-----------------|-----------------|-----------------|
| Shiprocket wallet balance history | expenses (supplementary) | No API or export for wallet balance history | Cannot model precise cash outflow timing for Shiprocket recharges |
| Google Ads daily impression/click breakdown | ad_spend_daily | PDFs only have invoice totals; API access not established | Cannot compute true daily CPC; workaround is uniform distribution |
| Supplier lead time (PO to goods received) | purchase_orders (new column `lead_time_days`) | Not tracked; estimated manually | Cannot model L4 inventory availability timing |
| Warehousing / storage cost | expenses.expense_categories | Warehouse is currently home-based (no explicit cost) | COGS is understated vs a commercial warehouse scenario |
| FX rate at time of each supplier payment | purchase_orders.fx_rate_inr | Must be captured at time of SWIFT/PayPal payment | INR COGS calculations may be off by ±5% for USD-invoiced POs |
| Product page views / add-to-cart rates | (new table: `web_analytics_daily`) | No GA4 or Pixel data integrated | Cannot compute conversion funnel or landing page effectiveness |
| COD confirmation call outcome | shipments (new column `cod_confirmation_status`) | Shiprocket exports NDR reason but not the confirmation call result | Cannot distinguish between genuine undelivered vs address issue vs fraud |
| Google Analytics session data | (new table: `sessions_daily`) | Not integrated | Cannot correlate ad spend to site traffic to conversion rate |
