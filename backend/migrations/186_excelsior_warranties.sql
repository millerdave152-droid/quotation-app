-- TeleTime POS - Excelsior/Guardian Angel Warranty Integration
-- Migration: 096_excelsior_warranties.sql
-- Description: Replaces sample warranties with real Excelsior (appliances) and
--   Guardian Angel (electronics) service plans from Phoenix A.M.D. International Inc.
--   Inserts ~187 warranty SKUs across 10 programs with tiered pricing.

-- ============================================================================
-- STEP 1: Add 'service_plan' to warranty_type enum
-- ============================================================================

ALTER TYPE warranty_type ADD VALUE IF NOT EXISTS 'service_plan';

-- ============================================================================
-- STEP 2: Add new columns to warranty_products
-- ============================================================================

ALTER TABLE warranty_products ADD COLUMN IF NOT EXISTS sale_context VARCHAR(20) DEFAULT 'at_sale';
-- Values: 'at_sale' (POS checkout), 'post_delivery' (day 46-12mo follow-up)

ALTER TABLE warranty_products ADD COLUMN IF NOT EXISTS provider_code VARCHAR(30);
-- Excelsior program identifier: 'guardian_angel_tv', 'guardian_angel_electronics', 'excelsior_appliance'

ALTER TABLE warranty_products ADD COLUMN IF NOT EXISTS provider_sku VARCHAR(50);
-- Original Excelsior code: T2E02, 19P3A02, PD19P5A100, etc.

-- ============================================================================
-- STEP 3: Create warranty_provider_registrations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_provider_registrations (
    id SERIAL PRIMARY KEY,
    warranty_purchase_id INTEGER REFERENCES warranty_purchases(id),
    provider_code VARCHAR(30),
    provider_sku VARCHAR(50),
    registration_status VARCHAR(20) DEFAULT 'pending'
        CHECK (registration_status IN ('pending', 'submitted', 'confirmed')),
    submitted_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    excelsior_reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranty_registrations_status
    ON warranty_provider_registrations(registration_status);
CREATE INDEX IF NOT EXISTS idx_warranty_registrations_purchase
    ON warranty_provider_registrations(warranty_purchase_id);

-- ============================================================================
-- STEP 4: Deactivate old sample warranties
-- ============================================================================

UPDATE warranty_products SET is_active = false
WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'WRN-%YR-%');

-- Also mark the sample products as inactive
UPDATE products SET is_active = false WHERE sku LIKE 'WRN-%YR-%';

-- ============================================================================
-- STEP 5: Create helper function for bulk inserts
-- ============================================================================

CREATE OR REPLACE FUNCTION _tmp_insert_excelsior_warranty(
    p_code TEXT,
    p_name TEXT,
    p_desc TEXT,
    p_price NUMERIC,
    p_duration INTEGER,
    p_min_price NUMERIC,
    p_max_price NUMERIC,
    p_coverage JSONB,
    p_sale_context TEXT,
    p_provider_code TEXT,
    p_display_order INTEGER,
    p_badge TEXT,
    p_is_featured BOOLEAN,
    p_category_ids INTEGER[]
) RETURNS VOID AS $fn$
DECLARE
    v_pid INTEGER;
    v_wid INTEGER;
    v_cid INTEGER;
    v_cost NUMERIC;
