const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function runQueries() {
  const client = await pool.connect();
  try {
    // 1. PostgreSQL version
    const versionResult = await client.query('SELECT version()');
    console.log('=== PostgreSQL Version ===');
    console.log(versionResult.rows[0].version);
    console.log('');

    // 2. Check for pgvector extension availability
    console.log('=== Extension Check (pgvector) ===');
    const extResult = await client.query(`
      SELECT name, default_version, installed_version
      FROM pg_available_extensions
      WHERE name = 'vector'
    `);
    if (extResult.rows.length > 0) {
      const ext = extResult.rows[0];
      console.log('pgvector available: YES');
      console.log('  Default version: ' + ext.default_version);
      console.log('  Installed: ' + (ext.installed_version || 'NOT YET'));
    } else {
      console.log('pgvector available: NO (not in pg_available_extensions)');
    }
    console.log('');

    // 3. Table schema for key tables
    console.log('=== Table Schema ===');
    const schemaResult = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name IN ('customers', 'products', 'quotations', 'users', 'unified_orders')
      ORDER BY table_name, ordinal_position
    `);

    let currentTable = '';
    schemaResult.rows.forEach(row => {
      if (row.table_name !== currentTable) {
        console.log('\n[' + row.table_name.toUpperCase() + ']');
        currentTable = row.table_name;
      }
      const nullable = row.is_nullable === 'YES' ? ' (nullable)' : '';
      console.log('  ' + row.column_name + ' : ' + row.data_type + nullable);
    });

    // 4. Check users table for auth info
    console.log('\n\n=== Auth-Related Columns in Users ===');
    const authResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('password_hash', 'role', 'is_active', 'email', 'location_id', 'pos_role_id')
      ORDER BY ordinal_position
    `);
    authResult.rows.forEach(row => {
      console.log('  ' + row.column_name + ' : ' + row.data_type);
    });

  } finally {
    client.release();
    pool.end();
  }
}

runQueries().catch(err => {
  console.error('Error:', err.message);
  pool.end();
});
