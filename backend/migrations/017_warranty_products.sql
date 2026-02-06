-- TeleTime POS - Warranty/Protection Plan Products
-- Migration: 017_warranty_products.sql
-- Description: Creates tables for warranty products, eligibility rules, and purchase tracking

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Warranty type classification
DO $$ BEGIN
    CREATE TYPE warranty_type AS ENUM (
        'extended',      -- Extended manufacturer warranty
        'accidental',    -- Accidental damage protection
        'replacement',   -- Full replacement plan
        'comprehensive'  -- Extended + accidental combined
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Warranty pricing type
DO $$ BEGIN
    CREATE TYPE warranty_price_type AS ENUM (
        'fixed',         -- Fixed price (e.g., $49.99)
        'percent'        -- Percentage of product price (e.g., 10%)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Warranty claim status
DO $$ BEGIN
    CREATE TYPE warranty_claim_status AS ENUM (
        'submitted',
        'under_review',
        'approved',
        'denied',
        'in_repair',
        'replaced',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE: warranty_products
-- Warranty/protection plan products (extends products table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_products (
    id SERIAL PRIMARY KEY,

    -- Link to main products table
    product_id INTEGER NOT NULL UNIQUE,

    -- Warranty classification
    warranty_type warranty_type NOT NULL DEFAULT 'extended',
    warranty_name VARCHAR(100) NOT NULL,
    warranty_description TEXT,

    -- Duration
    duration_months INTEGER NOT NULL,

    -- Pricing
    price_type warranty_price_type NOT NULL DEFAULT 'fixed',
    price_value DECIMAL(10,2) NOT NULL,  -- Either fixed amount or percentage

    -- Product price eligibility range
    min_product_price DECIMAL(10,2) DEFAULT 0,      -- Don't offer on items below this price
    max_product_price DECIMAL(10,2) DEFAULT 99999,  -- Don't offer on items above this price

    -- Coverage details
    coverage_details JSONB DEFAULT '{}',
    -- Example: {"labor": true, "parts": true, "accidental_drops": false, "water_damage": false}

    -- Exclusions
    exclusions TEXT[],
    -- Example: ['cosmetic damage', 'intentional damage', 'lost/stolen']

    -- Deductible (for claims)
    deductible_amount DECIMAL(10,2) DEFAULT 0,

    -- Provider info (if 3rd party)
    provider_name VARCHAR(100),
    provider_contact VARCHAR(255),

    -- Display settings
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    badge_text VARCHAR(50),  -- e.g., "Best Value", "Most Popular"

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_warranty_products_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

    CONSTRAINT chk_warranty_duration_positive
        CHECK (duration_months > 0),

    CONSTRAINT chk_warranty_price_positive
        CHECK (price_value > 0),

    CONSTRAINT chk_warranty_price_range
        CHECK (min_product_price <= max_product_price)
);

COMMENT ON TABLE warranty_products IS 'Warranty/protection plan products with pricing and coverage details';
COMMENT ON COLUMN warranty_products.product_id IS 'Links to products table - warranty is a sellable product';
COMMENT ON COLUMN warranty_products.price_type IS 'fixed = dollar amount, percent = percentage of covered product price';
COMMENT ON COLUMN warranty_products.price_value IS 'The price or percentage value based on price_type';
COMMENT ON COLUMN warranty_products.min_product_price IS 'Minimum product price to show this warranty (dont offer $50 warranty on $30 item)';
COMMENT ON COLUMN warranty_products.coverage_details IS 'JSON object describing what is covered';
COMMENT ON COLUMN warranty_products.deductible_amount IS 'Amount customer pays per claim';

-- ============================================================================
-- TABLE: warranty_eligibility
-- Defines which products/categories a warranty can cover
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_eligibility (
    id SERIAL PRIMARY KEY,

    warranty_product_id INTEGER NOT NULL,

    -- Either category-based or product-specific eligibility
    category_id INTEGER,      -- FK to categories table
    product_id INTEGER,       -- FK to products table (for specific product eligibility)

    -- Eligibility overrides (optional - override warranty defaults)
    custom_min_price DECIMAL(10,2),
    custom_max_price DECIMAL(10,2),
    custom_price_value DECIMAL(10,2),  -- Override price for this category/product

    -- Priority for display ordering
    priority INTEGER DEFAULT 0,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_warranty_eligibility_warranty
        FOREIGN KEY (warranty_product_id) REFERENCES warranty_products(id) ON DELETE CASCADE,

    -- Note: category_id FK depends on your categories table structure
    -- CONSTRAINT fk_warranty_eligibility_category
    --     FOREIGN KEY (category_id) REFERENCES categories(id),

    CONSTRAINT fk_warranty_eligibility_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,

    -- Must have either category or product (not both, not neither)
    CONSTRAINT chk_warranty_eligibility_target
        CHECK (
            (category_id IS NOT NULL AND product_id IS NULL) OR
            (category_id IS NULL AND product_id IS NOT NULL)
        )
);

COMMENT ON TABLE warranty_eligibility IS 'Defines which categories or products a warranty plan covers';
COMMENT ON COLUMN warranty_eligibility.category_id IS 'Category this warranty is eligible for (mutually exclusive with product_id)';
COMMENT ON COLUMN warranty_eligibility.product_id IS 'Specific product this warranty is eligible for (mutually exclusive with category_id)';
COMMENT ON COLUMN warranty_eligibility.custom_price_value IS 'Override price for this specific category/product';

-- ============================================================================
-- TABLE: warranty_purchases
-- Tracks warranty purchases linked to products sold
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_purchases (
    id SERIAL PRIMARY KEY,

    -- Link to order/transaction
    transaction_id INTEGER,                  -- POS transaction
    order_id INTEGER,                        -- Quote/online order
    transaction_item_id INTEGER,             -- The warranty line item

    -- Link to covered product line item
    covered_item_id INTEGER NOT NULL,        -- The product being covered (transaction_items.item_id)

    -- Warranty details (snapshot at time of purchase)
    warranty_product_id INTEGER NOT NULL,
    warranty_name VARCHAR(100) NOT NULL,
    warranty_type warranty_type NOT NULL,
    duration_months INTEGER NOT NULL,

    -- Covered product details (denormalized for receipts/reports)
    covered_product_id INTEGER NOT NULL,
    covered_product_name VARCHAR(255) NOT NULL,
    covered_product_sku VARCHAR(100),
    covered_product_serial VARCHAR(100),
    covered_product_price DECIMAL(10,2) NOT NULL,

    -- Warranty pricing
    warranty_price DECIMAL(10,2) NOT NULL,

    -- Coverage period
    coverage_start_date DATE NOT NULL,
    coverage_end_date DATE NOT NULL,

    -- Registration
    registration_code VARCHAR(50) UNIQUE,
    registered_at TIMESTAMP,
    registered_by INTEGER,  -- user_id

    -- Customer info (for warranty registration)
    customer_id INTEGER,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'claimed', 'cancelled', 'refunded')),

    -- Cancellation/refund info
    cancelled_at TIMESTAMP,
    cancelled_by INTEGER,
    cancel_reason TEXT,
    refund_amount DECIMAL(10,2),

    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_warranty_purchases_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),

    CONSTRAINT fk_warranty_purchases_covered_item
        FOREIGN KEY (covered_item_id) REFERENCES transaction_items(item_id),

    CONSTRAINT fk_warranty_purchases_warranty_product
        FOREIGN KEY (warranty_product_id) REFERENCES warranty_products(id),

    CONSTRAINT fk_warranty_purchases_covered_product
        FOREIGN KEY (covered_product_id) REFERENCES products(id),

    CONSTRAINT fk_warranty_purchases_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id),

    CONSTRAINT chk_warranty_coverage_dates
        CHECK (coverage_end_date > coverage_start_date)
);

