# Bank Import Specification — HDFC Statement

**Version:** 1.0  
**Source sheets:** `2023`, `2024`, `2025 ` (trailing space), `2026` in `Kirgo Numbers.xlsx`  
**Account:** HDFC Bank 50200082476640, AMBOLI ANDHERI, Mumbai  
**Coverage:** 15 Oct 2023 → 15 Jun 2026  
**Total actual transactions:** ~681 (after filtering headers/footers)  
**Destination tables:** `bank_transactions`, `gateway_settlements`  

---

## 1. Statement Structure

Each bank sheet is a raw HDFC PDF-to-Excel export. It is NOT a clean tabular file.

### 1.1 Sheet layout

```
Row 0:  HDFC Bank header block (merge)
Row 4:  Account Branch
Row 5:  Customer name / address
...
Row 15: Statement period (e.g. "Statement From : 01/01/2024   To : 31/12/2024")
Row 19: Asterisk separator
Row 20: COLUMN HEADERS  ← actual header row
Row 21: Asterisk separator
Row 22: First transaction  ← data start
...
Row N:  Footer metadata rows (STATEMENT SUMMARY, disclaimer, closing balance)
```

**Header row (row index 20, 0-indexed):**

| Column | Type | Notes |
|---|---|---|
| `Date` | `dd/mm/yy` | Transaction posting date |
| `Narration` | text | Payment description — primary classification input |
| `Chq./Ref.No.` | text | NEFT/UTR reference number; may have leading zeros |
| `Value Dt` | `dd/mm/yy` | Value date (usually same as Date; use for interest calculations) |
| `Withdrawal Amt.` | numeric string | Debit amount; blank for credits |
| `Deposit Amt.` | numeric string | Credit amount; blank for debits |
| `Closing Balance` | numeric string | Running balance after this transaction |

### 1.2 Parsing algorithm — how to isolate transaction rows

```python
def is_transaction_row(row: dict) -> bool:
    date_val = str(row.get('Date', '')).strip()
    # Valid transaction rows have a parseable date in dd/mm/yy format
    # Footer rows, separators, and metadata rows have blank or non-date Date fields
    try:
        datetime.strptime(date_val, '%d/%m/%y')
        return True
    except ValueError:
        return False
```

**Rows to skip:**
- Asterisk separator rows (`Date = '********'`)
- Statement summary section (date is blank or `'STATEMENT SUMMARY'`)
- Opening balance row (date is blank, narration contains 'Opening Balance')
- Footer rows: "Generated On:", "HDFC BANK LIMITED.", "--- End Of Statement ---", disclaimers
- Any row where `Date` is not parseable as `dd/mm/yy`

**Closing balance row** (date blank, contains numeric opening balance / debits / credits / closing balance):
- Extract statement-level summary from this row for reconciliation
- Do NOT import as a transaction

### 1.3 Statement period extraction

Extract from row 15: `Statement From  :  {start}         To  :  {end}`

| Sheet | Period | Rows |
|---|---|---|
| `2023` | 15 Oct 2023 – 31 Dec 2023 | 30 |
| `2024` | 01 Jan 2024 – 31 Dec 2024 | ~248 |
| `2025 ` | 01 Jan 2025 – 31 Dec 2025 | ~248 |
| `2026` | 01 Jan 2026 – 15 Jun 2026 | ~155 |

---

## 2. CR/DR Classification

Each row is exclusively a credit (deposit) or a debit (withdrawal). Never both.  
The `bank_transactions_one_direction` CHECK constraint enforces this.

```python
def parse_amount(row) -> tuple[float | None, float | None]:
    wd_raw  = row.get('Withdrawal Amt.', '').strip()
    dep_raw = row.get('Deposit Amt.',   '').strip()
    withdrawal = float(wd_raw)  if wd_raw  else None
    deposit    = float(dep_raw) if dep_raw else None
    return withdrawal, deposit
```

---

## 3. Narration Classification

### 3.1 Classification hierarchy (apply in order — first match wins)

