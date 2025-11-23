const pool = require('./db');

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n=== Database Tables ===\n');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    console.log(`\nTotal tables: ${result.rows.length}\n`);

    // Check for analytics-related tables
    const analyticsTables = [
      'quote_financing',
      'quote_warranties',
      'quote_delivery',
      'quote_rebates',
      'quote_trade_ins'
    ];

    console.log('=== Analytics Tables Check ===\n');
    for (const table of analyticsTables) {
      const exists = result.rows.some(row => row.table_name === table);
      console.log(`${exists ? '✅' : '❌'} ${table}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();