COMMENT ON TABLE warranty_purchases IS 'Tracks warranty purchases linked to covered products';
COMMENT ON COLUMN warranty_purchases.covered_item_id IS 'The transaction line item (product) this warranty covers';
COMMENT ON COLUMN warranty_purchases.registration_code IS 'Unique code for customer warranty registration/lookup';
COMMENT ON COLUMN warranty_purchases.coverage_start_date IS 'When warranty coverage begins (usually purchase date)';
COMMENT ON COLUMN warranty_purchases.coverage_end_date IS 'When warranty coverage expires';

-- ============================================================================
-- TABLE: warranty_claims
-- Track warranty claims made by customers
-- ============================================================================

CREATE TABLE IF NOT EXISTS warranty_claims (
    id SERIAL PRIMARY KEY,

    warranty_purchase_id INTEGER NOT NULL,
    claim_number VARCHAR(20) UNIQUE NOT NULL,

    -- Claim details
    claim_date TIMESTAMP DEFAULT NOW(),
    issue_description TEXT NOT NULL,
    issue_category VARCHAR(50),  -- 'defect', 'accidental', 'wear', etc.

    -- Status tracking
    status warranty_claim_status DEFAULT 'submitted',
    status_updated_at TIMESTAMP DEFAULT NOW(),
    status_updated_by INTEGER,

    -- Resolution
    resolution_type VARCHAR(50),  -- 'repair', 'replace', 'refund', 'denied'
    resolution_notes TEXT,
    resolved_at TIMESTAMP,

    -- Repair tracking
    repair_vendor VARCHAR(100),
    repair_tracking VARCHAR(100),
    repair_cost DECIMAL(10,2),

    -- Replacement tracking
    replacement_product_id INTEGER,
    replacement_serial VARCHAR(100),

    -- Deductible
    deductible_amount DECIMAL(10,2) DEFAULT 0,
    deductible_paid BOOLEAN DEFAULT false,

    -- Documentation
    attachments JSONB DEFAULT '[]',  -- Array of {filename, url, uploaded_at}

    -- Communication
    customer_notified BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP,

    -- Internal notes
    internal_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_warranty_claims_purchase
        FOREIGN KEY (warranty_purchase_id) REFERENCES warranty_purchases(id),

    CONSTRAINT fk_warranty_claims_replacement
        FOREIGN KEY (replacement_product_id) REFERENCES products(id)
);

