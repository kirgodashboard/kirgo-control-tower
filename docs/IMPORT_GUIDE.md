# Kirgo Control Tower — Import Guide
**Phase:** Blueprint  
**Purpose:** Exact field mappings, transformation rules, and import order for seeding the database from existing source files

---

## Import Order (dependency sequence)

```
1. launches           (no dependencies)
2. products           (depends on: launches)
3. product_variants   (depends on: products)
4. inventory_batches  (depends on: product_variants, purchase_orders)
5. purchase_orders    (depends on: launches)
6. purchase_order_lines (depends on: purchase_orders, product_variants)
7. launch_expenses    (depends on: launches)
8. customers          (no dependencies)
9. orders             (depends on: customers)
10. order_lines       (depends on: orders, product_variants)
11. shipments         (depends on: orders, product_variants)
12. returns           (depends on: shipments)
13. bank_transactions (no dependencies)
14. gateway_settlements (depends on: bank_transactions)
15. ad_campaigns      (no dependencies)
16. ad_spend_daily    (depends on: ad_campaigns)
17. inventory_ledger  (depends on: inventory_batches, shipments, returns)
```

---

## Source File Registry

| File | Location | Tables Populated |
|------|----------|-----------------|
| `Kirgo Numbers.xlsx` → `ProductionSKU` | Downloads | products, product_variants, inventory_batches |
| `Kirgo Numbers.xlsx` → `Woocom - Orders` | Downloads | customers, orders, order_lines |
| `Kirgo Numbers.xlsx` → `SR - 2023/2024/2025/2026` | Downloads | shipments |
| `Kirgo Numbers.xlsx` → `Returns - 2023/2024/2025`, `Returns 2025-2026` | Downloads | returns |
| `Kirgo Numbers.xlsx` → `2026` (HDFC bank statement) | Downloads | bank_transactions |
| `KIRGO LAUNCH 1 SPENDS (Classic)/Expenses.csv` | Downloads/zip | launch_expenses (L1) |
| `KIRGO LAUNCH 2 SPENDS.md` | Downloads/zip | launch_expenses (L2) |
| `KIRGO LAUNCH 3 SPENDS.md` | Downloads/zip | launch_expenses (L3) |
| `Kirgo Summer + Classic Restock Invoice.pdf` | Downloads/zip | purchase_orders, purchase_order_lines (L2) |
| `Kirgo Core - Invoice.pdf` | Downloads/zip | purchase_orders, purchase_order_lines (L3) |
| `Kirgo Classic - Invoice.jpg` | Downloads/zip | purchase_orders (L1) — OCR required |
| `Google Ads PDFs (May 2026, Apr 2026)` | Downloads/zip | ad_campaigns, ad_spend_daily |
| `Meta Ads receipt (May 2026)` | Downloads/zip | ad_campaigns, ad_spend_daily |

---

## 1. WooCommerce Orders Import

**Source:** `Woocom - Orders` sheet (917 rows, 93 columns)

### Field Mapping

| Source Column | Target Table.Column | Transformation |
|--------------|---------------------|---------------|
| `order_id` | orders.woocommerce_order_id | Direct |
| `order_number` | orders.woocommerce_order_number | Direct |
| `order_date` | orders.ordered_at | Parse datetime |
| `paid_date` | orders.paid_at | Parse datetime |
| `status` | orders.status | Lowercase, map `wc-completed` → `completed` |
| `order_total` | orders.order_total_inr | Strip ₹ if present, cast numeric |
| `order_subtotal` | orders.subtotal_inr | |
| `order_discount` | orders.discount_inr | Absolute value |
| `shipping_total` | orders.shipping_charged_inr | |
| `payment_method` | orders.payment_method | Normalise per DATA_DICTIONARY §5 |
| `payment_method_title` | orders.payment_method_title | Direct |
| `transaction_id` | orders.transaction_id | Direct |
| `customer_email` | customers.email | Lowercase, trim |
| `billing_first_name` | customers.first_name | |
| `billing_last_name` | customers.last_name | |
| `billing_phone` | customers.phone | Strip +91, spaces, dashes → 10 digits |
| `billing_city` | orders.billing_city | |
| `billing_state` | orders.billing_state | |
| `billing_postcode` | orders.billing_pincode | |
| `meta:_wc_order_attribution_utm_source` | orders.attribution_source | |
| `meta:_wc_order_attribution_referrer` | orders.attribution_medium | |
| `meta:_wc_order_attribution_device_type` | orders.attribution_device | Lowercase |
| `Product Item 1 SKU` | order_lines.sku_raw | |
| `Product Item 1 Name` | order_lines.product_name_raw | |
| `Product Item 1 Quantity` | order_lines.quantity | Cast int |
| `Product Item 1 Total` | order_lines.line_total_inr | Cast numeric |
| `Product Item 1 Subtotal` | order_lines.line_subtotal_inr | |
| *(repeat for items 2, 3, 4)* | *(same pattern)* | Normalise into rows |

