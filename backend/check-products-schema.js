const pool = require('./db');

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'products'
      ORDER BY ordinal_position
    `);

    console.log('\nProducts table schema:\n');
    result.rows.forEach(row => {
      const nullable = row.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE';
      console.log(`  ${row.column_name.padEnd(25)} ${row.data_type.padEnd(30)} ${nullable}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
