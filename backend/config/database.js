/**
 * Database Configuration
 * Centralized database pool for the application
 */

const { Pool } = require('pg');
require('dotenv').config();

function resolveSslConfig() {
  const sslMode = (process.env.DB_SSL_MODE || '').toLowerCase();
  const sslFlag = (process.env.DB_SSL || '').toLowerCase();

  if (sslMode === 'disable' || sslFlag === 'false' || sslFlag === '0') {
    return false;
  }

  if (sslMode === 'require' || sslFlag === 'true' || sslFlag === '1') {
    const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false';
    return { rejectUnauthorized };
  }

  // Default behavior: production requires verified SSL, non-prod allows self-signed
  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: resolveSslConfig()
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully!');
  }
});

module.exports = pool;
