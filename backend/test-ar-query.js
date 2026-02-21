// Test the AR aging query directly against the database
process.env.NODE_ENV = 'development';
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

async function test() {
  const asOf = new Date();
  try {
    const result = await pool.query(`
      WITH order_aging AS (
        SELECT
          o.id AS order_id,
          o.order_number,
          o.customer_id,
          c.name AS customer_name,
          c.email,
          c.phone,
          o.created_at AS invoice_date,
          o.created_at + INTERVAL '15 days' AS due_date,
          o.total_cents / 100.0 AS original_amount,
          COALESCE(pay.amount_paid, 0) AS amount_paid,
          o.total_cents / 100.0 - COALESCE(pay.amount_paid, 0) AS balance_due,
          EXTRACT(DAY FROM $1::timestamp - o.created_at)::int AS days_outstanding,
          CASE
            WHEN EXTRACT(DAY FROM $1::timestamp - o.created_at) <= 30 THEN 'current'
            WHEN EXTRACT(DAY FROM $1::timestamp - o.created_at) <= 60 THEN 'days_31_60'
            WHEN EXTRACT(DAY FROM $1::timestamp - o.created_at) <= 90 THEN 'days_61_90'
            ELSE 'days_over_90'
          END AS aging_bucket
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN (
          SELECT order_id, SUM(amount_cents) / 100.0 AS amount_paid
          FROM unified_order_payments WHERE status = 'completed'
          GROUP BY order_id
        ) pay ON pay.order_id = o.id
        WHERE o.status NOT IN ('cancelled', 'voided', 'refunded')
          AND o.total_cents / 100.0 - COALESCE(pay.amount_paid, 0) > 0
      )
      SELECT * FROM order_aging ORDER BY customer_name, days_outstanding DESC
    `, [asOf]);

    console.log('SUCCESS! Rows:', result.rows.length);
    if (result.rows[0]) console.log('First row:', JSON.stringify(result.rows[0]));
  } catch (err) {
    console.log('ERROR:', err.message);
    console.log('Code:', err.code);
    console.log('Position:', err.position);
  } finally {
    pool.end();
  }
}

test();
