#!/usr/bin/env node
/**
 * Baseline Migration
 *
 * Marks all existing numbered .sql migrations as already applied.
 * Run this ONCE on an existing database to initialize the tracking table.
 *
 * Usage:  node scripts/migrate-baseline.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER || process.env.DB_USER,
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function baseline() {
  const client = await pool.connect();

  try {
    // Create tracking table
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
      '  id SERIAL PRIMARY KEY,' +
      '  filename VARCHAR(255) NOT NULL UNIQUE,' +
      '  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),' +
      '  checksum VARCHAR(64)' +
      ')'
    );

    // Get all numbered .sql files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d+_.+\.sql$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.split('_')[0]);
        const nb = parseInt(b.split('_')[0]);
        return na !== nb ? na - nb : a.localeCompare(b);
      });

    // Insert all as already applied
    let count = 0;
    for (const f of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);

      const res = await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING RETURNING id',
        [f, hash]
      );

      if (res.rows.length > 0) count++;
    }

    console.log('\n  Baselined ' + count + ' migrations as already applied.');
    console.log('  Run "node scripts/migrate.js --status" to verify.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

baseline().catch(err => {
  console.error('Baseline error:', err.message);
  process.exit(1);
});
