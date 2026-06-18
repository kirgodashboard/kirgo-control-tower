"""
Shiprocket Shipments importer — reads SR - 2023 / 2024 / 2025 / 2026 sheets.

All 4 sheets are processed inside a single import_run.
After completion, customers.total_revenue_inr is batch-updated.

Data quality issues handled here:
  - Go artefact '%!f(string=N.)' in freight/COD columns
  - 'N/A' string in delivered date fields (2025-2026)
  - 'RTO DELIVERED' (space) vs 'RTO_DELIVERED' (underscore) across years
  - '-C' suffix on Order ID for cancelled SR orders
"""
from __future__ import annotations

import datetime
import logging
import re
from pathlib import Path

import pandas as pd

from importers.woocommerce.parser import (
    clean_str,
    parse_decimal,
    parse_int,
    parse_ist_to_utc,
)
from importers.woocommerce.resolver import (
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
from .reconciliation import ReconciliationResult, run_sr_checks
from .workbook_loader import WorkbookData

logger = logging.getLogger(__name__)

# ── Sheet names and column constants (lowercase) ──────────────────────────────

SR_SHEETS: list[str] = ["SR - 2023", "SR - 2024", "SR - 2025", "SR - 2026"]
SOURCE_SHEET_LABEL = "SR-2023..SR-2026"

SR_ORDER_ID        = "order id"
SR_FORWARD_ID      = "forward id"
SR_CHANNEL         = "channel"
SR_STATUS          = "status"
SR_CHANNEL_SKU     = "channel sku"
SR_MASTER_SKU      = "master sku"
SR_PRODUCT_QTY     = "product quantity"
SR_PAYMENT         = "payment method"
SR_PRODUCT_PRICE   = "product price"
SR_ORDER_TOTAL     = "order total"
SR_COURIER         = "courier company"
SR_AWB             = "awb code"
SR_ZONE            = "zone"
SR_FREIGHT         = "freight total amount"
SR_COD_CHARGES     = "cod charges"
SR_CRF_ID          = "crf id"
SR_COD_REM_DATE    = "cod remittance date"
SR_COD_PAYABLE     = "cod payble amount"   # Shiprocket typo: 'payble'
SR_REMITTED        = "remitted amount"
SR_SR_CREATED_AT   = "shiprocket created at"
SR_CH_CREATED_AT   = "channel created at"
SR_PICKEDUP        = "pickedup timestamp"
SR_SHIPPED         = "order shipped date"
SR_DELIVERED       = "order delivered date"
SR_EDD             = "edd"
SR_RTO_INIT        = "rto initiated date"
SR_RTO_DELIVERED   = "rto delivered date"
SR_NDR_1           = "ndr 1 attempt date"
SR_NDR_2           = "ndr 2 attempt date"
SR_NDR_3           = "ndr 3 attempt date"
SR_LATEST_NDR      = "latest ndr reason"
SR_CITY            = "address city"
SR_STATE           = "address state"
SR_PINCODE         = "address pincode"
SR_RTO_RISK        = "rto risk"

NDR_DATE_COLS = [SR_NDR_1, SR_NDR_2, SR_NDR_3]

# ── Status normalisation ──────────────────────────────────────────────────────

SR_STATUS_MAP: dict[str, str] = {
    "DELIVERED":            "DELIVERED",
    "CANCELED":             "CANCELED",
    "CANCELLED":            "CANCELED",
    "RTO_DELIVERED":        "RTO_DELIVERED",
    "RTO DELIVERED":        "RTO_DELIVERED",  # 2025-2026 space variant
    "RTO_ACKNOWLEDGED":     "RTO_ACKNOWLEDGED",
    "RTO ACKNOWLEDGED":     "RTO_ACKNOWLEDGED",
    "NEW_ORDER":            "NEW_ORDER",
    "IN_TRANSIT":           "IN_TRANSIT",
    "OUT_FOR_DELIVERY":     "OUT_FOR_DELIVERY",
    "LOST":                 "LOST",
    "PICKUP_PENDING":       "PICKUP_PENDING",
    "PICKUP_QUEUED":        "PICKUP_QUEUED",
    "PENDING":              "PENDING",
    "NDR":                  "NDR",
    "RETURN_INITIATED":     "RETURN_INITIATED",
}

VALID_ZONES: frozenset[str] = frozenset({"z_a", "z_b", "z_c", "z_d", "z_e"})

RTO_RISK_MAP: dict[str, str] = {
    "low":    "low",
    "medium": "medium",
    "high":   "high",
}

# Go artefact produced by Shiprocket's Go-based data pipeline
_GO_ARTEFACT_RE = re.compile(r"^%!f\(string=(.*)\)$")

# Excel encodes blank date cells as serial 0 → 1900-01-01; reject anything before this
_MIN_VALID_DATE = datetime.date(2000, 1, 1)


# ── Importer class ────────────────────────────────────────────────────────────

class ShiprocketShipmentsImporter:
    SOURCE       = "shiprocket"
    SOURCE_SHEET = SOURCE_SHEET_LABEL

    def __init__(self, workbook_data: WorkbookData, triggered_by: int):
        self.wb           = workbook_data
        self.triggered_by = triggered_by
        self._run_id      = 0
        self._counters: dict[str, int] = {
            "rows_in_source":         0,
            "rows_imported":          0,
            "rows_skipped_duplicate": 0,
            "rows_failed":            0,
            "rows_warnings":          0,
        }

    def execute(self) -> int:
        with get_connection() as conn:
            self._run_id = open_import_run(
                conn,
                source=self.SOURCE,
                source_file=self.wb.path.name,
                source_sheet=self.SOURCE_SHEET,
                triggered_by=self.triggered_by,
            )
            logger.info("import_run_opened run_id=%d source=shiprocket", self._run_id)

            try:
                ref = load_reference_data(conn, Config.SKU_MANUAL_MAP_PATH)
                order_id_map = _load_order_id_map(conn)
                existing_shipments = _load_existing_shipments(conn)

                total_rows = 0
                affected_customers: set[int] = set()

                for sheet in SR_SHEETS:
                    df = self.wb.sheets.get(sheet)
                    if df is None:
                        logger.warning("sr_sheet_missing sheet=%r — skipping", sheet)
                        continue

                    sheet_affected = self._process_sheet(
                        conn, df, sheet, ref, order_id_map, existing_shipments
                    )
                    affected_customers.update(sheet_affected)
                    total_rows += len(df)

                update_rows_in_source(conn, self._run_id, total_rows)
                self._counters["rows_in_source"] = total_rows

                self._update_customer_revenue(conn, affected_customers)

                recon = run_sr_checks(conn)
                self._close(conn, recon)
                return self._run_id

            except Exception as exc:
                fail_import_run(conn, self._run_id, f"{type(exc).__name__}: {exc}")
                raise

    # ── Sheet processing ──────────────────────────────────────────────────────

    def _process_sheet(
        self,
        conn,
        df: pd.DataFrame,
        sheet_name: str,
        ref,
        order_id_map: dict[int, int],
        existing_shipments: set[tuple],
    ) -> set[int]:
        """Process one SR sheet. Returns set of customer_ids affected."""
        affected: set[int] = set()

        for idx, series in df.iterrows():
            row_num = int(idx) + 2
            raw: dict = {k: str(v) for k, v in series.items()}

            # ── Required field validation ──────────────────────────────────
            master_sku = clean_str(raw.get(SR_MASTER_SKU))
            if not master_sku:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message="master_sku is blank — cannot identify shipment",
                    severity="error", field_name=SR_MASTER_SKU,
                )
                self._counters["rows_failed"] += 1
                continue

            product_qty = parse_int(raw.get(SR_PRODUCT_QTY))
            if not product_qty or product_qty <= 0:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"product_quantity invalid: {raw.get(SR_PRODUCT_QTY)!r}",
                    severity="error", field_name=SR_PRODUCT_QTY,
                )
                self._counters["rows_failed"] += 1
                continue

            # ── Shipment dedup ─────────────────────────────────────────────
            sr_order_id_raw = clean_str(raw.get(SR_FORWARD_ID)) or ""
            sr_order_id     = _parse_bigint(sr_order_id_raw)
            awb_code        = clean_str(raw.get(SR_AWB))

            dedup_key = (sr_order_id, master_sku) if sr_order_id else None
            fallback_key = awb_code  # UNIQUE constraint on awb_code

            if dedup_key and dedup_key in existing_shipments:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DUPLICATE_SHIPMENT",
                    error_message=f"Shipment ({sr_order_id}, {master_sku}) already in DB — skipped",
                    severity="info",
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            if fallback_key and _awb_exists(conn, fallback_key):
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DUPLICATE_SHIPMENT",
                    error_message=f"AWB {fallback_key!r} already in DB — skipped",
                    severity="info", field_name=SR_AWB, field_value=fallback_key,
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            # ── Field mapping ──────────────────────────────────────────────
            order_id = _resolve_sr_order_id(raw.get(SR_ORDER_ID, ""), order_id_map)
            if order_id is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="MISSING_WC_ORDER",
                    error_message=f"SR Order ID {raw.get(SR_ORDER_ID)!r} has no matching WC order",
                    severity="info", field_name=SR_ORDER_ID,
                    field_value=raw.get(SR_ORDER_ID),
                )
                self._counters["rows_warnings"] += 1

            status_raw = (raw.get(SR_STATUS) or "").strip()
            status = SR_STATUS_MAP.get(status_raw, status_raw) or None

            zone_raw = (raw.get(SR_ZONE) or "").strip().lower().replace(" ", "_")
            zone = zone_raw if zone_raw in VALID_ZONES else None

            payment_raw = (raw.get(SR_PAYMENT) or "").strip().upper()
            payment_method = "cod" if payment_raw == "COD" else ("prepaid" if payment_raw else None)

            rto_risk_raw = (raw.get(SR_RTO_RISK) or "").strip().lower()
            rto_risk = RTO_RISK_MAP.get(rto_risk_raw)

            delivered_at = _parse_sr_datetime(raw.get(SR_DELIVERED))
            if status == "DELIVERED" and delivered_at is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DQ_WARN",
                    error_message="Status=DELIVERED but delivered_at is NULL — revenue recognition blocked",
                    severity="warning", field_name=SR_DELIVERED,
                    field_value=raw.get(SR_DELIVERED),
                )
                self._counters["rows_warnings"] += 1

            ndr_count = sum(
                1 for col in NDR_DATE_COLS
                if (raw.get(col) or "").strip() and raw.get(col, "").strip() != "N/A"
            )

            variant_id = resolve_variant(
                master_sku, None, ref.variant_lookup, ref.manual_sku_map
            )

            # ── INSERT shipment ────────────────────────────────────────────
            shipment_id = self._insert_shipment(
                conn, row_num, raw,
                order_id=order_id,
                sr_order_id=sr_order_id,
                awb_code=awb_code,
                channel=clean_str(raw.get(SR_CHANNEL)),
                status=status,
                variant_id=variant_id,
                channel_sku=clean_str(raw.get(SR_CHANNEL_SKU)),
                master_sku=master_sku,
                product_qty=product_qty,
                payment_method=payment_method,
                product_price=parse_decimal(raw.get(SR_PRODUCT_PRICE)),
                order_total=parse_decimal(raw.get(SR_ORDER_TOTAL)),
                courier=clean_str(raw.get(SR_COURIER)),
                zone=zone,
                freight=_parse_go_decimal(raw.get(SR_FREIGHT)),
                cod_charges=_parse_go_decimal(raw.get(SR_COD_CHARGES)) or 0.0,
                cod_crf_id=clean_str(raw.get(SR_CRF_ID)),
                cod_remittance_date=_parse_date_only(raw.get(SR_COD_REM_DATE)),
                cod_payable=parse_decimal(raw.get(SR_COD_PAYABLE)),
                remitted=parse_decimal(raw.get(SR_REMITTED)),
                sr_created_at=_parse_sr_datetime(raw.get(SR_SR_CREATED_AT)),
                ch_created_at=_parse_sr_datetime(raw.get(SR_CH_CREATED_AT)),
                picked_up_at=_parse_sr_datetime(raw.get(SR_PICKEDUP)),
                shipped_at=_parse_sr_datetime(raw.get(SR_SHIPPED)),
                delivered_at=delivered_at,
                edd=_parse_date_only(raw.get(SR_EDD)),
                rto_initiated_at=_parse_sr_datetime(raw.get(SR_RTO_INIT)),
                rto_delivered_at=_parse_sr_datetime(raw.get(SR_RTO_DELIVERED)),
                ndr_attempts=ndr_count,
                latest_ndr_reason=clean_str(raw.get(SR_LATEST_NDR)),
                customer_city=clean_str(raw.get(SR_CITY)),
                customer_state=clean_str(raw.get(SR_STATE)),
                customer_pincode=clean_str(raw.get(SR_PINCODE)),
                rto_risk=rto_risk,
            )

            if shipment_id is None:
                self._counters["rows_failed"] += 1
                continue

            if dedup_key:
                existing_shipments.add(dedup_key)

            if order_id:
                # Track which customers need revenue recompute
                customer_id = _get_customer_id_for_order(conn, order_id)
                if customer_id:
                    affected.add(customer_id)

            self._counters["rows_imported"] += 1

        logger.info(
            "sr_sheet_done sheet=%r imported=%d skipped=%d failed=%d",
            sheet_name,
            self._counters["rows_imported"],
            self._counters["rows_skipped_duplicate"],
            self._counters["rows_failed"],
        )
        return affected

    def _insert_shipment(self, conn, row_num: int, raw: dict, **kw) -> int | None:
        sql = """
            INSERT INTO shipments (
                order_id, shiprocket_order_id, awb_code, channel, status,
                variant_id, channel_sku, master_sku, product_quantity, payment_method,
                product_price_inr, order_total_inr, courier_company, zone,
                freight_total_inr, cod_charges_inr, cod_crf_id, cod_remittance_date,
                cod_payable_inr, remitted_inr,
                shiprocket_created_at, channel_created_at,
                picked_up_at, shipped_at, delivered_at, edd,
                rto_initiated_at, rto_delivered_at,
                ndr_attempts, latest_ndr_reason,
                customer_city, customer_state, customer_pincode, rto_risk
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s
            ) RETURNING id
        """
        params = (
            kw["order_id"], kw["sr_order_id"], kw["awb_code"],
            kw["channel"], kw["status"],
            kw["variant_id"], kw["channel_sku"], kw["master_sku"],
            kw["product_qty"], kw["payment_method"],
            kw["product_price"], kw["order_total"],
            kw["courier"], kw["zone"],
            kw["freight"], kw["cod_charges"],
            kw["cod_crf_id"], kw["cod_remittance_date"],
            kw["cod_payable"], kw["remitted"],
            kw["sr_created_at"], kw["ch_created_at"],
            kw["picked_up_at"], kw["shipped_at"],
            kw["delivered_at"], kw["edd"],
            kw["rto_initiated_at"], kw["rto_delivered_at"],
            kw["ndr_attempts"], kw["latest_ndr_reason"],
            kw["customer_city"], kw["customer_state"],
            kw["customer_pincode"], kw["rto_risk"],
        )
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        except Exception as exc:
            logger.error(
                "shipment_insert_failed sr_id=%s sku=%s error=%s",
                kw["sr_order_id"], kw["master_sku"], exc,
            )
            log_import_error(
                conn, self._run_id, row_num, raw,
                error_code="FIELD_REJECTED",
                error_message=f"Shipment insert failed: {exc}",
                severity="error",
                field_name=SR_FORWARD_ID,
                field_value=str(kw["sr_order_id"]),
            )
            return None

    # ── Post-SR: update customer revenue ──────────────────────────────────────

    def _update_customer_revenue(self, conn, customer_ids: set[int]) -> None:
        if not customer_ids:
            return

        sql = """
            UPDATE customers SET
                total_revenue_inr = (
                    SELECT COALESCE(SUM(ol.line_total_inr), 0)
                    FROM orders o
                    JOIN shipments s   ON s.order_id  = o.id
                    JOIN order_lines ol ON ol.order_id = o.id
                    WHERE o.customer_id = customers.id
                      AND s.status = 'DELIVERED'
                      AND s.delivered_at IS NOT NULL
                )
            WHERE id = ANY(%s)
        """
        with conn.cursor() as cur:
            cur.execute(sql, (list(customer_ids),))

        logger.info("customer_revenue_updated count=%d", len(customer_ids))

    # ── Close ─────────────────────────────────────────────────────────────────

    def _close(self, conn, recon: ReconciliationResult) -> None:
        imported = self._counters["rows_imported"]
        failed   = self._counters["rows_failed"]
        status   = "completed" if failed == 0 else ("failed" if imported == 0 else "partial")

        close_import_run(
            conn=conn, run_id=self._run_id,
            status=status, counters=self._counters,
            recon_status=recon.status, recon_notes=recon.notes,
            hard_passed=recon.hard_passed, hard_failed=recon.hard_failed,
            soft_passed=recon.soft_passed, soft_warned=recon.soft_warned,
        )
        logger.info("import_run_closed run_id=%d status=%s", self._run_id, status)


