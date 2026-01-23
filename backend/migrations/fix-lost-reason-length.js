/**
 * Migration: Fix lost_reason column length
 * Expands lost_reason from varchar(100) to varchar(500) to accommodate longer reasons
 */

async function up(pool) {
  await pool.query('ALTER TABLE leads ALTER COLUMN lost_reason TYPE VARCHAR(500)');
  console.log('lost_reason column expanded to varchar(500)');
}

async function down(pool) {
  await pool.query('ALTER TABLE leads ALTER COLUMN lost_reason TYPE VARCHAR(100)');
  console.log('lost_reason column reverted to varchar(100)');
}

module.exports = { up, down };
