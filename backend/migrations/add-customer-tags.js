/**
 * Migration: Add Customer Tags System
 * Creates tables for customer tagging and segmentation
 */

async function up(pool) {
  // Create customer_tags table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#3b82f6',
      description TEXT,
      is_system BOOLEAN DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create customer_tag_assignments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_tag_assignments (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES customer_tags(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id),
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, tag_id)
    )
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_customer ON customer_tag_assignments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tag ON customer_tag_assignments(tag_id);
  `);

  // Insert default system tags
  await pool.query(`
    INSERT INTO customer_tags (name, color, description, is_system) VALUES
      ('VIP', '#8b5cf6', 'High-value or priority customer', TRUE),
      ('New Customer', '#22c55e', 'Recently acquired customer', TRUE),
      ('At Risk', '#ef4444', 'Customer showing signs of churn', TRUE),
      ('Repeat Buyer', '#3b82f6', 'Has made multiple purchases', TRUE),
      ('Contractor', '#f59e0b', 'Builder or contractor account', TRUE),
      ('Wholesale', '#06b6d4', 'Wholesale pricing customer', TRUE)
    ON CONFLICT (name) DO NOTHING
  `);

  console.log('Customer tags tables created successfully');
}

async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS customer_tag_assignments CASCADE;
    DROP TABLE IF EXISTS customer_tags CASCADE;
  `);
  console.log('Customer tags tables dropped');
}

module.exports = { up, down };
