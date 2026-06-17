"""
Returns importer — reads Returns - 2023 / 2024 / 2025 / Returns 2025 - 2026 sheets.

All 4 sheets are processed inside a single import_run.

Forward shipment matching:
  - Returns-2023/2024/2025:   match Forward ID → shipments.shiprocket_order_id
  - Returns 2025-2026:        match AWB Code   → shipments.awb_code
    (Kirgo-internal return IDs like R_2023 can't resolve via shiprocket_order_id)
"""
from __future__ import annotations

import logging

import pandas as pd

from importers.woocommerce.parser import clean_str, parse_decimal, parse_int

from .db import (
    close_import_run,
    fail_import_run,
    get_connection,
    log_import_error,
    open_import_run,
    update_rows_in_source,
)
from .reconciliation import ReconciliationResult, run_returns_checks
from .sr_shipments import _parse_bigint, _parse_sr_datetime
from .workbook_loader import WorkbookData

logger = logging.getLogger(__name__)

# ── Sheet names and column constants ─────────────────────────────────────────

RETURNS_SHEETS: list[str] = [
    "Returns - 2023",
    "Returns - 2024",
    "Returns - 2025",
    "Returns 2025 - 2026 ",   # trailing space — exact name
]
SOURCE_SHEET_LABEL = "Returns-2023..2026"

RT_FORWARD_ID  = "forward id"
RT_AWB         = "awb code"
RT_STATUS      = "status"
RT_REASON      = "return reason"
RT_QC_STATUS   = "qc status"
RT_QC_FAIL     = "qc failure reason"
RT_REFUND_AMT  = "refund amount"
RT_REFUND_STAT = "refund status"
RT_REFUND_MODE = "refund mode"
RT_RETURNED_AT = "order delivered date"   # date return arrived at warehouse

RETURN_STATUS_MAP: dict[str, str] = {
    "RETURN ACKNOWLEDGED":     "RETURN ACKNOWLEDGED",
    "RETURN DELIVERED":        "RETURN DELIVERED",
    "RETURN CANCELLED":        "RETURN CANCELLED",
    "RETURN PENDING":          "RETURN PENDING",
    "REACHED DESTINATION HUB": "REACHED DESTINATION HUB",
    "LOST":                    "LOST",
}

REFUND_STATUS_MAP: dict[str, str] = {
    "Pending":  "pending",
    "Refunded": "processed",
    "pending":  "pending",
    "processed": "processed",
}

REFUND_MODE_MAP: dict[str, str] = {
    "Original Payment Method":          "original_payment_method",
    "original payment method":          "original_payment_method",
    "Bank Transfer":                    "bank_transfer",
    "bank transfer":                    "bank_transfer",
}

QC_STATUS_MAP: dict[str, str] = {
    "pass": "pass", "Pass": "pass", "PASS": "pass",
    "fail": "fail", "Fail": "fail", "FAIL": "fail",
    "pending": "pending", "Pending": "pending", "PENDING": "pending",
}


# ── Importer class ────────────────────────────────────────────────────────────

