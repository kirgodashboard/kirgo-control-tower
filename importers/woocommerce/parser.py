"""
CSV parsing, header normalisation, IST→UTC conversion, line-item unpivoting.

Input:  Path to WooCommerce CSV or XLSX export (up to 93 columns)
Output: list of dicts keyed by normalised (lowercase-stripped) column names
        + list[LineItem] per row (unpivoted from Item 1..4 column groups)
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from dateutil import parser as dateutil_parser

from .constants import (
    IST_OFFSET_HOURS,
    IST_OFFSET_MINUTES,
    LINE_ITEM_FIELDS,
    LINE_ITEM_SLOTS,
    REQUIRED_COLUMNS,
)

logger = logging.getLogger(__name__)

_IST_DELTA = timedelta(hours=IST_OFFSET_HOURS, minutes=IST_OFFSET_MINUTES)


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class LineItem:
    slot: int                        # 1..4
    name: str | None
    sku: str | None
    quantity: int | None
    unit_price: float | None
    line_total: float | None
    wc_product_id: int | None


@dataclass
class ParsedRow:
    row_number: int                  # 1-indexed from CSV (2 = first data row)
    raw: dict[str, Any]              # normalised key → raw string value
    line_items: list[LineItem] = field(default_factory=list)


class ParseError(Exception):
    """Raised when the file cannot be parsed at all (fatal)."""


# ── Public entry point ────────────────────────────────────────────────────────

def parse_csv(source_file: Path) -> list[ParsedRow]:
    """
    Read the WooCommerce export file and return one ParsedRow per data row.
    Raises ParseError on fatal issues (unreadable file, missing required columns).
    """
    if not source_file.exists():
        raise ParseError(f"File not found: {source_file}")

    suffix = source_file.suffix.lower()
    try:
        if suffix == ".xlsx":
            df = pd.read_excel(
                source_file,
                sheet_name=0,
                dtype=str,
                keep_default_na=False,
            )
        elif suffix == ".csv":
            df = pd.read_csv(
                source_file,
                dtype=str,
                keep_default_na=False,
                encoding="utf-8-sig",   # handles BOM from Excel CSV exports
            )
        else:
            raise ParseError(f"Unsupported file type '{suffix}'. Expected .csv or .xlsx")
    except ParseError:
        raise
    except Exception as exc:
        raise ParseError(f"Cannot read file: {exc}") from exc

    if df.empty:
        raise ParseError("File contains no data rows")

    # Normalise column names: lowercase + strip
    col_map = {c: c.lower().strip() for c in df.columns}
    df = df.rename(columns=col_map)

    # Check required columns
    actual = set(df.columns)
    missing = REQUIRED_COLUMNS - actual
    if missing:
        raise ParseError(
            f"Missing required columns: {sorted(missing)}\n"
            f"Found columns: {sorted(actual)}"
        )

    logger.info("csv_read rows=%d columns=%d file=%s", len(df), len(df.columns), source_file.name)

    rows: list[ParsedRow] = []
    for idx, series in df.iterrows():
        raw = series.to_dict()
        parsed = ParsedRow(
            row_number=int(idx) + 2,   # +1 for header, +1 for 1-indexing
            raw=raw,
            line_items=_unpivot_line_items(raw, int(idx) + 2),
        )
        rows.append(parsed)

    return rows


# ── IST → UTC conversion ──────────────────────────────────────────────────────

def parse_ist_to_utc(value: str | None) -> datetime | None:
    """
    Parse a WooCommerce datetime string (IST, no timezone marker) and return UTC.
    WooCommerce exports as 'YYYY-MM-DD HH:MM:SS' in IST.
    Returns None if value is blank or unparseable.
    """
    if not value or not str(value).strip():
        return None
    raw = str(value).strip()
    try:
        naive = dateutil_parser.parse(raw, dayfirst=False)
        utc = (naive - _IST_DELTA).replace(tzinfo=timezone.utc)
        return utc
    except Exception:
        return None


# ── Numeric helpers ───────────────────────────────────────────────────────────

def parse_decimal(value: str | None) -> float | None:
    """Return float or None. Strips commas and whitespace."""
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).strip().replace(",", ""))
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    """Return int or None."""
    f = parse_decimal(value)
    if f is None:
        return None
    try:
        return int(f)
    except (ValueError, OverflowError):
        return None


# ── Line-item unpivoting ──────────────────────────────────────────────────────

def _unpivot_line_items(raw: dict[str, Any], row_number: int) -> list[LineItem]:
    """
    Convert the wide Item 1..4 column groups into a list of LineItem objects.
    A slot is skipped entirely if both Name and SKU are blank.
    """
    items: list[LineItem] = []
    for n in LINE_ITEM_SLOTS:
        col = lambda f: LINE_ITEM_FIELDS[f].replace("{n}", str(n))  # noqa: E731

        name_raw = raw.get(col("name"), "")
        sku_raw  = raw.get(col("sku"),  "")
        name = str(name_raw).strip() if name_raw else ""
        sku  = str(sku_raw).strip()  if sku_raw  else ""

        if not name and not sku:
            continue   # group N not present; no more slots after first gap

        qty        = parse_int(raw.get(col("quantity")))
        unit_price = parse_decimal(raw.get(col("price")))
        line_total = parse_decimal(raw.get(col("total")))
        product_id = parse_int(raw.get(col("product_id")))

        items.append(LineItem(
            slot=n,
            name=name or None,
            sku=sku or None,
            quantity=qty,
            unit_price=unit_price if unit_price is not None else 0.0,
            line_total=line_total,
            wc_product_id=product_id,
        ))

    return items


# ── String helpers ────────────────────────────────────────────────────────────

def clean_str(value: str | None) -> str | None:
    """Strip whitespace; return None if blank."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def clean_lower(value: str | None) -> str | None:
    s = clean_str(value)
    return s.lower() if s else None


# ── Phone normalisation ───────────────────────────────────────────────────────

_PHONE_RE = re.compile(r"^[6-9][0-9]{9}$")


def normalise_phone(raw: str | None) -> str | None:
    """
    Normalise Indian mobile number to 10 digits (no country code, no leading 0).
    Returns None if blank or invalid after normalisation.
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if _PHONE_RE.match(digits) else None
