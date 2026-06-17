"""
WooCommerce Orders importer — reads from 'Woocom - Orders' sheet.

Workbook column format (snake_case) differs from the CSV importer (title case).
Key differences:
  - 'order_id'        not 'Order ID'
  - 'order_date'      not 'Date Created'
  - 'discount_total'  not 'Cart Discount Amount'
  - 'Product Item N Name/id/SKU/Quantity/Total/Subtotal'  (not 'Item N Name')
  - unit_price_inr is derived (line_total / quantity); no column in workbook

Phases:
  1  open_import_run
  2  load reference data
  3  process rows → customers + orders + order_lines
  4  recompute customer aggregates (total_orders, first_order_at)
  5  run reconciliation checks
  6  close import_run
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import timezone
from pathlib import Path
from typing import Any

import pandas as pd

from importers.woocommerce.parser import (
    clean_lower,
    clean_str,
    parse_decimal,
    parse_int,
    parse_ist_to_utc,
)
from importers.woocommerce.resolver import (
    ReferenceData,
    VariantLookup,
    load_reference_data,
    resolve_variant,
)

from .config import Config
from .db import (
    close_import_run,
    fail_import_run,
    get_connection,
    log_import_error,
    open_import_run,
    update_rows_in_source,
)
from .reconciliation import ReconciliationResult, run_wc_checks
from .workbook_loader import WorkbookData

logger = logging.getLogger(__name__)

# ── Workbook column name constants (all lowercase after normalisation) ─────────

WC_SHEET = "Woocom - Orders"

WC_ORDER_ID         = "order_id"
WC_ORDER_NUMBER     = "order_number"
WC_ORDER_DATE       = "order_date"
WC_PAID_DATE        = "paid_date"
WC_STATUS           = "status"
WC_ORDER_TOTAL      = "order_total"
WC_SUBTOTAL         = "order_subtotal"
WC_DISCOUNT         = "discount_total"
WC_SHIPPING         = "shipping_total"
WC_PAYMENT          = "payment_method"
WC_PAYMENT_TITLE    = "payment_method_title"
WC_TRANSACTION_ID   = "transaction_id"
WC_EMAIL            = "billing_email"
WC_PHONE            = "billing_phone"
WC_FIRST_NAME       = "billing_first_name"
WC_LAST_NAME        = "billing_last_name"
WC_CITY             = "billing_city"
WC_STATE            = "billing_state"
WC_POSTCODE         = "billing_postcode"
WC_UTM_SOURCE       = "meta:_wc_order_attribution_utm_source"
WC_SOURCE_TYPE      = "meta:_wc_order_attribution_source_type"
WC_DEVICE           = "meta:_wc_order_attribution_device_type"

LINE_ITEM_SLOTS = range(1, 5)


def _li(n: int, field: str) -> str:
    """Column name for line item slot N, field.
    field: 'name' | 'id' | 'sku' | 'quantity' | 'total' | 'subtotal'
    """
    return f"product item {n} {field}"


# ── Payment method normalisation ──────────────────────────────────────────────

PAYMENT_METHOD_MAP: dict[str, str] = {
    "ccavenue":       "infibeam",       # CCAvenue is Infibeam's gateway brand
    "cod":            "cod",
    "gokwik_prepaid": "gokwik_prepaid",
    "razorpay":       "razorpay",
    "cheque":         "prepaid",
    "bacs":           "prepaid",
}

DEVICE_MAP: dict[str, str] = {
    "mobile":   "mobile",
    "phone":    "mobile",
    "desktop":  "desktop",
    "computer": "desktop",
    "tablet":   "tablet",
    "ipad":     "tablet",
}

_POSTCODE_RE = re.compile(r"^[1-9][0-9]{5}$")
_PHONE_RE    = re.compile(r"^[6-9][0-9]{9}$")


# ── Line item data structure ──────────────────────────────────────────────────

@dataclass
class WorkbookLineItem:
    slot: int
    name: str | None
    sku_raw: str | None
    wc_line_item_id: int | None
    quantity: int | None
    line_total: float | None     # post-discount → line_total_inr
    line_subtotal: float | None  # pre-discount  → line_subtotal_inr
    unit_price: float | None     # derived: line_total / quantity


# ── Importer class ────────────────────────────────────────────────────────────

class WooCommerceOrdersImporter:
    SOURCE       = "woocommerce"
    SOURCE_SHEET = WC_SHEET

    def __init__(
        self,
        workbook_data: WorkbookData,
        triggered_by: int,
    ):
        self.wb       = workbook_data
        self.triggered_by = triggered_by
        self._run_id  = 0
        self._counters: dict[str, int] = {
            "rows_in_source":         0,
            "rows_imported":          0,
            "rows_skipped_duplicate": 0,
            "rows_failed":            0,
            "rows_warnings":          0,
        }

    def execute(self) -> int:
        """Run the full WC orders import pipeline. Returns run_id."""
        df = self.wb.sheets.get(WC_SHEET)
        if df is None or df.empty:
            raise RuntimeError(f"Sheet {WC_SHEET!r} not loaded or is empty")

        with get_connection() as conn:
            self._run_id = open_import_run(
                conn,
                source=self.SOURCE,
                source_file=self.wb.path.name,
                source_sheet=self.SOURCE_SHEET,
                triggered_by=self.triggered_by,
            )
            logger.info("import_run_opened run_id=%d sheet=%r", self._run_id, self.SOURCE_SHEET)

            try:
                ref = load_reference_data(conn, Config.SKU_MANUAL_MAP_PATH)

                self._counters["rows_in_source"] = len(df)
                update_rows_in_source(conn, self._run_id, len(df))

                deferred_customers = self._process_rows(conn, df, ref)
                self._recompute_customer_aggregates(conn, deferred_customers)

                recon = run_wc_checks(conn)
                self._close(conn, recon)
                return self._run_id

            except Exception as exc:
                fail_import_run(conn, self._run_id, f"{type(exc).__name__}: {exc}")
                raise

    # ── Row processing ────────────────────────────────────────────────────────

    def _process_rows(
        self,
        conn,
        df: pd.DataFrame,
        ref: ReferenceData,
    ) -> set[int]:
        deferred: set[int] = set()

        for idx, series in df.iterrows():
            row_num = int(idx) + 2   # 1-indexed: +1 for header row, +1 for 0-base
            raw: dict[str, Any] = {k: str(v) for k, v in series.items()}

            # ── Required field validation ─────────────────────────────────────
            wc_id = parse_int(raw.get(WC_ORDER_ID))
            if not wc_id or wc_id <= 0:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"order_id missing or invalid: {raw.get(WC_ORDER_ID)!r}",
                    severity="error", field_name=WC_ORDER_ID,
                    field_value=raw.get(WC_ORDER_ID),
                )
                self._counters["rows_failed"] += 1
                continue

            order_total = parse_decimal(raw.get(WC_ORDER_TOTAL))
            if order_total is None or order_total < 0:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"order_total missing or negative: {raw.get(WC_ORDER_TOTAL)!r}",
                    severity="error", field_name=WC_ORDER_TOTAL,
                    field_value=raw.get(WC_ORDER_TOTAL),
                )
                self._counters["rows_failed"] += 1
                continue

            ordered_at = parse_ist_to_utc(raw.get(WC_ORDER_DATE))
            if ordered_at is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"order_date missing or unparseable: {raw.get(WC_ORDER_DATE)!r}",
                    severity="error", field_name=WC_ORDER_DATE,
                    field_value=raw.get(WC_ORDER_DATE),
                )
                self._counters["rows_failed"] += 1
                continue

            # ── Order dedup ───────────────────────────────────────────────────
            if wc_id in ref.existing_order_ids:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DUPLICATE_ORDER",
                    error_message=f"Order {wc_id} already in database — skipped",
                    severity="info", field_name=WC_ORDER_ID,
                    field_value=str(wc_id),
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            # ── Soft field validation (warn, don't reject) ────────────────────
            row_warnings: list[dict] = []

            paid_at = parse_ist_to_utc(raw.get(WC_PAID_DATE))
            if paid_at and ordered_at and paid_at < ordered_at:
                row_warnings.append({
                    "error_code":    "DQ_WARN",
                    "error_message": f"paid_date {paid_at} is before order_date {ordered_at}",
                    "severity":      "warning",
                    "field_name":    WC_PAID_DATE,
                    "field_value":   raw.get(WC_PAID_DATE),
                })
                paid_at = None

            email = _normalise_email(raw.get(WC_EMAIL))
            if not email:
                row_warnings.append({
                    "error_code":    "DQ_WARN",
                    "error_message": f"billing_email missing or invalid: {raw.get(WC_EMAIL)!r}",
                    "severity":      "warning",
                    "field_name":    WC_EMAIL,
                    "field_value":   raw.get(WC_EMAIL),
                })

            phone = _normalise_phone(raw.get(WC_PHONE))
            postcode = _normalise_postcode(raw.get(WC_POSTCODE))

            payment_method = PAYMENT_METHOD_MAP.get(
                (raw.get(WC_PAYMENT) or "").strip().lower()
            )
            if not payment_method:
                row_warnings.append({
                    "error_code":    "DQ_WARN",
                    "error_message": f"Unknown payment_method: {raw.get(WC_PAYMENT)!r} — stored as-is",
                    "severity":      "warning",
                    "field_name":    WC_PAYMENT,
                    "field_value":   raw.get(WC_PAYMENT),
                })
                payment_method = clean_str(raw.get(WC_PAYMENT))

            # ── Customer resolution ───────────────────────────────────────────
            customer_id = self._resolve_or_create_customer(
                conn, ref, row_num, raw, email, phone, ordered_at, row_warnings
            )
            if customer_id:
                deferred.add(customer_id)

            # ── Line items ────────────────────────────────────────────────────
            line_items = _parse_line_items(raw)
            valid_items = [li for li in line_items if li.quantity and li.quantity > 0]

            if not valid_items:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message="Order has no valid line items (all slots blank or qty=0)",
                    severity="error",
                )
                self._counters["rows_failed"] += 1
                continue

            # ── Order total vs line sum soft check ────────────────────────────
            shipping = parse_decimal(raw.get(WC_SHIPPING)) or 0.0
            discount = parse_decimal(raw.get(WC_DISCOUNT)) or 0.0
            line_sum = sum((li.line_total or 0.0) for li in valid_items)
            if abs(order_total - line_sum - shipping + discount) > 1.00:
                row_warnings.append({
                    "error_code":    "RECONCILE_WARN",
                    "error_message": (
                        f"order_total {order_total} ≠ lines {line_sum:.2f} + "
                        f"shipping {shipping:.2f} - discount {discount:.2f} = "
                        f"{line_sum + shipping - discount:.2f}"
                    ),
                    "severity":      "warning",
                    "field_name":    WC_ORDER_TOTAL,
                    "field_value":   str(order_total),
                })

            # ── Atomic INSERT: order + lines ──────────────────────────────────
            order_id = self._insert_order_atomic(
                conn, ref, row_num, raw,
                wc_id=wc_id,
                customer_id=customer_id,
                order_total=order_total,
                shipping=shipping,
                discount=discount,
                ordered_at=ordered_at,
                paid_at=paid_at,
                payment_method=payment_method,
                line_items=valid_items,
                row_warnings=row_warnings,
            )

            if order_id is None:
                self._counters["rows_failed"] += 1
                continue

            for w in row_warnings:
                log_import_error(conn, self._run_id, row_num, raw, **w)
                self._counters["rows_warnings"] += 1

            ref.existing_order_ids.add(wc_id)
            self._counters["rows_imported"] += 1

            if row_num % 100 == 0:
                logger.info(
                    "progress row=%d imported=%d skipped=%d failed=%d",
                    row_num,
                    self._counters["rows_imported"],
                    self._counters["rows_skipped_duplicate"],
                    self._counters["rows_failed"],
                )

        logger.info(
            "wc_rows_processed imported=%d skipped=%d failed=%d warnings=%d",
            self._counters["rows_imported"],
            self._counters["rows_skipped_duplicate"],
            self._counters["rows_failed"],
            self._counters["rows_warnings"],
        )
        return deferred

    # ── Customer helpers ──────────────────────────────────────────────────────

    def _resolve_or_create_customer(
        self,
        conn,
        ref: ReferenceData,
        row_num: int,
        raw: dict,
        email: str | None,
        phone: str | None,
        ordered_at,
        row_warnings: list[dict],
    ) -> int | None:
        if not email:
            return None

        if email in ref.customer_email_map:
            return ref.customer_email_map[email]

        sql = """
            INSERT INTO customers (
                email, phone, first_name, last_name,
                first_order_at, acquisition_source,
                total_orders, total_revenue_inr
            ) VALUES (%s, %s, %s, %s, %s, %s, 0, 0.00)
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        """
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (
                    email,
                    phone,
                    clean_str(raw.get(WC_FIRST_NAME)),
                    clean_str(raw.get(WC_LAST_NAME)),
                    ordered_at,
                    clean_lower(raw.get(WC_UTM_SOURCE)),
                ))
                result = cur.fetchone()
            if result:
                customer_id = result[0]
            else:
                # Row already exists (race condition or rerun) — fetch it
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM customers WHERE email = %s", (email,))
                    row = cur.fetchone()
                customer_id = row[0] if row else None
        except Exception as exc:
            logger.error("customer_insert_failed email=%s error=%s", email, exc)
            row_warnings.append({
                "error_code":    "FIELD_REJECTED",
                "error_message": f"Failed to create customer: {exc}",
                "severity":      "warning",
                "field_name":    WC_EMAIL,
                "field_value":   email,
            })
            return None

        if customer_id:
            ref.customer_email_map[email] = customer_id
            logger.debug("customer_created id=%d email=%s", customer_id, email)
        return customer_id

    # ── Order + lines atomic insert ───────────────────────────────────────────

    def _insert_order_atomic(
        self,
        conn,
        ref: ReferenceData,
        row_num: int,
        raw: dict,
        wc_id: int,
        customer_id: int | None,
        order_total: float,
        shipping: float,
        discount: float,
        ordered_at,
        paid_at,
        payment_method: str | None,
        line_items: list[WorkbookLineItem],
        row_warnings: list[dict],
    ) -> int | None:
        order_sql = """
            INSERT INTO orders (
                woocommerce_order_id, woocommerce_order_number,
                customer_id, status,
                payment_method, payment_method_title, transaction_id,
                subtotal_inr, discount_inr, shipping_charged_inr, order_total_inr,
                attribution_source, attribution_medium, attribution_campaign, attribution_device,
                billing_city, billing_state, billing_pincode,
                ordered_at, paid_at
            ) VALUES (
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s
            ) RETURNING id
        """
        line_sql = """
            INSERT INTO order_lines (
                order_id, variant_id, woocommerce_line_item_id,
                sku_raw, product_name_raw, quantity,
                unit_price_inr, line_total_inr, line_subtotal_inr
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        status_raw = (raw.get(WC_STATUS) or "").strip().lower()
        if status_raw == "on_hold":
            status_raw = "on-hold"

        device_raw = (raw.get(WC_DEVICE) or "").strip().lower()
        device = DEVICE_MAP.get(device_raw)

        order_params = (
            wc_id,
            clean_str(raw.get(WC_ORDER_NUMBER)),
            customer_id,
            status_raw or None,
            payment_method,
            clean_str(raw.get(WC_PAYMENT_TITLE)),
            clean_str(raw.get(WC_TRANSACTION_ID)) or None,
            parse_decimal(raw.get(WC_SUBTOTAL)),
            discount,
            shipping,
            order_total,
            clean_lower(raw.get(WC_UTM_SOURCE)) or None,
            clean_lower(raw.get(WC_SOURCE_TYPE)) or None,
            None,   # attribution_campaign — absent in workbook
            device,
            clean_str(raw.get(WC_CITY)),
            clean_str(raw.get(WC_STATE)),
            _normalise_postcode(raw.get(WC_POSTCODE)),
            ordered_at,
            paid_at,
        )

        # Resolve variants; build line params; collect per-slot SKU warnings
        line_params_list = []
        for li in line_items:
            variant_id = resolve_variant(
                li.sku_raw, li.wc_line_item_id,
                ref.variant_lookup, ref.manual_sku_map,
            )
            if variant_id is None and (li.sku_raw or li.wc_line_item_id):
                row_warnings.append({
                    "error_code":    "UNRESOLVED_SKU",
                    "error_message": (
                        f"SKU {li.sku_raw!r} has no matching product_variants row; "
                        "variant_id stored as NULL — KPI compute blocked until resolved"
                    ),
                    "severity":      "warning",
                    "field_name":    _li(li.slot, "sku"),
                    "field_value":   li.sku_raw,
                })

            line_params_list.append((
                None,            # order_id — filled in after order INSERT
                variant_id,
                li.wc_line_item_id,
                li.sku_raw,
                li.name,
                li.quantity,
                li.unit_price,
                li.line_total,
                li.line_subtotal,
            ))

        try:
            with conn.cursor() as cur:
                cur.execute("BEGIN")
                cur.execute(order_sql, order_params)
                order_id = cur.fetchone()[0]

                for lp in line_params_list:
                    cur.execute(line_sql, (
                        order_id, lp[1], lp[2], lp[3], lp[4],
                        lp[5], lp[6], lp[7], lp[8],
                    ))

                cur.execute("COMMIT")

            logger.debug(
                "order_inserted wc_id=%d order_id=%d lines=%d",
                wc_id, order_id, len(line_params_list),
            )
            return order_id

        except Exception as exc:
            try:
                with conn.cursor() as cur:
                    cur.execute("ROLLBACK")
            except Exception:
                pass
            logger.error("order_insert_failed wc_id=%d error=%s", wc_id, exc)
            log_import_error(
                conn, self._run_id, row_num, raw,
                error_code="FIELD_REJECTED",
                error_message=f"Database insert failed: {exc}",
                severity="error",
                field_name=WC_ORDER_ID,
                field_value=str(wc_id),
            )
            return None

    # ── Customer aggregate recompute ──────────────────────────────────────────

    def _recompute_customer_aggregates(self, conn, customer_ids: set[int]) -> None:
        """
        Batch-update total_orders and first_order_at.
        total_revenue_inr is deferred until SR shipments are imported (Step 5).
        """
        if not customer_ids:
            return

        sql = """
            UPDATE customers SET
                total_orders   = (
                    SELECT COUNT(*) FROM orders
                    WHERE customer_id = customers.id
                ),
                first_order_at = (
                    SELECT MIN(ordered_at) FROM orders
                    WHERE customer_id = customers.id
                )
            WHERE id = ANY(%s)
        """
        with conn.cursor() as cur:
            cur.execute(sql, (list(customer_ids),))

        logger.info("customer_aggregates_updated count=%d", len(customer_ids))

    # ── Close run ─────────────────────────────────────────────────────────────

    def _close(self, conn, recon: ReconciliationResult) -> None:
        imported = self._counters["rows_imported"]
        failed   = self._counters["rows_failed"]

        if imported == 0 and failed > 0:
            final_status = "failed"
        elif failed > 0:
            final_status = "partial"
        else:
            final_status = "completed"

        close_import_run(
            conn=conn,
            run_id=self._run_id,
            status=final_status,
            counters=self._counters,
            recon_status=recon.status,
            recon_notes=recon.notes,
            hard_passed=recon.hard_passed,
            hard_failed=recon.hard_failed,
            soft_passed=recon.soft_passed,
            soft_warned=recon.soft_warned,
        )
        logger.info(
            "import_run_closed run_id=%d status=%s recon=%s",
            self._run_id, final_status, recon.status,
        )


# ── Module-level helpers ──────────────────────────────────────────────────────

def _parse_line_items(raw: dict[str, Any]) -> list[WorkbookLineItem]:
    items: list[WorkbookLineItem] = []
    for n in LINE_ITEM_SLOTS:
        name    = clean_str(raw.get(_li(n, "name")))
        sku_raw = clean_str(raw.get(_li(n, "sku")))

        if not name and not sku_raw:
            continue   # slot N not present; stop here

        qty          = parse_int(raw.get(_li(n, "quantity")))
        line_total   = parse_decimal(raw.get(_li(n, "total")))
        line_subtotal = parse_decimal(raw.get(_li(n, "subtotal")))
        wc_item_id   = parse_int(raw.get(_li(n, "id")))

        # Derive unit price from line_total / quantity
        if line_total is not None and qty and qty > 0:
            unit_price = round(line_total / qty, 2)
        else:
            unit_price = None

        items.append(WorkbookLineItem(
            slot=n,
            name=name,
            sku_raw=sku_raw,
            wc_line_item_id=wc_item_id,
            quantity=qty,
            line_total=line_total,
            line_subtotal=line_subtotal,
            unit_price=unit_price,
        ))
    return items


def _normalise_email(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().lower()
    return s if "@" in s and "." in s.split("@")[-1] else None


def _normalise_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if re.match(r"^[6-9][0-9]{9}$", digits) else None


def _normalise_postcode(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().split(".")[0]  # handle '110001.0'
    return s if _POSTCODE_RE.match(s) else None
