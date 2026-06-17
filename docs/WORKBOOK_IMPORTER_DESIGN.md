# Workbook Importer Design

**Version:** 1.0  
**Scope:** Historical data load from `imports/raw/Kirgo Numbers.xlsx`  
**Replaces:** CSV importer for historical load (see §1)  
**Reuses:** `import_runs`, `import_errors`, reconciliation framework, db.py, resolver.py  

---

## 1. Relationship to CSV Importer

The existing `importers/woocommerce/` directory handles WooCommerce CSV exports with title-case column headers (`Order ID`, `Date Created`, etc.). The workbook's `Woocom - Orders` sheet uses snake_case headers (`order_id`, `order_date`) — a different export format.

| Concern | CSV importer | Workbook importer |
|---|---|---|
| Source | WooCommerce admin CSV export | `Kirgo Numbers.xlsx` (single file) |
| WC columns | `Order ID`, `Date Created`, `Item 1 Name` | `order_id`, `order_date`, `Product Item 1 Name` |
| Data scope | WC orders only | WC orders + SR shipments + Returns |
| Historical use | **Retired for historical load** | **Primary historical load tool** |
| Future use | For live incremental WC exports (verify column format first) | Not applicable — workbook is a point-in-time snapshot |

The CSV importer code is kept unchanged. It can be adapted for live sync once the WC export column format is confirmed.

---

## 2. Folder Structure

```
importers/
  requirements.txt                ← existing (shared)
  workbook/
    __init__.py
    config.py                     ← extends importers/woocommerce/config.py
    workbook_loader.py            ← opens workbook, caches sheets as DataFrames
    wc_orders.py                  ← WcoomerceOrdersImporter
    sr_shipments.py               ← ShiprocketShipmentsImporter
    returns.py                    ← ReturnsImporter
    reconciliation.py             ← workbook-specific checks + full-run checks
    run_import.py                 ← CLI entry point
  woocommerce/                    ← existing, retained
    ...
```

Shared modules used directly from `importers.woocommerce`:
- `db.py` — `get_connection`, `open_import_run`, `close_import_run`, `fail_import_run`, `log_import_error`, `update_rows_in_source`
- `resolver.py` — `load_reference_data`, `resolve_variant`, `ReferenceData`, `VariantLookup`
- `parser.py` — `parse_ist_to_utc`, `parse_decimal`, `parse_int`, `clean_str`, `clean_lower`, `normalise_phone`

---

## 3. Module Design

### 3.1 `workbook_loader.py`

```python
@dataclass
class WorkbookData:
    path: Path
    sheets: dict[str, pd.DataFrame]   # sheet_name → DataFrame (all str, no NaN)

def load_workbook(path: Path) -> WorkbookData:
    """
    Open the workbook once. Read all 9 import-target sheets into DataFrames.
    Skip Credentials sheet entirely — log advisory, do not read contents.
    Normalise all headers: strip whitespace, preserve original case.
    Returns WorkbookData with all sheets pre-loaded.
    Raises WorkbookLoadError on missing sheet or unreadable file.
    """

IMPORT_SHEETS = [
    'Woocom - Orders',
    'SR - 2023', 'SR - 2024', 'SR - 2025', 'SR - 2026',
    'Returns - 2023', 'Returns - 2024', 'Returns - 2025', 'Returns 2025 - 2026 ',
]

EXCLUDED_SHEETS = ['Credentials']   # never read
```

**Key behaviour:** All sheets are read with `dtype=str, keep_default_na=False` so every value is a string. `None` comparisons are replaced by empty-string checks. This avoids `NaN` propagation into the database.

### 3.2 `wc_orders.py` — `WooCommerceOrdersImporter`

Inherits the same 8-phase structure as the existing CSV importer. Key differences:

