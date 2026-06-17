# Kirgo Control Tower — Master Blueprint
**Phase:** Blueprint (Pre-Build)  
**Date:** 2026-06-17  
**Role:** Lead Data Architect  
**Status:** Final for Phase 1 scope

---

## 1. Business Context

Kirgo is a D2C activewear brand (yoga / sports apparel) based in Mumbai, operating entirely through its own WooCommerce storefront. The business follows a **launch-batch model**: each product collection is manufactured in a single production run, sold until stock depletes, and then either restocked or replaced with a new collection. There have been three live launches to date and one upcoming.

| Launch | Collection | Live Date | Key Products |
|--------|-----------|-----------|-------------|
| L1 | Classic | Oct 2023 | Classic Leggings, Classic Sports Bra |
| L2 | Summer + Classic Restock | May 2025 | Summer Leggings, Summer Sports Bra, Classic Leggings 2 |
| L3 | Core | Jan 2026 | Core Leggings, Core Sports Bra |
| L4 | Core Flare | Jun 2026 (planned) | TBD |

**Entity:** M/S KIRGO, 501C Chouhan Empire, Amboli, Andheri West, Mumbai 400058  
**Bank:** HDFC Bank (A/C 50200082476640, IFSC HDFC0007217)  
**Currency:** INR primary; USD for supplier invoices  

---

## 2. Source System Inventory

| Source | Format | Volume | Key Data |
|--------|--------|--------|---------|
| WooCommerce | CSV export | 917 orders, 93 cols | Orders, customers, UTM attribution, line items (up to 4 per order) |
| Shiprocket | CSV export (per year) | ~1,100 order-lines total (2023–2026) | Fulfillment lifecycle, AWB, courier, zones, COD remittance, NDR/RTO |
| HDFC Bank Statement | Excel (PDF convertible) | 2026 Jan–Jun active | All cash inflows/outflows with narration strings |
| Launch Expenses (Notion) | Markdown + CSV | 3 launches | Manufacturing instalments, shoot costs, packaging |
| Supplier Invoices | PDF + XLS + JPG | 3 invoices | Unit costs in USD, quantities, supplier terms |
| Google Ads | PDF statements | May 2026 only | Campaigns, clicks, impressions, spend |
| Meta Ads | PDF receipts | May 2026 only | Funding amounts (no campaign-level detail yet) |
| Master Excel (Kirgo Numbers.xlsx) | Excel, 18 sheets | All history | Product costs, monthly revenue, returns, Shiprocket consolidated |

### Source System Gaps (Phase 1)
- Shiprocket API not yet connected (manual CSV exports)
- Meta Ads campaign-level breakdown not available in current documents
- No Google Analytics / WooCommerce pixel data linked
- Bank statement pre-2026 not provided (years 2023–2025 cash flow blind spot)
- Classic Launch invoice is a JPG — text extraction pending

---

## 3. Product Catalogue

### 3.1 Active SKUs

| Collection | Product | COGS (₹) | Selling Price (₹) | Gross Margin | Margin % |
|-----------|---------|----------|-----------------|-------------|---------|
| Classic (L1) | Classic Leggings | 1,167 | 1,699 | 532 | 31.3% |
| Classic (L1) | Classic Sports Bra | 1,167 | 1,599 | 432 | 27.0% |
| Classic (L1) | Classic Set (bundle) | 2,259 | 3,298 | 1,039 | 31.5% |
| Summer (L2) | Summer Leggings | 847 | 1,799 | 952 | 52.9% |
| Summer (L2) | Summer Sports Bra | 847 | 1,499 | 652 | 43.5% |
| Summer (L2) | Summer Set (bundle) | 1,619 | 3,298 | 1,679 | 50.9% |
| Summer (L2) | Classic Leggings 2 | 847 | 1,699 | 852 | 50.1% |
| Core (L3) | Core Leggings | 1,139 | 1,999 | 860 | 43.0% |
| Core (L3) | Core Sports Bra | 1,139 | 1,799 | 660 | 36.7% |
| Core (L3) | Core Set (bundle) | 2,203 | 3,798 | 1,595 | 42.0% |

**COGS Breakdown:** Manufacture + Shoot & Import + Shipping & Packaging  
**Note:** Bundles (Sets) are virtual — composed of one Leggings + one Sports Bra. They do not have independent inventory.

### 3.2 COGS Component Breakdown

