/**
 * Migration: Add Multi-Level Approval Workflows
 * Enhances approval system with configurable multi-level workflows
 */

const pool = require('../db');

async function addMultiLevelApprovalWorkflows() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('📋 Adding multi-level approval workflow system...');

    // 1. Create approval workflow templates table
    console.log('   ➜ Creating approval_workflow_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_workflow_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_condition JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create approval workflow levels table
    console.log('   ➜ Creating approval_workflow_levels table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_workflow_levels (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES approval_workflow_templates(id) ON DELETE CASCADE,
        level_order INTEGER NOT NULL,
        level_name VARCHAR(100) NOT NULL,
        approver_role VARCHAR(100),
        approver_email VARCHAR(255),
        approver_name VARCHAR(255),
        auto_approve_below_amount DECIMAL(15, 2),
        required BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(template_id, level_order)
      )
    `);

    // 3. Enhance quote_approvals table with level tracking
    console.log('   ➜ Enhancing quote_approvals table...');
    await client.query(`
      ALTER TABLE quote_approvals
      ADD COLUMN IF NOT EXISTS workflow_template_id INTEGER REFERENCES approval_workflow_templates(id),
      ADD COLUMN IF NOT EXISTS level_id INTEGER REFERENCES approval_workflow_levels(id),
      ADD COLUMN IF NOT EXISTS level_order INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS approval_type VARCHAR(50) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    // 4. Create approval history table for audit trail
    console.log('   ➜ Creating approval_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_history (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        approval_id INTEGER REFERENCES quote_approvals(id) ON DELETE SET NULL,
        level_order INTEGER NOT NULL,
        approver_name VARCHAR(255),
        approver_email VARCHAR(255),
        action VARCHAR(20) NOT NULL,
        comments TEXT,
        quote_amount DECIMAL(15, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Create indexes for performance
    console.log('   ➜ Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_workflow_levels_template
      ON approval_workflow_levels(template_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_approvals_workflow
      ON quote_approvals(workflow_template_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_history_quotation
      ON approval_history(quotation_id);
    `);

    // 6. Create view for approval status
    console.log('   ➜ Creating approval_status view...');
    await client.query(`
      CREATE OR REPLACE VIEW quote_approval_status AS
      SELECT
        q.id as quotation_id,
        q.quotation_number,
        q.total_amount,
        q.customer_name,
        qa.workflow_template_id,
        awt.name as workflow_name,
        COUNT(DISTINCT qa.id) as total_levels,
        COUNT(DISTINCT CASE WHEN qa.status = 'approved' THEN qa.id END) as approved_levels,
        COUNT(DISTINCT CASE WHEN qa.status = 'pending' THEN qa.id END) as pending_levels,
        COUNT(DISTINCT CASE WHEN qa.status = 'rejected' THEN qa.id END) as rejected_levels,
        CASE
          WHEN COUNT(DISTINCT CASE WHEN qa.status = 'rejected' THEN qa.id END) > 0 THEN 'rejected'
          WHEN COUNT(DISTINCT CASE WHEN qa.status = 'approved' THEN qa.id END) = COUNT(DISTINCT qa.id) THEN 'fully_approved'
          WHEN COUNT(DISTINCT CASE WHEN qa.status = 'approved' THEN qa.id END) > 0 THEN 'partially_approved'
          ELSE 'pending'
        END as overall_status,
        MIN(CASE WHEN qa.status = 'pending' THEN qa.level_order END) as next_approval_level,
        MAX(qa.reviewed_at) as last_action_at
      FROM quotations q
      LEFT JOIN quote_approvals qa ON q.id = qa.quotation_id
      LEFT JOIN approval_workflow_templates awt ON qa.workflow_template_id = awt.id
      GROUP BY q.id, q.quotation_number, q.total_amount, q.customer_name,
               qa.workflow_template_id, awt.name
    `);

    // 7. Insert default approval workflow templates
    console.log('   ➜ Creating default approval workflows...');

    // Standard workflow for quotes under $10,000
    const standardWorkflow = await client.query(`
      INSERT INTO approval_workflow_templates (name, description, trigger_condition)
      VALUES (
        'Standard Approval',
        'For quotes under $10,000 - requires manager approval',
        '{"min_amount": 0, "max_amount": 10000}'::jsonb
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO approval_workflow_levels (template_id, level_order, level_name, approver_role, required)
      VALUES
        ($1, 1, 'Manager Approval', 'Manager', true)
    `, [standardWorkflow.rows[0].id]);

    // Advanced workflow for quotes $10,000 - $50,000
    const advancedWorkflow = await client.query(`
      INSERT INTO approval_workflow_templates (name, description, trigger_condition)
      VALUES (
        'Advanced Approval',
        'For quotes $10,000 - $50,000 - requires manager and director approval',
        '{"min_amount": 10000, "max_amount": 50000}'::jsonb
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO approval_workflow_levels (template_id, level_order, level_name, approver_role, required)
      VALUES
        ($1, 1, 'Manager Approval', 'Manager', true),
        ($1, 2, 'Director Approval', 'Director', true)
    `, [advancedWorkflow.rows[0].id]);

    // Executive workflow for quotes over $50,000
    const executiveWorkflow = await client.query(`
      INSERT INTO approval_workflow_templates (name, description, trigger_condition)
      VALUES (
        'Executive Approval',
        'For quotes over $50,000 - requires manager, director, and VP approval',
        '{"min_amount": 50000, "max_amount": 999999999}'::jsonb
      )
      RETURNING id
    `);

    await client.query(`
      INSERT INTO approval_workflow_levels (template_id, level_order, level_name, approver_role, required)
      VALUES
        ($1, 1, 'Manager Approval', 'Manager', true),
        ($1, 2, 'Director Approval', 'Director', true),
        ($1, 3, 'VP Approval', 'VP', true)
    `, [executiveWorkflow.rows[0].id]);

    await client.query('COMMIT');

    console.log('✅ Multi-level approval workflow system added successfully!');
    console.log('\nFeatures added:');
    console.log('   • Approval workflow templates');
    console.log('   • Multi-level approval chains');
    console.log('   • Configurable approval levels');
    console.log('   • Approval history audit trail');
    console.log('   • Auto-approval based on amount');
    console.log('   • Default workflows: Standard, Advanced, Executive');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding approval workflow system:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration if called directly
if (require.main === module) {
  addMultiLevelApprovalWorkflows()
    .then(() => {
      console.log('\n✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addMultiLevelApprovalWorkflows;
