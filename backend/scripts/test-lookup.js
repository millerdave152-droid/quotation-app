require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

async function test() {
  try {
    const sql = `
      SELECT
        q.id,
        q.quote_number,
        q.quotation_number,
        q.status,
        q.customer_id,
        c.name as customer_name,
        q.total_cents,
        q.created_at,
        q.quote_expiry_date,
        q.expires_at,
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quotation_id = q.id) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = 106
    `;

    const r = await pool.query(sql);
    console.log('Direct query for quote 104:');
    console.log(JSON.stringify(r.rows, null, 2));

    // Now try the lookup query
    const lookupSql = `
      SELECT
        q.id,
        q.quote_number,
        q.quotation_number,
        q.status,
        q.customer_id,
        c.name as customer_name,
        q.total_cents,
        q.subtotal_cents,
        q.created_at,
        q.quote_expiry_date,
        q.expires_at,
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quotation_id = q.id) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.created_by::text = u.id::text
      WHERE
        q.status NOT IN ('converted', 'cancelled', 'expired', 'rejected')
        AND (
          COALESCE(q.quote_number, q.quotation_number, '') ILIKE $1
          OR c.name ILIKE $1
          OR c.phone ILIKE $1
          OR c.email ILIKE $1
        )
        AND (q.quote_expiry_date IS NULL OR q.quote_expiry_date > NOW())
        AND (q.expires_at IS NULL OR q.expires_at > NOW())
      ORDER BY q.created_at DESC
      LIMIT 20
    `;

    const r2 = await pool.query(lookupSql, ['%Q-2026%']);
    console.log('\nLookup query results:', r2.rows.length);
    console.log(JSON.stringify(r2.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
  pool.end();
}

test();
