/**
 * Create API Keys Table
 * For managing API keys used for programmatic access to the API
 */

const pool = require('./db');

async function createApiKeysTable() {
  try {
    console.log('Creating api_keys table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(255) NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        api_secret VARCHAR(255) NOT NULL,
        created_by VARCHAR(255),
        permissions JSONB DEFAULT '{"read": true, "write": false, "delete": false}'::jsonb,
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rate_limit_per_hour INTEGER DEFAULT 1000,
        allowed_ips TEXT[], -- Array of allowed IP addresses
        notes TEXT
      )
    `);

    console.log('✅ api_keys table created successfully');

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)');

    console.log('✅ Indexes created successfully');

    // Check if table has any data
    const result = await pool.query('SELECT COUNT(*) FROM api_keys');
    console.log(`📊 Current API keys count: ${result.rows[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating api_keys table:', error);
    process.exit(1);
  }
}

createApiKeysTable();
