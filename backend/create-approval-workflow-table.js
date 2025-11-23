const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function createApprovalWorkflowTable() {
  const client = await pool.connect();

  try {
    console.log('🔧 Creating quote_approvals table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_approvals (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        requested_by VARCHAR(100) NOT NULL,
        requested_by_email VARCHAR(255) NOT NULL,
        approver_name VARCHAR(100),
        approver_email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'PENDING',
        comments TEXT,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        CONSTRAINT valid_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
      )
    `);

    // Add index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_approvals_quotation
      ON quote_approvals(quotation_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_approvals_status
      ON quote_approvals(status)
    `);

    console.log('✅ quote_approvals table created successfully');

  } catch (err) {
    console.error('❌ Error creating quote_approvals table:', err);
  } finally {
    client.release();
    pool.end();
  }
}

createApprovalWorkflowTable();
