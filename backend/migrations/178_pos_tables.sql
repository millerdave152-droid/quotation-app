-- TeleTime POS System Tables
-- Migration: 001_pos_tables.sql
-- Description: Creates core POS tables for register management, transactions, and payments

-- ============================================================================
-- SEQUENCE FOR TRANSACTION NUMBERS
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS transaction_number_seq START 1;

-- ============================================================================
-- FUNCTION: Generate Transaction Number
-- Format: TXN-YYYYMMDD-0001
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    today_date VARCHAR(8);
    seq_num INTEGER;
    txn_number VARCHAR(20);
BEGIN
    today_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    -- Check if we need to reset the sequence for a new day
    -- Get the last transaction number for today
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(transaction_number FROM 14 FOR 4) AS INTEGER)),
        0
    ) + 1 INTO seq_num
    FROM transactions
    WHERE transaction_number LIKE 'TXN-' || today_date || '-%';

    txn_number := 'TXN-' || today_date || '-' || LPAD(seq_num::TEXT, 4, '0');

    RETURN txn_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE: registers
-- Store register/terminal information
-- ============================================================================

CREATE TABLE IF NOT EXISTS registers (
    register_id SERIAL PRIMARY KEY,
    register_name VARCHAR(50) NOT NULL,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE registers IS 'POS register/terminal information';
COMMENT ON COLUMN registers.register_name IS 'Display name for the register (e.g., Register 1, Front Counter)';
COMMENT ON COLUMN registers.location IS 'Physical location of the register';

-- ============================================================================
-- TABLE: register_shifts
-- Track who is operating each register and cash reconciliation
-- ============================================================================

CREATE TABLE IF NOT EXISTS register_shifts (
    shift_id SERIAL PRIMARY KEY,
    register_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    opened_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    opening_cash DECIMAL(10,2) NOT NULL,
    closing_cash DECIMAL(10,2),
    expected_cash DECIMAL(10,2),
    cash_variance DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,

    CONSTRAINT fk_register_shifts_register
        FOREIGN KEY (register_id) REFERENCES registers(register_id),
    CONSTRAINT fk_register_shifts_user
        FOREIGN KEY (user_id) REFERENCES users(id)
);

COMMENT ON TABLE register_shifts IS 'Tracks register shifts and cash drawer reconciliation';
COMMENT ON COLUMN register_shifts.opening_cash IS 'Cash in drawer at shift start';
COMMENT ON COLUMN register_shifts.closing_cash IS 'Actual cash counted at shift end';
COMMENT ON COLUMN register_shifts.expected_cash IS 'Calculated expected cash based on transactions';
COMMENT ON COLUMN register_shifts.cash_variance IS 'Difference between expected and actual (closing - expected)';

-- ============================================================================
-- TABLE: transactions
-- Sales transaction records
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id SERIAL PRIMARY KEY,
    transaction_number VARCHAR(20) UNIQUE NOT NULL,
    shift_id INTEGER NOT NULL,
    customer_id INTEGER,
    quote_id INTEGER,
    user_id INTEGER NOT NULL,
    salesperson_id INTEGER,
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    discount_reason VARCHAR(200),
    hst_amount DECIMAL(10,2) DEFAULT 0,
    gst_amount DECIMAL(10,2) DEFAULT 0,
    pst_amount DECIMAL(10,2) DEFAULT 0,
    tax_province VARCHAR(2) DEFAULT 'ON',
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'voided', 'refunded')),
    voided_by INTEGER,
    void_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    CONSTRAINT fk_transactions_shift
        FOREIGN KEY (shift_id) REFERENCES register_shifts(shift_id),
    CONSTRAINT fk_transactions_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id),
    -- Note: quote_id is not enforced via FK since quotes may be in a different schema/table
    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_transactions_salesperson
        FOREIGN KEY (salesperson_id) REFERENCES users(id),
    CONSTRAINT fk_transactions_voided_by
        FOREIGN KEY (voided_by) REFERENCES users(id)
);

