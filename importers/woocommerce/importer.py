"""
WooCommerce Importer — main orchestration.

Phases:
  0  Pre-flight
  1  Open import_run
  2  Load reference data
  3  Parse CSV
  4  Process rows (validate → customer → order → lines)
  5  Recompute customer aggregates
  6  Post-import reconciliation
  7  Close import_run
  8  Archive source file
"""
from __future__ import annotations

import logging
import shutil
from datetime import date
from pathlib import Path
from typing import Any

import psycopg2.extras

from .config import Config
from .db import (
    close_import_run,
    fail_import_run,
    log_import_error,
    open_import_run,
    update_rows_in_source,
    get_connection,
)
from .parser import (
    ParsedRow,
    LineItem,
    clean_lower,
    clean_str,
    parse_decimal,
    parse_ist_to_utc,
)
from .reconciliation import ReconciliationResult, run_reconciliation
from .resolver import ReferenceData, load_reference_data, resolve_variant
from .validators import (
    normalise_device,
    validate_email,
    validate_line_item,
    validate_line_items_present,
    validate_order_id,
    validate_order_total,
    validate_order_total_vs_lines,
    validate_ordered_at,
    validate_paid_at,
    validate_payment_method,
    validate_phone,
    validate_postcode,
    validate_status,
)
from .parser import parse_csv

logger = logging.getLogger(__name__)


class FatalImportError(Exception):
    """Raised on file-level errors; halts the entire run."""