COMMENT ON TABLE warranty_claims IS 'Warranty claims submitted by customers';
COMMENT ON COLUMN warranty_claims.claim_number IS 'Human-readable claim ID (e.g., CLM-20240115-001)';
COMMENT ON COLUMN warranty_claims.issue_category IS 'Classification of the issue for reporting';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Warranty products
CREATE INDEX IF NOT EXISTS idx_warranty_products_type ON warranty_products(warranty_type);
CREATE INDEX IF NOT EXISTS idx_warranty_products_active ON warranty_products(is_active);
CREATE INDEX IF NOT EXISTS idx_warranty_products_price_range ON warranty_products(min_product_price, max_product_price);

-- Warranty eligibility
CREATE INDEX IF NOT EXISTS idx_warranty_eligibility_warranty ON warranty_eligibility(warranty_product_id);
CREATE INDEX IF NOT EXISTS idx_warranty_eligibility_category ON warranty_eligibility(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_eligibility_product ON warranty_eligibility(product_id) WHERE product_id IS NOT NULL;

-- Warranty purchases
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_transaction ON warranty_purchases(transaction_id);
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_covered_item ON warranty_purchases(covered_item_id);
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_customer ON warranty_purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_status ON warranty_purchases(status);
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_coverage_dates ON warranty_purchases(coverage_start_date, coverage_end_date);
CREATE INDEX IF NOT EXISTS idx_warranty_purchases_registration ON warranty_purchases(registration_code);

-- Warranty claims
CREATE INDEX IF NOT EXISTS idx_warranty_claims_purchase ON warranty_claims(warranty_purchase_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_date ON warranty_claims(claim_date);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate unique warranty registration code
CREATE OR REPLACE FUNCTION generate_warranty_registration_code()
RETURNS VARCHAR(50) AS $$
DECLARE
    code VARCHAR(50);
    exists_count INTEGER;
BEGIN
    LOOP
        -- Format: WRN-YYYYMMDD-XXXXX (random alphanumeric)
        code := 'WRN-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));

        -- Check if code already exists
        SELECT COUNT(*) INTO exists_count
        FROM warranty_purchases
        WHERE registration_code = code;

        EXIT WHEN exists_count = 0;
    END LOOP;

    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Generate claim number
CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    claim_num VARCHAR(20);
    seq_num INTEGER;
BEGIN
    -- Get next sequence number for today
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(claim_number FROM 14 FOR 3) AS INTEGER)),
        0
    ) + 1 INTO seq_num
    FROM warranty_claims
    WHERE claim_number LIKE 'CLM-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';

    claim_num := 'CLM-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(seq_num::TEXT, 3, '0');

    RETURN claim_num;
