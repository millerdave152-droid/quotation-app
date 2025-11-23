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

async function createProductFavoritesTable() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating product_favorites table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_favorites (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, user_id)
      )
    `);

    console.log('✅ product_favorites table created successfully');

  } catch (err) {
    console.error('❌ Error creating product_favorites table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createProductFavoritesTable();
