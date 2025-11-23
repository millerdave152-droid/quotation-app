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

async function addCostColumn() {
  try {
    await pool.query('ALTER TABLE products ADD COLUMN cost DECIMAL(10,2) DEFAULT 0');
    console.log('✅ Cost column added successfully!');
  } catch (error) {
    if (error.code === '42701') {
      console.log('✅ Cost column already exists!');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
  process.exit(0);
}

addCostColumn();