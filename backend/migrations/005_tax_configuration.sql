-- ============================================================================
-- TeleTime - Canadian Tax Configuration Schema
-- Supports HST, GST/PST combinations, and tax exemptions
-- ============================================================================

-- Tax rate types
CREATE TYPE tax_type AS ENUM ('hst', 'gst', 'pst', 'qst');

-- ============================================================================
-- PROVINCIAL TAX RATES
-- ============================================================================

CREATE TABLE tax_rates (
    id SERIAL PRIMARY KEY,
    province_code VARCHAR(2) NOT NULL,
    province_name VARCHAR(100) NOT NULL,
    tax_type tax_type NOT NULL,
    rate_percent DECIMAL(6,4) NOT NULL,  -- e.g., 13.0000 for 13%
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,  -- NULL means currently active
    is_compound BOOLEAN DEFAULT FALSE,  -- TRUE for QST (calculated on subtotal + GST)
    display_label VARCHAR(50),  -- e.g., "HST 13%", "GST 5%"
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_rate CHECK (rate_percent >= 0 AND rate_percent <= 100),
    CONSTRAINT unique_province_tax_type UNIQUE (province_code, tax_type, effective_date)
);

-- Index for efficient lookups
CREATE INDEX idx_tax_rates_province ON tax_rates(province_code);
CREATE INDEX idx_tax_rates_effective ON tax_rates(effective_date, expiry_date);

-- ============================================================================
-- TAX EXEMPTION REASONS
-- ============================================================================

CREATE TABLE tax_exemption_reasons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    requires_certificate BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CUSTOMER TAX EXEMPTIONS
-- ============================================================================

CREATE TABLE customer_tax_exemptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    exemption_reason_id INTEGER REFERENCES tax_exemption_reasons(id),
    exemption_number VARCHAR(100),  -- Certificate/registration number
    province_code VARCHAR(2),  -- NULL means all provinces
    tax_type tax_type,  -- NULL means all tax types
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    certificate_file_path VARCHAR(500),
    verified_by INTEGER REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_customer_exemption UNIQUE (customer_id, province_code, tax_type)
);

CREATE INDEX idx_customer_exemptions_customer ON customer_tax_exemptions(customer_id);

-- ============================================================================
-- PRODUCT TAX EXEMPTIONS
-- ============================================================================

CREATE TABLE product_tax_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_tax_exempt BOOLEAN DEFAULT FALSE,
    exempt_provinces VARCHAR(2)[],  -- Array of province codes where exempt
    exempt_tax_types tax_type[],  -- Array of tax types this is exempt from
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add tax category to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS tax_category_id INTEGER REFERENCES product_tax_categories(id),
ADD COLUMN IF NOT EXISTS is_tax_exempt BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_products_tax_category ON products(tax_category_id);

-- ============================================================================
-- TAX CALCULATION AUDIT LOG
-- ============================================================================