BEGIN
    v_cost := ROUND(p_price * 0.20, 2);

    -- Upsert into products table (no unique constraint on sku, so use SELECT + INSERT/UPDATE)
    SELECT id INTO v_pid FROM products WHERE sku = 'WRN-' || p_code;

    IF v_pid IS NULL THEN
        INSERT INTO products (name, description, sku, price, cost, quantity_in_stock, is_active, category)
        VALUES (p_name, p_desc, 'WRN-' || p_code, p_price, v_cost, 9999, true, 'Warranty')
        RETURNING id INTO v_pid;
    ELSE
        UPDATE products SET price = p_price, cost = v_cost, name = p_name,
            description = p_desc, is_active = true
        WHERE id = v_pid;
    END IF;

    -- Insert into warranty_products table
    INSERT INTO warranty_products (
        product_id, warranty_type, warranty_name, warranty_description,
        duration_months, price_type, price_value,
        min_product_price, max_product_price,
        coverage_details, deductible_amount,
        exclusions,
        provider_name, provider_contact, terms_url,
        display_order, is_featured, badge_text,
        sale_context, provider_code, provider_sku,
        is_active
    ) VALUES (
        v_pid, 'service_plan', p_name, p_desc,
        p_duration, 'fixed', p_price,
        p_min_price, p_max_price,
        p_coverage, 0,
        ARRAY['cosmetic damage', 'intentional damage', 'lost or stolen', 'unauthorized modifications', 'commercial use'],
        'Phoenix A.M.D. International Inc.',
        'SOS Warranty Services Inc. 1-800-661-7313 excelsiorservice.com',
        'https://excelsiorservice.com/terms',
        p_display_order, p_is_featured, p_badge,
        p_sale_context, p_provider_code, p_code,
        true
    ) ON CONFLICT (product_id) DO UPDATE SET
        warranty_name = EXCLUDED.warranty_name,
        warranty_description = EXCLUDED.warranty_description,
        warranty_type = EXCLUDED.warranty_type,
        price_value = EXCLUDED.price_value,
        min_product_price = EXCLUDED.min_product_price,
        max_product_price = EXCLUDED.max_product_price,
        coverage_details = EXCLUDED.coverage_details,
        provider_name = EXCLUDED.provider_name,
        provider_contact = EXCLUDED.provider_contact,
        terms_url = EXCLUDED.terms_url,
        sale_context = EXCLUDED.sale_context,
        provider_code = EXCLUDED.provider_code,
        provider_sku = EXCLUDED.provider_sku,
        display_order = EXCLUDED.display_order,
        is_featured = EXCLUDED.is_featured,
        badge_text = EXCLUDED.badge_text,
        is_active = true,
        updated_at = NOW()
    RETURNING id INTO v_wid;

    -- Insert eligibility rules for each category
    FOREACH v_cid IN ARRAY p_category_ids LOOP
        IF NOT EXISTS (
            SELECT 1 FROM warranty_eligibility
            WHERE warranty_product_id = v_wid AND category_id = v_cid
        ) THEN
            INSERT INTO warranty_eligibility (warranty_product_id, category_id, is_active)
            VALUES (v_wid, v_cid, true);
        END IF;
    END LOOP;
END;
$fn$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Insert all Excelsior/Guardian Angel warranty products
-- ============================================================================

