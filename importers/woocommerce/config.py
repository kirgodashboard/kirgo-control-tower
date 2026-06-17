"""
Configuration — reads from .env.local (project root) then OS environment.

Required env vars:
  SUPABASE_DB_URL   Direct PostgreSQL URL (NOT the pooled URL).
                    Settings → Database → Connection string → URI (port 5432).
                    Format: postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres

Optional env vars:
  IMPORTER_ADMIN_EMAIL   Email of the user in the users table who triggered imports
                         when --user-id is not supplied via CLI.
  IMPORTER_LOG_LEVEL     DEBUG | INFO | WARNING  (default: INFO)
  IMPORTS_ROOT           Base directory for raw/processed/archive/errors (default: imports)
  SKU_MANUAL_MAP_PATH    Path to sku_manual_map.csv (default: imports/config/sku_manual_map.csv)
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the project root (two levels above this file)
_project_root = Path(__file__).parent.parent.parent
load_dotenv(_project_root / ".env.local", override=False)
load_dotenv(_project_root / ".env", override=False)


class Config:
    # ── Database ─────────────────────────────────────────────────────────────
    @staticmethod
    def db_url() -> str:
        url = os.environ.get("SUPABASE_DB_URL", "")
        if not url:
            raise EnvironmentError(
                "SUPABASE_DB_URL is not set.\n"
                "Get it from: Supabase Dashboard → Settings → Database → "
                "Connection string (use the direct URI on port 5432, not the pooled one)."
            )
        return url

    # ── Identity ─────────────────────────────────────────────────────────────
    ADMIN_EMAIL: str = os.getenv("IMPORTER_ADMIN_EMAIL", "")

    # ── Logging ──────────────────────────────────────────────────────────────
    LOG_LEVEL: str = os.getenv("IMPORTER_LOG_LEVEL", "INFO").upper()

    # ── File paths ───────────────────────────────────────────────────────────
    IMPORTS_ROOT: Path = Path(os.getenv("IMPORTS_ROOT", "imports"))
    SKU_MANUAL_MAP_PATH: Path = Path(
        os.getenv("SKU_MANUAL_MAP_PATH", "imports/config/sku_manual_map.csv")
    )

    # ── Derived path helpers ─────────────────────────────────────────────────
    @classmethod
    def raw_dir(cls, date_str: str) -> Path:
        return cls.IMPORTS_ROOT / "raw" / date_str / "woocommerce"

    @classmethod
    def processed_dir(cls, date_str: str) -> Path:
        return cls.IMPORTS_ROOT / "processed" / date_str / "woocommerce"

    @classmethod
    def archive_dir(cls, year: str) -> Path:
        return cls.IMPORTS_ROOT / "archive" / "woocommerce" / year

    @classmethod
    def errors_dir(cls, date_str: str) -> Path:
        return cls.IMPORTS_ROOT / "errors" / date_str / "woocommerce"
