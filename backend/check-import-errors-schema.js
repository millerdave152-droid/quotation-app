const pool = require('./db');

async function checkSchema() {
  try {
    // Get table schema
    const schemaQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'import_errors'
      ORDER BY ordinal_position
    `;

    const result = await pool.query(schemaQuery);
    console.log('\nimport_errors table schema:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // Get sample data
    const sampleQuery = 'SELECT * FROM import_errors LIMIT 5';
    const sampleResult = await pool.query(sampleQuery);
    console.log('\nSample data:');
    console.log(JSON.stringify(sampleResult.rows, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
