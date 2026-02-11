const pool = require('../db');
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'migrations', '019_override_threshold_levels.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Migration 019 completed successfully!');
    console.log('Added: category_id, valid_from, valid_to columns to override_thresholds');
    console.log('Created: threshold_approval_levels table with seed data');
    console.log('Created: approval_rule_audit_log table');
    console.log('Created: override_threshold_config view');
    console.log('Created: get_required_approval_level, can_user_approve_override functions');
    pool.end();
  })
  .catch(e => {
    console.error('Migration failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    pool.end();
    process.exit(1);
  });
