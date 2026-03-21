/**
 * Migration: Add Marketplace-Customer Integration
 * Links marketplace orders to customers and enables quote creation
 */
const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding customer integration columns to marketplace_orders...');

    // Add customer_id link to marketplace_orders
    await client.query(`
      ALTER TABLE marketplace_orders
      ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id),
      ADD COLUMN IF NOT EXISTS customer_match_type VARCHAR(20) DEFAULT 'unmatched',
      ADD COLUMN IF NOT EXISTS created_quote_id INTEGER REFERENCES quotations(id),
      ADD COLUMN IF NOT EXISTS customer_matched_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS quote_created_at TIMESTAMP
    `);

    // Add marketplace_order_id to quotations for reverse linking
    await client.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS marketplace_order_id INTEGER REFERENCES marketplace_orders(id),
      ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual'
    `);

    // Add marketplace stats to customers
    await client.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS marketplace_orders_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS marketplace_revenue_cents BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS first_marketplace_order_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_marketplace_order_at TIMESTAMP
    `);

    // Create index for faster customer matching
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_customer_email
      ON marketplace_orders(customer_email)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_orders_customer_id
      ON marketplace_orders(customer_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_email_lower
      ON customers(LOWER(email))
    `);

    console.log('Running initial customer matching on existing orders...');

    // Match existing orders to customers by email
    const matchResult = await client.query(`
      UPDATE marketplace_orders mo
      SET
        customer_id = c.id,
        customer_match_type = 'email_match',
        customer_matched_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE LOWER(mo.customer_email) = LOWER(c.email)
        AND mo.customer_id IS NULL
        AND mo.customer_email IS NOT NULL
      RETURNING mo.id
    `);

    console.log(`Matched ${matchResult.rowCount} existing orders to customers`);

    // Update customer marketplace stats
    await client.query(`
      UPDATE customers c
      SET
        marketplace_orders_count = stats.order_count,
        marketplace_revenue_cents = stats.total_revenue,
        first_marketplace_order_at = stats.first_order,
        last_marketplace_order_at = stats.last_order
      FROM (
        SELECT
          customer_id,
          COUNT(*) as order_count,
          COALESCE(SUM(total_price_cents), 0) as total_revenue,
          MIN(order_date) as first_order,
          MAX(order_date) as last_order
        FROM marketplace_orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ) stats
      WHERE c.id = stats.customer_id
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
