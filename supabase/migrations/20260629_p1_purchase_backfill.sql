-- ═══════════════════════════════════════════════════════════════════
-- P1 Fix: Purchase register — backfill + add missing CLASSIC PO
-- Source: PURCHASE & EXPENSES.xlsx + invoice PDFs
--
-- PO 1: CORE    — Burning Active Apparel, 2025-10-06, USD 4228.60
-- PO 2: SUMMER  — Shanghai Jspeed,        2024-08-28, USD 6120.00
-- PO 3: CLASSIC — ABC (ASTSW Sport),      2022-11-09, USD 6750.00  ← MISSING
--
-- FX rates (approximate mid-rate at invoice date):
--   2022-11-09: 1 USD ≈ ₹81.50
--   2024-08-28: 1 USD ≈ ₹83.80
--   2025-10-06: 1 USD ≈ ₹83.90
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Backfill invoice_date + FX + total_inr on existing POs ─────
-- Match by supplier name substring; safe even if IDs differ from assumptions.
UPDATE purchase_orders SET
  invoice_date   = '2024-08-28',
  fx_rate_inr    = 83.80,
  total_inr      = ROUND(COALESCE(total_foreign, 6120.00) * 83.80, 2),
  invoice_number = COALESCE(invoice_number, 'JSKS-240801')
WHERE supplier_name ILIKE '%jspeed%' OR supplier_name ILIKE '%shanghai%';   -- SUMMER

UPDATE purchase_orders SET
  invoice_date   = '2025-10-06',
  fx_rate_inr    = 83.90,
  total_inr      = ROUND(COALESCE(total_foreign, 4228.60) * 83.90, 2),
  invoice_number = COALESCE(invoice_number, 'BURN-251006')
WHERE supplier_name ILIKE '%burning%' OR supplier_name ILIKE '%active apparel%';  -- CORE

-- ── 2. Insert missing CLASSIC purchase order ───────────────────────
INSERT INTO purchase_orders
  (invoice_number, invoice_date, supplier_name, currency,
   subtotal_foreign, total_foreign,
   fx_rate_inr, total_inr, status, payment_terms)
VALUES
  ('ASTSW-221109', '2022-11-09',
   'ASTSW Sport (ABC)', 'USD',
   5850.00,   -- bra 450×6.20 + legging 450×6.80 = 2790+3060 (excl. $900 sea freight)
   6750.00,   -- goods $5,850 + sea freight $900
   81.50,
   ROUND(6750.00 * 81.50, 2),   -- ₹5,50,125
   'received',
   'Deposit 30% / Balance 70%')
ON CONFLICT DO NOTHING;

-- ── 3. Backfill order lines (items) for all 3 POs ─────────────────
-- SUMMER (PO id=1): Pink Bra 400×$5.15, Pink Legging 400×$5.80, Black Legging 300×$5.80
DO $$ DECLARE po_id int := 1; BEGIN
  IF NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE purchase_order_id = po_id) THEN
    INSERT INTO purchase_order_lines (purchase_order_id, description, quantity, unit_price_foreign, line_total_foreign)
    VALUES
      (po_id, 'Sports Bra — Pink (S100 M100 L100 XL100)',      400, 5.15, 2060.00),
      (po_id, 'Legging — Pink (S100 M100 L100 XL100)',         400, 5.80, 2320.00),
      (po_id, 'Legging — Black (S100 M100 XL100)',             300, 5.80, 1740.00);
  END IF;
END $$;

-- CORE (PO id=2): Blue Bra 100×$9, Blue Legging 100×$9
DO $$ DECLARE po_id int := 2; BEGIN
  IF NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE purchase_order_id = po_id) THEN
    INSERT INTO purchase_order_lines (purchase_order_id, description, quantity, unit_price_foreign, line_total_foreign)
    VALUES
      (po_id, 'Sports Bra — Blue (100 units)',    100, 9.00, 900.00),
      (po_id, 'Legging — Blue (100 units)',        100, 9.00, 900.00);
  END IF;
END $$;

-- CLASSIC (PO id=3): Black Bra 450×$6.20, Black Legging 450×$6.80
DO $$ DECLARE po_id int; BEGIN
  SELECT id INTO po_id FROM purchase_orders WHERE invoice_number = 'ASTSW-221109';
  IF po_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE purchase_order_id = po_id) THEN
    INSERT INTO purchase_order_lines (purchase_order_id, description, quantity, unit_price_foreign, line_total_foreign)
    VALUES
      (po_id, 'Sports Bra — Black (S100 M100 L150 XL100)',   450, 6.20, 2790.00),
      (po_id, 'Legging — Black (S100 M100 L150 XL100)',      450, 6.80, 3060.00);
  END IF;
END $$;