COMMENT ON TABLE transactions IS 'POS sales transactions';
COMMENT ON COLUMN transactions.transaction_number IS 'Human-readable transaction ID (TXN-YYYYMMDD-0001)';
COMMENT ON COLUMN transactions.quote_id IS 'Reference to quote if this transaction was converted from a quote';
COMMENT ON COLUMN transactions.user_id IS 'Cashier who processed the transaction';
COMMENT ON COLUMN transactions.salesperson_id IS 'Original salesperson from quote (for commission tracking)';
COMMENT ON COLUMN transactions.tax_province IS 'Province code for tax calculation (ON, BC, AB, etc.)';

-- ============================================================================
-- TABLE: transaction_items
-- Line items for each sale
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_items (
    item_id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    unit_cost DECIMAL(10,2),
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) NOT NULL,
    serial_number VARCHAR(100),
    taxable BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_transaction_items_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    CONSTRAINT fk_transaction_items_product
        FOREIGN KEY (product_id) REFERENCES products(id)
);

COMMENT ON TABLE transaction_items IS 'Line items for POS transactions';
COMMENT ON COLUMN transaction_items.product_name IS 'Snapshot of product name at time of sale';
COMMENT ON COLUMN transaction_items.product_sku IS 'Snapshot of product SKU at time of sale';
COMMENT ON COLUMN transaction_items.unit_cost IS 'Cost at time of sale for margin tracking';
COMMENT ON COLUMN transaction_items.serial_number IS 'Serial number for electronics/appliances';

-- ============================================================================
-- TABLE: payments
-- Payment records (supports split payments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
    payment_id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'credit', 'debit', 'gift_card')),
    amount DECIMAL(10,2) NOT NULL,
    card_last_four VARCHAR(4),
    card_brand VARCHAR(20),
    authorization_code VARCHAR(50),
    processor_reference VARCHAR(100),
    cash_tendered DECIMAL(10,2),
    change_given DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
    processed_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_payments_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE
);

COMMENT ON TABLE payments IS 'Payment records for transactions (supports split payments)';
COMMENT ON COLUMN payments.card_brand IS 'Card brand: visa, mastercard, amex, etc.';
COMMENT ON COLUMN payments.processor_reference IS 'External payment processor reference (e.g., Stripe payment intent ID)';
COMMENT ON COLUMN payments.cash_tendered IS 'Amount of cash given by customer (for cash payments)';
COMMENT ON COLUMN payments.change_given IS 'Change returned to customer (for cash payments)';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shift ON transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_quote ON transactions(quote_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

-- Additional useful indexes
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_number ON transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_register_shifts_status ON register_shifts(status);
CREATE INDEX IF NOT EXISTS idx_register_shifts_register ON register_shifts(register_id);

-- ============================================================================
-- TRIGGER: Auto-generate transaction number
-- ============================================================================

CREATE OR REPLACE FUNCTION set_transaction_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_number IS NULL OR NEW.transaction_number = '' THEN
        NEW.transaction_number := generate_transaction_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_transaction_number ON transactions;

CREATE TRIGGER trigger_set_transaction_number
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_transaction_number();

-- ============================================================================
-- TRIGGER: Calculate cash variance on shift close
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_cash_variance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed' AND OLD.status = 'open' THEN
        -- Calculate expected cash: opening + cash payments received
        SELECT
            NEW.opening_cash + COALESCE(SUM(p.amount), 0) - COALESCE(SUM(p.change_given), 0)
        INTO NEW.expected_cash
        FROM transactions t
        JOIN payments p ON t.transaction_id = p.transaction_id
        WHERE t.shift_id = NEW.shift_id
          AND p.payment_method = 'cash'
          AND p.status = 'completed'
          AND t.status IN ('completed', 'refunded');

        -- Calculate variance
        IF NEW.closing_cash IS NOT NULL AND NEW.expected_cash IS NOT NULL THEN
            NEW.cash_variance := NEW.closing_cash - NEW.expected_cash;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_cash_variance ON register_shifts;

CREATE TRIGGER trigger_calculate_cash_variance
    BEFORE UPDATE ON register_shifts
    FOR EACH ROW
    EXECUTE FUNCTION calculate_cash_variance();
