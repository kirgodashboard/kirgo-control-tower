-- ============================================================
-- KIRGO BANK TRANSACTION CLASSIFICATIONS
-- Generated: 2026-06-20  (rewritten to match actual schema)
--
-- bank_transactions does NOT have category_id.
-- Columns available: transaction_type, counterparty, notes
--
-- PART 1: Bulk type updates (run this — no category IDs needed)
-- PART 2: classify_bank_transaction() calls to create expense records
--         (only run after verifying Step 1 query from expense_categories)
--
-- Allowed transaction_type values:
--   gateway_settlement | cod_remittance | shiprocket_recharge | courier_payment
--   ad_spend_meta | ad_spend_google | saas_subscription | customer_refund
--   bank_charge | supplier_payment | founder_transfer | fx_loss
--   inventory_write_off | miscellaneous | unclassified
-- ============================================================


-- ============================================================
-- PART 1: TRANSACTION TYPE UPDATES
-- Run this entire block. No category IDs needed.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. SHIPROCKET RECHARGES (~47 rows, all BIGFOOT RETAIL)
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'shiprocket_recharge',
    counterparty     = 'Shiprocket (Bigfoot Retail Solutions)',
    notes            = 'Shiprocket wallet recharge'
WHERE narration_raw ILIKE '%BIGFOOT RETA%'
   OR narration_raw ILIKE '%BIGFOOT RETAIL%'
   OR narration_raw ILIKE '%RAZ*SHIPROCKET%'
   OR narration_raw ILIKE '%PAY*SHIPROCKET%'
   OR narration_raw ILIKE '%SHIPROCKET RECHARG%';

-- ----------------------------------------------------------
-- 2. CUSTOMER REFUNDS
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'customer_refund',
    counterparty     = 'Customer',
    notes            = 'Customer refund — WooCommerce order'
WHERE narration_raw ILIKE '%KIRGO REFUND%'
   OR narration_raw ILIKE '%KIRGO SPORTS BRA R%';

-- ----------------------------------------------------------
-- 3. VENDOR / SUPPLIER PAYMENTS (COGS — stock purchases)
--    139: Shanghai JSpeed Advance 1,    Jul 2024, ₹1,73,455
--    198: Shanghai JSpeed Advance 2,    Sep 2024, ₹1,85,975
--    287: Shanghai JSpeed Advance 3+4,  Mar 2025, ₹3,67,054
--    434: Burning Active Apparel Adv 1, Oct 2025, ₹1,17,522
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'supplier_payment',
    counterparty     = CASE id
                         WHEN 139 THEN 'Shanghai JSpeed Industry'
                         WHEN 198 THEN 'Shanghai JSpeed Industry'
                         WHEN 287 THEN 'Shanghai JSpeed Industry'
                         WHEN 434 THEN 'Burning Active Apparel'
                       END,
    notes            = CASE id
                         WHEN 139 THEN 'Classic/Summer stock — Advance 1 | Jul 2024'
                         WHEN 198 THEN 'Classic/Summer stock — Advance 2 | Sep 2024'
                         WHEN 287 THEN 'Classic/Summer stock — Advance 3+4 | Mar 2025'
                         WHEN 434 THEN 'Core collection stock — Advance 1 | Oct 2025'
                       END
WHERE id IN (139, 198, 287, 434);

-- ----------------------------------------------------------
-- 4. COURIER / SAMPLE SHIPPING (DHL, FedEx, Delhivery)
--    391: DHL CORE samples China→India,   Sep 2025, ₹2,848
--    422: DHL CORE shipping/customs,      Oct 2025, ₹3,252
--    363: FedEx sample,                   Jul 2025, ₹1,812
--    409: FedEx CORE sample,              Sep 2025, ₹1,398
--    207: FedEx sample,                   Sep 2024, ₹1,290
--    126: Delhivery logistics,            Jun 2024, ₹195
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'courier_payment',
    counterparty     = CASE id
                         WHEN 391 THEN 'DHL Express'
                         WHEN 422 THEN 'DHL Express'
                         WHEN 363 THEN 'FedEx'
                         WHEN 409 THEN 'FedEx Express'
                         WHEN 207 THEN 'FedEx'
                         WHEN 126 THEN 'Delhivery'
                       END,
    notes            = CASE id
                         WHEN 391 THEN 'Samples China→India — CORE | Sep 2025'
                         WHEN 422 THEN 'Shipping/customs — CORE | Oct 2025'
                         WHEN 363 THEN 'Sample shipping | Jul 2025'
                         WHEN 409 THEN 'Sample shipping — CORE | Sep 2025'
                         WHEN 207 THEN 'Sample shipping | Sep 2024'
                         WHEN 126 THEN 'Delhivery logistics charge | Jun 2024'
                       END
