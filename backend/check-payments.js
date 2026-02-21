const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  try {
    // Check payments table columns
    const { rows } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'payments'
      ORDER BY ordinal_position
    `);
    console.log('=== payments columns ===');
    rows.forEach(r => console.log(' ', r.column_name, '(' + r.data_type + ')'));

    // Also check if there's a customer_payments table
    const { rows: tables } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE '%payment%'
      ORDER BY table_name
    `);
    console.log('\n=== payment-related tables ===');
    tables.forEach(r => console.log(' ', r.table_name));

    // Check customer_payments
    const { rows: cp } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'customer_payments'
      ORDER BY ordinal_position
    `);
    console.log('\n=== customer_payments columns ===');
    cp.forEach(r => console.log(' ', r.column_name, '(' + r.data_type + ')'));

    // Check unified_order_payments
    const { rows: uop } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'unified_order_payments'
      ORDER BY ordinal_position
    `);
    console.log('\n=== unified_order_payments columns ===');
    uop.forEach(r => console.log(' ', r.column_name, '(' + r.data_type + ')'));

    // Check invoice_payments
    const { rows: ip } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'invoice_payments'
      ORDER BY ordinal_position
    `);
    console.log('\n=== invoice_payments columns ===');
    ip.forEach(r => console.log(' ', r.column_name, '(' + r.data_type + ')'));
  } catch (err) {
    console.log('Error:', err.message);
  }
  pool.end();
}

check();
