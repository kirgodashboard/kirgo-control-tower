"""
SKU resolution and reference data loading.

SKU resolution priority (Appendix A of IMPORT_ARCHITECTURE.md):
  1. Exact canonical SKU   → product_variants.sku
  2. Shiprocket channel SKU → product_variants.shiprocket_channel_sku
  3. WooCommerce product ID → product_variants.woocommerce_product_id
  4. Manual map lookup      → imports/config/sku_manual_map.csv
  5. Unresolved             → variant_id = NULL (logged as UNRESOLVED_SKU)
"""
from __future__ import annotations

import csv
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class VariantLookup:
    by_sku: dict[str, int] = field(default_factory=dict)
    by_channel_sku: dict[str, int] = field(default_factory=dict)
    by_wc_product_id: dict[int, int] = field(default_factory=dict)


@dataclass
class ReferenceData:
    existing_order_ids: set[int]
    customer_email_map: dict[str, int]   # LOWER(email) → customers.id
    variant_lookup: VariantLookup
    manual_sku_map: dict[str, str]       # raw_sku → canonical_sku


def load_reference_data(conn, manual_map_path: Path) -> ReferenceData:
    """
    Pre-load all reference data into memory.
    Called once per import run before processing rows.
    """
    existing_order_ids = _load_order_ids(conn)
    customer_email_map = _load_customer_emails(conn)
    variant_lookup = _load_variant_lookup(conn)
    manual_sku_map = _load_manual_sku_map(manual_map_path)

    logger.info(
        "reference_data_loaded orders=%d customers=%d variants=%d manual_skus=%d",
        len(existing_order_ids),
        len(customer_email_map),
        len(variant_lookup.by_sku),
        len(manual_sku_map),
    )
    return ReferenceData(
        existing_order_ids=existing_order_ids,
        customer_email_map=customer_email_map,
        variant_lookup=variant_lookup,
        manual_sku_map=manual_sku_map,
    )


def _load_order_ids(conn) -> set[int]:
    with conn.cursor() as cur:
        cur.execute("SELECT woocommerce_order_id FROM orders")
        return {row[0] for row in cur.fetchall()}


def _load_customer_emails(conn) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute("SELECT LOWER(email), id FROM customers WHERE email IS NOT NULL")
        return {row[0]: row[1] for row in cur.fetchall()}


def _load_variant_lookup(conn) -> VariantLookup:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, sku, shiprocket_channel_sku, woocommerce_product_id
            FROM product_variants
        """)
        rows = cur.fetchall()

    lookup = VariantLookup()
    for row in rows:
        vid, sku, sr_sku, wc_pid = row
        if sku:
            lookup.by_sku[sku] = vid
        if sr_sku:
            lookup.by_channel_sku[sr_sku] = vid
        if wc_pid:
            lookup.by_wc_product_id[int(wc_pid)] = vid

    return lookup


def _load_manual_sku_map(path: Path) -> dict[str, str]:
    """
    Load imports/config/sku_manual_map.csv.
    Expected columns: raw_sku, canonical_sku
    Returns empty dict if file is missing or has no rows.
    """
    if not path.exists():
        logger.warning("sku_manual_map not found at %s — no legacy SKU overrides loaded", path)
        return {}

    result: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get("raw_sku") or "").strip()
            canonical = (row.get("canonical_sku") or "").strip()
            if raw and canonical:
                result[raw] = canonical

    logger.info("manual_sku_map_loaded entries=%d path=%s", len(result), path)
    return result


# ── SKU resolution (4-step priority) ─────────────────────────────────────────

def resolve_variant(
    sku_raw: str | None,
    wc_product_id: int | None,
    lookup: VariantLookup,
    manual_map: dict[str, str],
) -> int | None:
    """
    Return product_variants.id or None.

    Step 1: product_variants.sku = sku_raw
    Step 2: product_variants.shiprocket_channel_sku = sku_raw
    Step 3: product_variants.woocommerce_product_id = wc_product_id
    Step 4: manual_map[sku_raw] → canonical_sku → Step 1
    """
    if sku_raw:
        # Step 1
        if sku_raw in lookup.by_sku:
            return lookup.by_sku[sku_raw]
        # Step 2
        if sku_raw in lookup.by_channel_sku:
            return lookup.by_channel_sku[sku_raw]

    # Step 3
    if wc_product_id and wc_product_id in lookup.by_wc_product_id:
        return lookup.by_wc_product_id[wc_product_id]

    # Step 4
    if sku_raw and sku_raw in manual_map:
        canonical = manual_map[sku_raw]
        if canonical in lookup.by_sku:
            return lookup.by_sku[canonical]

    return None
