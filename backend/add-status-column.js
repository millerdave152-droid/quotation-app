require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

async function addStatusColumn() {
  try {
    // Add status column with default 'draft'
    await pool.query(`
      ALTER TABLE quotations 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'
    `);
    console.log('✅ Status column added successfully!');
    
    // Update existing quotes to 'draft' status
    await pool.query(`
      UPDATE quotations 
      SET status = 'draft' 
      WHERE status IS NULL
    `);
    console.log('✅ Existing quotes updated to draft status!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  process.exit(0);
}

addStatusColumn();