```python
# Column name constants specific to workbook format
WC_COL_ORDER_ID     = 'order_id'
WC_COL_ORDER_DATE   = 'order_date'
WC_COL_PAID_DATE    = 'paid_date'
WC_COL_STATUS       = 'status'
WC_COL_ORDER_TOTAL  = 'order_total'
WC_COL_SUBTOTAL     = 'order_subtotal'
WC_COL_DISCOUNT     = 'discount_total'
WC_COL_SHIPPING     = 'shipping_total'
WC_COL_PAYMENT      = 'payment_method'
WC_COL_EMAIL        = 'billing_email'
WC_COL_PHONE        = 'billing_phone'
WC_COL_FIRST_NAME   = 'billing_first_name'
WC_COL_LAST_NAME    = 'billing_last_name'
WC_COL_CITY         = 'billing_city'
WC_COL_STATE        = 'billing_state'
WC_COL_POSTCODE     = 'billing_postcode'
WC_COL_UTM_SOURCE   = 'meta:_wc_order_attribution_utm_source'
WC_COL_SOURCE_TYPE  = 'meta:_wc_order_attribution_source_type'
WC_COL_DEVICE       = 'meta:_wc_order_attribution_device_type'

LINE_ITEM_SLOTS     = range(1, 5)
def _li_col(n, field):
    # field: 'Name' | 'id' | 'SKU' | 'Quantity' | 'Total' | 'Subtotal'
    return f'Product Item {n} {field}'

PAYMENT_METHOD_MAP = {
    'ccavenue':       'prepaid',
    'cod':            'cod',
    'gokwik_prepaid': 'prepaid',
    'razorpay':       'prepaid',
    'cheque':         'prepaid',
    'bacs':           'prepaid',
}
```

**Unit price derivation:** The workbook has no `unit_price` column. Compute:
```python
unit_price = line_total / quantity  if quantity > 0 else None
```

**Phase 5 (customer aggregates):**  
Same as CSV importer: batch UPDATE `total_orders` and `first_order_at`.  
`total_revenue_inr` left at 0 — populated after Phase 2 (SR shipments import).

### 3.3 `sr_shipments.py` — `ShiprocketShipmentsImporter`

Processes 4 sheets sequentially as a single import run.

```python
SR_SHEETS = ['SR - 2023', 'SR - 2024', 'SR - 2025', 'SR - 2026']

# Status normalisation map
SR_STATUS_MAP = {
    'DELIVERED':        'DELIVERED',
    'CANCELED':         'CANCELED',
    'RTO_DELIVERED':    'RTO_DELIVERED',
    'RTO DELIVERED':    'RTO_DELIVERED',    # 2025-2026 spacing variant
    'RTO_ACKNOWLEDGED': 'RTO_ACKNOWLEDGED',
    'NEW_ORDER':        'NEW_ORDER',
    'LOST':             'LOST',
}

# Zone normalisation (already lowercase in source)
VALID_ZONES = {'z_a', 'z_b', 'z_c', 'z_d', 'z_e'}

GO_ARTEFACT_RE = re.compile(r'^%!f\(string=(.*)\)$')

def parse_decimal_clean(value: str) -> float | None:
    """Handle Go format artefact %!f(string=N.) in freight/COD columns."""
    if not value or not value.strip():
        return None
    m = GO_ARTEFACT_RE.match(value.strip())
    if m:
        value = m.group(1)
    return parse_decimal(value)
```

**NDR attempt count:**
```python
NDR_DATE_COLS = ['NDR 1 Attempt Date', 'NDR 2 Attempt Date', 'NDR 3 Attempt Date']

def count_ndr_attempts(raw: dict) -> int:
    return sum(1 for col in NDR_DATE_COLS
               if raw.get(col, '').strip() and raw.get(col, '').strip() != 'N/A')
```

**Order ID → orders join:**
```python
def resolve_order_id(sr_order_id_raw: str, order_id_map: dict[int, int]) -> int | None:
    # Strip -C suffix from cancellation IDs like '1320-C'
    clean = sr_order_id_raw.split('-')[0].strip()
    try:
        wc_id = int(float(clean))
        return order_id_map.get(wc_id)
    except (ValueError, TypeError):
        return None
```

`order_id_map` is `{woocommerce_order_id: orders.id}` pre-loaded at run start.

**Idempotency check:**
```python
def shipment_exists(conn, shiprocket_order_id: int, master_sku: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM shipments WHERE shiprocket_order_id = %s AND master_sku = %s",
            (shiprocket_order_id, master_sku)
        )
        return cur.fetchone() is not None
```

