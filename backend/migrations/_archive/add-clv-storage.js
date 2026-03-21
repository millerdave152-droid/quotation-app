/**
 * Migration: Add CLV/Churn storage columns to customers table
 * Week 4.1 of 4-week sprint
 *
 * Stores calculated CLV and churn risk on customer records
 * for dashboard display and at-risk customer alerts
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
  ssl: { rejectUnauthorized: false }
});

async function up() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding CLV storage columns to customers table...');

    // CLV score (lifetime value in cents)
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS clv_score INTEGER DEFAULT 0
    `);
    console.log('  + clv_score (integer, lifetime value in cents)');

    // Churn risk level
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS churn_risk VARCHAR(20) DEFAULT 'unknown'
      CHECK (churn_risk IN ('low', 'medium', 'high', 'unknown'))
    `);
    console.log('  + churn_risk (varchar, low/medium/high/unknown)');

    // CLV segment (platinum/gold/silver/bronze)
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS clv_segment VARCHAR(20)
      CHECK (clv_segment IN ('platinum', 'gold', 'silver', 'bronze', NULL))
    `);
    console.log('  + clv_segment (varchar, platinum/gold/silver/bronze)');

    // Last calculation timestamp
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS clv_last_calculated TIMESTAMP
    `);
    console.log('  + clv_last_calculated (timestamp)');

    // Total transactions count (for quick access)
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS total_transactions INTEGER DEFAULT 0
    `);
    console.log('  + total_transactions (integer)');

    // Average order value in cents
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS avg_order_value_cents INTEGER DEFAULT 0
    `);
    console.log('  + avg_order_value_cents (integer)');

    // Days since last activity
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS days_since_last_activity INTEGER
    `);
    console.log('  + days_since_last_activity (integer)');

    // CLV trend (improving/stable/declining)
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS clv_trend VARCHAR(20) DEFAULT 'stable'
      CHECK (clv_trend IN ('improving', 'stable', 'declining'))
    `);
    console.log('  + clv_trend (varchar, improving/stable/declining)');

    // Create indexes for efficient querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_churn_risk
      ON customers(churn_risk)
      WHERE churn_risk IN ('high', 'medium')
    `);
    console.log('  + idx_customers_churn_risk (partial index for at-risk)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_clv_segment
      ON customers(clv_segment)
      WHERE clv_segment IS NOT NULL
    `);
    console.log('  + idx_customers_clv_segment (partial index)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_clv_score
      ON customers(clv_score DESC)
    `);
    console.log('  + idx_customers_clv_score (descending for top customers)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_at_risk
      ON customers(churn_risk, clv_score DESC)
      WHERE churn_risk = 'high'
    `);
    console.log('  + idx_customers_at_risk (composite for at-risk sorting)');

    await client.query('COMMIT');
    console.log('\nMigration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Rolling back CLV storage migration...');

    await client.query('DROP INDEX IF EXISTS idx_customers_at_risk');
    await client.query('DROP INDEX IF EXISTS idx_customers_clv_score');
    await client.query('DROP INDEX IF EXISTS idx_customers_clv_segment');
    await client.query('DROP INDEX IF EXISTS idx_customers_churn_risk');

    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS clv_trend');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS days_since_last_activity');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS avg_order_value_cents');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS total_transactions');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS clv_last_calculated');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS clv_segment');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS churn_risk');
    await client.query('ALTER TABLE customers DROP COLUMN IF EXISTS clv_score');

    await client.query('COMMIT');
    console.log('Rollback completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration based on command line argument
const command = process.argv[2];

if (command === 'down') {
  down().catch(err => {
    console.error('Rollback error:', err);
    process.exit(1);
  });
} else {
  up().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