### Transformations Required
1. **Customer dedup:** Match on `email`. If exists, update `total_orders` and `total_revenue_inr`. If new, insert and set `first_order_at = ordered_at`.
2. **Line item normalisation:** Columns `Product Item 1...4` must be unpivoted into separate `order_lines` rows. Skip if `Product Item N SKU` is NULL.
3. **SKU resolution:** Map `sku_raw` to `product_variants.id` using the canonical SKU map in `DATA_DICTIONARY.md §1`. Log unresolved SKUs for manual review.
4. **Status mapping:** `wc-completed` → `completed`, `wc-processing` → `processing`, etc.

---

## 2. Shiprocket Import

**Source:** `SR - 2023`, `SR - 2024`, `SR - 2025`, `SR - 2026` sheets (~1,099 rows combined, 118 columns)

### Field Mapping (key columns)

| Source Column | Target Table.Column | Notes |
|--------------|---------------------|-------|
| `Order ID` | shipments.shiprocket_order_id | bigint — matches WooCommerce order_id for WOOCOMMERCE channel |
| `AWB Code` | shipments.awb_code | Unique per physical shipment |
| `Shiprocket Created At` | shipments.shiprocket_created_at | |
| `Channel Created At` | shipments.channel_created_at | |
| `Channel` | shipments.channel | `WOOCOMMERCE` / `CUSTOM` |
| `Status` | shipments.status | Direct |
| `Channel SKU` | shipments.channel_sku | |
| `Master SKU` | shipments.master_sku | Use for variant_id resolution |
| `Product Name` | — | For audit only |
| `Product Quantity` | shipments.product_quantity | |
| `Payment Method` | shipments.payment_method | `prepaid` / `cod` |
| `Product Price` | shipments.product_price_inr | |
| `Order Total` | shipments.order_total_inr | De-dup on shiprocket_order_id before using |
| `Courier Company` | shipments.courier_company | Normalise per DATA_DICTIONARY §7 |
| `Zone` | shipments.zone | |
| `Freight Total Amount` | shipments.freight_total_inr | |
| `COD Charges` | shipments.cod_charges_inr | |
| `CRF ID` | shipments.cod_crf_id | |
| `COD Remittance Date` | shipments.cod_remittance_date | |
| `COD Payble Amount` | shipments.cod_payable_inr | Note: typo in source ("Payble") |
| `Remitted Amount` | shipments.remitted_inr | |
| `Order Picked Up Date` | shipments.picked_up_at | |
| `Order Shipped Date` | shipments.shipped_at | |
| `Order Delivered Date` | shipments.delivered_at | |
| `EDD` | shipments.edd | |
| `RTO Initiated Date` | shipments.rto_initiated_at | |
| `RTO Delivered Date` | shipments.rto_delivered_at | |
| `No of NPR Attempts` | shipments.ndr_attempts | |
| `Latest NDR Reason` | shipments.latest_ndr_reason | |
| `Address City` | shipments.customer_city | |
| `Address State` | shipments.customer_state | |
| `Address Pincode` | shipments.customer_pincode | |
| `RTO Risk` | shipments.rto_risk | `low` / `medium` / `high` |
| `Customer Name`, `Customer Email` | — | Use to link to customers table |

### Transformations Required
1. **Order ID join:** `Shiprocket Order ID` = `WooCommerce order_id` for WOOCOMMERCE channel orders. Join to `orders.woocommerce_order_id`. For `CUSTOM` channel, create a stub order record.
2. **Multi-item de-dup:** Multiple rows share the same `shiprocket_order_id`. Each row is one SKU line. AWB code is unique per row only if different AWBs are used per item (check: order 2051 had 3 products, one AWB).
3. **AWB uniqueness:** If multiple rows share an AWB, they represent items in the same physical shipment. Group by AWB for freight cost attribution (freight is per shipment, not per item).
4. **Variant resolution:** Map `Master SKU` → `product_variants.shiprocket_channel_sku` → `product_variants.id`.

---

## 3. Returns Import

**Source:** `Returns - 2023`, `Returns - 2024`, `Returns - 2025`, `Returns 2025 - 2026` sheets

Same column structure as Shiprocket (118/121 columns). Additional columns:

| Source Column | Target Table.Column | Notes |
|--------------|---------------------|-------|
| `Refund Amount` | returns.refund_amount_inr | |
| `Return Reason` | returns.return_reason | Free text — cluster in AI module |
| `Refund Status` | returns.refund_status | |
| `Refund Mode` | returns.refund_mode | |
| `QC Applicable` | — | Boolean |
| `QC Status` | returns.qc_status | |
| `QC Failure Reason` | returns.qc_failure_reason | |

Link to `shipments` via `Order ID` + `AWB Code` (find the forward shipment).

---

## 4. Bank Statement Import

**Source:** `2026` sheet (HDFC bank statement, Jan–Jun 2026)

Row format: Header rows appear before the transaction table. Actual data starts after the `Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance` row.