class ReturnsImporter:
    SOURCE       = "returns"
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
            logger.info("import_run_opened run_id=%d source=returns", self._run_id)

            try:
                total_rows = 0

                for sheet in RETURNS_SHEETS:
                    df = self.wb.sheets.get(sheet)
                    if df is None:
                        logger.warning("returns_sheet_missing sheet=%r — skipping", sheet)
                        continue
                    self._process_sheet(conn, df, sheet)
                    total_rows += len(df)

                update_rows_in_source(conn, self._run_id, total_rows)
                self._counters["rows_in_source"] = total_rows

                recon = run_returns_checks(conn)
                self._close(conn, recon)
                return self._run_id

            except Exception as exc:
                fail_import_run(conn, self._run_id, f"{type(exc).__name__}: {exc}")
                raise

    # ── Sheet processing ──────────────────────────────────────────────────────

    def _process_sheet(self, conn, df: pd.DataFrame, sheet_name: str) -> None:
        for idx, series in df.iterrows():
            row_num = int(idx) + 2
            raw: dict = {k: str(v) for k, v in series.items()}

            # ── Required field validation ──────────────────────────────────
            status_raw = (raw.get(RT_STATUS) or "").strip()
            status = RETURN_STATUS_MAP.get(status_raw.upper(), status_raw) or None
            if not status:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"return status missing: {raw.get(RT_STATUS)!r}",
                    severity="error", field_name=RT_STATUS,
                )
                self._counters["rows_failed"] += 1
                continue

            # ── Dedup check ────────────────────────────────────────────────
            forward_id = _parse_bigint(raw.get(RT_FORWARD_ID))
            awb_code   = clean_str(raw.get(RT_AWB))

            if _return_exists(conn, forward_id, awb_code):
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DUPLICATE_RETURN",
                    error_message=f"Return (forward_id={forward_id}, awb={awb_code}) already in DB",
                    severity="info",
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            # ── Find matching forward shipment ─────────────────────────────
            shipment_id = _find_forward_shipment(conn, forward_id, awb_code, sheet_name)
            if shipment_id is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="MISSING_SHIPMENT",
                    error_message=(
                        f"No matching forward shipment for "
                        f"forward_id={forward_id}, awb={awb_code}"
                    ),
                    severity="info",
                )
                self._counters["rows_warnings"] += 1

            # ── Field mapping ──────────────────────────────────────────────
            returned_at = _parse_sr_datetime(raw.get(RT_RETURNED_AT))

            if status == "RETURN DELIVERED" and returned_at is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DQ_WARN",
                    error_message="status=RETURN DELIVERED but returned_at is NULL",
                    severity="warning", field_name=RT_RETURNED_AT,
                )
                self._counters["rows_warnings"] += 1

            qc_raw      = (raw.get(RT_QC_STATUS) or "").strip()
            qc_status   = QC_STATUS_MAP.get(qc_raw)

            refund_stat_raw = (raw.get(RT_REFUND_STAT) or "").strip()
            refund_status   = REFUND_STATUS_MAP.get(refund_stat_raw)

            refund_mode_raw = (raw.get(RT_REFUND_MODE) or "").strip()
            refund_mode     = REFUND_MODE_MAP.get(refund_mode_raw)

            # ── INSERT return ──────────────────────────────────────────────
            ret_id = self._insert_return(
                conn, row_num, raw,
                shipment_id=shipment_id,
                shiprocket_order_id=forward_id,
                awb_code=awb_code,
                status=status,
                return_reason=clean_str(raw.get(RT_REASON)),
                qc_status=qc_status,
                qc_failure_reason=clean_str(raw.get(RT_QC_FAIL)),
                refund_amount_inr=parse_decimal(raw.get(RT_REFUND_AMT)),
                refund_status=refund_status,
                refund_mode=refund_mode,
                returned_at=returned_at,
            )

            if ret_id is None:
                self._counters["rows_failed"] += 1
                continue

            self._counters["rows_imported"] += 1

        logger.info(
            "returns_sheet_done sheet=%r imported=%d skipped=%d failed=%d",
            sheet_name,
            self._counters["rows_imported"],
            self._counters["rows_skipped_duplicate"],
            self._counters["rows_failed"],
        )

    def _insert_return(self, conn, row_num: int, raw: dict, **kw) -> int | None:
        sql = """
            INSERT INTO returns (
                shipment_id, shiprocket_order_id, awb_code,
                status, return_reason,
                qc_status, qc_failure_reason,
                refund_amount_inr, refund_status, refund_mode,
                returned_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        params = (
            kw["shipment_id"],
            kw["shiprocket_order_id"],
            kw["awb_code"],
            kw["status"],
            kw["return_reason"],
            kw["qc_status"],
            kw["qc_failure_reason"],
            kw["refund_amount_inr"],
            kw["refund_status"],
            kw["refund_mode"],
            kw["returned_at"],
        )
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()[0]
        except Exception as exc:
            logger.error("return_insert_failed error=%s", exc)
            log_import_error(
                conn, self._run_id, row_num, raw,
                error_code="FIELD_REJECTED",
                error_message=f"Return insert failed: {exc}",
                severity="error",
            )
            return None

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

def _find_forward_shipment(
    conn,
    forward_id: int | None,
    awb_code: str | None,
    sheet_name: str,
) -> int | None:
    """
    Returns-2023/2024/2025: match by shiprocket_order_id.
    Returns 2025-2026: match by awb_code (Kirgo-internal return IDs).
    """
    if "Returns 2025 - 2026" in sheet_name:
        if not awb_code:
            return None
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM shipments WHERE awb_code = %s LIMIT 1",
                (awb_code,),
            )
            row = cur.fetchone()
            return row[0] if row else None
    else:
        if not forward_id:
            return None
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM shipments WHERE shiprocket_order_id = %s LIMIT 1",
                (forward_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None


def _return_exists(conn, forward_id: int | None, awb_code: str | None) -> bool:
    """Check if this return is already in the DB."""
    if forward_id:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM returns WHERE shiprocket_order_id = %s AND awb_code IS NOT DISTINCT FROM %s",
                (forward_id, awb_code),
            )
            if cur.fetchone():
                return True
    if awb_code:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM returns WHERE awb_code = %s", (awb_code,)
            )
            if cur.fetchone():
                return True
    return False
