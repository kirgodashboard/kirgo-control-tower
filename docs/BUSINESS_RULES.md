# Kirgo Control Tower — Business Rules
**Phase:** Blueprint  
**Purpose:** Invariants, calculations, and domain logic derived from real Kirgo data that must be enforced consistently across all modules

---

## 1. Inventory Rules

### BR-INV-01: Bundle Decomposition
**Rule:** When a Set (bundle) product is sold or returned, inventory must be deducted from both the component Leggings variant AND the component Sports Bra variant.  
**Applies to:** Classic Set, Summer Set, Core Set  
**Trigger:** Any `inventory_ledger` entry with `movement_type = 'sale'` or `'return'` for a bundle variant  
**Implementation:** On insert to `inventory_ledger` for a bundle, automatically insert two additional ledger rows (one per component) with the same `quantity_delta`.

### BR-INV-02: Stock Cannot Go Negative
**Rule:** `inventory_ledger` running sum per variant must never go below zero.  
**Check:** Validate before processing any `sale` movement that `current_stock ≥ quantity_being_sold`.  
**Exception:** RTO (Return to Origin) movements add back to stock and cannot be blocked.

### BR-INV-03: Opening Stock Source of Truth
**Rule:** Opening stock figures come from the `ProductionSKU` sheet in `Kirgo Numbers.xlsx`. These are the only authoritative figures until a physical stockcount is performed.  
**Reference:** See `DATABASE_SCHEMA.md → inventory_batches` seeded values.

### BR-INV-04: RTO vs Return Distinction
**Rule:**  
- **RTO** (Return to Origin): Shipment failed delivery (NDR exceeded attempts), returned to warehouse by courier. Stock is restocked.  
- **Return**: Customer initiated return after delivery. Stock is restocked only after QC pass.  
Both increase `inventory_ledger` but are tracked separately (`movement_type = 'rto'` vs `'return'`).

---

## 2. Revenue Recognition Rules

### BR-REV-01: Revenue Event is Delivery
**Rule:** Revenue is recognised when `shipments.delivered_at` is populated (status = `DELIVERED`), not at order placement.  
**Rationale:** COD orders are not paid until delivery; prepaid orders may be cancelled/RTO'd before delivery.

### BR-REV-02: Net Revenue Calculation
```
Net Revenue = Gross Revenue − Returns (refund_amount_inr) − Discounts (discount_inr)
```
**Gross Revenue** = sum of `order_lines.line_total_inr` for delivered orders  
**Note:** Shipping charges collected from customers (`orders.shipping_charged_inr`) are NOT included in revenue — they are pass-through.

### BR-REV-03: Multi-Item Order Revenue
**Rule:** For Shiprocket multi-item orders (same `shiprocket_order_id`, multiple rows), `order_total_inr` appears on every row. When summing revenue from Shiprocket data, de-duplicate on `shiprocket_order_id` and use WooCommerce `order_total_inr` as the authoritative figure.  
**Implementation:** Always join Shiprocket → WooCommerce via `shiprocket_order_id → woocommerce_order_id`. Aggregate revenue at the WooCommerce order level.

### BR-REV-04: Shipping Revenue Neutral
**Rule:** Shipping charges collected from customers (field `orders.shipping_charged_inr`) offset the shipping cost paid to Shiprocket (field `shipments.freight_total_inr`). The net — positive or negative — flows into Contribution Margin, not Gross Revenue.

---

## 3. Bank Statement Classification Rules

### BR-BANK-01: Narration Parsing Patterns
The HDFC bank statement `Narration` field uses these deterministic patterns:

| Pattern (contains) | Classified As | Direction |
|-------------------|--------------|-----------|
| `EASEBUZZ PVT LTD PA ESCROW` | `gateway_settlement` (EaseBuzz) | IN |
| `ICICI BANK NODAL AC INFIBEAM AVENUES` | `gateway_settlement` (Infibeam) | IN |
| `SHIPROCKET COD CRF ID` | `cod_remittance` | IN |
| `BIGFOOT RETAIL SOLUT` | `shiprocket_recharge` | OUT |
| `DELHIVERY` | `courier_payment` | OUT |
| `FACEBOOKADSMANAGER` or `WWW FACEBOOK COM ADS` | `ad_spend_meta` | OUT |
| `PAYPAL *349771SS` | `supplier_payment` | OUT |
| `GOOGLE WORKSPACE CYBS` | `saas_subscription` | OUT |
| `AMAZON` (POS) | `courier_payment` | OUT |
| `KIRGO REFUND` | `customer_refund` | OUT |
| `KANIKA RODRIGUES` | `founder_transfer` | IN/OUT |
| `DC INTL POS TXN` or `EPR` | `bank_charge` | OUT |

### BR-BANK-02: YESF Reference Extraction
EaseBuzz settlements carry a YESF reference in the narration: `YESF260XXXXXXXXX`. Extract this as `extracted_reference`. Format: `YESF` + 2-digit year + 2-digit day-of-year + 7-digit sequence.

### BR-BANK-03: CRF ID Extraction
Shiprocket COD remittances carry a CRF ID: `SHIPROCKET COD CRF ID 12269675`. Extract the numeric portion as `extracted_reference`. This must match `shipments.cod_crf_id`.

### BR-BANK-04: Founder Transfers Are Not Revenue
**Rule:** Transfers from Kanika Rodrigues (classified as `founder_transfer`) are capital injections or internal transfers. They must NOT be included in any revenue or operating income calculation. They are tracked in cashflow as a separate line.

---

## 4. Gross Margin Rules

