"""
Post-import reconciliation checks.

Runs after all rows are processed. Results are stored in import_runs.
Checks from RECONCILIATION_RULES.md §1 (Revenue Reconciliation).

RC-REV-01  HARD  Total order count matches expected
RC-REV-02  HARD  Every order has at least one order_line
RC-REV-03  SOFT  order_total ≈ Σ(line_total) + shipping − discount (±₹1)
RC-REV-04  HARD  No unresolved SKUs (variant_id IS NULL in order_lines)
RC-REV-06  ADVY  Document total shipping collected (advisory only)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CheckResult:
    check_id: str
    description: str
    severity: str           # HARD | SOFT | ADVISORY
    passed: bool
    detail: str = ""


@dataclass
class ReconciliationResult:
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def status(self) -> str:
        hard_failed = any(c.severity == "HARD" and not c.passed for c in self.checks)
        soft_warned = any(c.severity == "SOFT" and not c.passed for c in self.checks)
        if hard_failed:
            return "failed"
        if soft_warned:
            return "flagged"
        return "passed"

    @property
    def hard_passed(self) -> int:
        return sum(1 for c in self.checks if c.severity == "HARD" and c.passed)

    @property
    def hard_failed(self) -> int:
        return sum(1 for c in self.checks if c.severity == "HARD" and not c.passed)

    @property
    def soft_passed(self) -> int:
        return sum(1 for c in self.checks if c.severity == "SOFT" and c.passed)

    @property
    def soft_warned(self) -> int:
        return sum(1 for c in self.checks if c.severity == "SOFT" and not c.passed)

    @property
    def notes(self) -> str:
        lines = []
        for c in self.checks:
            icon = "✓" if c.passed else "✗"
            lines.append(f"{icon} {c.check_id} [{c.severity}]: {c.detail}")
        return "\n".join(lines)


def run_reconciliation(conn) -> ReconciliationResult:
    """Run all applicable post-WC-import reconciliation checks."""
    result = ReconciliationResult()
    result.checks.extend([
        _rc_rev_01(conn),
        _rc_rev_02(conn),
        _rc_rev_03(conn),
        _rc_rev_04(conn),
        _rc_rev_06(conn),
    ])
    logger.info(
        "reconciliation_complete status=%s hard_passed=%d hard_failed=%d soft_warned=%d",
        result.status, result.hard_passed, result.hard_failed, result.soft_warned,
    )
    return result


# ── Individual checks ─────────────────────────────────────────────────────────

def _rc_rev_01(conn) -> CheckResult:
    """RC-REV-01 HARD: Total order count > 0 and logged."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM orders")
        total = cur.fetchone()[0]
    passed = total > 0
    return CheckResult(
        check_id="RC-REV-01",
        description="WooCommerce order count",
        severity="HARD",
        passed=passed,
        detail=f"Total orders in DB: {total}" + ("" if passed else " — expected > 0"),
    )


def _rc_rev_02(conn) -> CheckResult:
    """RC-REV-02 HARD: Every order has at least one order_line."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM orders o
            WHERE NOT EXISTS (
                SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id
            )
        """)
        orphan_count = cur.fetchone()[0]
    passed = orphan_count == 0
    return CheckResult(
        check_id="RC-REV-02",
        description="No orders without lines",
        severity="HARD",
        passed=passed,
        detail=(
            "All orders have at least one order_line" if passed
            else f"{orphan_count} order(s) have no order_lines — investigate"
        ),
    )


def _rc_rev_03(conn) -> CheckResult:
    """RC-REV-03 SOFT: order_total ≈ Σ(line_total) + shipping − discount (±₹1)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) AS mismatched
            FROM orders o
            LEFT JOIN (
                SELECT order_id, SUM(line_total_inr) AS line_sum
                FROM order_lines GROUP BY order_id
            ) ol ON ol.order_id = o.id
            WHERE ABS(
                o.order_total_inr
                - COALESCE(ol.line_sum, 0)
                - COALESCE(o.shipping_charged_inr, 0)
                + COALESCE(o.discount_inr, 0)
            ) > 1.00
        """)
        mismatched = cur.fetchone()[0]
    passed = mismatched == 0
    return CheckResult(
        check_id="RC-REV-03",
        description="Order total vs line sum reconciliation",
        severity="SOFT",
        passed=passed,
        detail=(
            "All order totals reconcile with line sums (±₹1)" if passed
            else f"{mismatched} order(s) have order_total variance > ₹1 — review RECONCILE_WARN errors"
        ),
    )


def _rc_rev_04(conn) -> CheckResult:
    """RC-REV-04 HARD: No unresolved SKUs (blocks KPI compute, not import itself)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM order_lines WHERE variant_id IS NULL
        """)
        unresolved = cur.fetchone()[0]
        if unresolved > 0:
            cur.execute("""
                SELECT sku_raw, COUNT(*) AS cnt
                FROM order_lines
                WHERE variant_id IS NULL AND sku_raw IS NOT NULL
                GROUP BY sku_raw
                ORDER BY cnt DESC
                LIMIT 10
            """)
            top_skus = cur.fetchall()
        else:
            top_skus = []

    passed = unresolved == 0
    detail = (
        "All order_lines have a resolved variant_id" if passed
        else (
            f"{unresolved} order_line(s) have variant_id = NULL — KPI compute blocked. "
            f"Top unresolved SKUs: {[r[0] for r in top_skus]}"
        )
    )
    return CheckResult(
        check_id="RC-REV-04",
        description="No unresolved SKUs in order_lines",
        severity="HARD",
        passed=passed,
        detail=detail,
    )


def _rc_rev_06(conn) -> CheckResult:
    """RC-REV-06 ADVISORY: Document total shipping collected (not a failure condition)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                SUM(shipping_charged_inr) AS total_shipping,
                COUNT(*) FILTER (WHERE shipping_charged_inr > 0) AS orders_with_shipping
            FROM orders
        """)
        row = cur.fetchone()
    total = float(row[0] or 0)
    count = int(row[1] or 0)
    return CheckResult(
        check_id="RC-REV-06",
        description="Shipping revenue excluded (advisory)",
        severity="ADVISORY",
        passed=True,
        detail=(
            f"Total shipping collected: ₹{total:,.2f} across {count} orders. "
            "Confirm this amount is excluded from all revenue KPIs (BR-004)."
        ),
    )
