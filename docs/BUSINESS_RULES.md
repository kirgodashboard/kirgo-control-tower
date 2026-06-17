# Kirgo Control Tower — Business Rules
**Version:** v2.0 | **Date:** 2026-06-17
**Schema Reference:** DATABASE_SCHEMA.md v2 | **Data Reference:** DATA_DICTIONARY.md v2.1 | **KPI Reference:** KPI_DEFINITIONS.md v2.0
**Currency:** INR throughout unless stated

---

## Document Purpose

This document is the authoritative operating rulebook for the Kirgo Control Tower platform. Every import pipeline, KPI calculation, forecast model, AI insight, and dashboard display must follow these rules. When any module's behaviour is ambiguous, this document is the tiebreaker.

---

## Rule Format

Each rule contains:
- **Rule ID** — unique identifier (BR-001 through BR-133)
- **Description** — what the rule is
- **Rationale** — why this rule exists
- **Example** — a concrete Kirgo-specific illustration

Rules that supersede codes from prior documents include a `Legacy alias:` line for backward compatibility. See Appendix A for the full cross-reference.

---

## Table of Contents

1. [Revenue Recognition Rules](#section-1-revenue-recognition-rules) — BR-001 to BR-012
2. [Returns & RTO Rules](#section-2-returns--rto-rules) — BR-013 to BR-024
3. [Inventory Rules](#section-3-inventory-rules) — BR-025 to BR-036
4. [Product Costing Rules](#section-4-product-costing-rules) — BR-037 to BR-048
5. [Expense Classification Rules](#section-5-expense-classification-rules) — BR-049 to BR-063
6. [Cash Flow Rules](#section-6-cash-flow-rules) — BR-064 to BR-074
7. [Marketing Attribution Rules](#section-7-marketing-attribution-rules) — BR-075 to BR-082
8. [Forecasting Rules](#section-8-forecasting-rules) — BR-083 to BR-096
9. [KPI Calculation Rules](#section-9-kpi-calculation-rules) — BR-097 to BR-105
10. [AI Insight Rules](#section-10-ai-insight-rules) — BR-106 to BR-114
11. [Data Quality Rules](#section-11-data-quality-rules) — BR-115 to BR-124
12. [Governance Rules](#section-12-governance-rules) — BR-125 to BR-133
13. [Appendix A: Legacy Rule ID Cross-Reference](#appendix-a-legacy-rule-id-cross-reference)

---

## Section 1: Revenue Recognition Rules

---

### BR-001: Revenue Recognition Event is Delivery

**Description:** Revenue is recognised when and only when a shipment reaches `status = 'DELIVERED'` and `shipments.delivered_at IS NOT NULL`. Order placement, payment capture, and shipment dispatch are not revenue events.

**Rationale:** COD orders are unpaid until the courier collects cash at the customer's door. Prepaid orders may be cancelled, refunded, or returned before the product leaves the warehouse. Using delivery as the recognition point aligns financial reporting with the moment the transaction is economically complete and irrevocable for Kirgo.

**Example:** A customer places a Core Set order on 15 Jan 2026 (prepaid, ₹3,798). The shipment is dispatched on 17 Jan and delivered on 19 Jan. Revenue of ₹3,798 is recognised on 19 Jan — not on 15 Jan or 17 Jan.

*Legacy alias: BR-REV-01*

---

### BR-002: Gross Revenue Definition

**Description:** Gross Revenue equals the sum of `order_lines.line_total_inr` for all order lines where the associated shipment has `status = 'DELIVERED'` and `delivered_at` falls within the measurement period. Do not use `orders.order_total_inr` or `shipments.order_total_inr` as revenue sources — both include shipping charges that must be excluded.

**Rationale:** `order_lines.line_total_inr` represents the product value only (quantity × selling price minus line-level discount). It excludes shipping and aligns with BR-004 (shipping neutrality). `shipments.order_total_inr` is a Shiprocket field duplicated across rows for multi-item orders and will double-count if summed directly.

**Example:** A customer orders 1 Core Legging (₹2,199) + 1 Core Bra (₹1,499) and is charged ₹99 shipping. `order_lines` has two rows: ₹2,199 and ₹1,499. Gross Revenue = ₹2,199 + ₹1,499 = ₹3,698. The ₹99 shipping does not appear in Gross Revenue.

---

### BR-003: Net Revenue Calculation

**Description:** Net Revenue = Gross Revenue − SUM(returns.refund_amount_inr WHERE refund_status = 'processed') − SUM(orders.discount_inr WHERE the order was delivered in the period). Both deductions use the measurement period as their date basis (see BR-008 for refund date clarification).

**Rationale:** Gross Revenue overstates what the business actually keeps. Discounts reduce the effective selling price. Processed refunds represent a permanent reversal of collected cash. Both must be netted before any profitability or efficiency metric is computed.

**Example:** May 2026 Gross Revenue = ₹82,000. Two refunds processed in May totalling ₹4,200. Discounts on May-delivered orders totalling ₹3,100. Net Revenue = ₹82,000 − ₹4,200 − ₹3,100 = ₹74,700.

*Legacy alias: BR-REV-02*

---

### BR-004: Shipping Charges Are Revenue-Neutral

**Description:** Shipping charges collected from customers (`orders.shipping_charged_inr`) are excluded from Gross Revenue and Net Revenue. They are not deducted from Contribution Margin either. The net of shipping collected vs shipping paid (freight_total_inr) flows into Contribution Margin as a combined shipping line.

**Rationale:** Shipping is a pass-through charge. Including it in revenue would inflate topline KPIs and distort ROAS, AOV, and margin ratios. Kirgo typically charges ₹99–₹149 shipping per order and pays ₹80–₹300 freight depending on zone — the difference (positive or negative) is an operational cost, not a product revenue item.

**Example:** Customer pays ₹99 shipping on a ₹2,199 Core Legging order. Shiprocket charges ₹120 freight (Zone B). Gross Revenue = ₹2,199 (not ₹2,298). The ₹21 net shipping loss (₹99 − ₹120) reduces Contribution Margin.

*Legacy alias: BR-REV-04*

---

### BR-005: COD Order Revenue Treatment

**Description:** COD orders follow the same revenue recognition rule as prepaid — revenue is recognised at delivery (BR-001), not at order placement. The cash receipt lag (T+7 to T+14) does not affect the revenue recognition date. COD orders that are RTOd generate zero revenue and zero cash.

**Rationale:** The economic transfer of value (customer receives product; Kirgo surrenders inventory) occurs at delivery. The cash collection timing is a treasury matter, not a revenue recognition matter. If a COD order is RTOd, the product was never delivered and no value was transferred — zero revenue.

**Example:** COD order placed 20 May, delivered 23 May, cash remitted by Shiprocket CRF on 30 May. Revenue date = 23 May. Cash inflow date = 30 May. The ₹7 settlement lag is tracked in G-06 (COD Outstanding), not as deferred revenue.

---

### BR-006: Prepaid Order Revenue Treatment

**Description:** Prepaid orders (EaseBuzz or Infibeam gateway) follow BR-001. Revenue is recognised at delivery. Gateway settlement (T+2 to T+3) precedes or coincides with delivery for most orders; this timing difference has no bearing on revenue recognition.

**Rationale:** Payment is collected before delivery for prepaid orders. However, the product is still in transit and can still be RTOd. Recognising revenue before delivery would create a revenue reversal requirement at the RTO event. Delivery-date recognition is cleaner and consistent across all payment methods.

**Example:** Prepaid Core Set ordered 1 Jan 2026, settled by EaseBuzz on 3 Jan (YESF reference), delivered 5 Jan. Revenue date = 5 Jan. If the order had gone RTO on 8 Jan, a refund would have been issued and the already-settled gateway amount would need to be returned. The consistent rule avoids misstated January revenue.

---

### BR-007: Cancelled Orders Are Excluded from All Revenue KPIs

**Description:** Orders with `status = 'cancelled'` in WooCommerce are excluded from Gross Revenue, Net Revenue, order counts, AOV, and all downstream KPIs. They do not appear in the revenue dataset.

**Rationale:** Cancelled orders were never fulfilled. No product left the warehouse, no cash (beyond the temporary gateway hold) changed hands, and no inventory was permanently deducted. Including them in any revenue metric would overstate demand.

**Example:** A customer places a Core Legging order and cancels before dispatch. This row in `orders` has `status = 'cancelled'` and the linked shipment (if created) has `status = 'CANCELLED'`. Neither row contributes to any KPI.

---

### BR-008: Refund Date Basis

**Description:** Refunds are deducted from Net Revenue in the month the refund is processed (`returns.returned_at`), not the month the original sale was made. A refund processed in June for a May sale reduces June Net Revenue, not May Net Revenue.

**Rationale:** Revenue is recognised on the cash basis for the adjustment — the refund is a cash event that occurs in the period it is processed. Reopening prior months' Net Revenue for each refund creates reconciliation complexity. The practise is consistent with Kirgo's current accounting approach.

**Example:** Core Legging delivered 28 May 2026 (₹2,199 recognised in May). Customer returns on 2 Jun; refund processed 5 Jun. May Net Revenue is unchanged. June Net Revenue is reduced by ₹2,199.

---

### BR-009: Partial Refund Treatment

**Description:** When a partial refund is issued (e.g., one item from a two-item order is returned), only the `refund_amount_inr` actually credited to the customer is deducted from Net Revenue. The unreturned portion of the order retains its recognised revenue.

**Rationale:** Partial refunds occur when a customer returns one product from a bundle or multi-item order while keeping the other. The kept product remains delivered and its revenue stands.

**Example:** Customer orders Core Set (₹3,798) and Core Legging (₹2,199) together. Returns only the Legging. Refund = ₹2,199. Revenue deducted = ₹2,199. Core Set revenue of ₹3,798 is unchanged. Net Revenue for the order = ₹3,798.

---

### BR-010: Bundle and Set Revenue Recognition

**Description:** A bundle (Set product) is treated as a single SKU at its bundle selling price. Revenue = bundle's `line_total_inr` from `order_lines`. Component products (Legging, Bra) within the bundle are not separately revenue-recognised.

**Rationale:** Sets are sold at a single price point (Core Set ₹3,798) that differs from the sum of components (Core Legging ₹2,199 + Core Bra ₹1,499 = ₹3,698 — actual bundle may be priced differently). The WooCommerce transaction is at the bundle price. Component-level revenue allocation would require an arbitrary split.

**Example:** Core Set sold at ₹3,798. Revenue = ₹3,798 for that `order_lines` row. No separate revenue is attributed to the leggings component (₹2,199) or bra component (₹1,499) within the same transaction.

---

### BR-011: Multi-Item Order De-duplication

**Description:** When counting orders, always use `COUNT(DISTINCT orders.woocommerce_order_id)`. Never count Shiprocket rows directly for order volume. A WooCommerce order containing 2 SKUs produces 2 Shiprocket rows with the same `shiprocket_order_id` — counting these would double the order count.

**Rationale:** Shiprocket assigns one row per item per order for operational (pick-pack) purposes. WooCommerce assigns one row per transaction. Order-level metrics (order count, AOV) must be computed at the WooCommerce level.

**Example:** A customer orders 1 Core Legging + 1 Core Bra in a single checkout. WooCommerce: 1 order. Shiprocket export: 2 rows (same shiprocket_order_id, different AWBs may or may not exist). Order count = 1. Revenue = sum of both order_lines rows.

*Legacy alias: BR-DQ-01*

---

### BR-012: WooCommerce Is the Order of Record

**Description:** In any conflict between WooCommerce and Shiprocket on financial amounts, customer details, or order-level data — WooCommerce is authoritative. For delivery status, courier AWB numbers, and logistics dates — Shiprocket is authoritative.

**Rationale:** WooCommerce is the payment gateway and customer-facing transaction system. Shiprocket is the logistics execution layer. Each system is authoritative for its domain. Conflicts typically arise from Shiprocket display fields being approximate or incorrectly formatted.

**Example:** WooCommerce shows order total ₹3,798. Shiprocket shows order_total_inr = ₹3,899 (may include COD charges in their display). Use ₹3,798. Shiprocket shows `status = 'DELIVERED'` with delivered_at = 19 Jan — this is authoritative for the delivery event.

*Legacy alias: BR-DQ-02*

---

## Section 2: Returns & RTO Rules

---

### BR-013: Customer Return Definition

**Description:** A customer return is a post-delivery event where the customer initiates the return of a product they have received. It is recorded in the `returns` table with `return_reason IS NOT NULL` and the shipment `status = 'DELIVERED'`. Returns reduce Net Revenue via refunds and may restore inventory (subject to BR-023).

**Rationale:** Returns represent a reversal of the commercial transaction at the customer's initiative. They are distinct from RTOs (logistics failures) and must be tracked separately to understand product-market fit, sizing accuracy, and fulfilment quality.

**Example:** Customer receives Core Legging (M, Black) on 10 Feb 2026. On 13 Feb, initiates a return citing "size too large." A `returns` record is created; `return_reason = 'size_issue'`, `refund_status = 'pending'`. When processed and refund issued, `refund_status = 'processed'`.

---

### BR-014: RTO (Return to Origin) Definition

**Description:** An RTO is a shipment that failed to reach the customer and was returned to Kirgo's warehouse by the courier. It is recorded as `shipments.status = 'RTO_DELIVERED'` with `rto_delivered_at` populated. RTOs are logistics failures — not customer decisions. They generate zero revenue, and no refund is issued because no charge was successfully collected (COD) or because the original payment must be refunded (prepaid).

**Rationale:** Conflating RTOs with returns distorts both Return Rate % (a product quality metric) and RTO Rate % (a logistics quality metric). They have different root causes: returns stem from product or expectation mismatch; RTOs stem from address issues, customer unavailability, or refused deliveries.

**Example:** A COD Core Set (₹3,798) is dispatched on 20 Jan. Courier attempts delivery 3 times (NDR); customer unavailable. Shiprocket marks it RTO_DELIVERED on 27 Jan. `rto_delivered_at = 27 Jan`. Revenue = ₹0. Cash received = ₹0. Two-way freight ~₹400 is a sunk cost.

*Legacy alias: BR-INV-04 (partial)*

---

### BR-015: Return Rate % Formula

**Description:**
```
Return Rate % = COUNT(returns WHERE return_reason IS NOT NULL AND returned_at IN period)
              / COUNT(DISTINCT orders.woocommerce_order_id WHERE shipments.status = 'DELIVERED'
                      AND delivered_at IN period)
              × 100
```
Denominator is delivered orders in the period. Numerator is customer-initiated returns with a populated reason. RTO records in the `returns` table (if any) with `return_reason IS NULL` are excluded.

**Rationale:** Return Rate measures customer dissatisfaction with delivered products. Using delivered orders as the denominator (not all shipped orders) gives the correct exposure base — only delivered customers can initiate returns.

**Example:** 30 orders delivered in May. 2 customer returns processed in May. Return Rate = 2/30 × 100 = 6.7%. Alert threshold: Warning if > 4%.

*Legacy alias: BR-RET-02*

---

### BR-016: Return Value Deduction

**Description:** Only `refund_status = 'processed'` refunds are deducted from Net Revenue. Pending refunds (`refund_status = 'pending'`) are tracked as liabilities but do not reduce recognised revenue until processed. Partial refunds deduct the exact `refund_amount_inr`, not the full order value.

**Rationale:** Pending refunds have not yet left the bank account. Recording them as revenue reductions before processing creates a discrepancy between the P&L and the bank statement. Processing-date recognition ensures Net Revenue matches actual cash retained.

**Example:** 3 returns received in May: 2 refunds processed (₹4,400 total), 1 pending (₹2,199). May Net Revenue is reduced by ₹4,400 only. The ₹2,199 pending refund becomes a liability visible in the returns table but is not deducted until processed (likely June).

---

### BR-017: RTO Rate % Formula

**Description:**
```
RTO Rate % = COUNT(shipments WHERE status = 'RTO_DELIVERED' AND shipped_at IN cohort period)
           / COUNT(shipments WHERE status IN ('DELIVERED', 'RTO_DELIVERED')
                   AND shipped_at IN cohort period)
           × 100
```
The cohort basis is `shipped_at` (not `rto_delivered_at`) so the rate reflects outcomes for a cohort of dispatched shipments. Cancelled shipments and in-transit shipments are excluded from both numerator and denominator.

**Rationale:** Using shipped_at as the cohort date ensures the denominator consists only of shipments that have reached a terminal state (delivered or RTO). If `delivered_at` or `rto_delivered_at` were used instead, the denominator would change as shipments resolved, making month-over-month comparisons inconsistent.

**Example:** 45 shipments dispatched in May. By calculation date: 38 delivered, 7 RTO'd. RTO Rate = 7/45 × 100 = 15.6%. Warning threshold exceeded.

*Legacy alias: BR-RET-01*

---

### BR-018: RTO Value Calculation

**Description:**
```
RTO Value = SUM(shipments.freight_total_inr × 2)
  WHERE status = 'RTO_DELIVERED'
    AND rto_delivered_at IN [period]
```
Two-way freight is estimated as outbound freight × 2. Shiprocket may charge a different reverse logistics rate — use actual Shiprocket invoice rates when available. Until invoice-level data is captured, the ×2 approximation applies.

**Rationale:** Every RTO costs Kirgo two freight legs: the outbound attempt (customer never received) and the inbound return to warehouse. This double freight cost represents cash permanently lost with no revenue offset.

**Example:** Zone B shipment (Shiprocket outbound freight = ₹120). RTO: 2-way cost estimate = ₹240. 7 RTOs in May at avg ₹120 outbound = ₹1,680 estimated RTO freight cost.

---

### BR-019: Return Inventory Restock (Customer Returns)

**Description:** Stock is added back to `inventory_ledger` (movement_type = 'return') only when the returned item passes QC: `returns.qc_status = 'pass'`. Failed QC items are written off: a `movement_type = 'write_off'` ledger entry removes them permanently from sellable stock.

**Rationale:** A returned activewear garment may be washed, worn, damaged, or missing packaging. Only quality-verified items can be resold. Restocking QC-failed items would inflate available inventory and lead to fulfilment of damaged goods.

**Example:** Customer returns Core Legging. QC finds stitching damage (qc_status = 'fail'). No restock entry. Write-off entry: quantity_delta = −1 with movement_type = 'write_off'. Inventory_value decreases by COGS (₹1,139). The item's value is expensed in the period.

*Legacy alias: BR-RET-03 (partial)*

---

### BR-020: RTO Inventory Restock

**Description:** RTO'd shipments are automatically restocked to `inventory_ledger` (movement_type = 'rto') when `shipments.rto_delivered_at` is populated. No QC is required for RTOs — the courier never opened the sealed package. If physical condition is suspect, a manual QC write-off can override.

**Rationale:** RTO items have not been opened by the customer. The courier handles and returns them in original condition. The additional step of QC before restock is unnecessary overhead for the high volume of COD RTOs typical in D2C fashion.

**Example:** Core Set (₹3,798, COGS ₹1,214) RTOs on 27 Jan. Shiprocket marks RTO_DELIVERED. System creates an inventory_ledger entry: variant = Core Set, quantity_delta = +1, movement_type = 'rto'. Stock rises by 1 unit.

*Legacy alias: BR-RET-03 (partial)*

---

### BR-021: Customer Return Financial Impact

**Description:** A customer return has three financial effects: (1) Net Revenue decreases by the refund amount (processed date, per BR-008). (2) COGS is effectively reversed (the unit returns to inventory at cost, increasing inventory value). (3) Two-way shipping cost: outbound freight (already incurred at delivery) is not recoverable; return freight may be borne by Kirgo or customer depending on policy.

**Rationale:** A return is a complete reversal of the original sale from a product perspective. The cash impact is the refund plus any freight cost Kirgo bears for the return leg.

**Example:** Core Legging (SP ₹2,199, COGS ₹1,139) returned and QC passed. Net Revenue −₹2,199 (at refund processing). Inventory +1 unit at COGS ₹1,139. Return freight (if Kirgo-paid): additional expense under expense_category = 'reverse_logistics'.

---

### BR-022: RTO Financial Impact

**Description:** An RTO has the following financial effects: (1) Zero revenue (per BR-014). (2) Two-way freight cost (per BR-018). (3) COD fee retained by courier (not refunded). (4) For prepaid RTOs: refund issued to customer (cash outflow). Inventory is restocked (per BR-020).

**Rationale:** RTOs are the most financially damaging per-unit event because Kirgo bears all costs (freight, COD fee) with zero revenue to offset them. This is why RTO Rate % is a P1 KPI with a Critical alert at >20%.

**Example:** COD Core Set (₹3,798) RTOs. Revenue = ₹0. Freight cost = ₹240 (outbound + return estimate). COD fee = approx ₹100. Net loss = −₹340 on top of COGS ₹1,214 still tied up in the returned inventory. Total economic impact = −₹340 cash + inventory temporarily at risk.

---

### BR-023: Return Inventory Recovery Assumption

**Description:** QC-passed returned units are treated as fully resalable stock at their original COGS. No markdown or depreciation is applied to returned inventory in the current schema. The assumption is that resaleable returns are indistinguishable from original stock.

**Rationale:** Kirgo's return volumes are low enough that returned items can be individually inspected and, if passed, repackaged and resold at full price. This simplification avoids the need for a separate markdown inventory layer in the current schema version.

**Example:** A Core Bra returned by a customer (QC pass) re-enters inventory. It appears in `inventory_ledger` at quantity_delta = +1. When next sold, revenue and COGS are calculated identically to any other Core Bra unit.

---

### BR-024: COD RTO Double-Loss Rule

**Description:** A COD RTO results in a double loss: (1) Two-way freight (outbound + return ~₹200–₹600 depending on zone). (2) COD charge (~₹50–₹100) is typically not refunded by the courier even on RTOs. There is no revenue offset because the COD was never collected.

**Rationale:** This rule exists to make the true cost of COD RTOs explicit. When RTO rate is high and COD mix is high, the combined effect materially erodes Contribution Margin. Both cost components must be tracked separately.

**Example:** Zone D COD order (₹2,199). RTO occurs. Outbound freight = ₹280. Return freight = ₹280. COD fee = ₹90. Total cash lost = ₹650. Revenue = ₹0. Economic loss vs delivering the order (GM ≈ ₹940) = ₹1,590 swing.

---

## Section 3: Inventory Rules

---

### BR-025: Opening Inventory Source of Truth

**Description:** Opening stock figures for each collection are seeded from the `ProductionSKU` sheet in `Kirgo Numbers.xlsx`. These values are entered into `inventory_batches.opening_quantity` at import time. Until a physical stockcount is performed and entered, the ledger-derived running balance is the authoritative current stock figure.

**Rationale:** The production run quantities are the only verified source of initial stock. WooCommerce and Shiprocket do not track warehouse inventory — they only record sales events. The `inventory_batches` table anchors the running balance.

**Example:** L3 Core Legging M (Black) opening quantity = 80 units (from ProductionSKU sheet). This is entered as inventory_batches.opening_quantity = 80. Subsequent sales deduct from this via inventory_ledger entries.

*Legacy alias: BR-INV-03*

---

### BR-026: Inventory Movement Types

**Description:** Every change to stock on hand is recorded in `inventory_ledger` with an explicit `movement_type`. Permitted types and their quantity_delta signs:

| movement_type | quantity_delta | Trigger |
|---------------|----------------|---------|
| `opening` | Positive | Initial batch entry at import |
| `sale` | Negative | Order delivered (shipments.status = DELIVERED) |
| `rto` | Positive | Shipment returned by courier (rto_delivered_at populated) |
| `return` | Positive | Customer return, QC passed |
| `adjustment` | Positive or Negative | Manual correction by admin |
| `write_off` | Negative | QC failed return; damaged; expired |
| `restock` | Positive | New purchase order received |

No other movement types are permitted.

**Rationale:** A strictly typed ledger ensures inventory movements can be audited, categorised, and individually reversed or corrected without modifying existing entries.

**Example:** Core Legging M Black: opening +80, sale −1 (delivered 19 Jan), sale −1 (delivered 22 Jan), rto +1 (RTO on 28 Jan). Running balance = 79.

---

### BR-027: Bundle Decomposition on Inventory Movements

**Description:** When a Set (bundle) variant is sold, two additional `inventory_ledger` entries must be created: one for the component Legging variant (quantity_delta = −1) and one for the component Bra variant (quantity_delta = −1), in addition to the bundle variant entry (quantity_delta = −1). The same decomposition applies to `rto` and `return` movements for bundle variants.

**Rationale:** Customers purchasing a Core Set are consuming 1 Core Legging unit and 1 Core Bra unit from physical stock. If only the bundle variant is decremented, the individual component stock counts become inaccurate. Component-level accuracy is essential for reorder decisions (a customer cannot buy a standalone Core Legging if the physical stock is tied up in sets that were counted separately).

**Example:** Core Set sold (1 unit). Inventory ledger entries:
- Core Set variant: quantity_delta = −1, movement_type = 'sale'
- Core Legging M (matching size): quantity_delta = −1, movement_type = 'sale'
- Core Bra M (matching size): quantity_delta = −1, movement_type = 'sale'

All three entries share the same `order_id` for traceability.

*Legacy alias: BR-INV-01*

---

### BR-028: Stock Cannot Go Negative

**Description:** Before processing a `sale` movement for any variant, validate that `SUM(inventory_ledger.quantity_delta) >= quantity_being_sold`. If the check fails, reject the sale movement and flag as a data quality error. `rto`, `return`, `restock`, and `adjustment` movements are exempt from this check.

**Rationale:** Negative stock is physically impossible. If the ledger shows negative stock, it indicates either a data import error (duplicate sales entries) or a missing opening inventory entry. A negative stock state corrupts all downstream KPIs: Days of Inventory, Inventory Value, Dead Stock %, and Reorder Quantity become meaningless.

**Example:** Core Bra XS has 2 units in stock. An import attempts to record 3 delivered units in the same day (likely a de-duplication error from a Shiprocket multi-row import). The third sale movement is rejected. Data quality alert is raised.

*Legacy alias: BR-INV-02*

---

### BR-029: Inventory Valuation Methodology

**Description:** All inventory is valued at COGS (cost price), not at selling price. Inventory Value = SUM over all variants of (current_stock_on_hand × product.cogs_total_inr). This is a cost-basis valuation — the amount of capital currently locked in unsold stock.

**Rationale:** Selling-price valuation would overstate the balance sheet asset, require markdown adjustments, and complicate cash flow planning. COGS-basis valuation directly answers the question "how much of our launch investment is still sitting in the warehouse."

**Example:** 79 Core Legging M Black units in stock. COGS per unit = ₹1,139. Inventory value contribution = ₹89,981. Across all active variants, total inventory value tells the founder what portion of L3's ₹5,05,000 investment is still uncommitted.

---

### BR-030: Dead Stock Definition

**Description:** A variant is classified as dead stock when:
- `SUM(inventory_ledger.quantity_delta) > 0` (stock exists), AND
- Zero units of that variant were delivered (`movement_type = 'sale'`) in the last 60 calendar days

The 60-day window is measured from the current date, not from the period start. The `alert_level` field in `inventory_forecasts` is set to `'watch'` for 60–90 days no sales, `'warning'` for > 90 days no sales.

**Rationale:** 60 days with no sales while stock exists indicates a structural demand problem for that SKU (typically XS or XL sizes in underserved sizes). These units require active intervention: promotions, bundles, or write-offs.

**Example:** Classic Legging XS (L1) has 3 units remaining. No delivery recorded for this variant in the last 65 days. Classification: dead stock (watch level). Analyst should consider including in a bundle promotion or clearance price.

---

### BR-031: Reorder Trigger

**Description:** A variant triggers `reorder_recommended = true` in `inventory_forecasts` when `days_to_stockout_30d < 30` AND `current_stock > 0`. Variants with zero stock are not flagged for reorder (they are already stocked out — the decision is at the collection/launch level). Variants with zero 30-day velocity are not flagged even if stock > 0 (dead stock — see BR-030).

**Rationale:** < 30 days is the operational threshold for initiating a reorder conversation with the supplier. Supplier lead time for Kirgo's China-based manufacturers is 60–90 days minimum. This means even triggering at 30 days creates a potential 30–60 day stockout gap — earlier triggers are preferable.

**Example:** Core Legging M Black: current stock = 12 units, 30-day velocity = 0.5 units/day, days_to_stockout = 24 days. reorder_recommended = true. Units to reorder = MAX(0, 0.5 × 90 − 12) = 33 units.

---

### BR-032: Reorder Quantity Formula

**Description:**
```
units_to_reorder[variant] = MAX(0, CEIL(daily_velocity_30d × 90) − current_stock)
```
The 90-day buffer ensures 3 months of stock at current velocity. The formula prevents over-ordering when current stock already covers a significant portion of the 90-day demand.

**Rationale:** A 90-day buffer matches Kirgo's approximate supplier lead time. Ordering less risks a repeat stockout before the new batch arrives. Minimum Order Quantities (MOQs) from suppliers are not yet tracked in the schema — the analyst must validate computed quantities against actual supplier MOQs before issuing a PO.

**Example:** Core Bra S Black: velocity = 0.3/day, current stock = 8. Units to reorder = MAX(0, 0.3 × 90 − 8) = MAX(0, 27 − 8) = 19 units. But if supplier MOQ for this SKU is 24 units, order 24.

---

### BR-033: Stock Cover Calculation

**Description:** Days of inventory for a single variant:
```
days_to_stockout = current_stock / daily_velocity_30d
```
Stock Cover Days for a whole collection (collection-level):
```
stock_cover_days[launch] = SUM(current_stock[all variants in launch])
                         / SUM(daily_velocity_30d[all variants in launch])
```
Both use the 30-day rolling velocity. The 7-day velocity is shown alongside for spike detection but does not drive alert levels.

**Rationale:** Per-variant and collection-level stock cover serve different decisions. Per-variant drives reorder timing for individual SKUs. Collection-level drives L4 launch timing — "when will Core be fully depleted?" is a collection-level question.

**Example:** Core collection: 200 total units remaining across all variants. Blended velocity = 2.5 units/day. Stock cover = 80 days. This means Core will be substantially depleted in approximately mid-September 2026, triggering an L4 launch urgency.

---

### BR-034: Physical Stockcount Precedence

**Description:** If a physical warehouse stockcount is performed and the counted quantities differ from the ledger balance, the physical count takes precedence. An `adjustment` entry must be created in `inventory_ledger` to reconcile the difference: `quantity_delta = (physical_count − ledger_balance)`, `movement_type = 'adjustment'`, `notes = 'Physical count reconciliation YYYY-MM-DD'`.

**Rationale:** The ledger is a transaction log — it can accumulate errors from missed movements, data entry mistakes, or import failures. A physical count is the ground truth for what actually exists in the warehouse.

**Example:** Ledger says 15 Core Bra M Black. Physical count finds 13. Adjustment entry: quantity_delta = −2, movement_type = 'adjustment'. Alert raised for investigation (where did the 2 units go?).

---

### BR-035: QC Fail Write-Off

**Description:** A returned item that fails QC must be removed from inventory immediately via a `write_off` movement: `quantity_delta = −1`, `movement_type = 'write_off'`. The COGS of the written-off unit is expensed as `expense_category = 'inventory_write_off'` in the `expenses` table.

**Rationale:** QC-failed items cannot be sold and must not inflate stock counts. The COGS must be recognised as an expense to accurately reflect the economic loss.

**Example:** Classic Legging returned with a torn seam (QC fail). write_off entry created. Expense entry: amount = ₹1,167 (Classic COGS), category = 'inventory_write_off', reference = return ID.

---

### BR-036: Size Distribution Reference

**Description:** For demand forecasting and reorder planning, use the following historical size distribution as a default when variant-level velocity data is insufficient (< 30 days of sales for a new launch):

| Size | Expected Demand Share |
|------|----------------------|
| XS | ~5% |
| S | ~25% |
| M | ~40% |
| L | ~25% |
| XL | ~5% |

This distribution is calibrated from L1, L2, and L3 sales data. It may be overridden by actual observed velocity once ≥ 30 days of sales exist for a new launch.

**Rationale:** Without size-level historical data (new launch), ordering uniformly across sizes leads to over-stocking of XS/XL and under-stocking of M/S. The distribution prevents this misallocation.

**Example:** L4 Core Flare launch. First 30-day velocity data not yet available. Reorder quantity split across sizes using 5/25/40/25/5 distribution: if total order = 100 units, allocate 5 XS / 25 S / 40 M / 25 L / 5 XL.

---

## Section 4: Product Costing Rules

---

### BR-037: COGS Components

**Description:** COGS per unit has exactly three components:
```
cogs_total_inr = cogs_manufacture_inr + cogs_shoot_import_inr + cogs_shipping_pkg_inr
```
- `cogs_manufacture_inr`: per-unit cost from the supplier invoice (factory price + FX conversion)
- `cogs_shoot_import_inr`: amortised share of photoshoot + customs/import logistics cost per unit
- `cogs_shipping_pkg_inr`: estimated per-unit packaging material + shipping provision

No other cost component enters COGS.

**Rationale:** These three components represent all costs incurred to bring the product to a sellable state at the warehouse. Outbound shipping (paid to Shiprocket) is NOT in COGS — it is a variable selling cost deducted at the Contribution Margin level.

**Example:** Core Legging: cogs_manufacture_inr = ₹960, cogs_shoot_import_inr = ₹109, cogs_shipping_pkg_inr = ₹70. cogs_total_inr = ₹1,139.

*Legacy alias: BR-GM-01*

---

### BR-038: Manufacturing Cost Derivation

**Description:** Manufacturing cost per unit = (Supplier invoice total in USD × RBI reference rate on invoice date) / total units ordered. For PayPal-routed payments, use the INR amount debited from the HDFC account (visible in `bank_transactions.withdrawal_inr`) to determine the effective exchange rate.

**Rationale:** Using the actual INR debited from the bank account captures the real FX cost including PayPal's conversion spread, which differs from the mid-market RBI rate. The bank debit is the true cash cost.

**Example:** L3 supplier invoice: $4,200 for 300 units. PayPal debit: ₹3,50,000. FX rate = 83.33. Manufacturing cost per unit = ₹3,50,000 / 300 = ₹1,167. (This is the Classic L1 rate — Core L3 used a different invoice.)

---

### BR-039: Import Cost Allocation

**Description:** Import and customs costs (freight forwarder fees, customs duty, port handling) incurred to bring the production batch to India are amortised across all units in that batch:
```
cogs_import_per_unit = total_import_cost_inr / total_units_in_batch
```
This is a fixed allocation — every unit in the batch carries the same import cost regardless of SKU, size, or colour.

**Rationale:** Import costs are batch-level fixed costs that cannot be attributed to individual SKUs. Equal allocation per unit is the standard approach and the most auditable.

**Example:** L3 Core batch: 400 total units. Import cost (customs + freight forwarder): ₹24,000. Import cost per unit = ₹60. All L3 SKUs carry ₹60 in their `cogs_shoot_import_inr`.

---

### BR-040: Photoshoot Cost Allocation

**Description:** Photoshoot cost (model fees, photographer, studio, post-processing) for a launch is amortised across all units in that launch's production run:
```
cogs_shoot_per_unit = total_shoot_cost_inr / total_units_in_batch
```
This is combined with import cost in the `cogs_shoot_import_inr` field.

**Rationale:** Photoshoot is a launch-level cost that produces marketing assets for the entire collection. Spreading it per unit ensures the cost is recovered as units sell, which aligns the expense recognition with revenue realisation.

**Example:** L3 Core shoot cost: ₹20,000 (approximate). 400 units. Shoot cost per unit = ₹50. Combined with import (₹60): `cogs_shoot_import_inr = ₹110` (rounded to ₹109 in actual data).

---

### BR-041: Packaging Cost Allocation

**Description:** Packaging cost per unit (poly bag, tag, inner box if applicable) is estimated at the time of production planning and embedded in `cogs_shipping_pkg_inr`. This is a per-unit estimate that may be updated between launches but is fixed within a launch.

**Rationale:** Packaging is a variable per-unit cost but is purchased in bulk and not tracked at unit level. Per-unit estimate is the standard simplification.

**Example:** Core Legging: poly bag + label = estimated ₹30 per unit. Included in `cogs_shipping_pkg_inr = ₹70` (which also includes a ₹40 shipping provision).

---

### BR-042: Shipping Provision Allocation

**Description:** An estimated outbound shipping cost is provisioned per unit within `cogs_shipping_pkg_inr`. This provision is an estimate based on average freight per order for that collection. The provision does NOT replace actual freight cost tracking — actual freight (from Shiprocket) is recorded in `shipments.freight_total_inr` and deducted at Contribution Margin.

**Rationale:** Including a shipping provision in COGS is an internal cost accounting choice. It provides a conservative Gross Margin figure that accounts for the expected freight burden. The actual vs provision variance is visible at the Contribution Margin level.

**Example:** Average expected outbound freight for a Legging = ₹100 (across all zones). Provision = ₹40 per unit (partial allocation — assumes most orders include multiple items, sharing freight). `cogs_shipping_pkg_inr = ₹70` (₹30 packaging + ₹40 provision).

---

### BR-043: Bundle (Set) COGS

**Description:**
```
Bundle COGS = Legging COGS + Bra COGS + ₹75 (shared packaging, once)
```
The ₹75 additional packaging reflects the outer box or combined packaging for a set. It is NOT added twice (once for legging, once for bra). The ₹75 is included in the bundle product's `cogs_shipping_pkg_inr`.

**Rationale:** A set is shipped in a single package. The packaging cost is incurred once. Adding packaging for both components individually would overstate COGS and understate Gross Margin for bundle sales.

**Example:** Core Set COGS:
- Core Legging COGS = ₹1,139 (but without the individual packaging provision = ₹1,109)
- Core Bra COGS = ₹899 (without individual packaging)
- Bundle packaging = ₹75
- Core Set COGS total = ₹1,109 + ₹899 + ₹75 = ₹2,083

The `products.cogs_total_inr` for Core Set should reflect this. Verify against the actual value in the schema.

*Legacy alias: BR-GM-03*

---

### BR-044: Gross Margin Calculation

**Description:**
```
Gross Margin per unit (INR) = selling_price_inr − cogs_total_inr
Gross Margin % = (selling_price_inr − cogs_total_inr) / selling_price_inr × 100
```
Gross Margin does NOT deduct outbound freight, COD charges, or ad spend. These are Contribution Margin deductions.

**Rationale:** Gross Margin measures the intrinsic economics of the product itself — how much value the product creates before any selling costs. Including shipping or ad spend in Gross Margin would conflate product profitability with operational efficiency, making product-level comparisons meaningless.

**Example:** Core Legging SP ₹2,199, COGS ₹1,139. Gross Margin = ₹1,060, GM% = 48.2%. Summer Legging SP ₹1,999, COGS ₹847. GM = ₹1,152, GM% = 57.6%. Summer has a higher % despite lower SP because COGS is significantly lower.

*Legacy alias: BR-GM-02*

---

### BR-045: COGS Is Fixed at Product Creation

**Description:** Once a product is created in the system with its COGS values, those values are immutable for that product record. If COGS changes (new supplier, new batch pricing), a new product version or a new launch's products must be created with updated COGS. Historical sold units retain their original COGS for margin calculations.

**Rationale:** Retroactively changing COGS on a product that has already been sold would alter historical gross margin calculations across all prior periods — corrupting the audit trail and making period-over-period comparisons unreliable.

**Example:** L4 Core Flare Legging has a higher manufacture cost (₹1,100 vs L3 Core Legging ₹960). Create a new product record for L4 Core Flare Legging with updated COGS. L3 Core Legging records are unchanged.

---

### BR-046: FX Conversion for Imported Goods

**Description:** All foreign-currency supplier payments are converted to INR using the rate implicit in the actual bank debit. Use `bank_transactions.withdrawal_inr` divided by the USD amount on the corresponding supplier invoice to derive the effective rate. This rate is used for COGS manufacture calculation only — it is not used for P&L FX reporting.

**Rationale:** PayPal and SWIFT transactions include a conversion spread that differs from mid-market rates. Using the actual bank debit ensures COGS reflects the true cash cost paid.

**Example:** Supplier invoice USD 3,500 for L3 components. Bank debit (PayPal POS PAYPAL *349771SS): ₹2,99,250. Effective FX rate = 85.50. Manufacturing cost per unit = ₹2,99,250 / units_ordered.

---

### BR-047: COGS Is Uniform Across Sizes Within a Product Type

**Description:** All size variants of the same product carry identical COGS. The manufacturing cost does not differ between a Size S and Size XL of the same product. If supplier invoices vary by size (uncommon in this category), that must be explicitly noted and separate COGS values entered.

**Rationale:** Suppliers typically charge a single unit price regardless of size for activewear. Using a uniform COGS simplifies inventory valuation and avoids an artificial margin difference between sizes.

**Example:** Core Legging XS, S, M, L, XL — all carry `cogs_total_inr = ₹1,139`. If a future supplier charges ₹50 more for XL, the COGS for that specific variant must be updated, and this rule must be noted as partially overridden.

---

### BR-048: Gross Margin % Is a GENERATED Column

**Description:** `products.gross_margin_pct` and `products.gross_margin_inr` are GENERATED columns in the database, automatically computed from `selling_price_inr` and `cogs_total_inr`. They must not be manually overwritten. Updating `selling_price_inr` or any COGS component field will automatically recalculate these columns.

**Rationale:** Derived values stored as redundant editable columns create inconsistency risk. GENERATED columns ensure the displayed margin always matches the underlying data.

**Example:** If Core Legging selling price is changed from ₹2,199 to ₹2,399 (price increase for L4), `gross_margin_inr` auto-updates to ₹1,260 (₹2,399 − ₹1,139) and `gross_margin_pct` updates to 52.5%. No manual update required.

---

## Section 5: Expense Classification Rules

---

### BR-049: COGS Classification

**Description:** COGS expenses are costs directly tied to producing sellable inventory. In Kirgo's model, COGS is embedded in the `products.cogs_total_inr` field (per-unit) and is not recorded as a separate `expenses` table entry. COGS is recognised implicitly when a unit is sold (via gross margin calculation) and when a unit is written off (explicit expense entry).

**Rationale:** COGS flows through the P&L as product revenue is recognised. It is not a cash outflow event at time of sale — the cash was paid to the supplier at batch purchase time. The expenses table captures operational cash outflows, not COGS accruals.

**Example:** Supplier payment of ₹3,50,000 for L3 batch (300 units) is recorded as `expense_category = 'supplier_payment'` at payment date. COGS of ₹1,139/unit is recognised as revenue is generated from each sold unit — not at the time of the supplier payment.

---

### BR-050: CAPEX Classification

**Description:** Launch investments (supplier payments for production runs, photoshoot costs, import logistics) are classified as CAPEX. They are recorded in `launch_expenses` linked to a specific `launch_id`, not in the general `expenses` table. CAPEX is not deducted in Net Margin calculation — it is tracked via Launch Profitability (KPI D-05) and recovered through revenue over the collection's lifetime.

**Rationale:** Treating launch investment as OPEX would make every launch month appear deeply unprofitable, obscuring the actual monthly operational health. The batch-launch model requires CAPEX to be tracked separately and recovered over the collection's sell-through period.

**Example:** L3 Core launch investment ₹5,05,000 total (manufacture + shoot + import). Recorded as 3 entries in `launch_expenses`: supplier_payment_1 (₹1,51,500 deposit), supplier_payment_2 (₹3,53,500 balance), shoot_cost (₹20,000). Not in `expenses` table. Not in monthly burn rate. Tracked in D-05 Launch Profitability.

---

### BR-051: OPEX Classification

**Description:** OPEX is recurring operating costs necessary to run the business, excluding COGS and CAPEX. In Kirgo's model, OPEX includes:
- SaaS subscriptions (Shiprocket, Google Workspace, WooCommerce hosting, Gokwik)
- Bank charges and FX conversion costs
- Miscellaneous office/operational expenses

OPEX entries go into the `expenses` table with an appropriate `expense_category`.

**Rationale:** OPEX is the fixed and semi-fixed cost base that determines the minimum viable monthly burn. Separating OPEX from CAPEX and marketing allows each category to be tracked and optimised independently.

**Example:** Google Workspace subscription: ₹1,227.20 on 3rd of each month. Category = 'saas_subscription'. Source = bank_transactions narration "GOOGLE WORKSPACE CYBS".

---

### BR-052: Marketing Expense Classification

**Description:** All paid advertising spend is classified as marketing. Marketing expenses are stored in `ad_spend_daily` (not in `expenses`) for date-level granularity. Summary entries may also appear in `expenses` as month-level allocations.

| Platform | Category | Source |
|----------|----------|--------|
| Google Ads | `ad_spend_google` | Google Ads export |
| Meta / Instagram Ads | `ad_spend_meta` | Meta Ads export |
| Influencer fees (future) | `influencer_marketing` | Manual invoice |

GST on ad spend is a tax, not a marketing expense. Use `spend_inr` (net) for all marketing efficiency KPIs, not `total_inr` (inclusive of GST).

**Rationale:** Marketing is a variable investment tied directly to demand generation. Separating it enables ROAS, MER, and CAC calculations. Daily granularity is required because ad spend varies significantly day to day.

**Example:** May 2026 Google Ads: PMAX campaign ₹6,688.87 + Test 1 ₹3,897.86 = ₹10,586.73 net spend. GST (18%) = ₹1,905.61. Only ₹10,586.73 enters ROAS denominator. Total debit from account includes GST.

---

### BR-053: Financing Expense Classification

**Description:** Financing expenses are costs related to payment infrastructure and FX conversion. These are NOT OPEX — they are the cost of the financial infrastructure:

| Expense | Category | Notes |
|---------|----------|-------|
| EaseBuzz gateway fee (~2%) | `gateway_fee` | Deducted at settlement |
| Infibeam gateway fee (~2%) | `gateway_fee` | Deducted at settlement |
| Gokwik service fee | `gateway_fee` | COD checkout optimisation |
| PayPal conversion spread | `fx_loss` | Difference between mid-rate and actual |
| HDFC bank charges | `bank_charge` | Account maintenance, NEFT fees |

**Rationale:** Gateway fees reduce actual cash collected vs revenue recognised. They are a cost of accepting digital payments and must be tracked separately from operating expenses.

**Example:** ₹82,000 in May prepaid revenue. EaseBuzz settles at 98% = ₹80,360. The ₹1,640 gateway fee is classified as `gateway_fee` expense — not included in operating burn rate, but included in Net Margin calculation.

---

### BR-054: Founder Funding Classification

**Description:** Transfers from Kanika Rodrigues to the HDFC business account are classified as `transaction_type = 'founder_transfer'` in `bank_transactions`. They are NOT revenue, NOT operating income, and NOT a loan (unless specifically structured as one). They are equity contributions. They MUST be excluded from:
- All revenue KPIs
- Cash Inflow from operations (G-01)
- Net Cash Flow (G-03)
- Burn Rate calculation (G-04)

**Rationale:** Including founder capital injections in operating metrics would make the business appear to generate more cash than it actually does from operations. This would mask true burn rate and distort the Runway calculation.

**Example:** Kanika transfers ₹1,00,000 to HDFC on 15 Mar (narration: "KANIKA RODRIGUES"). Classified as `founder_transfer`. Excluded from G-01 (Cash Inflow). Only visible in a dedicated "Equity & Funding" view. Net Cash Position (A-06) reflects the full bank balance including this transfer.

*Legacy alias: BR-BANK-04*

---

### BR-055: Customer Refund Classification

**Description:** Refunds paid to customers are classified as `transaction_type = 'customer_refund'` in `bank_transactions`. They are tracked separately from operating expenses. They reduce Net Revenue (via the `returns` table) and appear as cash outflows in G-02 (Cash Outflow). They must not be double-counted by also entering them as `expenses` table entries.

**Rationale:** Refunds appear in two places: the `returns` table (as a revenue reversal) and `bank_transactions` (as a cash outflow). Double-counting in `expenses` would over-state operating costs.

**Example:** Core Legging refund of ₹2,199 paid via bank transfer. Bank narration: "KIRGO REFUND." Classified as `customer_refund`. Deducted from Net Revenue via returns table. Appears in G-02 under the `customer_refund` category.

---

### BR-056: Bank Charge Classification

**Description:** Bank fees, account maintenance charges, NEFT/IMPS charges, POS fees, and the `DC INTL POS TXN` / `EPR` narration entries are classified as `transaction_type = 'bank_charge'`. These are included in OPEX for Net Margin but excluded from the Contribution Margin calculation.

**Rationale:** Bank charges are a cost of maintaining the business bank account, not a cost of selling products. Including them in Contribution Margin would mix product-level economics with financial infrastructure costs.

**Example:** HDFC charges ₹590 quarterly account maintenance + ₹18 GST. Classified as `bank_charge`. Deducted in Net Margin (D-03) as part of OPEX but not in Contribution Margin (D-02).

*Narration patterns: `DC INTL POS TXN`, `EPR`, `HDFC CHG`*

---

### BR-057: Expense Category Master Reference

**Description:** The following 15 expense categories are the complete permitted set for the `expense_category` field in both `expenses` and `bank_transactions`:

| Category | Section | Typical Source | Example |
|----------|---------|----------------|---------|
| `supplier_payment` | CAPEX | Bank → PayPal/SWIFT | L3 balance payment ₹3,53,500 |
| `photoshoot` | CAPEX | Bank → Photographer invoice | L3 shoot ₹20,000 |
| `import_logistics` | CAPEX | Bank → Freight forwarder | Import customs + handling |
| `shiprocket_recharge` | OPEX | Bank → Bigfoot Retail Solutions | Wallet top-up ₹20,000 |
| `courier_payment` | OPEX | Bank → Delhivery / Amazon | Direct courier invoice |
| `ad_spend_google` | Marketing | Bank → Google / ads export | May 2026 ₹10,587 |
| `ad_spend_meta` | Marketing | Bank → Meta / ads export | May 2026 ₹10,000 |
| `influencer_marketing` | Marketing | Manual | Fee to influencer |
| `saas_subscription` | OPEX | Bank → Google / WooCommerce | Workspace ₹1,227/mo |
| `gateway_fee` | Financing | Settlement deduction | EaseBuzz 2% fee |
| `bank_charge` | Financing | Bank statement | Account maintenance |
| `customer_refund` | Revenue adj. | Bank → customer | Returned order refund |
| `fx_loss` | Financing | PayPal spread | Supplier payment FX |
| `inventory_write_off` | COGS adj. | Manual | QC-failed return |
| `miscellaneous` | OPEX | Manual | Packaging materials, tape |

No category outside this list may be used. Unclassified transactions must be held in `transaction_type = 'unclassified'` until manually resolved.

---

### BR-058: Shiprocket Recharge Classification

**Description:** Payments to "BIGFOOT RETAIL SOLUT" (Shiprocket's registered entity) are classified as `shiprocket_recharge` — a prepayment to the Shiprocket wallet, not a per-shipment courier payment. This prepayment is NOT an expense at the time of recharge — the actual expense is recognised when shipments are dispatched and `shipments.freight_total_inr` is populated.

**Rationale:** Shiprocket operates on a prepaid wallet model. The wallet recharge is a balance transfer, not an expense. Recognising it as an expense at recharge time would front-load shipping costs unrelated to the delivery period.

**Example:** Shiprocket wallet recharged ₹20,000 on 1 May. 45 shipments dispatched in May consuming ₹8,200 in freight. The ₹20,000 recharge ≠ May shipping expense. May shipping expense = ₹8,200 (from shipments.freight_total_inr).

---

### BR-059: SaaS Subscription Expense Timing

**Description:** SaaS subscription charges are expensed in the month they are debited from the bank account. Google Workspace debits on the 3rd of each month (₹1,227.20). WooCommerce hosting is annual. Annual subscriptions must be amortised monthly (annual_fee / 12) in the `expenses` table if the P&L is to reflect monthly OPEX accurately.

**Rationale:** Monthly P&L should reflect the OPEX attributable to that month. A one-time annual debit of ₹15,000 in one month should not appear as a ₹15,000 expense in that month's P&L — it should be ₹1,250/month.

**Example:** Google Workspace: ₹1,227.20 monthly debit on 3rd → expense in that month. If WooCommerce hosting is ₹18,000/year billed in April → create 12 expense entries of ₹1,500 each, April through March.

---

### BR-060: COD Charge Classification

**Description:** Shiprocket's COD handling charge (`shipments.cod_charges_inr`) is deducted from COD remittances. It is classified as part of `Contribution Margin` deduction — specifically in the shipping/fulfilment cost line. It appears in `bank_transactions` as a net deduction (Shiprocket remits COD amount minus their charges) and is NOT a separate expense entry.

**Rationale:** COD charges are Shiprocket's fee for collecting cash on behalf of Kirgo. They are a direct cost of the COD payment method and appropriately deducted at Contribution Margin level alongside freight costs.

**Example:** COD order ₹2,199. Shiprocket COD fee = ₹2,199 × 1.5% = ₹33. Bank receives ₹2,199 − ₹33 − ₹120 freight = ₹2,046. The ₹33 COD fee reduces Contribution Margin.

---

### BR-061: GST Treatment

**Description:** GST collected from customers (on the product selling price) is a tax liability, not revenue. GST components are not currently tracked in the schema (WooCommerce does not break out GST separately in the available data). GST paid on purchases (input GST) is similarly not separately tracked. This is a known schema gap (DATA_DICTIONARY.md Appendix E). All revenue and cost figures in the platform are treated as inclusive of applicable taxes.

**Rationale:** Kirgo is a GST-registered entity. However, until GST input and output data is captured separately, including it in all financial figures (rather than trying to net it incorrectly) is the safer approach.

**Example:** Core Legging SP ₹2,199 is tax-inclusive. Revenue recognised = ₹2,199. There is no "net of GST" adjustment in the current schema. When GST reporting is added, all financial figures will need re-derivation.

---

### BR-062: Supplier Payment vs Restock Classification

**Description:** Supplier payments for the initial production run of a new launch are CAPEX (`launch_expenses`). Supplier payments for restocking an existing product (e.g., Classic Leggings 2, L2 restock) are COGS/CAPEX depending on the restock scale. Document the decision at the time of the purchase order and record in `launch_expenses` for large restocks or `expenses` with category `supplier_payment` for small top-ups.

**Rationale:** New launches create new inventory assets that will generate future revenue over months. Restocks replenish an existing SKU and are more directly tied to near-term sales. The distinction affects how the investment is tracked in Launch Profitability (D-05).

**Example:** L2 restock of Classic Leggings 2 (same mould, same supplier, different colourway): treated as a mini-launch (new launch_id = 2b) with its own investment and sell-through tracking. Not mixed with L2 Summer's investment.

---

### BR-063: Gateway Fee Estimation

**Description:** Where gateway fees are not explicitly broken out in bank statement data (EaseBuzz settles net — the fee is the difference between gross revenue and settled amount), the fee must be estimated as:
```
gateway_fee_inr = gross_revenue_settled_period × gateway_fee_rate
```
Default rate: EaseBuzz/Infibeam = 2.0%, Gokwik = per contract (currently unknown). Record as `gateway_fee` expense in the month the settlement occurs.

**Rationale:** Gateway fees are a material cost (2% of prepaid revenue). Approximating them from the settlement-to-revenue gap ensures the Contribution Margin is not overstated.

**Example:** May prepaid revenue ₹60,000. EaseBuzz settlement ₹58,800. Gateway fee = ₹1,200 (2%). Record as expense: amount ₹1,200, category `gateway_fee`, date = May settlement date.

---

## Section 6: Cash Flow Rules

---

### BR-064: Cash Inflow Definition

**Description:** Cash Inflow consists of all deposits to the HDFC business account from operational sources:

| Source | Transaction Type | Narration Pattern |
|--------|-----------------|-------------------|
| EaseBuzz prepaid settlements | `gateway_settlement` | `EASEBUZZ PVT LTD PA ESCROW` |
| Infibeam prepaid settlements | `gateway_settlement` | `ICICI BANK NODAL AC INFIBEAM` |
| Shiprocket COD remittances | `cod_remittance` | `SHIPROCKET COD CRF ID XXXXXXXX` |

Founder transfers (`founder_transfer`) and miscellaneous credits not from these sources are excluded from operational Cash Inflow.

**Rationale:** Operational cash inflow represents actual cash generated by the business from selling products. Non-operational inflows (founder capital, tax refunds, unknown credits) must not inflate operational cash metrics.

*Legacy alias: BR-BANK-01 (partial)*

---

### BR-065: Cash Outflow Definition

**Description:** Cash Outflow consists of all debits from the HDFC account for operational purposes. Categorised as:

| Category | Included in Burn Rate? |
|----------|----------------------|
| `shiprocket_recharge` | Yes |
| `courier_payment` | Yes |
| `ad_spend_meta` | Yes |
| `ad_spend_google` | Yes |
| `saas_subscription` | Yes |
| `customer_refund` | Yes |
| `bank_charge` | Yes |
| `supplier_payment` | No (CAPEX) |
| `founder_transfer` (OUT) | No (equity) |

**Rationale:** Burn Rate (G-04) measures the operational cash cost of running the business. CAPEX (supplier payments) and founder withdrawals are excluded because they are not recurring operational costs and would distort the sustainability metric.

---

### BR-066: Gateway Settlement Treatment

**Description:** EaseBuzz and Infibeam settle in batches, typically T+2 to T+3 business days from payment collection. Each bank credit corresponds to multiple orders. The `gateway_settlements` table maps each settlement to a bank entry and the constituent orders. Revenue is recognised at order delivery date (BR-001) — the settlement date affects Cash Inflow only.

**Rationale:** Settlements are batch events that bundle multiple order payments. The revenue vs cash timing difference (settlement lag) is the key metric for cash flow planning. Mapping settlements to orders enables the reconciliation of "revenue recognised" vs "cash received."

**Example:** 8 May prepaid orders (₹22,400 total). EaseBuzz settles on 10 May (T+2): ₹21,952 (net of 2% fee). Revenue recognised: 8 May delivery dates. Cash received: 10 May. The ₹448 fee difference is the gateway cost.

*Legacy alias: BR-BANK-01, BR-BANK-02, BR-CF-01 (partial)*

---

### BR-067: COD Settlement Treatment

**Description:** Shiprocket remits COD collections in batches identified by a CRF ID. The CRF ID appears in both `shipments.cod_crf_id` and `bank_transactions.extracted_reference` (parsed from narration pattern `SHIPROCKET COD CRF ID XXXXXXXX`). Matching these two fields confirms remittance. Settlement lag: T+7 to T+14 from delivery date.

**Rationale:** COD outstanding (G-06) is the difference between delivered COD revenue and matched remittances. Without CRF-based reconciliation, it is impossible to know which delivered COD orders have been paid and which are still in transit with the courier.

**Example:** Core Set COD delivered 19 Jan. `cod_crf_id = 12269675`. Bank credit on 28 Jan: narration "SHIPROCKET COD CRF ID 12269675" → `extracted_reference = '12269675'`. Match found: this COD has been remitted. COD outstanding balance decreases.

*Legacy alias: BR-BANK-03, BR-CF-01 (partial)*

---

### BR-068: Prepaid Settlement Lag Assumption

**Description:** For cash forecasting purposes, assume prepaid order revenue converts to bank cash in T+3 business days. Use this assumption in `cashflow_forecasts.prepaid_settlement_lag_days`. The actual lag can be validated by comparing `orders.created_at` (for prepaid) to `bank_transactions.transaction_date` for the corresponding settlement.

**Rationale:** A single, consistent lag assumption enables reliable cash forecasting. T+3 is conservative (EaseBuzz typically settles T+2) — being conservative ensures the forecast never overstates available cash.

**Example:** May forecast: ₹40,000 prepaid revenue expected in week 1. Cash inflow in week 1 = ₹40,000 × 0.98 (net gateway fee) arriving T+3 = expected in days 3–5 of the month.

---

### BR-069: COD Settlement Lag Assumption

**Description:** For cash forecasting, assume COD revenue converts to bank cash in T+10 calendar days (midpoint of the T+7 to T+14 range). Use this assumption in `cashflow_forecasts.cod_settlement_lag_days`. A portion of COD orders will become RTOs (use the current RTO rate assumption) — those generate zero cash.

**Rationale:** COD cash is less predictable than prepaid. T+10 midpoint with an RTO adjustment gives a conservative but realistic cash receipt estimate. Actual CRF remittance timing varies by Shiprocket cycle.

**Example:** May forecast: 20 COD orders expected, avg ₹2,000 each = ₹40,000 potential COD revenue. RTO rate assumption = 15%. Expected COD cash = ₹40,000 × 0.85 = ₹34,000, expected in bank between days 10–24 of the month.

---

### BR-070: COD Outstanding Calculation

**Description:**
```
COD Outstanding = SUM(shipments.cod_payable_inr)
  WHERE payment_method = 'cod'
    AND status = 'DELIVERED'
    AND (cod_crf_id IS NULL
         OR cod_crf_id NOT IN
           (SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'))
```
COD Outstanding represents cash that has been collected by the courier from the customer but not yet remitted to Kirgo's bank account.

**Rationale:** This is the most important short-term receivable metric. High COD outstanding with a low bank balance is a temporary liquidity gap, not a solvency issue. Identifying it explicitly prevents the founder from making spend decisions based on the bank balance alone.

**Example:** 10 COD orders delivered in the last 7 days, avg ₹2,200 each = ₹22,000 COD outstanding. Bank balance ₹40,000. True economic position: ₹62,000. The ₹22,000 will arrive within the next 7 days.

---

### BR-071: Cash vs Accrual Reconciliation

**Description:** Cash-basis metrics (G-01 to G-06) and accrual-basis metrics (A-01 Net Revenue) will diverge within any given month. The reconciliation is:

```
Cash Inflow (month) ≈ Prior month Net Revenue × (1 − RTO rate)
                      + Prior month COD outstanding
                      − Gateway fees
```

This reconciliation should be performed monthly to validate that the platform's cash tracking is complete. Significant unexplained gaps (> ₹5,000) require investigation.

**Rationale:** Cash and accrual figures tracking the same underlying business should reconcile within a predictable lag. A failure to reconcile signals a missing bank entry, duplicate revenue recognition, or an unrecorded settlement.

---

### BR-072: Founder Transfer Exclusion

**Description:** All entries in `bank_transactions` where `transaction_type = 'founder_transfer'` are excluded from: (1) Cash Inflow (G-01), (2) Cash Outflow (G-02), (3) Net Cash Flow (G-03), (4) Burn Rate (G-04), (5) Runway (G-05). They are included only in the closing bank balance (A-06) since they physically impact the account.

**Rationale:** Founder transfers are equity events. Including them in operational cash flow metrics would misrepresent the business's standalone cash generation ability.

*Legacy alias: BR-BANK-04*

---

### BR-073: Supplier Payment Timing

**Description:** Supplier payments follow a split structure:
- Deposit (30–35% of PO value) at order confirmation — typically SWIFT or PayPal
- Balance payment (65–70%) before shipment dispatch from factory

Both payments are recorded in `launch_expenses` and `bank_transactions`. FX conversion uses the bank debit INR amount (BR-046). The timing gap between deposit and balance payment (typically 60–90 days) is the production lead time.

**Rationale:** Tracking both tranches of supplier payment separately enables accurate CAPEX timing in cash forecasting. A ₹3,50,000 balance payment is a predictable large outflow that must appear in the cash forecast 60–90 days after the deposit.

**Example:** L3 Core: Deposit ₹1,51,500 in Oct 2025. Balance payment ₹3,53,500 in Jan 2026. Both visible in bank_transactions as `PAYPAL *349771SS`. Launch launched Jan 2026 after balance payment cleared.

*Legacy alias: BR-CF-03*

---

### BR-074: Outstanding Payables Definition

**Description:** Outstanding payables are commitments to pay that have not yet been debited from the bank account. They include:
1. Pending customer refunds (`returns.refund_status = 'pending'`) — cash owed to customers
2. Shiprocket wallet balance drawdowns (pre-recharged wallet being consumed by shipments)
3. Any supplier balance payment due but not yet made

These are tracked in `cashflow_forecasts.expected_outflows` as anticipated debits.

**Rationale:** Including outstanding payables in cash forecasting prevents the cash runway calculation from overstating available cash. The bank balance minus outstanding payables = true free cash.

**Example:** Bank balance ₹80,000. Pending refunds ₹6,400. Shiprocket wallet remaining committed balance (shipments in transit) ₹3,200. True free cash ≈ ₹70,400.

---

## Section 7: Marketing Attribution Rules

---

### BR-075: Current Attribution Model: Last-Touch UTM

**Description:** The current attribution model is last-touch UTM: the campaign/source/medium recorded in `orders.utm_source`, `utm_medium`, `utm_campaign` at the time of order placement is credited with the sale. No multi-touch attribution is implemented.

**Rationale:** Last-touch attribution is the standard starting model for early-stage D2C brands. It is simple to implement, requires only UTM parameters (already partially captured by WooCommerce), and provides directional insight into which channels are driving orders — even if imperfect.

---

### BR-076: First-Touch Attribution — Not Currently Tracked

**Description:** First-touch attribution (which channel originally brought the customer to the site) is not captured in the current schema. WooCommerce only captures UTM at time of order. Session-level analytics (Google Analytics, Meta Pixel) would be required for first-touch data. This is a known schema gap.

**Rationale:** First-touch is valuable for understanding brand awareness channels. However, implementing it requires session stitching across devices and sessions — beyond the current data architecture scope.

---

### BR-077: UTM Parameter Handling

**Description:** UTM parameters are captured from `orders.utm_source`, `utm_medium`, and `utm_campaign`. These are populated by WooCommerce when a customer arrives via a tracked link. Current expected population rate: ~30% of orders (70% arrive via direct/organic without UTMs). Orders with UTMs are attributed to the indicated campaign. Orders without UTMs are treated per BR-078.

**Rationale:** A 70% unattributed rate is high but typical for early-stage D2C brands before systematic UTM tagging is applied to all ad creatives. The attribution data that does exist should be used; the gap should be explicitly acknowledged in all marketing KPIs.

---

### BR-078: Missing Attribution Handling

**Description:** Orders where `utm_source IS NULL` are classified as `'organic_or_direct'` in all attribution analysis. They are NOT distributed proportionally to known channels (channel blending would introduce attribution errors). The `organic_or_direct` bucket is reported as a distinct attribution category.

**Rationale:** Proportional distribution (assuming unattributed orders follow the same channel split as attributed orders) introduces assumptions that may be fundamentally wrong. Direct/organic traffic has different economics than paid traffic. Keeping unattributed orders in their own bucket maintains data integrity.

**Example:** 40 May orders: 12 have UTM (8 Google, 4 Meta), 28 have no UTM. Attribution report: Google 8, Meta 4, Organic/Direct 28. CAC calculation uses only the 12 attributed orders for channel-level CAC; blended CAC uses all 40 orders.

---

### BR-079: Organic Traffic Classification

**Description:** Orders arriving via typed URL, bookmarks, or non-UTM Google organic search are classified as `utm_source = 'organic'` only if WooCommerce captures an organic referrer. If no referrer is captured, they fall into `'organic_or_direct'` (BR-078). Organic orders contribute to revenue and order count KPIs but are excluded from paid marketing efficiency metrics (ROAS, CAC).

**Rationale:** Organic traffic has zero marginal ad cost. Including organic orders in ROAS denominator (as "revenue from all ads") would artificially inflate ROAS. ROAS should reflect only revenue that can plausibly be attributed to paid media.

---

### BR-080: Blended ROAS as Current Standard

**Description:** Until order-level paid attribution is available for ≥ 70% of orders, use Blended ROAS:
```
Blended ROAS = Total Net Revenue in Period / Total Paid Ad Spend in Period
```
This divides all revenue (including organic) by all ad spend. It is a conservative, consistent metric. Per-campaign ROAS is computed only when campaign_id is present in `ad_spend_daily` and can be matched to UTM-tagged orders.

**Rationale:** Blended ROAS is honest about the attribution gap. It gives the founder a single number to track efficiency of total marketing investment, even if individual channel efficiency cannot yet be isolated.

*Legacy alias: BR-CM-02 (partial)*

---

### BR-081: Ad Spend Campaign Attribution

**Description:** When `ad_spend_daily.campaign_id` is populated AND WooCommerce orders carry matching `utm_campaign`, campaign-level ROAS can be computed. This requires the UTM campaign value in WooCommerce to exactly match the `campaign_id` in the ads export. Any mismatch is treated as unattributed.

**Rationale:** Campaign-level ROAS enables creative and audience optimisation. It is the target state as UTM coverage improves. Until then, campaign-level ROAS should be shown alongside a "coverage %" indicator (% of spend with matched UTMs).

**Example:** May 2026 Google PMAX (campaign_id = `pmax_may2026`). If WooCommerce orders have `utm_campaign = 'pmax_may2026'`, campaign ROAS = revenue from those orders / ₹6,688.87 PMAX spend. Currently, UTM coverage is low — blended ROAS is the primary metric.

---

### BR-082: Ad Spend GST Exclusion

**Description:** All marketing efficiency KPIs (ROAS, MER, CAC) use `ad_spend_daily.spend_inr` (net of GST) as the denominator, not `total_inr` (inclusive of 18% IGST). GST paid on ad spend is an input tax credit recoverable from GST filings — it is not a net marketing cost.

**Rationale:** GST on ad spend is a recoverable tax, not a permanent cost. Including it in ROAS denominator would understate ROAS by approximately 15% and misrepresent the true cost of advertising.

**Example:** May 2026 total Google + Meta spend: ₹20,440 net. GST (18%) = ₹3,679. Total debit from account = ₹24,119. Use ₹20,440 in ROAS formula. ROAS = Net Revenue / ₹20,440 (not ÷ ₹24,119).

---

## Section 8: Forecasting Rules

---

### BR-083: Revenue Forecasting Model: LA-WMA

**Description:** The revenue forecast uses the Launch-Adjusted Weighted Moving Average (LA-WMA) model. The model is defined in `FORECASTING_MODEL.md`. Output is stored in `revenue_forecasts`. The model formula:

```
Forecast(t) = WMA(actuals, weights) × Launch_Phase_Factor × Stock_Availability_Factor
            [× February_Multiplier if forecast_month is February]
```

This is the only approved revenue forecasting method for the platform. Do not replace with a generic time-series model that does not account for launch decay.

**Rationale:** Generic time-series models (ARIMA, Holt-Winters) fail on Kirgo's data because the revenue pattern is launch-driven, not seasonality-driven. Standard models would extrapolate recent low months and underestimate post-launch peaks.

*Legacy alias: BR-FORE-01 (partial)*

---

### BR-084: WMA Weights

**Description:** The weighted moving average uses the last 3 months of actuals for the same collection, weighted:
```
WMA = (Month_t-1 × 3 + Month_t-2 × 2 + Month_t-3 × 1) / 6
```
More recent months carry more weight. If fewer than 3 months of actuals exist for the collection, apply BR-089 (new launch fallback).

**Rationale:** The most recent month's revenue is the strongest signal for near-term trajectory. Equal weighting would dilute the signal from recent months when velocity is changing rapidly (early launch acceleration or mid-launch decay).

---

### BR-085: Launch Phase Decay Factors

**Description:** Every forecast is multiplied by a Launch Phase Factor that modulates revenue based on the number of months since the collection launched:

| Months Since Launch | Factor |
|--------------------|--------|
| 1 | 1.00 |
| 2 | 0.90 |
| 3–4 | 0.75 |
| 5–6 | 0.60 |
| 7–9 | 0.40 |
| 10+ | 0.20 |

The factor is stored in `revenue_forecasts.launch_phase_factor`. `launches.launched_at` is the reference date.

**Rationale:** Kirgo's revenue consistently follows a decay curve from the launch peak. The factors are calibrated from L1, L2, and L3 actual revenue patterns. Using a flat WMA without the decay factor would over-forecast in later launch months.

*Legacy alias: BR-FORE-01*

---

### BR-086: Stock Availability Gate

**Description:** The forecast is multiplied by a Stock Availability Factor derived from total remaining stock for the collection:

| Remaining Stock | Factor |
|----------------|--------|
| 0 units | 0.00 |
| < 10 units | 0.30 |
| 10–29 units | 0.70 |
| ≥ 30 units | 1.00 |

`inventory_forecasts.stock_availability_factor` carries this value. When stock hits zero for all variants in a collection, the forecast gates to ₹0 — no revenue is possible from a sold-out collection.

**Rationale:** A collection cannot generate revenue it cannot fulfil. The stock availability gate prevents forecasting revenue from inventory that no longer exists, which would cause the cash forecast to predict income that won't materialise.

---

### BR-087: February Seasonality Multiplier

**Description:** For any forecast month that is February, apply a 1.20× seasonal multiplier:
```
if forecast_month.month == 2:
    Forecast *= 1.20
```
This multiplier is applied after the Launch Phase Factor and Stock Availability Factor.

**Rationale:** Kirgo has experienced its highest revenue months in February consistently: Feb 2024 ₹97k (peak at the time), Feb 2026 ₹98k (new all-time peak). The Valentine's Day / gifting cycle and "new year, new fitness" motivation drives elevated demand in February. The 1.20× factor is calibrated from the observed February uplift vs adjacent months.

---

### BR-088: Minimum Actuals Requirement for WMA

**Description:** The WMA component of LA-WMA requires at least 3 months of non-zero actuals for the same collection (`kpi_monthly_snapshot` rows where `actual_revenue_inr > 0` for the relevant `launch_id`). If fewer than 3 months exist, apply the new launch fallback (BR-089).

**Rationale:** A WMA with fewer than 3 data points is unreliable. Using 1 or 2 months of data would produce a forecast dominated by noise rather than signal.

---

### BR-089: New Launch First-Month Forecast Fallback

**Description:** For a brand-new launch where fewer than 3 months of actuals exist, estimate the first-month forecast using the prior launch's Month 1 revenue, adjusted for the AOV difference:
```
Forecast_Month1[Ln] = Revenue_Month1[Ln-1] × (AOV[Ln] / AOV[Ln-1])
```
For Month 2, use the single available actual + the decay factor (no WMA). From Month 3, transition to full WMA.

**Rationale:** Each Kirgo launch generates a higher AOV than the previous one (L1 ₹1,900 → L2 ₹2,100 → L3 ₹3,013). Scaling the prior launch's Month 1 by the AOV uplift is the most reasonable estimate in the absence of actual data.

**Example:** L4 Core Flare expected AOV ₹3,200. L3 Core Month 1 revenue ₹69,000 at AOV ₹3,013. L4 Month 1 forecast = ₹69,000 × (₹3,200 / ₹3,013) = ₹73,280.

---

### BR-090: Revenue Forecast Horizon

**Description:** Revenue forecasts are generated for the next 3 calendar months. The current month (if incomplete) uses a blend of actuals-to-date and forecast for remaining days. Forecasts beyond 3 months are not stored in `revenue_forecasts` — they carry insufficient confidence for operational use.

**Rationale:** Kirgo's launch-decay model has meaningful predictive power within 3 months. Beyond 3 months, the model's decay factor cascade and stock availability uncertainty make the forecast directional at best. A 3-month horizon matches the operational planning cycle (ad budget, supplier discussions).

---

### BR-091: Cash Forecast Inflow Derivation

**Description:** Cash forecast inflow is derived from revenue forecast using payment mix assumptions:
```
Expected_Inflow[month] =
  (Revenue_Forecast × prepaid_mix) × (1 − gateway_fee_rate) × settlement_lag_factor
  + (Revenue_Forecast × cod_mix) × (1 − cod_charge_rate) × (1 − expected_rto_rate) × cod_lag_factor
```
`cashflow_forecasts` stores these assumptions. The analyst must input `planned_prepaid_mix` (default: current 3-month average) and `expected_rto_rate` (default: trailing 3-month RTO rate).

---

### BR-092: Cash Forecast Outflow Inputs

**Description:** Cash forecast outflows require the following analyst inputs before generation:
1. `planned_ad_spend` — total ad budget for the forecast period
2. `expected_supplier_payment` — any L4 deposit or balance payment scheduled
3. `expected_other_opex` — any known non-recurring OPEX

Fixed OPEX (Shiprocket recharge, SaaS subscriptions) is estimated from the 3-month trailing average. Variable OPEX (freight) is estimated from revenue forecast × average freight rate per delivered order.

**Rationale:** Automated outflow estimation without analyst input would miss the most impactful variable: whether or not an L4 supplier deposit is planned. This is a decision that can swing the cash position by ₹1,50,000.

---

### BR-093: Inventory Forecast Method

**Description:** The inventory depletion forecast uses a linear daily consumption model:
```
projected_stockout_date = snapshot_date + CEIL(current_stock / daily_velocity_30d)
```
Velocity is the 30-day rolling average. Alert levels are assigned per BR-031. 7-day velocity is tracked as a secondary signal for spike detection only — it does not drive the primary forecast.

**Rationale:** Linear depletion is the simplest model that works well when velocity is stable (mid-collection phase). It over-estimates stockout risk at peak launch (velocity is temporarily elevated) and under-estimates it at late decay (velocity may be accelerating as stock runs out). Given the 30-day lag in velocity measurement, this is an acceptable approximation.

---

### BR-094: Forecast Accuracy Target

**Description:** The LA-WMA model must achieve ≥ 70% accuracy (per KPI H-04 definition: `1 − |actual − forecast| / actual × 100`) across all closed months with back-filled actuals. Accuracy is computed per collection per month, then averaged.

**Rationale:** 70% accuracy is the threshold at which the forecast is useful for operational planning (cash reserve sizing, reorder timing). Below 70%, the forecast creates false confidence and may lead to worse decisions than intuition alone.

*Legacy alias: BR-FORE-02 (partial)*

---

### BR-095: Forecast Recalibration Trigger

**Description:** If blended forecast accuracy drops below 50% over any rolling 3-month window, the following recalibration steps must be triggered:
1. Audit the last 3 months' launch phase factors against actual observed decay
2. Verify stock availability factor gate thresholds are correct
3. Check whether a seasonal event (sale, viral moment) explains the miss
4. If no structural explanation, adjust decay factor table values and re-run the model

Recalibration changes must be documented in the model version history.

**Rationale:** The decay factors were calibrated from L1–L3. L4 and later launches may exhibit different patterns (broader audience, Meta ads, higher price point). Regular recalibration ensures the model remains predictive as the business evolves.

---

### BR-096: Multi-Collection Additive Assumption

**Description:** When multiple collections are simultaneously active (e.g., Summer + Core), their individual forecasts are summed to produce the total revenue forecast. No cannibalisation discount is applied between collections.

**Rationale:** Kirgo's collections target the same customer base but offer different aesthetics (Summer = lightweight pastels; Core = dark, structured). Based on current order data, customers buying Core are not typically customers who also bought Summer (low customer overlap). The additive assumption holds until cross-sell data is sufficient to measure cannibalisation.

**Example:** Core forecast May 2026 = ₹55,000. Remaining Summer inventory forecast = ₹8,000. Total forecast = ₹63,000. If cannibalisation is confirmed by data (e.g., Summer velocity drops when Core launches), apply a 0.85× discount to Summer forecast.

*Legacy alias: BR-FORE-01 (partial)*

---

## Section 9: KPI Calculation Rules

---

### BR-097: Source of Truth Hierarchy

**Description:** When computing KPIs, the data source hierarchy is:

| Tier | Source | Use For |
|------|--------|---------|
| 1 (highest) | `kpi_daily_snapshot` / `kpi_monthly_snapshot` | Dashboard display (pre-computed) |
| 2 | WooCommerce raw tables (`orders`, `order_lines`) | Revenue, order count, AOV validation |
| 3 | Shiprocket raw tables (`shipments`) | Delivery events, RTO events, freight costs |
| 4 | `bank_transactions` | Cash KPIs, settlement reconciliation |
| 5 (lowest) | `ad_spend_daily` | Marketing KPIs only |

If snapshot values are stale (not updated in > 25 hours), fall back to raw table computation and raise a data freshness alert.

**Rationale:** Pre-computed snapshots provide fast, consistent dashboard performance. Raw tables provide the audit trail. The hierarchy ensures dashboards are fast in steady state and accurate in exceptional states.

---

### BR-098: Snapshot Preference for Dashboards

**Description:** All P1 and P2 dashboard KPIs must read from `kpi_daily_snapshot` or `kpi_monthly_snapshot` by default. Direct raw-table computation for dashboard queries is only permitted for:
- Validation and reconciliation runs
- Data quality checks
- Admin-level debugging views

**Rationale:** Direct table joins on `order_lines`, `shipments`, and `bank_transactions` for every dashboard load would be prohibitively slow at scale and inconsistent across concurrent users.

---

### BR-099: Snapshot Reconciliation Procedure

**Description:** The snapshot must reconcile to raw table computation within ±₹1 (rounding) for all monetary KPIs and within ±1 unit for count KPIs. If a reconciliation check fails:
1. Log the discrepancy in the `insights` table with `severity = 'warning'`
2. Do not display the stale snapshot value on the dashboard — show raw-computed value instead
3. Trigger a snapshot recomputation job

**Rationale:** A snapshot that diverges from raw tables is a data pipeline failure. Displaying stale values without warning the user would undermine trust in the platform.

---

### BR-100: Conflict Resolution Procedure

**Description:** When WooCommerce and Shiprocket data conflict:
1. For financial amounts: WooCommerce is authoritative (BR-012)
2. For delivery dates and status: Shiprocket is authoritative (BR-012)
3. For order count: WooCommerce `woocommerce_order_id` deduplicated (BR-011)
4. For customer details: WooCommerce is authoritative

Conflicts must be logged in the `data_quality_log` (if implemented) or as `insights` entries with `insight_type = 'data_conflict'`.

---

### BR-101: Period Definition for Monthly KPIs

**Description:** Monthly KPIs use calendar month boundaries: 1st of month 00:00:00 to last day of month 23:59:59, in IST (UTC+5:30). Weekly KPIs use Mon–Sun. Daily KPIs use 00:00:00–23:59:59 IST.

**Rationale:** Consistent period definitions are essential for period-over-period comparisons. Using UTC instead of IST would misattribute late-evening Indian transactions (IST 22:00 = UTC+1 next day) across month boundaries.

---

### BR-102: Date Basis by KPI Type

**Description:**

| KPI Type | Date Field to Use |
|----------|------------------|
| Revenue KPIs | `shipments.delivered_at` |
| Order count KPIs | `shipments.delivered_at` |
| Return KPIs | `returns.returned_at` |
| RTO KPIs | `shipments.shipped_at` (cohort basis, see BR-017) |
| Cash KPIs | `bank_transactions.transaction_date` |
| Inventory KPIs | `inventory_ledger.occurred_at` |
| Ad spend KPIs | `ad_spend_daily.spend_date` |
| Expense KPIs | `expenses.expense_date` |

**Rationale:** Using the wrong date field produces systematically wrong period attribution. The most common error is using `orders.created_at` for revenue (overstates revenue in high-order periods, understates in delivery-heavy periods).

---

### BR-103: NULL Handling in KPI Calculations

**Description:** Divide-by-zero conditions in KPI formulas return NULL (not 0 or infinity). Specifically:
- AOV when Orders Delivered = 0 → NULL (display as "—")
- ROAS when Ad Spend = 0 → NULL (display as "—", not infinity)
- Days of Inventory when velocity = 0 → NULL (display as "∞")
- Return Rate % when delivered orders = 0 → NULL

**Rationale:** Returning 0 for a divide-by-zero case misrepresents the situation. A ROAS of 0 implies no return from ads; a ROAS of NULL correctly signals "no data / not applicable." Infinity for zero-velocity inventory correctly signals "no depletion occurring" rather than a computational error.

---

### BR-104: Rounding Standard

**Description:**
- INR monetary amounts: round to 2 decimal places for storage; display as whole rupees (₹82,000) unless precision is required
- Percentage KPIs: round to 1 decimal place for display (e.g., 48.2%)
- Unit counts: integer (no rounding)
- Days (inventory cover): integer (round up using CEIL — conservative)
- Velocity (units/day): 2 decimal places (e.g., 0.37 units/day)

**Rationale:** Consistent rounding prevents small discrepancies between dashboard cards and detailed views. Using CEIL for days-to-stockout is deliberately conservative — it's safer to trigger a reorder alert 1 day early than 1 day late.

---

### BR-105: Snapshot Recomputation Trigger

**Description:** `kpi_daily_snapshot` must be recomputed after every successful data import. `kpi_monthly_snapshot` must be recomputed at the end of each calendar month (or when the analyst manually triggers a month-close). Recomputation timestamps must be recorded in the snapshot table (`recomputed_at` column or equivalent).

**Rationale:** Stale snapshots that are silently presented as current data are worse than no snapshots. Tying recomputation to import events ensures the snapshot is always as fresh as the underlying data allows.

---

## Section 10: AI Insight Rules

---

### BR-106: Insight Generation Trigger Conditions

**Description:** An insight is generated when one of the following conditions is met:
1. A KPI breaches a defined alert threshold (Critical or Warning) — see KPI_DEFINITIONS.md for thresholds
2. An anomaly is detected: KPI change > 30% week-over-week or > 50% month-over-month without a known launch event
3. A forecast vs actual divergence > 30% for 2 consecutive months
4. A reorder alert transitions from 'watch' to 'warning' or 'critical'
5. A data quality check fails (per Section 11)
6. COD Outstanding has an item aged > 14 days without a matching CRF remittance

**Rationale:** Insights must be actionable and tied to specific measurable conditions. Generating insights for small normal fluctuations trains the user to ignore them. Each trigger condition requires a specific response.

---

### BR-107: Info Severity

**Description:** `severity = 'info'` insights are informational observations that do not require immediate action. Examples:
- Monthly revenue is tracking 10–20% above forecast (positive)
- A new collection variant has had no sales in its first 7 days (observation, not alarm)
- COD mix has shifted more than 10 percentage points vs prior month
- The February seasonality multiplier has been applied to the forecast

**Rationale:** Info insights provide context for KPI movements without triggering alarm fatigue. They help the analyst understand why a KPI moved, not just that it moved.

---

### BR-108: Warning Severity

**Description:** `severity = 'warning'` insights require analyst review within 48 hours. Examples:
- RTO Rate % > 10% for the second consecutive week
- A variant has transitioned to dead stock (60 days no sales, stock > 0)
- Days of inventory < 30 for any active variant
- Return Rate % > 4% for the month
- Cash inflow < 80% of expected (potential settlement delay)
- Forecast accuracy dropped below 70% for the rolling 3-month average

**Rationale:** Warning-level conditions are deteriorating but not yet critical. The 48-hour review window provides time to investigate root cause before the situation escalates.

---

### BR-109: Critical Severity

**Description:** `severity = 'critical'` insights require immediate action (same day). Examples:
- Days of inventory < 14 for any active variant
- Net Cash Position < ₹50,000
- RTO Rate % > 20% in any 7-day window
- Bank statement import has not been performed in > 48 hours (data freshness failure)
- Gross Margin % < 20% for any delivered period (COGS anomaly)
- COD Outstanding > ₹50,000 and no CRF remittance in > 14 days

**Rationale:** Critical conditions directly threaten business continuity or data integrity. Stockout with no reorder initiated, near-zero cash, or extremely high RTO rates each require a response within hours, not days.

---

### BR-110: Insight De-duplication

**Description:** An identical insight (same `entity_type`, `entity_id`, `insight_type`) must not be generated more than once within a 7-day window. On day 8, if the condition still applies, a new insight may be generated with a note that the condition is persisting.

**Rationale:** Generating the same insight daily for a persistent condition (e.g., a variant that has been in dead stock for 30 days) creates noise and desensitises the user. The 7-day cadence keeps the signal relevant without overwhelming the alert queue.

---

### BR-111: Insight Retention Policy

**Description:**
| Severity | Retention Period | Basis |
|----------|-----------------|-------|
| `info` | 90 days | Auto-archived after 90 days |
| `warning` | 180 days | Auto-archived after 180 days |
| `critical` | 365 days | Retained for 1 year for audit |

Archived insights remain in the database but are excluded from the active insights feed. They can be retrieved via admin query.

**Rationale:** Historical insights form an audit trail of when the platform identified problems. Critical insights in particular must be retained to demonstrate that the system flagged an issue (e.g., stockout risk) before the event occurred.

---

### BR-112: Insight Audit Trail Requirements

**Description:** Every insight must record:
- `entity_type` — what the insight is about (e.g., 'variant', 'launch', 'cash')
- `entity_id` — the specific entity ID (variant_id, launch_id, etc.)
- `insight_type` — the triggering condition code
- `severity` — info / warning / critical
- `created_at` — timestamp of generation
- `generated_by` — 'rule_engine' or 'ai_model' to distinguish automated vs AI-generated
- `is_acknowledged` — whether a user has marked it as seen/acted upon

**Rationale:** Auditability is essential for a finance-adjacent platform. The audit trail must demonstrate which conditions triggered which actions, and by whom.

---

### BR-113: Critical Insight Human Review Requirement

**Description:** All `severity = 'critical'` insights must be manually acknowledged by an admin or analyst user within 24 hours of generation. Unacknowledged critical insights must remain visible at the top of the dashboard in a persistent alert banner until acknowledged.

**Rationale:** Automated systems can generate false positives. Critical alerts that go unacknowledged may indicate the system is generating noise (bad threshold) or that the user is not engaging with the platform (bad UX). Mandatory acknowledgement ensures the loop closes.

---

### BR-114: Rule-Based vs AI-Generated Insight Distinction

**Description:** Insights generated by deterministic threshold rules (`generated_by = 'rule_engine'`) are factual: "Days of inventory for Core Bra XS = 12." Insights generated by AI analysis (`generated_by = 'ai_model'`) are probabilistic: "Based on current velocity, Core Bra XS may stockout before the projected L4 launch." AI insights must be clearly labelled as model-generated and include a confidence level where possible.

**Rationale:** Users must be able to trust rule-based insights as ground truth and treat AI insights as probabilistic guidance. Mixing the two without labelling erodes trust in both.

---

## Section 11: Data Quality Rules

---

### BR-115: Import Validation Sequence

**Description:** Every data import must pass the following validation checks before data is committed to the database:

1. WooCommerce order count cross-check (BR-116)
2. Shiprocket de-duplication check (BR-117)
3. Inventory non-negative check (BR-028)
4. Date sequence validation (BR-120)
5. Bank balance continuity check (BR-121)
6. Revenue reconciliation spot check (BR-122)

Imports that fail any check must be quarantined: data is staged but not committed. An error report is generated for analyst review.

**Rationale:** Committing bad data to the live database corrupts all downstream KPIs and is difficult to reverse cleanly. Staged validation allows human review before the data affects any calculation.

*Legacy alias: BR-DQ-03 (partial)*

---

### BR-116: WooCommerce Order Count Check

**Description:** After each WooCommerce import, verify:
```
COUNT(DISTINCT orders.woocommerce_order_id) in import
  equals
COUNT(unique order IDs) in the WooCommerce export file
```
A discrepancy of > 0 must block import and generate a data quality alert.

**Rationale:** Any lost or duplicated orders in the import pipeline would permanently skew order counts, revenue totals, and AOV. This check ensures 100% order record fidelity.

---

### BR-117: Shiprocket De-duplication Check

**Description:** After Shiprocket import, verify that `COUNT(DISTINCT shiprocket_order_id)` matches the expected number of unique orders (cross-referenced with WooCommerce import). Flag any `shiprocket_order_id` that appears with conflicting statuses (e.g., both DELIVERED and RTO_DELIVERED) for manual review.

**Rationale:** Shiprocket data has known multi-row structures (one row per item). The de-dup check catches import scripts that accidentally produce duplicate rows from the same source file.

*Legacy alias: BR-DQ-01*

---

### BR-118: Revenue Reconciliation Spot Check

**Description:** After each monthly import, compute:
```
Spot Check = SUM(order_lines.line_total_inr WHERE delivered in month)
           vs
SUM(kpi_monthly_snapshot.gross_revenue_inr WHERE snapshot_month = month)
```
Acceptable variance: ±₹1 (rounding). Variance > ₹1 must block snapshot publication and trigger a recompute.

**Rationale:** The snapshot must match the raw data. If they diverge, one of the two has a bug. This check is the primary integrity gate for the platform's most-viewed KPI.

*Legacy alias: BR-DQ-03 (partial)*

---

### BR-119: NULL vs Zero for Missing Data

**Description:** Missing measurements must be stored as NULL, not 0. Specifically:
- A product with no sales in 30 days: `daily_velocity_30d = NULL` (not 0)
- A month with no COD orders: `cod_mix_pct = NULL` (not 0.00%)
- An order with no UTM: `utm_source = NULL` (not 'none' or '')

**Rationale:** NULL correctly communicates "not measured / not applicable." Zero communicates "zero quantity / zero value," which has different analytical meaning. Storing 0 for missing velocity would make the variant appear to have been measured and found to have zero demand — preventing it from being caught by data quality alerts.

---

### BR-120: Date Sequence Validation

**Description:** For every shipment row, enforce:
```
channel_created_at < shipped_at < delivered_at (if DELIVERED)
channel_created_at < shipped_at < rto_delivered_at (if RTO)
```
Any row violating this sequence is flagged as a data error and quarantined. Do not import rows where `delivered_at < shipped_at` (physically impossible).

**Rationale:** Date sequence violations indicate data corruption: incorrect timestamps, timezone errors, or mis-mapped fields. They contaminate delivery lag calculations (C-06), cohort analyses, and revenue period attribution.

**Example:** A Shiprocket row shows `shipped_at = 25 Jan` and `delivered_at = 22 Jan` (delivered before shipped). This is a data error — flag and quarantine. Likely cause: incorrect timezone conversion during export.

---

### BR-121: Bank Balance Continuity Check

**Description:** For each imported bank statement segment, verify:
```
Row[n].closing_balance = Row[n-1].closing_balance + Row[n].deposit_inr − Row[n].withdrawal_inr
```
Allow ±₹1 tolerance for rounding. A break in continuity indicates missing rows in the statement or an incorrect import.

**Rationale:** Bank balance continuity is the primary data integrity check for the financial module. A gap means the Cash Position (A-06) will be incorrect — the most trusted and frequently-viewed metric.

*Legacy alias: BR-BANK-01 (partial)*

---

### BR-122: COGS Consistency Check

**Description:** After any product COGS update (which should not occur per BR-045, but may be required during initial import), verify that:
```
products.cogs_total_inr = cogs_manufacture_inr + cogs_shoot_import_inr + cogs_shipping_pkg_inr
```
And that:
```
products.gross_margin_inr = selling_price_inr − cogs_total_inr
products.gross_margin_pct = gross_margin_inr / selling_price_inr × 100
```
Any mismatch between the component sum and the total indicates a data entry error.

---

### BR-123: Exception Handling and Quarantine

**Description:** Data rows failing validation checks are:
1. Inserted into a staging/quarantine table (not the live table)
2. Linked to an error record with: error_type, affected_field, expected_value, actual_value, import_id
3. Never automatically resolved — human review is required
4. Resolved by either: (a) correcting the source data and re-importing, or (b) overriding with a documented reason

No exception is silently discarded. The count of quarantined rows must be visible in the import summary.

**Rationale:** Silent data loss is worse than a failed import. Quarantined rows that are never reviewed cause invisible gaps in KPI coverage. Every exception must be traceable.

---

### BR-124: Monthly Revenue Sheet Exclusion

**Description:** The `Monthly Revenue` sheet in `Kirgo Numbers.xlsx` must NOT be used as a data source in any module of the platform. It is a manually-maintained summary with known errors (e.g., April 2025 shows 15 orders with ₹0 revenue). All monthly revenue figures must be derived from WooCommerce `orders` + `order_lines` + Shiprocket `shipments`.

**Rationale:** Using a manually-maintained, error-prone summary as a source introduces errors that are difficult to detect because they have already been aggregated. Raw transaction-level data is always preferred.

*Legacy alias: BR-DQ-03*

---

## Section 12: Governance Rules

---

### BR-125: Admin Role Permissions

**Description:** Users with `roles.role_name = 'admin'` have full read and write access to all modules. Admin-specific capabilities:
- Create, edit, delete product records (including COGS)
- Perform manual inventory adjustments
- Override data quality quarantine decisions
- Access and modify user accounts
- View and acknowledge all insight levels including Critical
- Trigger manual snapshot recomputation
- Access PII fields (customer name, email, phone, address)
- Access financial summary data at all levels

Only Kirgo's owner/founder account should hold the Admin role initially.

---

### BR-126: Analyst Role Permissions

**Description:** Users with `roles.role_name = 'analyst'` can read all operational data and perform non-destructive write actions:
- View all KPIs, forecasts, and inventory data
- Acknowledge and annotate insights
- Trigger forecast model runs
- Enter and edit expense records
- Import data (subject to validation; cannot override quarantine)
- View aggregated financial data (revenue, margins, cash)
- Cannot view individual customer PII (names, phone, addresses)
- Cannot modify product COGS or schema-level settings

**Rationale:** The analyst role covers Kanika Rodrigues's operational use case. Full data access for business operations without the ability to corrupt foundational data (COGS, user accounts).

---

### BR-127: Viewer Role Permissions

**Description:** Users with `roles.role_name = 'viewer'` have read-only access to dashboards and aggregated KPIs:
- View Executive, Sales, and Inventory dashboards
- Cannot view Finance dashboards or cash position data
- Cannot view individual order or customer data
- Cannot trigger any write operations
- Cannot view unaggregated source data

**Rationale:** The Viewer role is intended for advisors, partners, or team members who need a business performance overview without access to financial or operational details.

---

### BR-128: PII Handling

**Description:** The following fields are classified as PII and are governed by data minimisation principles:
- `customers.name`, `customers.email`, `customers.phone`
- `orders.billing_name`, `orders.billing_phone`, `orders.billing_address_line1`
- `shipments.customer_address`, `shipments.customer_phone`

PII is:
- Only accessible to Admin role users
- Not displayed in any aggregate dashboard (aggregated by state, not by individual customer)
- Not exported in bulk without explicit admin approval
- Not stored in logs or analytics events

**Rationale:** Compliance with India's DPDP Act (Digital Personal Data Protection Act) requirements. Customer data collected via WooCommerce is used only for fulfilment purposes — not for analytics beyond aggregated geographic and behavioural patterns.

---

### BR-129: Financial Data Restrictions

**Description:** The following data is restricted to Admin and Analyst roles only:
- Absolute cash position (bank balance)
- Supplier payment amounts and timing
- Launch investment totals
- Net Margin and Contribution Margin
- Individual order revenue amounts

Viewers cannot access any individual-level financial data. Aggregated period metrics (monthly revenue trend) are accessible to Viewers in a summarised form only.

**Rationale:** Supplier payment terms, launch investment, and cash position are competitively sensitive. Viewer-accessible dashboards are designed for performance visibility, not for financial due diligence.

---

### BR-130: Credential Storage Prohibition

**Description:** No API credentials, passwords, or authentication tokens may be stored in any application database table. Credentials used by the platform include:
- WooCommerce API key (`doriame` user) — store in Supabase Vault / environment variable
- Shiprocket API token — store in environment variable
- Gokwik credentials — store in Supabase Vault
- EaseBuzz API key — store in environment variable

Credentials must never be committed to the git repository. The `.env` file must be in `.gitignore`. Supabase Vault is the preferred secret store for all production credentials.

**Rationale:** Exposed credentials enable unauthorised access to WooCommerce orders, Shiprocket shipments, and payment gateway data — a direct financial and compliance risk.

---

### BR-131: Data Retention Policy

**Description:**
| Data Category | Retention Period | Basis |
|---------------|-----------------|-------|
| Order and shipment records | 7 years | GST compliance (India: 7-year record retention) |
| Bank transactions | 7 years | FEMA / IT Act compliance |
| Customer PII | 3 years from last order | DPDP Act proportionality |
| Forecast records | 2 years | Operational; no compliance requirement |
| Audit logs | 5 years | Operational accountability |
| Insights (archived) | 2 years | Platform-level audit |

Data exceeding its retention period must be deleted or anonymised, not merely archived.

---

### BR-132: Access Audit Log

**Description:** Every user login, data export, PII access event, and write action (imports, manual overrides, expense entries) must be logged with: `user_id`, `action_type`, `entity_affected`, `timestamp`, `ip_address`. The `users` table tracks `last_login_at`. A separate audit log table (not in current schema v2 — a known gap) is required for full audit trail.

**Rationale:** Audit logs are the foundation of access accountability. If data is ever found to be incorrect or if a credential is compromised, the audit log enables reconstruction of who did what and when.

---

### BR-133: Environment Variable Requirement for Secrets

**Description:** All integration secrets (API keys, tokens, passwords) used by the platform at runtime must be accessed via environment variables or Supabase Vault — never hardcoded in source files. Environment variables used in production must be set via the Vercel dashboard (not committed to git). Local development uses `.env.local` which is git-ignored.

Required environment variables at go-live:
- `WOOCOMMERCE_CONSUMER_KEY`
- `WOOCOMMERCE_CONSUMER_SECRET`
- `SHIPROCKET_EMAIL` / `SHIPROCKET_TOKEN`
- `GOKWIK_MERCHANT_ID` / `GOKWIK_SECRET`
- `EASEBUZZ_MERCHANT_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HDFC_STATEMENT_IMPORT_KEY` (if automated)

**Rationale:** Hardcoded credentials in source code are the single most common cause of data breaches in small SaaS applications. Enforcing environment variable usage as a governance rule (not just a best practice) ensures this is non-negotiable.

---

## Appendix A: Legacy Rule ID Cross-Reference

The following codes were used in BUSINESS_RULES.md v1 and are referenced in other documents (DATABASE_SCHEMA.md, DATA_DICTIONARY.md, KPI_DEFINITIONS.md). They are superseded by the BR-xxx codes in this document.

| Legacy Code | Superseded By | Description |
|-------------|--------------|-------------|
| BR-INV-01 | BR-027 | Bundle decomposition on inventory movements |
| BR-INV-02 | BR-028 | Stock cannot go negative |
| BR-INV-03 | BR-025 | Opening inventory source of truth |
| BR-INV-04 | BR-013, BR-014 | RTO vs Return distinction |
| BR-REV-01 | BR-001 | Revenue recognition event is delivery |
| BR-REV-02 | BR-003 | Net Revenue calculation |
| BR-REV-03 | BR-011 | Multi-item order de-duplication |
| BR-REV-04 | BR-004 | Shipping revenue neutral |
| BR-BANK-01 | BR-064, BR-066 | Cash inflow / narration parsing patterns |
| BR-BANK-02 | BR-066 | YESF reference extraction |
| BR-BANK-03 | BR-067 | CRF ID extraction |
| BR-BANK-04 | BR-054, BR-072 | Founder transfers not revenue |
| BR-GM-01 | BR-037 | COGS components |
| BR-GM-02 | BR-044 | Gross Margin does not include shipping |
| BR-GM-03 | BR-043 | Bundle COGS |
| BR-CM-01 | BR-037, BR-044 | Contribution Margin formula |
| BR-CM-02 | BR-080 | Ad spend allocation at period level |
| BR-CF-01 | BR-066, BR-067, BR-068, BR-069 | Cash lag model |
| BR-CF-02 | BR-022, BR-024 | Net cashflow from a COD order |
| BR-CF-03 | BR-073 | Supplier payment timing |
| BR-RET-01 | BR-017 | RTO Rate % formula |
| BR-RET-02 | BR-015 | Return Rate % formula |
| BR-RET-03 | BR-019, BR-020 | Stock restock on return |
| BR-FORE-01 | BR-083, BR-085, BR-096 | Launch decay pattern and LA-WMA |
| BR-FORE-02 | BR-089, BR-094 | Minimum orders threshold / accuracy target |
| BR-FORE-03 | BR-089, BR-036 | AOV benchmark by collection / size distribution |
| BR-DQ-01 | BR-011, BR-117 | Shiprocket de-duplication |
| BR-DQ-02 | BR-012, BR-100 | WooCommerce is order of record |
| BR-DQ-03 | BR-115, BR-124 | Monthly Revenue sheet exclusion |
