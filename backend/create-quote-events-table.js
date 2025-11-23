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

async function createQuoteEventsTable() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating quote_events table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_events (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ quote_events table created successfully');

  } catch (err) {
    console.error('❌ Error creating quote_events table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createQuoteEventsTable();
