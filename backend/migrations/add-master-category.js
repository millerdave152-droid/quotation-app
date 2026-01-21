/**
 * Migration: Add master_category column to products table
 * Normalizes 646 unique categories into 9 master categories
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

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: add-master-category');

    // Add master_category column if it doesn't exist
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS master_category VARCHAR(50)
    `);
    console.log('Added master_category column');

    // Create index for faster filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_master_category
      ON products(master_category)
    `);
    console.log('Created index on master_category');

    console.log('Migration completed successfully');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
