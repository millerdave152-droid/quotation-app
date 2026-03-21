/**
 * Migration: Optimize Schema with Additional Indexes and Enhancements
 *
 * Improvements:
 * 1. Add missing indexes for frequently queried columns
 * 2. Add users table if not exists (for proper sales rep relationships)
 * 3. Add quote_templates table if not exists
 * 4. Add quote conversion tracking
 * 5. Add customer lifetime value tracking
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('Schema Optimization Migration');
    console.log('='.repeat(60));

    // ============================================
    // 1. ADD MISSING INDEXES FOR PERFORMANCE
    // ============================================
    console.log('\n1. Adding performance indexes...');

    const indexes = [
      // Quotations table indexes
      { table: 'quotations', column: 'customer_id', name: 'idx_quotations_customer_id' },
      { table: 'quotations', column: 'sales_rep_id', name: 'idx_quotations_sales_rep_id' },
      { table: 'quotations', column: 'sent_at', name: 'idx_quotations_sent_at' },
      { table: 'quotations', column: 'won_at', name: 'idx_quotations_won_at' },
      { table: 'quotations', column: 'lost_at', name: 'idx_quotations_lost_at' },
      { table: 'quotations', column: 'expires_at', name: 'idx_quotations_expires_at' },
      { table: 'quotations', column: 'is_template', name: 'idx_quotations_is_template' },
      { table: 'quotations', column: 'total_cents', name: 'idx_quotations_total_cents' },
      { table: 'quotations', column: 'created_by', name: 'idx_quotations_created_by' },

      // Quote events indexes
      { table: 'quote_events', column: 'event_type', name: 'idx_quote_events_event_type' },
      { table: 'quote_events', column: 'created_at', name: 'idx_quote_events_created_at' },

      // Quote items indexes
      { table: 'quotation_items', column: 'manufacturer', name: 'idx_quotation_items_manufacturer' },
      { table: 'quotation_items', column: 'category', name: 'idx_quotation_items_category' },

      // Customers indexes
      { table: 'customers', column: 'customer_type', name: 'idx_customers_customer_type' },
      { table: 'customers', column: 'company', name: 'idx_customers_company' }
    ];

    for (const idx of indexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column})
        `);
        console.log(`   ✓ Created index: ${idx.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   - Index already exists: ${idx.name}`);
        } else {
          console.log(`   ✗ Failed to create ${idx.name}: ${err.message}`);
        }
      }
    }

    // Composite indexes for common queries
    console.log('\n   Adding composite indexes...');

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_quotations_status_created
        ON quotations(status, created_at DESC)
      `);
      console.log('   ✓ Created composite index: status + created_at');
    } catch (e) { console.log('   - Composite index exists or failed'); }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_quotations_customer_status
        ON quotations(customer_id, status)
      `);
      console.log('   ✓ Created composite index: customer_id + status');
    } catch (e) { console.log('   - Composite index exists or failed'); }

    // ============================================
    // 2. ADD USERS/SALES REPS TABLE IF NOT EXISTS
    // ============================================
    console.log('\n2. Ensuring users table exists...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'sales_rep',
        department VARCHAR(100),
        phone VARCHAR(50),
        commission_rate NUMERIC(5,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Users table ready');

    // ============================================
    // 3. ADD QUOTE_TEMPLATES TABLE IF NOT EXISTS
    // ============================================
    console.log('\n3. Ensuring quote_templates table exists...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        items JSONB NOT NULL DEFAULT '[]',
        discount_percent NUMERIC(5,2) DEFAULT 0,
        tax_rate NUMERIC(5,2) DEFAULT 13,
        notes TEXT,
        terms TEXT,
        is_active BOOLEAN DEFAULT true,
        use_count INTEGER DEFAULT 0,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ Quote templates table ready');

    // ============================================
    // 4. ADD CONVERSION TRACKING COLUMNS
    // ============================================
    console.log('\n4. Adding conversion tracking columns...');

    const conversionColumns = [
      { column: 'days_to_send', type: 'INTEGER', comment: 'Days between creation and sending' },
      { column: 'days_to_close', type: 'INTEGER', comment: 'Days between sending and won/lost' },
      { column: 'follow_up_count', type: 'INTEGER DEFAULT 0', comment: 'Number of follow-ups made' },
      { column: 'email_count', type: 'INTEGER DEFAULT 0', comment: 'Number of emails sent' },
      { column: 'view_count', type: 'INTEGER DEFAULT 0', comment: 'Number of times viewed by customer' },
      { column: 'revision_count', type: 'INTEGER DEFAULT 0', comment: 'Number of quote revisions' },
      { column: 'competitor_mentioned', type: 'VARCHAR(255)', comment: 'Competitor if mentioned in lost reason' }
    ];

    for (const col of conversionColumns) {
      try {
        await client.query(`
          ALTER TABLE quotations
          ADD COLUMN IF NOT EXISTS ${col.column} ${col.type}
        `);
        console.log(`   ✓ Added column: ${col.column}`);
      } catch (err) {
        console.log(`   - Column ${col.column} already exists or failed`);
      }
    }

    // ============================================
    // 5. ADD CUSTOMER LIFETIME VALUE COLUMNS
    // ============================================
    console.log('\n5. Adding customer analytics columns...');

    const customerColumns = [
      { column: 'total_quotes', type: 'INTEGER DEFAULT 0' },
      { column: 'total_won_quotes', type: 'INTEGER DEFAULT 0' },
      { column: 'total_lost_quotes', type: 'INTEGER DEFAULT 0' },
      { column: 'lifetime_value_cents', type: 'BIGINT DEFAULT 0' },
      { column: 'average_quote_value_cents', type: 'BIGINT DEFAULT 0' },
      { column: 'win_rate', type: 'NUMERIC(5,2) DEFAULT 0' },
      { column: 'last_quote_date', type: 'TIMESTAMP' },
      { column: 'first_quote_date', type: 'TIMESTAMP' },
      { column: 'preferred_categories', type: 'TEXT[]' },
      { column: 'preferred_brands', type: 'TEXT[]' }
    ];

    for (const col of customerColumns) {
      try {
        await client.query(`
          ALTER TABLE customers
          ADD COLUMN IF NOT EXISTS ${col.column} ${col.type}
        `);
        console.log(`   ✓ Added column: ${col.column}`);
      } catch (err) {
        console.log(`   - Column ${col.column} already exists or failed`);
      }
    }

    // ============================================
    // 6. CREATE TRIGGER FOR CONVERSION METRICS
    // ============================================
    console.log('\n6. Creating conversion metrics trigger...');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_conversion_metrics()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Calculate days_to_send when quote is sent
        IF NEW.status = 'SENT' AND OLD.status = 'DRAFT' AND NEW.sent_at IS NOT NULL THEN
          NEW.days_to_send := EXTRACT(DAY FROM (NEW.sent_at - NEW.created_at));
        END IF;

        -- Calculate days_to_close when quote is won or lost
        IF NEW.status IN ('WON', 'LOST') AND OLD.status NOT IN ('WON', 'LOST') THEN
          IF NEW.sent_at IS NOT NULL THEN
            NEW.days_to_close := EXTRACT(DAY FROM (
              COALESCE(NEW.won_at, NEW.lost_at) - NEW.sent_at
            ));
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Drop existing trigger if exists
    await client.query(`
      DROP TRIGGER IF EXISTS trg_update_conversion_metrics ON quotations
    `);

    await client.query(`
      CREATE TRIGGER trg_update_conversion_metrics
      BEFORE UPDATE ON quotations
      FOR EACH ROW
      EXECUTE FUNCTION update_conversion_metrics()
    `);
    console.log('   ✓ Conversion metrics trigger created');

    // ============================================
    // 7. UPDATE EXISTING QUOTES WITH METRICS
    // ============================================
    console.log('\n7. Calculating conversion metrics for existing quotes...');

    const updateResult = await client.query(`
      UPDATE quotations
      SET
        days_to_send = CASE
          WHEN sent_at IS NOT NULL
          THEN EXTRACT(DAY FROM (sent_at - created_at))::INTEGER
          ELSE NULL
        END,
        days_to_close = CASE
          WHEN status IN ('WON', 'LOST') AND sent_at IS NOT NULL
          THEN EXTRACT(DAY FROM (COALESCE(won_at, lost_at) - sent_at))::INTEGER
          ELSE NULL
        END
      WHERE days_to_send IS NULL OR days_to_close IS NULL
    `);
    console.log(`   ✓ Updated ${updateResult.rowCount} quotes with conversion metrics`);

    // ============================================
    // 8. UPDATE CUSTOMER LIFETIME VALUES
    // ============================================
    console.log('\n8. Calculating customer lifetime values...');

    await client.query(`
      UPDATE customers c
      SET
        total_quotes = COALESCE(stats.total_quotes, 0),
        total_won_quotes = COALESCE(stats.won_quotes, 0),
        total_lost_quotes = COALESCE(stats.lost_quotes, 0),
        lifetime_value_cents = COALESCE(stats.lifetime_value, 0),
        average_quote_value_cents = CASE
          WHEN COALESCE(stats.total_quotes, 0) > 0
          THEN COALESCE(stats.lifetime_value, 0) / stats.total_quotes
          ELSE 0
        END,
        win_rate = CASE
          WHEN COALESCE(stats.closed_quotes, 0) > 0
          THEN (COALESCE(stats.won_quotes, 0)::NUMERIC / stats.closed_quotes * 100)::NUMERIC(5,2)
          ELSE 0
        END,
        first_quote_date = stats.first_quote,
        last_quote_date = stats.last_quote
      FROM (
        SELECT
          customer_id,
          COUNT(*) as total_quotes,
          COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_quotes,
          COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_quotes,
          COUNT(CASE WHEN status IN ('WON', 'LOST') THEN 1 END) as closed_quotes,
          COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as lifetime_value,
          MIN(created_at) as first_quote,
          MAX(created_at) as last_quote
        FROM quotations
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ) stats
      WHERE c.id = stats.customer_id
    `);
    console.log('   ✓ Customer lifetime values updated');

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('Migration Complete!');
    console.log('='.repeat(60));
    console.log(`
Summary of changes:
  - Added ${indexes.length} performance indexes
  - Added 2 composite indexes for common queries
  - Ensured users table exists for sales rep management
  - Ensured quote_templates table exists
  - Added conversion tracking columns (days_to_send, days_to_close, etc.)
  - Added customer analytics columns (lifetime value, win rate, etc.)
  - Created trigger for automatic conversion metric calculation
  - Backfilled conversion metrics for existing quotes
  - Updated customer lifetime values
    `);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