class WooCommerceImporter:
    SOURCE = "woocommerce"

    def __init__(self, source_file: Path, triggered_by: int):
        self.source_file = source_file
        self.triggered_by = triggered_by
        self.run_id: int = 0
        self._counters: dict[str, int] = {
            "rows_in_source":        0,
            "rows_imported":         0,
            "rows_skipped_duplicate": 0,
            "rows_failed":           0,
            "rows_warnings":         0,
        }

    # ── Public entry point ────────────────────────────────────────────────────

    def execute(self) -> int:
        """Run the full import pipeline. Returns run_id."""
        self._preflight()

        with get_connection() as conn:
            self.run_id = open_import_run(conn, self.source_file.name, self.triggered_by)
            logger.info("import_run_opened run_id=%d file=%s", self.run_id, self.source_file.name)

            try:
                ref = load_reference_data(conn, Config.SKU_MANUAL_MAP_PATH)
                rows = self._parse(conn)
                self._counters["rows_in_source"] = len(rows)
                update_rows_in_source(conn, self.run_id, len(rows))

                deferred_customers = self._process_rows(conn, rows, ref)
                self._recompute_customer_aggregates(conn, deferred_customers)

                recon = run_reconciliation(conn)
                self._close(conn, recon)
                self._archive()
                return self.run_id

            except FatalImportError as exc:
                fail_import_run(conn, self.run_id, str(exc))
                raise
            except Exception as exc:
                fail_import_run(conn, self.run_id, f"{type(exc).__name__}: {exc}")
                raise

    # ── Phase 0: Pre-flight ───────────────────────────────────────────────────

    def _preflight(self) -> None:
        if not self.source_file.exists():
            raise FatalImportError(f"Source file not found: {self.source_file}")
        if self.source_file.suffix.lower() not in {".csv", ".xlsx"}:
            raise FatalImportError(
                f"Unsupported file type '{self.source_file.suffix}'. Expected .csv or .xlsx"
            )
        logger.info("preflight_ok file=%s size_bytes=%d", self.source_file.name,
                    self.source_file.stat().st_size)

    # ── Phase 3: Parse CSV ────────────────────────────────────────────────────

    def _parse(self, conn) -> list[ParsedRow]:
        from .parser import ParseError
        try:
            rows = parse_csv(self.source_file)
        except ParseError as exc:
            fail_import_run(conn, self.run_id, str(exc))
            raise FatalImportError(str(exc)) from exc
        if not rows:
            raise FatalImportError("File contains no data rows after parsing")
        return rows

    # ── Phase 4: Process rows ─────────────────────────────────────────────────

    def _process_rows(
        self,
        conn,
        rows: list[ParsedRow],
        ref: ReferenceData,
    ) -> set[int]:
        """
        Iterate over all parsed rows. For each row:
          - Validate required fields
          - Check order dedup
          - Resolve / create customer
          - Validate soft fields
          - Unpivot and validate line items
          - INSERT order + lines (atomic BEGIN/COMMIT)
          - Log warnings into import_errors
        Returns the set of customer_ids that need aggregate recompute.
        """
        deferred: set[int] = set()

        for parsed in rows:
            row_num = parsed.row_number
            raw = parsed.raw

            # ── 4.1 Required field validation ──────────────────────────────
            wc_id, err = validate_order_id(raw)
            if err:
                log_import_error(conn, self.run_id, row_num, raw, **err)
                self._counters["rows_failed"] += 1
                continue

            order_total, err = validate_order_total(raw)
            if err:
                log_import_error(conn, self.run_id, row_num, raw, **err)
                self._counters["rows_failed"] += 1
                continue

            ordered_at, err = validate_ordered_at(raw)
            if err:
                log_import_error(conn, self.run_id, row_num, raw, **err)
                self._counters["rows_failed"] += 1
                continue

            # ── 4.2 Order dedup ────────────────────────────────────────────
            if wc_id in ref.existing_order_ids:
                log_import_error(
                    conn, self.run_id, row_num, raw,
                    error_code="DUPLICATE_ORDER",
                    error_message=f"Order {wc_id} already in database — skipped",
                    severity="info",
                    field_name="Order ID",
                    field_value=str(wc_id),
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            # ── 4.3 Soft field validation ──────────────────────────────────
            row_warnings: list[dict] = []

            status, warns = validate_status(raw)
            row_warnings.extend(warns)

            email, warns = validate_email(raw)
            row_warnings.extend(warns)

            phone, warns = validate_phone(raw)
            row_warnings.extend(warns)

            postcode, warns = validate_postcode(raw)
            row_warnings.extend(warns)

            paid_at, warns = validate_paid_at(raw, ordered_at)
            row_warnings.extend(warns)

            payment_method, warns = validate_payment_method(raw)
            row_warnings.extend(warns)

            # ── 4.4 Customer resolution ────────────────────────────────────
            customer_id = self._resolve_or_create_customer(
                conn, ref, row_num, raw,
                email=email,
                phone=phone,
                ordered_at=ordered_at,
                row_warnings=row_warnings,
            )
            if customer_id:
                deferred.add(customer_id)

            # ── 4.5 Validate and filter line items ─────────────────────────
            valid_items: list[LineItem] = []
            for item in parsed.line_items:
                item_err = validate_line_item(item)
                if item_err:
                    log_import_error(conn, self.run_id, row_num, raw, **item_err)
                    self._counters["rows_warnings"] += 1
                elif item.quantity and item.quantity > 0:
                    valid_items.append(item)

            no_items_err = validate_line_items_present(valid_items)
            if no_items_err:
                log_import_error(conn, self.run_id, row_num, raw, **no_items_err)
                self._counters["rows_failed"] += 1
                continue

            # ── 4.6 Order total vs line sum check ─────────────────────────
            shipping = parse_decimal(raw.get("order shipping")) or 0.0
            discount = parse_decimal(raw.get("cart discount amount")) or 0.0
            total_warn = validate_order_total_vs_lines(
                order_total, valid_items, shipping, discount
            )
            if total_warn:
                row_warnings.append(total_warn)

            # ── 4.7 Atomic INSERT: order + order_lines ─────────────────────
            order_id = self._insert_order_atomic(
                conn, ref, row_num, raw,
                wc_id=wc_id,
                customer_id=customer_id,
                status=status,
                payment_method=payment_method,
                order_total=order_total,
                shipping=shipping,
                discount=discount,
                ordered_at=ordered_at,
                paid_at=paid_at,
                line_items=valid_items,
                row_warnings=row_warnings,
            )

            if order_id is None:
                # Insert failed — already logged inside helper
                self._counters["rows_failed"] += 1
                continue

            # ── 4.8 Log any warnings for this row ─────────────────────────
            for w in row_warnings:
                log_import_error(conn, self.run_id, row_num, raw, **w)
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
            "rows_processed imported=%d skipped=%d failed=%d warnings=%d",
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
        if email is None:
            return None

        if email in ref.customer_email_map:
            return ref.customer_email_map[email]

        # New customer — insert immediately (auto-commits via autocommit=True)
        sql = """
            INSERT INTO customers (
                email, phone, first_name, last_name,
                first_order_at, acquisition_source,
                total_orders, total_revenue_inr
            ) VALUES (%s, %s, %s, %s, %s, %s, 0, 0.00)
            RETURNING id
        """
        first_name = clean_str(raw.get("billing first name"))
        last_name  = clean_str(raw.get("billing last name"))
        acq_source = clean_lower(raw.get("order attribution source"))

        try:
            with conn.cursor() as cur:
                cur.execute(sql, (
                    email, phone, first_name, last_name,
                    ordered_at, acq_source,
                ))
                customer_id = cur.fetchone()[0]
        except Exception as exc:
            logger.error("customer_insert_failed email=%s error=%s", email, exc)
            row_warnings.append({
                "error_code":    "FIELD_REJECTED",
                "error_message": f"Failed to create customer record: {exc}",
                "severity":      "warning",
                "field_name":    "Billing Email",
                "field_value":   email,
            })
            return None

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
        status: str,
        payment_method: str | None,
        order_total: float,
        shipping: float,
        discount: float,
        ordered_at,
        paid_at,
        line_items: list[LineItem],
        row_warnings: list[dict],
    ) -> int | None:
        """
        Insert orders row + all order_lines rows inside a single transaction.
        Returns orders.id on success, None on failure.
        Failures are logged to import_errors.
        """
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
                order_id, variant_id,
                sku_raw, product_name_raw, quantity,
                unit_price_inr, line_total_inr, line_subtotal_inr
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        # Build order params
        order_params = (
            wc_id,
            clean_str(raw.get("order number")),
            customer_id,
            status,
            payment_method,
            clean_str(raw.get("payment method title")),
            clean_str(raw.get("transaction id")) or None,
            parse_decimal(raw.get("cart subtotal")),
            discount,
            shipping,
            order_total,
            clean_lower(raw.get("utm_source")) or None,
            clean_lower(raw.get("utm_medium")) or None,
            clean_str(raw.get("utm_campaign")) or None,
            normalise_device(raw),
            clean_str(raw.get("billing city")),
            clean_str(raw.get("billing state")),
            _resolve_postcode(raw),
            ordered_at,
            paid_at,
        )

        # Resolve variants and build line params
        line_params_list = []
        for item in line_items:
            variant_id = resolve_variant(
                item.sku, item.wc_product_id,
                ref.variant_lookup, ref.manual_sku_map,
            )
            if variant_id is None and (item.sku or item.wc_product_id):
                row_warnings.append({
                    "error_code":    "UNRESOLVED_SKU",
                    "error_message": f"SKU '{item.sku}' has no matching product_variants row; "
                                     "variant_id stored as NULL — KPI compute blocked until resolved",
                    "severity":      "warning",
                    "field_name":    f"Item {item.slot} SKU",
                    "field_value":   item.sku,
                })

            computed_total = (
                item.line_total
                if item.line_total is not None
                else (item.unit_price or 0.0) * (item.quantity or 0)
            )
            line_params_list.append((
                None,            # order_id placeholder — set after INSERT
                variant_id,
                item.sku,
                item.name,
                item.quantity,
                item.unit_price,
                round(computed_total, 2),
                item.line_total,
            ))

        # ── Atomic block: BEGIN / COMMIT / ROLLBACK ──────────────────────
        try:
            with conn.cursor() as cur:
                cur.execute("BEGIN")

                cur.execute(order_sql, order_params)
                order_id = cur.fetchone()[0]

                for lp in line_params_list:
                    cur.execute(line_sql, (
                        order_id,   # replace placeholder
                        lp[1], lp[2], lp[3], lp[4], lp[5], lp[6], lp[7],
                    ))

                cur.execute("COMMIT")

            logger.debug("order_inserted wc_id=%d order_id=%d lines=%d", wc_id, order_id, len(line_params_list))
            return order_id

        except Exception as exc:
            try:
                with conn.cursor() as cur:
                    cur.execute("ROLLBACK")
            except Exception:
                pass
            logger.error("order_insert_failed wc_id=%d error=%s", wc_id, exc)
            log_import_error(
                conn, self.run_id, row_num, raw,
                error_code="FIELD_REJECTED",
                error_message=f"Database insert failed: {exc}",
                severity="error",
                field_name="Order ID",
                field_value=str(wc_id),
            )
            return None

    # ── Phase 5: Recompute customer aggregates ────────────────────────────────

    def _recompute_customer_aggregates(self, conn, customer_ids: set[int]) -> None:
        """
        Batch-update total_orders and first_order_at for all affected customers.

        total_revenue_inr is intentionally NOT updated here:
        it requires shipments.delivered_at which comes from the Shiprocket import.
        It will be recomputed after Phase 4 (shipments import).
        """
        if not customer_ids:
            return

        sql = """
            UPDATE customers SET
                total_orders   = (
                    SELECT COUNT(DISTINCT woocommerce_order_id)
                    FROM orders
                    WHERE customer_id = customers.id
                ),
                first_order_at = (
                    SELECT MIN(ordered_at)
                    FROM orders
                    WHERE customer_id = customers.id
                )
            WHERE id = ANY(%s)
        """
        with conn.cursor() as cur:
            cur.execute(sql, (list(customer_ids),))

        logger.info("customer_aggregates_updated count=%d", len(customer_ids))

    # ── Phase 7: Close run ────────────────────────────────────────────────────

    def _close(self, conn, recon: ReconciliationResult) -> None:
        imported  = self._counters["rows_imported"]
        failed    = self._counters["rows_failed"]

        if imported == 0 and failed > 0:
            final_status = "failed"
        elif failed > 0:
            final_status = "partial"
        else:
            final_status = "completed"

        close_import_run(
            conn=conn,
            run_id=self.run_id,
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
            self.run_id, final_status, recon.status,
        )

    # ── Phase 8: Archive source file ──────────────────────────────────────────

    def _archive(self) -> None:
        today = date.today()
        date_str = today.strftime("%Y-%m-%d")
        year_str = today.strftime("%Y")

        archive_dir = Config.archive_dir(year_str)
        processed_dir = Config.processed_dir(date_str)

        archive_dir.mkdir(parents=True, exist_ok=True)
        processed_dir.mkdir(parents=True, exist_ok=True)

        archive_dest = archive_dir / self.source_file.name
        processed_dest = processed_dir / self.source_file.name

        shutil.copy2(self.source_file, archive_dest)
        shutil.move(str(self.source_file), processed_dest)

        logger.info(
            "source_file_archived archive=%s processed=%s",
            archive_dest, processed_dest,
        )


# ── Private helpers ───────────────────────────────────────────────────────────

def _resolve_postcode(raw: dict) -> str | None:
    import re
    val = clean_str(raw.get("billing postcode"))
    if val and re.match(r"^[1-9][0-9]{5}$", val):
        return val
    return None


def lookup_user_by_email(conn, email: str) -> int:
    """Return the users.id for a given email. Raises ValueError if not found."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        row = cur.fetchone()
    if not row:
        raise ValueError(
            f"No user found with email '{email}' in the users table. "
            "Ensure the admin user has been created in Supabase Auth and inserted into users."
        )
    return row[0]
