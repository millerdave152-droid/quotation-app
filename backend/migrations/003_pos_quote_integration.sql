-- ============================================================================
-- Migration 003: POS-Quotation Integration Enhancement
-- ============================================================================
-- This migration enhances the integration between the quotation system and POS
-- to ensure seamless quote-to-order-to-transaction conversion.
--
-- Key changes:
-- 1. Add missing foreign key relationships
-- 2. Standardize discount fields across systems
-- 3. Add unified payment tracking
-- 4. Add commission/attribution tracking
-- 5. Add conversion audit trail
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ENHANCE TRANSACTIONS TABLE
-- Link POS transactions to orders and invoices for full traceability
-- ============================================================================

-- Add order_id and invoice_id to transactions if they don't exist
DO $$
BEGIN
    -- Add order_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'order_id'
    ) THEN
        ALTER TABLE transactions ADD COLUMN order_id INTEGER REFERENCES orders(id);
        CREATE INDEX idx_transactions_order_id ON transactions(order_id);
    END IF;

    -- Add invoice_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE transactions ADD COLUMN invoice_id INTEGER REFERENCES invoices(id);
        CREATE INDEX idx_transactions_invoice_id ON transactions(invoice_id);
    END IF;

    -- Add discount_reason if missing (for quote discount transfer)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'discount_reason'
    ) THEN
        ALTER TABLE transactions ADD COLUMN discount_reason VARCHAR(200);
    END IF;

    -- Add source field to track where transaction originated
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'source'
    ) THEN
        ALTER TABLE transactions ADD COLUMN source VARCHAR(30) DEFAULT 'pos';
        -- source: 'pos' (direct sale), 'quote' (from quote), 'order' (from order), 'invoice' (from invoice)
    END IF;

    -- Add original_quote_discount to preserve quote discount info
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'original_quote_discount_cents'
    ) THEN
        ALTER TABLE transactions ADD COLUMN original_quote_discount_cents INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: ENHANCE QUOTATIONS TABLE
-- Add POS conversion tracking fields
-- ============================================================================

DO $$
BEGIN
    -- Add transaction_id to track POS conversion
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'transaction_id'
    ) THEN
        ALTER TABLE quotations ADD COLUMN transaction_id INTEGER;
        -- Note: FK added after transactions table is confirmed
    END IF;

    -- Add converted_to_transaction_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'converted_to_transaction_at'
    ) THEN
        ALTER TABLE quotations ADD COLUMN converted_to_transaction_at TIMESTAMP;
    END IF;

    -- Add discount_reason if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'discount_reason'
    ) THEN
        ALTER TABLE quotations ADD COLUMN discount_reason VARCHAR(200);
    END IF;

    -- Add salesperson tracking if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'salesperson_id'
    ) THEN
        ALTER TABLE quotations ADD COLUMN salesperson_id INTEGER REFERENCES users(id);
    END IF;
END $$;

