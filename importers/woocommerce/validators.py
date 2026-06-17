"""
Validation engine — V-WC-01 through V-WC-13.

Each function returns (value, error_dict | None).
error_dict has keys: code, message, severity, field, value
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .constants import (
    DEVICE_MAP,
    KNOWN_STATUSES,
    PAYMENT_METHOD_MAP,
    STATUS_NORMALISE,
)
from .parser import (
    LineItem,
    clean_lower,
    clean_str,
    normalise_phone,
    parse_decimal,
    parse_int,
    parse_ist_to_utc,
)

_EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")
_POSTCODE_RE = re.compile(r"^[1-9][0-9]{5}$")


def _err(code: str, msg: str, severity: str, field: str | None = None, value: Any = None) -> dict:
    return {
        "error_code":    code,
        "error_message": msg,
        "severity":      severity,
        "field_name":    field,
        "field_value":   str(value) if value is not None else None,
    }


# ── Hard validations (row is rejected on failure) ────────────────────────────

def validate_order_id(raw: dict) -> tuple[int | None, dict | None]:
    """V-WC-01: woocommerce_order_id NOT NULL and > 0."""
    val = parse_int(raw.get("order id"))
    if val is None or val <= 0:
        return None, _err(
            "FIELD_REJECTED",
            "Order ID is missing or non-positive — row rejected",
            "error", "Order ID", raw.get("order id"),
        )
    return val, None


def validate_order_total(raw: dict) -> tuple[float | None, dict | None]:
    """V-WC-02: order_total_inr NOT NULL and >= 0."""
    val = parse_decimal(raw.get("order total"))
    if val is None or val < 0:
        return None, _err(
            "FIELD_REJECTED",
            "Order Total is missing or negative — row rejected",
            "error", "Order Total", raw.get("order total"),
        )
    return val, None


def validate_ordered_at(raw: dict) -> tuple[datetime | None, dict | None]:
    """V-WC-03: ordered_at is a valid IST datetime and not in the future."""
    val = parse_ist_to_utc(raw.get("date created"))
    if val is None:
        return None, _err(
            "FIELD_REJECTED",
            "Date Created is missing or unparseable — row rejected",
            "error", "Date Created", raw.get("date created"),
        )
    now_utc = datetime.now(tz=timezone.utc)
    if val > now_utc:
        return None, _err(
            "FIELD_REJECTED",
            f"Date Created {val.isoformat()} is in the future — row rejected",
            "error", "Date Created", raw.get("date created"),
        )
    return val, None


def validate_line_items_present(line_items: list[LineItem]) -> dict | None:
    """V-WC-07: At least one non-blank line item with quantity > 0."""
    valid = [i for i in line_items if i.quantity and i.quantity > 0]
    if not valid:
        return _err(
            "FIELD_REJECTED",
            "Order has no valid line items (all slots are blank or have zero quantity)",
            "error",
        )
    return None


# ── Soft validations (field nullified / flagged, row still imports) ──────────

def validate_status(raw: dict) -> tuple[str, list[dict]]:
    """V-WC-04: Normalise status; warn on unrecognised value."""
    warnings: list[dict] = []
    raw_val = clean_lower(raw.get("status")) or ""
    status = STATUS_NORMALISE.get(raw_val, raw_val)
    if status not in KNOWN_STATUSES:
        warnings.append(_err(
            "DQ_WARN",
            f"Unrecognised order status '{raw_val}'; stored as-is",
            "warning", "Status", raw_val,
        ))
    return status, warnings


def validate_email(raw: dict) -> tuple[str | None, list[dict]]:
    """V-WC-05: Email must be non-blank and match basic pattern."""
    warnings: list[dict] = []
    email = clean_lower(raw.get("billing email"))
    if not email or not _EMAIL_RE.match(email):
        warnings.append(_err(
            "PII_ERROR",
            "Missing or invalid Billing Email — order imported without customer link",
            "warning", "Billing Email", raw.get("billing email"),
        ))
        return None, warnings
    return email, warnings


def validate_phone(raw: dict) -> tuple[str | None, list[dict]]:
    """V-WC-09: Phone normalised to 10 digits starting with 6-9."""
    warnings: list[dict] = []
    raw_phone = clean_str(raw.get("billing phone"))
    phone = normalise_phone(raw_phone)
    if raw_phone and phone is None:
        warnings.append(_err(
            "DQ_WARN",
            f"Invalid phone '{raw_phone}' after normalisation — field nullified",
            "warning", "Billing Phone", raw_phone,
        ))
    return phone, warnings


def validate_postcode(raw: dict) -> tuple[str | None, list[dict]]:
    """V-WC-08: billing_pincode matches ^[1-9][0-9]{5}$ if present."""
    warnings: list[dict] = []
    raw_pc = clean_str(raw.get("billing postcode"))
    if raw_pc is None:
        return None, warnings
    if _POSTCODE_RE.match(raw_pc):
        return raw_pc, warnings
    warnings.append(_err(
        "DQ_WARN",
        f"Invalid postcode '{raw_pc}' — field nullified",
        "warning", "Billing Postcode", raw_pc,
    ))
    return None, warnings


def validate_paid_at(raw: dict, ordered_at: datetime) -> tuple[datetime | None, list[dict]]:
    """V-WC-11: paid_at must be parseable and >= ordered_at."""
    warnings: list[dict] = []
    raw_val = raw.get("date paid")
    if not clean_str(raw_val):
        return None, warnings
    paid = parse_ist_to_utc(raw_val)
    if paid is None:
        warnings.append(_err(
            "DQ_WARN",
            f"Date Paid '{raw_val}' is unparseable — nullified",
            "warning", "Date Paid", raw_val,
        ))
        return None, warnings
    if paid < ordered_at:
        warnings.append(_err(
            "DQ_WARN",
            "Date Paid is before Date Created — nullified",
            "warning", "Date Paid", raw_val,
        ))
        return None, warnings
    return paid, warnings


def validate_payment_method(raw: dict) -> tuple[str | None, list[dict]]:
    """V-WC-13: Normalise payment method; warn if unrecognised."""
    warnings: list[dict] = []
    raw_val = clean_lower(raw.get("payment method")) or ""
    method = PAYMENT_METHOD_MAP.get(raw_val)
    if raw_val and method is None:
        warnings.append(_err(
            "DQ_WARN",
            f"Unrecognised payment method '{raw_val}' — stored as NULL",
            "warning", "Payment Method", raw.get("payment method"),
        ))
    return method, warnings


def validate_line_item(item: LineItem) -> dict | None:
    """V-WC-10: Line item with name/sku must have quantity > 0."""
    if (item.name or item.sku) and (item.quantity is None or item.quantity <= 0):
        return _err(
            "DQ_WARN",
            f"Item {item.slot} has name/SKU but zero or missing quantity — item skipped",
            "warning", f"Item {item.slot} Quantity", item.quantity,
        )
    return None


def validate_order_total_vs_lines(
    order_total: float,
    line_items: list[LineItem],
    shipping: float,
    discount: float,
) -> dict | None:
    """V-WC-06: order_total ≈ Σ(line_total) + shipping − discount (±₹1)."""
    computed_line_sum = sum(
        (i.line_total if i.line_total is not None else (i.unit_price or 0.0) * (i.quantity or 0))
        for i in line_items
        if i.quantity and i.quantity > 0
    )
    computed_total = computed_line_sum + shipping - discount
    variance = abs(order_total - computed_total)
    if variance > 1.00:
        return _err(
            "RECONCILE_WARN",
            f"Order total ₹{order_total:.2f} ≠ computed ₹{computed_total:.2f} "
            f"(variance ₹{variance:.2f})",
            "warning", "Order Total", order_total,
        )
    return None


def normalise_device(raw: dict) -> str | None:
    raw_val = clean_lower(raw.get("device"))
    if not raw_val:
        return None
    return DEVICE_MAP.get(raw_val)


def resolve_status(raw_status: str) -> str:
    """Return the canonical status string."""
    s = (raw_status or "").lower().strip()
    return STATUS_NORMALISE.get(s, s)
