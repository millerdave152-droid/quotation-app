/**
 * Migration: Add status date tracking columns to quotations table
 * Adds sent_at, won_at, lost_at columns for tracking when status changes occur
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
    console.log('Adding status date columns to quotations table...\n');

    // Add sent_at column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP
    `);
    console.log('  Added sent_at column');

    // Add won_at column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS won_at TIMESTAMP
    `);
    console.log('  Added won_at column');

    // Add lost_at column
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS lost_at TIMESTAMP
    `);
    console.log('  Added lost_at column');

    // Add lost_reason column for tracking why quotes were lost
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(255)
    `);
    console.log('  Added lost_reason column');

    // Update existing quotes to set sent_at for SENT status
    const sentResult = await client.query(`
      UPDATE quotations
      SET sent_at = updated_at
      WHERE status = 'SENT' AND sent_at IS NULL
    `);
    console.log(`  Updated ${sentResult.rowCount} existing SENT quotes with sent_at`);

    // Update existing quotes to set won_at for WON status
    const wonResult = await client.query(`
      UPDATE quotations
      SET won_at = updated_at
      WHERE status = 'WON' AND won_at IS NULL
    `);
    console.log(`  Updated ${wonResult.rowCount} existing WON quotes with won_at`);

    // Update existing quotes to set lost_at for LOST status
    const lostResult = await client.query(`
      UPDATE quotations
      SET lost_at = updated_at
      WHERE status = 'LOST' AND lost_at IS NULL
    `);
    console.log(`  Updated ${lostResult.rowCount} existing LOST quotes with lost_at`);

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
