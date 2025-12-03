/**
 * Migration: Add columns for Samsung pricelist import
 * - color (varchar)
 * - samsung_category (varchar)
 * - retail_price_cents (bigint)
 * - promo_price_cents already exists
 * - go_to_margin (numeric)
 * - promo_margin (numeric)
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: add-samsung-import-columns');

    await client.query('BEGIN');

    // Check existing columns
    const existingCols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products'
    `);
    const colNames = existingCols.rows.map(r => r.column_name);

    // Add color column if not exists
    if (!colNames.includes('color')) {
      await client.query(`ALTER TABLE products ADD COLUMN color VARCHAR(100)`);
      console.log('✓ Added column: color');
    } else {
      console.log('- Column already exists: color');
    }

    // Add samsung_category column if not exists
    if (!colNames.includes('samsung_category')) {
      await client.query(`ALTER TABLE products ADD COLUMN samsung_category VARCHAR(255)`);
      console.log('✓ Added column: samsung_category');
    } else {
      console.log('- Column already exists: samsung_category');
    }

    // Add retail_price_cents column if not exists (separate from msrp_cents for Go To price)
    if (!colNames.includes('retail_price_cents')) {
      await client.query(`ALTER TABLE products ADD COLUMN retail_price_cents BIGINT`);
      console.log('✓ Added column: retail_price_cents');
    } else {
      console.log('- Column already exists: retail_price_cents');
    }

    // Add go_to_margin column if not exists
    if (!colNames.includes('go_to_margin')) {
      await client.query(`ALTER TABLE products ADD COLUMN go_to_margin NUMERIC(10,2)`);
      console.log('✓ Added column: go_to_margin');
    } else {
      console.log('- Column already exists: go_to_margin');
    }

    // Add promo_margin column if not exists
    if (!colNames.includes('promo_margin')) {
      await client.query(`ALTER TABLE products ADD COLUMN promo_margin NUMERIC(10,2)`);
      console.log('✓ Added column: promo_margin');
    } else {
      console.log('- Column already exists: promo_margin');
    }

    // Add availability column if not exists
    if (!colNames.includes('availability')) {
      await client.query(`ALTER TABLE products ADD COLUMN availability VARCHAR(50)`);
      console.log('✓ Added column: availability');
    } else {
      console.log('- Column already exists: availability');
    }

    // Add handle_type column if not exists
    if (!colNames.includes('handle_type')) {
      await client.query(`ALTER TABLE products ADD COLUMN handle_type VARCHAR(100)`);
      console.log('✓ Added column: handle_type');
    } else {
      console.log('- Column already exists: handle_type');
    }

    // Add replacement_for column if not exists
    if (!colNames.includes('replacement_for')) {
      await client.query(`ALTER TABLE products ADD COLUMN replacement_for VARCHAR(255)`);
      console.log('✓ Added column: replacement_for');
    } else {
      console.log('- Column already exists: replacement_for');
    }

    // Add is_mto (made to order) column if not exists
    if (!colNames.includes('is_mto')) {
      await client.query(`ALTER TABLE products ADD COLUMN is_mto BOOLEAN DEFAULT false`);
      console.log('✓ Added column: is_mto');
    } else {
      console.log('- Column already exists: is_mto');
    }

    // Add emp_price_cents column if not exists
    if (!colNames.includes('emp_price_cents')) {
      await client.query(`ALTER TABLE products ADD COLUMN emp_price_cents BIGINT`);
      console.log('✓ Added column: emp_price_cents');
    } else {
      console.log('- Column already exists: emp_price_cents');
    }

    // Add set_or_accessory column if not exists
    if (!colNames.includes('set_or_accessory')) {
      await client.query(`ALTER TABLE products ADD COLUMN set_or_accessory VARCHAR(20)`);
      console.log('✓ Added column: set_or_accessory');
    } else {
      console.log('- Column already exists: set_or_accessory');
    }

    await client.query('COMMIT');
    console.log('\n✓ Migration completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
