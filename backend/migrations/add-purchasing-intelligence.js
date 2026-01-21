/**
 * Migration: Add Purchasing Intelligence Tables
 *
 * Creates 5 tables for AI-powered purchasing intelligence:
 * - purchasing_forecasts: Demand predictions
 * - purchasing_recommendations: Stock/order recommendations
 * - purchasing_agent_runs: Analysis run history
 * - purchasing_trend_data: Historical trend data
 * - purchasing_seasonality_patterns: Seasonal demand patterns
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

    console.log('Creating purchasing_forecasts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchasing_forecasts (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        forecast_date DATE NOT NULL,
        predicted_demand INTEGER NOT NULL,
        confidence_score DECIMAL(5,2),
        trend_direction VARCHAR(20),
        seasonality_factor DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_forecasts_product ON purchasing_forecasts(product_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_forecasts_date ON purchasing_forecasts(forecast_date)
    `);

    console.log('Creating purchasing_recommendations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchasing_recommendations (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        recommendation_type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        suggested_quantity INTEGER,
        reasoning TEXT,
        current_stock INTEGER,
        avg_daily_sales DECIMAL(10,2),
        days_of_stock_remaining INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at TIMESTAMP,
        acknowledged_by INTEGER REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recommendations_priority ON purchasing_recommendations(priority)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recommendations_type ON purchasing_recommendations(recommendation_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recommendations_created ON purchasing_recommendations(created_at DESC)
    `);

    console.log('Creating purchasing_agent_runs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchasing_agent_runs (
        id SERIAL PRIMARY KEY,
        run_type VARCHAR(20) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'running',
        products_analyzed INTEGER,
        recommendations_generated INTEGER,
        ai_summary TEXT,
        email_sent BOOLEAN DEFAULT FALSE,
        error_message TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON purchasing_agent_runs(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON purchasing_agent_runs(started_at DESC)
    `);

    console.log('Creating purchasing_trend_data table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchasing_trend_data (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_units_sold INTEGER DEFAULT 0,
        total_revenue DECIMAL(12,2) DEFAULT 0,
        order_count INTEGER DEFAULT 0,
        avg_order_quantity DECIMAL(10,2),
        moving_avg_7d DECIMAL(10,2),
        moving_avg_30d DECIMAL(10,2),
        moving_avg_90d DECIMAL(10,2),
        growth_rate_7d DECIMAL(8,4),
        growth_rate_30d DECIMAL(8,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, period_start, period_end)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trend_product ON purchasing_trend_data(product_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trend_period ON purchasing_trend_data(period_start, period_end)
    `);

    console.log('Creating purchasing_seasonality_patterns table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchasing_seasonality_patterns (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        day_of_week INTEGER DEFAULT -1,
        seasonality_index DECIMAL(5,2) NOT NULL,
        sample_size INTEGER,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, month, day_of_week)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_seasonality_product ON purchasing_seasonality_patterns(product_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_seasonality_month ON purchasing_seasonality_patterns(month)
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Dropping purchasing intelligence tables...');
    await client.query('DROP TABLE IF EXISTS purchasing_seasonality_patterns CASCADE');
    await client.query('DROP TABLE IF EXISTS purchasing_trend_data CASCADE');
    await client.query('DROP TABLE IF EXISTS purchasing_agent_runs CASCADE');
    await client.query('DROP TABLE IF EXISTS purchasing_recommendations CASCADE');
    await client.query('DROP TABLE IF EXISTS purchasing_forecasts CASCADE');

    await client.query('COMMIT');
    console.log('Rollback completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  const action = process.argv[2];

  const runMigration = async () => {
    try {
      if (action === 'down') {
        await down();
      } else {
        await up();
      }
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Migration error:', error);
      await pool.end();
      process.exit(1);
    }
  };

  runMigration();
}

module.exports = { up, down };
