-- Migration 026: Order Financing Integration
-- Links orders/transactions to financing agreements

-- ============================================================================
-- ADD FINANCING FIELDS TO TRANSACTIONS
-- ============================================================================

-- Add financing reference to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS financing_application_id INTEGER REFERENCES financing_applications(id),
ADD COLUMN IF NOT EXISTS financing_agreement_id INTEGER REFERENCES financing_agreements(id),
ADD COLUMN IF NOT EXISTS is_financed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS financing_paid_off_at TIMESTAMP;

-- Create index for financed transactions
CREATE INDEX IF NOT EXISTS idx_transactions_financing_app ON transactions(financing_application_id);
CREATE INDEX IF NOT EXISTS idx_transactions_financing_agr ON transactions(financing_agreement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_is_financed ON transactions(is_financed) WHERE is_financed = true;

-- ============================================================================
-- ADD FINANCING FIELDS TO ORDERS
-- ============================================================================

-- Add financing reference to orders table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS financing_application_id INTEGER REFERENCES financing_applications(id),
        ADD COLUMN IF NOT EXISTS financing_agreement_id INTEGER REFERENCES financing_agreements(id),
        ADD COLUMN IF NOT EXISTS is_financed BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS financing_paid_off_at TIMESTAMP;

        CREATE INDEX IF NOT EXISTS idx_orders_financing_app ON orders(financing_application_id);
        CREATE INDEX IF NOT EXISTS idx_orders_financing_agr ON orders(financing_agreement_id);
        CREATE INDEX IF NOT EXISTS idx_orders_is_financed ON orders(is_financed) WHERE is_financed = true;
    END IF;
END $$;

-- ============================================================================
-- ADD ORDER REFERENCE TO FINANCING TABLES (bidirectional)
-- ============================================================================

-- Add order/transaction reference to payments table for financing
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS financing_agreement_id INTEGER REFERENCES financing_agreements(id),
ADD COLUMN IF NOT EXISTS is_financing_payment BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payments_financing ON payments(financing_agreement_id);

-- ============================================================================
-- FINANCING PAYOFF TRACKING
-- ============================================================================

-- Add early payoff fields to agreements
ALTER TABLE financing_agreements
ADD COLUMN IF NOT EXISTS early_payoff_date DATE,
ADD COLUMN IF NOT EXISTS early_payoff_amount_cents INTEGER,
ADD COLUMN IF NOT EXISTS early_payoff_savings_cents INTEGER;

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- View: Financed Orders Summary
CREATE OR REPLACE VIEW v_financed_orders AS
SELECT
    t.transaction_id,
    t.transaction_number,
    t.created_at AS transaction_date,
    t.total_amount,
    t.customer_id,
    c.name AS customer_name,
    c.email AS customer_email,
    fa.id AS application_id,
    fa.application_number,
    fa.status AS application_status,
    fg.id AS agreement_id,
    fg.agreement_number,
    fg.status AS agreement_status,
    fg.monthly_payment_cents,
    fg.term_months,
    fg.apr,
    fg.balance_remaining_cents,
    fg.payments_made,
    fg.payments_remaining,
    fg.next_payment_date,
    fo.name AS plan_name,
    fo.provider
FROM transactions t
JOIN customers c ON c.id = t.customer_id
LEFT JOIN financing_applications fa ON fa.id = t.financing_application_id
LEFT JOIN financing_agreements fg ON fg.id = t.financing_agreement_id
LEFT JOIN financing_options fo ON fo.id = fa.financing_option_id
WHERE t.is_financed = true;

-- View: Customer Financing Dashboard
CREATE OR REPLACE VIEW v_customer_financing_dashboard AS
SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    c.email,
    c.phone,
    -- Active financing summary
    COUNT(DISTINCT fg.id) FILTER (WHERE fg.status = 'active') AS active_agreements,
    COALESCE(SUM(fg.balance_remaining_cents) FILTER (WHERE fg.status = 'active'), 0) AS total_balance_cents,
    COALESCE(SUM(fg.monthly_payment_cents) FILTER (WHERE fg.status = 'active'), 0) AS total_monthly_payment_cents,
    MIN(fg.next_payment_date) FILTER (WHERE fg.status = 'active') AS next_payment_date,
    -- Payment history
    COUNT(DISTINCT fp.id) FILTER (WHERE fp.status = 'paid') AS total_payments_made,
    COUNT(DISTINCT fp.id) FILTER (WHERE fp.status IN ('late', 'missed')) AS late_payments,
    -- Paid off
    COUNT(DISTINCT fg.id) FILTER (WHERE fg.status = 'paid_off') AS paid_off_agreements
FROM customers c
LEFT JOIN financing_agreements fg ON fg.customer_id = c.id
LEFT JOIN financing_payments fp ON fp.customer_id = c.id
GROUP BY c.id, c.name, c.email, c.phone;

-- View: Collections Dashboard (Past Due)
CREATE OR REPLACE VIEW v_financing_collections AS
SELECT
    fp.id AS payment_id,
    fp.agreement_id,
    fg.agreement_number,
    fp.customer_id,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    fp.payment_number,
    fp.due_date,
    fp.amount_due_cents,
    fp.amount_paid_cents,
    fp.status,
    CURRENT_DATE - fp.due_date AS days_overdue,
    fp.late_fee_cents,
    fg.balance_remaining_cents AS total_balance_cents,
    fo.provider,
    -- Risk assessment
    CASE
        WHEN CURRENT_DATE - fp.due_date > 90 THEN 'critical'
        WHEN CURRENT_DATE - fp.due_date > 60 THEN 'high'
        WHEN CURRENT_DATE - fp.due_date > 30 THEN 'medium'
        ELSE 'low'
    END AS risk_level,
    -- Contact attempts (placeholder for future tracking)
    0 AS contact_attempts
FROM financing_payments fp
JOIN financing_agreements fg ON fg.id = fp.agreement_id
JOIN customers c ON c.id = fp.customer_id
JOIN financing_options fo ON fo.id = fg.financing_option_id
WHERE fp.status IN ('scheduled', 'pending')
  AND fp.due_date < CURRENT_DATE
  AND fg.status = 'active'
ORDER BY fp.due_date ASC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Calculate early payoff amount
CREATE OR REPLACE FUNCTION calculate_payoff_amount(p_agreement_id INTEGER)
RETURNS TABLE (
    agreement_id INTEGER,
    principal_remaining_cents INTEGER,
    interest_remaining_cents INTEGER,
    payoff_amount_cents INTEGER,
    savings_cents INTEGER,
    as_of_date DATE
) AS $$
DECLARE
    v_agreement financing_agreements%ROWTYPE;
    v_remaining_principal INTEGER;
    v_remaining_interest INTEGER;
    v_payoff INTEGER;
    v_savings INTEGER;
BEGIN
    SELECT * INTO v_agreement FROM financing_agreements WHERE id = p_agreement_id;

    IF v_agreement IS NULL THEN
        RETURN;
    END IF;

    -- Get remaining scheduled payments
    SELECT
        COALESCE(SUM(principal_portion_cents), 0),
        COALESCE(SUM(interest_portion_cents), 0)
    INTO v_remaining_principal, v_remaining_interest
    FROM financing_payments
    WHERE financing_payments.agreement_id = p_agreement_id
      AND status = 'scheduled';

    -- Early payoff = remaining principal only (no future interest)
    v_payoff := v_remaining_principal;

    -- Savings = interest that would have been paid
    v_savings := v_remaining_interest;

    RETURN QUERY SELECT
        p_agreement_id,
        v_remaining_principal,
        v_remaining_interest,
        v_payoff,
        v_savings,
        CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Process early payoff
CREATE OR REPLACE FUNCTION process_early_payoff(
    p_agreement_id INTEGER,
    p_payment_method VARCHAR(50) DEFAULT 'card'
)
RETURNS JSONB AS $$
DECLARE
    v_payoff RECORD;
    v_agreement financing_agreements%ROWTYPE;
BEGIN
    -- Get payoff amount
    SELECT * INTO v_payoff FROM calculate_payoff_amount(p_agreement_id);

    IF v_payoff IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Agreement not found');
    END IF;

    -- Get agreement
    SELECT * INTO v_agreement FROM financing_agreements WHERE id = p_agreement_id;

    IF v_agreement.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Agreement is not active');
    END IF;

    -- Mark all scheduled payments as paid
    UPDATE financing_payments
    SET status = 'paid',
        amount_paid_cents = principal_portion_cents,
        paid_at = NOW(),
        payment_method = p_payment_method
    WHERE agreement_id = p_agreement_id
      AND status = 'scheduled';

    -- Update agreement
    UPDATE financing_agreements
    SET status = 'paid_off',
        paid_off_date = CURRENT_DATE,
        early_payoff_date = CURRENT_DATE,
        early_payoff_amount_cents = v_payoff.payoff_amount_cents,
        early_payoff_savings_cents = v_payoff.savings_cents,
        balance_remaining_cents = 0,
        payments_remaining = 0,
        amount_paid_cents = principal_amount_cents
    WHERE id = p_agreement_id;

    RETURN jsonb_build_object(
        'success', true,
        'payoff_amount_cents', v_payoff.payoff_amount_cents,
        'savings_cents', v_payoff.savings_cents,
        'paid_off_date', CURRENT_DATE
    );
END;
$$ LANGUAGE plpgsql;

-- Link transaction to financing
CREATE OR REPLACE FUNCTION link_transaction_financing(
    p_transaction_id INTEGER,
    p_application_id INTEGER,
    p_agreement_id INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE transactions
    SET financing_application_id = p_application_id,
        financing_agreement_id = p_agreement_id,
        is_financed = true
    WHERE transaction_id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW v_financed_orders IS 'Summary of all orders paid via financing';
COMMENT ON VIEW v_customer_financing_dashboard IS 'Customer financing overview for account pages';
COMMENT ON VIEW v_financing_collections IS 'Past due accounts for collections workflow';
COMMENT ON FUNCTION calculate_payoff_amount IS 'Calculate early payoff amount for an agreement';
COMMENT ON FUNCTION process_early_payoff IS 'Process early payoff and close agreement';
