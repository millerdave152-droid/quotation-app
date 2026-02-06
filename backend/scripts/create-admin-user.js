/**
 * Create/Update admin user for POS app
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function createAdminUser() {
  const client = await pool.connect();
  try {
    const email = 'admin@yourcompany.com';
    const password = 'TestPass123!';

    // Hash password with 12 rounds (matching the app's SALT_ROUNDS)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create or update admin user
    const result = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, can_approve_quotes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $2,
        role = 'admin',
        is_active = true,
        can_approve_quotes = true,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, role
    `, [email, passwordHash, 'Admin', 'User', 'admin', true, true]);

    console.log('');
    console.log('========================================');
    console.log('  ADMIN USER CREATED/UPDATED');
    console.log('========================================');
    console.log('  Email:    ' + result.rows[0].email);
    console.log('  Password: ' + password);
    console.log('  Role:     ' + result.rows[0].role);
    console.log('  User ID:  ' + result.rows[0].id);
    console.log('========================================');
    console.log('');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

createAdminUser();