WHERE id IN (391, 422, 363, 409, 207, 126);

-- ----------------------------------------------------------
-- 5. SAAS / TECH SUBSCRIPTIONS
--    261: GoDaddy domain renewal,           Jan 2025, ₹6,403
--    396: Google Workspace,                 Sep 2025, ₹2
--    398: Google Workspace,                 Sep 2025, ₹1,227
--    425: Google Workspace,                 Oct 2025, ₹1,227
--    22:  PayPal *M4GJ SaaS (quarterly),   Jan 2024, ₹2,357
--    63:  PayPal *M4GJ SaaS,               Mar 2024, ₹2,630
--    112: PayPal *M4GJ SaaS,               Jun 2024, ₹2,629
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'saas_subscription',
    counterparty     = CASE id
                         WHEN 261 THEN 'GoDaddy'
                         WHEN 396 THEN 'Google Workspace'
                         WHEN 398 THEN 'Google Workspace'
                         WHEN 425 THEN 'Google Workspace'
                         WHEN 22  THEN 'PayPal *M4GJ (SaaS tool)'
                         WHEN 63  THEN 'PayPal *M4GJ (SaaS tool)'
                         WHEN 112 THEN 'PayPal *M4GJ (SaaS tool)'
                       END,
    notes            = CASE id
                         WHEN 261 THEN 'Website domain renewal | Jan 2025'
                         WHEN 396 THEN 'Google Workspace subscription | Sep 2025'
                         WHEN 398 THEN 'Google Workspace subscription | Sep 2025'
                         WHEN 425 THEN 'Google Workspace subscription | Oct 2025'
                         WHEN 22  THEN 'Recurring SaaS subscription (foreign vendor) | Jan 2024'
                         WHEN 63  THEN 'Recurring SaaS subscription (foreign vendor) | Mar 2024'
                         WHEN 112 THEN 'Recurring SaaS subscription (foreign vendor) | Jun 2024'
                       END
WHERE id IN (261, 396, 398, 425, 22, 63, 112);

-- ----------------------------------------------------------
-- 6. FOUNDER / PROPRIETOR / CAPITAL TRANSFERS (balance sheet, not P&L)
--    180: Siddharth Bajpai investor advance,  Aug 2024, ₹1,00,000
--    240: Siddharth Bajpai investor advance,  Nov 2024, ₹5,300
--    315: Kanika→Chrisann personal advance,   May 2025, ₹60,000
--    365: Kanika proprietor capital,          Jul 2025, ₹1,00,000
--    377: Kanika proprietor capital,          Aug 2025, ₹50,000
--    379: Kanika proprietor capital,          Aug 2025, ₹1,00,000
--    380: Kanika proprietor capital,          Aug 2025, ₹1,00,000
--    386: Kanika proprietor capital,          Aug 2025, ₹8,000
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'founder_transfer',
    counterparty     = CASE id
                         WHEN 180 THEN 'Siddharth Bajpai'
                         WHEN 240 THEN 'Siddharth Bajpai'
                         WHEN 315 THEN 'Chrisann Rodrigues (personal)'
                         WHEN 365 THEN 'Kanika Rodrigues (proprietor)'
                         WHEN 377 THEN 'Kanika Rodrigues (proprietor)'
                         WHEN 379 THEN 'Kanika Rodrigues (proprietor)'
                         WHEN 380 THEN 'Kanika Rodrigues (proprietor)'
                         WHEN 386 THEN 'Kanika Rodrigues (proprietor)'
                       END,
    notes            = CASE id
                         WHEN 180 THEN 'Investor advance from Siddharth Bajpai to Kanika | Aug 2024'
                         WHEN 240 THEN 'Investor advance from Siddharth Bajpai | Nov 2024'
                         WHEN 315 THEN 'Personal advance Kanika→Chrisann (not business expense) | May 2025'
                         WHEN 365 THEN 'Proprietor capital — Kanika invested in business systems | Jul 2025'
                         WHEN 377 THEN 'Proprietor capital — Kanika | Aug 2025'
                         WHEN 379 THEN 'Proprietor capital — Kanika | Aug 2025'
                         WHEN 380 THEN 'Proprietor capital — Kanika | Aug 2025'
                         WHEN 386 THEN 'Proprietor capital — Kanika | Aug 2025'
                       END
