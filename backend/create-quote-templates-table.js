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

async function createQuoteTemplatesTable() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating quote_templates table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        items JSONB NOT NULL,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        notes TEXT,
        terms TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ quote_templates table created successfully');

  } catch (err) {
    console.error('❌ Error creating quote_templates table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createQuoteTemplatesTable();
