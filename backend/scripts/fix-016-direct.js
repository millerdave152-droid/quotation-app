/**
 * Fix migration 016 by running it as a single query after fixing comment syntax.
 * The issue is /** (JSDoc-style) comments that PostgreSQL doesn't handle well.
 */
process.env.DATABASE_SSL = 'false';
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function run() {
  let sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_delivery_fulfillment.sql'), 'utf8');

  // The real issue: PostgreSQL DOES support /* */ comments and even nested ones,
  // but only if properly terminated. Let's check for /** that creates nesting issues.
  // Actually the real problem might be that the file has a BOM or encoding issue.

  // Let's try a different approach: run the entire file as one query
  // But first, fix the comment style
  // Replace /** with -- block start and */ with -- block end as line comments
  // Actually, let's just try running it raw first to see the exact error position.

  try {
    await db.query(sql);
    console.log('✓ Migration 016 applied successfully');
  } catch (e) {
    console.log('Error position:', e.position);
    console.log('Error:', e.message);

    // Show context around the error position
    if (e.position) {
      const pos = parseInt(e.position);
      const before = sql.substring(Math.max(0, pos - 100), pos);
      const after = sql.substring(pos, pos + 100);
      console.log('\nContext around error:');
      console.log('BEFORE: ...' + before);
      console.log('>>> ERROR HERE <<<');
      console.log('AFTER: ' + after + '...');
    }
  }

  await db.end();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