| Source Column | Target Table.Column | Transformation |
|--------------|---------------------|---------------|
| `Date` | bank_transactions.transaction_date | Parse `DD/MM/YY` |
| `Narration` | bank_transactions.narration_raw | Direct |
| `Chq./Ref.No.` | bank_transactions.reference_number | Strip leading zeros if numeric |
| `Value Dt` | bank_transactions.value_date | Parse `DD/MM/YY` |
| `Withdrawal Amt.` | bank_transactions.withdrawal_inr | NULL if blank |
| `Deposit Amt.` | bank_transactions.deposit_inr | NULL if blank |
| `Closing Balance` | bank_transactions.closing_balance_inr | |

Post-insert: run narration classifier (BUSINESS_RULES §3) to populate `transaction_type`, `counterparty`, `extracted_reference`.

---

## 5. Launch Expenses Import

**L1 Source:** `Expenses e537ebe9a6c3459aac82fa94dfdb26ff.csv`

| Source Column | Target | Transformation |
|--------------|--------|---------------|
| `Expense` | launch_expenses.expense_name | |
| `Amount` | launch_expenses.amount_inr | Strip ₹ and commas, cast numeric |
| `Category` | launch_expenses.category | Map: `Instalment` → `manufacturing`, `Sample` → `sample`, `Miscelleneous` → `misc` |
| `Date` | launch_expenses.paid_at | Parse `Month DD, YYYY` |
| `Status` | launch_expenses.status | Map: `Done` → `paid`, `Not started` → `pending`, `In progress` → `pending` |

**L2 and L3 sources:** Markdown tables — parse manually into the same structure.

---

## 6. Supplier Invoice Import

**L2 — JSKS-240801 (Jspeed):**

| Field | Value |
|-------|-------|
| supplier_name | Shanghai Jspeed Industry Co., Ltd |
| invoice_number | JSKS-240801 |
| invoice_date | 2024-08-28 |
| currency | USD |
| subtotal_foreign | 6,120.00 |
| shipping_cost_foreign | 0 (FOB India — buyer arranges) |
| total_foreign | 6,120.00 |
| payment_terms | 35% T/T advance + 65% before shipment |
| payment_method | swift |

Line items (from invoice):
| style_no | description | size | qty | unit_price_usd | line_total_usd |
|---------|-------------|------|-----|----------------|---------------|
| JSKS2403 | Vest (Summer Sports Bra) 87% poly 13% elastane, 18-2326 TCX | S/M/L/XL | 400 | 5.15 | 2,060.00 |
| JSKS2402 | Legging, 18-2326 TCX | S/M/L/XL | 400 | 5.80 | 2,320.00 |
| JSKS2402 | Legging, 19-0303 TCX | S/M/XL | 300 | 5.80 | 1,740.00 |

**L3 — Core Invoice (Burning Active):**

| Field | Value |
|-------|-------|
| supplier_name | Burning Active Apparel Co., Ltd |
| invoice_number | — (not printed — use `BURN-251006`) |
| invoice_date | 2025-10-06 |
| currency | USD |
| subtotal_foreign | 3,880.00 |
| shipping_cost_foreign | 348.60 |
| total_foreign | 4,228.60 |
| payment_terms | 30% deposit + 70% before shipment |
| payment_method | paypal |

Line items:
| item | description | colour | qty | unit_price_usd | line_total_usd |
|------|-------------|--------|-----|----------------|---------------|
| 8863 | Yoga Set (78% Nylon + 22% Spandex) | Blue | 200 | 18.00 | 3,600.00 |
| (logo print) | 3cm height logo print fee | — | 400 | 0.40 | 160.00 |
| (wash label) | Reflective silver wash label | — | 400 | 0.30 | 120.00 |

---

## 7. Ad Spend Import

**Google Ads — May 2026:**
- Invoice #5594350843, dated 31 May 2026
- Account: Kirgo Store (736-944-6064)

| Campaign | Quantity | Unit | Spend (₹) |
|---------|---------|------|-----------|
| Sid - PMAX - 15 May | 18,432 | Clicks | 6,688.87 |
| Kirgo Test 1 | 652 | Clicks | 3,897.86 |
| Sid - PMAX - 15 May | 13 | Impressions | 0.22 |
| Overdelivery credit | — | — | −147.17 |
| Subtotal | | | 10,439.78 |
| IGST 18% | | | 1,879.16 |
| Total | | | 12,318.94 |

Daily breakdown not available in PDF — distribute spend uniformly across 15 May–31 May for `ad_spend_daily` until API access is established.

**Meta Ads — May 2026:**
- Receipt: ₹10,000 funded on 12 May 2026
- Account: 729422043560314
- No campaign-level breakdown available
- Insert as a single `ad_spend_daily` row for 12 May with `campaign_id = Meta Kirgo`, `spend_inr = 10000`

---

## 8. Import Validation Checklist

| Check | Expected |
|-------|---------|
| WooCommerce order count | 917 orders |
| Shiprocket total rows | ~1,099 across 4 sheets |
| Distinct Shiprocket Order IDs | Should be less than row count (multi-item orders) |
| Returns rows | ~135 across 4 sheets |
| Bank statement rows (2026) | Check closing balance on last row matches known balance |
| SKUs with no canonical match | Must be zero before go-live |
| Orders with no matching shipment | Flag for manual review |
| Negative inventory after ledger build | Must be zero — signals data error |
