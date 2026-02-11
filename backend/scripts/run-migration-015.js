const pool = require('../db');
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'migrations', '015_manager_override_system.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Migration 015 completed successfully!');
    console.log('Created: enums (override_threshold_type, approval_level, override_status)');
    console.log('Created: tables (override_thresholds, manager_pins, override_requests, override_log, override_threshold_exceptions)');
    console.log('Created: functions (check_override_required, verify_manager_pin, log_override)');
    pool.end();
  })
  .catch(e => {
    console.error('Migration failed:', e.message);
    if (e.detail) console.error('Detail:', e.detail);
    if (e.where) console.error('Where:', e.where);
    pool.end();
    process.exit(1);
  });
