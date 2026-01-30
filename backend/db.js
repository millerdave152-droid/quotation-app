/**
 * Database Connection Pool
 * Week 3.3: Added explicit pool configuration for stability
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
    ? { rejectUnauthorized: true }  // SSL enforced in production
    : { rejectUnauthorized: false }, // Development only

  // Connection pool configuration
  max: parseInt(process.env.DB_POOL_MAX) || 20,              // Maximum connections in pool
  min: parseInt(process.env.DB_POOL_MIN) || 2,               // Minimum connections to maintain
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 5000, // Fail if connection takes > 5s
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 30000,   // Fail if can't acquire connection in 30s

  // Statement timeout to prevent long-running queries
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000, // 30 second query timeout

  // Application name for monitoring
  application_name: 'quotation-app'
});

// Log pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected database pool error:', err.message);
});

// Log when connections are acquired/released (debug mode only)
if (process.env.DB_DEBUG === 'true') {
  pool.on('connect', (client) => {
    console.log('[DB Pool] New connection established');
  });

  pool.on('acquire', (client) => {
    console.log('[DB Pool] Connection acquired from pool');
  });

  pool.on('release', (client) => {
    console.log('[DB Pool] Connection released back to pool');
  });

  pool.on('remove', (client) => {
    console.log('[DB Pool] Connection removed from pool');
  });
}

module.exports = pool;
