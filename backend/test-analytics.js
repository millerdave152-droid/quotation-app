const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false }
});

async function testAnalytics() {
  try {
    console.log('Testing analytics queries...\n');

    const days = 30;
    const end = new Date();
    const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));

    console.log(`Date range: ${start.toISOString()} to ${end.toISOString()}\n`);

    // Test 1: Total quotes
    console.log('1. Testing total quotes query...');
    const totalQuotesResult = await pool.query(
      'SELECT COUNT(*) as count FROM quotations WHERE created_at >= $1 AND created_at <= $2',
      [start, end]
    );
    console.log('   Total quotes:', totalQuotesResult.rows[0].count);

    // Test 2: Financing
    console.log('\n2. Testing financing query...');
    const financingResult = await pool.query(
      `SELECT COUNT(DISTINCT qf.quote_id) as count,
              SUM(qf.financed_amount_cents) as total_financed,
              SUM(qf.total_interest_cents) as total_interest
       FROM quote_financing qf
       JOIN quotations q ON qf.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log('   Financing count:', financingResult.rows[0].count);
    console.log('   Total financed:', financingResult.rows[0].total_financed);

    // Test 3: Warranties
    console.log('\n3. Testing warranties query...');
    const warrantiesResult = await pool.query(
      `SELECT COUNT(DISTINCT qw.quote_id) as count,
              SUM(qw.warranty_cost_cents) as total_revenue
       FROM quote_warranties qw
       JOIN quotations q ON qw.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );
    console.log('   Warranties count:', warrantiesResult.rows[0].count);
    console.log('   Total revenue:', warrantiesResult.rows[0].total_revenue);

    console.log('\n✅ All queries executed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

testAnalytics();
