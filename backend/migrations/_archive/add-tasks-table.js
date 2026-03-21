/**
 * Migration: Add Tasks Table
 * Creates a task management system for follow-ups and reminders
 */

async function up(pool) {
  // Create tasks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due_date TIMESTAMP,
      due_time TIME,
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
      priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      task_type VARCHAR(50) DEFAULT 'follow_up' CHECK (task_type IN ('follow_up', 'call', 'email', 'meeting', 'quote', 'other')),
      assigned_to INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      related_type VARCHAR(50) CHECK (related_type IN ('lead', 'quote', 'customer', 'order')),
      related_id INTEGER,
      reminder_at TIMESTAMP,
      reminder_sent BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP,
      completed_by INTEGER REFERENCES users(id),
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_related ON tasks(related_type, related_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder_at) WHERE reminder_sent = FALSE;
  `);

  // Create trigger for updated_at
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_tasks_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
    CREATE TRIGGER tasks_updated_at
      BEFORE UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_tasks_updated_at();
  `);

  console.log('Tasks table created successfully');
}

async function down(pool) {
  await pool.query(`
    DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
    DROP FUNCTION IF EXISTS update_tasks_updated_at();
    DROP TABLE IF EXISTS tasks CASCADE;
  `);
  console.log('Tasks table dropped');
}

module.exports = { up, down };