| Collection | Manufacture (₹) | Shoot & Import (₹) | Ship & Pkg (₹) | Total COGS (₹) |
|-----------|----------------|-------------------|----------------|---------------|
| Classic (L1) | 624 | 468 | 75 | 1,167 |
| Summer (L2) | 660 | 112 | 75 | 847 |
| Core (L3) | 942 | 122 | 75 | 1,139 |

### 3.3 Initial Stock at Launch

| Collection | Product | XS | S | M | L | XL | Total |
|-----------|---------|----|----|----|----|-----|-------|
| Classic | Classic Leggings | — | 150 | 150 | 150 | — | 450 |
| Classic | Classic Sports Bra | — | 150 | 150 | 150 | — | 450 |
| Summer | Summer Leggings | — | 100 | 100 | 100 | 100 | 400 |
| Summer | Summer Sports Bra | — | 100 | 100 | 100 | 100 | 400 |
| Summer | Classic Leggings 2 | — | 100 | 100 | — | 100 | 300 |
| Core | Core Leggings | 10 | 60 | 60 | 60 | 10 | 200 |
| Core | Core Sports Bra | 10 | 60 | 60 | 60 | 10 | 200 |

---

## 4. Revenue History

| Period | Revenue (₹) | Orders | AOV (₹) | Notes |
|--------|------------|--------|---------|-------|
| Oct–Dec 2023 | 69,686 | — | — | L1 launch, Classic only |
| Jan–Dec 2024 | 5,59,545 | partial | ~1,900 | Classic declining H2 |
| Jan–Dec 2025 | 3,41,188 | 179 | ~1,906 | L2 launch May 2025 |
| Jan–Mar 2026 | 2,05,100 | 68 | ~3,016 | L3 launch Jan 2026, AOV up |

**Key Observation:** AOV jumped from ~₹1,900 to ~₹3,013 with Core launch (Jan 2026), driven by higher unit prices and Core Set bundles at ₹3,798.

---

## 5. Launch Investment Summary

| Launch | Total Spend (₹) | Manufacturing | Shoot | Packaging | Website | Other |
|--------|---------------|--------------|-------|-----------|---------|-------|
| L1 Classic | 6,43,500 | 5,47,500 | 62,000 | 250 | 50,000 (pending) | ~34,000 |
| L2 Summer+Restock | 10,37,760 | 7,26,483 | 93,000 | 18,254 | 75,000 (TBP) | 15,023 |
| L3 Core | 5,05,000 | 3,77,000 | 12,300 | 2,000 | — | 13,700 |

**Suppliers:**
- L1: ASTSW (China) — payment structure unknown
- L2: Shanghai Jspeed Industry Co., Ltd — PI JSKS-240801, $6,120 USD, SWIFT payment (35% + 65%)
- L3: Burning Active Apparel Co., Ltd (Guangzhou) via Shenzhen Merrycoo — $4,228.60 USD, PayPal (30% + 70%)

---

## 6. Operational Stack

| Function | Platform | Notes |
|----------|----------|-------|
| Storefront | WooCommerce (kirgostore.com) | Self-hosted WordPress |
| Checkout | Gokwik | Handles prepaid + COD checkout optimisation |
| Logistics | Shiprocket | Aggregates Delhivery, Blue Dart, Amazon Logistics |
| Payment Gateway 1 | EaseBuzz | Settles via YESB (EaseBuzz PVT LTD PA ESCROW A/C) |
| Payment Gateway 2 | Infibeam/CCAvenue | Settles via ICICI (ICICI BANK NODAL AC INFIBEAM AVENUES LTD) |
| COD Remittance | Shiprocket | Settles via ICICI (SHIPROCKET COD CRF ID) |
| Performance Marketing | Google Ads | Account 736-944-6064, campaigns: Sid-PMAX, Kirgo Test 1 |
| Performance Marketing | Meta Ads | Account 729422043560314 |
| Productivity | Google Workspace | ₹1,227.20/month |

---

## 7. Canonical Data Model — Entity Overview

The data model is organised into five domains:

```
PRODUCT DOMAIN          ORDER DOMAIN            FINANCIAL DOMAIN
────────────────         ───────────────          ────────────────
launches                 orders                   bank_transactions
products                 order_lines              gateway_settlements
product_variants         customers                purchase_orders
inventory_batches        shipments                purchase_order_lines
inventory_ledger         returns                  launch_expenses
                         shipment_events          ad_spend

                         MARKETING DOMAIN
                         ─────────────────
                         ad_campaigns
                         ad_spend_daily
```