```python
NARRATION_CLASSIFIERS = [

    # ── INBOUND: Revenue settlements ──────────────────────────────────────────

    (r'SHIPROCKET COD CRF ID (\d+)',
     'cod_remittance',        # bank_transactions.transaction_type
     'SHIPROCKET_COD',        # gateway_settlements.gateway
     _extract_crf_id),        # → extracted_reference = CRF ID number

    (r'INFIBEAM AVENUES',
     'gateway_settlement',
     'infibeam',
     _extract_cms_ref),       # → CMS{N} from narration or Chq./Ref.No.

    (r'EASEBUZZ PVT LTD',
     'gateway_settlement',
     'easebuzz',
     _extract_yesf_ref),      # → YESF{N} from Chq./Ref.No.

    (r'BIGFOOT RETAIL SOLUTIONS',  # Gokwik PSP
     'gateway_settlement',
     'gokwik',
     _extract_cms_ref),

    (r'RAZORPAY',
     'gateway_settlement',
     'razorpay',
     _extract_ref_number),

    (r'SHIPROCKET PRIVATE LIMITED',
     'gateway_settlement',
     'shiprocket_cod',
     _extract_ref_number),

    (r'^UPI-.+-(KIRGO|KIRGO ORDER|ORDER)\b',   # direct UPI order payments
     'gateway_settlement',
     None,                    # no gateway_settlements row needed; direct bank credit
     _extract_upi_ref),

    # ── INBOUND: Non-revenue ──────────────────────────────────────────────────

    (r'^IMPS-.+SIDDHARTH.+BAJPAI|^NEFT CR-.+WINSTON.+MENDONCA|^UPI-.+RAHUL',
     'founder_transfer',
     None,
     _extract_ref_number),

    # ── OUTBOUND: Platform costs ──────────────────────────────────────────────

    (r'(BIGFOOT RETAIL|SHIPROCKET|SHIPROCKET RECHARGE)',   # on withdrawals
     'shiprocket_recharge',
     None,
     _extract_ref_number),

    (r'^UPI-.+REFUND',
     'customer_refund',
     None,
     _extract_upi_ref),

    # ── OUTBOUND: Supplier / CAPEX ────────────────────────────────────────────

    (r'ADVANCE PAYMENT OF IMPORT BILL',
     'supplier_payment',
     None,
     _extract_ref_number),

    (r'^POS.+PAYPAL|^UPI.+PAYPAL',
     'supplier_payment',       # merchandise/fabric sourcing via PayPal
     None,
     _extract_ref_number),

    (r'^POS.+AMAZON',
     'supplier_payment',
     None,
     _extract_ref_number),

    # ── OUTBOUND: Marketing / SaaS ────────────────────────────────────────────

    (r'GOOGLE WORKSPACE|ME DC SI.+GOOGLE',
     'saas_subscription',
     None,
     _extract_ref_number),

    (r'CANVA',
     'saas_subscription',
     None,
     _extract_ref_number),

    # ── Bank fees ─────────────────────────────────────────────────────────────

    (r'INSTAALERT|INSTAALER|DEBIT CARD ANNUAL FEE|BOE OVERDUE',
     'bank_charge',
     None,
     _extract_ref_number),

    # ── Tax ───────────────────────────────────────────────────────────────────

    (r'27AAACH2702H1Z0',       # Kirgo's GSTIN pattern in GST payments
     'miscellaneous',
     None,
     _extract_ref_number),

    # ── Fallback ──────────────────────────────────────────────────────────────

    (r'.*',
     'unclassified',
     None,
     _extract_ref_number),
]
```

### 3.2 Reference extraction functions

```python
import re

def _extract_crf_id(narration, ref_no):
    m = re.search(r'CRF ID (\d+)', narration)
    return m.group(1) if m else None

def _extract_cms_ref(narration, ref_no):
    # CMS ref appears in both narration and Chq./Ref.No. (stripped of leading zeros)
    m = re.search(r'(CMS\w+)', narration)
    if m: return m.group(1)
    return ref_no.lstrip('0') if ref_no else None

def _extract_yesf_ref(narration, ref_no):
    # EaseBuzz: YESF ref in Chq./Ref.No. (no leading zeros to strip)
    m = re.search(r'(YESF\w+|ICICN\w+|IN\d{20})', narration)
    if m: return m.group(1)
    return ref_no.strip() if ref_no else None

def _extract_upi_ref(narration, ref_no):
    # UPI ref: the numeric portion of the UPI transaction ID
    m = re.search(r'UPI-\d+-[^-]+-(\d{12,})', narration)
    if m: return m.group(1)
    return ref_no.lstrip('0') if ref_no else None

def _extract_ref_number(narration, ref_no):
    return ref_no.lstrip('0') if ref_no else None
```

### 3.3 Counterparty extraction

