/**
 * Fix audit_log table schema
 * Drops and recreates with correct columns
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

async function fixAuditLog() {
  try {
    console.log('🔧 Fixing audit_log table schema...');

    // Drop existing table
    await pool.query('DROP TABLE IF EXISTS audit_log CASCADE');
    console.log('✅ Dropped old audit_log table');

    // Create table with correct schema
    await pool.query(`
      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        ip_address VARCHAR(45),
        user_agent TEXT,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created audit_log table with correct schema');

    // Create index for performance
    await pool.query('CREATE INDEX idx_audit_log_user_id ON audit_log(user_id)');
    await pool.query('CREATE INDEX idx_audit_log_created_at ON audit_log(created_at)');
    console.log('✅ Created indexes');

    console.log('\n✨ Audit log table fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing audit_log table:', error);
    process.exit(1);
  }
}

fixAuditLog();
