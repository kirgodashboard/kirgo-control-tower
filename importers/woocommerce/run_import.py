"""
CLI entry point for the WooCommerce importer.

Usage:
    python -m importers.woocommerce.run_import \\
        --file imports/raw/2026-06-17/woocommerce/wc_orders_2026-06-17.csv \\
        --admin-email admin@example.com

Environment variables (must be in .env.local at project root):
    SUPABASE_DB_URL    — Postgres direct URL (port 5432, NOT 6543 pgbouncer)
    IMPORTER_LOG_LEVEL — optional, default INFO
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import click

from .config import Config
from .db import get_connection
from .importer import WooCommerceImporter, lookup_user_by_email


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
    )


@click.command()
@click.option(
    "--file", "source_file",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to the WooCommerce export CSV or XLSX",
)
@click.option(
    "--user-id",
    default=None,
    type=int,
    help="ID of the users row that triggered this import (takes priority over --admin-email)",
)
@click.option(
    "--admin-email",
    default=None,
    envvar="IMPORTER_ADMIN_EMAIL",
    help="Email of the admin user (used to look up users.id if --user-id not provided)",
)
@click.option(
    "--log-level",
    default="INFO",
    envvar="IMPORTER_LOG_LEVEL",
    show_default=True,
    help="Logging level: DEBUG | INFO | WARNING | ERROR",
)
def main(
    source_file: Path,
    user_id: int | None,
    admin_email: str | None,
    log_level: str,
) -> None:
    _setup_logging(log_level)
    logger = logging.getLogger(__name__)

    # Resolve triggered_by user ID
    with get_connection() as conn:
        if user_id is not None:
            triggered_by = user_id
            logger.info("triggered_by user_id=%d", triggered_by)
        elif admin_email:
            try:
                triggered_by = lookup_user_by_email(conn, admin_email)
                logger.info("triggered_by resolved email=%s user_id=%d", admin_email, triggered_by)
            except ValueError as exc:
                logger.error("%s", exc)
                sys.exit(1)
        else:
            logger.error(
                "Must supply either --user-id or --admin-email (or set IMPORTER_ADMIN_EMAIL)"
            )
            sys.exit(1)

        importer = WooCommerceImporter(source_file=source_file, triggered_by=triggered_by)
        try:
            run_id = importer.execute()
            logger.info("import_complete run_id=%d", run_id)
        except Exception as exc:
            logger.error("import_failed: %s", exc)
            sys.exit(1)


if __name__ == "__main__":
    main()
