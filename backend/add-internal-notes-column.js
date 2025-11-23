const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function addInternalNotesColumn() {
  const client = await pool.connect();

  try {
    console.log('🔧 Checking if internal_notes column exists...');

    // Check if column already exists
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'quotations'
      AND column_name = 'internal_notes'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ internal_notes column already exists');
    } else {
      console.log('📝 Adding internal_notes column...');
      await client.query(`
        ALTER TABLE quotations
        ADD COLUMN internal_notes TEXT
      `);
      console.log('✅ internal_notes column added successfully');
    }

  } catch (err) {
    console.error('❌ Error adding internal_notes column:', err);
  } finally {
    client.release();
    pool.end();
  }
}

addInternalNotesColumn();
