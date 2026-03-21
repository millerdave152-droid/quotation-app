/**
 * Migration: Add Stripe Integration
 * Adds payment fields to quotations and creates webhook/settings tables
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting Stripe Integration Migration...\n');

    // =====================================================
    // 1. ADD STRIPE FIELDS TO QUOTATIONS
    // =====================================================
    console.log('1. Adding Stripe fields to quotations...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),

      -- Deposit tracking
      ADD COLUMN IF NOT EXISTS deposit_required_cents INTEGER,
      ADD COLUMN IF NOT EXISTS deposit_percent DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS deposit_paid_cents INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMP,

      -- Payment link
      ADD COLUMN IF NOT EXISTS payment_link_token VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS payment_link_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payment_link_url TEXT,

      -- Payment status
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid',
      -- Values: unpaid, deposit_pending, deposit_paid, payment_pending, paid, refunded, failed
      ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMP;
    `);
    console.log('   ✓ Quotations table updated\n');

    // =====================================================
    // 2. ADD STRIPE FIELDS TO CUSTOMERS
    // =====================================================
    console.log('2. Adding Stripe fields to customers...');
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS stripe_default_payment_method VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_created_at TIMESTAMP;
    `);
    console.log('   ✓ Customers table updated\n');

    // =====================================================
    // 3. CREATE STRIPE WEBHOOK EVENTS TABLE
    // =====================================================
    console.log('3. Creating stripe_webhook_events table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id SERIAL PRIMARY KEY,
        stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,

        -- Event data
        payload JSONB NOT NULL,
        api_version VARCHAR(20),

        -- Processing status
        processed BOOLEAN DEFAULT false,
        processed_at TIMESTAMP,
        processing_attempts INTEGER DEFAULT 0,
        last_attempt_at TIMESTAMP,
        error_message TEXT,

        -- Related entities
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

        -- Idempotency
        idempotency_key VARCHAR(255),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ stripe_webhook_events table created\n');

    // =====================================================
    // 4. CREATE STRIPE CONFIG TABLE
    // (Named stripe_config to avoid conflict with existing payment_settings table)
    // =====================================================
    console.log('4. Creating stripe_config table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_config (
        id SERIAL PRIMARY KEY,
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT,
        config_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
        is_encrypted BOOLEAN DEFAULT false,
        description TEXT,
        updated_by VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ stripe_config table created\n');

    // =====================================================
    // 5. CREATE PAYMENT METHODS TABLE (for saved cards)
    // =====================================================
    console.log('5. Creating customer_payment_methods table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_payment_methods (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

        -- Stripe references
        stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,

        -- Card details (tokenized/masked)
        card_brand VARCHAR(20),      -- visa, mastercard, amex, etc.
        card_last4 VARCHAR(4),
        card_exp_month INTEGER,
        card_exp_year INTEGER,

        -- Status
        is_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,

        -- Billing address (optional)
        billing_name VARCHAR(255),
        billing_address_line1 VARCHAR(255),
        billing_address_line2 VARCHAR(255),
        billing_city VARCHAR(100),
        billing_state VARCHAR(100),
        billing_postal_code VARCHAR(20),
        billing_country VARCHAR(2),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ customer_payment_methods table created\n');

    // =====================================================
    // 6. CREATE PAYMENT TRANSACTIONS LOG
    // =====================================================
    console.log('6. Creating payment_transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,

        -- References
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

        -- Stripe references
        stripe_payment_intent_id VARCHAR(255),
        stripe_charge_id VARCHAR(255),
        stripe_refund_id VARCHAR(255),
        stripe_checkout_session_id VARCHAR(255),

        -- Transaction details
        transaction_type VARCHAR(30) NOT NULL,
        -- Values: payment, deposit, refund, partial_refund, chargeback

        amount_cents INTEGER NOT NULL,
        currency VARCHAR(3) DEFAULT 'CAD',
        status VARCHAR(30) NOT NULL,
        -- Values: pending, processing, succeeded, failed, cancelled, refunded

        -- Payment method
        payment_method_type VARCHAR(30), -- card, bank_transfer, etc.
        card_brand VARCHAR(20),
        card_last4 VARCHAR(4),

        -- Fees
        stripe_fee_cents INTEGER,
        net_amount_cents INTEGER,

        -- Error handling
        failure_code VARCHAR(100),
        failure_message TEXT,

        -- Metadata
        description TEXT,
        metadata JSONB,

        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ payment_transactions table created\n');

    // =====================================================
    // 7. CREATE INDEXES
    // =====================================================
    console.log('7. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_stripe_pi ON quotations(stripe_payment_intent_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_stripe_session ON quotations(stripe_checkout_session_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_payment_status ON quotations(payment_status);
      CREATE INDEX IF NOT EXISTS idx_quotations_payment_link ON quotations(payment_link_token);

      CREATE INDEX IF NOT EXISTS idx_customers_stripe ON customers(stripe_customer_id);

      CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON stripe_webhook_events(stripe_event_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON stripe_webhook_events(processed);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_quote ON stripe_webhook_events(quotation_id);

      CREATE INDEX IF NOT EXISTS idx_payment_methods_customer ON customer_payment_methods(customer_id);
      CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe ON customer_payment_methods(stripe_payment_method_id);

      CREATE INDEX IF NOT EXISTS idx_transactions_quote ON payment_transactions(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_order ON payment_transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON payment_transactions(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_stripe_pi ON payment_transactions(stripe_payment_intent_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON payment_transactions(status);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 8. INSERT DEFAULT STRIPE CONFIG
    // =====================================================
    console.log('8. Inserting default stripe config...');
    await client.query(`
      INSERT INTO stripe_config (config_key, config_value, config_type, description)
      VALUES
        ('stripe_mode', 'test', 'string', 'Stripe mode: test or live'),
        ('default_deposit_percent', '25', 'number', 'Default deposit percentage'),
        ('min_deposit_cents', '10000', 'number', 'Minimum deposit amount in cents'),
        ('payment_link_expiry_days', '7', 'number', 'Days until payment link expires'),
        ('auto_convert_on_payment', 'true', 'boolean', 'Auto-convert quote to order on full payment'),
        ('send_receipt_email', 'true', 'boolean', 'Send payment receipt via email'),
        ('allow_partial_payments', 'true', 'boolean', 'Allow customers to make partial payments'),
        ('require_deposit_before_order', 'false', 'boolean', 'Require deposit before creating order')
      ON CONFLICT (config_key) DO NOTHING;
    `);
    console.log('   ✓ Default stripe config inserted\n');

    await client.query('COMMIT');
    console.log('✅ Stripe Integration migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(console.error);
