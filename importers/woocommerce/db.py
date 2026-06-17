"""
Database helpers — psycopg2 connection and shared write operations.

Uses autocommit=True on the connection. Order+lines blocks are wrapped in
explicit BEGIN/COMMIT/ROLLBACK. All other writes (import_runs, import_errors,
customer inserts) auto-commit immediately.
"""
from __future__ import annotations

import json
import logging
import math
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.extras

from .config import Config

logger = logging.getLogger(__name__)


@contextmanager
def get_connection():
    """Open a direct psycopg2 connection to Supabase with autocommit=True."""
    conn = psycopg2.connect(Config.db_url(), sslmode="require")
    conn.autocommit = True
    try:
        yield conn
    finally:
        conn.close()


def dict_cursor(conn) -> psycopg2.extras.RealDictCursor:
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ── Import run management ─────────────────────────────────────────────────────

def open_import_run(conn, source_file: str, triggered_by: int) -> int:
    """Insert an import_runs row with status='running'. Returns run_id."""
    sql = """
        INSERT INTO import_runs (
            source, source_file, source_sheet,
            status, triggered_by, run_started_at
        ) VALUES ('woocommerce', %s, 'Woocom - Orders', 'running', %s, NOW())
        RETURNING id
    """
    with conn.cursor() as cur:
        cur.execute(sql, (source_file, triggered_by))
        row = cur.fetchone()
    return row[0]


def update_rows_in_source(conn, run_id: int, count: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE import_runs SET rows_in_source = %s WHERE id = %s",
            (count, run_id),
        )


def close_import_run(
    conn,
    run_id: int,
    status: str,
    counters: dict[str, int],
    recon_status: str,
    recon_notes: str,
    hard_passed: int,
    hard_failed: int,
    soft_passed: int,
    soft_warned: int,
) -> None:
    sql = """
        UPDATE import_runs SET
            status                 = %s,
            run_completed_at       = NOW(),
            rows_imported          = %s,
            rows_skipped_duplicate = %s,
            rows_failed            = %s,
            rows_warnings          = %s,
            reconciliation_status  = %s,
            reconciliation_run_at  = NOW(),
            reconciliation_notes   = %s,
            hard_checks_passed     = %s,
            hard_checks_failed     = %s,
            soft_checks_passed     = %s,
            soft_checks_warned     = %s
        WHERE id = %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, (
            status,
            counters.get("rows_imported", 0),
            counters.get("rows_skipped_duplicate", 0),
            counters.get("rows_failed", 0),
            counters.get("rows_warnings", 0),
            recon_status,
            recon_notes,
            hard_passed,
            hard_failed,
            soft_passed,
            soft_warned,
            run_id,
        ))


def fail_import_run(conn, run_id: int, error_summary: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE import_runs
               SET status = 'failed', run_completed_at = NOW(), error_summary = %s
               WHERE id = %s""",
            (error_summary[:500], run_id),
        )


# ── Error logging ─────────────────────────────────────────────────────────────

def _safe_json(row: dict[str, Any]) -> str:
    """Serialize a row dict to JSON, converting NaN/inf to None."""
    clean: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            clean[k] = None
        else:
            clean[k] = v
    return json.dumps(clean, default=str)


def log_import_error(
    conn,
    run_id: int,
    row_number: int,
    source_row: dict[str, Any],
    error_code: str,
    error_message: str,
    severity: str,                  # 'error' | 'warning' | 'info'
    field_name: str | None = None,
    field_value: str | None = None,
) -> None:
    """Insert one row into import_errors. Auto-committed (autocommit=True)."""
    sql = """
        INSERT INTO import_errors (
            import_run_id, row_number, source_row_snapshot,
            error_code, error_message, severity,
            field_name, field_value_raw, resolution_status
        ) VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s, %s, 'unresolved')
    """
    snapshot = _safe_json(source_row)
    with conn.cursor() as cur:
        try:
            cur.execute(sql, (
                run_id, row_number, snapshot,
                error_code, error_message[:500], severity,
                field_name,
                str(field_value)[:200] if field_value is not None else None,
            ))
        except Exception:
            logger.exception("Failed to log import error to DB (run_id=%d row=%d)", run_id, row_number)
