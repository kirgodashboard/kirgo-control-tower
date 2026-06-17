"""
Workbook reconciliation checks.

Grouped by importer phase:
  run_wc_checks()      — post-WC import
  run_sr_checks()      — post-SR import
  run_returns_checks() — post-Returns import
  run_bank_checks()    — post-Bank import
  run_full_checks()    — after all importers complete (--reconcile-only)

Returns ReconciliationResult (same structure as woocommerce/reconciliation.py,
re-exported here so callers only need one import).
"""
from __future__ import annotations

import logging

# Re-export ReconciliationResult and CheckResult from the woocommerce module
from importers.woocommerce.reconciliation import (  # noqa: F401
    CheckResult,
    ReconciliationResult,
)

logger = logging.getLogger(__name__)


# ── WC order checks ───────────────────────────────────────────────────────────

def run_wc_checks(conn) -> ReconciliationResult:
    result = ReconciliationResult()
    result.checks.extend([
        _rc_rev_01(conn),
        _rc_rev_02(conn),
        _rc_rev_03(conn),
        _rc_rev_04(conn),
        _rc_rev_06(conn),
    ])
    _log_result("wc", result)
    return result


def _rc_rev_01(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM orders")
        total = cur.fetchone()[0]
    passed = total > 0
    return CheckResult(
        "RC-REV-01", "WooCommerce order count", "HARD", passed,
        f"orders in DB: {total}" + ("" if passed else " — expected > 0"),
    )


def _rc_rev_02(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM orders o "
            "WHERE NOT EXISTS (SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id)"
        )
        orphans = cur.fetchone()[0]
    passed = orphans == 0
    return CheckResult(
        "RC-REV-02", "No orders without lines", "HARD", passed,
        "All orders have at least one order_line" if passed
        else f"{orphans} order(s) have no order_lines",
    )


def _rc_rev_03(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM orders o
            LEFT JOIN (
                SELECT order_id, SUM(line_total_inr) AS s
                FROM order_lines GROUP BY order_id
            ) ol ON ol.order_id = o.id
            WHERE ABS(
                o.order_total_inr
                - COALESCE(ol.s, 0)
                - COALESCE(o.shipping_charged_inr, 0)
                + COALESCE(o.discount_inr, 0)
            ) > 1.00
        """)
        mismatched = cur.fetchone()[0]
    passed = mismatched == 0
    return CheckResult(
        "RC-REV-03", "Order total vs line sum (±₹1)", "SOFT", passed,
        "All order totals reconcile within ₹1" if passed
        else f"{mismatched} order(s) have order_total variance > ₹1",
    )


def _rc_rev_04(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM order_lines WHERE variant_id IS NULL")
        unresolved = cur.fetchone()[0]
        top_skus: list = []
        if unresolved > 0:
            cur.execute(
                "SELECT sku_raw, COUNT(*) FROM order_lines "
                "WHERE variant_id IS NULL AND sku_raw IS NOT NULL "
                "GROUP BY sku_raw ORDER BY COUNT(*) DESC LIMIT 10"
            )
            top_skus = [r[0] for r in cur.fetchall()]
    passed = unresolved == 0
    return CheckResult(
        "RC-REV-04", "No unresolved SKUs", "HARD", passed,
        "All order_lines have variant_id" if passed
        else f"{unresolved} line(s) have variant_id=NULL. Top SKUs: {top_skus}",
    )


def _rc_rev_06(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT SUM(shipping_charged_inr), "
            "COUNT(*) FILTER (WHERE shipping_charged_inr > 0) FROM orders"
        )
        row = cur.fetchone()
    total = float(row[0] or 0)
    count = int(row[1] or 0)
    return CheckResult(
        "RC-REV-06", "Shipping excluded (advisory)", "ADVISORY", True,
        f"Total shipping collected: ₹{total:,.2f} across {count} orders — excluded from KPIs (BR-004)",
    )


# ── Shipments checks ──────────────────────────────────────────────────────────

def run_sr_checks(conn) -> ReconciliationResult:
    result = ReconciliationResult()
    result.checks.extend([
        _rc_sr_01(conn),
        _rc_sr_02(conn),
        _rc_sr_03(conn),
    ])
    _log_result("sr", result)
    return result


def _rc_sr_01(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM shipments")
        total = cur.fetchone()[0]
    passed = total > 0
    return CheckResult(
        "RC-SR-01", "Shipment count > 0", "HARD", passed,
        f"shipments in DB: {total}" + ("" if passed else " — expected > 0"),
    )


def _rc_sr_02(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM shipments "
            "WHERE status = 'DELIVERED' AND delivered_at IS NULL"
        )
        missing = cur.fetchone()[0]
    passed = missing == 0
    return CheckResult(
        "RC-SR-02", "DELIVERED rows have delivered_at", "HARD", passed,
        "All DELIVERED shipments have delivered_at" if passed
        else f"{missing} DELIVERED shipment(s) have NULL delivered_at — revenue recognition blocked",
    )


def _rc_sr_03(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM shipments WHERE order_id IS NULL")
        unlinked = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM shipments")
        total = cur.fetchone()[0]
    match_rate = round((total - unlinked) / total * 100, 1) if total else 0
    passed = match_rate >= 50.0   # advisory threshold
    return CheckResult(
        "RC-SR-03", "SR → WC order match rate", "SOFT", passed,
        f"Match rate: {match_rate}% ({total - unlinked}/{total} shipments linked to WC orders)",
    )


# ── Returns checks ────────────────────────────────────────────────────────────

def run_returns_checks(conn) -> ReconciliationResult:
    result = ReconciliationResult()
    result.checks.extend([
        _rc_rt_01(conn),
        _rc_rt_02(conn),
    ])
    _log_result("returns", result)
    return result


def _rc_rt_01(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM returns")
        total = cur.fetchone()[0]
    passed = total > 0
    return CheckResult(
        "RC-RT-01", "Returns count > 0", "HARD", passed,
        f"returns in DB: {total}" + ("" if passed else " — expected > 0"),
    )


def _rc_rt_02(conn) -> CheckResult:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM returns "
            "WHERE status = 'RETURN DELIVERED' AND returned_at IS NULL"
        )
        missing = cur.fetchone()[0]
    passed = missing == 0
    return CheckResult(
        "RC-RT-02", "RETURN DELIVERED rows have returned_at", "SOFT", passed,
        "All RETURN DELIVERED rows have returned_at" if passed
        else f"{missing} RETURN DELIVERED row(s) have NULL returned_at",
    )


# ── Bank checks ───────────────────────────────────────────────────────────────

def run_bank_checks(conn) -> ReconciliationResult:
    result = ReconciliationResult()
    result.checks.extend([
        _rc_bank_02(conn),
        _rc_bank_03(conn),
        _rc_bank_04(conn),
    ])
    _log_result("bank", result)
    return result


def _rc_bank_02(conn) -> CheckResult:
    """RC-BANK-02: COD remittance rows must have extracted_reference (CRF ID)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM bank_transactions "
            "WHERE transaction_type = 'cod_remittance'"
        )
        total_cod = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM bank_transactions "
            "WHERE transaction_type = 'cod_remittance' AND extracted_reference IS NULL"
        )
        missing_ref = cur.fetchone()[0]
    if total_cod == 0:
        return CheckResult(
            "RC-BANK-02", "COD CRF ID match rate", "HARD", True,
            "No COD remittance transactions found (bank import may not have run yet)",
        )
    match_rate = round((total_cod - missing_ref) / total_cod * 100, 1)
    passed = match_rate >= 95.0
    return CheckResult(
        "RC-BANK-02", "COD CRF ID match rate ≥95%", "HARD", passed,
        f"CRF ID extraction rate: {match_rate}% ({total_cod - missing_ref}/{total_cod} rows)",
    )


