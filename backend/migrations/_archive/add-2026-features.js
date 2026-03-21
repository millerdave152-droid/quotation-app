/**
 * 2026 Feature Migration
 * Adds: Special Orders, E-Signatures, Customer Portal, Quote Templates,
 * Quote Versioning, Automated Follow-ups, Payment Integration, Price Book
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting 2026 Features Migration...\n');

    // =====================================================
    // 1. SPECIAL ORDER / NON-STOCK PRODUCTS
    // =====================================================
    console.log('1. Adding special order fields to products...');
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS orderable_from_manufacturer BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS minimum_order_qty INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS discontinued BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS estimated_arrival_date DATE,
      ADD COLUMN IF NOT EXISTS stock_status VARCHAR(50) DEFAULT 'in_stock'
    `);
    console.log('   ✓ Products table updated\n');

    // =====================================================
    // 2. E-SIGNATURE INTEGRATION
    // =====================================================
    console.log('2. Creating e-signature tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_signatures (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        signature_data TEXT NOT NULL,
        signer_name VARCHAR(255) NOT NULL,
        signer_email VARCHAR(255),
        signer_ip VARCHAR(45),
        signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        signature_type VARCHAR(50) DEFAULT 'customer',
        device_info TEXT,
        legal_text TEXT DEFAULT 'I agree to the terms and conditions of this quotation.',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_acceptance_tokens (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ E-signature tables created\n');

    // =====================================================
    // 3. CUSTOMER PORTAL
    // =====================================================
    console.log('3. Creating customer portal tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_access (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        access_token VARCHAR(255) UNIQUE NOT NULL,
        pin_hash VARCHAR(255),
        last_accessed TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_comments (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id),
        comment_text TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT false,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_change_requests (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id),
        request_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        response_text TEXT,
        responded_at TIMESTAMP,
        responded_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Customer portal tables created\n');

    // =====================================================
    // 4. QUOTE TEMPLATES
    // =====================================================
    console.log('4. Creating quote templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        template_data JSONB NOT NULL,
        default_terms TEXT,
        default_validity_days INTEGER DEFAULT 14,
        is_active BOOLEAN DEFAULT true,
        use_count INTEGER DEFAULT 0,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_template_items (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES quote_templates(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(255),
        default_quantity INTEGER DEFAULT 1,
        default_discount_percent DECIMAL(5,2) DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        is_optional BOOLEAN DEFAULT false,
        notes TEXT
      )
    `);
    console.log('   ✓ Quote templates tables created\n');

    // =====================================================
    // 5. QUOTE VERSIONING
    // =====================================================
    console.log('5. Creating quote versioning tables...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS parent_quote_id INTEGER REFERENCES quotations(id),
      ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS version_notes TEXT
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_version_history (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        snapshot_data JSONB NOT NULL,
        changed_by VARCHAR(100),
        change_summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Quote versioning tables created\n');

    // =====================================================
    // 6. MOBILE PREVIEW & QR CODES
    // =====================================================
    console.log('6. Adding mobile preview fields...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS public_access_token VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS public_access_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS qr_code_data TEXT,
      ADD COLUMN IF NOT EXISTS mobile_views INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_mobile_view TIMESTAMP
    `);
    console.log('   ✓ Mobile preview fields added\n');

    // =====================================================
    // 7. AUTOMATED FOLLOW-UPS
    // =====================================================
    console.log('7. Creating automated follow-up tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_follow_up_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_days INTEGER NOT NULL,
        email_template_id INTEGER,
        is_active BOOLEAN DEFAULT true,
        applies_to_status VARCHAR(50)[] DEFAULT ARRAY['SENT'],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_follow_ups (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        rule_id INTEGER REFERENCES quote_follow_up_rules(id),
        scheduled_date TIMESTAMP NOT NULL,
        sent_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        email_subject VARCHAR(255),
        email_body TEXT,
        response_received BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default follow-up rules
    await client.query(`
      INSERT INTO quote_follow_up_rules (name, description, trigger_days, applies_to_status)
      VALUES
        ('7-Day Reminder', 'Send reminder 7 days after quote sent', 7, ARRAY['SENT']),
        ('14-Day Follow-up', 'Follow up 14 days after quote sent', 14, ARRAY['SENT']),
        ('Expiration Warning', 'Warn customer 3 days before expiration', -3, ARRAY['SENT'])
      ON CONFLICT DO NOTHING
    `);
    console.log('   ✓ Follow-up tables created\n');

    // =====================================================
    // 8. PAYMENT INTEGRATION
    // =====================================================
    console.log('8. Creating payment tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_payments (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        payment_type VARCHAR(50) NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency VARCHAR(3) DEFAULT 'CAD',
        status VARCHAR(50) DEFAULT 'pending',
        payment_provider VARCHAR(50),
        provider_transaction_id VARCHAR(255),
        provider_response JSONB,
        payment_method VARCHAR(50),
        card_last_four VARCHAR(4),
        paid_at TIMESTAMP,
        refunded_at TIMESTAMP,
        refund_amount_cents INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        api_key_encrypted TEXT,
        secret_key_encrypted TEXT,
        webhook_secret_encrypted TEXT,
        is_active BOOLEAN DEFAULT false,
        is_test_mode BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Payment tables created\n');

    // =====================================================
    // 9. PDF ATTACHMENTS
    // =====================================================
    console.log('9. Creating PDF attachments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_attachments (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_size INTEGER,
        file_path TEXT,
        file_data BYTEA,
        attachment_type VARCHAR(50) DEFAULT 'spec_sheet',
        description TEXT,
        include_in_pdf BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_spec_sheets (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_size INTEGER,
        file_url TEXT,
        file_data BYTEA,
        language VARCHAR(10) DEFAULT 'en',
        is_primary BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Attachment tables created\n');

    // =====================================================
    // 10. PRICE BOOK MANAGEMENT
    // =====================================================
    console.log('10. Creating price book tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_books (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        manufacturer VARCHAR(255),
        effective_date DATE NOT NULL,
        expiry_date DATE,
        file_name VARCHAR(255),
        import_source VARCHAR(100),
        product_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS price_change_notifications (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        price_book_id INTEGER REFERENCES price_books(id),
        old_cost_cents INTEGER,
        new_cost_cents INTEGER,
        change_percent DECIMAL(10,2),
        notification_sent BOOLEAN DEFAULT false,
        sent_at TIMESTAMP,
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_by VARCHAR(100),
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_price_updates (
        id SERIAL PRIMARY KEY,
        manufacturer VARCHAR(255),
        schedule_type VARCHAR(50) DEFAULT 'manual',
        cron_expression VARCHAR(100),
        file_source_url TEXT,
        file_source_type VARCHAR(50),
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Price book tables created\n');

    // =====================================================
    // CREATE INDEXES
    // =====================================================
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_signatures_quote ON quote_signatures(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_tokens_token ON quote_acceptance_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_portal_access_token ON customer_portal_access(access_token);
      CREATE INDEX IF NOT EXISTS idx_quote_comments_quote ON quote_comments(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_versions_quote ON quote_version_history(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_followups_quote ON quote_follow_ups(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_followups_date ON quote_follow_ups(scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_quote_payments_quote ON quote_payments(quote_id);
      CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote ON quote_attachments(quote_id);
      CREATE INDEX IF NOT EXISTS idx_price_notifications_product ON price_change_notifications(product_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_public_token ON quotations(public_access_token);
    `);
    console.log('   ✓ Indexes created\n');

    await client.query('COMMIT');
    console.log('='.repeat(50));
    console.log('2026 FEATURES MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