If `Forward ID` is blank, fall back to `(channel_order_id, awb_code, master_sku)` triple.

**Post-SR customer aggregate update:**
After Phase 2, compute `customers.total_revenue_inr`:
```python
UPDATE customers SET
    total_revenue_inr = (
        SELECT COALESCE(SUM(ol.line_total_inr), 0)
        FROM orders o
        JOIN shipments s  ON s.order_id = o.id
        JOIN order_lines ol ON ol.order_id = o.id
        WHERE o.customer_id = customers.id
          AND s.status = 'DELIVERED'
          AND s.delivered_at IS NOT NULL
    )
WHERE id = ANY(%s)
```

### 3.4 `returns.py` — `ReturnsImporter`

Processes 4 Returns sheets sequentially.

```python
RETURNS_SHEETS = [
    'Returns - 2023',
    'Returns - 2024',
    'Returns - 2025',
    'Returns 2025 - 2026 ',
]

RETURN_STATUS_MAP = {
    'RETURN ACKNOWLEDGED':    'RETURN ACKNOWLEDGED',
    'RETURN DELIVERED':       'RETURN DELIVERED',
    'RETURN CANCELLED':       'RETURN CANCELLED',
    'RETURN PENDING':         'RETURN PENDING',
    'LOST':                   'LOST',
    'REACHED DESTINATION HUB': 'REACHED DESTINATION HUB',
}

REFUND_STATUS_MAP = {
    'Pending':  'pending',
    'Refunded': 'processed',
}

REFUND_MODE_MAP = {
    'Original Payment Method': 'original_payment_method',
    'Bank Transfer':           'bank_transfer',
}

QC_STATUS_MAP = {
    'pass': 'pass', 'Pass': 'pass',
    'fail': 'fail', 'Fail': 'fail',
    'pending': 'pending', 'Pending': 'pending',
}
```

**Forward shipment lookup:**
```python
def find_forward_shipment(conn, forward_id_raw: str, awb_code: str, sheet_name: str) -> int | None:
    """
    Returns-2023/2024/2025: try shiprocket_order_id match.
    Returns-2025-2026 (Kirgo format IDs like R_2023): try awb_code match.
    """
    if 'Returns 2025 - 2026' in sheet_name:
        # Kirgo-format return IDs — can't use Forward ID
        if awb_code:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM shipments WHERE awb_code = %s LIMIT 1",
                    (awb_code,)
                )
                row = cur.fetchone()
                return row[0] if row else None
        return None
    else:
        try:
            sr_oid = int(float(forward_id_raw))
        except (ValueError, TypeError):
            return None
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM shipments WHERE shiprocket_order_id = %s LIMIT 1",
                (sr_oid,)
            )
            row = cur.fetchone()
            return row[0] if row else None
```

### 3.5 `reconciliation.py` — Workbook-specific checks

Extends the existing `importers/woocommerce/reconciliation.py` with:

```python
# SR-specific checks
RC-SR-01  HARD   COUNT(shipments) > 0
RC-SR-02  HARD   All status=DELIVERED rows have delivered_at IS NOT NULL
RC-SR-03  SOFT   order_id match rate >= 70% (advisory if < 70% unlinked)

# Returns-specific checks
RC-RT-01  HARD   COUNT(returns) > 0
RC-RT-02  SOFT   RETURN DELIVERED rows have returned_at IS NOT NULL

# Full-run checks (after all phases)
RC-FULL-01 HARD  COUNT(orders) = 916
RC-FULL-02 HARD  COUNT(order_lines WHERE variant_id IS NULL) = 0
RC-FULL-03 ADVISORY  Total gross_revenue_inr > 0
```

### 3.6 `run_import.py` — CLI

```
python3 -m importers.workbook.run_import [OPTIONS]

Options:
  --file           Path to workbook (default: imports/raw/Kirgo Numbers.xlsx)
  --sheet          Which importer to run: wc_orders | sr_shipments | returns | all
  --preflight      Run pre-flight checks only, no DB writes
  --reconcile-only Run full reconciliation only, no DB writes
  --admin-email    Email of admin user in users table
  --user-id        ID of admin user (overrides --admin-email)
  --log-level      DEBUG | INFO | WARNING (default: INFO)
```