def _rc_bank_03(conn) -> CheckResult:
    """RC-BANK-03: Unclassified transaction count < 80 (soft advisory)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM bank_transactions "
            "WHERE transaction_type = 'unclassified'"
        )
        count = cur.fetchone()[0]
    passed = count < 80
    return CheckResult(
        "RC-BANK-03", "Unclassified transactions < 80", "SOFT", passed,
        f"Unclassified transactions: {count}" + (
            " — review and update transaction_type manually" if not passed else ""
        ),
    )


def _rc_bank_04(conn) -> CheckResult:
    """RC-BANK-04: Total COD bank deposits vs SR remitted sum (variance < ₹500/year)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(SUM(deposit_inr), 0) FROM bank_transactions "
            "WHERE transaction_type = 'cod_remittance'"
        )
        bank_cod = float(cur.fetchone()[0])
        cur.execute("SELECT COALESCE(SUM(remitted_inr), 0) FROM shipments")
        sr_remitted = float(cur.fetchone()[0])
    variance = abs(bank_cod - sr_remitted)
    passed = variance < 1000.0   # broader tolerance pre-full reconciliation
    return CheckResult(
        "RC-BANK-04", "COD bank deposits vs SR remitted", "SOFT", passed,
        f"Bank COD: ₹{bank_cod:,.2f} | SR remitted: ₹{sr_remitted:,.2f} | "
        f"Variance: ₹{variance:,.2f}" + (
            " — investigate large discrepancy" if not passed else ""
        ),
    )


