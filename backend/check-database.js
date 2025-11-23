/**
 * Database Schema Check Script
 * Verifies all tables and their structure
 */

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

async function checkDatabase() {
  try {
    console.log('🔍 Checking database schema...\n');

    // List all tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 TABLES FOUND:');
    console.log('================');
    tablesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });

    console.log('\n📋 TABLE DETAILS:');
    console.log('=================\n');

    // Get details for each table
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;

      // Get columns
      const columnsResult = await pool.query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.rows[0].count;

      console.log(`📁 ${tableName.toUpperCase()} (${rowCount} rows)`);
      console.log('─'.repeat(50));

      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`  • ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      console.log('');
    }

    // Check for indexes
    console.log('📇 INDEXES:');
    console.log('===========');
    const indexesResult = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    let currentTable = '';
    indexesResult.rows.forEach(idx => {
      if (idx.tablename !== currentTable) {
        currentTable = idx.tablename;
        console.log(`\n${currentTable}:`);
      }
      console.log(`  • ${idx.indexname}`);
    });

    // Check for foreign keys
    console.log('\n\n🔗 FOREIGN KEYS:');
    console.log('================');
    const fkResult = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name
    `);

    currentTable = '';
    fkResult.rows.forEach(fk => {
      if (fk.table_name !== currentTable) {
        currentTable = fk.table_name;
        console.log(`\n${currentTable}:`);
      }
      console.log(`  • ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    console.log('\n\n✅ Database schema check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking database:', error);
    process.exit(1);
  }
}

checkDatabase();
