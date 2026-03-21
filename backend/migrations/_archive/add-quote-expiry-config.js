/**
 * Migration: Add Quote Expiry Configuration
 * Creates quote_expiry_rules table and adds expiry tracking to quotations
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
    console.log('Starting Quote Expiry Configuration Migration...\n');

    // =====================================================
    // 1. CREATE QUOTE EXPIRY RULES TABLE
    // =====================================================
    console.log('1. Creating quote_expiry_rules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_expiry_rules (
        id SERIAL PRIMARY KEY,
        rule_name VARCHAR(100) NOT NULL,
        description TEXT,

        -- Channel/scope
        channel VARCHAR(50),
        -- Values: default, web, phone, in_store, marketplace, b2b

        -- Expiry settings
        days_valid INTEGER DEFAULT 30,
        reminder_days_before INTEGER[] DEFAULT '{7,3,1}',

        -- Automation
        auto_expire BOOLEAN DEFAULT true,
        auto_send_reminders BOOLEAN DEFAULT true,

        -- Renewal settings
        allow_renewal BOOLEAN DEFAULT true,
        renewal_extends_days INTEGER DEFAULT 14,
        max_renewals INTEGER DEFAULT 3,

        -- Price protection
        lock_prices_on_create BOOLEAN DEFAULT true,
        allow_price_update_on_renewal BOOLEAN DEFAULT false,

        -- Notifications
        notify_salesperson_on_expiry BOOLEAN DEFAULT true,
        notify_customer_on_expiry BOOLEAN DEFAULT false,

        -- Hierarchy
        is_default BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 0,  -- Higher priority rules checked first

        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ quote_expiry_rules table created\n');

    // =====================================================
    // 2. ADD EXPIRY TRACKING TO QUOTATIONS
    // =====================================================
    console.log('2. Adding expiry tracking to quotations...');
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS expiry_rule_id INTEGER REFERENCES quote_expiry_rules(id),
      ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS expiry_processed BOOLEAN DEFAULT false,

      -- Renewal tracking
      ADD COLUMN IF NOT EXISTS renewed_from_id INTEGER REFERENCES quotations(id),
      ADD COLUMN IF NOT EXISTS renewal_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMP,

      -- Reminder tracking
      ADD COLUMN IF NOT EXISTS reminder_7d_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reminder_3d_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS reminder_3d_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reminder_1d_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS reminder_1d_sent_at TIMESTAMP,

      -- Price lock
      ADD COLUMN IF NOT EXISTS prices_locked_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS prices_locked BOOLEAN DEFAULT false;
    `);
    console.log('   ✓ Quotations table updated\n');

    // =====================================================
    // 3. CREATE EXPIRY PROCESSING LOG TABLE
    // =====================================================
    console.log('3. Creating quote_expiry_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_expiry_log (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,

        -- Action
        action_type VARCHAR(30) NOT NULL,
        -- Values: reminder_sent, expired, renewed, expiry_extended, inventory_released

        -- Details
        action_details JSONB,
        reminder_type VARCHAR(10),  -- 7d, 3d, 1d
        days_until_expiry INTEGER,

        -- Results
        success BOOLEAN DEFAULT true,
        error_message TEXT,

        -- Audit
        processed_by VARCHAR(50) DEFAULT 'system',  -- system, user email
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ quote_expiry_log table created\n');

    // =====================================================
    // 4. CREATE INDEXES
    // =====================================================
    console.log('4. Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_expiry_rules_channel ON quote_expiry_rules(channel);
      CREATE INDEX IF NOT EXISTS idx_expiry_rules_default ON quote_expiry_rules(is_default) WHERE is_default = true;
      CREATE INDEX IF NOT EXISTS idx_expiry_rules_active ON quote_expiry_rules(is_active);

      CREATE INDEX IF NOT EXISTS idx_quotations_expiry_rule ON quotations(expiry_rule_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_expired_at ON quotations(expired_at);
      CREATE INDEX IF NOT EXISTS idx_quotations_expires_at ON quotations(expires_at);
      CREATE INDEX IF NOT EXISTS idx_quotations_expiry_pending ON quotations(expires_at, status)
        WHERE status IN ('DRAFT', 'SENT') AND expiry_processed = false;

      CREATE INDEX IF NOT EXISTS idx_expiry_log_quote ON quote_expiry_log(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_expiry_log_action ON quote_expiry_log(action_type);
      CREATE INDEX IF NOT EXISTS idx_expiry_log_date ON quote_expiry_log(processed_at);
    `);
    console.log('   ✓ Indexes created\n');

    // =====================================================
    // 5. INSERT DEFAULT EXPIRY RULES
    // =====================================================
    console.log('5. Inserting default expiry rules...');
    await client.query(`
      INSERT INTO quote_expiry_rules (rule_name, channel, days_valid, reminder_days_before, is_default, priority)
      VALUES
        ('Standard Quote', 'default', 30, '{7,3,1}', true, 0),
        ('In-Store Quote', 'in_store', 14, '{3,1}', false, 10),
        ('Web Quote', 'web', 7, '{3,1}', false, 10),
        ('B2B Quote', 'b2b', 45, '{14,7,3,1}', false, 10),
        ('Promotional Quote', 'promo', 3, '{1}', false, 20)
      ON CONFLICT DO NOTHING;
    `);
    console.log('   ✓ Default expiry rules inserted\n');

    await client.query('COMMIT');
    console.log('✅ Quote Expiry Configuration migration completed successfully!');

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