WHERE id IN (180, 240, 315, 365, 377, 379, 380, 386);

-- ----------------------------------------------------------
-- 7. MISCELLANEOUS — Marketing, design, model, legal, packaging, sourcing
--    These need expense records created via classify_bank_transaction()
--    (see PART 2 below). Marking type here so they leave the unclassified queue.
--    272: Lighting equipment — Summer shoot     Feb 2025  ₹13,500
--    273: MUA — Summer shoot                    Feb 2025  ₹6,000
--    274: Photographer Scott Francis            Mar 2025  ₹32,000
--    275: HMU assistant Priyanka Meena          Mar 2025  ₹2,000
--    270: Travel Cleartrip (shoot)              Feb 2025  ₹5,422
--    277: Travel Cleartrip (shoot)              Mar 2025  ₹3,596
--    414: Studio Independent CORE shoot         Sep 2025  ₹17,700
--    436: Photographer Chrisann CORE            Oct 2025  ₹40,000
--    271: Model fee Amisha Anil Gurbani         Feb 2025  ₹28,500
--    157: Swathy M K tech pack                  Aug 2024  ₹2,500
--    176: Swathy M K design                     Aug 2024  ₹2,500
--    313: Swathy M K CORE prep                  May 2025  ₹4,000
--    347: Swathy M K CORE                       Jul 2025  ₹4,000
--    269: Custom packaging (PayPal ₹18,254)     Feb 2025  ₹18,254
--    336: Vakilsearch trademark filing           Jun 2025  ₹1,499
--    341: Vakilsearch trademark registration    Jun 2025  ₹4,707
--    418: Virgio fabric/sample sourcing         Sep 2025  ₹3,390
-- ----------------------------------------------------------
UPDATE bank_transactions
SET transaction_type = 'miscellaneous',
    counterparty     = CASE id
                         WHEN 272 THEN 'Kanika Rodrigues (reimbursement)'
                         WHEN 273 THEN 'MUA / Kanika Rodrigues'
                         WHEN 274 THEN 'Scott Francis'
                         WHEN 275 THEN 'Priyanka Meena'
                         WHEN 270 THEN 'Cleartrip'
                         WHEN 277 THEN 'Cleartrip'
                         WHEN 414 THEN 'Studio Independent'
                         WHEN 436 THEN 'Chrisann Rodrigues'
                         WHEN 271 THEN 'Amisha Anil Gurbani'
                         WHEN 157 THEN 'Swathy M K'
                         WHEN 176 THEN 'Swathy M K'
                         WHEN 313 THEN 'Swathy M K'
                         WHEN 347 THEN 'Swathy M K'
                         WHEN 269 THEN 'Packaging vendor (PayPal *M4GJ)'
                         WHEN 336 THEN 'Vakilsearch'
                         WHEN 341 THEN 'Vakilsearch'
                         WHEN 418 THEN 'Virgio'
                       END,
    notes            = CASE id
                         WHEN 272 THEN 'Lighting equipment — Summer shoot | Feb 2025'
                         WHEN 273 THEN 'MUA — Summer photoshoot | Feb 2025'
                         WHEN 274 THEN 'Photographer — Summer shoot (KIRGO SHOOT 2) | Mar 2025'
                         WHEN 275 THEN 'HMU assistant — Summer shoot | Mar 2025'
                         WHEN 270 THEN 'Travel — Summer shoot (Cleartrip) | Feb 2025'
                         WHEN 277 THEN 'Travel — Summer shoot (Cleartrip) | Mar 2025'
                         WHEN 414 THEN 'Studio hire — CORE shoot | Sep 2025'
                         WHEN 436 THEN 'Photographer — CORE shoot | Oct 2025'
                         WHEN 271 THEN 'Model fee — photoshoot | Feb 2025'
                         WHEN 157 THEN 'Tech pack / fashion design — Classic | Aug 2024'
                         WHEN 176 THEN 'Fashion design — Classic | Aug 2024'
                         WHEN 313 THEN 'Fashion design — CORE prep | May 2025'
                         WHEN 347 THEN 'Fashion design — CORE | Jul 2025'
                         WHEN 269 THEN 'Custom packaging — ₹18,254 exact match in Excel | Feb 2025'
                         WHEN 336 THEN 'Trademark filing (partial) | Jun 2025'
                         WHEN 341 THEN 'Trademark registration | Jun 2025'
                         WHEN 418 THEN 'Fabric / sample sourcing | Sep 2025'
                       END
