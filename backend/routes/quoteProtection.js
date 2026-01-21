const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

// Email templates endpoints
router.get('/email-templates', authenticate, async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM email_templates WHERE is_active = true';
    const params = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }

    query += ' ORDER BY category, created_at';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

router.get('/email-templates/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

router.post('/email-templates', authenticate, async (req, res) => {
  try {
    const { name, category, subject_line, body_text, variables, talking_points, is_default } = req.body;

    // If this is set as default, unset other defaults in the same category
    if (is_default) {
      await pool.query(
        'UPDATE email_templates SET is_default = false WHERE category = $1',
        [category]
      );
    }

    const result = await pool.query(
      `INSERT INTO email_templates
       (name, category, subject_line, body_text, variables, talking_points, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, category, subject_line, body_text, JSON.stringify(variables || []), JSON.stringify(talking_points || []), is_default || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating email template:', error);
    res.status(500).json({ error: 'Failed to create email template' });
  }
});

router.put('/email-templates/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, subject_line, body_text, variables, talking_points, is_active, is_default } = req.body;

    // If this is set as default, unset other defaults in the same category
    if (is_default) {
      await pool.query(
        'UPDATE email_templates SET is_default = false WHERE category = $1 AND id != $2',
        [category, id]
      );
    }

    const result = await pool.query(
      `UPDATE email_templates
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           subject_line = COALESCE($3, subject_line),
           body_text = COALESCE($4, body_text),
           variables = COALESCE($5, variables),
           talking_points = COALESCE($6, talking_points),
           is_active = COALESCE($7, is_active),
           is_default = COALESCE($8, is_default),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        name, category, subject_line, body_text,
        variables ? JSON.stringify(variables) : null,
        talking_points ? JSON.stringify(talking_points) : null,
        is_active, is_default, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

router.delete('/email-templates/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM email_templates WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

// Quote tracking endpoints
router.post('/quotations/:id/track', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { event_type, device_type } = req.body;
    const ip_address = req.ip || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];

    await pool.query(
      `INSERT INTO quote_tracking_events
       (quotation_id, event_type, ip_address, user_agent, device_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, event_type, ip_address, user_agent, device_type]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking quote event:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

router.get('/quotations/:id/tracking', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM quote_tracking_events
       WHERE quotation_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tracking events:', error);
    res.status(500).json({ error: 'Failed to fetch tracking events' });
  }
});

// Generate tracking token for a quote
router.post('/quotations/:id/generate-tracking-token', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const token = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      'UPDATE quotations SET tracking_token = $1 WHERE id = $2 RETURNING tracking_token',
      [token, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ tracking_token: result.rows[0].tracking_token });
  } catch (error) {
    console.error('Error generating tracking token:', error);
    res.status(500).json({ error: 'Failed to generate tracking token' });
  }
});

// Update quote protection settings
router.put('/quotations/:id/protection', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      hide_model_numbers,
      watermark_text,
      watermark_enabled,
      quote_expiry_date,
      tracking_enabled,
      terms_and_conditions
    } = req.body;

    const result = await pool.query(
      `UPDATE quotations
       SET hide_model_numbers = COALESCE($1, hide_model_numbers),
           watermark_text = COALESCE($2, watermark_text),
           watermark_enabled = COALESCE($3, watermark_enabled),
           quote_expiry_date = COALESCE($4, quote_expiry_date),
           tracking_enabled = COALESCE($5, tracking_enabled),
           terms_and_conditions = COALESCE($6, terms_and_conditions),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        hide_model_numbers,
        watermark_text,
        watermark_enabled,
        quote_expiry_date,
        tracking_enabled,
        terms_and_conditions,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating quote protection:', error);
    res.status(500).json({ error: 'Failed to update quote protection' });
  }
});

// Get expiring quotes
router.get('/quotations/expiring-soon', authenticate, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await pool.query(
      `SELECT * FROM quotations
       WHERE status IN ('DRAFT', 'SENT')
       AND quote_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::integer
       ORDER BY quote_expiry_date ASC`,
      [days]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching expiring quotes:', error);
    res.status(500).json({ error: 'Failed to fetch expiring quotes' });
  }
});

// Expire old quotes (can be called by cron job)
router.post('/quotations/expire-old', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE quotations
       SET status = 'EXPIRED'
       WHERE quote_expiry_date < CURRENT_DATE
       AND status IN ('DRAFT', 'SENT')
       RETURNING id, quote_number, quote_expiry_date`
    );

    res.json({
      success: true,
      expired_count: result.rows.length,
      expired_quotes: result.rows
    });
  } catch (error) {
    console.error('Error expiring old quotes:', error);
    res.status(500).json({ error: 'Failed to expire old quotes' });
  }
});

module.exports = router;
