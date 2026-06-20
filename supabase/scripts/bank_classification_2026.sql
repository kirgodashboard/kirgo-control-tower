-- ============================================================
-- KIRGO BANK TRANSACTION CLASSIFICATIONS
-- Generated: 2026-06-20
-- Source: Excel PURCHASE & EXPENSES + bank statement correlation
--
-- HOW TO RUN:
--   1. Run STEP 1 (verification query) — share output if anything looks wrong
--   2. If category mappings look right, run STEP 2 (all UPDATE blocks)
--   3. The script is wrapped in BEGIN/COMMIT — it's atomic
-- ============================================================


-- ============================================================
-- STEP 1: VERIFY CATEGORY MAPPING
-- Run this first. Check the mapped_type column makes sense.
-- ============================================================
SELECT
  id AS category_id,
  name AS category_name,
  CASE
    WHEN name ILIKE '%import%' OR name ILIKE '%vendor%' OR name ILIKE '%cogs%'
      OR name ILIKE '%inventor%' OR name ILIKE '%purchase%' OR name ILIKE '%stock%'  THEN '→ VENDOR_PAYMENT'
    WHEN name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%shoot%'
      OR name ILIKE '%brand%' OR name ILIKE '%content%' OR name ILIKE '%advertis%'   THEN '→ MARKETING'
    WHEN name ILIKE '%logistic%' OR name ILIKE '%shipping%' OR name ILIKE '%courier%'
      OR name ILIKE '%freight%' OR name ILIKE '%delivery%'                           THEN '→ LOGISTICS'
    WHEN name ILIKE '%tech%' OR name ILIKE '%software%' OR name ILIKE '%subscr%'
      OR name ILIKE '%domain%' OR name ILIKE '%saas%' OR name ILIKE '%tool%'        THEN '→ TECHNOLOGY'
    WHEN name ILIKE '%legal%' OR name ILIKE '%trademark%' OR name ILIKE '%complian%' THEN '→ LEGAL'
    WHEN name ILIKE '%packag%'                                                        THEN '→ PACKAGING'
    WHEN name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%' THEN '→ DESIGN'
    WHEN name ILIKE '%capital%' OR name ILIKE '%proprietor%' OR name ILIKE '%owner%'
      OR name ILIKE '%personal%' OR name ILIKE '%drawing%' OR name ILIKE '%loan%'   THEN '→ OWNER_CAPITAL'
    WHEN name ILIKE '%refund%' OR name ILIKE '%return%'                              THEN '→ CUSTOMER_REFUND'
    ELSE '? UNMAPPED'
  END AS mapped_type
FROM expense_categories
ORDER BY mapped_type, name;


-- ============================================================
-- STEP 2: CLASSIFY TRANSACTIONS
-- Only run after verifying Step 1 output looks correct.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- A. VENDOR PAYMENTS — Stock purchase imports (COGS)
--    139: SUMMER Advance 1, Shanghai JSpeed, Jul 2024, ₹1,73,455
--    198: SUMMER Advance 2, Shanghai JSpeed, Sep 2024, ₹1,85,975
--    287: SUMMER Advance 3+4, Shanghai JSpeed, Mar 2025, ₹3,67,054
--    434: CORE Advance 1, Burning Active Apparel, Oct 2025, ₹1,17,522
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%import%' OR name ILIKE '%vendor%' OR name ILIKE '%cogs%'
                    OR name ILIKE '%inventor%' OR name ILIKE '%stock%' ORDER BY name LIMIT 1),
  vendor      = CASE id
                  WHEN 139 THEN 'Shanghai JSpeed Industry'
                  WHEN 198 THEN 'Shanghai JSpeed Industry'
                  WHEN 287 THEN 'Shanghai JSpeed Industry'
                  WHEN 434 THEN 'Burning Active Apparel'
                END,
  notes       = CASE id
                  WHEN 139 THEN 'Classic/Summer stock — Advance 1 | Jul 2024'
                  WHEN 198 THEN 'Classic/Summer stock — Advance 2 | Sep 2024'
                  WHEN 287 THEN 'Classic/Summer stock — Advance 3+4 | Mar 2025'
                  WHEN 434 THEN 'Core collection — Advance 1 | Oct 2025'
                END,
  is_classified = true
WHERE id IN (139, 198, 287, 434);