WHERE id IN (272, 273, 274, 275, 270, 277, 414, 436, 271, 157, 176, 313, 347, 269, 336, 341, 418);

-- ----------------------------------------------------------
-- VERIFY BEFORE COMMIT
-- ----------------------------------------------------------
SELECT
  transaction_type,
  COUNT(*) AS count
FROM bank_transactions
GROUP BY transaction_type
ORDER BY count DESC;

COMMIT;


-- ============================================================
-- PART 2: CREATE EXPENSE RECORDS
-- Run AFTER Part 1 and AFTER running:
--   SELECT id, name FROM expense_categories ORDER BY name;
--
-- Replace the category_id values below with real IDs from your
-- expense_categories table. The ILIKE subqueries will auto-resolve
-- if you have matching category names.
--
-- classify_bank_transaction(transaction_id, category_id, vendor, description, notes)
-- ============================================================

-- Step A: Check which category_id values will be used
SELECT
  'VENDOR_PAYMENT' AS usage,
  id, name
FROM expense_categories
WHERE name ILIKE '%supplier%' OR name ILIKE '%vendor%' OR name ILIKE '%cogs%'
   OR name ILIKE '%inventor%' OR name ILIKE '%import%' OR name ILIKE '%stock%'
UNION ALL
SELECT 'MARKETING', id, name FROM expense_categories
WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' OR name ILIKE '%content%'
UNION ALL
SELECT 'DESIGN', id, name FROM expense_categories
WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%'
UNION ALL
SELECT 'LEGAL', id, name FROM expense_categories
WHERE name ILIKE '%legal%' OR name ILIKE '%trademark%'
UNION ALL
SELECT 'PACKAGING', id, name FROM expense_categories
WHERE name ILIKE '%packag%'
ORDER BY 1, name;

-- Step B: Expense records for vendor payments (COGS)
-- Each call creates 1 row in expenses + marks the bank_transaction
SELECT classify_bank_transaction(139, (SELECT id FROM expense_categories WHERE name ILIKE '%supplier%' OR name ILIKE '%cogs%' OR name ILIKE '%import%' OR name ILIKE '%vendor%' ORDER BY name LIMIT 1), 'Shanghai JSpeed Industry',       'ADVANCE PAYMENT OF IMPORT BILL', 'Classic/Summer stock — Advance 1 | Jul 2024');
SELECT classify_bank_transaction(198, (SELECT id FROM expense_categories WHERE name ILIKE '%supplier%' OR name ILIKE '%cogs%' OR name ILIKE '%import%' OR name ILIKE '%vendor%' ORDER BY name LIMIT 1), 'Shanghai JSpeed Industry',       'ADVANCE PAYMENT OF IMPORT BILL', 'Classic/Summer stock — Advance 2 | Sep 2024');
SELECT classify_bank_transaction(287, (SELECT id FROM expense_categories WHERE name ILIKE '%supplier%' OR name ILIKE '%cogs%' OR name ILIKE '%import%' OR name ILIKE '%vendor%' ORDER BY name LIMIT 1), 'Shanghai JSpeed Industry',       'ADVANCE PAYMENT OF IMPORT BILL', 'Classic/Summer stock — Advance 3+4 | Mar 2025');
SELECT classify_bank_transaction(434, (SELECT id FROM expense_categories WHERE name ILIKE '%supplier%' OR name ILIKE '%cogs%' OR name ILIKE '%import%' OR name ILIKE '%vendor%' ORDER BY name LIMIT 1), 'Burning Active Apparel',          'ADVANCE PAYMENT OF IMPORT BILL', 'Core collection stock — Advance 1 | Oct 2025');