# ── Module-level helpers ──────────────────────────────────────────────────────

def _load_order_id_map(conn) -> dict[int, int]:
    """Return {woocommerce_order_id: orders.id} for all existing orders."""
    with conn.cursor() as cur:
        cur.execute("SELECT woocommerce_order_id, id FROM orders")
        return {row[0]: row[1] for row in cur.fetchall()}


def _load_existing_shipments(conn) -> set[tuple]:
    """Return set of (shiprocket_order_id, master_sku) for existing shipments."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT shiprocket_order_id, master_sku FROM shipments "
            "WHERE shiprocket_order_id IS NOT NULL AND master_sku IS NOT NULL"
        )
        return {(row[0], row[1]) for row in cur.fetchall()}


def _awb_exists(conn, awb_code: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM shipments WHERE awb_code = %s", (awb_code,))
        return cur.fetchone() is not None


def _get_customer_id_for_order(conn, order_id: int) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT customer_id FROM orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        return row[0] if row else None


def _resolve_sr_order_id(raw_val: str | None, order_id_map: dict[int, int]) -> int | None:
    """
    Strip '-C' suffix (cancellation IDs like '1320-C'), cast to int,
    look up in order_id_map {wc_order_id → orders.id}.
    Returns None if not parseable or not found.
    """
    if not raw_val or not raw_val.strip():
        return None
    clean = str(raw_val).strip().split("-")[0]
    try:
        wc_id = int(float(clean))
        return order_id_map.get(wc_id)
    except (ValueError, TypeError):
        return None


def _parse_bigint(raw: str | None) -> int | None:
    if not raw or not str(raw).strip():
        return None
    try:
        return int(float(str(raw).strip()))
    except (ValueError, TypeError):
        return None


def _parse_go_decimal(value: str | None) -> float | None:
    """Parse numeric strings that may contain Go format artefact '%!f(string=N.)'."""
    if not value or not str(value).strip():
        return None
    s = str(value).strip()
    m = _GO_ARTEFACT_RE.match(s)
    if m:
        s = m.group(1)
    try:
        cleaned = s.replace(",", "").strip()
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _parse_sr_datetime(value: str | None):
    """
    Parse SR datetime string (IST, format 'YYYY-MM-DD HH:MM:SS').
    Returns UTC datetime or None.
    'N/A', blank strings, and Excel epoch placeholder (1900-01-01) all return None.
    """
    if not value:
        return None
    s = str(value).strip()
    if s.upper() in ("N/A", "NA", ""):
        return None
    result = parse_ist_to_utc(s)
    if result is not None and result.date() < _MIN_VALID_DATE:
        return None
    return result


def _parse_date_only(value: str | None):
    """Parse a date-only value. Returns a date object or None.
    Excel epoch placeholder (1900-01-01) returns None."""
    if not value:
        return None
    s = str(value).strip()
    if s.upper() in ("N/A", "NA", ""):
        return None
    from dateutil import parser as dp
    try:
        d = dp.parse(s).date()
        return d if d >= _MIN_VALID_DATE else None
    except Exception:
        return None