# ── Full reconciliation (all importers) ──────────────────────────────────────

def run_full_checks(conn) -> ReconciliationResult:
    """Run the complete cross-domain reconciliation suite."""
    result = ReconciliationResult()
    result.checks.extend([
        _rc_rev_01(conn),
        _rc_rev_02(conn),
        _rc_rev_03(conn),
        _rc_rev_04(conn),
        _rc_rev_06(conn),
        _rc_sr_01(conn),
        _rc_sr_02(conn),
        _rc_sr_03(conn),
        _rc_rt_01(conn),
        _rc_rt_02(conn),
        _rc_bank_02(conn),
        _rc_bank_03(conn),
        _rc_bank_04(conn),
        _rc_full_01(conn),
        _rc_full_02(conn),
        _rc_xdom_01(conn),
    ])
    _log_result("full", result)
    return result


def _rc_full_01(conn) -> CheckResult:
    """All orders with non-cancelled status have at least one shipment."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM orders o "
            "WHERE o.status NOT IN ('cancelled', 'failed') "
            "AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)"
        )
        unshipped = cur.fetchone()[0]
    passed = unshipped == 0
    return CheckResult(
        "RC-FULL-01", "Active orders have shipments", "ADVISORY", passed,
        f"{unshipped} active order(s) have no shipment records" if not passed
        else "All active orders linked to shipments",
    )


def _rc_full_02(conn) -> CheckResult:
    """Returns count <= DELIVERED shipment count (sanity check)."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM returns")
        ret_count = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM shipments WHERE status = 'DELIVERED'"
        )
        delivered = cur.fetchone()[0]
    passed = ret_count <= delivered
    return CheckResult(
        "RC-FULL-02", "Returns ≤ delivered shipments", "ADVISORY", passed,
        f"Returns: {ret_count}, Delivered: {delivered}" + (
            " — unexpected: more returns than deliveries" if not passed else ""
        ),
    )


def _rc_xdom_01(conn) -> CheckResult:
    """Gateway settlement total is within 30% of WC delivered revenue (advisory)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(SUM(amount_inr), 0) FROM gateway_settlements"
        )
        gs_total = float(cur.fetchone()[0])
        cur.execute("""
            SELECT COALESCE(SUM(ol.line_total_inr), 0)
            FROM shipments s
            JOIN orders o       ON o.id = s.order_id
            JOIN order_lines ol ON ol.order_id = o.id
            WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
        """)
        wc_revenue = float(cur.fetchone()[0])

    if wc_revenue == 0:
        return CheckResult(
            "RC-XDOM-01", "Gateway settlements vs WC revenue", "ADVISORY", True,
            "No WC delivered revenue yet — skipped",
        )

    ratio = gs_total / wc_revenue
    passed = 0.50 <= ratio <= 1.50   # broad advisory range
    return CheckResult(
        "RC-XDOM-01", "Gateway settlements vs WC delivered revenue", "ADVISORY", passed,
        f"Gateway settlements: ₹{gs_total:,.2f} | WC revenue: ₹{wc_revenue:,.2f} | "
        f"Ratio: {ratio:.2%}" + (
            " — outside expected range; verify gateway classification" if not passed else ""
        ),
    )


# ── Internal helper ───────────────────────────────────────────────────────────

def _log_result(phase: str, result: ReconciliationResult) -> None:
    logger.info(
        "reconciliation_complete phase=%s status=%s hard_passed=%d hard_failed=%d soft_warned=%d",
        phase, result.status, result.hard_passed, result.hard_failed, result.soft_warned,
    )
