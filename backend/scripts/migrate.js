#!/usr/bin/env node
/**
 * Migration Runner
 *
 * Tracks applied migrations in a `schema_migrations` table and runs
 * pending numbered .sql files in order.
 *
 * Usage:
 *   node scripts/migrate.js              # run pending migrations
 *   node scripts/migrate.js --status     # show applied / pending counts
 *   node scripts/migrate.js --dry-run    # list pending without executing
 */

const fs = require('fs');
const path = require('path');

// Load env from backend root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

// ── DB connection (uses admin user for DDL) ──
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER || process.env.DB_USER,
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  statement_timeout: 120000, // 2 min per statement (migrations can be slow)
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// ── Ensure tracking table exists ──
async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum    VARCHAR(64)
    )
  `);
}

// ── Get list of numbered .sql migration files ──
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.+\.sql$/.test(f) && !f.endsWith('.down.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.split('_')[0]);
      const numB = parseInt(b.split('_')[0]);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b); // same prefix → alphabetical
    });

  // Warn on duplicate migration numbers
  const seen = new Map();
  for (const f of files) {
    const num = parseInt(f.split('_')[0]);
    if (seen.has(num)) {
      console.warn(`  WARNING: Duplicate migration number ${num}:`);
      console.warn(`    - ${seen.get(num)}`);
      console.warn(`    - ${f}`);
    }
    seen.set(num, f);
  }

  return files;
}

// ── Simple checksum for change detection ──
function checksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ── Get already-applied migrations ──
async function getAppliedMigrations(client) {
  const result = await client.query(
    'SELECT filename, checksum FROM schema_migrations ORDER BY id'
  );
  return new Map(result.rows.map(r => [r.filename, r.checksum]));
}

// ── Run a single migration ──
async function runMigration(client, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const hash = checksum(sql);

  // Run the SQL (each migration in its own transaction)
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [filename, hash]
    );
    await client.query('COMMIT');
    return { success: true, hash };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, error: err.message };
  }
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const statusOnly = args.includes('--status');

  const client = await pool.connect();

  try {
    await ensureTrackingTable(client);

    const allFiles = getMigrationFiles();
    const applied = await getAppliedMigrations(client);
    const pending = allFiles.filter(f => !applied.has(f));

    console.log(`\n  Migrations: ${allFiles.length} total, ${applied.size} applied, ${pending.length} pending\n`);

    if (statusOnly) {
      if (pending.length > 0) {
        console.log('  Pending migrations:');
        pending.forEach(f => console.log(`    - ${f}`));
      } else {
        console.log('  All migrations are up to date.');
      }
      return;
    }

    if (pending.length === 0) {
      console.log('  Nothing to run. Database is up to date.');
      return;
    }

    if (dryRun) {
      console.log('  Dry run — would apply:');
      pending.forEach(f => console.log(`    - ${f}`));
      return;
    }

    // Run pending migrations
    let successCount = 0;
    let failCount = 0;

    for (const filename of pending) {
      process.stdout.write(`  Applying ${filename} ... `);
      const result = await runMigration(client, filename);

      if (result.success) {
        console.log(`OK  [${result.hash}]`);
        successCount++;
      } else {
        console.log(`FAILED`);
        console.error(`    Error: ${result.error}`);
        failCount++;
        // Stop on first failure to prevent cascading errors
        console.log(`\n  Stopping. Fix the above migration and re-run.`);
        break;
      }
    }

    console.log(`\n  Done: ${successCount} applied, ${failCount} failed, ${pending.length - successCount - failCount} skipped.\n`);

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration runner error:', err.message);
  process.exit(1);
});
