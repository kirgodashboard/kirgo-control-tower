# Expense Intelligence — Validation Reference

> Last updated: 2026-06-20

---

## Schema Changes

```sql
ALTER TABLE expenses
  ADD COLUMN status         text DEFAULT 'draft'
    CHECK (status IN ('draft','approved','rejected')),
  ADD COLUMN attachment_url text;
```

Migration file: `supabase/migrations/20260620_expense_intelligence.sql`

---

## RPC Definitions

| Function | Arguments | Returns |
|----------|-----------|---------|
| `get_expense_kpis(p_start, p_end)` | date range | jsonb with 8 KPI fields |
| `get_expense_list(p_start, p_end, p_category_id?, p_vendor?)` | date range + optional filters | table of expense rows |
| `get_expense_by_category(p_start, p_end)` | date range | category breakdown with % |
| `get_expense_trend(p_start, p_end)` | date range | weekly/monthly buckets |
| `get_top_vendors(p_start, p_end, p_limit?)` | date range | vendor totals |
| `get_expense_categories()` | none | opex + both categories only |
| `insert_expense(...)` | 10 params | new expense id (int) |
| `get_unclassified_transactions(p_limit?)` | optional limit | withdrawal rows |
| `classify_bank_transaction(...)` | 5 params | new expense id (int) |

---

## KPI Definitions

### Total Expenses
`SUM(expenses.amount_inr)` where `expense_date BETWEEN p_start AND p_end`

### Monthly Run Rate
`total_expense / period_days * 30` — projects current spend to a 30-day equivalent.

### Largest Head
Category with highest SUM(amount_inr) in the period. Joined to `expense_categories.name`.

### Largest Vendor
Vendor text with highest SUM(amount_inr) in the period. NULL vendors excluded.

### Expense Growth %
`((current_total - prior_total) / prior_total) * 100` where prior period = same number of days before p_start.
Returns NULL if prior period has no data.

### Unclassified Count
`COUNT(*)` from `bank_transactions WHERE transaction_type = 'unclassified'` — global, not date-filtered.

---

## Trend Bucketing

| Period span | Bucket |
|-------------|--------|
| ≤ 90 days   | Weekly (`date_trunc('week', expense_date)`) |
| > 90 days   | Monthly (`date_trunc('month', expense_date)`) |

---

## Bank Classification Flow

1. `get_unclassified_transactions` → returns bank debits (`withdrawal_inr IS NOT NULL`) with `transaction_type = 'unclassified'`
2. User selects expense head + optional vendor → `classify_bank_transaction`
3. RPC inserts an **approved** expense with `bank_transaction_id` FK
4. RPC updates `bank_transactions.transaction_type` → `'miscellaneous'`
5. Transaction disappears from unclassified list; expense appears in Expense Master

---

## Cross-Check Queries

```sql
-- Verify total expense for a period
SELECT SUM(amount_inr) FROM expenses
WHERE expense_date BETWEEN '2026-01-01' AND CURRENT_DATE;

-- Compare with get_expense_kpis
SELECT (get_expense_kpis('2026-01-01'::date, CURRENT_DATE))->>'total_expense_inr';

-- Category breakdown sum = total
SELECT SUM(total_inr) FROM get_expense_by_category('2026-01-01'::date, CURRENT_DATE::date);

-- Count unclassified transactions
SELECT COUNT(*) FROM bank_transactions WHERE transaction_type = 'unclassified';
```

---

## Expense Categories (seeded)

Only `applies_to IN ('operations','both')` are shown in entry forms:

| Code | Name | Group |
|------|------|-------|
| ad_spend | Ad Spend | marketing |
| bank_charges | Bank Charges | opex |
| customer_refund | Customer Refund | opex |
| logistics_inbound | Logistics Inbound | cogs |
| misc | Miscellaneous | opex |
| platform_saas | Platform & SaaS | opex |
| shipping_inbound | Shipping Inbound | cogs |
| shipping_outbound | Shipping Outbound | cogs |
| website | Website | opex |

---

## Files Changed

| File | Purpose |
|------|---------|
| `supabase/migrations/20260620_expense_intelligence.sql` | Schema ALTER + 9 RPCs |
| `frontend/src/types/kpi.ts` | 6 new expense types |
| `frontend/src/lib/data/expenses.ts` | 8 data fetcher functions |
| `frontend/src/lib/hooks/use-expenses.ts` | 7 React Query hooks |
| `frontend/src/app/dashboard/expenses/page.tsx` | Expense Master page |
| `frontend/src/app/dashboard/expense-entry/page.tsx` | Manual expense entry form |
| `frontend/src/app/dashboard/bank-classification/page.tsx` | Bank classification UI |
| `frontend/src/features/director/business-summary.tsx` | Finance insights section |
| `frontend/src/components/layout/sidebar.tsx` | Expenses group + font size increase |
| `frontend/src/components/layout/dashboard-shell.tsx` | Mobile nav drawer |
| `frontend/src/components/layout/top-bar.tsx` | Hamburger menu button |
| `frontend/src/app/globals.css` | Light mode background darkened |
