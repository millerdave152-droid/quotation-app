const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function createPushSubscriptionsTable() {
  const client = await pool.connect();

  try {
    console.log('Creating push_subscriptions table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        expiration_time BIGINT,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ push_subscriptions table created successfully');

    // Create index on endpoint for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
      ON push_subscriptions(endpoint)
    `);

    console.log('✅ Index created on endpoint column');

  } catch (error) {
    console.error('❌ Error creating push_subscriptions table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
createPushSubscriptionsTable()
  .then(() => {
    console.log('Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
