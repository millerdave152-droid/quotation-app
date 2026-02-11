const fs = require('fs');
const path = require('path');

// Read backend/.env (where the DB credentials are)
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split(/\r?\n/);
const env = {};
lines.forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return;
  const key = line.substring(0, eqIdx).trim();
  let val = line.substring(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
});

console.log('DB_HOST:', env.DB_HOST || 'NOT FOUND');
console.log('DB_PORT:', env.DB_PORT || 'NOT FOUND');
console.log('DB_NAME:', env.DB_NAME || 'NOT FOUND');
console.log('DB_USER:', env.DB_USER || 'NOT FOUND');

const { Pool } = require('pg');

const isRDS = (env.DB_HOST || '').includes('rds.amazonaws.com');
const poolConfig = {
  host: env.DB_HOST || 'localhost',
  port: parseInt(env.DB_PORT || '5432'),
  user: env.DB_USER || 'postgres',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'quotationapp',
  ssl: isRDS ? { rejectUnauthorized: false } : false
};

console.log('Using SSL:', isRDS ? 'yes (RDS)' : 'no');

const pool = new Pool(poolConfig);

async function main() {
  try {
    const test = await pool.query('SELECT NOW() as now');
    console.log('\nConnected successfully at:', test.rows[0].now);

    // 1. Check commission tables
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%commission%' ORDER BY table_name");
    console.log('\n=== Commission Tables ===');
    if (tables.rows.length === 0) {
      console.log('  (none found)');
    } else {
      tables.rows.forEach(r => console.log('  ' + r.table_name));
    }

    // 2. Check transactions columns
    const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='transactions' ORDER BY ordinal_position");
    console.log('\n=== Transactions Columns ===');
    cols.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

    // 3. Sample transactions
    const txns = await pool.query("SELECT transaction_id, user_id, salesperson_id, total_amount, status, created_at FROM transactions ORDER BY created_at DESC LIMIT 10");
    console.log('\n=== Recent Transactions (last 10) ===');
    txns.rows.forEach(r => {
      console.log('  #' + r.transaction_id + ' | user:' + r.user_id + ' | salesperson:' + r.salesperson_id + ' | $' + r.total_amount + ' | ' + r.status + ' | ' + new Date(r.created_at).toISOString().slice(0,19));
    });

    // 4. Total count
    const total = await pool.query("SELECT COUNT(*) as total FROM transactions");
    console.log('\n=== Total Transactions: ' + total.rows[0].total + ' ===');

    // 5. Count by status
    const counts = await pool.query("SELECT status, COUNT(*) as cnt FROM transactions GROUP BY status ORDER BY cnt DESC");
    console.log('\n=== Transaction Counts by Status ===');
    counts.rows.forEach(r => console.log('  ' + r.status + ': ' + r.cnt));

    // 6. Check commission_rules
    try {
      const rules = await pool.query("SELECT * FROM commission_rules LIMIT 10");
      console.log('\n=== Commission Rules (sample) ===');
      console.log(JSON.stringify(rules.rows, null, 2));
    } catch(e) {
      console.log('\n=== commission_rules: ' + e.message + ' ===');
    }

    // 7. Check commission_rates
    try {
      const rates = await pool.query("SELECT * FROM commission_rates LIMIT 10");
      console.log('\n=== Commission Rates (sample) ===');
      console.log(JSON.stringify(rates.rows, null, 2));
    } catch(e) {
      console.log('\n=== commission_rates: ' + e.message + ' ===');
    }

    // 8. Check for any commission-related tables more broadly
    const commTables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%commission%' OR table_name LIKE '%sales_target%' OR table_name LIKE '%incentive%') ORDER BY table_name");
    console.log('\n=== Commission/Sales Target/Incentive Tables ===');
    if (commTables.rows.length === 0) {
      console.log('  (none found)');
    } else {
      commTables.rows.forEach(r => console.log('  ' + r.table_name));
    }

    // 9. Commission-related columns on transactions
    const commCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='transactions' AND column_name LIKE '%commission%'");
    console.log('\n=== Commission-related columns on transactions ===');
    if (commCols.rows.length === 0) {
      console.log('  (none)');
    } else {
      commCols.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));
    }

  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}
main();
