-- Migration 025: Financing Applications and Agreements
-- Tracks financing applications, approvals, and payment schedules

-- ============================================================================
-- FINANCING APPLICATIONS
-- ============================================================================

-- Customer financing applications
CREATE TABLE IF NOT EXISTS financing_applications (
    id SERIAL PRIMARY KEY,
    application_number VARCHAR(50) UNIQUE NOT NULL,

    -- References
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    order_id INTEGER REFERENCES orders(id),
    transaction_id INTEGER REFERENCES transactions(transaction_id),
    financing_option_id INTEGER NOT NULL REFERENCES financing_options(id),

    -- Application details
    requested_amount_cents INTEGER NOT NULL,
    approved_amount_cents INTEGER,
    term_months INTEGER NOT NULL,
    apr DECIMAL(5,2) NOT NULL,

    -- Status workflow: pending -> under_review -> approved/declined -> active -> completed/defaulted
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'under_review', 'approved', 'declined', 'active', 'completed', 'cancelled', 'defaulted')),

    -- External provider tracking
    provider VARCHAR(50), -- 'internal', 'affirm', 'klarna', 'synchrony'
    external_application_id VARCHAR(255),
    external_status VARCHAR(100),
    external_response JSONB,

    -- Decision details
    decision_at TIMESTAMP,
    decision_reason TEXT,
    decline_code VARCHAR(50),

    -- For internal financing: credit check results
    credit_check_result JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- Application expiration

    -- Audit
    created_by INTEGER REFERENCES users(id),
    processed_by INTEGER REFERENCES users(id)
);

