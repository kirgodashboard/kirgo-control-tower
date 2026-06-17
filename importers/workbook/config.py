"""
Configuration for the workbook importer.
Extends the shared woocommerce Config with workbook-specific paths and settings.
"""
from __future__ import annotations

import os
from pathlib import Path

from importers.woocommerce.config import Config as _BaseConfig  # noqa: F401 (re-exported)


class Config(_BaseConfig):
    # Default path to the source workbook (relative to project root)
    WORKBOOK_PATH: Path = Path(
        os.getenv("WORKBOOK_PATH", "imports/raw/Kirgo Numbers.xlsx")
    )
