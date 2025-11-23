// Setup Security Tables
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function setupSecurity() {
  console.log('🔐 Setting up security tables...\n');

  try {
    // Read SQL file
    const sqlFile = path.join(__dirname, 'create-users-table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute SQL
    await pool.query(sql);

    console.log('✅ Security tables created successfully!');
    console.log('\n📋 Tables created:');
    console.log('   - users');
    console.log('   - refresh_tokens');
    console.log('   - api_keys');
    console.log('   - audit_log');

    console.log('\n🔑 Default admin account created:');
    console.log('   Email: admin@yourcompany.com');
    console.log('   Password: Admin123!');
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!\n');

    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'refresh_tokens', 'api_keys', 'audit_log')
      ORDER BY table_name
    `);

    console.log('✅ Verified tables in database:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Error setting up security:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupSecurity();