DO $$
DECLARE
    -- ===========================================
    -- TV tier boundaries (16 tiers)
    -- ===========================================
    tv_min NUMERIC[] := ARRAY[
        0, 100, 150, 200, 250, 350, 500, 700,
        1000, 1500, 2000, 3000, 4000, 6000, 8000, 15000
    ];
    tv_max NUMERIC[] := ARRAY[
        99.99, 149.99, 199.99, 249.99, 349.99, 499.99, 699.99, 999.99,
        1499.99, 1999.99, 2999.99, 3999.99, 5999.99, 7999.99, 14999.99, 50000
    ];
    -- Guardian Angel TV +1yr prices (T2E01-T2E16)
    t2e_prices NUMERIC[] := ARRAY[
        14.99, 19.99, 24.99, 29.99, 34.99, 39.99, 49.99, 64.99,
        79.99, 99.99, 129.99, 179.99, 249.99, 329.99, 449.99, 599.99
    ];
    -- Guardian Angel TV +2yr prices (T3E01-T3E16)
    t3e_prices NUMERIC[] := ARRAY[
        24.99, 34.99, 44.99, 54.99, 59.99, 69.99, 79.99, 99.99,
        129.99, 159.99, 199.99, 279.99, 399.99, 529.99, 699.99, 949.99
    ];
    -- Guardian Angel TV +3yr prices (T4E01-T4E16)
    t4e_prices NUMERIC[] := ARRAY[
        34.99, 44.99, 54.99, 69.99, 79.99, 89.99, 104.99, 134.99,
        169.99, 209.99, 269.99, 379.99, 529.99, 699.99, 929.99, 1249.99
    ];

    -- ===========================================
    -- Electronics tier boundaries (13 tiers)
    -- ===========================================
    elec_min NUMERIC[] := ARRAY[
        0, 50, 100, 200, 350, 500, 700,
        1000, 1500, 2000, 3000, 5000, 10000
    ];
    elec_max NUMERIC[] := ARRAY[
        49.99, 99.99, 199.99, 349.99, 499.99, 699.99, 999.99,
        1499.99, 1999.99, 2999.99, 4999.99, 9999.99, 50000
    ];
    -- Guardian Angel Electronics +1yr prices (D2E01-D2E13)
    d2e_prices NUMERIC[] := ARRAY[
        9.99, 14.99, 24.99, 34.99, 44.99, 54.99, 69.99,
        89.99, 109.99, 139.99, 189.99, 269.99, 399.99
    ];
    -- Guardian Angel Electronics +2yr prices (D3E01-D3E13)
    d3e_prices NUMERIC[] := ARRAY[
        14.99, 24.99, 39.99, 54.99, 69.99, 89.99, 109.99,
        139.99, 179.99, 219.99, 299.99, 429.99, 629.99
    ];
    -- Guardian Angel Electronics +3yr prices (D4E01-D4E13)
    d4e_prices NUMERIC[] := ARRAY[
        19.99, 34.99, 49.99, 74.99, 89.99, 114.99, 149.99,
        189.99, 239.99, 299.99, 399.99, 579.99, 849.99
    ];

    -- ===========================================
    -- Appliance tier boundaries (25 tiers)
    -- ===========================================
    app_min NUMERIC[] := ARRAY[
        0, 100, 150, 200, 250, 300, 400, 500, 600, 800,
        1100, 1400, 1700, 2000, 2500, 3000, 3500, 4000, 5000, 6000,
        7500, 10000, 15000, 20000, 30000
    ];
    app_max NUMERIC[] := ARRAY[
        99.99, 149.99, 199.99, 249.99, 299.99, 399.99, 499.99, 599.99, 799.99, 1099.99,
        1399.99, 1699.99, 1999.99, 2499.99, 2999.99, 3499.99, 3999.99, 4999.99, 5999.99, 7499.99,
        9999.99, 14999.99, 19999.99, 29999.99, 50000
    ];
    -- Excelsior Appliance 3yr prices (19P3A01-19P3A25)
    p3a_prices NUMERIC[] := ARRAY[
        34.99, 39.99, 44.99, 49.99, 54.99, 64.99, 74.99, 84.99, 99.99, 119.99,
        139.99, 159.99, 179.99, 209.99, 239.99, 269.99, 299.99, 349.99, 399.99, 479.99,
        599.99, 799.99, 999.99, 1299.99, 1599.99
    ];
    -- Excelsior Appliance 5yr prices (19P5A01-19P5A25)
    p5a_prices NUMERIC[] := ARRAY[
        54.99, 64.99, 74.99, 84.99, 89.99, 104.99, 119.99, 139.99, 164.99, 199.99,
        234.99, 264.99, 299.99, 349.99, 399.99, 449.99, 499.99, 579.99, 669.99, 799.99,
        999.99, 1349.99, 1699.99, 2199.99, 2699.99
    ];

    -- Coverage details per program
    ga_tv_coverage JSONB := '{"parts": true, "labor": true, "remote_replacement": true, "transferable": true, "no_deductible": true}'::jsonb;
    ga_elec_coverage JSONB := '{"parts": true, "labor": true, "transferable": true, "no_deductible": true}'::jsonb;
    exc_app_coverage JSONB := '{"parts": true, "labor": true, "in_home_service": true, "power_surge": true, "food_spoilage": true, "food_spoilage_max": 500, "no_fault_call": true, "fourth_failure_replacement": true, "no_deductible": true, "transferable": true, "renewable": true}'::jsonb;

    i INTEGER;
    v_code TEXT;