-- ----------------------------------------------------------
-- B. MARKETING — Photoshoots, studio, travel
--    272: Lighting equipment, Kanika reimbursement, Feb 2025, ₹13,500
--    273: MUA Summer shoot, Feb 2025, ₹6,000
--    274: Photographer Scott Francis, Mar 2025, ₹32,000
--    275: HMU assistant Priyanka Meena, Mar 2025, ₹2,000
--    270: Travel Cleartrip (shoot), Feb 2025, ₹5,422
--    277: Travel Cleartrip (shoot), Mar 2025, ₹3,596
--    414: Studio Independent CORE shoot, Sep 2025, ₹17,700
--    436: Photographer Chrisann Rodrigues CORE, Oct 2025, ₹40,000
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%market%' OR name ILIKE '%photo%' OR name ILIKE '%brand%'
                    OR name ILIKE '%content%' ORDER BY name LIMIT 1),
  vendor      = CASE id
                  WHEN 272 THEN 'Kanika Rodrigues (reimbursement)'
                  WHEN 273 THEN 'MUA / Kanika Rodrigues'
                  WHEN 274 THEN 'Scott Francis'
                  WHEN 275 THEN 'Priyanka Meena'
                  WHEN 270 THEN 'Cleartrip'
                  WHEN 277 THEN 'Cleartrip'
                  WHEN 414 THEN 'Studio Independent'
                  WHEN 436 THEN 'Chrisann Rodrigues'
                END,
  notes       = CASE id
                  WHEN 272 THEN 'Lighting equipment — Summer shoot | Feb 2025'
                  WHEN 273 THEN 'MUA — Summer photoshoot | Feb 2025'
                  WHEN 274 THEN 'Photographer — Summer shoot (KIRGO SHOOT 2) | Mar 2025'
                  WHEN 275 THEN 'HMU assistant — Summer shoot | Mar 2025'
                  WHEN 270 THEN 'Travel — Summer shoot (Cleartrip) | Feb 2025'
                  WHEN 277 THEN 'Travel — Summer shoot (Cleartrip) | Mar 2025'
                  WHEN 414 THEN 'Studio hire — CORE shoot | Sep 2025'
                  WHEN 436 THEN 'Photographer — CORE shoot | Oct 2025'
                END,
  is_classified = true
WHERE id IN (272, 273, 274, 275, 270, 277, 414, 436);

-- ----------------------------------------------------------
-- C. TALENT / MODEL FEE
--    271: Amisha Anil Gurbani (model), Feb 2025, ₹28,500
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%market%' OR name ILIKE '%talent%' OR name ILIKE '%model%'
                    OR name ILIKE '%brand%' ORDER BY name LIMIT 1),
  vendor      = 'Amisha Anil Gurbani',
  notes       = 'Model fee — photoshoot | Feb 2025',
  is_classified = true
WHERE id = 271;

-- ----------------------------------------------------------
-- D. DESIGN — Fashion designer / tech pack
--    157: Swathy M K tech pack, Aug 2024, ₹2,500
--    176: Swathy M K design, Aug 2024, ₹2,500
--    313: Swathy M K CORE prep, May 2025, ₹4,000
--    347: Swathy M K CORE, Jul 2025, ₹4,000
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%design%' OR name ILIKE '%freelanc%' OR name ILIKE '%consultan%'
                 ORDER BY name LIMIT 1),
  vendor      = 'Swathy M K',
  notes       = CASE id
                  WHEN 157 THEN 'Tech pack / fashion design — Classic | Aug 2024'
                  WHEN 176 THEN 'Fashion design — Classic | Aug 2024'
                  WHEN 313 THEN 'Fashion design — CORE prep | May 2025'
                  WHEN 347 THEN 'Fashion design — CORE | Jul 2025'
                END,
  is_classified = true
WHERE id IN (157, 176, 313, 347);