-- Create indexes for financing_applications
CREATE INDEX IF NOT EXISTS idx_financing_applications_customer ON financing_applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_order ON financing_applications(order_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_status ON financing_applications(status);
CREATE INDEX IF NOT EXISTS idx_financing_applications_provider ON financing_applications(provider);
CREATE INDEX IF NOT EXISTS idx_financing_applications_external_id ON financing_applications(external_application_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_number ON financing_applications(application_number);

-- ============================================================================
-- FINANCING AGREEMENTS (Active financing contracts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financing_agreements (
    id SERIAL PRIMARY KEY,
    agreement_number VARCHAR(50) UNIQUE NOT NULL,

    -- References
    application_id INTEGER NOT NULL REFERENCES financing_applications(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    financing_option_id INTEGER NOT NULL REFERENCES financing_options(id),

    -- Agreement terms
    principal_amount_cents INTEGER NOT NULL,
    total_amount_cents INTEGER NOT NULL, -- Principal + interest + fees
    total_interest_cents INTEGER NOT NULL DEFAULT 0,
    total_fees_cents INTEGER NOT NULL DEFAULT 0,
    term_months INTEGER NOT NULL,
    apr DECIMAL(5,2) NOT NULL,
    monthly_payment_cents INTEGER NOT NULL,

    -- Payment tracking
    payments_made INTEGER DEFAULT 0,
    payments_remaining INTEGER NOT NULL,
    amount_paid_cents INTEGER DEFAULT 0,
    balance_remaining_cents INTEGER NOT NULL,

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paid_off', 'defaulted', 'refinanced', 'cancelled')),

    -- Dates
    start_date DATE NOT NULL,
    first_payment_date DATE NOT NULL,
    next_payment_date DATE,
    final_payment_date DATE NOT NULL,
    paid_off_date DATE,

    -- External provider tracking
    provider VARCHAR(50),
    external_agreement_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for financing_agreements
CREATE INDEX IF NOT EXISTS idx_financing_agreements_customer ON financing_agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_financing_agreements_status ON financing_agreements(status);
CREATE INDEX IF NOT EXISTS idx_financing_agreements_next_payment ON financing_agreements(next_payment_date);
CREATE INDEX IF NOT EXISTS idx_financing_agreements_number ON financing_agreements(agreement_number);

-- ============================================================================
-- FINANCING PAYMENTS (Payment schedule and history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financing_payments (
    id SERIAL PRIMARY KEY,

    -- References
    agreement_id INTEGER NOT NULL REFERENCES financing_agreements(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),

    -- Payment details
    payment_number INTEGER NOT NULL, -- 1, 2, 3... n
    due_date DATE NOT NULL,
    amount_due_cents INTEGER NOT NULL,
    principal_portion_cents INTEGER NOT NULL,
    interest_portion_cents INTEGER NOT NULL,

    -- Actual payment
    amount_paid_cents INTEGER DEFAULT 0,
    paid_at TIMESTAMP,
    payment_method VARCHAR(50), -- 'card', 'ach', 'cash', 'auto_debit'

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'pending', 'paid', 'partial', 'late', 'missed', 'waived')),

    -- Late fees
    late_fee_cents INTEGER DEFAULT 0,
    days_late INTEGER DEFAULT 0,

    -- External tracking
    external_payment_id VARCHAR(255),
    external_response JSONB,

    -- Balance after this payment (for statement)
    balance_after_cents INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for financing_payments
CREATE INDEX IF NOT EXISTS idx_financing_payments_agreement ON financing_payments(agreement_id);
CREATE INDEX IF NOT EXISTS idx_financing_payments_customer ON financing_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_financing_payments_due_date ON financing_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_financing_payments_status ON financing_payments(status);

-- ============================================================================
-- PROVIDER CALLBACKS (External provider webhook/callback log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financing_provider_callbacks (
    id SERIAL PRIMARY KEY,

    -- Provider info
    provider VARCHAR(50) NOT NULL,
    callback_type VARCHAR(50) NOT NULL, -- 'application_update', 'payment_received', 'status_change'

    -- References (may be null if we can't match)
    application_id INTEGER REFERENCES financing_applications(id),
    agreement_id INTEGER REFERENCES financing_agreements(id),
    external_id VARCHAR(255),

    -- Callback data
    raw_payload JSONB NOT NULL,
    parsed_status VARCHAR(100),

    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,
    processing_result JSONB,
    error_message TEXT,

    -- Timestamps
    received_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for callbacks
CREATE INDEX IF NOT EXISTS idx_financing_callbacks_provider ON financing_provider_callbacks(provider);
CREATE INDEX IF NOT EXISTS idx_financing_callbacks_external_id ON financing_provider_callbacks(external_id);
CREATE INDEX IF NOT EXISTS idx_financing_callbacks_processed ON financing_provider_callbacks(processed);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate unique application number
CREATE OR REPLACE FUNCTION generate_financing_application_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_number VARCHAR(50);
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Format: FA-YYYYMMDD-XXXXX
        v_number := 'FA-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');

        SELECT EXISTS(SELECT 1 FROM financing_applications WHERE application_number = v_number) INTO v_exists;

        IF NOT v_exists THEN
            RETURN v_number;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Generate unique agreement number
CREATE OR REPLACE FUNCTION generate_financing_agreement_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_number VARCHAR(50);
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Format: FG-YYYYMMDD-XXXXX
        v_number := 'FG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');

        SELECT EXISTS(SELECT 1 FROM financing_agreements WHERE agreement_number = v_number) INTO v_exists;

        IF NOT v_exists THEN
            RETURN v_number;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Calculate monthly payment using standard amortization formula
-- For 0% APR: simply divide by months
-- For > 0% APR: M = P * [r(1+r)^n] / [(1+r)^n - 1]
CREATE OR REPLACE FUNCTION calculate_monthly_payment(
    p_principal_cents INTEGER,
    p_apr DECIMAL(5,2),
    p_term_months INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_monthly_rate DECIMAL(10,8);
    v_payment DECIMAL(12,2);
BEGIN
    IF p_term_months <= 0 THEN
        RETURN p_principal_cents;
    END IF;

    IF p_apr = 0 OR p_apr IS NULL THEN
        -- 0% APR: simple division
        RETURN CEIL(p_principal_cents::DECIMAL / p_term_months);
    END IF;

    -- Monthly interest rate
    v_monthly_rate := (p_apr / 100.0) / 12.0;

    -- Standard amortization formula
    v_payment := p_principal_cents * (v_monthly_rate * POWER(1 + v_monthly_rate, p_term_months))
                 / (POWER(1 + v_monthly_rate, p_term_months) - 1);

    RETURN CEIL(v_payment);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate payment schedule for an agreement
CREATE OR REPLACE FUNCTION generate_payment_schedule(
    p_agreement_id INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_agreement financing_agreements%ROWTYPE;
    v_monthly_rate DECIMAL(10,8);
    v_balance_cents INTEGER;
    v_payment_num INTEGER;
    v_due_date DATE;
    v_principal_cents INTEGER;
    v_interest_cents INTEGER;
BEGIN
    SELECT * INTO v_agreement FROM financing_agreements WHERE id = p_agreement_id;

    IF v_agreement IS NULL THEN
        RAISE EXCEPTION 'Agreement not found: %', p_agreement_id;
    END IF;

    -- Calculate monthly rate
    IF v_agreement.apr > 0 THEN
        v_monthly_rate := (v_agreement.apr / 100.0) / 12.0;
    ELSE
        v_monthly_rate := 0;
    END IF;

    v_balance_cents := v_agreement.principal_amount_cents;
    v_due_date := v_agreement.first_payment_date;

    FOR v_payment_num IN 1..v_agreement.term_months LOOP
        -- Calculate interest portion
        IF v_monthly_rate > 0 THEN
            v_interest_cents := CEIL(v_balance_cents * v_monthly_rate);
        ELSE
            v_interest_cents := 0;
        END IF;

        -- Calculate principal portion
        IF v_payment_num = v_agreement.term_months THEN
            -- Last payment: remaining balance
            v_principal_cents := v_balance_cents;
        ELSE
            v_principal_cents := v_agreement.monthly_payment_cents - v_interest_cents;
        END IF;

        -- Insert payment record
        INSERT INTO financing_payments (
            agreement_id,
            customer_id,
            payment_number,
            due_date,
            amount_due_cents,
            principal_portion_cents,
            interest_portion_cents,
            balance_after_cents,
            status
        ) VALUES (
            p_agreement_id,
            v_agreement.customer_id,
            v_payment_num,
            v_due_date,
            v_agreement.monthly_payment_cents,
            v_principal_cents,
            v_interest_cents,
            v_balance_cents - v_principal_cents,
            'scheduled'
        );

        -- Update balance and date for next iteration
        v_balance_cents := v_balance_cents - v_principal_cents;
        v_due_date := v_due_date + INTERVAL '1 month';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Customer financing summary view
CREATE OR REPLACE VIEW v_customer_financing_summary AS
SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    COUNT(DISTINCT fa.id) FILTER (WHERE fa.status = 'approved' OR fa.status = 'active') AS total_applications_approved,
    COUNT(DISTINCT fg.id) FILTER (WHERE fg.status = 'active') AS active_agreements,
    COALESCE(SUM(fg.balance_remaining_cents) FILTER (WHERE fg.status = 'active'), 0) AS total_balance_cents,
    COALESCE(SUM(fg.monthly_payment_cents) FILTER (WHERE fg.status = 'active'), 0) AS total_monthly_payment_cents,
    MIN(fg.next_payment_date) FILTER (WHERE fg.status = 'active') AS next_payment_date,
    COUNT(DISTINCT fp.id) FILTER (WHERE fp.status = 'late' OR fp.status = 'missed') AS late_payments
FROM customers c
LEFT JOIN financing_applications fa ON fa.customer_id = c.id
LEFT JOIN financing_agreements fg ON fg.customer_id = c.id
LEFT JOIN financing_payments fp ON fp.customer_id = c.id
GROUP BY c.id, c.name;

-- Upcoming payments view
CREATE OR REPLACE VIEW v_upcoming_financing_payments AS
SELECT
    fp.id AS payment_id,
    fp.agreement_id,
    fg.agreement_number,
    fp.customer_id,
    c.name AS customer_name,
    c.email AS customer_email,
    fp.payment_number,
    fp.due_date,
    fp.amount_due_cents,
    fp.status,
    fg.provider,
    CASE
        WHEN fp.due_date < CURRENT_DATE AND fp.status = 'scheduled' THEN 'overdue'
        WHEN fp.due_date = CURRENT_DATE THEN 'due_today'
        WHEN fp.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
        ELSE 'upcoming'
    END AS urgency
FROM financing_payments fp
JOIN financing_agreements fg ON fg.id = fp.agreement_id
JOIN customers c ON c.id = fp.customer_id
WHERE fp.status IN ('scheduled', 'pending')
ORDER BY fp.due_date ASC;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_financing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_applications_updated
    BEFORE UPDATE ON financing_applications
    FOR EACH ROW EXECUTE FUNCTION update_financing_timestamp();

CREATE TRIGGER trg_financing_agreements_updated
    BEFORE UPDATE ON financing_agreements
    FOR EACH ROW EXECUTE FUNCTION update_financing_timestamp();

CREATE TRIGGER trg_financing_payments_updated
    BEFORE UPDATE ON financing_payments
    FOR EACH ROW EXECUTE FUNCTION update_financing_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE financing_applications IS 'Customer financing applications and approval workflow';
COMMENT ON TABLE financing_agreements IS 'Active financing contracts with payment terms';
COMMENT ON TABLE financing_payments IS 'Scheduled and completed payments for financing agreements';
COMMENT ON TABLE financing_provider_callbacks IS 'Webhook callbacks from external financing providers';
COMMENT ON FUNCTION calculate_monthly_payment IS 'Calculate monthly payment using amortization formula';
COMMENT ON FUNCTION generate_payment_schedule IS 'Generate full payment schedule for a financing agreement';
