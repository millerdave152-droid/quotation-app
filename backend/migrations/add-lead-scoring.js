/**
 * Migration: Add Lead Scoring Columns
 * Adds lead_score, lead_score_breakdown, and lead_score_updated_at to leads table
 */

module.exports = {
  name: 'add-lead-scoring',
  version: 1,

  async up(pool) {
    console.log('Running migration: add-lead-scoring');

    // Add lead scoring columns
    await pool.query(`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS lead_score_breakdown JSONB DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMP DEFAULT NULL
    `);

    // Create index for lead score queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_lead_score
      ON leads (lead_score DESC NULLS LAST)
      WHERE status NOT IN ('converted', 'lost')
    `);

    console.log('✅ Lead scoring columns added');
    return true;
  },

  async down(pool) {
    console.log('Rolling back migration: add-lead-scoring');

    await pool.query(`
      DROP INDEX IF EXISTS idx_leads_lead_score;
      ALTER TABLE leads
      DROP COLUMN IF EXISTS lead_score,
      DROP COLUMN IF EXISTS lead_score_breakdown,
      DROP COLUMN IF EXISTS lead_score_updated_at
    `);

    console.log('✅ Lead scoring columns removed');
    return true;
  }
};
