/**
 * Migration: Add Webhook System Tables
 * Creates tables for webhook subscriptions and delivery logs
 */

async function up(pool) {
  // Create webhooks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{}',
      secret VARCHAR(64) NOT NULL,
      headers JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT TRUE,
      retry_count INTEGER DEFAULT 3,
      created_by INTEGER REFERENCES users(id),
      last_triggered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create webhook_logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id SERIAL PRIMARY KEY,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event_type VARCHAR(100) NOT NULL,
      payload TEXT,
      response_status INTEGER,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
    CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN(events);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON webhook_logs(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event_type);
  `);

  console.log('Webhook tables created successfully');
}

async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS webhook_logs CASCADE;
    DROP TABLE IF EXISTS webhooks CASCADE;
  `);
  console.log('Webhook tables dropped');
}

module.exports = { up, down };
