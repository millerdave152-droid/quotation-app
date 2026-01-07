/**
 * Analyze manufacturer data for normalization opportunities
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function analyze() {
  console.log('='.repeat(70));
  console.log('MANUFACTURER DATA ANALYSIS');
  console.log('='.repeat(70));

  // Get all unique manufacturers with counts
  const manufacturers = await pool.query(`
    SELECT manufacturer, COUNT(*) as cnt
    FROM products
    WHERE manufacturer IS NOT NULL
    GROUP BY manufacturer
    ORDER BY manufacturer
  `);

  console.log('\nAll manufacturers (alphabetical):');
  console.log('-'.repeat(50));
  for (const m of manufacturers.rows) {
    console.log(`  [${m.cnt.toString().padStart(4)}] ${m.manufacturer}`);
  }

  // Find potential duplicates (similar names)
  console.log('\n\nPOTENTIAL DUPLICATES / NORMALIZATION ISSUES:');
  console.log('-'.repeat(50));

  const names = manufacturers.rows.map(m => m.manufacturer);
  const issues = [];

  // Check for common issues
  for (const m of names) {
    // Check for trailing/leading spaces
    if (m !== m.trim()) {
      issues.push(`Spaces: "${m}"`);
    }

    // Check for case variations
    const lower = m.toLowerCase();
    const similar = names.filter(n => n !== m && n.toLowerCase() === lower);
    if (similar.length > 0) {
      issues.push(`Case: "${m}" vs "${similar.join(', ')}"`);
    }

    // Check for with/without special chars
    const normalized = m.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const similarNorm = names.filter(n => n !== m &&
      n.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalized);
    if (similarNorm.length > 0 && !issues.some(i => i.includes(m))) {
      issues.push(`Similar: "${m}" vs "${similarNorm.join(', ')}"`);
    }
  }

  // Print unique issues
  const uniqueIssues = [...new Set(issues)];
  for (const issue of uniqueIssues) {
    console.log(`  ⚠️  ${issue}`);
  }

  // Check for null/empty manufacturers
  const nullCount = await pool.query(`
    SELECT COUNT(*) as cnt FROM products WHERE manufacturer IS NULL OR manufacturer = ''
  `);
  console.log(`\nProducts with NULL/empty manufacturer: ${nullCount.rows[0].cnt}`);

  // Products with "?" manufacturer
  const unknownCount = await pool.query(`
    SELECT COUNT(*) as cnt FROM products WHERE manufacturer = '?'
  `);
  console.log(`Products with '?' manufacturer: ${unknownCount.rows[0].cnt}`);

  // Sample products with missing manufacturers
  const missing = await pool.query(`
    SELECT model, name, category
    FROM products
    WHERE manufacturer IS NULL OR manufacturer = '' OR manufacturer = '?'
    LIMIT 15
  `);
  console.log('\nSample products with missing manufacturer:');
  for (const p of missing.rows) {
    console.log(`  ${p.model || '-'} | ${(p.name || '-').substring(0, 50)}`);
  }

  await pool.end();
  console.log('\n' + '='.repeat(70));
}

analyze().catch(console.error);
