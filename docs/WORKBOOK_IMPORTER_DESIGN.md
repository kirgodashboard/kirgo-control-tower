# Workbook Importer Design

**Version:** 2.0  
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
| Data scope | WC orders only | WC orders + SR shipments + Returns + Bank transactions |
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
    wc_orders.py                  ← WooCommerceOrdersImporter
    sr_shipments.py               ← ShiprocketShipmentsImporter
    returns.py                    ← ReturnsImporter
    bank_transactions.py          ← BankTransactionsImporter
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
    Open the workbook once. Read all import-target sheets into DataFrames.
    Skip Credentials sheet entirely — log advisory, do not read contents.
    Bank sheets are read with header_row=20, skiprows=list(range(22)) so only
    actual transaction rows land in the DataFrame.
    WC and SR sheets are read normally (header in row 0).
    Normalise all headers: strip whitespace, preserve original case.
    Returns WorkbookData with all sheets pre-loaded.
    Raises WorkbookLoadError on missing sheet or unreadable file.
    """

IMPORT_SHEETS = [
    'Woocom - Orders',
    'SR - 2023', 'SR - 2024', 'SR - 2025', 'SR - 2026',
    'Returns - 2023', 'Returns - 2024', 'Returns - 2025', 'Returns 2025 - 2026 ',
]

BANK_SHEETS = ['2023', '2024', '2025 ', '2026']   # '2025 ' has trailing space

EXCLUDED_SHEETS = ['Credentials']   # never read
```

**Bank sheet reading:**
```python
def _read_bank_sheet(wb_path: Path, sheet_name: str) -> pd.DataFrame:
    """
    HDFC statement: header at row index 20, asterisk separator at 21, data from 22.
    openpyxl reads raw; pandas reads with header=0 from a pre-sliced frame.
    Filter rows where Date column is not parseable as %d/%m/%y — removes footer rows.
    """
    df = pd.read_excel(wb_path, sheet_name=sheet_name, header=20,
                       dtype=str, keep_default_na=False)
    # Row immediately after header is asterisk separator — drop it
    df = df.iloc[1:].reset_index(drop=True)
    # Strip whitespace from all headers
    df.columns = [str(c).strip() for c in df.columns]
    # Filter to actual transaction rows
    df = df[df['Date'].apply(_is_transaction_date)].reset_index(drop=True)
    return df

def _is_transaction_date(val: str) -> bool:
    try:
        datetime.strptime(str(val).strip(), '%d/%m/%y')
        return True
    except ValueError:
        return False
```

**Key behaviour:** All commerce/SR sheets are read with `dtype=str, keep_default_na=False` so every value is a string. `None` comparisons are replaced by empty-string checks. This avoids `NaN` propagation into the database.

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
`total_revenue_inr` left at 0 — populated after SR shipments import.

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
After SR import completes, compute `customers.total_revenue_inr`:
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

### 3.5 `bank_transactions.py` — `BankTransactionsImporter`

Processes all 4 HDFC bank sheets as a single import run.

#### 3.5.1 Constants

```python
BANK_SHEETS = ['2023', '2024', '2025 ', '2026']   # '2025 ' has trailing space

# Narration classifier — patterns applied in priority order (first match wins)
# Each tuple: (regex, transaction_type, gateway, ref_extractor_fn)
NARRATION_RULES: list[tuple[re.Pattern, str, str | None, Callable | None]] = [
    (re.compile(r'SHIPROCKET COD CRF ID (\d+)', re.I),
        'cod_remittance',       'shiprocket_cod',   _extract_crf_id),
    (re.compile(r'INFIBEAM AVENUES', re.I),
        'gateway_settlement',   'infibeam',         _extract_cms_ref),
    (re.compile(r'EASEBUZZ PVT LTD', re.I),
        'gateway_settlement',   'easebuzz',         _extract_yesf_ref),
    (re.compile(r'BIGFOOT RETAIL SOLUTIONS', re.I),
        'gateway_settlement',   'gokwik',           _extract_cms_ref),
    (re.compile(r'RAZORPAY', re.I),
        'gateway_settlement',   'razorpay',         None),
    (re.compile(r'(BIGFOOT RETAIL|SHIPROCKET)', re.I),
        'shiprocket_recharge',  None,               None),
    (re.compile(r'UPI-.+REFUND', re.I),
        'customer_refund',      None,               None),
    (re.compile(r'ADVANCE PAYMENT OF IMPORT BILL', re.I),
        'supplier_payment',     None,               None),
    (re.compile(r'POS.+PAYPAL', re.I),
        'supplier_payment',     None,               None),
    (re.compile(r'GOOGLE WORKSPACE', re.I),
        'saas_subscription',    None,               None),
    (re.compile(r'INSTAALERT|DEBIT CARD ANNUAL FEE', re.I),
        'bank_charge',          None,               None),
]
# Default for no match:
DEFAULT_TYPE = 'unclassified'
```

#### 3.5.2 Reference extractors

```python
def _extract_crf_id(narration: str) -> str | None:
    """Extract CRF ID from 'SHIPROCKET COD CRF ID 123456'."""
    m = re.search(r'CRF ID (\d+)', narration, re.I)
    return m.group(1) if m else None

def _extract_cms_ref(narration: str) -> str | None:
    """Extract CMS reference from Infibeam / Gokwik narrations."""
    m = re.search(r'(CMS\d+)', narration, re.I)
    return m.group(1) if m else None

def _extract_yesf_ref(narration: str) -> str | None:
    """Extract YESF reference from EaseBuzz narrations."""
    m = re.search(r'(YESF\d+)', narration, re.I)
    return m.group(1) if m else None

def _extract_upi_ref(narration: str) -> str | None:
    """Extract UPI VPA or transaction reference."""
    m = re.search(r'UPI/([^/]+)', narration, re.I)
    return m.group(1) if m else None
```

#### 3.5.3 Narration classifier

```python
@dataclass
class ClassifiedTransaction:
    transaction_type:   str
    gateway:            str | None
    extracted_reference: str | None
    counterparty:       str | None

def classify_narration(narration: str) -> ClassifiedTransaction:
    for pattern, txn_type, gateway, extractor in NARRATION_RULES:
        if pattern.search(narration):
            ref = extractor(narration) if extractor else None
            counterparty = _extract_counterparty(narration)
            return ClassifiedTransaction(txn_type, gateway, ref, counterparty)
    return ClassifiedTransaction(DEFAULT_TYPE, None, None, None)
```

#### 3.5.4 Dedup check

```python
def bank_txn_exists(conn, txn_date: date, narration: str,
                    withdrawal: Decimal | None, deposit: Decimal | None) -> bool:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM bank_transactions
            WHERE transaction_date = %s
              AND narration_raw     = %s
              AND withdrawal_inr IS NOT DISTINCT FROM %s
              AND deposit_inr    IS NOT DISTINCT FROM %s
        """, (txn_date, narration, withdrawal, deposit))
        return cur.fetchone() is not None
