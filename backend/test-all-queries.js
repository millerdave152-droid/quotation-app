// Test all failing queries directly
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

async function testQuery(label, sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    console.log(`PASS [${label}] - ${result.rows.length} rows`);
  } catch (err) {
    console.log(`FAIL [${label}] - ${err.message}`);
    if (err.position) {
      // Show the character at error position
      const pos = parseInt(err.position) - 1;
      const context = sql.substring(Math.max(0, pos - 50), pos + 50);
      console.log(`  Position ${err.position}: ...${context}...`);
    }
  }
}

async function main() {
  const asOf = new Date();

  // Test 1: AR Aging main query
  await testQuery('AR-Aging', `
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
        EXTRACT(DAYS FROM $1::timestamp - o.created_at)::int AS days_outstanding,
        CASE
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 30 THEN 'current'
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 60 THEN 'days_31_60'
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 90 THEN 'days_61_90'
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

  // Test 2: Insights - Stale quotes
  await testQuery('Insights-StaleQuotes', `
    SELECT q.id, q.quote_number, q.total_amount, q.status, q.created_at, q.sent_at,
      c.name as customer_name, c.email as customer_email, c.id as customer_id,
      CONCAT(u.first_name, ' ', u.last_name) as salesperson_name,
      EXTRACT(DAY FROM (CURRENT_TIMESTAMP - COALESCE(q.sent_at, q.created_at))) as days_since_sent
    FROM quotations q
    JOIN customers c ON q.customer_id = c.id
    LEFT JOIN users u ON q.created_by = u.id::text
    WHERE q.status IN ('sent', 'pending')
      AND COALESCE(q.sent_at, q.created_at) < CURRENT_TIMESTAMP - INTERVAL '5 days'
      AND (q.quote_expiry_date IS NULL OR q.quote_expiry_date > CURRENT_DATE)
    ORDER BY q.total_amount DESC LIMIT 10
  `);

  // Test 3: Insights - Expiring quotes
  await testQuery('Insights-ExpiringQuotes', `
    SELECT q.id, q.quote_number, q.total_amount, q.quote_expiry_date,
      c.name as customer_name, c.id as customer_id,
      (q.quote_expiry_date - CURRENT_DATE) as days_until_expiry
    FROM quotations q
    JOIN customers c ON q.customer_id = c.id
    WHERE q.status IN ('sent', 'pending')
      AND q.quote_expiry_date IS NOT NULL
      AND q.quote_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY q.quote_expiry_date ASC LIMIT 10
  `);

  // Test 4: Insights - Churn risk
  await testQuery('Insights-ChurnRisk', `
    WITH customer_activity AS (
      SELECT c.id as customer_id, c.name as customer_name, c.email,
        GREATEST(
          COALESCE((SELECT MAX(created_at) FROM orders WHERE customer_id = c.id), '1970-01-01'),
          COALESCE((SELECT MAX(created_at) FROM quotations WHERE customer_id = c.id), '1970-01-01')
        ) as last_activity,
        COALESCE((SELECT SUM(total_cents) / 100.0 FROM orders WHERE customer_id = c.id AND status != 'cancelled'), 0) as lifetime_value,
        COALESCE((SELECT AVG(EXTRACT(DAY FROM (lead_date - created_at)))
          FROM (SELECT created_at, LEAD(created_at) OVER (ORDER BY created_at) as lead_date
            FROM orders WHERE customer_id = c.id AND status != 'cancelled') intervals
          WHERE lead_date IS NOT NULL), 90) as avg_order_interval
      FROM customers c
    )
    SELECT * FROM customer_activity
    WHERE last_activity > '1970-01-01' AND lifetime_value > 1000
      AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_activity)) > avg_order_interval * 1.5
    ORDER BY lifetime_value DESC LIMIT 10
  `);

  // Test 5: Insights - Low inventory
  await testQuery('Insights-Inventory', `
    SELECT p.id, p.name, p.sku, p.stock_quantity, p.reorder_point
    FROM products p
    WHERE p.is_active = true
      AND (p.stock_quantity <= COALESCE(p.reorder_point, 5) OR p.stock_quantity <= 5)
    ORDER BY CASE WHEN p.stock_quantity <= 0 THEN 0 ELSE 1 END
    LIMIT 10
  `);

  // Test 6: Insights - Overdue invoices
  await testQuery('Insights-OverdueInvoices', `
    SELECT i.id, i.invoice_number, i.total_cents / 100.0 AS total_amount, i.due_date, i.status,
      c.name as customer_name, c.id as customer_id, c.email as customer_email,
      (CURRENT_DATE - i.due_date) as days_overdue
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    WHERE i.status IN ('sent', 'pending', 'overdue') AND i.due_date < CURRENT_DATE
    ORDER BY i.total_cents DESC LIMIT 10
  `);

  // Test 7: Quick action counts
  await testQuery('Insights-QuickActions', `
    SELECT
      (SELECT COUNT(*) FROM quotations WHERE status IN ('sent', 'pending') AND quote_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days') as quotes_expiring_soon,
      (SELECT COUNT(*) FROM quotations WHERE status IN ('sent', 'pending') AND COALESCE(sent_at, created_at) < CURRENT_TIMESTAMP - INTERVAL '7 days') as stale_quotes,
      (SELECT COUNT(*) FROM invoices WHERE status IN ('sent', 'pending', 'overdue') AND due_date < CURRENT_DATE) as overdue_invoices,
      (SELECT COUNT(*) FROM products WHERE is_active = true AND stock_quantity <= COALESCE(reorder_point, 5)) as low_stock_items,
      (SELECT COUNT(*) FROM products WHERE is_active = true AND stock_quantity <= 0) as out_of_stock_items,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders
  `);

  pool.end();
}

main();
