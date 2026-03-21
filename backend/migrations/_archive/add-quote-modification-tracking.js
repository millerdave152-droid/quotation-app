/**
 * Migration: Add modification tracking columns to quotations table
 * Adds created_by and modified_by columns for tracking who created/edited quotes
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
    console.log('Adding modification tracking columns to quotations table...\n');

    // Add created_by column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)
    `);
    console.log('  Added created_by column');

    // Add modified_by column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS modified_by VARCHAR(100)
    `);
    console.log('  Added modified_by column');

    // Add user_name column to quote_events if it doesn't exist
    await client.query(`
      ALTER TABLE quote_events
      ADD COLUMN IF NOT EXISTS user_name VARCHAR(100)
    `);
    console.log('  Added user_name column to quote_events');

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
