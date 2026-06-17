"""
Workbook-specific database helpers.

Re-exports everything from importers.woocommerce.db and adds a flexible
open_import_run() that accepts source and source_sheet as parameters (the
woocommerce version hard-codes both).
"""
from __future__ import annotations

# Re-export shared helpers unchanged
from importers.woocommerce.db import (  # noqa: F401
    close_import_run,
    dict_cursor,
    fail_import_run,
    get_connection,
    log_import_error,
    update_rows_in_source,
)


def open_import_run(
    conn,
    source: str,
    source_file: str,
    source_sheet: str,
    triggered_by: int,
) -> int:
    """
    Insert an import_runs row for any source type.
    Returns the new run_id.

    source values: 'woocommerce' | 'shiprocket' | 'returns' | 'bank_statement'
    """
    sql = """
        INSERT INTO import_runs (
            source, source_file, source_sheet,
            status, triggered_by, run_started_at
        ) VALUES (%s, %s, %s, 'running', %s, NOW())
        RETURNING id
    """
    with conn.cursor() as cur:
        cur.execute(sql, (source, source_file, source_sheet, triggered_by))
        row = cur.fetchone()
    return row[0]


def lookup_user_by_email(conn, email: str) -> int:
    """Return users.id for the given email. Raises ValueError if not found."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        row = cur.fetchone()
    if not row:
        raise ValueError(
            f"No user found with email '{email}' in the users table. "
            "Ensure the admin user exists in Supabase Auth and is in the users table."
        )
    return row[0]
