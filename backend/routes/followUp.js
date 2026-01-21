const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

// Get all follow-up reminders for a quote
router.get('/quotations/:id/follow-ups', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT fr.*, et.name as template_name, et.subject_line, et.body_text
       FROM follow_up_reminders fr
       LEFT JOIN email_templates et ON fr.email_template_id = et.id
       WHERE fr.quotation_id = $1
       ORDER BY fr.scheduled_for ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// Get all pending follow-ups across all quotes
router.get('/follow-ups/pending', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fr.*, q.quote_number, q.customer_name, et.name as template_name
       FROM follow_up_reminders fr
       JOIN quotations q ON fr.quotation_id = q.id
       LEFT JOIN email_templates et ON fr.email_template_id = et.id
       WHERE fr.status = 'PENDING' AND fr.scheduled_for <= NOW() + INTERVAL '7 days'
       ORDER BY fr.scheduled_for ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch pending follow-ups' });
  }
});

// Schedule a new follow-up reminder
router.post('/quotations/:id/follow-ups', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reminder_type, scheduled_for, email_template_id } = req.body;

    const result = await pool.query(
      `INSERT INTO follow_up_reminders
       (quotation_id, reminder_type, scheduled_for, email_template_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, reminder_type, scheduled_for, email_template_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// Mark follow-up as sent
router.put('/follow-ups/:id/sent', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE follow_up_reminders
       SET status = 'SENT', sent_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Update quote's last_followed_up_at
    if (result.rows.length > 0) {
      await pool.query(
        `UPDATE quotations
         SET last_followed_up_at = NOW()
         WHERE id = $1`,
        [result.rows[0].quotation_id]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking follow-up as sent:', error);
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
});

// Cancel a follow-up
router.delete('/follow-ups/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE follow_up_reminders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cancelling follow-up:', error);
    res.status(500).json({ error: 'Failed to cancel follow-up' });
  }
});

// Log a quote interaction
router.post('/quotations/:id/interactions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { interaction_type, notes, next_action, next_action_date, created_by } = req.body;

    const result = await pool.query(
      `INSERT INTO quote_interactions
       (quotation_id, interaction_type, notes, next_action, next_action_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, interaction_type, notes, next_action, next_action_date, created_by]
    );

    // Update quote's last_followed_up_at
    await pool.query(
      `UPDATE quotations
       SET last_followed_up_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error logging interaction:', error);
    res.status(500).json({ error: 'Failed to log interaction' });
  }
});

// Get all interactions for a quote
router.get('/quotations/:id/interactions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM quote_interactions
       WHERE quotation_id = $1
       ORDER BY interaction_date DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching interactions:', error);
    res.status(500).json({ error: 'Failed to fetch interactions' });
  }
});

// Get quotes needing follow-up (no activity in X days)
router.get('/follow-ups/stale-quotes', authenticate, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await pool.query(
      `SELECT q.*,
              COALESCE(q.last_followed_up_at, q.created_at) as last_activity,
              CURRENT_DATE - COALESCE(q.last_followed_up_at, q.created_at)::date as days_since_activity
       FROM quotations q
       WHERE q.status IN ('SENT', 'DRAFT')
       AND CURRENT_DATE - COALESCE(q.last_followed_up_at, q.created_at)::date >= $1
       ORDER BY days_since_activity DESC`,
      [days]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stale quotes:', error);
    res.status(500).json({ error: 'Failed to fetch stale quotes' });
  }
});

// Get follow-up dashboard stats
router.get('/follow-ups/stats', authenticate, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING' AND scheduled_for <= NOW()) as overdue_count,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND scheduled_for > NOW() AND scheduled_for <= NOW() + INTERVAL '3 days') as due_soon_count,
        COUNT(*) FILTER (WHERE status = 'SENT' AND sent_at >= NOW() - INTERVAL '7 days') as sent_this_week
      FROM follow_up_reminders
    `);

    const staleQuotes = await pool.query(`
      SELECT COUNT(*) as stale_count
      FROM quotations
      WHERE status IN ('SENT', 'DRAFT')
      AND CURRENT_DATE - COALESCE(last_followed_up_at, created_at)::date >= 7
    `);

    res.json({
      ...stats.rows[0],
      stale_quotes: parseInt(staleQuotes.rows[0].stale_count)
    });
  } catch (error) {
    console.error('Error fetching follow-up stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
