const pool = require('../db');
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'migrations', '123_commission_system_fix.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Migration 123 completed successfully!');
    console.log('Fixed: commission_rules schema (added missing columns)');
    console.log('Created: commission_earnings, commission_tiers, commission_payouts, commission_payout_items, sales_rep_commission_settings tables');
    console.log('Created: indexes on commission tables');
    console.log('Seeded: default commission rules (flat 3%, warranty 15%, service 10%)');
    console.log('Fixed: views to use first_name || last_name instead of u.name');
    pool.end();
  })
  .catch(e => {
    console.error('Migration 123 failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    pool.end();
    process.exit(1);
  });