```python
def extract_counterparty(narration: str, txn_type: str) -> str | None:
    """Extract human-readable counterparty name from narration."""
    n = narration.strip()

    if n.startswith('NEFT CR-'):
        # Format: NEFT CR-{ifsc}-{sender_name}-{account_name}-{ref}
        parts = n.split('-')
        return parts[2].strip() if len(parts) >= 3 else None

    if n.startswith('UPI-'):
        # Format: UPI-{txn_id}-{vpa_or_name}-{ref}-{note}
        parts = n.split('-')
        return parts[2].strip() if len(parts) >= 3 else None

    if n.startswith('POS ') or n.startswith('ME DC'):
        # Format: POS {card} {merchant_name}
        m = re.search(r'403875XXXXXX2406\s+(.+?)(?:\s+CYBS)?$', n)
        return m.group(1).strip() if m else None

    if n.startswith('IMPS-'):
        parts = n.split('-')
        return parts[2].strip() if len(parts) >= 3 else None

    return None
```

---

## 4. Transaction Type → `bank_transactions.transaction_type` Mapping

All 15 values from the schema CHECK constraint:

| Type | Observed in data | Count | Notes |
|---|---|---|---|
| `gateway_settlement` | NEFT CR from Infibeam, EaseBuzz, Gokwik, Razorpay | 188 | Batch prepaid/UPI collections |
| `cod_remittance` | NEFT CR from Shiprocket COD CRF | 112 | Per-batch COD handover |
| `shiprocket_recharge` | UPI/POS to Bigfoot Retail / Shiprocket | 125 | Wallet top-up for label printing |
| `customer_refund` | UPI outbound with REFUND in narration | 49 | Refund to customer |
| `founder_transfer` | NEFT/IMPS from owner (Siddharth Bajpai, Winston Mendonca) | ~5 | Capital infusion |
| `supplier_payment` | POS PayPal, ADVANCE PAYMENT OF IMPORT BILL | 20 | Fabric / merchandise sourcing |
| `saas_subscription` | Google Workspace, Canva | 13 | Monthly recurring SaaS |
| `bank_charge` | InstaAlert SMS, card annual fee, BOE overdue | 17 | HDFC bank fees |
| `miscellaneous` | GST payments | 4 | Tax payments via GSTIN |
| `ad_spend_meta` | _(not yet observed — future)_ | 0 | Meta ads spend |
| `ad_spend_google` | _(not yet observed — future)_ | 0 | Google ads spend |
| `courier_payment` | _(not yet observed — future)_ | 0 | Direct courier payment |
| `fx_loss` | `.DC INTL POS TXN DCC+ST` | ~10 | International card DCC charges |
| `inventory_write_off` | _(not yet observed — future)_ | 0 | — |
| `unclassified` | UPI outbound not matching known patterns | ~40 | Requires manual review |

> **UPI outbound (₹8,19,867 out across 73 txns):** The largest unclassified block. Many are likely founder withdrawals or B2B payments for ad spend / freelancers. These start as `unclassified` and are manually updated after review.

---

## 5. Idempotency

The `bank_transactions` table has no unique constraint on the reference number. Dedup strategy:

**Primary dedup key:** `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)`  
**Secondary check:** `reference_number` (if non-blank)

Before inserting a row, check:
```python
SELECT id FROM bank_transactions
WHERE transaction_date = %s
  AND narration_raw = %s
  AND COALESCE(withdrawal_inr, -1) = COALESCE(%s, -1)
  AND COALESCE(deposit_inr, -1) = COALESCE(%s, -1)
LIMIT 1
```
If found: skip (rows_skipped_duplicate++). On same-day duplicate transactions with identical amounts (rare), dedup may over-skip — log as `DQ_WARN`.

---

## 6. Gateway Settlements — `gateway_settlements` table

For each transaction classified as `gateway_settlement` or `cod_remittance`, also insert a `gateway_settlements` row:

```python
INSERT INTO gateway_settlements (gateway, settlement_reference, amount_inr, settled_at)
VALUES (%s, %s, %s, %s)
ON CONFLICT (settlement_reference) DO NOTHING
```

| Txn type | `gateway` value | `settlement_reference` | `amount_inr` | Idempotency |
|---|---|---|---|---|
| `cod_remittance` | `shiprocket_cod` | CRF ID (e.g. `7541836`) | Deposit amount | ON CONFLICT settlement_reference |
| `gateway_settlement` (Infibeam) | `infibeam` | CMS ref (e.g. `CMS3657837222`) | Deposit amount | — |
| `gateway_settlement` (EaseBuzz) | `easebuzz` | YESF ref (e.g. `YESF260225568608`) | Deposit amount | — |
| `gateway_settlement` (Gokwik) | `infibeam` | CMS ref | Deposit amount | — |

