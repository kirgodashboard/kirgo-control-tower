"""
Column name constants, normalisation lookup tables, and validation sets.
All values are lowercase-compared at runtime.
"""
from __future__ import annotations

# ── Required CSV columns (case-insensitive match at header validation) ────────

REQUIRED_COLUMNS: frozenset[str] = frozenset({
    "order id",
    "order number",
    "date created",
    "status",
    "payment method",
    "payment method title",
    "cart subtotal",
    "cart discount amount",
    "order shipping",
    "order total",
    "billing first name",
    "billing last name",
    "billing email",
    "billing phone",
    "billing city",
    "billing state",
    "billing postcode",
    "item 1 name",
    "item 1 sku",
    "item 1 quantity",
    "item 1 price",
    "item 1 total",
})

# ── Line item column templates (N = 1..4) ─────────────────────────────────────

LINE_ITEM_SLOTS = range(1, 5)

LINE_ITEM_FIELDS = {
    "name":       "item {n} name",
    "sku":        "item {n} sku",
    "quantity":   "item {n} quantity",
    "price":      "item {n} price",
    "total":      "item {n} total",
    "product_id": "item {n} product id",   # optional
}

# ── Payment method normalisation ──────────────────────────────────────────────

PAYMENT_METHOD_MAP: dict[str, str] = {
    "gokwik (prepaid)":  "gokwik_prepaid",
    "gokwik_prepaid":    "gokwik_prepaid",
    "gokwik-prepaid":    "gokwik_prepaid",
    "gokwik prepaid":    "gokwik_prepaid",
    "gokwik (cod)":      "gokwik_cod",
    "gokwik_cod":        "gokwik_cod",
    "gokwik-cod":        "gokwik_cod",
    "gokwik cod":        "gokwik_cod",
    "easebuzz":          "easebuzz",
    "ease buzz":         "easebuzz",
    "infibeam":          "infibeam",
    "ccavenue":          "infibeam",
    "cc avenue":         "infibeam",
    "cash on delivery":  "cod",
    "cod":               "cod",
    "cash_on_delivery":  "cod",
}

# ── Order status normalisation ────────────────────────────────────────────────

KNOWN_STATUSES: frozenset[str] = frozenset({
    "processing", "completed", "cancelled", "refunded",
    "on-hold", "on_hold", "pending", "failed",
})

STATUS_NORMALISE: dict[str, str] = {
    "on_hold":          "on-hold",
    "pending payment":  "pending",
    "pending-payment":  "pending",
}

# ── Device normalisation ──────────────────────────────────────────────────────

DEVICE_MAP: dict[str, str] = {
    "mobile":      "mobile",
    "phone":       "mobile",
    "smartphone":  "mobile",
    "desktop":     "desktop",
    "computer":    "desktop",
    "laptop":      "desktop",
    "tablet":      "tablet",
    "ipad":        "tablet",
}

# ── IST offset from UTC ───────────────────────────────────────────────────────

IST_OFFSET_HOURS = 5
IST_OFFSET_MINUTES = 30