```

#### 3.5.5 Balance continuity validation

```python
def validate_balance_continuity(rows: list[dict]) -> list[str]:
    """
    For each consecutive pair of rows, verify:
        prev.closing_balance ± current.deposit_or_withdrawal ≈ current.closing_balance
    Tolerance: ±₹0.50 (rounding in HDFC statements).
    Returns list of warning strings for any break found.
    """
    warnings = []
    for i in range(1, len(rows)):
        prev = rows[i-1]
        curr = rows[i]
        expected = prev['closing_balance_inr']
        if curr['deposit_inr']:
            expected += curr['deposit_inr']
        if curr['withdrawal_inr']:
            expected -= curr['withdrawal_inr']
        if abs(expected - curr['closing_balance_inr']) > Decimal('0.50'):
            warnings.append(
                f"Balance discontinuity at {curr['transaction_date']}: "
                f"expected {expected}, got {curr['closing_balance_inr']}"
            )
    return warnings
```

#### 3.5.6 Import flow per sheet

```python
class BankTransactionsImporter:
    SOURCE = 'bank_hdfc'
    
    def execute(self) -> int:
        # Phase 0: preflight — detect Credentials sheet, verify all 4 bank sheets exist
        # Phase 1: open_import_run(source=SOURCE)
        # Phase 2: for each bank sheet in chronological order (2023→2024→2025→2026):
        #   a. read sheet via workbook_loader._read_bank_sheet()
        #   b. for each row:
        #      i.   parse_date(Date), parse_decimal(Withdrawal Amt., Deposit Amt., Closing Balance)
        #      ii.  classify_narration(Narration)
        #      iii. bank_txn_exists() → skip if True (rows_skipped_duplicate++)
        #      iv.  INSERT bank_transactions row → get bank_txn_id
        #      v.   if transaction_type in ('gateway_settlement', 'cod_remittance'):
        #               INSERT gateway_settlements row, linking bank_transaction_id = bank_txn_id
        #   c. validate_balance_continuity(sheet_rows) → log DQ_WARN for any breaks
        # Phase 3: run bank reconciliation checks (RC-BANK-01..04)
        # Phase 4: close_import_run()
