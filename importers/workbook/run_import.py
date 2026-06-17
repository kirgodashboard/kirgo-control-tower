"""
Workbook importer CLI entry point.

Usage:
  python3 -m importers.workbook.run_import --preflight
  python3 -m importers.workbook.run_import --sheet wc_orders         --admin-email jiten65.b@gmail.com
  python3 -m importers.workbook.run_import --sheet sr_shipments      --admin-email jiten65.b@gmail.com
  python3 -m importers.workbook.run_import --sheet returns           --admin-email jiten65.b@gmail.com
  python3 -m importers.workbook.run_import --sheet bank_transactions --admin-email jiten65.b@gmail.com
  python3 -m importers.workbook.run_import --sheet all               --admin-email jiten65.b@gmail.com
  python3 -m importers.workbook.run_import --reconcile-only

Environment variables (or .env.local at project root):
  SUPABASE_DB_URL       — required: direct PostgreSQL URL (port 5432, not 6543)
  IMPORTER_ADMIN_EMAIL  — default admin email when --admin-email not supplied
  IMPORTER_LOG_LEVEL    — DEBUG | INFO | WARNING  (default: INFO)
  WORKBOOK_PATH         — path to Kirgo Numbers.xlsx (default: imports/raw/Kirgo Numbers.xlsx)
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import click

from .bank_transactions import BankTransactionsImporter
from .config import Config
from .db import get_connection, lookup_user_by_email
from .reconciliation import run_full_checks
from .returns import ReturnsImporter
from .sr_shipments import ShiprocketShipmentsImporter
from .wc_orders import WooCommerceOrdersImporter
from .workbook_loader import WorkbookLoadError, load_workbook, preflight_report

VALID_SHEETS = frozenset({"wc_orders", "sr_shipments", "returns", "bank_transactions", "all"})


@click.command()
@click.option(
    "--file",
    "workbook_path",
    default=None,
    type=click.Path(path_type=Path),
    envvar="WORKBOOK_PATH",
    help="Path to Kirgo Numbers.xlsx (default: imports/raw/Kirgo Numbers.xlsx)",
)
@click.option(
    "--sheet",
    default=None,
    type=click.Choice(["wc_orders", "sr_shipments", "returns", "bank_transactions", "all"],
                      case_sensitive=False),
    help="Which importer to run. Use 'all' to run all in sequence.",
)
@click.option(
    "--preflight",
    is_flag=True,
    default=False,
    help="Run pre-flight checks only — no DB writes.",
)
@click.option(
    "--reconcile-only",
    "reconcile_only",
    is_flag=True,
    default=False,
    help="Run full reconciliation only — no imports.",
)
@click.option(
    "--admin-email",
    default=None,
    envvar="IMPORTER_ADMIN_EMAIL",
    help="Email of the admin user in the users table.",
)
@click.option(
    "--user-id",
    "user_id",
    default=None,
    type=int,
    help="ID of the admin user in the users table (overrides --admin-email).",
)
@click.option(
    "--log-level",
    default=None,
    envvar="IMPORTER_LOG_LEVEL",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
    help="Logging verbosity (default: INFO).",
)
def main(
    workbook_path: Path | None,
    sheet: str | None,
    preflight: bool,
    reconcile_only: bool,
    admin_email: str | None,
    user_id: int | None,
    log_level: str | None,
) -> None:
    """Kirgo Workbook Importer — historical data load from Kirgo Numbers.xlsx."""

    # ── Logging ───────────────────────────────────────────────────────────────
    level = (log_level or Config.LOG_LEVEL or "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    logger = logging.getLogger("importers.workbook.run_import")

    # ── Resolve workbook path ─────────────────────────────────────────────────
    wb_path = workbook_path or Config.WORKBOOK_PATH
    if not isinstance(wb_path, Path):
        wb_path = Path(wb_path)

    # ── Preflight mode ────────────────────────────────────────────────────────
    if preflight:
        click.echo(f"\n{'─'*60}")
        click.echo(f"  PREFLIGHT  {wb_path}")
        click.echo(f"{'─'*60}")

        results = preflight_report(wb_path)
        all_passed = True
        for status, name, detail in results:
            icon = "✓" if status == "PASS" else ("⚠" if status == "WARN" else "✗")
            click.echo(f"  [{icon}] {status:4s}  {name:<35s}  {detail}")
            if status == "FAIL":
                all_passed = False

        click.echo(f"{'─'*60}")
        if all_passed:
            click.echo("  Preflight passed. Ready to import.\n")
            sys.exit(0)
        else:
            click.echo("  Preflight FAILED. Fix issues before importing.\n", err=True)
            sys.exit(1)

    # ── Reconcile-only mode ───────────────────────────────────────────────────
    if reconcile_only:
        click.echo("\n  Running full reconciliation (no imports)...")
        try:
            with get_connection() as conn:
                result = run_full_checks(conn)
        except Exception as exc:
            click.echo(f"  ERROR: {exc}", err=True)
            sys.exit(1)

        click.echo(f"\n  Reconciliation status: {result.status.upper()}")
        click.echo(f"{'─'*60}")
        for check in result.checks:
            icon = "✓" if check.passed else "✗"
            click.echo(f"  [{icon}] {check.check_id:12s} [{check.severity:8s}]  {check.detail}")
        click.echo(f"{'─'*60}\n")
        sys.exit(0 if result.status in ("passed", "flagged") else 1)

    # ── Import mode ───────────────────────────────────────────────────────────
    if not sheet:
        click.echo("Error: --sheet is required when not using --preflight or --reconcile-only.", err=True)
        click.echo("       Use --sheet wc_orders | sr_shipments | returns | bank_transactions | all", err=True)
        sys.exit(1)

    # ── Resolve triggered_by user ─────────────────────────────────────────────
    triggered_by = _resolve_user(user_id, admin_email or Config.ADMIN_EMAIL, logger)
    if triggered_by is None:
        sys.exit(1)

    # ── Load workbook ─────────────────────────────────────────────────────────
    click.echo(f"\n  Loading workbook: {wb_path}")
    try:
        wb_data = load_workbook(wb_path)
    except WorkbookLoadError as exc:
        click.echo(f"  ERROR: {exc}", err=True)
        sys.exit(1)
    click.echo(f"  Workbook loaded: {len(wb_data.sheets)} sheets\n")

    # ── Run importers ─────────────────────────────────────────────────────────
    sheets_to_run = (
        ["wc_orders", "sr_shipments", "returns", "bank_transactions"]
        if sheet == "all"
        else [sheet.lower()]
    )

    exit_code = 0

    for sheet_name in sheets_to_run:
        click.echo(f"{'─'*60}")
        click.echo(f"  Running: {sheet_name}")
        click.echo(f"{'─'*60}")

        try:
            run_id = _run_importer(sheet_name, wb_data, triggered_by, logger)
            click.echo(f"  Completed run_id={run_id}\n")
        except Exception as exc:
            click.echo(f"  FAILED: {exc}\n", err=True)
            logger.exception("Importer failed: sheet=%s", sheet_name)
            exit_code = 1
            if sheet_name in ("wc_orders",):
                # WC orders must complete before SR shipments can run
                click.echo(
                    "  Aborting: wc_orders must complete successfully before proceeding.",
                    err=True,
                )
                break

    sys.exit(exit_code)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_user(
    user_id: int | None,
    admin_email: str | None,
    logger: logging.Logger,
) -> int | None:
    if user_id:
        return user_id

    if not admin_email:
        click.echo(
            "Error: --admin-email or IMPORTER_ADMIN_EMAIL is required "
            "to record who triggered the import.",
            err=True,
        )
        return None

    try:
        with get_connection() as conn:
            uid = lookup_user_by_email(conn, admin_email)
        logger.info("admin_user_resolved email=%s id=%d", admin_email, uid)
        return uid
    except ValueError as exc:
        click.echo(f"  ERROR: {exc}", err=True)
        return None
    except Exception as exc:
        click.echo(f"  ERROR resolving admin user: {exc}", err=True)
        return None


def _run_importer(
    sheet_name: str,
    wb_data,
    triggered_by: int,
    logger: logging.Logger,
) -> int:
    """Instantiate and run the correct importer. Returns run_id."""
    if sheet_name == "wc_orders":
        importer = WooCommerceOrdersImporter(wb_data, triggered_by)
    elif sheet_name == "sr_shipments":
        importer = ShiprocketShipmentsImporter(wb_data, triggered_by)
    elif sheet_name == "returns":
        importer = ReturnsImporter(wb_data, triggered_by)
    elif sheet_name == "bank_transactions":
        importer = BankTransactionsImporter(wb_data, triggered_by)
    else:
        raise ValueError(f"Unknown sheet: {sheet_name!r}")

    return importer.execute()


if __name__ == "__main__":
    main()
