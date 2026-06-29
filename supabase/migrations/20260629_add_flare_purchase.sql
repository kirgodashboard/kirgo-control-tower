-- Add Kirgo Flare purchase order — not yet paid, not yet delivered.
-- Details to be confirmed; inserted as status='ordered' so it appears
-- in the Purchases register. Update invoice_number, subtotal_foreign,
-- total_foreign, fx_rate_inr, total_inr once the XLS is confirmed.

INSERT INTO purchase_orders (
  launch_id, supplier_name, invoice_number, invoice_date,
  currency, subtotal_foreign, shipping_cost_foreign, total_foreign,
  fx_rate_inr, total_inr, payment_terms, payment_method, status
)
VALUES (
  NULL,                   -- link to launch when created
  'TBD',                  -- update with actual supplier name from invoice
  'FLARE-PO-001',         -- update with actual invoice number
  '2026-06-01',           -- update with actual invoice date
  'USD',
  0,                      -- update subtotal from invoice
  0,                      -- update shipping from invoice
  0,                      -- update total from invoice
  85.00,                  -- approximate fx rate; update with actual
  0,                      -- update INR total (total_foreign * fx_rate)
  '30% deposit, 70% on delivery',
  'bank_transfer',
  'ordered'               -- not paid, not shipped
)
ON CONFLICT DO NOTHING;
