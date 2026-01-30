/**
 * Create test users for approval workflow testing
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

async function createTestUsers() {
  const client = await pool.connect();
  try {
    // Hash password 'Test123!'
    const passwordHash = await bcrypt.hash('Test123!', 10);

    // Create manager first
    const managerResult = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, can_approve_quotes, approval_threshold_percent, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO UPDATE SET
        can_approve_quotes = true,
        role = 'manager',
        password_hash = $2
      RETURNING id, email
    `, ['manager@test.com', passwordHash, 'Test', 'Manager', 'manager', true, 15, true]);

    const managerId = managerResult.rows[0].id;
    console.log('✅ Manager created:', managerResult.rows[0]);

    // Create salesperson with manager_id
    const salesResult = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, manager_id, approval_threshold_percent, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO UPDATE SET
        manager_id = $6,
        approval_threshold_percent = $7,
        password_hash = $2
      RETURNING id, email
    `, ['sales@test.com', passwordHash, 'Test', 'Salesperson', 'user', managerId, 20, true]);

    console.log('✅ Salesperson created:', salesResult.rows[0]);

    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       TEST USERS CREATED SUCCESSFULLY    ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║                                          ║');
    console.log('║  SALESPERSON:                            ║');
    console.log('║    Email: sales@test.com                 ║');
    console.log('║    Password: Test123!                    ║');
    console.log('║    Margin Threshold: 20%                 ║');
    console.log('║    Reports to: manager@test.com          ║');
    console.log('║                                          ║');
    console.log('║  MANAGER:                                ║');
    console.log('║    Email: manager@test.com               ║');
    console.log('║    Password: Test123!                    ║');
    console.log('║    Can Approve Quotes: YES               ║');
    console.log('║                                          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('Test the approval workflow:');
    console.log('1. Login as sales@test.com');
    console.log('2. Create a quote with margin < 20%');
    console.log('3. Try to send - should be blocked');
    console.log('4. Request approval - manager auto-filled');
    console.log('5. Login as manager@test.com');
    console.log('6. Approve the quote');
    console.log('7. Login as sales@test.com');
    console.log('8. Send button should now work');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

createTestUsers();
