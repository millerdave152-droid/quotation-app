const pool = require('./db');

async function checkConstraints() {
  try {
    // Check for constraints
    const constraintsResult = await pool.query(`
      SELECT
        conname AS constraint_name,
        contype AS constraint_type,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'products'::regclass
    `);

    console.log('\nProducts table constraints:\n');
    if (constraintsResult.rows.length === 0) {
      console.log('  No constraints found');
    } else {
      constraintsResult.rows.forEach(row => {
        console.log(`  ${row.constraint_name}`);
        console.log(`    Type: ${row.constraint_type}`);
        console.log(`    Definition: ${row.definition}\n`);
      });
    }

    // Check for indexes
    const indexesResult = await pool.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'products'
    `);

    console.log('\nProducts table indexes:\n');
    if (indexesResult.rows.length === 0) {
      console.log('  No indexes found');
    } else {
      indexesResult.rows.forEach(row => {
        console.log(`  ${row.indexname}`);
        console.log(`    ${row.indexdef}\n`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkConstraints();