-- Step C: Expense records for marketing / photoshoots
SELECT classify_bank_transaction(272, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Kanika Rodrigues',   'Lighting equipment reimbursement', 'Summer shoot | Feb 2025');
SELECT classify_bank_transaction(273, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'MUA',                'MUA — photoshoot',                 'Summer shoot | Feb 2025');
SELECT classify_bank_transaction(274, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Scott Francis',       'Photography fee',                  'Summer shoot (KIRGO SHOOT 2) | Mar 2025');
SELECT classify_bank_transaction(275, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Priyanka Meena',     'HMU assistant',                    'Summer shoot | Mar 2025');
SELECT classify_bank_transaction(270, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%travel%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Cleartrip',         'Travel — shoot',                   'Summer shoot | Feb 2025');
SELECT classify_bank_transaction(277, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%travel%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Cleartrip',         'Travel — shoot',                   'Summer shoot | Mar 2025');
SELECT classify_bank_transaction(271, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%model%'  OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Amisha Anil Gurbani','Model fee',                       'Photoshoot | Feb 2025');
SELECT classify_bank_transaction(414, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Studio Independent', 'Studio hire',                      'CORE shoot | Sep 2025');
SELECT classify_bank_transaction(436, (SELECT id FROM expense_categories WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%' ORDER BY name LIMIT 1), 'Chrisann Rodrigues', 'Photography fee',                  'CORE shoot | Oct 2025');

-- Step D: Design / freelance
SELECT classify_bank_transaction(157, (SELECT id FROM expense_categories WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%' ORDER BY name LIMIT 1), 'Swathy M K', 'Tech pack / fashion design', 'Classic collection | Aug 2024');
SELECT classify_bank_transaction(176, (SELECT id FROM expense_categories WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%' ORDER BY name LIMIT 1), 'Swathy M K', 'Fashion design',             'Classic collection | Aug 2024');
SELECT classify_bank_transaction(313, (SELECT id FROM expense_categories WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%' ORDER BY name LIMIT 1), 'Swathy M K', 'Fashion design',             'CORE collection prep | May 2025');
SELECT classify_bank_transaction(347, (SELECT id FROM expense_categories WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%' ORDER BY name LIMIT 1), 'Swathy M K', 'Fashion design',             'CORE collection | Jul 2025');

-- Step E: Packaging
SELECT classify_bank_transaction(269, (SELECT id FROM expense_categories WHERE name ILIKE '%packag%' ORDER BY name LIMIT 1), 'Packaging vendor (PayPal *M4GJ)', 'Custom packaging', 'Exact ₹18,254 match in Excel | Feb 2025');

-- Step F: Legal
SELECT classify_bank_transaction(336, (SELECT id FROM expense_categories WHERE name ILIKE '%legal%' OR name ILIKE '%trademark%' OR name ILIKE '%complian%' ORDER BY name LIMIT 1), 'Vakilsearch', 'Trademark filing',        'Partial | Jun 2025');
SELECT classify_bank_transaction(341, (SELECT id FROM expense_categories WHERE name ILIKE '%legal%' OR name ILIKE '%trademark%' OR name ILIKE '%complian%' ORDER BY name LIMIT 1), 'Vakilsearch', 'Trademark registration',  'Jun 2025');

-- Step G: Sourcing / design
SELECT classify_bank_transaction(418, (SELECT id FROM expense_categories WHERE name ILIKE '%design%' OR name ILIKE '%sourcing%' OR name ILIKE '%sample%' OR name ILIKE '%freelanc%' ORDER BY name LIMIT 1), 'Virgio', 'Fabric / sample sourcing', 'Sep 2025');