```

#### 3.5.7 `gateway_settlements` INSERT logic

```python
def insert_gateway_settlement(conn, bank_txn_id: int, classified: ClassifiedTransaction,
                               txn_date: date, amount_inr: Decimal) -> None:
    """
    Inserts into gateway_settlements and updates bank_transactions.gateway_settlement_id FK.
    Only called when transaction_type in ('gateway_settlement', 'cod_remittance').
    """
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO gateway_settlements
                (bank_transaction_id, gateway, settlement_reference,
                 settlement_date, amount_inr, source_narration)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (settlement_reference) DO NOTHING
            RETURNING id
        """, (bank_txn_id, classified.gateway, classified.extracted_reference,
              txn_date, amount_inr, None))
        row = cur.fetchone()
        if row:
            gs_id = row[0]
            cur.execute(
                "UPDATE bank_transactions SET gateway_settlement_id = %s WHERE id = %s",
                (gs_id, bank_txn_id)
            )
```

`settlement_reference` may be NULL for gateways where the reference extractor found no match (e.g. Razorpay without a structured ref). In that case `ON CONFLICT` does not fire.

### 3.6 `reconciliation.py` — Workbook-specific checks

Extends the existing `importers/woocommerce/reconciliation.py` with:

```python
# SR-specific checks
RC-SR-01  HARD   COUNT(shipments) > 0
RC-SR-02  HARD   All status=DELIVERED rows have delivered_at IS NOT NULL
RC-SR-03  SOFT   order_id match rate >= 70% (advisory if < 70% unlinked)

# Returns-specific checks
RC-RT-01  HARD   COUNT(returns) > 0
RC-RT-02  SOFT   RETURN DELIVERED rows have returned_at IS NOT NULL

# Bank-specific checks
RC-BANK-01 SOFT  Balance continuity across each year's statement (0 breaks)
RC-BANK-02 HARD  COD CRF ID match rate: bank_transactions with type=cod_remittance
                 must have extracted_reference NOT NULL >= 95% of rows
RC-BANK-03 SOFT  COUNT(bank_transactions WHERE transaction_type='unclassified') < 50
RC-BANK-04 SOFT  ABS(SUM(bank COD deposits) - SUM(shipments.remitted_inr)) < 500 per year

# Cross-domain checks
RC-XDOM-01 ADVISORY  Total gateway settlement deposits within 10% of WC delivered revenue
RC-XDOM-02 SOFT      COD bank deposits match SR remitted_inr per CRF ID batch

# Full-run checks (after all phases)
RC-FULL-01 HARD  COUNT(orders) = 916
RC-FULL-02 HARD  COUNT(order_lines WHERE variant_id IS NULL) = 0
RC-FULL-03 ADVISORY  Total gross_revenue_inr > 0
```

### 3.7 `run_import.py` — CLI

```
python3 -m importers.workbook.run_import [OPTIONS]

Options:
  --file           Path to workbook (default: imports/raw/Kirgo Numbers.xlsx)
  --sheet          Which importer to run:
                     wc_orders | sr_shipments | returns | bank_transactions | all
  --preflight      Run pre-flight checks only, no DB writes
  --reconcile-only Run full reconciliation only, no DB writes
  --admin-email    Email of admin user in users table
  --user-id        ID of admin user (overrides --admin-email)
  --log-level      DEBUG | INFO | WARNING (default: INFO)
```

**Full historical load sequence:**
```bash
# Pre-flight
python3 -m importers.workbook.run_import --preflight

# Commerce
python3 -m importers.workbook.run_import --sheet wc_orders --admin-email jiten65.b@gmail.com

# Resolve UNRESOLVED_SKU warnings if any:
# SELECT sku_raw FROM order_lines WHERE variant_id IS NULL;
# Edit: imports/config/sku_manual_map.csv; re-run wc_orders (idempotent)

# Shipments
python3 -m importers.workbook.run_import --sheet sr_shipments --admin-email jiten65.b@gmail.com

# Returns
python3 -m importers.workbook.run_import --sheet returns --admin-email jiten65.b@gmail.com

# Bank transactions
python3 -m importers.workbook.run_import --sheet bank_transactions --admin-email jiten65.b@gmail.com

# Full reconciliation
python3 -m importers.workbook.run_import --reconcile-only
```

Or all in sequence:
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
| Bank transaction INSERT | Auto-commit |
| Gateway settlement INSERT + bank FK UPDATE | Explicit `BEGIN/COMMIT/ROLLBACK` per row |
| import_runs UPDATE | Auto-commit |
| import_errors INSERT | Auto-commit |

The bank transaction + gateway settlement INSERT pair uses a short explicit transaction: if `gateway_settlements` INSERT succeeds but the FK UPDATE fails, the whole pair rolls back and the row is retried on the next run.

---

## 5. Error Codes

All error codes follow the existing pattern established in `importers/woocommerce/validators.py`:

| Code | Used for |
|---|---|
| `FIELD_REJECTED` | Hard validation failure; row rejected |
| `DQ_WARN` | Soft validation; field nullified, row imported |
| `DUPLICATE_ORDER` | Order already in DB; skipped |
| `DUPLICATE_SHIPMENT` | Shipment already in DB; skipped |
| `DUPLICATE_BANK_TXN` | Bank transaction already in DB; skipped |
| `UNRESOLVED_SKU` | SKU has no matching product_variants row |
| `RECONCILE_WARN` | Order total vs line sum variance |
| `MISSING_WC_ORDER` | SR Order ID has no matching WC order (advisory) |
| `MISSING_SHIPMENT` | Return has no matching forward shipment (advisory) |
| `CREDENTIALS_SHEET_SKIPPED` | Credentials sheet detected and skipped (advisory) |
| `BALANCE_DISCONTINUITY` | Bank statement closing balance does not chain correctly |
| `UNCLASSIFIED_NARRATION` | Bank transaction narration did not match any classifier rule |
| `MISSING_COD_CRF_ID` | COD remittance narration present but CRF ID could not be extracted |

---

## 6. Logging

Every importer uses structured log format:
```
2026-06-18T14:32:01 INFO     importers.workbook.wc_orders         order_inserted wc_id=2057 order_id=1 lines=1
2026-06-18T14:32:01 WARNING  importers.workbook.wc_orders         unresolved_sku order_id=2055 sku=SBP-XS-OLD slot=1
2026-06-18T14:32:02 INFO     importers.workbook.wc_orders         rows_processed imported=916 skipped=0 failed=0 warnings=3
2026-06-18T14:32:02 INFO     importers.workbook.sr_shipments      order_match_rate matched=847 total=1095
2026-06-18T14:32:03 INFO     importers.workbook.bank_transactions sheet=2024 rows_parsed=248 imported=246 skipped=2
2026-06-18T14:32:03 WARNING  importers.workbook.bank_transactions unclassified_narration date=2024-03-15 narration="NEFT-ABCD1234-..."
2026-06-18T14:32:03 WARNING  importers.workbook.bank_transactions balance_discontinuity date=2024-07-01 expected=123456.78 got=123457.00
```

---

## 7. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Single workbook open | Load all sheets once at startup | Avoids repeated file I/O; workbook is ~5MB |
| SR sheets as one import_run | One import_run for all 4 SR sheets | Reconciliation operates on the combined SR dataset; splitting would fragment the totals |
| Returns as one import_run | One import_run for all 4 Returns sheets | Same reason |
| Bank sheets as one import_run | One import_run for all 4 bank sheets | Balance continuity validation requires sequential cross-year rows |
| No atomic transaction for shipments | Single-row auto-commit | Shipments table has no multi-table write; atomicity not needed |
| Atomic pair for bank + settlement | `BEGIN/COMMIT/ROLLBACK` per settlement row | gateway_settlements FK back to bank_transactions requires both rows to commit together |
| `total_revenue_inr` deferred | Computed after SR import | Requires `delivered_at` from shipments; not available during WC phase |
| Go artefact cleaning | `parse_decimal_clean` helper | COD Charges and Freight columns in SR sheets contain `%!f(string=N.)` format strings from a Go-based data pipeline |
| `Returns 2025 - 2026` special handling | AWB code lookup | This sheet uses Kirgo-internal return IDs, not Shiprocket IDs; AWB is the only reliable join key |
| Bank sheet header at row 20 | `pd.read_excel(header=20)` | HDFC statement format: rows 0-19 are account metadata, row 20 is the column header, row 21 is `***` separator |
| Filter non-transaction rows by Date parseability | `datetime.strptime('%d/%m/%y')` | HDFC footer rows contain summary lines (Opening Balance, Closing Balance, etc.) that cannot be parsed as dates |
| Narration classifier as ordered rules list | First-match priority | Avoids ambiguity when a narration matches multiple patterns (e.g. SHIPROCKET vs BIGFOOT RETAIL overlap) |
| `settlement_reference` UNIQUE with DO NOTHING | Idempotent gateway settlement insert | On re-run, duplicate settlements are skipped without error |
| Workbook replaces CSV for historical load | Workbook importer is primary | Workbook contains all 4 data types (WC + SR + Returns + Bank) in a single file; CSV importer targets a different export format |
