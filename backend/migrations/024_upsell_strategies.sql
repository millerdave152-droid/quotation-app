-- ============================================================================
-- Migration 024: Upsell Strategies System
-- ============================================================================
-- Comprehensive upsell framework for:
-- - Product upgrades (55" → 65" TV)
-- - Service add-ons (installation, setup, training)
-- - Membership/loyalty signups
-- - Financing promotions
-- ============================================================================

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- Services catalog (for service add-ons)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    service_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Pricing
    base_price_cents INTEGER NOT NULL DEFAULT 0,
    price_type VARCHAR(20) DEFAULT 'fixed', -- 'fixed', 'percentage', 'per_item'
    percentage_rate DECIMAL(5,2), -- For percentage-based pricing

    -- Categorization
    service_type VARCHAR(50) NOT NULL, -- 'installation', 'setup', 'training', 'delivery', 'support', 'custom'
    category_id INTEGER REFERENCES categories(id),

    -- Availability
    duration_minutes INTEGER, -- Estimated service duration
    requires_scheduling BOOLEAN DEFAULT false,
    available_days JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday"]',

    -- Eligibility
    min_cart_value_cents INTEGER DEFAULT 0,
    eligible_categories INTEGER[], -- Category IDs this service applies to
    eligible_products INTEGER[], -- Specific product IDs (if empty, uses categories)

    -- Display
    icon VARCHAR(50), -- Icon identifier for UI
    display_order INTEGER DEFAULT 100,
    show_in_checkout BOOLEAN DEFAULT true,

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Membership tiers/programs
CREATE TABLE IF NOT EXISTS membership_programs (
    id SERIAL PRIMARY KEY,
    program_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Pricing
    annual_fee_cents INTEGER DEFAULT 0,
    monthly_fee_cents INTEGER DEFAULT 0,
    signup_bonus_cents INTEGER DEFAULT 0, -- Store credit bonus for signing up

    -- Benefits
    discount_percent DECIMAL(5,2) DEFAULT 0, -- Member discount on all purchases
    free_shipping_threshold_cents INTEGER, -- Free shipping above this amount
    points_multiplier DECIMAL(3,2) DEFAULT 1.00, -- Loyalty points multiplier
    exclusive_access BOOLEAN DEFAULT false, -- Early access to sales

    -- Rewards
    points_per_dollar INTEGER DEFAULT 1,
    points_to_dollar_ratio INTEGER DEFAULT 100, -- 100 points = $1

    -- Eligibility
    min_annual_spend_cents INTEGER DEFAULT 0, -- Auto-qualify threshold

    -- Display
    badge_color VARCHAR(20) DEFAULT '#4F46E5',
    tier_level INTEGER DEFAULT 1,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Financing options
CREATE TABLE IF NOT EXISTS financing_options (
    id SERIAL PRIMARY KEY,
    financing_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    provider VARCHAR(100), -- 'affirm', 'klarna', 'synchrony', 'internal'

    -- Terms
    term_months INTEGER NOT NULL,
    apr DECIMAL(5,2) NOT NULL DEFAULT 0, -- 0 for 0% APR promos
    min_amount_cents INTEGER NOT NULL DEFAULT 0,
    max_amount_cents INTEGER, -- NULL for no max

    -- Promo details
    is_promotional BOOLEAN DEFAULT false,
    promo_start_date DATE,
    promo_end_date DATE,

    -- Display
    display_text VARCHAR(255), -- "Pay $42/mo for 24 months"
    highlight_text VARCHAR(100), -- "0% APR for 24 months"
    monthly_payment_formula VARCHAR(100), -- For calculating display

    -- Requirements
    min_credit_score INTEGER,
    requires_application BOOLEAN DEFAULT true,
    instant_decision BOOLEAN DEFAULT true,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 2. UPSELL STRATEGIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS upsell_strategies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Strategy classification
    upsell_type VARCHAR(30) NOT NULL
        CHECK (upsell_type IN ('upgrade', 'service', 'membership', 'financing', 'bundle', 'cross_sell')),

    -- Trigger conditions
    trigger_type VARCHAR(30) NOT NULL
        CHECK (trigger_type IN ('product', 'category', 'cart_value', 'customer_type', 'cart_item_count', 'time_based', 'customer_history')),
    trigger_value JSONB NOT NULL,
    -- Examples:
    -- product: {"product_ids": [1, 2, 3]}
    -- category: {"category_ids": [5, 6], "exclude_products": [10]}
    -- cart_value: {"min_cents": 50000, "max_cents": 200000}
    -- customer_type: {"types": ["new", "returning"], "has_membership": false}
    -- cart_item_count: {"min_items": 2, "max_items": null}
    -- time_based: {"days": ["friday", "saturday"], "hours": {"start": 10, "end": 18}}
    -- customer_history: {"min_orders": 3, "min_lifetime_value_cents": 100000}

    -- Additional conditions (all must be true)
    conditions JSONB DEFAULT '{}',
    -- Examples:
    -- {"exclude_on_sale": true, "require_stock": true, "max_times_per_customer": 1}

    -- Display settings
    display_location VARCHAR(30) DEFAULT 'checkout',
    -- 'product_page', 'cart', 'checkout', 'post_purchase', 'modal'
    display_priority INTEGER DEFAULT 100, -- Lower = higher priority
    max_displays_per_session INTEGER DEFAULT 1,

    -- Scheduling
    start_date DATE,
    end_date DATE,

    -- Performance tracking
    total_impressions INTEGER DEFAULT 0,
    total_conversions INTEGER DEFAULT 0,
    total_revenue_cents BIGINT DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. UPSELL OFFERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS upsell_offers (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER NOT NULL REFERENCES upsell_strategies(id) ON DELETE CASCADE,

    -- Offer content
    offer_title VARCHAR(255) NOT NULL,
    offer_subtitle VARCHAR(255),
    offer_description TEXT,
    offer_image_url VARCHAR(500),

    -- Offer value
    offer_type VARCHAR(30) NOT NULL
        CHECK (offer_type IN ('fixed_discount', 'percent_discount', 'price_difference', 'add_on', 'free_item', 'financing_promo')),
    offer_value_cents INTEGER, -- For fixed discounts
    offer_value_percent DECIMAL(5,2), -- For percentage discounts
    original_price_cents INTEGER, -- For showing savings
    offer_price_cents INTEGER, -- Final price after discount

    -- Target (what the customer gets)
    target_type VARCHAR(30) NOT NULL
        CHECK (target_type IN ('product', 'service', 'membership', 'financing', 'custom')),
    target_product_id INTEGER REFERENCES products(id),
    target_service_id INTEGER REFERENCES services(id),
    target_membership_id INTEGER REFERENCES membership_programs(id),
    target_financing_id INTEGER REFERENCES financing_options(id),
    target_custom_data JSONB, -- For flexible custom offers

    -- Source context (what triggers this offer)
    source_product_ids INTEGER[], -- Products that trigger this offer
    source_category_ids INTEGER[], -- Categories that trigger this offer

    -- Display
    badge_text VARCHAR(50), -- "SAVE $200", "POPULAR", "LIMITED TIME"
    badge_color VARCHAR(20) DEFAULT '#10B981',
    cta_text VARCHAR(50) DEFAULT 'Add to Cart', -- Call-to-action button text
    urgency_text VARCHAR(100), -- "Only 3 left at this price"

    -- Validity
    valid_from TIMESTAMP,
    valid_to TIMESTAMP,
    max_redemptions INTEGER, -- Total redemptions allowed
    current_redemptions INTEGER DEFAULT 0,
    max_per_customer INTEGER DEFAULT 1,

    -- Display order within strategy
    display_order INTEGER DEFAULT 100,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 4. UPSELL RESULTS TABLE (Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS upsell_results (
    id SERIAL PRIMARY KEY,

    -- References
    strategy_id INTEGER NOT NULL REFERENCES upsell_strategies(id),
    offer_id INTEGER NOT NULL REFERENCES upsell_offers(id),
    order_id INTEGER REFERENCES orders(id), -- Null if not converted
    transaction_id INTEGER REFERENCES transactions(transaction_id),
    customer_id INTEGER REFERENCES customers(id),
    user_id INTEGER REFERENCES users(id), -- Staff who made the sale

    -- Context
    session_id VARCHAR(100), -- For tracking across session
    source_product_id INTEGER REFERENCES products(id),
    source_cart_value_cents INTEGER,
    source_item_count INTEGER,

    -- Timing
    shown_at TIMESTAMP NOT NULL DEFAULT NOW(),
    interacted_at TIMESTAMP,
    decided_at TIMESTAMP,

    -- Result
    result VARCHAR(20) NOT NULL DEFAULT 'shown'
        CHECK (result IN ('shown', 'clicked', 'accepted', 'declined', 'ignored', 'expired')),

    -- Revenue impact
    revenue_added_cents INTEGER DEFAULT 0,
    margin_added_cents INTEGER DEFAULT 0,
    discount_given_cents INTEGER DEFAULT 0,

    -- Additional data
    decline_reason VARCHAR(100), -- If customer gave a reason
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 5. CUSTOMER MEMBERSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_memberships (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    program_id INTEGER NOT NULL REFERENCES membership_programs(id),

    -- Status
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),

    -- Dates
    enrolled_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Payment
    payment_type VARCHAR(20) DEFAULT 'annual', -- 'annual', 'monthly', 'lifetime'
    next_billing_date DATE,
    auto_renew BOOLEAN DEFAULT true,

    -- Points/Rewards
    points_balance INTEGER DEFAULT 0,
    lifetime_points_earned INTEGER DEFAULT 0,
    lifetime_points_redeemed INTEGER DEFAULT 0,

    -- Tracking
    enrolled_by INTEGER REFERENCES users(id),
    enrollment_order_id INTEGER REFERENCES orders(id),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(customer_id, program_id)
);

-- Customer service purchases
CREATE TABLE IF NOT EXISTS customer_services (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    order_id INTEGER REFERENCES orders(id),
    transaction_id INTEGER REFERENCES transactions(transaction_id),

    -- Related product (if service is for a specific product)
    related_product_id INTEGER REFERENCES products(id),
    related_order_item_id INTEGER,

    -- Pricing
    base_price_cents INTEGER NOT NULL,
    discount_cents INTEGER DEFAULT 0,
    final_price_cents INTEGER NOT NULL,

    -- Scheduling
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),
    scheduled_date DATE,
    scheduled_time_start TIME,
    scheduled_time_end TIME,
    completed_at TIMESTAMP,

    -- Details
    notes TEXT,
    customer_address JSONB, -- If service requires visit

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

-- Strategies indexes
CREATE INDEX IF NOT EXISTS idx_upsell_strategies_type ON upsell_strategies(upsell_type);
CREATE INDEX IF NOT EXISTS idx_upsell_strategies_trigger ON upsell_strategies(trigger_type);
CREATE INDEX IF NOT EXISTS idx_upsell_strategies_active ON upsell_strategies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_upsell_strategies_dates ON upsell_strategies(start_date, end_date);

-- Offers indexes
CREATE INDEX IF NOT EXISTS idx_upsell_offers_strategy ON upsell_offers(strategy_id);
CREATE INDEX IF NOT EXISTS idx_upsell_offers_target_product ON upsell_offers(target_product_id) WHERE target_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_offers_target_service ON upsell_offers(target_service_id) WHERE target_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_offers_active ON upsell_offers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_upsell_offers_validity ON upsell_offers(valid_from, valid_to);

-- Results indexes
CREATE INDEX IF NOT EXISTS idx_upsell_results_strategy ON upsell_results(strategy_id);
CREATE INDEX IF NOT EXISTS idx_upsell_results_offer ON upsell_results(offer_id);
CREATE INDEX IF NOT EXISTS idx_upsell_results_order ON upsell_results(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_results_customer ON upsell_results(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upsell_results_result ON upsell_results(result);
CREATE INDEX IF NOT EXISTS idx_upsell_results_shown_at ON upsell_results(shown_at);
CREATE INDEX IF NOT EXISTS idx_upsell_results_session ON upsell_results(session_id);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_type ON services(service_type);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active) WHERE is_active = true;

-- Memberships indexes
CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer ON customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_status ON customer_memberships(status);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_expires ON customer_memberships(expires_at);

-- Customer services indexes
CREATE INDEX IF NOT EXISTS idx_customer_services_customer ON customer_services(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_services_status ON customer_services(status);
CREATE INDEX IF NOT EXISTS idx_customer_services_scheduled ON customer_services(scheduled_date);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to get active upsell strategies for a context
CREATE OR REPLACE FUNCTION get_active_upsell_strategies(
    p_product_ids INTEGER[],
    p_category_ids INTEGER[],
    p_cart_value_cents INTEGER,
    p_customer_type VARCHAR(20),
    p_item_count INTEGER
)
RETURNS TABLE (
    strategy_id INTEGER,
    upsell_type VARCHAR(30),
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        us.id AS strategy_id,
        us.upsell_type,
        us.display_priority AS priority
    FROM upsell_strategies us
    WHERE us.is_active = true
        AND (us.start_date IS NULL OR us.start_date <= CURRENT_DATE)
        AND (us.end_date IS NULL OR us.end_date >= CURRENT_DATE)
        AND (
            -- Product trigger
            (us.trigger_type = 'product' AND
             (us.trigger_value->>'product_ids')::jsonb ?| p_product_ids::text[])
            OR
            -- Category trigger
            (us.trigger_type = 'category' AND
             (us.trigger_value->>'category_ids')::jsonb ?| p_category_ids::text[])
            OR
            -- Cart value trigger
            (us.trigger_type = 'cart_value' AND
             p_cart_value_cents >= COALESCE((us.trigger_value->>'min_cents')::integer, 0) AND
             (us.trigger_value->>'max_cents' IS NULL OR
              p_cart_value_cents <= (us.trigger_value->>'max_cents')::integer))
            OR
            -- Customer type trigger
            (us.trigger_type = 'customer_type' AND
             (us.trigger_value->>'types')::jsonb ? p_customer_type)
            OR
            -- Cart item count trigger
            (us.trigger_type = 'cart_item_count' AND
             p_item_count >= COALESCE((us.trigger_value->>'min_items')::integer, 0) AND
             (us.trigger_value->>'max_items' IS NULL OR
              p_item_count <= (us.trigger_value->>'max_items')::integer))
        )
    ORDER BY us.display_priority ASC, us.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get offers for a strategy
CREATE OR REPLACE FUNCTION get_strategy_offers(
    p_strategy_id INTEGER,
    p_source_product_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    offer_id INTEGER,
    offer_title VARCHAR(255),
    offer_subtitle VARCHAR(255),
    offer_type VARCHAR(30),
    offer_value_cents INTEGER,
    offer_value_percent DECIMAL(5,2),
    target_type VARCHAR(30),
    target_product_id INTEGER,
    target_service_id INTEGER,
    target_membership_id INTEGER,
    badge_text VARCHAR(50),
    cta_text VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        uo.id AS offer_id,
        uo.offer_title,
        uo.offer_subtitle,
        uo.offer_type,
        uo.offer_value_cents,
        uo.offer_value_percent,
        uo.target_type,
        uo.target_product_id,
        uo.target_service_id,
        uo.target_membership_id,
        uo.badge_text,
        uo.cta_text
    FROM upsell_offers uo
    WHERE uo.strategy_id = p_strategy_id
        AND uo.is_active = true
        AND (uo.valid_from IS NULL OR uo.valid_from <= NOW())
        AND (uo.valid_to IS NULL OR uo.valid_to >= NOW())
        AND (uo.max_redemptions IS NULL OR uo.current_redemptions < uo.max_redemptions)
        AND (p_source_product_id IS NULL OR
             uo.source_product_ids IS NULL OR
             p_source_product_id = ANY(uo.source_product_ids))
    ORDER BY uo.display_order ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to record upsell result
CREATE OR REPLACE FUNCTION record_upsell_result(
    p_strategy_id INTEGER,
    p_offer_id INTEGER,
    p_result VARCHAR(20),
    p_order_id INTEGER DEFAULT NULL,
    p_customer_id INTEGER DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_session_id VARCHAR(100) DEFAULT NULL,
    p_revenue_added_cents INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
    v_result_id INTEGER;
BEGIN
    -- Insert result
    INSERT INTO upsell_results (
        strategy_id, offer_id, order_id, customer_id, user_id,
        session_id, result, revenue_added_cents,
        decided_at
    ) VALUES (
        p_strategy_id, p_offer_id, p_order_id, p_customer_id, p_user_id,
        p_session_id, p_result, p_revenue_added_cents,
        CASE WHEN p_result IN ('accepted', 'declined') THEN NOW() ELSE NULL END
    )
    RETURNING id INTO v_result_id;

    -- Update strategy counters
    UPDATE upsell_strategies
    SET
        total_impressions = total_impressions + CASE WHEN p_result = 'shown' THEN 1 ELSE 0 END,
        total_conversions = total_conversions + CASE WHEN p_result = 'accepted' THEN 1 ELSE 0 END,
        total_revenue_cents = total_revenue_cents + COALESCE(p_revenue_added_cents, 0)
    WHERE id = p_strategy_id;

    -- Update offer redemption counter
    IF p_result = 'accepted' THEN
        UPDATE upsell_offers
        SET current_redemptions = current_redemptions + 1
        WHERE id = p_offer_id;
    END IF;

    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate conversion rate
CREATE OR REPLACE FUNCTION get_upsell_conversion_rate(p_strategy_id INTEGER)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    v_shown INTEGER;
    v_accepted INTEGER;
BEGIN
    SELECT total_impressions, total_conversions
    INTO v_shown, v_accepted
    FROM upsell_strategies
    WHERE id = p_strategy_id;

    IF v_shown = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((v_accepted::DECIMAL / v_shown) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- Strategy performance view
CREATE OR REPLACE VIEW v_upsell_strategy_performance AS
SELECT
    us.id,
    us.name,
    us.upsell_type,
    us.trigger_type,
    us.is_active,
    us.total_impressions,
    us.total_conversions,
    CASE WHEN us.total_impressions > 0
        THEN ROUND((us.total_conversions::DECIMAL / us.total_impressions) * 100, 2)
        ELSE 0
    END AS conversion_rate,
    us.total_revenue_cents,
    ROUND(us.total_revenue_cents / 100.0, 2) AS total_revenue,
    CASE WHEN us.total_conversions > 0
        THEN ROUND((us.total_revenue_cents / us.total_conversions) / 100.0, 2)
        ELSE 0
    END AS avg_revenue_per_conversion,
    COUNT(DISTINCT uo.id) AS offer_count,
    us.created_at,
    us.start_date,
    us.end_date
FROM upsell_strategies us
LEFT JOIN upsell_offers uo ON uo.strategy_id = us.id AND uo.is_active = true
GROUP BY us.id;

-- Daily upsell analytics view
CREATE OR REPLACE VIEW v_upsell_daily_analytics AS
SELECT
    DATE(ur.shown_at) AS date,
    us.upsell_type,
    COUNT(*) FILTER (WHERE ur.result = 'shown') AS impressions,
    COUNT(*) FILTER (WHERE ur.result = 'clicked') AS clicks,
    COUNT(*) FILTER (WHERE ur.result = 'accepted') AS conversions,
    COUNT(*) FILTER (WHERE ur.result = 'declined') AS declines,
    SUM(ur.revenue_added_cents) FILTER (WHERE ur.result = 'accepted') AS revenue_cents,
    CASE WHEN COUNT(*) FILTER (WHERE ur.result = 'shown') > 0
        THEN ROUND((COUNT(*) FILTER (WHERE ur.result = 'accepted')::DECIMAL /
                    COUNT(*) FILTER (WHERE ur.result = 'shown')) * 100, 2)
        ELSE 0
    END AS conversion_rate
FROM upsell_results ur
JOIN upsell_strategies us ON us.id = ur.strategy_id
GROUP BY DATE(ur.shown_at), us.upsell_type
ORDER BY date DESC, upsell_type;

-- Service performance view
CREATE OR REPLACE VIEW v_service_sales_performance AS
SELECT
    s.id,
    s.name,
    s.service_type,
    s.base_price_cents,
    COUNT(cs.id) AS total_sold,
    SUM(cs.final_price_cents) AS total_revenue_cents,
    COUNT(cs.id) FILTER (WHERE cs.status = 'completed') AS completed_count,
    COUNT(cs.id) FILTER (WHERE cs.status = 'cancelled') AS cancelled_count,
    ROUND(AVG(cs.final_price_cents), 0) AS avg_price_cents
FROM services s
LEFT JOIN customer_services cs ON cs.service_id = s.id
GROUP BY s.id;

-- ============================================================================
-- 9. SAMPLE DATA
-- ============================================================================

-- Sample services
INSERT INTO services (service_code, name, description, base_price_cents, service_type, duration_minutes, requires_scheduling, show_in_checkout) VALUES
-- Installation services
('INSTALL-TV-BASIC', 'Basic TV Installation', 'Wall mount installation with customer-provided mount. Includes cable concealment up to 6ft.', 9999, 'installation', 60, true, true),
('INSTALL-TV-PREMIUM', 'Premium TV Installation', 'Wall mount installation with mount included. Full cable concealment, outlet relocation, and sound bar setup.', 24999, 'installation', 120, true, true),
('INSTALL-HOME-THEATER', 'Home Theater Setup', 'Complete home theater installation including receiver, speakers, and calibration.', 49999, 'installation', 240, true, true),
('INSTALL-APPLIANCE', 'Appliance Installation', 'Professional installation of major appliances with haul-away of old unit.', 14999, 'installation', 90, true, true),

-- Setup services
('SETUP-PHONE', 'Phone Setup & Transfer', 'Complete phone setup including data transfer, app installation, and account configuration.', 4999, 'setup', 45, false, true),
('SETUP-COMPUTER', 'Computer Setup', 'Unbox, configure, install updates, and transfer data from old device.', 9999, 'setup', 60, false, true),
('SETUP-SMART-HOME', 'Smart Home Setup', 'Configure smart home devices, create automations, and integrate with voice assistants.', 14999, 'setup', 90, true, true),

-- Training services
('TRAINING-DEVICE', 'Device Training Session', '1-hour personalized training on your new device.', 7999, 'training', 60, true, true),
('TRAINING-SOFTWARE', 'Software Training', '2-hour session covering productivity software and cloud services.', 14999, 'training', 120, true, true)
ON CONFLICT (service_code) DO NOTHING;

-- Sample membership programs
INSERT INTO membership_programs (program_code, name, description, annual_fee_cents, discount_percent, points_multiplier, free_shipping_threshold_cents, signup_bonus_cents, tier_level, badge_color) VALUES
('TELETIME-BASIC', 'TeleTime Rewards', 'Free membership with basic rewards.', 0, 0, 1.00, 7500, 0, 1, '#6B7280'),
('TELETIME-PLUS', 'TeleTime Plus', 'Enhanced rewards with exclusive member pricing and free shipping.', 4999, 5, 1.50, 0, 2000, 2, '#3B82F6'),
('TELETIME-PRO', 'TeleTime Pro', 'Premium membership with maximum savings and VIP benefits.', 9999, 10, 2.00, 0, 5000, 3, '#8B5CF6')
ON CONFLICT (program_code) DO NOTHING;

-- Sample financing options
INSERT INTO financing_options (financing_code, name, description, provider, term_months, apr, min_amount_cents, max_amount_cents, is_promotional, display_text, highlight_text) VALUES
('AFFIRM-6MO', 'Pay in 6', 'Split your purchase into 6 monthly payments', 'affirm', 6, 0, 5000, NULL, true, 'Pay as low as $XX/mo', '0% APR for 6 months'),
('AFFIRM-12MO', 'Pay in 12', 'Split your purchase into 12 monthly payments', 'affirm', 12, 0, 10000, NULL, true, 'Pay as low as $XX/mo', '0% APR for 12 months'),
('AFFIRM-24MO', 'Pay in 24', 'Split your purchase into 24 monthly payments', 'affirm', 24, 9.99, 25000, NULL, false, 'Pay as low as $XX/mo', 'Low monthly payments'),
('SYNC-PROMO', 'Special Financing', 'No interest if paid in full within 18 months', 'synchrony', 18, 0, 50000, NULL, true, 'No Interest for 18 Months', 'Special Financing Available')
ON CONFLICT (financing_code) DO NOTHING;

-- Sample upsell strategies
INSERT INTO upsell_strategies (name, upsell_type, trigger_type, trigger_value, display_location, display_priority, is_active) VALUES
-- TV upgrade strategy
('TV Size Upgrade', 'upgrade', 'category', '{"category_ids": [1], "min_price_cents": 30000}', 'product_page', 10, true),

-- Installation service for TVs
('TV Installation Offer', 'service', 'category', '{"category_ids": [1], "min_price_cents": 50000}', 'checkout', 20, true),

-- Phone setup for phone purchases
('Phone Setup Service', 'service', 'category', '{"category_ids": [2]}', 'checkout', 30, true),

-- Membership upsell for high-value carts
('Membership Signup - High Value', 'membership', 'cart_value', '{"min_cents": 50000}', 'checkout', 40, true),

-- Membership upsell for repeat customers
('Membership Signup - Returning', 'membership', 'customer_type', '{"types": ["returning"], "has_membership": false, "min_orders": 2}', 'checkout', 50, true),

-- Financing for expensive purchases
('Financing Promotion', 'financing', 'cart_value', '{"min_cents": 100000}', 'checkout', 60, true),

-- Computer setup bundle
('Computer Setup Bundle', 'bundle', 'category', '{"category_ids": [3]}', 'checkout', 35, true)
ON CONFLICT DO NOTHING;

-- Sample upsell offers
-- Get strategy IDs (assuming sequential insertion)
DO $$
DECLARE
    v_tv_upgrade_id INTEGER;
    v_tv_install_id INTEGER;
    v_phone_setup_id INTEGER;
    v_membership_hv_id INTEGER;
    v_membership_ret_id INTEGER;
    v_financing_id INTEGER;
    v_computer_bundle_id INTEGER;
    v_install_basic_id INTEGER;
    v_install_premium_id INTEGER;
    v_setup_phone_id INTEGER;
    v_setup_computer_id INTEGER;
    v_membership_plus_id INTEGER;
    v_membership_pro_id INTEGER;
    v_affirm_12_id INTEGER;
BEGIN
    -- Get strategy IDs
    SELECT id INTO v_tv_upgrade_id FROM upsell_strategies WHERE name = 'TV Size Upgrade' LIMIT 1;
    SELECT id INTO v_tv_install_id FROM upsell_strategies WHERE name = 'TV Installation Offer' LIMIT 1;
    SELECT id INTO v_phone_setup_id FROM upsell_strategies WHERE name = 'Phone Setup Service' LIMIT 1;
    SELECT id INTO v_membership_hv_id FROM upsell_strategies WHERE name = 'Membership Signup - High Value' LIMIT 1;
    SELECT id INTO v_membership_ret_id FROM upsell_strategies WHERE name = 'Membership Signup - Returning' LIMIT 1;
    SELECT id INTO v_financing_id FROM upsell_strategies WHERE name = 'Financing Promotion' LIMIT 1;
    SELECT id INTO v_computer_bundle_id FROM upsell_strategies WHERE name = 'Computer Setup Bundle' LIMIT 1;

    -- Get service/membership IDs
    SELECT id INTO v_install_basic_id FROM services WHERE service_code = 'INSTALL-TV-BASIC' LIMIT 1;
    SELECT id INTO v_install_premium_id FROM services WHERE service_code = 'INSTALL-TV-PREMIUM' LIMIT 1;
    SELECT id INTO v_setup_phone_id FROM services WHERE service_code = 'SETUP-PHONE' LIMIT 1;
    SELECT id INTO v_setup_computer_id FROM services WHERE service_code = 'SETUP-COMPUTER' LIMIT 1;
    SELECT id INTO v_membership_plus_id FROM membership_programs WHERE program_code = 'TELETIME-PLUS' LIMIT 1;
    SELECT id INTO v_membership_pro_id FROM membership_programs WHERE program_code = 'TELETIME-PRO' LIMIT 1;
    SELECT id INTO v_affirm_12_id FROM financing_options WHERE financing_code = 'AFFIRM-12MO' LIMIT 1;

    -- TV Installation offers
    IF v_tv_install_id IS NOT NULL AND v_install_basic_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, offer_value_cents, target_type, target_service_id, badge_text, cta_text, display_order)
        VALUES
        (v_tv_install_id, 'Add Basic Installation', 'Professional wall mounting with your existing mount', 'add_on', 9999, 'service', v_install_basic_id, 'POPULAR', 'Add Installation', 1),
        (v_tv_install_id, 'Add Premium Installation', 'Complete installation with mount and cable concealment included', 'add_on', 24999, 'service', v_install_premium_id, 'BEST VALUE', 'Add Premium', 2)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Phone setup offer
    IF v_phone_setup_id IS NOT NULL AND v_setup_phone_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, offer_value_cents, target_type, target_service_id, badge_text, cta_text)
        VALUES (v_phone_setup_id, 'Phone Setup & Data Transfer', 'We''ll set up your new phone and transfer everything from your old device', 'add_on', 4999, 'service', v_setup_phone_id, 'SAVE TIME', 'Add Setup')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Membership offers
    IF v_membership_hv_id IS NOT NULL AND v_membership_plus_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, offer_value_cents, target_type, target_membership_id, badge_text, cta_text, display_order)
        VALUES
        (v_membership_hv_id, 'Join TeleTime Plus', 'Get 5% off today''s purchase + $20 bonus credit', 'add_on', 4999, 'membership', v_membership_plus_id, 'SAVE 5%', 'Join Now', 1),
        (v_membership_hv_id, 'Join TeleTime Pro', 'Get 10% off today''s purchase + $50 bonus credit', 'add_on', 9999, 'membership', v_membership_pro_id, 'BEST VALUE', 'Go Pro', 2)
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_membership_ret_id IS NOT NULL AND v_membership_plus_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, offer_value_cents, target_type, target_membership_id, badge_text, cta_text)
        VALUES (v_membership_ret_id, 'You qualify for TeleTime Plus!', 'Based on your purchase history, start saving 5% on every order', 'add_on', 4999, 'membership', v_membership_plus_id, 'EXCLUSIVE', 'Claim Offer')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Financing offer
    IF v_financing_id IS NOT NULL AND v_affirm_12_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, target_type, target_financing_id, badge_text, cta_text)
        VALUES (v_financing_id, 'Pay Over Time with 0% APR', 'Split your purchase into 12 easy monthly payments - no interest!', 'financing_promo', 'financing', v_affirm_12_id, '0% APR', 'Apply Now')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Computer bundle offer
    IF v_computer_bundle_id IS NOT NULL AND v_setup_computer_id IS NOT NULL THEN
        INSERT INTO upsell_offers (strategy_id, offer_title, offer_subtitle, offer_type, offer_value_cents, offer_value_percent, target_type, target_service_id, badge_text, cta_text)
        VALUES (v_computer_bundle_id, 'Complete Setup Package', 'Computer setup, data transfer, and 1-hour training session', 'percent_discount', NULL, 20, 'service', v_setup_computer_id, 'SAVE 20%', 'Add Setup')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- 10. TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_upsell_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_upsell_strategies_timestamp
    BEFORE UPDATE ON upsell_strategies
    FOR EACH ROW EXECUTE FUNCTION update_upsell_timestamp();

CREATE TRIGGER trg_upsell_offers_timestamp
    BEFORE UPDATE ON upsell_offers
    FOR EACH ROW EXECUTE FUNCTION update_upsell_timestamp();

CREATE TRIGGER trg_services_timestamp
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_upsell_timestamp();

CREATE TRIGGER trg_membership_programs_timestamp
    BEFORE UPDATE ON membership_programs
    FOR EACH ROW EXECUTE FUNCTION update_upsell_timestamp();

CREATE TRIGGER trg_customer_memberships_timestamp
    BEFORE UPDATE ON customer_memberships
    FOR EACH ROW EXECUTE FUNCTION update_upsell_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE upsell_strategies IS 'Defines upsell rules and triggers for different scenarios';
COMMENT ON TABLE upsell_offers IS 'Specific offers tied to upsell strategies';
COMMENT ON TABLE upsell_results IS 'Tracks all upsell impressions and conversions for analytics';
COMMENT ON TABLE services IS 'Catalog of services available for purchase (installation, setup, training)';
COMMENT ON TABLE membership_programs IS 'Loyalty/membership program definitions';
COMMENT ON TABLE financing_options IS 'Available financing and payment plan options';
COMMENT ON TABLE customer_memberships IS 'Tracks customer enrollments in membership programs';
COMMENT ON TABLE customer_services IS 'Tracks services purchased by customers';
