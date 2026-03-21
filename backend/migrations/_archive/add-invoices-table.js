/**
 * Migration: Add Invoices Table
 * Creates invoices, invoice_items, and invoice_payments tables
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
    console.log('Starting Invoices Table Migration...\n');

    // =====================================================
    // 1. CREATE INVOICES TABLE
    // =====================================================
    console.log('1. Creating invoices table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,

        -- Relationships
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

        -- Status
        status VARCHAR(30) DEFAULT 'draft',
        -- Values: draft, sent, viewed, partially_paid, paid, overdue, void, cancelled

        -- Financial
        subtotal_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        tax_rate DECIMAL(5,2) DEFAULT 13.00,
        delivery_cents INTEGER DEFAULT 0,
        discount_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,
        amount_paid_cents INTEGER DEFAULT 0,
        balance_due_cents INTEGER NOT NULL,

        -- Terms & Dates
        invoice_date DATE DEFAULT CURRENT_DATE,
        due_date DATE,
        payment_terms VARCHAR(50), -- Net 30, Due on Receipt, etc.

        -- Tracking
        sent_at TIMESTAMP,
        viewed_at TIMESTAMP,
        first_payment_at TIMESTAMP,
        paid_at TIMESTAMP,
        voided_at TIMESTAMP,
        void_reason TEXT,

        -- Payment link
        payment_link_token VARCHAR(255) UNIQUE,
        payment_link_expires_at TIMESTAMP,

        -- Metadata
        notes TEXT,
        internal_notes TEXT,
        footer_text TEXT,
        created_by VARCHAR(255),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ invoices table created\n');

    // =====================================================
    // 2. CREATE INVOICE ITEMS TABLE
    // =====================================================
    console.log('2. Creating invoice_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

        -- Item details (snapshot)
        description TEXT NOT NULL,
        product_name VARCHAR(255),
        product_model VARCHAR(255),

        -- Pricing
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_cents INTEGER NOT NULL,
        discount_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,

        -- For tracking cost basis
        unit_cost_cents INTEGER,

        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ invoice_items table created\n');

    // =====================================================
    // 3. CREATE INVOICE PAYMENTS TABLE
    // =====================================================
    console.log('3. Creating invoice_payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

        -- Payment details
        amount_cents INTEGER NOT NULL,
        payment_method VARCHAR(50), -- credit_card, debit, cash, check, bank_transfer, stripe
        payment_type VARCHAR(30) DEFAULT 'payment', -- payment, deposit, refund

        -- Stripe integration
        stripe_payment_intent_id VARCHAR(255),
        stripe_charge_id VARCHAR(255),
        stripe_refund_id VARCHAR(255),

        -- Other payment references
        reference_number VARCHAR(255),
        check_number VARCHAR(50),
        transaction_id VARCHAR(255),

        -- Tracking
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_by VARCHAR(255),
        notes TEXT,

        -- For refunds
        is_refund BOOLEAN DEFAULT false,
        refund_reason TEXT,
        original_payment_id INTEGER REFERENCES invoice_payments(id),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ invoice_payments table created\n');

    // =====================================================
    // 4. CREATE INDEXES
    // =====================================================
    console.log('4. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_quotation ON invoices(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_invoices_payment_link ON invoices(payment_link_token);

      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_stripe ON invoice_payments(stripe_payment_intent_id);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 5. CREATE INVOICE NUMBER SEQUENCE
    // =====================================================
    console.log('5. Creating invoice number sequence...');
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1001;
    `);
    console.log('   ✓ Invoice number sequence created\n');

    // =====================================================
    // 6. ADD INVOICE_ID TO QUOTATIONS & ORDERS
    // =====================================================
    console.log('6. Adding invoice tracking to quotations and orders...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id);

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id);
    `);
    console.log('   ✓ Tables updated\n');

    await client.query('COMMIT');
    console.log('✅ Invoices table migration completed successfully!');

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