END;
$$ LANGUAGE plpgsql;

-- Calculate warranty price for a product
CREATE OR REPLACE FUNCTION calculate_warranty_price(
    p_warranty_product_id INTEGER,
    p_product_price DECIMAL(10,2)
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_price_type warranty_price_type;
    v_price_value DECIMAL(10,2);
    v_calculated_price DECIMAL(10,2);
BEGIN
    SELECT price_type, price_value
    INTO v_price_type, v_price_value
    FROM warranty_products
    WHERE id = p_warranty_product_id;

    IF v_price_type = 'fixed' THEN
        v_calculated_price := v_price_value;
    ELSE
        -- Percent: calculate based on product price
        v_calculated_price := ROUND(p_product_price * (v_price_value / 100), 2);
    END IF;

    RETURN v_calculated_price;
END;
$$ LANGUAGE plpgsql;

-- Get eligible warranties for a product
CREATE OR REPLACE FUNCTION get_eligible_warranties(
    p_product_id INTEGER,
    p_category_id INTEGER DEFAULT NULL,
    p_product_price DECIMAL(10,2) DEFAULT NULL
)
RETURNS TABLE (
    warranty_id INTEGER,
    warranty_name VARCHAR(100),
    warranty_type warranty_type,
    duration_months INTEGER,
    calculated_price DECIMAL(10,2),
    coverage_details JSONB,
    badge_text VARCHAR(50)
) AS $$
DECLARE
    v_product_price DECIMAL(10,2);
BEGIN
    -- Get product price if not provided
    IF p_product_price IS NULL THEN
        SELECT price INTO v_product_price FROM products WHERE id = p_product_id;
    ELSE
        v_product_price := p_product_price;
    END IF;

    RETURN QUERY
    SELECT DISTINCT
        wp.id AS warranty_id,
        wp.warranty_name,
        wp.warranty_type,
        wp.duration_months,
        CASE
            WHEN we.custom_price_value IS NOT NULL THEN we.custom_price_value
            WHEN wp.price_type = 'fixed' THEN wp.price_value
            ELSE ROUND(v_product_price * (wp.price_value / 100), 2)
        END AS calculated_price,
        wp.coverage_details,
        wp.badge_text
    FROM warranty_products wp
    JOIN warranty_eligibility we ON we.warranty_product_id = wp.id AND we.is_active = true
    WHERE wp.is_active = true
      AND (
          -- Product-specific eligibility
          we.product_id = p_product_id
          OR
          -- Category eligibility
          (we.category_id IS NOT NULL AND we.category_id = p_category_id)
      )
      AND v_product_price >= COALESCE(we.custom_min_price, wp.min_product_price)
      AND v_product_price <= COALESCE(we.custom_max_price, wp.max_product_price)
    ORDER BY wp.display_order, wp.duration_months;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-generate registration code on warranty purchase
CREATE OR REPLACE FUNCTION set_warranty_registration_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.registration_code IS NULL OR NEW.registration_code = '' THEN
        NEW.registration_code := generate_warranty_registration_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_warranty_registration_code ON warranty_purchases;
CREATE TRIGGER trigger_set_warranty_registration_code
    BEFORE INSERT ON warranty_purchases
    FOR EACH ROW
    EXECUTE FUNCTION set_warranty_registration_code();

-- Auto-generate claim number
CREATE OR REPLACE FUNCTION set_claim_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
        NEW.claim_number := generate_claim_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_claim_number ON warranty_claims;
CREATE TRIGGER trigger_set_claim_number
    BEFORE INSERT ON warranty_claims
    FOR EACH ROW
    EXECUTE FUNCTION set_claim_number();

-- Update timestamps
CREATE OR REPLACE FUNCTION update_warranty_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_warranty_products_updated ON warranty_products;
CREATE TRIGGER trigger_warranty_products_updated
    BEFORE UPDATE ON warranty_products
    FOR EACH ROW
    EXECUTE FUNCTION update_warranty_timestamp();

DROP TRIGGER IF EXISTS trigger_warranty_purchases_updated ON warranty_purchases;
CREATE TRIGGER trigger_warranty_purchases_updated
    BEFORE UPDATE ON warranty_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_warranty_timestamp();

DROP TRIGGER IF EXISTS trigger_warranty_claims_updated ON warranty_claims;
CREATE TRIGGER trigger_warranty_claims_updated
    BEFORE UPDATE ON warranty_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_warranty_timestamp();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active warranty purchases with coverage status
CREATE OR REPLACE VIEW v_active_warranties AS
SELECT
    wp.id,
    wp.registration_code,
    wp.customer_name,
    wp.customer_email,
    wp.covered_product_name,
    wp.covered_product_serial,
    wp.warranty_name,
    wp.warranty_type,
    wp.coverage_start_date,
    wp.coverage_end_date,
    wp.status,
    CASE
        WHEN wp.status = 'cancelled' THEN 'Cancelled'
        WHEN wp.status = 'refunded' THEN 'Refunded'
        WHEN CURRENT_DATE > wp.coverage_end_date THEN 'Expired'
        WHEN CURRENT_DATE < wp.coverage_start_date THEN 'Pending'
        ELSE 'Active'
    END AS coverage_status,
    (wp.coverage_end_date - CURRENT_DATE) AS days_remaining,
    (SELECT COUNT(*) FROM warranty_claims wc WHERE wc.warranty_purchase_id = wp.id) AS claims_count
FROM warranty_purchases wp
WHERE wp.status IN ('active', 'claimed');

-- Warranty sales summary
CREATE OR REPLACE VIEW v_warranty_sales_summary AS
SELECT
    wp.warranty_product_id,
    wpr.warranty_name,
    wpr.warranty_type,
    wpr.duration_months,
    COUNT(*) AS total_sold,
    SUM(wp.warranty_price) AS total_revenue,
    AVG(wp.warranty_price) AS avg_price,
    COUNT(CASE WHEN wp.status = 'active' THEN 1 END) AS active_count,
    COUNT(CASE WHEN wp.status = 'claimed' THEN 1 END) AS claimed_count,
    MIN(wp.created_at) AS first_sale,
    MAX(wp.created_at) AS last_sale
FROM warranty_purchases wp
JOIN warranty_products wpr ON wpr.id = wp.warranty_product_id
GROUP BY wp.warranty_product_id, wpr.warranty_name, wpr.warranty_type, wpr.duration_months;

-- Warranties expiring soon (for notifications)
CREATE OR REPLACE VIEW v_warranties_expiring_soon AS
SELECT
    wp.id,
    wp.registration_code,
    wp.customer_id,
    wp.customer_name,
    wp.customer_email,
    wp.covered_product_name,
    wp.warranty_name,
    wp.coverage_end_date,
    (wp.coverage_end_date - CURRENT_DATE) AS days_until_expiry
FROM warranty_purchases wp
WHERE wp.status = 'active'
  AND wp.coverage_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
ORDER BY wp.coverage_end_date;

-- ============================================================================
-- SAMPLE DATA: Warranty Products
-- ============================================================================

-- First, insert warranty products into the main products table
-- These should be marked as type 'warranty' or similar in your products schema

-- Insert sample warranty products (assumes products table has these IDs available)
-- In production, these would be created through the admin interface

DO $$
DECLARE
    v_1yr_extended_id INTEGER;
    v_2yr_extended_id INTEGER;
    v_3yr_extended_id INTEGER;
    v_2yr_accidental_id INTEGER;
    v_3yr_comprehensive_id INTEGER;
BEGIN
    -- Create warranty product entries in products table
    -- Note: Adjust based on your actual products table structure

    INSERT INTO products (name, description, sku, price, cost, quantity_in_stock, is_active)
    VALUES
        ('1-Year Extended Warranty', 'Extends manufacturer warranty by 1 year', 'WRN-1YR-EXT', 49.99, 10.00, 9999, true),
        ('2-Year Extended Warranty', 'Extends manufacturer warranty by 2 years', 'WRN-2YR-EXT', 79.99, 15.00, 9999, true),
        ('3-Year Extended Warranty', 'Extends manufacturer warranty by 3 years', 'WRN-3YR-EXT', 119.99, 20.00, 9999, true),
        ('2-Year Accidental Damage Protection', 'Covers accidental drops, spills, and damage', 'WRN-2YR-ADP', 99.99, 25.00, 9999, true),
        ('3-Year Comprehensive Protection', 'Extended warranty + accidental damage coverage', 'WRN-3YR-COMP', 149.99, 35.00, 9999, true)
    ON CONFLICT (sku) DO NOTHING;

    -- Get the product IDs
    SELECT id INTO v_1yr_extended_id FROM products WHERE sku = 'WRN-1YR-EXT';
    SELECT id INTO v_2yr_extended_id FROM products WHERE sku = 'WRN-2YR-EXT';
    SELECT id INTO v_3yr_extended_id FROM products WHERE sku = 'WRN-3YR-EXT';
    SELECT id INTO v_2yr_accidental_id FROM products WHERE sku = 'WRN-2YR-ADP';
    SELECT id INTO v_3yr_comprehensive_id FROM products WHERE sku = 'WRN-3YR-COMP';

    -- Insert warranty product details
    IF v_1yr_extended_id IS NOT NULL THEN
        INSERT INTO warranty_products (
            product_id, warranty_type, warranty_name, warranty_description,
            duration_months, price_type, price_value,
            min_product_price, max_product_price,
            coverage_details, exclusions, deductible_amount,
            display_order, is_featured
        ) VALUES (
            v_1yr_extended_id, 'extended', '1-Year Extended Warranty',
            'Extends the manufacturer warranty by an additional 12 months. Covers defects in materials and workmanship.',
            12, 'fixed', 49.99,
            50.00, 500.00,
            '{"labor": true, "parts": true, "in_home_service": false, "carry_in": true}'::jsonb,
            ARRAY['cosmetic damage', 'accidental damage', 'lost or stolen', 'unauthorized modifications'],
            0.00,
            1, false
        ) ON CONFLICT (product_id) DO NOTHING;
    END IF;

    IF v_2yr_extended_id IS NOT NULL THEN
        INSERT INTO warranty_products (
            product_id, warranty_type, warranty_name, warranty_description,
            duration_months, price_type, price_value,
            min_product_price, max_product_price,
            coverage_details, exclusions, deductible_amount,
            display_order, is_featured, badge_text
        ) VALUES (
            v_2yr_extended_id, 'extended', '2-Year Extended Warranty',
            'Extends the manufacturer warranty by an additional 24 months. Our most popular option!',
            24, 'fixed', 79.99,
            100.00, 1000.00,
            '{"labor": true, "parts": true, "in_home_service": true, "carry_in": true, "phone_support": true}'::jsonb,
            ARRAY['cosmetic damage', 'accidental damage', 'lost or stolen', 'unauthorized modifications'],
            0.00,
            2, true, 'Most Popular'
        ) ON CONFLICT (product_id) DO NOTHING;
    END IF;

    IF v_3yr_extended_id IS NOT NULL THEN
        INSERT INTO warranty_products (
            product_id, warranty_type, warranty_name, warranty_description,
            duration_months, price_type, price_value,
            min_product_price, max_product_price,
            coverage_details, exclusions, deductible_amount,
            display_order, is_featured, badge_text
        ) VALUES (
            v_3yr_extended_id, 'extended', '3-Year Extended Warranty',
            'Maximum protection with 36 months of extended coverage. Best value for high-end products.',
            36, 'percent', 10.00,  -- 10% of product price
            200.00, 5000.00,
            '{"labor": true, "parts": true, "in_home_service": true, "carry_in": true, "phone_support": true, "priority_service": true}'::jsonb,
            ARRAY['cosmetic damage', 'accidental damage', 'lost or stolen', 'unauthorized modifications', 'consumable parts'],
            0.00,
            3, false, 'Best Value'
        ) ON CONFLICT (product_id) DO NOTHING;
    END IF;

    IF v_2yr_accidental_id IS NOT NULL THEN
        INSERT INTO warranty_products (
            product_id, warranty_type, warranty_name, warranty_description,
            duration_months, price_type, price_value,
            min_product_price, max_product_price,
            coverage_details, exclusions, deductible_amount,
            display_order, is_featured
        ) VALUES (
            v_2yr_accidental_id, 'accidental', '2-Year Accidental Damage Protection',
            'Covers accidental drops, spills, cracked screens, and physical damage. Peace of mind for everyday use.',
            24, 'fixed', 99.99,
            100.00, 1500.00,
            '{"accidental_drops": true, "liquid_spills": true, "cracked_screens": true, "electrical_surge": true, "mechanical_failure": false}'::jsonb,
            ARRAY['intentional damage', 'lost or stolen', 'cosmetic damage only', 'pre-existing damage'],
            25.00,  -- $25 deductible per claim
            4, false
        ) ON CONFLICT (product_id) DO NOTHING;
    END IF;

    IF v_3yr_comprehensive_id IS NOT NULL THEN
        INSERT INTO warranty_products (
            product_id, warranty_type, warranty_name, warranty_description,
            duration_months, price_type, price_value,
            min_product_price, max_product_price,
            coverage_details, exclusions, deductible_amount,
            display_order, is_featured, badge_text
        ) VALUES (
            v_3yr_comprehensive_id, 'comprehensive', '3-Year Comprehensive Protection',
            'Complete protection package: extended warranty PLUS accidental damage coverage. The ultimate peace of mind.',
            36, 'percent', 15.00,  -- 15% of product price
            200.00, 3000.00,
            '{"labor": true, "parts": true, "in_home_service": true, "accidental_drops": true, "liquid_spills": true, "cracked_screens": true, "electrical_surge": true, "phone_support": true, "priority_service": true}'::jsonb,
            ARRAY['intentional damage', 'lost or stolen', 'unauthorized modifications'],
            0.00,  -- No deductible for premium plan
            5, true, 'Premium'
        ) ON CONFLICT (product_id) DO NOTHING;
    END IF;

    -- Add category eligibility (example with category IDs - adjust based on your categories)
    -- Electronics category (assuming category_id = 1)
    INSERT INTO warranty_eligibility (warranty_product_id, category_id, priority)
    SELECT wp.id, 1, 1
    FROM warranty_products wp
    WHERE wp.warranty_type IN ('extended', 'accidental', 'comprehensive')
    ON CONFLICT DO NOTHING;

    -- Phones category (assuming category_id = 2) - higher price for accidental
    INSERT INTO warranty_eligibility (warranty_product_id, category_id, priority, custom_price_value)
    SELECT wp.id, 2, 2,
           CASE WHEN wp.warranty_type = 'accidental' THEN 129.99 ELSE NULL END
    FROM warranty_products wp
    WHERE wp.warranty_type IN ('extended', 'accidental', 'comprehensive')
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- GRANT PERMISSIONS (adjust based on your roles)
-- ============================================================================

-- GRANT SELECT ON warranty_products TO pos_user;
-- GRANT SELECT ON warranty_eligibility TO pos_user;
-- GRANT SELECT, INSERT, UPDATE ON warranty_purchases TO pos_user;
-- GRANT SELECT, INSERT, UPDATE ON warranty_claims TO pos_user;
-- GRANT SELECT ON v_active_warranties TO pos_user;
-- GRANT SELECT ON v_warranty_sales_summary TO pos_admin;
-- GRANT SELECT ON v_warranties_expiring_soon TO pos_admin;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Migration 017: Warranty/protection plan products schema added';