-- ============================================================================
-- SECTION 3: UNIFIED CONVERSION TRACKING TABLE
-- Track all quote/order/invoice/transaction conversions in one place
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversion_audit (
    id SERIAL PRIMARY KEY,

    -- Source document
    source_type VARCHAR(30) NOT NULL, -- 'quote', 'order', 'invoice'
    source_id INTEGER NOT NULL,
    source_number VARCHAR(50), -- quotation_number, order_number, invoice_number

    -- Target document
    target_type VARCHAR(30) NOT NULL, -- 'order', 'invoice', 'transaction'
    target_id INTEGER NOT NULL,
    target_number VARCHAR(50),

    -- Conversion details
    conversion_type VARCHAR(30) NOT NULL, -- 'full', 'partial', 'split'
    converted_amount_cents INTEGER,

    -- Financial snapshot at conversion
    source_subtotal_cents INTEGER,
    source_discount_cents INTEGER,
    source_tax_cents INTEGER,
    source_total_cents INTEGER,

    -- Attribution
    converted_by INTEGER REFERENCES users(id),
    conversion_reason VARCHAR(200),
    notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_conversion_audit_source ON conversion_audit(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_conversion_audit_target ON conversion_audit(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_conversion_audit_created ON conversion_audit(created_at);

-- ============================================================================
-- SECTION 4: COMMISSION TRACKING TABLE
-- Track salesperson commissions from both quotes and POS sales
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_commissions (
    id SERIAL PRIMARY KEY,

    -- Salesperson
    salesperson_id INTEGER NOT NULL REFERENCES users(id),

    -- Source of sale (supports multiple sources)
    source_type VARCHAR(30) NOT NULL, -- 'quote', 'order', 'transaction'
    source_id INTEGER NOT NULL,
    source_number VARCHAR(50),

    -- Customer
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(255),

    -- Financial
    sale_amount_cents INTEGER NOT NULL,
    commission_rate DECIMAL(5,4) DEFAULT 0.0000, -- e.g., 0.0250 = 2.5%
    commission_amount_cents INTEGER NOT NULL,

    -- Status
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'cancelled'
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,

    -- Period tracking
    commission_period VARCHAR(20), -- e.g., '2026-01' for January 2026

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commissions_salesperson ON sales_commissions(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON sales_commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON sales_commissions(commission_period);
CREATE INDEX IF NOT EXISTS idx_commissions_source ON sales_commissions(source_type, source_id);

-- ============================================================================
-- SECTION 5: UNIFIED PAYMENT BRIDGE TABLE
-- Links payments across invoice_payments and POS payments for reconciliation
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_reconciliation (
    id SERIAL PRIMARY KEY,

    -- Payment source (one of these will be set)
    invoice_payment_id INTEGER REFERENCES invoice_payments(id),
    pos_payment_id INTEGER, -- References payments(id)

    -- Unified reference
    unified_reference VARCHAR(100),

    -- Common fields for reporting
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    amount_cents INTEGER NOT NULL,

    -- Links to source documents
    customer_id INTEGER REFERENCES customers(id),
    quotation_id INTEGER,
    order_id INTEGER REFERENCES orders(id),
    invoice_id INTEGER REFERENCES invoices(id),
    transaction_id INTEGER,

    -- Reconciliation status
    reconciliation_status VARCHAR(30) DEFAULT 'unreconciled', -- 'unreconciled', 'reconciled', 'disputed'
    reconciled_at TIMESTAMP,
    reconciled_by INTEGER REFERENCES users(id),

    -- Bank/accounting integration
    bank_reference VARCHAR(100),
    accounting_code VARCHAR(50),
    exported_to_accounting BOOLEAN DEFAULT FALSE,
    exported_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_recon_date ON payment_reconciliation(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_recon_status ON payment_reconciliation(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_payment_recon_customer ON payment_reconciliation(customer_id);

-- ============================================================================
-- SECTION 6: ENHANCE TRANSACTION_ITEMS TABLE
-- Add fields to preserve quote item information
-- ============================================================================

DO $$
BEGIN
    -- Add quotation_item_id to link back to original quote item
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transaction_items' AND column_name = 'quotation_item_id'
    ) THEN
        ALTER TABLE transaction_items ADD COLUMN quotation_item_id INTEGER;
    END IF;

    -- Add order_item_id to link to order item
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transaction_items' AND column_name = 'order_item_id'
    ) THEN
        ALTER TABLE transaction_items ADD COLUMN order_item_id INTEGER;
    END IF;

    -- Add discount_reason for item-level discount tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transaction_items' AND column_name = 'discount_reason'
    ) THEN
        ALTER TABLE transaction_items ADD COLUMN discount_reason VARCHAR(200);
    END IF;

    -- Add original price fields for audit trail
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transaction_items' AND column_name = 'original_quote_price'
    ) THEN
        ALTER TABLE transaction_items ADD COLUMN original_quote_price DECIMAL(10,2);
    END IF;

    -- Add margin tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transaction_items' AND column_name = 'margin_amount'
    ) THEN
        ALTER TABLE transaction_items ADD COLUMN margin_amount DECIMAL(10,2);
        ALTER TABLE transaction_items ADD COLUMN margin_percent DECIMAL(5,2);
    END IF;
END $$;

-- ============================================================================
-- SECTION 7: CREATE VIEW FOR UNIFIED SALES REPORTING
-- Combines quotations, orders, invoices, and transactions for reporting
-- ============================================================================

CREATE OR REPLACE VIEW unified_sales_view AS
SELECT
    'transaction' as document_type,
    t.id as document_id,
    t.transaction_number as document_number,
    t.created_at as document_date,
    t.status,
    t.customer_id,
    c.name as customer_name,
    t.subtotal as subtotal_amount,
    t.discount_amount,
    t.discount_reason,
    (t.hst_amount + t.gst_amount + t.pst_amount) as tax_amount,
    t.total_amount,
    t.salesperson_id,
    u.first_name || ' ' || u.last_name as salesperson_name,
    t.source,
    t.quote_id as related_quote_id,
    t.order_id as related_order_id,
    t.invoice_id as related_invoice_id,
    'completed' as payment_status
FROM transactions t
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN users u ON t.salesperson_id = u.id
WHERE t.status = 'completed'

UNION ALL

SELECT
    'order' as document_type,
    o.id as document_id,
    o.order_number as document_number,
    o.created_at as document_date,
    o.status,
    o.customer_id,
    c.name as customer_name,
    o.subtotal_cents / 100.0 as subtotal_amount,
    o.discount_cents / 100.0 as discount_amount,
    NULL as discount_reason,
    o.tax_cents / 100.0 as tax_amount,
    o.total_cents / 100.0 as total_amount,
    o.created_by as salesperson_id,
    u.first_name || ' ' || u.last_name as salesperson_name,
    o.source,
    o.quotation_id as related_quote_id,
    NULL as related_order_id,
    NULL as related_invoice_id,
    o.payment_status
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN users u ON o.created_by = u.id
WHERE o.status NOT IN ('cancelled')

UNION ALL

SELECT
    'invoice' as document_type,
    i.id as document_id,
    i.invoice_number as document_number,
    i.invoice_date as document_date,
    i.status,
    i.customer_id,
    c.name as customer_name,
    i.subtotal_cents / 100.0 as subtotal_amount,
    i.discount_cents / 100.0 as discount_amount,
    NULL as discount_reason,
    i.tax_cents / 100.0 as tax_amount,
    i.total_cents / 100.0 as total_amount,
    i.created_by as salesperson_id,
    u.first_name || ' ' || u.last_name as salesperson_name,
    'invoice' as source,
    i.quotation_id as related_quote_id,
    i.order_id as related_order_id,
    NULL as related_invoice_id,
    i.status as payment_status
FROM invoices i
LEFT JOIN customers c ON i.customer_id = c.id
LEFT JOIN users u ON i.created_by = u.id
WHERE i.status NOT IN ('void', 'cancelled');

-- ============================================================================
-- SECTION 8: FUNCTION TO CONVERT QUOTE TO POS TRANSACTION
-- Handles the full conversion with proper data mapping
-- ============================================================================

CREATE OR REPLACE FUNCTION convert_quote_to_transaction(
    p_quote_id INTEGER,
    p_shift_id INTEGER,
    p_cashier_id INTEGER,
    p_payments JSONB DEFAULT '[]'
)
RETURNS TABLE (
    success BOOLEAN,
    transaction_id INTEGER,
    transaction_number VARCHAR(20),
    error_message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_quote RECORD;
    v_transaction_id INTEGER;
    v_transaction_number VARCHAR(20);
    v_item RECORD;
    v_payment RECORD;
    v_total_payment DECIMAL(10,2) := 0;
BEGIN
    -- Get quote details
    SELECT
        q.*,
        COALESCE(q.discount_cents, 0) / 100.0 as discount_amount_decimal,
        COALESCE(q.subtotal_cents, 0) / 100.0 as subtotal_decimal,
        COALESCE(q.tax_cents, 0) / 100.0 as tax_decimal,
        COALESCE(q.total_cents, 0) / 100.0 as total_decimal
    INTO v_quote
    FROM quotations q
    WHERE q.id = p_quote_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::VARCHAR(20), 'Quote not found'::TEXT;
        RETURN;
    END IF;

    IF v_quote.status = 'converted' THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::VARCHAR(20), 'Quote already converted'::TEXT;
        RETURN;
    END IF;

    -- Create transaction
    INSERT INTO transactions (
        shift_id,
        customer_id,
        quote_id,
        user_id,
        salesperson_id,
        subtotal,
        discount_amount,
        discount_reason,
        hst_amount,
        gst_amount,
        pst_amount,
        tax_province,
        total_amount,
        status,
        source,
        original_quote_discount_cents,
        created_at
    ) VALUES (
        p_shift_id,
        v_quote.customer_id,
        p_quote_id,
        p_cashier_id,
        COALESCE(v_quote.salesperson_id, v_quote.user_id),
        v_quote.subtotal_decimal,
        v_quote.discount_amount_decimal,
        v_quote.discount_reason,
        v_quote.tax_decimal, -- Assuming HST for Ontario
        0,
        0,
        'ON',
        v_quote.total_decimal,
        'pending',
        'quote',
        v_quote.discount_cents,
        CURRENT_TIMESTAMP
    )
    RETURNING id, transaction_number INTO v_transaction_id, v_transaction_number;

    -- Copy quote items to transaction items
    FOR v_item IN
        SELECT
            qi.product_id,
            p.name as product_name,
            p.model as product_sku,
            qi.quantity,
            COALESCE(qi.unit_price_cents, qi.unit_price * 100) / 100.0 as unit_price,
            COALESCE(p.actual_cost, p.cost_cents / 100.0) as unit_cost,
            COALESCE(qi.discount_percent, 0) as discount_percent,
            qi.id as quotation_item_id
        FROM quotation_items qi
        JOIN products p ON qi.product_id = p.id
        WHERE qi.quotation_id = p_quote_id
    LOOP
        INSERT INTO transaction_items (
            transaction_id,
            product_id,
            product_name,
            product_sku,
            quantity,
            unit_price,
            unit_cost,
            discount_percent,
            discount_amount,
            tax_amount,
            line_total,
            taxable,
            quotation_item_id,
            original_quote_price,
            created_at
        ) VALUES (
            v_transaction_id,
            v_item.product_id,
            v_item.product_name,
            v_item.product_sku,
            v_item.quantity,
            v_item.unit_price,
            v_item.unit_cost,
            v_item.discount_percent,
            v_item.unit_price * v_item.quantity * v_item.discount_percent / 100,
            0, -- Tax calculated at transaction level
            v_item.unit_price * v_item.quantity * (1 - v_item.discount_percent / 100),
            TRUE,
            v_item.quotation_item_id,
            v_item.unit_price,
            CURRENT_TIMESTAMP
        );
    END LOOP;

    -- Process payments if provided
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS p(
        payment_method VARCHAR(50),
        amount DECIMAL(10,2),
        card_last_four VARCHAR(4),
        card_brand VARCHAR(20),
        authorization_code VARCHAR(50),
        cash_tendered DECIMAL(10,2),
        change_given DECIMAL(10,2)
    )
    LOOP
        INSERT INTO payments (
            transaction_id,
            payment_method,
            amount,
            card_last_four,
            card_brand,
            authorization_code,
            cash_tendered,
            change_given,
            status,
            processed_at
        ) VALUES (
            v_transaction_id,
            v_payment.payment_method,
            v_payment.amount,
            v_payment.card_last_four,
            v_payment.card_brand,
            v_payment.authorization_code,
            v_payment.cash_tendered,
            v_payment.change_given,
            'completed',
            CURRENT_TIMESTAMP
        );

        v_total_payment := v_total_payment + v_payment.amount;
    END LOOP;

    -- If payments cover the total, mark as completed
    IF v_total_payment >= v_quote.total_decimal - 0.01 THEN
        UPDATE transactions
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = v_transaction_id;

        -- Update quote status
        UPDATE quotations
        SET
            status = 'converted',
            transaction_id = v_transaction_id,
            converted_to_transaction_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_quote_id;

        -- Create conversion audit record
        INSERT INTO conversion_audit (
            source_type,
            source_id,
            source_number,
            target_type,
            target_id,
            target_number,
            conversion_type,
            converted_amount_cents,
            source_subtotal_cents,
            source_discount_cents,
            source_tax_cents,
            source_total_cents,
            converted_by
        ) VALUES (
            'quote',
            p_quote_id,
            v_quote.quotation_number,
            'transaction',
            v_transaction_id,
            v_transaction_number,
            'full',
            v_quote.total_cents,
            v_quote.subtotal_cents,
            v_quote.discount_cents,
            v_quote.tax_cents,
            v_quote.total_cents,
            p_cashier_id
        );
    END IF;

    RETURN QUERY SELECT TRUE, v_transaction_id, v_transaction_number, NULL::TEXT;
END;
$$;

-- ============================================================================
-- SECTION 9: FUNCTION TO CALCULATE COMMISSION
-- Auto-calculates commission when a sale is completed
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_salesperson_id INTEGER;
    v_sale_amount_cents INTEGER;
    v_commission_rate DECIMAL(5,4);
    v_commission_amount INTEGER;
BEGIN
    -- Only process completed transactions
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        v_salesperson_id := COALESCE(NEW.salesperson_id, NEW.user_id);
        v_sale_amount_cents := (NEW.total_amount * 100)::INTEGER;

        -- Default commission rate (could be pulled from a config table)
        v_commission_rate := 0.0200; -- 2%
        v_commission_amount := (v_sale_amount_cents * v_commission_rate)::INTEGER;

        -- Insert commission record
        INSERT INTO sales_commissions (
            salesperson_id,
            source_type,
            source_id,
            source_number,
            customer_id,
            sale_amount_cents,
            commission_rate,
            commission_amount_cents,
            commission_period
        ) VALUES (
            v_salesperson_id,
            'transaction',
            NEW.id,
            NEW.transaction_number,
            NEW.customer_id,
            v_sale_amount_cents,
            v_commission_rate,
            v_commission_amount,
            TO_CHAR(NEW.completed_at, 'YYYY-MM')
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for commission calculation
DROP TRIGGER IF EXISTS trg_calculate_commission ON transactions;
CREATE TRIGGER trg_calculate_commission
    AFTER INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_commission();

-- ============================================================================
-- SECTION 10: ADD CONSTRAINT FOR DATA INTEGRITY
-- Ensure proper relationships
-- ============================================================================

-- Add FK from quotations to transactions (if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'transaction_id'
    ) THEN
        -- Check if constraint already exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_quotations_transaction'
        ) THEN
            ALTER TABLE quotations
            ADD CONSTRAINT fk_quotations_transaction
            FOREIGN KEY (transaction_id) REFERENCES transactions(id);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- SECTION 11: STATUS ENUM CONSISTENCY
-- Document expected status values for each document type
-- ============================================================================

COMMENT ON COLUMN quotations.status IS 'Status values: draft, sent, viewed, accepted, converted, expired, cancelled';
COMMENT ON COLUMN orders.status IS 'Status values: pending, confirmed, processing, ready_for_delivery, shipped, delivered, cancelled';
COMMENT ON COLUMN invoices.status IS 'Status values: draft, sent, viewed, partially_paid, paid, overdue, void, cancelled';
COMMENT ON COLUMN transactions.status IS 'Status values: pending, completed, voided, refunded';
COMMENT ON COLUMN transactions.source IS 'Source values: pos, quote, order, invoice';

-- ============================================================================
-- SECTION 12: HELPER VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Quotes ready for POS conversion
CREATE OR REPLACE VIEW quotes_ready_for_pos AS
SELECT
    q.id,
    q.quotation_number,
    q.customer_id,
    c.name as customer_name,
    c.phone as customer_phone,
    q.subtotal_cents / 100.0 as subtotal,
    q.discount_cents / 100.0 as discount,
    q.discount_reason,
    q.tax_cents / 100.0 as tax,
    q.total_cents / 100.0 as total,
    q.salesperson_id,
    u.first_name || ' ' || u.last_name as salesperson_name,
    q.created_at,
    q.updated_at,
    (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
FROM quotations q
LEFT JOIN customers c ON q.customer_id = c.id
LEFT JOIN users u ON q.salesperson_id = u.id
WHERE q.status IN ('accepted', 'sent', 'viewed')
  AND q.transaction_id IS NULL
  AND q.converted_to_order_id IS NULL
ORDER BY q.updated_at DESC;

-- View: Daily sales summary (combined POS + Orders)
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT
    DATE(created_at) as sale_date,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_sales,
    SUM(discount_amount) as total_discounts,
    AVG(total_amount) as avg_transaction,
    COUNT(DISTINCT customer_id) as unique_customers
FROM transactions
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- View: Salesperson performance
CREATE OR REPLACE VIEW salesperson_performance AS
SELECT
    u.id as user_id,
    u.first_name || ' ' || u.last_name as salesperson_name,
    COUNT(t.id) as transaction_count,
    SUM(t.total_amount) as total_sales,
    AVG(t.total_amount) as avg_sale,
    SUM(sc.commission_amount_cents) / 100.0 as total_commission
FROM users u
LEFT JOIN transactions t ON (t.salesperson_id = u.id OR t.user_id = u.id) AND t.status = 'completed'
LEFT JOIN sales_commissions sc ON sc.salesperson_id = u.id AND sc.status != 'cancelled'
WHERE u.role IN ('sales', 'admin', 'manager')
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_sales DESC NULLS LAST;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
--
-- SHARED TABLES (do not duplicate):
-- - users, customers, products, categories
-- - These are the source of truth for both systems
--
-- QUOTATION-SPECIFIC TABLES:
-- - quotations, quotation_items, quote_* tables
-- - These track the quote lifecycle
--
-- POS-SPECIFIC TABLES:
-- - registers, register_shifts
-- - These are unique to physical POS operations
--
-- BRIDGE TABLES (shared for conversion):
-- - transactions, transaction_items, payments
-- - These can originate from quotes OR direct POS sales
-- - orders, order_items (optional intermediate step)
-- - invoices, invoice_items, invoice_payments
--
-- NEW INTEGRATION TABLES:
-- - conversion_audit: Full audit trail of all conversions
-- - sales_commissions: Unified commission tracking
-- - payment_reconciliation: Unified payment tracking
--
-- CONVERSION FLOW:
-- 1. Quote created in quotation system
-- 2. Customer accepts quote
-- 3. POS loads quote via loadFromQuote() in CartContext
-- 4. Cashier processes payment
-- 5. convert_quote_to_transaction() creates transaction
-- 6. Quote status updated to 'converted'
-- 7. Commission calculated automatically
-- 8. Audit trail created
--
-- ============================================================================
