-- ============================================================================
-- POS TEST SEED DATA
-- ============================================================================
-- Comprehensive test data for the POS system covering:
--   1. Categories (6)
--   2. Products (20) with various price points
--   3. Volume pricing tiers (for selected products)
--   4. Warranty products (3 tiers)
--   5. Warranty eligibility (linking warranties to categories/products)
--   6. Rebates (for selected products)
--   7. Customers (10) across pricing tiers
--   8. Users / Sales Reps (5)
--   9. Manager PINs (for override auth)
--  10. Promotions (5 types)
--  11. Quotations (5 different statuses)
--  12. Trade-in categories, conditions, products (10)
--  13. Financing options (3 plans)
--
-- Prerequisites: Run all migrations 001-009 first.
-- Safe to re-run: Uses ON CONFLICT DO NOTHING where possible.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CATEGORIES
-- ============================================================================

INSERT INTO categories (id, name, slug, display_name, level, display_order, icon, is_active)
VALUES
  (100, 'TVs & Displays',     'tvs',          'TVs & Displays',     1, 1, 'tv',          true),
  (101, 'Audio',               'audio',        'Audio',              1, 2, 'speaker',     true),
  (102, 'Mobile',              'mobile',       'Mobile Devices',     1, 3, 'smartphone',  true),
  (103, 'Appliances',          'appliances',   'Appliances',         1, 4, 'home',        true),
  (104, 'Accessories',         'accessories',  'Accessories',        1, 5, 'cable',       true),
  (105, 'Computing',           'computing',    'Computing',          1, 6, 'laptop',      true)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- 2. PRODUCTS (20 items)
-- ============================================================================
-- Mix of TVs, audio, mobile, appliances, accessories, computing
-- price column is in dollars, cost_cents/sell_cents/msrp_cents are in cents