-- ----------------------------------------------------------
-- E. LOGISTICS — Sample shipping (DHL, FedEx, Delhivery)
--    391: DHL CORE samples, Sep 2025, ₹2,848
--    422: DHL CORE shipping, Oct 2025, ₹3,252
--    363: FedEx sample, Jul 2025, ₹1,812
--    409: FedEx CORE sample, Sep 2025, ₹1,398
--    207: FedEx sample, Sep 2024, ₹1,290
--    126: Delhivery, Jun 2024, ₹195
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%logistic%' OR name ILIKE '%shipping%' OR name ILIKE '%courier%'
                    OR name ILIKE '%freight%' OR name ILIKE '%delivery%' ORDER BY name LIMIT 1),
  vendor      = CASE id
                  WHEN 391 THEN 'DHL Express'
                  WHEN 422 THEN 'DHL Express'
                  WHEN 363 THEN 'FedEx'
                  WHEN 409 THEN 'FedEx Express'
                  WHEN 207 THEN 'FedEx'
                  WHEN 126 THEN 'Delhivery'
                END,
  notes       = CASE id
                  WHEN 391 THEN 'Samples China→India — CORE | Sep 2025'
                  WHEN 422 THEN 'Shipping/customs — CORE | Oct 2025'
                  WHEN 363 THEN 'Sample shipping | Jul 2025'
                  WHEN 409 THEN 'Sample shipping — CORE | Sep 2025'
                  WHEN 207 THEN 'Sample shipping | Sep 2024'
                  WHEN 126 THEN 'Delhivery logistics charge | Jun 2024'
                END,
  is_classified = true
WHERE id IN (391, 422, 363, 409, 207, 126);

-- ----------------------------------------------------------
-- F. LOGISTICS — Shiprocket recharges (all BIGFOOT RETAIL entries, ~47 rows)
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%logistic%' OR name ILIKE '%shipping%' OR name ILIKE '%courier%'
                    OR name ILIKE '%freight%' ORDER BY name LIMIT 1),
  vendor      = 'Shiprocket (Bigfoot Retail Solutions)',
  notes       = 'Shiprocket wallet recharge',
  is_classified = true
WHERE narration_raw ILIKE '%BIGFOOT RETA%'
   OR narration_raw ILIKE '%BIGFOOT RETAIL%'
   OR narration_raw ILIKE '%SHIPROCKET%'
   OR narration_raw ILIKE '%RAZ*SHIPROCKET%';

-- ----------------------------------------------------------
-- G. TECHNOLOGY — GoDaddy, Google Workspace
--    261: GoDaddy domain renewal, Jan 2025, ₹6,403
--    396, 398, 425: Google Workspace, Sep-Oct 2025, ₹2 + ₹1,227 + ₹1,227
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%tech%' OR name ILIKE '%software%' OR name ILIKE '%subscr%'
                    OR name ILIKE '%domain%' OR name ILIKE '%saas%' ORDER BY name LIMIT 1),
  vendor      = CASE id
                  WHEN 261 THEN 'GoDaddy'
                  WHEN 396 THEN 'Google Workspace'
                  WHEN 398 THEN 'Google Workspace'
                  WHEN 425 THEN 'Google Workspace'
                END,
  notes       = CASE id
                  WHEN 261 THEN 'Website domain renewal | Jan 2025'
                  WHEN 396 THEN 'Google Workspace subscription | Sep 2025'
                  WHEN 398 THEN 'Google Workspace subscription | Sep 2025'
                  WHEN 425 THEN 'Google Workspace subscription | Oct 2025'
                END,
  is_classified = true
WHERE id IN (261, 396, 398, 425);

-- ----------------------------------------------------------
-- H. TECHNOLOGY — PayPal *M4GJ recurring SaaS (~₹2,600/quarter)
--    ids 22, 63, 112 (small entries only — guard excludes ₹18,254 packaging)
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%tech%' OR name ILIKE '%software%' OR name ILIKE '%subscr%'
                    OR name ILIKE '%saas%' ORDER BY name LIMIT 1),
  vendor      = 'PayPal *M4GJ (SaaS tool)',
  notes       = 'Recurring SaaS subscription (foreign vendor)',
  is_classified = true
WHERE id IN (22, 63, 112)
  AND withdrawal_inr < 5000;

-- ----------------------------------------------------------
-- I. PACKAGING — Custom packaging (PayPal ₹18,254 — exact Excel match)
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%packag%' ORDER BY name LIMIT 1),
  vendor      = 'Packaging vendor (PayPal *M4GJ)',
  notes       = 'Custom packaging — exact ₹18,254 match in Excel | Feb 2025',
  is_classified = true
WHERE id = 269;

-- ----------------------------------------------------------
-- J. LEGAL — Vakilsearch trademark registration
--    336: ₹1,499 Jun 2025 (partial filing)
--    341: ₹4,707 Jun 2025 (registration)
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%legal%' OR name ILIKE '%trademark%' OR name ILIKE '%complian%'
                 ORDER BY name LIMIT 1),
  vendor      = 'Vakilsearch',
  notes       = CASE id
                  WHEN 336 THEN 'Trademark filing (partial) | Jun 2025'
                  WHEN 341 THEN 'Trademark registration | Jun 2025'
                END,
  is_classified = true
