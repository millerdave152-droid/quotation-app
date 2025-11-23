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

async function createPaymentTermsTable() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating payment_terms_templates table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_terms_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        terms_text TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default templates
    await client.query(`
      INSERT INTO payment_terms_templates (name, terms_text, is_default)
      VALUES
        ('Net 30', 'Payment due within 30 days. All prices in CAD.', true),
        ('Net 60', 'Payment due within 60 days. All prices in CAD.', false),
        ('50% Deposit', '50% deposit required upfront, remaining 50% due upon delivery. All prices in CAD.', false),
        ('COD', 'Cash on delivery. Payment due at time of delivery. All prices in CAD.', false),
        ('Net 15', 'Payment due within 15 days. All prices in CAD.', false)
      ON CONFLICT DO NOTHING
    `);

    console.log('✅ payment_terms_templates table created successfully');

  } catch (err) {
    console.error('❌ Error creating payment_terms_templates table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createPaymentTermsTable();