Full table specifications are in `DATABASE_SCHEMA.md`.

---

## 8. Data Pipeline Architecture

### 8.1 Ingestion Layers

```
SOURCE SYSTEMS          RAW LAYER (Supabase)     CLEAN LAYER              ANALYTICS LAYER
──────────────          ────────────────          ────────────             ───────────────
WooCommerce CSV    →    raw_woocom_orders    →    orders                →  mv_monthly_revenue
Shiprocket CSV     →    raw_shiprocket       →    shipments             →  mv_sku_performance
HDFC Bank Excel    →    raw_bank_stmt        →    bank_transactions     →  mv_cashflow_weekly
Notion/CSV Exp.    →    raw_launch_expenses  →    launch_expenses       →  mv_launch_economics
Supplier PDFs      →    raw_purchase_inv     →    purchase_orders       →  mv_cogs_actuals
Google Ads PDF     →    raw_google_ads       →    ad_spend_daily        →  mv_roas
Meta Ads PDF       →    raw_meta_ads         →    ad_spend_daily        →  mv_cac
```

### 8.2 Bank Statement Narration Parser

The HDFC bank statement narration field is unstructured. The following regex patterns classify each transaction:

| Pattern | Classification | Direction |
|---------|---------------|-----------|
| `EASEBUZZ PVT LTD PA ESCROW` | gateway_settlement (EaseBuzz) | IN |
| `ICICI BANK NODAL AC INFIBEAM` | gateway_settlement (Infibeam) | IN |
| `SHIPROCKET COD CRF ID \d+` | cod_remittance | IN |
| `BIGFOOT RETAIL SOLUT` | shiprocket_recharge | OUT |
| `DELHIVERY` | courier_payment | OUT |
| `FACEBOOK ADS` or `FACEBOOKADSMANAGER` | ad_spend (Meta) | OUT |
| `GOOGLE` (PAYPAL or POS) | ad_spend (Google) | OUT |
| `KIRGO REFUND` | customer_refund | OUT |
| `PAYPAL \*349771SS` | supplier_payment (USD) | OUT |
| `ME DC SI.*GOOGLE WORKSPACE` | saas_subscription | OUT |
| `KANIKA RODRIGUES` | founder_transfer | IN/OUT |
| `AMAZON` (POS) | supplier_payment | OUT |

### 8.3 Settlement Lag Model

Understanding payment timing is critical for cashflow:

| Source | Settlement Lag | Notes |
|--------|---------------|-------|
| EaseBuzz (prepaid) | T+2 to T+3 | Batch remittances via YESB |
| Infibeam/Gokwik | T+2 to T+3 | Batch via ICICI |
| Shiprocket COD | T+7 to T+14 | COD collected at delivery, batched by CRF ID |
| Google Ads | Prepaid wallet | Deducted as spent from pre-funded balance |
| Meta Ads | Prepaid wallet | Same model as Google |

---

## 9. Module Definitions

### 9.1 BI & Revenue Analytics
**Purpose:** Track revenue performance across products, time periods, and customer segments.

Key views to build:
- Monthly revenue by SKU, collection, payment method
- AOV trend (demonstrates portfolio shift from Classic → Core)
- State-wise distribution (from Shiprocket address data)
- Prepaid vs COD split by period
- Sell-through rate per collection

### 9.2 Inventory Management
**Purpose:** Know exactly how many units remain per SKU per size, and when the business will stock out.

Key capabilities:
- Opening stock per batch (from ProductionSKU sheet)
- Units sold (from Shiprocket delivered orders)
- Units returned/RTO (from Returns sheets)
- Calculated: Remaining = Opening − Sold + Returned
- Depletion forecast: at current velocity, when does each size stock out?

### 9.3 Cashflow Tracking
**Purpose:** Reconcile cash position from bank statement against operational sources.

Key reconciliation flows:
- Gateway settlement match: EaseBuzz/Infibeam reference IDs ↔ WooCommerce transaction_ids
- COD remittance: Shiprocket CRF ID ↔ bank narration CRF ID
- Supplier payments: PayPal POS entries ↔ purchase order amounts (USD→INR conversion)
- Ad spend: bank debits ↔ Google/Meta invoice amounts

### 9.4 Marketing Attribution
**Purpose:** Calculate ROAS, CPC, and CAC from ad spend data.