After insert, link back: `UPDATE bank_transactions SET linked_settlement_id = {new_id} WHERE id = {bank_txn_id}`

---

## 7. COD Reconciliation

### 7.1 The link

```
shipments.cod_crf_id            ←→    gateway_settlements.settlement_reference
                                              ↕ (after bank import)
                                       bank_transactions.extracted_reference
```

**Example:**
- Shiprocket SR-2023 row: `CRF ID = 7541836`, `Remitted Amount = 1749`
- Bank 2023 row: narration `...SHIPROCKET COD CRF ID 7541836...`, deposit `1749`
- After import: `gateway_settlements` row: `gateway='shiprocket_cod'`, `settlement_reference='7541836'`, `amount_inr=1749`
- `shipments.cod_crf_id = '7541836'` → matches `gateway_settlements.settlement_reference`

### 7.2 Reconciliation query (post-import)

```sql
-- COD settlements matched to shipments
SELECT
    gs.settlement_reference AS crf_id,
    gs.amount_inr           AS bank_deposit_inr,
    gs.settled_at           AS bank_value_date,
    SUM(s.remitted_inr)     AS sr_remitted_inr,
    gs.amount_inr - SUM(s.remitted_inr) AS variance_inr,
    COUNT(s.id)             AS shipment_count
FROM gateway_settlements gs
LEFT JOIN shipments s ON s.cod_crf_id = gs.settlement_reference
WHERE gs.gateway = 'shiprocket_cod'
GROUP BY 1, 2, 3
ORDER BY ABS(gs.amount_inr - SUM(COALESCE(s.remitted_inr, 0))) DESC;

-- Unmatched COD bank credits (no shipment for the CRF ID)
SELECT gs.settlement_reference, gs.amount_inr, gs.settled_at
FROM gateway_settlements gs
LEFT JOIN shipments s ON s.cod_crf_id = gs.settlement_reference
WHERE gs.gateway = 'shiprocket_cod' AND s.id IS NULL;
```

### 7.3 Expected reconciliation outcome

| Year | COD settlements | SR remitted_inr match | Notes |
|---|---|---|---|
| 2023 | 7 | Should match exactly | Small sample — easy to verify |
| 2024 | 55 | Should match ± rounding | Largest batch |
| 2025 | 30 | Should match ± rounding | 2025 CMS ref not in narration (ICIN format) |
| 2026 | 20 | Current year | In-progress |

---

## 8. Gateway Settlement Reconciliation

### 8.1 Infibeam (CCAvenue) — 108 settlements, ₹9,50,967

- **Settlement pattern:** Weekly batch via ICICI nodal account
- **Narration:** `NEFT CR-ICIC0000393-ICICI BANK NODAL AC INFIBEAM AVENUES LTD-KIRGO-{CMS_REF}`
- **Reference:** `CMS{8_digits}` in narration and Chq./Ref.No.
- **Reconciliation:** Bank credit CMS ref → no direct per-order breakdown available from bank narration alone. Reconcile by: sum of all WC orders with `payment_method = 'ccavenue'` within the settlement window ≈ bank deposit amount.
- **Note:** Infibeam settlements are net of their fees; gross amount = bank deposit + Infibeam MDR (fee not shown in HDFC statement).

### 8.2 EaseBuzz — 70 settlements, ₹2,17,574

- **Settlement pattern:** Daily or near-daily batches from Jan 2026 onwards
- **Narration:** `NEFT CR-YESB0000001-EASEBUZZ PVT LTD PA ESCROW A/C-KIRGO-{YESF_REF}`
- **Reference:** `YESF{18_digits}` — unique per batch
- **Reconciliation:** Same approach as Infibeam; EaseBuzz only appears in 2026 data.

### 8.3 Gokwik (via Bigfoot Retail Solutions) — 6 settlements, ₹17,490

- **Narration:** `NEFT CR-ICIC0099999-BIGFOOT RETAIL SOLUTIONS PVT LTD-KIRGO-{CMS_REF}`
- **Reference:** `CMS{10_digits}` — same CMS namespace as Infibeam
- **Reconciliation:** WC orders with `payment_method = 'gokwik_prepaid'` within window.

---

## 9. Expense Categorisation

### 9.1 Shiprocket recharges (125 transactions, ₹60,962)

POS/UPI payments to Bigfoot Retail Solutions (Shiprocket PSP) or direct Shiprocket UPI.  
These are **wallet top-ups** that fund label printing and courier costs. They are **not per-shipment costs** — per-shipment costs are captured in `shipments.freight_total_inr`.