### BR-GM-01: COGS Components
```
COGS per unit = cogs_manufacture_inr + cogs_shoot_import_inr + cogs_shipping_pkg_inr
```
The `cogs_shoot_import_inr` component amortises the photoshoot and import logistics costs per unit at the time of production planning. It is a fixed cost allocated per unit, not a variable cost.

### BR-GM-02: Gross Margin Does Not Include Shipping
Gross Margin is calculated on the product alone:
```
Gross Margin = Selling Price − COGS per unit
```
Outbound shipping cost (`freight_total_inr`) and COD charges are deducted at the **Contribution Margin** level.

### BR-GM-03: Bundle COGS
For Set products, COGS = sum of the two component COGS values plus packaging once:
```
Set COGS = Legging COGS + Bra COGS + ₹75 (shared packaging)
```
Not: Legging COGS + Bra COGS + ₹75 + ₹75 (double-counting packaging).

---

## 5. Contribution Margin Rules

### BR-CM-01: Contribution Margin Formula
```
Contribution Margin per order = 
  Net Revenue
  − COGS (sum of order lines)
  − Outbound freight (shipments.freight_total_inr)
  − COD charges (shipments.cod_charges_inr)
  − Allocated ad spend
```

### BR-CM-02: Ad Spend Allocation
Ad spend allocation to individual orders is currently not possible (Meta has no campaign-breakdown data; Google only has May 2026 data). Until attribution is fully wired:  
- Use **blended ROAS** at the monthly level (total revenue / total ad spend per month)  
- Track ad spend as a period cost, not an order-level cost  
- Once UTM data from WooCommerce is linked to campaign IDs, enable order-level attribution

---

## 6. Cashflow Rules

### BR-CF-01: Cash Lag Model
Cash is received after revenue recognition. Settlement lags are:
- Prepaid (EaseBuzz): T+2 to T+3 business days
- Prepaid (Infibeam): T+2 to T+3 business days
- COD (Shiprocket): T+7 to T+14 from delivery date (batched by CRF cycle)
- COD orders that go RTO: zero cash received (cost is freight both ways)

### BR-CF-02: Net Cashflow from a COD Order
```
COD Cashflow = Order Amount − Shiprocket COD Charge − Freight (outbound) − Freight (inbound if RTO)
```
If delivered: positive cashflow (order amount − fees)  
If RTO: negative cashflow (two-way freight + COD charge, no revenue)

### BR-CF-03: Supplier Payment Timing
Suppliers operate on:
- **L2 (Jspeed):** 35% on order + 65% before shipment → two bank outflows in USD via SWIFT (visible as PayPal POS entries)
- **L3 (Burning Active):** 30% deposit + 70% before shipment → PayPal payments (POS: PAYPAL *349771SS)

FX conversion: use the closing rate on the PayPal transaction date. Actual FX visible in PayPal POS entries (e.g., ₹22,739.24 for a USD amount on 07/01/26).

---

## 7. Return & RTO Rules

### BR-RET-01: RTO Rate Definition
```
RTO Rate = count(shipments WHERE status = 'RTO_DELIVERED') 
           / count(shipments WHERE status IN ('DELIVERED', 'RTO_DELIVERED'))
           × 100
```
Exclude cancelled shipments from both numerator and denominator.

### BR-RET-02: Return Rate Definition
```
Return Rate = count(returns WHERE refund_status = 'processed')
              / count(shipments WHERE status = 'DELIVERED')
              × 100
```

### BR-RET-03: Stock Restock on Return
- **RTO:** Automatically restock upon `rto_delivered_at` being populated (no QC required — courier handled it)
- **Customer return:** Restock only when `qc_status = 'pass'`. Failed QC items are logged but not restocked.

---

## 8. Forecasting Rules

### BR-FORE-01: Launch Decay Pattern
Kirgo follows a **launch spike + decay** revenue curve. Each launch generates peak revenue in months 1–2, then declines until the next launch or restock. This is not a seasonality pattern — it is driven by inventory depletion and customer acquisition exhaustion.

Revenue model by launch phase:
- Month 1–2: High (launch momentum, influencer/organic)
- Month 3–4: Moderate (word of mouth)
- Month 5+: Low (long-tail, near stock-out)

### BR-FORE-02: Minimum Viable Orders Threshold
Based on historical data, a "healthy" month for Kirgo is ≥ 20 orders. Months below 10 orders indicate either stock exhaustion or a launch gap.

### BR-FORE-03: AOV Benchmark by Collection
| Collection Active | Expected AOV Range |
|------------------|-------------------|
| Classic only | ₹1,700–₹2,100 |
| Summer active | ₹1,700–₹2,200 |
| Core active | ₹2,500–₹3,300 |

AOV increase with Core is driven by the ₹3,798 Core Set price point.

---

## 9. Data Quality Rules

### BR-DQ-01: Shiprocket De-duplication
The Shiprocket export has one row per SKU per order. When computing order-level metrics, group by `shiprocket_order_id` and sum quantities. Never count `shiprocket_order_id` as a unique order count without de-duplication.

### BR-DQ-02: WooCommerce is the Order of Record
In case of conflict between WooCommerce and Shiprocket on order amount, customer details, or status — **WooCommerce is authoritative** for financial amounts; **Shiprocket is authoritative** for delivery status and dates.

### BR-DQ-03: Monthly Revenue Sheet is Derived, Not Source
The `Monthly Revenue` sheet in `Kirgo Numbers.xlsx` was manually maintained and contains known errors (e.g., Apr 2025 shows 15 orders with ₹0 revenue). Do NOT use this sheet as a data source in the application. Derive all monthly revenue from WooCommerce + Shiprocket raw data.