Data available:
- Google Ads: campaign-level (clicks, impressions, spend) — May 2026
- Meta Ads: funding-level only (₹10,000 May 2026) — needs API access for campaign breakdown
- WooCommerce UTM: `meta:_wc_order_attribution_utm_source` captures session-level source

Formula targets:
- ROAS = Revenue attributable to channel / Ad spend on channel
- CAC = Total ad spend / New customers acquired
- Blended CPC = Total ad spend / Total clicks

### 9.5 AI Analysis Layer
**Purpose:** Surface insights that manual review would miss.

Planned AI tasks:
- Bank narration classification (trained on labelled patterns from Section 8.2)
- Return reason clustering (free-text QC failure reasons in Returns sheet)
- Demand signal detection (identify spikes/drops and correlate with external events)
- Customer lifetime value segmentation

### 9.6 Forecasting
**Purpose:** Project revenue and inventory depletion over rolling 90-day horizon.

Input signals:
- Historical monthly revenue by collection (Monthly Revenue sheet)
- Seasonal pattern: launches show sharp spike then decay curve
- Stock remaining per SKU (inventory module output)
- Ad spend planned (operator input)

Model approach: For a business at this scale (20–34 orders/month), a **weighted moving average with launch-event adjustment** is more appropriate than ARIMA. Full spec in `FORECASTING_MODEL.md`.

---

## 10. Key Metrics Catalogue

Full definitions in `KPI_DEFINITIONS.md`. Summary:

| Metric | Formula | Frequency |
|--------|---------|-----------|
| Gross Revenue | sum(order_total) | Daily / Monthly |
| Net Revenue | Gross − Returns − Discounts | Monthly |
| Gross Margin % | (SP − COGS) / SP × 100 | Per SKU |
| Contribution Margin | GM − Shipping cost − Ad spend allocation | Monthly |
| AOV | Revenue / Orders | Monthly |
| Units Sold | count(delivered shipments) | Daily |
| Sell-Through Rate | Units Sold / Opening Stock | Per launch |
| RTO Rate | RTO units / Total shipped | Monthly |
| Return Rate | Return units / Delivered units | Monthly |
| ROAS | Revenue / Ad Spend | Monthly |
| CAC | Ad Spend / New Customers | Monthly |
| Days of Inventory | Remaining units / Avg daily units sold | Per SKU |
| Payback Period | Launch investment / Monthly net contribution | Per launch |

---

## 11. Data Quality Observations

| Issue | Impact | Resolution |
|-------|--------|-----------|
| Monthly Revenue sheet has 0 revenue for Apr 2025 with 15 orders listed | Incorrect aggregation | Derive from WooCommerce/Shiprocket directly |
| SKU naming is inconsistent across sources (BCLM01 vs BCL-M-1 vs "Classic Leggings M") | Join failures | Canonical SKU map in `DATA_DICTIONARY.md` |
| Bank statement 2023–2025 not provided | No cashflow history before 2026 | Collect from business banking |
| Meta Ads has no campaign-level spend breakdown (only funding receipts) | Cannot compute per-campaign ROAS | Requires Meta Ads API or manual export |
| Classic L1 invoice is a JPG — text not extracted | COGS partially unverified | OCR or manual re-entry |
| Bundle sets (e.g., Classic Set) are sold as a single order line but consume 2 inventory units | Inventory double-counting risk | Bundle decomposition rule in BUSINESS_RULES.md |
| Shiprocket multi-item orders: one Order ID can have multiple rows | Revenue double-counting risk | Order total is on each row; must de-duplicate on Order ID |

---

## 12. Open Questions for the Business

1. **Flare Launch (L4):** What is the planned stock quantity, COGS, and target launch date?
2. **COD ratio:** What % of orders are COD vs prepaid historically? (Visible in Shiprocket data; should be tracked as a KPI)
3. **Ad spend ramp:** Is the May 2026 Google/Meta activity a permanent spend or a test? What is the monthly budget going forward?
4. **Supplier FX:** Are USD→INR conversions tracked at time of payment, or using a fixed rate?
5. **Return policy:** What is the return window? (Affects cashflow reserve requirements)
6. **Gokwik vs EaseBuzz vs Infibeam:** Does each payment method correspond to a different checkout flow, or are they all active simultaneously?
7. **Kanika personal transfers:** Are these equity injections or loans? (Affects cashflow classification)
8. **GSTIN:** Is Kirgo registered for GST? (18% GST on ad spend is visible but GST input credit reclaim status unknown)