BEGIN
    -- ========================================
    -- Guardian Angel TV Warranties (48 SKUs)
    -- Category: 27 (Televisions)
    -- ========================================
    FOR i IN 1..16 LOOP
        -- +1yr (T2E)
        v_code := 'T2E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel TV +1yr Protection',
            'Guardian Angel TV service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 1 year. Parts & labor, one-time remote replacement, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            t2e_prices[i], 12, tv_min[i], tv_max[i],
            ga_tv_coverage, 'at_sale', 'guardian_angel_tv',
            1, NULL, false, ARRAY[27]
        );

        -- +2yr (T3E)
        v_code := 'T3E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel TV +2yr Protection',
            'Guardian Angel TV service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 2 years. Parts & labor, one-time remote replacement, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            t3e_prices[i], 24, tv_min[i], tv_max[i],
            ga_tv_coverage, 'at_sale', 'guardian_angel_tv',
            2, 'Most Popular', true, ARRAY[27]
        );

        -- +3yr (T4E)
        v_code := 'T4E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel TV +3yr Protection',
            'Guardian Angel TV service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 3 years. Parts & labor, one-time remote replacement, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            t4e_prices[i], 36, tv_min[i], tv_max[i],
            ga_tv_coverage, 'at_sale', 'guardian_angel_tv',
            3, 'Best Value', false, ARRAY[27]
        );
    END LOOP;

    -- ========================================
    -- Guardian Angel Electronics Warranties (39 SKUs)
    -- Categories: 28 (Audio), 3 (Small Appliances), 5 (Accessories)
    -- ========================================
    FOR i IN 1..13 LOOP
        -- +1yr (D2E)
        v_code := 'D2E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel Electronics +1yr Protection',
            'Guardian Angel Electronics service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 1 year. Parts & labor, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            d2e_prices[i], 12, elec_min[i], elec_max[i],
            ga_elec_coverage, 'at_sale', 'guardian_angel_electronics',
            1, NULL, false, ARRAY[28, 3, 5]
        );

        -- +2yr (D3E)
        v_code := 'D3E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel Electronics +2yr Protection',
            'Guardian Angel Electronics service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 2 years. Parts & labor, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            d3e_prices[i], 24, elec_min[i], elec_max[i],
            ga_elec_coverage, 'at_sale', 'guardian_angel_electronics',
            2, 'Most Popular', true, ARRAY[28, 3, 5]
        );

        -- +3yr (D4E)
        v_code := 'D4E' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Guardian Angel Electronics +3yr Protection',
            'Guardian Angel Electronics service plan by Phoenix A.M.D. International. Extends manufacturer warranty by 3 years. Parts & labor, fully transferable. Claims: SOS Warranty Services 1-800-661-7313.',
            d4e_prices[i], 36, elec_min[i], elec_max[i],
            ga_elec_coverage, 'at_sale', 'guardian_angel_electronics',
            3, 'Best Value', false, ARRAY[28, 3, 5]
        );
    END LOOP;

    -- ========================================
    -- Excelsior Appliance Warranties - At Sale (50 SKUs)
    -- Categories: 1 (Major Appliances) + 6-15 (subcategories)
    -- ========================================
    FOR i IN 1..25 LOOP
        -- 3yr (19P3A)
        v_code := '19P3A' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Excelsior Appliance 3yr Service Plan',
            'Excelsior Appliance service plan by Phoenix A.M.D. International. 3 years total coverage from date of purchase. 100% parts & labor, in-home service, power surge protection, food spoilage coverage up to $500, no deductible, no-fault first service call, 4th failure = full replacement, transferable, renewable. Claims: SOS Warranty Services 1-800-661-7313.',
            p3a_prices[i], 36, app_min[i], app_max[i],
            exc_app_coverage, 'at_sale', 'excelsior_appliance',
            1, NULL, false, ARRAY[1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );

        -- 5yr (19P5A)
        v_code := '19P5A' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Excelsior Appliance 5yr Service Plan',
            'Excelsior Appliance service plan by Phoenix A.M.D. International. 5 years total coverage from date of purchase. 100% parts & labor, in-home service, power surge protection, food spoilage coverage up to $500, no deductible, no-fault first service call, 4th failure = full replacement, transferable, renewable. Claims: SOS Warranty Services 1-800-661-7313.',
            p5a_prices[i], 60, app_min[i], app_max[i],
            exc_app_coverage, 'at_sale', 'excelsior_appliance',
            2, 'Best Value', true, ARRAY[1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );
    END LOOP;

    -- ========================================
    -- Excelsior Post-Delivery Warranties (50 SKUs)
    -- ~15% premium over at-sale prices
    -- Categories: 1 (Major Appliances) + 6-15 (subcategories)
    -- sale_context: 'post_delivery' (NOT shown during POS checkout)
    -- ========================================
    FOR i IN 1..25 LOOP
        -- 3yr Post-Delivery (PD19P3A)
        v_code := 'PD19P3A' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Excelsior Post-Delivery 3yr Service Plan',
            'Excelsior Post-Delivery service plan by Phoenix A.M.D. International. Available 46 days to 12 months after original purchase. 3 years total coverage. 100% parts & labor, in-home service, power surge protection, food spoilage coverage up to $500, no deductible, transferable, renewable. Claims: SOS Warranty Services 1-800-661-7313.',
            ROUND(p3a_prices[i] * 1.15, 2), 36, app_min[i], app_max[i],
            exc_app_coverage, 'post_delivery', 'excelsior_appliance',
            1, NULL, false, ARRAY[1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );

        -- 5yr Post-Delivery (PD19P5A)
        v_code := 'PD19P5A' || LPAD(i::TEXT, 2, '0');
        PERFORM _tmp_insert_excelsior_warranty(
            v_code,
            'Excelsior Post-Delivery 5yr Service Plan',
            'Excelsior Post-Delivery service plan by Phoenix A.M.D. International. Available 46 days to 12 months after original purchase. 5 years total coverage. 100% parts & labor, in-home service, power surge protection, food spoilage coverage up to $500, no deductible, transferable, renewable. Claims: SOS Warranty Services 1-800-661-7313.',
            ROUND(p5a_prices[i] * 1.15, 2), 60, app_min[i], app_max[i],
            exc_app_coverage, 'post_delivery', 'excelsior_appliance',
            2, 'Best Value', true, ARRAY[1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
        );
    END LOOP;

    RAISE NOTICE 'Inserted 187 Excelsior/Guardian Angel warranty products (48 TV + 39 Electronics + 50 Appliance + 50 Post-Delivery)';
END $$;

-- ============================================================================
-- STEP 7: Drop helper function
-- ============================================================================

DROP FUNCTION IF EXISTS _tmp_insert_excelsior_warranty;

-- ============================================================================
-- STEP 8: Additional indexes for new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_warranty_products_sale_context
    ON warranty_products(sale_context);
CREATE INDEX IF NOT EXISTS idx_warranty_products_provider_code
    ON warranty_products(provider_code);
CREATE INDEX IF NOT EXISTS idx_warranty_products_provider_sku
    ON warranty_products(provider_sku);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Migration 096: Excelsior/Guardian Angel warranty integration - 187 service plan SKUs';