WHERE id IN (336, 341);

-- ----------------------------------------------------------
-- K. DESIGN / SOURCING — Virgio fabric/sample
--    418: ₹3,390 Sep 2025
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%design%' OR name ILIKE '%sample%' OR name ILIKE '%sourcing%'
                    OR name ILIKE '%freelanc%' ORDER BY name LIMIT 1),
  vendor      = 'Virgio',
  notes       = 'Fabric / sample sourcing | Sep 2025',
  is_classified = true
WHERE id = 418;

-- ----------------------------------------------------------
-- L. CUSTOMER REFUNDS (reduces revenue, not an operating expense)
--    All narrations containing "KIRGO REFUND" or "KIRGO SPORTS BRA R"
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%refund%' OR name ILIKE '%return%' ORDER BY name LIMIT 1),
  vendor      = 'Customer refund',
  notes       = 'Customer refund — WooCommerce order',
  is_classified = true
WHERE narration_raw ILIKE '%KIRGO REFUND%'
   OR narration_raw ILIKE '%KIRGO SPORTS BRA R%';

-- ----------------------------------------------------------
-- M. OWNER / CAPITAL TRANSACTIONS (balance sheet, not P&L)
--    180: ₹1,00,000 Siddharth Bajpai investor advance, Aug 2024
--    240: ₹5,300 Siddharth Bajpai investor advance, Nov 2024
--    365: ₹1,00,000 Kanika proprietor capital, Jul 2025
--    377: ₹50,000  Kanika proprietor capital, Aug 2025
--    379: ₹1,00,000 Kanika proprietor capital, Aug 2025
--    380: ₹1,00,000 Kanika proprietor capital, Aug 2025
--    386: ₹8,000  Kanika proprietor capital, Aug 2025
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%capital%' OR name ILIKE '%proprietor%' OR name ILIKE '%owner%'
                    OR name ILIKE '%personal%' OR name ILIKE '%drawing%' OR name ILIKE '%loan%'
                 ORDER BY name LIMIT 1),
  vendor      = CASE id
                  WHEN 180 THEN 'Siddharth Bajpai'
                  WHEN 240 THEN 'Siddharth Bajpai'
                  WHEN 365 THEN 'Kanika Rodrigues (proprietor)'
                  WHEN 377 THEN 'Kanika Rodrigues (proprietor)'
                  WHEN 379 THEN 'Kanika Rodrigues (proprietor)'
                  WHEN 380 THEN 'Kanika Rodrigues (proprietor)'
                  WHEN 386 THEN 'Kanika Rodrigues (proprietor)'
                END,
  notes       = CASE id
                  WHEN 180 THEN 'Investor advance from Siddharth Bajpai to Kanika | Aug 2024'
                  WHEN 240 THEN 'Investor advance from Siddharth Bajpai | Nov 2024'
                  WHEN 365 THEN 'Proprietor capital — Kanika invested in business systems | Jul 2025'
                  WHEN 377 THEN 'Proprietor capital — Kanika | Aug 2025'
                  WHEN 379 THEN 'Proprietor capital — Kanika | Aug 2025'
                  WHEN 380 THEN 'Proprietor capital — Kanika | Aug 2025'
                  WHEN 386 THEN 'Proprietor capital — Kanika | Aug 2025'
                END,
  is_classified = true
WHERE id IN (180, 240, 365, 377, 379, 380, 386);

-- ----------------------------------------------------------
-- N. PERSONAL DRAWING — Kanika → Chrisann personal advance
--    315: ₹60,000 May 2025 (not a business photoshoot expense)
-- ----------------------------------------------------------
UPDATE bank_transactions SET
  category_id = (SELECT id FROM expense_categories
                 WHERE name ILIKE '%personal%' OR name ILIKE '%drawing%' OR name ILIKE '%owner%'
                    OR name ILIKE '%capital%' ORDER BY name LIMIT 1),
  vendor      = 'Chrisann Rodrigues (personal)',
  notes       = 'Personal advance from Kanika to Chrisann — not a business expense | May 2025',
  is_classified = true
WHERE id = 315;

-- ----------------------------------------------------------
-- VERIFY RESULTS BEFORE COMMIT
-- ----------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE is_classified = true)  AS classified,
  COUNT(*) FILTER (WHERE is_classified = false) AS unclassified,
  COUNT(*)                                       AS total
FROM bank_transactions;

COMMIT;