**Typical full historical load:**
```bash
# Step 1: pre-flight
python3 -m importers.workbook.run_import --preflight

# Step 2: WC orders
python3 -m importers.workbook.run_import --sheet wc_orders --admin-email jiten65.b@gmail.com

# Step 3: resolve any UNRESOLVED_SKU warnings, update sku_manual_map.csv, re-run if needed
# SELECT sku_raw FROM order_lines WHERE variant_id IS NULL;

# Step 4: SR shipments
python3 -m importers.workbook.run_import --sheet sr_shipments --admin-email jiten65.b@gmail.com

# Step 5: Returns
python3 -m importers.workbook.run_import --sheet returns --admin-email jiten65.b@gmail.com

# Step 6: full reconciliation
python3 -m importers.workbook.run_import --reconcile-only
```

Or run all in sequence:
```bash
python3 -m importers.workbook.run_import --sheet all --admin-email jiten65.b@gmail.com
```

---

## 4. Transaction Model

Consistent with the CSV importer:

| Operation | Transaction scope |
|---|---|
| Customer INSERT | Auto-commit (connection-level autocommit=True) |
| Order + order_lines INSERT | Explicit `BEGIN/COMMIT/ROLLBACK` per order |
| Shipment INSERT | Auto-commit (single row, no atomic multi-table write needed) |
| Return INSERT | Auto-commit |
| import_runs UPDATE | Auto-commit |
| import_errors INSERT | Auto-commit |

Customer inserts use auto-commit because they happen independently of the order transaction. If the order transaction rolls back, the customer row remains; on re-run the existing customer is reused. This is correct behaviour.

---

## 5. Error Codes

All error codes follow the existing pattern established in `importers/woocommerce/validators.py`:

| Code | Used for |
|---|---|
| `FIELD_REJECTED` | Hard validation failure; row rejected |
| `DQ_WARN` | Soft validation; field nullified, row imported |
| `DUPLICATE_ORDER` | Order already in DB; skipped |
| `DUPLICATE_SHIPMENT` | Shipment already in DB; skipped |
| `UNRESOLVED_SKU` | SKU has no matching product_variants row |
| `RECONCILE_WARN` | Order total vs line sum variance |
| `MISSING_WC_ORDER` | SR Order ID has no matching WC order (advisory) |
| `MISSING_SHIPMENT` | Return has no matching forward shipment (advisory) |
| `CREDENTIALS_SHEET_SKIPPED` | Credentials sheet detected and skipped (advisory) |

---

## 6. Logging

Every importer uses structured log format:
```
2026-06-18T14:32:01 INFO     importers.workbook.wc_orders  order_inserted wc_id=2057 order_id=1 lines=1
2026-06-18T14:32:01 WARNING  importers.workbook.wc_orders  unresolved_sku order_id=2055 sku=SBP-XS-OLD slot=1
2026-06-18T14:32:02 INFO     importers.workbook.wc_orders  rows_processed imported=916 skipped=0 failed=0 warnings=3
2026-06-18T14:32:02 INFO     importers.workbook.sr_shipments  order_match_rate matched=847 total=1095
```

---

## 7. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Single workbook open | Load all sheets once at startup | Avoids repeated file I/O; workbook is ~5MB |
| SR sheets as one import_run | One import_run for all 4 SR sheets | Reconciliation operates on the combined SR dataset; splitting would fragment the totals |
| Returns as one import_run | One import_run for all 4 Returns sheets | Same reason |
| No atomic transaction for shipments | Single-row auto-commit | Shipments table has no multi-table write; atomicity not needed |
| `total_revenue_inr` deferred | Computed after SR import | Requires `delivered_at` from shipments; not available during WC phase |
| Go artefact cleaning | `parse_decimal_clean` helper | COD Charges and Freight columns in SR sheets contain `%!f(string=N.)` format strings from a Go-based data pipeline |
| `Returns 2025 - 2026` special handling | AWB code lookup | This sheet uses Kirgo-internal return IDs, not Shiprocket IDs; AWB is the only reliable join key |
| Workbook replaces CSV for historical load | Workbook importer is primary | Workbook contains all 3 data types (WC + SR + Returns) in a single file; CSV importer targets a different export format |