```
bank_transactions.transaction_type = 'shiprocket_recharge'
```

### 9.2 Import bills (6 transactions, ₹12,46,932)

Largest single expense category. These are payments for imported merchandise (garments from overseas suppliers).

```
bank_transactions.transaction_type = 'supplier_payment'
```

Narration: `ADVANCE PAYMENT OF IMPORT BILL`  
These should link to `purchase_orders` via `bank_transactions.linked_purchase_order_id`.

### 9.3 PayPal payments (14 transactions, ₹1,23,360)

POS card payments to PayPal — likely overseas design/fabric sourcing.

```
bank_transactions.transaction_type = 'supplier_payment'
counterparty = 'PAYPAL'
```

### 9.4 International card charges (`.DC INTL POS TXN DCC+ST` — ~10 transactions)

Dynamic Currency Conversion surcharges on international card transactions.

```
bank_transactions.transaction_type = 'fx_loss'
```

### 9.5 UPI outbound — unclassified (73 transactions, ₹8,19,867)

Large bucket of outbound UPI transfers without clear narration patterns. These are the most important transactions to manually classify after import. Likely contains: marketing spend, freelancer payments, founder withdrawals, ad spend.

All imported as `transaction_type = 'unclassified'`. Update post-import by:
```sql
UPDATE bank_transactions SET transaction_type = 'ad_spend_meta'
WHERE transaction_type = 'unclassified'
  AND narration_raw LIKE '%META%' OR narration_raw LIKE '%FACEBOOK%';
```

---

## 10. Balance Continuity Validation

Each row's `closing_balance_inr` must equal: `prior_row.closing_balance_inr ± this_row.amount`.

```python
def validate_balance_continuity(rows: list[dict]) -> list[dict]:
    """
    Returns list of rows where closing_balance_inr doesn't match computed balance.
    Per BR-121.
    """
    warnings = []
    prev_balance = None
    for row in rows:
        if prev_balance is not None:
            wd  = row['withdrawal_inr'] or 0
            dep = row['deposit_inr'] or 0
            computed = round(prev_balance - wd + dep, 2)
            actual   = row['closing_balance_inr']
            if actual is not None and abs(computed - actual) > 0.01:
                warnings.append({
                    'date': row['transaction_date'],
                    'narration': row['narration_raw'][:40],
                    'expected': computed,
                    'actual': actual,
                    'diff': round(actual - computed, 2),
                })
        prev_balance = row['closing_balance_inr']
    return warnings
```

---

## 11. Validation Rules

### Hard (row rejected)

| ID | Field | Rule |
|---|---|---|
| V-BANK-01 | `Date` | Parseable as `dd/mm/yy` |
| V-BANK-02 | Amount | At least one of `Withdrawal Amt.` or `Deposit Amt.` is non-blank |
| V-BANK-03 | Amount | Not both `Withdrawal Amt.` and `Deposit Amt.` non-blank |

### Soft (warn, row imported)

| ID | Field | Rule |
|---|---|---|
| V-BANK-04 | `Closing Balance` | Must match computed prior_balance ± this_row_amount (±₹0.01) |
| V-BANK-05 | `Narration` | Log ADVISORY if classified as `unclassified` — manual review needed |
| V-BANK-06 | CRF ID | Log ADVISORY if `cod_remittance` CRF ID has no matching `shipments.cod_crf_id` |

---

## 12. Column → DB Field Mapping

| Sheet column | DB field | Transformation |
|---|---|---|
| `Date` | `bank_transactions.transaction_date` | `parse_date('%d/%m/%y')` |
| `Value Dt` | `bank_transactions.value_date` | `parse_date('%d/%m/%y')`; NULL if blank |
| `Narration` | `bank_transactions.narration_raw` | `TRIM` |
| `Chq./Ref.No.` | `bank_transactions.reference_number` | `TRIM`; store raw value |
| `Withdrawal Amt.` | `bank_transactions.withdrawal_inr` | `parse_decimal`; NULL if blank |
| `Deposit Amt.` | `bank_transactions.deposit_inr` | `parse_decimal`; NULL if blank |
| `Closing Balance` | `bank_transactions.closing_balance_inr` | `parse_decimal`; NULL if blank |
| (classified) | `bank_transactions.transaction_type` | From narration classifier |
| (extracted) | `bank_transactions.extracted_reference` | CRF ID, CMS ref, or YESF ref |
| (extracted) | `bank_transactions.counterparty` | From counterparty extractor |
| (from sheet meta) | (notes) | Sheet year stored in notes during import for traceability |