INSERT INTO products (id, name, model, description, category, category_id, manufacturer, price, cost_cents, sell_cents, msrp_cents, taxable, track_inventory, quantity_on_hand, quantity_available, is_active)
VALUES
  -- TVs & Displays (items 1-4)
  (1001, 'Samsung 65" QLED 4K Smart TV',         'QN65Q80C',    '65-inch QLED 4K with Quantum HDR+',          'TVs & Displays', 100, 'Samsung',     1799.99,  109999, 179999, 199999, true, true, 12, 12, true),
  (1002, 'LG 55" OLED evo 4K Smart TV',          'OLED55C3',    '55-inch OLED evo with α9 Gen6 AI',           'TVs & Displays', 100, 'LG',          1499.99,   89999, 149999, 169999, true, true,  8,  8, true),
  (1003, 'Sony 75" BRAVIA XR Full Array LED',     'XR75X90L',    '75-inch 4K with Cognitive Processor XR',     'TVs & Displays', 100, 'Sony',        1999.99,  129999, 199999, 219999, true, true,  5,  5, true),
  (1004, 'TCL 50" 4K HDR Roku TV',               '50S455',      '50-inch 4K HDR with Roku built-in',           'TVs & Displays', 100, 'TCL',          349.99,   18999,  34999,  39999, true, true, 25, 25, true),

  -- Audio (items 5-7)
  (1005, 'Sonos Arc Soundbar',                    'ARCG1US1BLK', 'Premium smart soundbar with Dolby Atmos',    'Audio',          101, 'Sonos',        899.99,   59999,  89999,  99999, true, true, 10, 10, true),
  (1006, 'Apple AirPods Pro 2',                   'MTJV3AM/A',   'Active Noise Cancelling with USB-C',         'Audio',          101, 'Apple',        329.99,   21999,  32999,  32999, true, true, 40, 40, true),
  (1007, 'JBL Charge 5 Bluetooth Speaker',        'JBLCHARGE5',  'Portable waterproof speaker with powerbank', 'Audio',          101, 'JBL',          219.99,   12999,  21999,  22999, true, true, 30, 30, true),

  -- Mobile (items 8-10)
  (1008, 'iPhone 15 Pro Max 256GB',               'MU683LL/A',   'A17 Pro chip, Titanium, 48MP camera',        'Mobile',         102, 'Apple',       1699.99,  119999, 169999, 169999, true, true, 15, 15, true),
  (1009, 'Samsung Galaxy S24 Ultra 256GB',        'SM-S928B',    'Galaxy AI, S Pen, 200MP camera',             'Mobile',         102, 'Samsung',     1649.99,  114999, 164999, 164999, true, true, 12, 12, true),
  (1010, 'Google Pixel 8 Pro 128GB',              'GA04905-US',  'Tensor G3, AI photo features',               'Mobile',         102, 'Google',      1299.99,   84999, 129999, 129999, true, true, 18, 18, true),

  -- Appliances (items 11-14)
  (1011, 'Samsung French Door Refrigerator',      'RF28T5001SR', '28 cu.ft. with Ice Maker',                   'Appliances',     103, 'Samsung',     1899.99,  129999, 189999, 209999, true, true,  4,  4, true),
  (1012, 'LG Front Load Washer',                  'WM4000HWA',   '4.5 cu.ft. with TurboWash 360',              'Appliances',     103, 'LG',          1099.99,   74999, 109999, 119999, true, true,  6,  6, true),
  (1013, 'Dyson V15 Detect Vacuum',               'SV47',        'Laser-equipped cordless vacuum',             'Appliances',     103, 'Dyson',        949.99,   64999,  94999,  99999, true, true, 14, 14, true),
  (1014, 'Breville Barista Express Espresso',     'BES870XL',    'Built-in grinder, steam wand',               'Appliances',     103, 'Breville',     799.99,   49999,  79999,  84999, true, true, 10, 10, true),

  -- Accessories (items 15-18)
  (1015, 'USB-C to Lightning Cable 2m',           'ACC-USBC-2M', 'MFi Certified braided cable',                'Accessories',    104, 'Anker',         24.99,     999,   2499,   2999, true, true,200,200, true),
  (1016, 'Tempered Glass Screen Protector',       'ACC-TGSP-15', 'Ultra-clear 9H hardness',                    'Accessories',    104, 'Belkin',        29.99,    1199,   2999,   3499, true, true,150,150, true),
  (1017, 'Samsung 45W USB-C Wall Charger',        'EP-T4510',    '45W Super Fast Charging',                    'Accessories',    104, 'Samsung',       49.99,    2499,   4999,   5499, true, true, 80, 80, true),
  (1018, 'Universal TV Wall Mount 32-70"',        'MNT-UNI-70',  'Full motion tilt/swivel bracket',            'Accessories',    104, 'OmniMount',     89.99,    3999,   8999,   9999, true, true, 35, 35, true),

  -- Computing (items 19-20)
  (1019, 'MacBook Air M3 15" 256GB',              'MXCU3LL/A',   'M3 chip, 15.3" Liquid Retina, 18hr battery', 'Computing',      105, 'Apple',       1599.99,  114999, 159999, 159999, true, true, 10, 10, true),
  (1020, 'Dell XPS 14 Laptop',                    'XPS9440',     'Intel Ultra 7, 16GB RAM, 512GB SSD',         'Computing',      105, 'Dell',        1449.99,   99999, 144999, 159999, true, true,  8,  8, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 3. VOLUME PRICING TIERS (selected products)
-- ============================================================================

INSERT INTO product_volume_tiers (product_id, min_qty, max_qty, discount_percent, tier_name, is_active)
VALUES
  -- USB-C cables: buy more, save more
  (1015, 1,   4,   0.00, 'Single',    true),
  (1015, 5,   9,  10.00, '5-Pack',    true),
  (1015, 10,  24, 15.00, '10-Pack',   true),
  (1015, 25, NULL, 20.00, 'Bulk',     true),

  -- Screen protectors: volume tiers
  (1016, 1,   4,   0.00, 'Single',    true),
  (1016, 5,   9,   8.00, '5-Pack',    true),
  (1016, 10, NULL, 12.00, 'Bulk',     true),

  -- Samsung wall chargers: modest volume break
  (1017, 1,   9,   0.00, 'Standard',  true),
  (1017, 10, NULL, 10.00, 'Bulk 10+', true),

  -- TCL budget TVs: small volume break for dealers
  (1004, 1,   2,   0.00, 'Single',    true),
  (1004, 3,   4,   5.00, '3-4 Units', true),
  (1004, 5,  NULL,  8.00, '5+ Units', true);


-- ============================================================================
-- 4. WARRANTY PRODUCTS (3 tiers)
-- ============================================================================
-- These are the warranty SKUs sold as add-ons to products

INSERT INTO warranty_products (id, product_id, warranty_type, warranty_name, warranty_description, duration_months, price_type, price_value, min_product_price, max_product_price, coverage_details, deductible_amount, provider_name, display_order, is_featured, badge_text, is_active)
VALUES
  -- We need product rows for the warranty SKUs themselves. Create placeholder products first:
  -- (The warranty_products.product_id references products.id)
  -- We'll create warranty product entries linked to dedicated product IDs below
  (501, 1021, 'extended', '1-Year Extended Protection',
   'Extends manufacturer warranty by 12 months. Covers defects and mechanical failures.',
   12, 'fixed', 79.99, 100.00, 2000.00,
   '{"covers": ["manufacturer_defects", "mechanical_failure", "power_surge"], "excludes": ["physical_damage", "water_damage", "theft"]}',
   0.00, 'TeleTime Protection', 1, false, '1 Year', true),

  (502, 1022, 'accidental', '2-Year Accidental Damage Protection',
   'Covers accidental drops, spills, and cracked screens for 24 months.',
   24, 'fixed', 149.99, 200.00, 5000.00,
   '{"covers": ["accidental_drops", "cracked_screens", "liquid_spills", "electrical_surges", "mechanical_failure"], "excludes": ["theft", "intentional_damage", "cosmetic_wear"]}',
   49.99, 'TeleTime Protection', 2, true, 'Most Popular', true),

  (503, 1023, 'comprehensive', '3-Year Comprehensive Coverage',
   'Full coverage including accidental damage, theft protection, and battery replacement for 36 months.',
   36, 'fixed', 249.99, 500.00, 99999.00,
   '{"covers": ["accidental_drops", "cracked_screens", "liquid_spills", "theft", "battery_degradation", "electrical_surges", "mechanical_failure", "display_burn_in"], "excludes": ["intentional_damage", "cosmetic_wear", "jailbreaking"]}',
   0.00, 'TeleTime Premium Protection', 3, true, 'Best Value', true)
ON CONFLICT (id) DO NOTHING;

-- Create the placeholder products for warranty SKUs (so FK is satisfied)
INSERT INTO products (id, name, model, description, category, category_id, manufacturer, price, cost_cents, sell_cents, taxable, track_inventory, is_active)
VALUES
  (1021, '1-Year Extended Protection Plan',         'WRN-1YR-EXT',  'Extended warranty - 12 months',    'Services', NULL, 'TeleTime',  79.99, 2000,  7999, true, false, true),
  (1022, '2-Year Accidental Protection Plan',       'WRN-2YR-ADP',  'Accidental damage - 24 months',   'Services', NULL, 'TeleTime', 149.99, 3500, 14999, true, false, true),
  (1023, '3-Year Comprehensive Protection Plan',    'WRN-3YR-CMP',  'Full coverage - 36 months',        'Services', NULL, 'TeleTime', 249.99, 5000, 24999, true, false, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 5. WARRANTY ELIGIBILITY (which products/categories can have which warranty)
-- ============================================================================

INSERT INTO warranty_eligibility (warranty_product_id, category_id, is_active, priority)
VALUES
  -- 1-Year Extended: TVs, Audio, Appliances, Computing
  (501, 100, true, 1),  -- TVs
  (501, 101, true, 1),  -- Audio
  (501, 103, true, 1),  -- Appliances
  (501, 105, true, 1),  -- Computing

  -- 2-Year Accidental: Mobile, Computing, Audio (portable)
  (502, 102, true, 2),  -- Mobile
  (502, 105, true, 2),  -- Computing
  (502, 101, true, 2),  -- Audio

  -- 3-Year Comprehensive: TVs, Mobile, Computing, Appliances (high-value items)
  (503, 100, true, 3),  -- TVs
  (503, 102, true, 3),  -- Mobile
  (503, 105, true, 3),  -- Computing
  (503, 103, true, 3);  -- Appliances


-- ============================================================================
-- 6. REBATES (active manufacturer rebates)
-- ============================================================================

INSERT INTO rebates (id, name, description, rebate_type, amount, amount_type, manufacturer, valid_from, valid_to, terms_url, requires_receipt, claim_deadline_days, is_active)
VALUES
  (201, 'Samsung TV Winter Savings',
   'Get $100 back on any Samsung QLED 55" or larger',
   'instant', 100.00, 'fixed', 'Samsung',
   NOW() - INTERVAL '7 days', NOW() + INTERVAL '60 days',
   'https://samsung.com/rebates/winter-2026', true, 30, true),

  (202, 'Apple Trade-Up Bonus',
   'Extra $50 mail-in rebate when purchasing iPhone 15 Pro Max',
   'mail_in', 50.00, 'fixed', 'Apple',
   NOW() - INTERVAL '14 days', NOW() + INTERVAL '45 days',
   'https://apple.com/promo/trade-up', true, 60, true),

  (203, 'LG Laundry Bundle Rebate',
   '10% cashback on LG washer when purchased with matching dryer',
   'online', 10.00, 'percent', 'LG',
   NOW() - INTERVAL '30 days', NOW() + INTERVAL '90 days',
   'https://lg.com/rebates/laundry', true, 45, true),

  (204, 'Dyson Spring Clean Instant Savings',
   '$75 instant rebate on Dyson V15 Detect',
   'instant', 75.00, 'fixed', 'Dyson',
   NOW() - INTERVAL '3 days', NOW() + INTERVAL '30 days',
   NULL, true, 0, true)
ON CONFLICT (id) DO NOTHING;

-- Link rebates to products
INSERT INTO rebate_products (rebate_id, product_id, min_quantity)
VALUES
  (201, 1001, 1),  -- Samsung 65" QLED
  (202, 1008, 1),  -- iPhone 15 Pro Max
  (203, 1012, 1),  -- LG Washer
  (204, 1013, 1);  -- Dyson V15


-- ============================================================================
-- 7. CUSTOMERS (10)
-- ============================================================================

INSERT INTO customers (id, name, email, phone, address, city, province, postal_code, notes, pricing_tier, credit_limit, current_balance, payment_terms, credit_status, default_discount_percent)
VALUES
  -- Retail customers (no special pricing)
  (901, 'Alice Johnson',       'alice.j@gmail.com',       '416-555-0101', '45 Queen St W',        'Toronto',    'ON', 'M5H 2M5', 'Walk-in regular customer',                     'retail',     0,    0, 'Due on receipt', 'good', 0),
  (902, 'Bob Martinez',        'bob.martinez@outlook.com', '514-555-0202', '200 Rue Ste-Catherine', 'Montreal',  'QC', 'H2X 1L4', 'Prefers French-language receipts',              'retail',     0,    0, 'Due on receipt', 'good', 0),
  (903, 'Carol Chen',           NULL,                       '604-555-0303', NULL,                    NULL,        NULL, NULL,       'Cash-only customer, no email on file',          'retail',     0,    0, 'Due on receipt', 'good', 0),

  -- Wholesale customers (volume buyers)
  (904, 'TechDistro Inc.',     'orders@techdistro.ca',     '905-555-0404', '1200 Industrial Pkwy',  'Markham',   'ON', 'L3R 5Z2', 'B2B distributor, 30-day terms',                 'wholesale', 50000, 12500, 'Net 30',   'good', 15),
  (905, 'QuickFix Mobile',     'purchasing@quickfix.ca',   '403-555-0505', '88 Centre St N',        'Calgary',   'AB', 'T2E 2P6', 'Phone repair shop, buys screens and parts',     'wholesale', 25000,  5000, 'Net 30',   'good', 10),

  -- VIP customers (high-value individuals)
  (906, 'Diana Patel',         'diana.patel@corp.ca',      '416-555-0606', '77 King St W, PH1',     'Toronto',   'ON', 'M5K 1A1', 'VIP - corporate exec, furnishes entire condo',  'vip',       15000,     0, 'Net 15',   'good', 20),
  (907, 'Eric Fontaine',       'eric@fontaine-design.com', '438-555-0707', '350 Rue St-Paul',       'Montreal',  'QC', 'H2Y 1H2', 'VIP - interior designer, high-volume referrals', 'vip',       20000,  3200, 'Net 15',   'good', 18),

  -- Dealer customer
  (908, 'ElectroMart Ltd.',    'procurement@electromart.ca','905-555-0808', '5500 Dixie Rd Unit 4',  'Mississauga','ON','L4W 4N3', 'Authorized dealer, warehouse account',          'dealer',   100000, 45000, 'Net 45',   'good', 25),

  -- Contractor customer
  (909, 'Pinnacle AV Solutions','info@pinnacleav.ca',      '604-555-0909', '2200 Boundary Rd',      'Vancouver', 'BC', 'V5M 3Z3', 'Commercial AV installer, project-based buying', 'contractor', 75000, 18000, 'Net 30',   'good', 12),

  -- Employee customer
  (910, 'Frank Wilson',         'frank.w@teletime.ca',     '647-555-1010', '33 Yonge St',           'Toronto',   'ON', 'M5E 1G4', 'Employee - store manager at Downtown location', 'employee',      0,     0, 'Due on receipt', 'good', 0)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 8. USERS / SALES REPS (5)
-- ============================================================================
-- password_hash is bcrypt of 'TestPass123!' for all test users

INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
VALUES
  (801, 'sarah.mgr@teletime.ca',    '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'Sarah',   'Thompson', 'manager',      true),
  (802, 'mike.sales@teletime.ca',   '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'Mike',    'Smith',    'salesperson',  true),
  (803, 'jenny.sales@teletime.ca',  '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'Jenny',   'Lee',      'salesperson',  true),
  (804, 'omar.sales@teletime.ca',   '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'Omar',    'Hassan',   'salesperson',  true),
  (805, 'priya.admin@teletime.ca',  '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'Priya',   'Sharma',   'admin',        true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 9. MANAGER PINS
-- ============================================================================
-- PIN 1234 hashed with bcrypt

INSERT INTO manager_pins (user_id, pin_hash, approval_level, max_daily_overrides, is_active)
VALUES
  (801, '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'manager',        20, true),
  (805, '$2b$10$eDWoIGRFwJmXQKJxRxmGPeJTNz3VGlKV6QW.dPJtJQ3HgFl7jZxXW', 'administrator',  NULL, true)
ON CONFLICT ON CONSTRAINT unique_active_pin_per_user DO NOTHING;


-- ============================================================================
-- 10. SALES COMMISSIONS CONFIG (via sales_commissions as reference rates)
-- ============================================================================
-- Commission rates recorded per transaction, but we seed a few records to
-- establish baseline rates for each rep

INSERT INTO sales_commissions (salesperson_id, source_type, source_id, source_number, customer_id, customer_name, sale_amount_cents, commission_rate, commission_amount_cents, status, commission_period)
VALUES
  -- Sarah (manager): 3.5% rate, one past commission
  (801, 'transaction', 0, 'SEED-RATE', NULL, NULL, 100000, 0.0350,  3500, 'paid', '2026-01'),

  -- Mike: 2.5% rate
  (802, 'transaction', 0, 'SEED-RATE', NULL, NULL, 100000, 0.0250,  2500, 'paid', '2026-01'),

  -- Jenny: 2.0% rate (newer rep)
  (803, 'transaction', 0, 'SEED-RATE', NULL, NULL, 100000, 0.0200,  2000, 'paid', '2026-01'),

  -- Omar: 2.5% rate
  (804, 'transaction', 0, 'SEED-RATE', NULL, NULL, 100000, 0.0250,  2500, 'paid', '2026-01'),

  -- Priya (admin): 1.0% rate (admin, not primary sales)
  (805, 'transaction', 0, 'SEED-RATE', NULL, NULL, 100000, 0.0100,  1000, 'paid', '2026-01');


-- ============================================================================
-- 11. PROMOTIONS (5 types)
-- ============================================================================

-- Promo 1: 10% off entire order (promo code required)
INSERT INTO pos_promotions (id, promo_code, name, description, promo_type, status, discount_percent, start_date, end_date, max_uses_total, max_uses_per_customer, min_order_cents, auto_apply, combinable, priority, display_name, badge_text, badge_color, created_by)
VALUES (301, 'SAVE10', 'Save 10% On Your Order', 'Get 10% off your entire order with code SAVE10', 'percent_order', 'active', 10.00, NOW() - INTERVAL '7 days', NOW() + INTERVAL '60 days', 500, 2, 5000, false, false, 10, '10% Off', '10% OFF', '#10B981', 801)
ON CONFLICT (id) DO NOTHING;

-- Promo 2: $50 off orders over $500 (promo code required)
INSERT INTO pos_promotions (id, promo_code, name, description, promo_type, status, discount_amount_cents, start_date, end_date, max_uses_total, min_order_cents, auto_apply, combinable, priority, display_name, badge_text, badge_color, created_by)
VALUES (302, 'FLAT50', '$50 Off Orders Over $500', 'Save $50 on any order of $500 or more', 'fixed_order', 'active', 5000, NOW() - INTERVAL '3 days', NOW() + INTERVAL '30 days', 200, 50000, false, false, 5, '$50 Off', '$50 OFF', '#3B82F6', 801)
ON CONFLICT (id) DO NOTHING;

-- Promo 3: 15% off all accessories (auto-apply, no code needed)
INSERT INTO pos_promotions (id, promo_code, name, description, promo_type, status, discount_percent, start_date, end_date, auto_apply, combinable, priority, display_name, badge_text, badge_color, created_by)
VALUES (303, NULL, 'Accessory Sale', '15% off all accessories — auto-applied', 'category_percent', 'active', 15.00, NOW() - INTERVAL '1 day', NOW() + INTERVAL '14 days', true, true, 20, '15% Off Accessories', 'SALE', '#F59E0B', 801)
ON CONFLICT (id) DO NOTHING;

-- Link promo 303 to accessories category
INSERT INTO pos_promotion_products (promotion_id, target_type, category_name, is_included, product_role)
VALUES (303, 'category', 'Accessories', true, 'qualifying');

-- Promo 4: $200 off iPhone 15 Pro Max specifically (product-specific, auto-apply)
INSERT INTO pos_promotions (id, promo_code, name, description, promo_type, status, discount_amount_cents, start_date, end_date, auto_apply, combinable, priority, display_name, badge_text, badge_color, created_by)
VALUES (304, NULL, 'iPhone Pro Max Deal', '$200 instant savings on iPhone 15 Pro Max', 'fixed_product', 'active', 20000, NOW() - INTERVAL '5 days', NOW() + INTERVAL '21 days', true, true, 15, '$200 Off iPhone', 'HOT DEAL', '#DC2626', 801)
ON CONFLICT (id) DO NOTHING;

-- Link promo 304 to iPhone product
INSERT INTO pos_promotion_products (promotion_id, target_type, product_id, is_included, product_role)
VALUES (304, 'product', 1008, true, 'qualifying');

-- Promo 5: Buy 3+ screen protectors, get 25% off each (min quantity, auto-apply)
INSERT INTO pos_promotions (id, promo_code, name, description, promo_type, status, discount_percent, min_quantity, start_date, end_date, auto_apply, combinable, priority, display_name, badge_text, badge_color, created_by)
VALUES (305, NULL, 'Screen Protector Multi-Buy', 'Buy 3 or more screen protectors, save 25% each', 'percent_product', 'active', 25.00, 3, NOW() - INTERVAL '10 days', NOW() + INTERVAL '45 days', true, true, 18, '25% Off 3+', 'MULTI-BUY', '#8B5CF6', 801)
ON CONFLICT (id) DO NOTHING;

-- Link promo 305 to screen protector product
INSERT INTO pos_promotion_products (promotion_id, target_type, product_id, is_included, product_role)
VALUES (305, 'product', 1016, true, 'qualifying');

-- Promo rules for min-quantity promo
INSERT INTO pos_promotion_rules (promotion_id, rule_type, value_int, product_id, is_required, description)
VALUES (305, 'min_product_quantity', 3, 1016, true, 'Must buy 3 or more screen protectors');


-- ============================================================================
-- 12. QUOTATIONS (5 with different statuses)
-- ============================================================================

INSERT INTO quotations (id, quotation_number, customer_name, customer_email, customer_phone, status, total_amount, notes, salesperson_id, created_at, updated_at)
VALUES
  -- Q1: Draft (just created)
  (701, 'QT-2026-0701', 'Alice Johnson',    'alice.j@gmail.com',        '416-555-0101', 'draft',     2149.98, 'Samsung TV + soundbar combo',            802, NOW() - INTERVAL '2 hours',  NOW() - INTERVAL '2 hours'),

  -- Q2: Sent (awaiting customer response)
  (702, 'QT-2026-0702', 'Diana Patel',      'diana.patel@corp.ca',      '416-555-0606', 'sent',      8499.95, 'Full condo AV package - 3 TVs + audio',  803, NOW() - INTERVAL '5 days',   NOW() - INTERVAL '5 days'),

  -- Q3: Approved (ready for conversion to transaction)
  (703, 'QT-2026-0703', 'TechDistro Inc.',  'orders@techdistro.ca',     '905-555-0404', 'approved',  4899.90, 'Bulk order: 10x USB-C cables + 10x chargers', 804, NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours'),

  -- Q4: Expiring soon (sent 28 days ago, 30-day validity)
  (704, 'QT-2026-0704', 'Pinnacle AV Solutions', 'info@pinnacleav.ca',  '604-555-0909', 'sent',      5999.97, 'Commercial install: 3x Sony 75" TVs',    802, NOW() - INTERVAL '28 days',  NOW() - INTERVAL '28 days'),

  -- Q5: Expired
  (705, 'QT-2026-0705', 'Bob Martinez',     'bob.martinez@outlook.com', '514-555-0202', 'expired',   1499.99, 'LG OLED TV',                             803, NOW() - INTERVAL '45 days',  NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO NOTHING;

-- Quotation items
INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, total_price)
VALUES
  -- Q1: Samsung TV + Sonos soundbar
  (701, 1001, 1, 1799.99, 1799.99),
  (701, 1005, 1,  899.99,  899.99),

  -- Q2: Diana's condo package
  (702, 1001, 1, 1799.99, 1799.99),  -- Samsung 65"
  (702, 1002, 2, 1499.99, 2999.98),  -- 2x LG 55"
  (702, 1005, 1,  899.99,  899.99),  -- Sonos Arc
  (702, 1006, 2,  329.99,  659.98),  -- 2x AirPods Pro
  (702, 1018, 3,   89.99,  269.97),  -- 3x wall mounts

  -- Q3: TechDistro bulk order
  (703, 1015, 10,  24.99,  249.90),  -- 10x USB-C cables
  (703, 1017, 10,  49.99,  499.90),  -- 10x chargers

  -- Q4: Pinnacle commercial install
  (704, 1003, 3, 1999.99, 5999.97),  -- 3x Sony 75"

  -- Q5: Bob's expired quote
  (705, 1002, 1, 1499.99, 1499.99);  -- LG OLED


-- ============================================================================
-- 13. TRADE-IN: Categories, Conditions, Products (10)
-- ============================================================================

-- Trade-in conditions (grade scale)
INSERT INTO trade_in_conditions (id, condition_name, condition_code, value_multiplier, condition_criteria, display_order, color, is_active)
VALUES
  (1, 'Flawless',  'A+', 1.000, 'Like new. No scratches, dents, or wear. Includes all original accessories and packaging.', 1, '#10B981', true),
  (2, 'Excellent',  'A',  0.900, 'Minimal signs of use. Screen perfect, body has no noticeable marks. Fully functional.',     2, '#34D399', true),
  (3, 'Good',       'B',  0.750, 'Light scratches or minor scuffs. No cracks. All features work correctly.',                  3, '#FBBF24', true),
  (4, 'Fair',       'C',  0.550, 'Visible wear, deeper scratches, or small dents. Fully functional but cosmetically worn.',   4, '#F59E0B', true),
  (5, 'Poor',       'D',  0.300, 'Heavy wear, cracks, or significant damage. Functional but may have issues.',                5, '#EF4444', true)
ON CONFLICT (id) DO NOTHING;

-- Trade-in categories
INSERT INTO trade_in_categories (id, name, description, requires_serial, requires_imei, requires_photos, min_photos, max_age_years, minimum_value, maximum_value, display_order, icon, is_active)
VALUES
  (1, 'Smartphones',   'Mobile phones and smartphones',                   true, true,  true, 2, 5,  20.00, 1200.00, 1, 'smartphone',  true),
  (2, 'Tablets',       'Tablets and e-readers',                            true, false, true, 2, 5,  15.00,  800.00, 2, 'tablet',      true),
  (3, 'Laptops',       'Laptops, notebooks, and ultrabooks',              true, false, true, 3, 6,  30.00, 1500.00, 3, 'laptop',      true),
  (4, 'TVs',           'LED, OLED, and QLED televisions',                 true, false, true, 2, 5,  25.00,  900.00, 4, 'tv',          true),
  (5, 'Audio',         'Speakers, headphones, and sound systems',          true, false, true, 2, 4,  10.00,  500.00, 5, 'speaker',     true)
ON CONFLICT (id) DO NOTHING;

-- Trade-in products (10 items across categories)
INSERT INTO trade_in_products (id, category_id, brand, model, variant, release_year, base_value, is_active)
VALUES
  -- Smartphones
  (1, 1, 'Apple',    'iPhone 14 Pro Max',       '256GB',              2022,  620.00, true),
  (2, 1, 'Apple',    'iPhone 13',               '128GB',              2021,  380.00, true),
  (3, 1, 'Samsung',  'Galaxy S23 Ultra',        '256GB Phantom Black',2023,  550.00, true),
  (4, 1, 'Google',   'Pixel 7 Pro',             '128GB Obsidian',     2022,  320.00, true),

  -- Tablets
  (5, 2, 'Apple',    'iPad Air (5th gen)',      '64GB Wi-Fi',         2022,  350.00, true),
  (6, 2, 'Samsung',  'Galaxy Tab S8',           '128GB',              2022,  280.00, true),

  -- Laptops
  (7, 3, 'Apple',    'MacBook Pro 14" M2 Pro',  '512GB',              2023,  950.00, true),
  (8, 3, 'Dell',     'XPS 13 Plus',             'i7/16GB/512GB',      2023,  580.00, true),

  -- TVs
  (9, 4, 'Samsung',  'QN55Q80B',                '55" QLED 2022',      2022,  350.00, true),

  -- Audio
  (10, 5, 'Sonos',   'Beam Gen 2',             'Black',               2021,  180.00, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 14. FINANCING OPTIONS (3 plans)
-- ============================================================================

INSERT INTO financing_options (id, financing_code, name, description, provider, term_months, apr, min_amount_cents, max_amount_cents, is_promotional, promo_start_date, promo_end_date, display_text, highlight_text, requires_application, instant_decision, is_active)
VALUES
  (1, 'FIN-6M-0PCT', '6 Months Equal Payments - 0% APR',
   'Split your purchase into 6 easy monthly payments with no interest. Min $200 purchase.',
   'internal', 6, 0.00, 20000, 500000,
   true, CURRENT_DATE - 30, CURRENT_DATE + 180,
   'Pay in 6 monthly payments of {amount}/mo', '0% APR for 6 months',
   false, true, true),

  (2, 'FIN-12M-0PCT', '12 Months Equal Payments - 0% APR',
   'Split your purchase into 12 easy monthly payments with no interest. Min $500 purchase.',
   'internal', 12, 0.00, 50000, 1000000,
   true, CURRENT_DATE - 30, CURRENT_DATE + 180,
   'Pay in 12 monthly payments of {amount}/mo', '0% APR for 12 months',
   false, true, true),

  (3, 'FIN-24M-9.99', '24 Months Financing - 9.99% APR',
   'Spread your purchase over 24 months. Standard credit check required. Min $800 purchase.',
   'internal', 24, 9.99, 80000, 2500000,
   false, NULL, NULL,
   'Pay in 24 monthly payments of {amount}/mo', 'Low monthly payments',
   true, true, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 15. PRICING TIER CONFIGURATION
-- ============================================================================

INSERT INTO pricing_tier_config (tier, display_name, description, base_discount_percent, can_see_cost, requires_approval_over_percent, max_additional_discount_percent, volume_discount_eligible)
VALUES
  ('retail',      'Retail',      'Standard retail pricing',                          0.00, false, 15.00, 10.00, true),
  ('wholesale',   'Wholesale',   'Bulk/business pricing with base 15% discount',    15.00, false, 25.00, 15.00, true),
  ('vip',         'VIP',         'Preferred customer pricing with 10% base',        10.00, false, 20.00, 15.00, true),
  ('contractor',  'Contractor',  'Professional installer/integrator pricing',        12.00, false, 20.00, 12.00, true),
  ('dealer',      'Dealer',      'Authorized reseller pricing with 20% base',       20.00,  true, 30.00, 20.00, true),
  ('employee',    'Employee',    'Staff pricing at cost + 5%',                        0.00,  true, 10.00,  5.00, false),
  ('cost_plus',   'Cost Plus',   'Custom cost-plus margin pricing',                   0.00,  true, 30.00, 25.00, true)
ON CONFLICT (tier) DO NOTHING;


-- ============================================================================
-- 16. REGISTERS (for POS testing)
-- ============================================================================

INSERT INTO registers (register_id, register_name, location, is_active)
VALUES
  (1, 'Register 1', 'Downtown - Front Counter',    true),
  (2, 'Register 2', 'Downtown - Back Counter',     true),
  (3, 'Register 3', 'Markham - Main',              true)
ON CONFLICT (register_id) DO NOTHING;


-- ============================================================================
-- VERIFY SEED DATA
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM categories WHERE id BETWEEN 100 AND 105;
  RAISE NOTICE 'Categories: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM products WHERE id BETWEEN 1001 AND 1023;
  RAISE NOTICE 'Products: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM product_volume_tiers WHERE product_id IN (1015, 1016, 1017, 1004);
  RAISE NOTICE 'Volume tiers: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM warranty_products WHERE id BETWEEN 501 AND 503;
  RAISE NOTICE 'Warranty products: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM rebates WHERE id BETWEEN 201 AND 204;
  RAISE NOTICE 'Rebates: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM customers WHERE id BETWEEN 901 AND 910;
  RAISE NOTICE 'Customers: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM users WHERE id BETWEEN 801 AND 805;
  RAISE NOTICE 'Users/Sales reps: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM pos_promotions WHERE id BETWEEN 301 AND 305;
  RAISE NOTICE 'Promotions: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM quotations WHERE id BETWEEN 701 AND 705;
  RAISE NOTICE 'Quotations: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM trade_in_products WHERE id BETWEEN 1 AND 10;
  RAISE NOTICE 'Trade-in products: % rows', v_count;

  SELECT COUNT(*) INTO v_count FROM financing_options WHERE id BETWEEN 1 AND 3;
  RAISE NOTICE 'Financing options: % rows', v_count;

  RAISE NOTICE '✅ POS test seed data loaded successfully';
END $$;

COMMIT;
