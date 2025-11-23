const pool = require('./db');

async function analyzeImportErrors() {
  try {
    // Get error statistics
    const statsQuery = `
      SELECT
        error_type,
        COUNT(*) as count,
        COUNT(DISTINCT row_number) as unique_rows
      FROM import_errors
      GROUP BY error_type
      ORDER BY count DESC
    `;

    const sampleErrorsQuery = `
      SELECT
        error_type,
        column_name,
        invalid_value,
        row_number,
        error_message,
        created_at
      FROM import_errors
      ORDER BY created_at DESC
      LIMIT 20
    `;

    console.log('\n=== IMPORT ERRORS ANALYSIS ===\n');

    const statsResult = await pool.query(statsQuery);
    console.log('Error Statistics by Type:\n');
    console.log('Type'.padEnd(30), 'Count'.padEnd(10), 'Unique Rows');
    console.log('-'.repeat(60));
    statsResult.rows.forEach(row => {
      console.log(
        row.error_type.padEnd(30),
        String(row.count).padEnd(10),
        row.unique_rows
      );
    });

    console.log('\n\n=== SAMPLE ERRORS (Latest 20) ===\n');
    const sampleResult = await pool.query(sampleErrorsQuery);
    sampleResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. ${row.error_type}`);
      console.log(`   Column: ${row.column_name}`);
      console.log(`   Invalid Value: ${row.invalid_value}`);
      console.log(`   Row: ${row.row_number}`);
      console.log(`   Message: ${row.error_message}`);
      console.log(`   Date: ${row.created_at.toISOString()}`);
    });

    console.log('\n\n=== RECOMMENDATIONS ===\n');
    console.log('Based on the analysis:');
    console.log('1. Check the error types above');
    console.log('2. Review sample errors for patterns');
    console.log('3. Fix data validation in import process');
    console.log('4. Clean up invalid data in CSV files\n');

    process.exit(0);
  } catch (error) {
    console.error('Error analyzing import errors:', error);
    process.exit(1);
  }
}

analyzeImportErrors();