CREATE TABLE tax_calculation_log (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    quote_id INTEGER,
    transaction_id INTEGER,
    province_code VARCHAR(2) NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    taxable_amount_cents INTEGER NOT NULL,
    hst_cents INTEGER DEFAULT 0,
    gst_cents INTEGER DEFAULT 0,
    pst_cents INTEGER DEFAULT 0,
    qst_cents INTEGER DEFAULT 0,
    total_tax_cents INTEGER NOT NULL,
    tax_rates_snapshot JSONB,  -- Snapshot of rates used
    exemptions_applied JSONB,  -- Any exemptions that were applied
    calculated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    calculated_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_tax_log_order ON tax_calculation_log(order_id);
CREATE INDEX idx_tax_log_quote ON tax_calculation_log(quote_id);
CREATE INDEX idx_tax_log_date ON tax_calculation_log(calculated_at);

-- ============================================================================
-- SEED DATA: Canadian Tax Rates (as of 2024)
-- ============================================================================

INSERT INTO tax_rates (province_code, province_name, tax_type, rate_percent, display_label, is_compound) VALUES
-- HST Provinces
('ON', 'Ontario', 'hst', 13.0000, 'HST 13%', FALSE),
('NB', 'New Brunswick', 'hst', 15.0000, 'HST 15%', FALSE),
('NL', 'Newfoundland and Labrador', 'hst', 15.0000, 'HST 15%', FALSE),
('NS', 'Nova Scotia', 'hst', 15.0000, 'HST 15%', FALSE),
('PE', 'Prince Edward Island', 'hst', 15.0000, 'HST 15%', FALSE),

-- GST + PST Provinces
('BC', 'British Columbia', 'gst', 5.0000, 'GST 5%', FALSE),
('BC', 'British Columbia', 'pst', 7.0000, 'PST 7%', FALSE),
('MB', 'Manitoba', 'gst', 5.0000, 'GST 5%', FALSE),
('MB', 'Manitoba', 'pst', 7.0000, 'PST 7%', FALSE),
('SK', 'Saskatchewan', 'gst', 5.0000, 'GST 5%', FALSE),
('SK', 'Saskatchewan', 'pst', 6.0000, 'PST 6%', FALSE),

-- Quebec (QST is compound - calculated on subtotal + GST)
('QC', 'Quebec', 'gst', 5.0000, 'GST 5%', FALSE),
('QC', 'Quebec', 'qst', 9.9750, 'QST 9.975%', TRUE),

-- GST Only (No Provincial Tax)
('AB', 'Alberta', 'gst', 5.0000, 'GST 5%', FALSE),
('NT', 'Northwest Territories', 'gst', 5.0000, 'GST 5%', FALSE),
('NU', 'Nunavut', 'gst', 5.0000, 'GST 5%', FALSE),
('YT', 'Yukon', 'gst', 5.0000, 'GST 5%', FALSE);

-- ============================================================================
-- SEED DATA: Common Tax Exemption Reasons
-- ============================================================================

INSERT INTO tax_exemption_reasons (code, description, requires_certificate) VALUES
('FIRST_NATIONS', 'First Nations Status', TRUE),
('DIPLOMATIC', 'Diplomatic Exemption', TRUE),
('RESALE', 'Resale Certificate', TRUE),
('EXPORT', 'Export - Zero Rated', FALSE),
('MEDICAL', 'Medical Equipment Exemption', FALSE),
('CHARITY', 'Registered Charity', TRUE),
('GOVERNMENT', 'Government Entity', TRUE),
('MUNICIPAL', 'Municipal Government', TRUE);

-- ============================================================================
-- SEED DATA: Product Tax Categories
-- ============================================================================

INSERT INTO product_tax_categories (code, name, description, is_tax_exempt) VALUES
('STANDARD', 'Standard Taxable', 'Regular taxable goods', FALSE),
('BASIC_GROCERY', 'Basic Groceries', 'Zero-rated basic grocery items', TRUE),
('PRESCRIPTION', 'Prescription Drugs', 'Zero-rated prescription medications', TRUE),
('MEDICAL_DEVICE', 'Medical Devices', 'Zero-rated medical devices', TRUE),
('CHILDRENS_CLOTHING', 'Children''s Clothing', 'Zero-rated children''s clothing and footwear', TRUE),
('BOOKS', 'Printed Books', 'Zero-rated printed books (some provinces)', FALSE);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current tax rates for a province
CREATE OR REPLACE FUNCTION get_province_tax_rates(p_province_code VARCHAR(2))
RETURNS TABLE (
    tax_type tax_type,
    rate_percent DECIMAL(6,4),
    is_compound BOOLEAN,
    display_label VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tr.tax_type,
        tr.rate_percent,
        tr.is_compound,
        tr.display_label
    FROM tax_rates tr
    WHERE tr.province_code = p_province_code
      AND tr.effective_date <= CURRENT_DATE
      AND (tr.expiry_date IS NULL OR tr.expiry_date >= CURRENT_DATE)
    ORDER BY
        CASE tr.tax_type
            WHEN 'hst' THEN 1
            WHEN 'gst' THEN 2
            WHEN 'pst' THEN 3
            WHEN 'qst' THEN 4
        END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if customer is tax exempt for a province
CREATE OR REPLACE FUNCTION is_customer_tax_exempt(
    p_customer_id INTEGER,
    p_province_code VARCHAR(2) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM customer_tax_exemptions cte
        WHERE cte.customer_id = p_customer_id
          AND cte.is_active = TRUE
          AND cte.valid_from <= CURRENT_DATE
          AND (cte.valid_until IS NULL OR cte.valid_until >= CURRENT_DATE)
          AND (cte.province_code IS NULL OR cte.province_code = p_province_code)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if product is tax exempt
CREATE OR REPLACE FUNCTION is_product_tax_exempt(
    p_product_id INTEGER,
    p_province_code VARCHAR(2) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_exempt BOOLEAN;
    v_exempt_provinces VARCHAR(2)[];
BEGIN
    SELECT
        COALESCE(p.is_tax_exempt, FALSE),
        ptc.exempt_provinces
    INTO v_is_exempt, v_exempt_provinces
    FROM products p
    LEFT JOIN product_tax_categories ptc ON p.tax_category_id = ptc.id
    WHERE p.id = p_product_id;

    -- Direct product exemption
    IF v_is_exempt THEN
        RETURN TRUE;
    END IF;

    -- Category-based exemption for specific provinces
    IF v_exempt_provinces IS NOT NULL AND p_province_code = ANY(v_exempt_provinces) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Current tax rates by province (for easy querying)
CREATE OR REPLACE VIEW current_tax_rates AS
SELECT
    province_code,
    province_name,
    MAX(CASE WHEN tax_type = 'hst' THEN rate_percent END) as hst_rate,
    MAX(CASE WHEN tax_type = 'gst' THEN rate_percent END) as gst_rate,
    MAX(CASE WHEN tax_type = 'pst' THEN rate_percent END) as pst_rate,
    MAX(CASE WHEN tax_type = 'qst' THEN rate_percent END) as qst_rate,
    COALESCE(
        MAX(CASE WHEN tax_type = 'hst' THEN rate_percent END),
        COALESCE(MAX(CASE WHEN tax_type = 'gst' THEN rate_percent END), 0) +
        COALESCE(MAX(CASE WHEN tax_type = 'pst' THEN rate_percent END), 0) +
        COALESCE(MAX(CASE WHEN tax_type = 'qst' THEN rate_percent END), 0)
    ) as combined_rate,
    STRING_AGG(display_label, ' + ' ORDER BY
        CASE tax_type
            WHEN 'hst' THEN 1
            WHEN 'gst' THEN 2
            WHEN 'pst' THEN 3
            WHEN 'qst' THEN 4
        END
    ) as display_label
FROM tax_rates
WHERE effective_date <= CURRENT_DATE
  AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
GROUP BY province_code, province_name;

-- Customers with active exemptions
CREATE OR REPLACE VIEW customers_with_exemptions AS
SELECT
    c.id as customer_id,
    c.company_name,
    c.contact_name,
    cte.exemption_number,
    ter.description as exemption_reason,
    cte.province_code,
    cte.valid_from,
    cte.valid_until,
    cte.verified_at IS NOT NULL as is_verified
FROM customers c
JOIN customer_tax_exemptions cte ON c.id = cte.customer_id
LEFT JOIN tax_exemption_reasons ter ON cte.exemption_reason_id = ter.id
WHERE cte.is_active = TRUE
  AND cte.valid_from <= CURRENT_DATE
  AND (cte.valid_until IS NULL OR cte.valid_until >= CURRENT_DATE);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_tax_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_rates_updated_at
    BEFORE UPDATE ON tax_rates
    FOR EACH ROW EXECUTE FUNCTION update_tax_updated_at();

CREATE TRIGGER customer_exemptions_updated_at
    BEFORE UPDATE ON customer_tax_exemptions
    FOR EACH ROW EXECUTE FUNCTION update_tax_updated_at();
