"""
Bank Transactions importer — reads 2023 / 2024 / 2025  / 2026 HDFC bank sheets.

All 4 sheets are processed inside a single import_run (source='bank_statement').

For each transaction classified as 'gateway_settlement' or 'cod_remittance',
a corresponding gateway_settlements row is also inserted and the two rows
are linked via FK (bank_transactions.linked_settlement_id ↔ gateway_settlements.bank_transaction_id).
This insert pair is wrapped in an explicit BEGIN/COMMIT/ROLLBACK.

Balance continuity validation is run per-sheet and logged as DQ_WARN on breaks.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import pandas as pd

from importers.woocommerce.parser import clean_str

from .db import (
    close_import_run,
    fail_import_run,
    get_connection,
    log_import_error,
    open_import_run,
    update_rows_in_source,
)
from .reconciliation import ReconciliationResult, run_bank_checks
from .workbook_loader import BANK_SHEETS, WorkbookData

logger = logging.getLogger(__name__)

# ── Column constants (lowercase after header normalisation) ───────────────────

BK_DATE        = "date"
BK_NARRATION   = "narration"
BK_REF_NO      = "chq./ref.no."
BK_VALUE_DT    = "value dt"
BK_WITHDRAWAL  = "withdrawal amt."
BK_DEPOSIT     = "deposit amt."
BK_CLOSING_BAL = "closing balance"

SOURCE_SHEET_LABEL = "HDFC-2023..2026"

# ── Narration classification ──────────────────────────────────────────────────

@dataclass
class ClassifiedTransaction:
    transaction_type:    str
    gateway:             str | None
    extracted_reference: str | None
    counterparty:        str | None


def _extract_crf_id(narration: str, ref_no: str) -> str | None:
    m = re.search(r"CRF ID (\d+)", narration, re.I)
    return m.group(1) if m else None


def _extract_cms_ref(narration: str, ref_no: str) -> str | None:
    m = re.search(r"(CMS\w+)", narration, re.I)
    if m:
        return m.group(1)
    return ref_no.lstrip("0") if ref_no else None


def _extract_yesf_ref(narration: str, ref_no: str) -> str | None:
    m = re.search(r"(YESF\w+|ICICN\w+|IN\d{14,})", narration, re.I)
    if m:
        return m.group(1)
    return ref_no.strip() if ref_no else None


def _extract_upi_ref(narration: str, ref_no: str) -> str | None:
    m = re.search(r"/(\d{12,})", narration)
    if m:
        return m.group(1)
    return ref_no.lstrip("0") if ref_no else None


def _extract_ref_number(narration: str, ref_no: str) -> str | None:
    return ref_no.lstrip("0") if ref_no else None


# Each rule: (pattern, transaction_type, gateway, extractor_fn, direction)
# direction: 'credit' | 'debit' | None (both)
_NARRATION_RULES: list[tuple] = [
    # ── Inbound: revenue settlements ──────────────────────────────────────────
    (re.compile(r"SHIPROCKET COD CRF ID (\d+)", re.I),
     "cod_remittance",       "shiprocket_cod",   _extract_crf_id,     "credit"),
    (re.compile(r"INFIBEAM AVENUES", re.I),
     "gateway_settlement",   "infibeam",         _extract_cms_ref,    "credit"),
    (re.compile(r"EASEBUZZ PVT LTD", re.I),
     "gateway_settlement",   "easebuzz",         _extract_yesf_ref,   "credit"),
    (re.compile(r"BIGFOOT RETAIL SOLUTIONS", re.I),
     "gateway_settlement",   "gokwik",           _extract_cms_ref,    "credit"),
    (re.compile(r"RAZORPAY", re.I),
     "gateway_settlement",   "razorpay",         _extract_ref_number, "credit"),
    (re.compile(r"SHIPROCKET PRIVATE LIMITED", re.I),
     "gateway_settlement",   "shiprocket_cod",   _extract_ref_number, "credit"),
    (re.compile(r"^UPI-.+-(KIRGO|ORDER)\b", re.I),
     "gateway_settlement",   None,               _extract_upi_ref,    "credit"),
    # ── Inbound: non-revenue ──────────────────────────────────────────────────
    (re.compile(r"SIDDHARTH.+BAJPAI|WINSTON.+MENDONCA", re.I),
     "founder_transfer",     None,               _extract_ref_number, "credit"),
    # ── Outbound: platform costs ──────────────────────────────────────────────
    (re.compile(r"BIGFOOT RETAIL|SHIPROCKET", re.I),
     "shiprocket_recharge",  None,               _extract_ref_number, "debit"),
    (re.compile(r"^UPI-.+REFUND", re.I),
     "customer_refund",      None,               _extract_upi_ref,    None),
    # ── Outbound: supplier / capex ────────────────────────────────────────────
    (re.compile(r"ADVANCE PAYMENT OF IMPORT BILL", re.I),
     "supplier_payment",     None,               _extract_ref_number, None),
    (re.compile(r"PAYPAL", re.I),
     "supplier_payment",     None,               _extract_ref_number, None),
    (re.compile(r"^POS.+AMAZON|^UPI.+AMAZON", re.I),
     "supplier_payment",     None,               _extract_ref_number, None),
    # ── Outbound: marketing / SaaS ────────────────────────────────────────────
    (re.compile(r"GOOGLE WORKSPACE|ME DC SI.+GOOGLE", re.I),
     "saas_subscription",    None,               _extract_ref_number, None),
    (re.compile(r"CANVA", re.I),
     "saas_subscription",    None,               _extract_ref_number, None),
    # ── Bank fees ─────────────────────────────────────────────────────────────
    (re.compile(r"INSTAALERT|INSTAALER|DEBIT CARD ANNUAL FEE|BOE OVERDUE", re.I),
     "bank_charge",          None,               _extract_ref_number, None),
    # ── FX charges ───────────────────────────────────────────────────────────
    (re.compile(r"DC INTL POS TXN", re.I),
     "fx_loss",              None,               _extract_ref_number, None),
    # ── Tax ──────────────────────────────────────────────────────────────────
    (re.compile(r"27AAACH2702H1Z0", re.I),
     "miscellaneous",        None,               _extract_ref_number, None),
    # ── Fallback ─────────────────────────────────────────────────────────────
    (re.compile(r".*"),
     "unclassified",         None,               _extract_ref_number, None),
]

_GATEWAY_TYPES = frozenset({"gateway_settlement", "cod_remittance"})


def classify_narration(narration: str, is_credit: bool) -> ClassifiedTransaction:
    """
    Apply NARRATION_RULES in priority order (first match wins).
    is_credit: True = deposit, False = withdrawal.
    """
    ref_no = ""   # not available at classification time; callers pass it to extractor later
    for pattern, txn_type, gateway, extractor, direction in _NARRATION_RULES:
        if direction == "credit" and not is_credit:
            continue
        if direction == "debit" and is_credit:
            continue
        if pattern.search(narration):
            extracted_ref  = extractor(narration, ref_no)
            counterparty   = _extract_counterparty(narration)
            return ClassifiedTransaction(txn_type, gateway, extracted_ref, counterparty)
    return ClassifiedTransaction("unclassified", None, None, None)


def _extract_counterparty(narration: str) -> str | None:
    n = narration.strip()
    if n.startswith("NEFT CR-"):
        parts = n.split("-")
        return parts[2].strip() if len(parts) >= 3 else None
    if n.startswith("UPI-"):
        parts = n.split("-")
        return parts[2].strip() if len(parts) >= 3 else None
    if n.startswith("IMPS-"):
        parts = n.split("-")
        return parts[2].strip() if len(parts) >= 3 else None
    if n.startswith("POS ") or n.startswith("ME DC"):
        m = re.search(r"\d{4}XXXXXX\d{4}\s+(.+?)(?:\s+CYBS)?$", n)
        if m:
            return m.group(1).strip()
    return None


# ── Importer class ────────────────────────────────────────────────────────────

class BankTransactionsImporter:
    SOURCE       = "bank_statement"
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
            logger.info("import_run_opened run_id=%d source=bank_statement", self._run_id)

            try:
                total_rows = 0

                for sheet in BANK_SHEETS:
                    df = self.wb.sheets.get(sheet)
                    if df is None:
                        logger.warning("bank_sheet_missing sheet=%r — skipping", sheet)
                        continue
                    self._process_sheet(conn, df, sheet)
                    total_rows += len(df)

                update_rows_in_source(conn, self._run_id, total_rows)
                self._counters["rows_in_source"] = total_rows

                recon = run_bank_checks(conn)
                self._close(conn, recon)
                return self._run_id

            except Exception as exc:
                fail_import_run(conn, self._run_id, f"{type(exc).__name__}: {exc}")
                raise

    # ── Sheet processing ──────────────────────────────────────────────────────

    def _process_sheet(self, conn, df: pd.DataFrame, sheet_name: str) -> None:
        rows_parsed: list[dict] = []

        for idx, series in df.iterrows():
            row_num = int(idx) + 23   # account for actual row number in file (header=20, asterisk=21, data from 22)
            raw: dict = {k: str(v) for k, v in series.items()}

            # ── Hard validation ────────────────────────────────────────────
            txn_date = _parse_bank_date(raw.get(BK_DATE))
            if txn_date is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message=f"Date unparseable: {raw.get(BK_DATE)!r}",
                    severity="error", field_name=BK_DATE,
                    field_value=raw.get(BK_DATE),
                )
                self._counters["rows_failed"] += 1
                continue

            withdrawal = _parse_amount(raw.get(BK_WITHDRAWAL))
            deposit    = _parse_amount(raw.get(BK_DEPOSIT))

            if withdrawal is None and deposit is None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message="Both Withdrawal and Deposit are blank — invalid row",
                    severity="error",
                )
                self._counters["rows_failed"] += 1
                continue

            if withdrawal is not None and deposit is not None:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="FIELD_REJECTED",
                    error_message="Both Withdrawal and Deposit are non-blank — ambiguous row",
                    severity="error",
                )
                self._counters["rows_failed"] += 1
                continue

            # ── Dedup check ────────────────────────────────────────────────
            narration_raw = (raw.get(BK_NARRATION) or "").strip()
            if _bank_txn_exists(conn, txn_date, narration_raw, withdrawal, deposit):
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="DUPLICATE_BANK_TXN",
                    error_message=(
                        f"Bank transaction ({txn_date}, {narration_raw[:40]!r}) "
                        "already in DB — skipped"
                    ),
                    severity="info",
                )
                self._counters["rows_skipped_duplicate"] += 1
                continue

            # ── Classification ─────────────────────────────────────────────
            is_credit    = deposit is not None
            classified   = classify_narration(narration_raw, is_credit)

            # Re-run extractor with actual ref_no available
            ref_no_raw   = (raw.get(BK_REF_NO) or "").strip()
            for pattern, _, _, extractor, direction in _NARRATION_RULES:
                if direction == "credit" and not is_credit:
                    continue
                if direction == "debit" and is_credit:
                    continue
                if pattern.search(narration_raw):
                    classified = ClassifiedTransaction(
                        classified.transaction_type,
                        classified.gateway,
                        extractor(narration_raw, ref_no_raw),
                        classified.counterparty,
                    )
                    break

            if classified.transaction_type == "unclassified":
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="UNCLASSIFIED_NARRATION",
                    error_message=f"Narration not matched by any classifier rule: {narration_raw[:80]!r}",
                    severity="warning",
                    field_name=BK_NARRATION,
                    field_value=narration_raw[:100],
                )
                self._counters["rows_warnings"] += 1

            if classified.transaction_type == "cod_remittance" and not classified.extracted_reference:
                log_import_error(
                    conn, self._run_id, row_num, raw,
                    error_code="MISSING_COD_CRF_ID",
                    error_message=f"COD remittance narration but no CRF ID extracted: {narration_raw[:80]!r}",
                    severity="warning",
                    field_name=BK_NARRATION,
                    field_value=narration_raw[:100],
                )
                self._counters["rows_warnings"] += 1

            # ── Parse remaining fields ─────────────────────────────────────
            value_date      = _parse_bank_date(raw.get(BK_VALUE_DT))
            closing_balance = _parse_amount(raw.get(BK_CLOSING_BAL))

            row_data = {
                "transaction_date":    txn_date,
                "value_date":          value_date,
                "narration_raw":       narration_raw,
                "reference_number":    ref_no_raw or None,
                "withdrawal_inr":      withdrawal,
                "deposit_inr":         deposit,
                "closing_balance_inr": closing_balance,
                "transaction_type":    classified.transaction_type,
                "extracted_reference": classified.extracted_reference,
                "counterparty":        classified.counterparty,
                "is_gateway":          classified.transaction_type in _GATEWAY_TYPES,
                "gateway":             classified.gateway,
            }
            rows_parsed.append((row_num, raw, row_data))

        # ── Balance continuity validation (per sheet) ──────────────────────
        parsed_dicts = [rd for _, _, rd in rows_parsed]
        balance_warns = _validate_balance_continuity(parsed_dicts)
        for w in balance_warns:
            log_import_error(
                conn, self._run_id, 0, {"sheet": sheet_name},
                error_code="BALANCE_DISCONTINUITY",
                error_message=(
                    f"Balance break on {w['date']}: "
                    f"expected {w['expected']}, got {w['actual']} "
                    f"(diff {w['diff']:+.2f}) — {w['narration']}"
                ),
                severity="warning",
            )
            self._counters["rows_warnings"] += 1

        # ── Insert rows ────────────────────────────────────────────────────
        for row_num, raw, rd in rows_parsed:
            bank_txn_id = self._insert_bank_txn_and_settlement(conn, row_num, raw, rd)
            if bank_txn_id is None:
                self._counters["rows_failed"] += 1
            else:
                self._counters["rows_imported"] += 1

        logger.info(
            "bank_sheet_done sheet=%r imported=%d skipped=%d failed=%d",
            sheet_name,
            self._counters["rows_imported"],
            self._counters["rows_skipped_duplicate"],
            self._counters["rows_failed"],
        )

    # ── Atomic bank_transaction + gateway_settlement insert ───────────────────

    def _insert_bank_txn_and_settlement(
        self,
        conn,
        row_num: int,
        raw: dict,
        rd: dict,
    ) -> int | None:
        """
        Insert bank_transactions row.
        If gateway/COD transaction: also insert gateway_settlements and link FKs.
        The pair is wrapped in BEGIN/COMMIT/ROLLBACK.
        Returns bank_transactions.id on success, None on failure.
        """
        bank_txn_sql = """
            INSERT INTO bank_transactions (
                transaction_date, value_date,
                narration_raw, reference_number,
                withdrawal_inr, deposit_inr, closing_balance_inr,
                transaction_type, counterparty, extracted_reference,
                linked_settlement_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)
            RETURNING id
        """
        gs_sql = """
            INSERT INTO gateway_settlements (
                gateway, settlement_reference,
                amount_inr, settled_at, bank_transaction_id
            ) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (settlement_reference) DO NOTHING
            RETURNING id
        """
        link_sql = """
            UPDATE bank_transactions
            SET linked_settlement_id = %s
            WHERE id = %s
        """
        link_gs_sql = """
            UPDATE gateway_settlements
            SET bank_transaction_id = %s
            WHERE id = %s
        """

        try:
            with conn.cursor() as cur:
                cur.execute("BEGIN")

                # 1. Insert bank transaction
                cur.execute(bank_txn_sql, (
                    rd["transaction_date"],
                    rd["value_date"],
                    rd["narration_raw"],
                    rd["reference_number"],
                    rd["withdrawal_inr"],
                    rd["deposit_inr"],
                    rd["closing_balance_inr"],
                    rd["transaction_type"],
                    rd["counterparty"],
                    rd["extracted_reference"],
                ))
                bank_txn_id = cur.fetchone()[0]

                gs_id = None
                if rd["is_gateway"] and rd["gateway"]:
                    amount_inr = rd["deposit_inr"]   # settlements are always credits
                    if amount_inr is None:
                        amount_inr = rd["withdrawal_inr"]  # COD recharges are debits (shouldn't happen)

                    # 2. Insert gateway settlement (only if settlement_reference is unique/null)
                    cur.execute(gs_sql, (
                        rd["gateway"],
                        rd["extracted_reference"],   # may be None; ON CONFLICT won't fire for NULLs
                        amount_inr,
                        rd["transaction_date"],      # settled_at = bank transaction date
                        bank_txn_id,
                    ))
                    gs_row = cur.fetchone()

                    if gs_row:
                        gs_id = gs_row[0]
                        # 3. Link bank_transaction → gateway_settlement
                        cur.execute(link_sql, (gs_id, bank_txn_id))
                    else:
                        # ON CONFLICT DO NOTHING: settlement_reference already exists
                        # Find existing gs and link to this bank_txn
                        if rd["extracted_reference"]:
                            cur.execute(
                                "SELECT id FROM gateway_settlements WHERE settlement_reference = %s",
                                (rd["extracted_reference"],),
                            )
                            existing = cur.fetchone()
                            if existing:
                                gs_id = existing[0]
                                cur.execute(link_sql, (gs_id, bank_txn_id))
                                cur.execute(
                                    "UPDATE gateway_settlements SET bank_transaction_id = %s WHERE id = %s",
                                    (bank_txn_id, gs_id),
                                )

                cur.execute("COMMIT")

            logger.debug(
                "bank_txn_inserted id=%d type=%s gs_id=%s",
                bank_txn_id, rd["transaction_type"], gs_id,
            )
            return bank_txn_id

        except Exception as exc:
            try:
                with conn.cursor() as cur:
                    cur.execute("ROLLBACK")
            except Exception:
                pass
            logger.error(
                "bank_txn_insert_failed date=%s narration=%s error=%s",
                rd["transaction_date"], rd["narration_raw"][:40], exc,
            )
            log_import_error(
                conn, self._run_id, row_num, raw,
                error_code="FIELD_REJECTED",
                error_message=f"Bank transaction insert failed: {exc}",
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

def _parse_bank_date(val: str | None) -> date | None:
    """Parse HDFC date format dd/mm/yy."""
    if not val:
        return None
    s = str(val).strip()
    try:
        return datetime.strptime(s, "%d/%m/%y").date()
    except ValueError:
        return None


def _parse_amount(val: str | None) -> Decimal | None:
    """Parse a numeric string to Decimal. Returns None if blank or unparseable."""
    if not val:
        return None
    s = str(val).strip().replace(",", "")
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _bank_txn_exists(
    conn,
    txn_date: date,
    narration: str,
    withdrawal: Decimal | None,
    deposit: Decimal | None,
) -> bool:
    """
    Primary dedup key: (transaction_date, narration_raw, withdrawal_inr, deposit_inr).
    NULL-safe comparison using IS NOT DISTINCT FROM.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM bank_transactions
            WHERE transaction_date = %s
              AND narration_raw = %s
              AND withdrawal_inr IS NOT DISTINCT FROM %s
              AND deposit_inr    IS NOT DISTINCT FROM %s
            LIMIT 1
            """,
            (txn_date, narration, withdrawal, deposit),
        )
        return cur.fetchone() is not None


def _validate_balance_continuity(rows: list[dict]) -> list[dict]:
    """
    For consecutive rows, verify:
        prev.closing_balance ± current.amount ≈ current.closing_balance
    Tolerance: ±0.01 (rounding in HDFC PDF export).
    Returns list of dicts for any break found.
    """
    warnings = []
    prev_balance: Decimal | None = None

    for row in rows:
        closing = row.get("closing_balance_inr")
        if prev_balance is not None and closing is not None:
            wd  = row["withdrawal_inr"] or Decimal(0)
            dep = row["deposit_inr"]    or Decimal(0)
            expected = prev_balance - wd + dep
            if abs(expected - closing) > Decimal("0.01"):
                warnings.append({
                    "date":     str(row["transaction_date"]),
                    "narration": row["narration_raw"][:40],
                    "expected":  float(expected),
                    "actual":    float(closing),
                    "diff":      float(closing - expected),
                })
        prev_balance = closing

    return warnings
