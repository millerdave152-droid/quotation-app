/**
 * AI Assistant Schema Migration Runner
 * Executes the SQL migration to set up pgvector and AI tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();

  console.log('');
  console.log('==========================================');
  console.log('  AI ASSISTANT SCHEMA MIGRATION');
  console.log('==========================================');
  console.log('');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_ai_assistant_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    console.log('');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('Migration completed successfully!');
    console.log('');

    // Verify the results
    console.log('Verifying installation...');
    console.log('');

    // Check pgvector
    const vectorCheck = await client.query("SELECT '[1,2,3]'::vector AS test_vector");
    console.log('  [OK] pgvector extension working');

    // Check tables
    const tablesCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE 'ai_%' OR table_name LIKE '%_embeddings')
      ORDER BY table_name
    `);
    console.log(`  [OK] ${tablesCheck.rows.length} AI tables created:`);
    tablesCheck.rows.forEach(row => {
      console.log(`       - ${row.table_name}`);
    });

    // Check indexes
    const indexCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE tablename LIKE 'ai_%' OR tablename LIKE '%_embeddings'
    `);
    console.log(`  [OK] ${indexCheck.rows[0].count} indexes created`);

    // Check functions
    const funcCheck = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name LIKE '%semantic%' OR routine_name LIKE '%conversation%'
    `);
    console.log(`  [OK] ${funcCheck.rows.length} helper functions created`);

    // Check views
    const viewCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name LIKE 'ai_%'
    `);
    console.log(`  [OK] ${viewCheck.rows.length} analytics views created`);

    console.log('');
    console.log('==========================================');
    console.log('  MIGRATION SUCCESSFUL');
    console.log('==========================================');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run: node scripts/seed-embeddings.js');
    console.log('  2. Start the AI service');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('==========================================');
    console.error('  MIGRATION FAILED');
    console.error('==========================================');
    console.error('');
    console.error('Error:', error.message);

    if (error.message.includes('permission denied')) {
      console.error('');
      console.error('You may need rds_superuser privileges to create extensions.');
      console.error('Connect as your admin user and run:');
      console.error('  CREATE EXTENSION IF NOT EXISTS vector;');
    }

    if (error.message.includes('already exists')) {
      console.error('');
      console.error('Some objects already exist. This may be a partial migration.');
      console.error('Check which tables exist and run missing parts manually.');
    }

    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
