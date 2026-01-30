/**
 * Migration: Add Customer Activities
 * Adds customer_id to activity_events and creates customer_activities table
 */

module.exports = {
  name: 'add-customer-activities',
  version: 1,

  async up(pool) {
    console.log('Running migration: add-customer-activities');

    // Create customer_activities table for CRM-style activity logging
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_activities (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        related_type VARCHAR(50),
        related_id INTEGER,
        performed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id
      ON customer_activities (customer_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_activities_type
      ON customer_activities (activity_type)
    `);

    console.log('✅ Customer activities table created');
    return true;
  },

  async down(pool) {
    console.log('Rolling back migration: add-customer-activities');

    await pool.query(`
      DROP TABLE IF EXISTS customer_activities CASCADE
    `);

    console.log('✅ Customer activities table dropped');
    return true;
  }
};
