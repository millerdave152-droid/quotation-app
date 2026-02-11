const bcrypt = require('bcrypt');
const pool = require('../db');

async function main() {
  const hash = await bcrypt.hash('TestPass123!', 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
    [hash, 'manager@test.com']
  );
  console.log('Updated:', result.rows[0]);
  process.exit();
}

main().catch(e => { console.error(e); process.exit(1); });
