/**
 * Migration: Add Lead Assignment System Tables
 * Creates tables for automated lead assignment rules
 */

async function up(pool) {
  // Create lead assignment rules table
  // strategy: round_robin, workload, territory, expertise, availability, specific_user
  // conditions: lead_sources, priorities, min_budget, max_budget, min_score, categories, postal_codes, cities
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_assignment_rules (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      strategy VARCHAR(50) NOT NULL DEFAULT 'round_robin',
      conditions JSONB DEFAULT '{}',
      assigned_users INTEGER[] DEFAULT '{}',
      priority INTEGER DEFAULT 100,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create lead assignment log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_assignment_log (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id),
      rule_id INTEGER REFERENCES lead_assignment_rules(id) ON DELETE SET NULL,
      strategy VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns to leads table if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'assignment_rule_id'
      ) THEN
        ALTER TABLE leads ADD COLUMN assignment_rule_id INTEGER REFERENCES lead_assignment_rules(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'assignment_strategy'
      ) THEN
        ALTER TABLE leads ADD COLUMN assignment_strategy VARCHAR(50);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'assigned_at'
      ) THEN
        ALTER TABLE leads ADD COLUMN assigned_at TIMESTAMP;
      END IF;
    END $$
  `);

  // Add territory and expertise columns to users if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'territories'
      ) THEN
        ALTER TABLE users ADD COLUMN territories TEXT[] DEFAULT '{}';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'expertise'
      ) THEN
        ALTER TABLE users ADD COLUMN expertise TEXT[] DEFAULT '{}';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'availability_status'
      ) THEN
        ALTER TABLE users ADD COLUMN availability_status VARCHAR(20) DEFAULT 'available';
      END IF;
    END $$
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lead_assignment_rules_active ON lead_assignment_rules(is_active);
    CREATE INDEX IF NOT EXISTS idx_lead_assignment_rules_priority ON lead_assignment_rules(priority);
    CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_lead ON lead_assignment_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_assignment_log_user ON lead_assignment_log(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_leads_assignment_rule ON leads(assignment_rule_id);
  `);

  // Insert default rules
  await pool.query(`
    INSERT INTO lead_assignment_rules (name, strategy, conditions, priority, is_active) VALUES
      ('Hot Leads - Round Robin', 'round_robin', '{"priorities": ["hot"]}', 10, TRUE),
      ('High Score Leads - Lowest Workload', 'workload', '{"min_score": 70}', 20, TRUE),
      ('Default - Round Robin', 'round_robin', '{}', 100, TRUE)
    ON CONFLICT DO NOTHING
  `);

  console.log('Lead assignment tables created successfully');
}

async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS lead_assignment_log CASCADE;
    DROP TABLE IF EXISTS lead_assignment_rules CASCADE;
    ALTER TABLE leads DROP COLUMN IF EXISTS assignment_rule_id;
    ALTER TABLE leads DROP COLUMN IF EXISTS assignment_strategy;
    ALTER TABLE leads DROP COLUMN IF EXISTS assigned_at;
    ALTER TABLE users DROP COLUMN IF EXISTS territories;
    ALTER TABLE users DROP COLUMN IF EXISTS expertise;
    ALTER TABLE users DROP COLUMN IF EXISTS availability_status;
  `);
  console.log('Lead assignment tables dropped');
}

module.exports = { up, down };
