const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

function init({ pool }) {
  const router = express.Router();
  router.use(authenticate);

  const ses = new SESv2Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  const fromEmail = process.env.EMAIL_FROM || 'noreply@teletime.ca';

  // ---- Utility ----

  function renderTemplate(template, variables) {
    let rendered = template.body;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
    let subject = template.subject;
    if (subject) {
      for (const [key, value] of Object.entries(variables)) {
        subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
      }
    }
    return { subject, body: rendered };
  }

  // ---- GET / — all templates grouped by channel ----

  router.get('/', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM notification_templates ORDER BY channel, name');
      const grouped = {};
      for (const t of rows) {
        (grouped[t.channel] ||= []).push(t);
      }
      res.json({ templates: grouped });
    } catch (err) {
      console.error('Failed to list templates:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  // ---- GET /:code ----

  router.get('/:code', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM notification_templates WHERE code = $1', [req.params.code]);
      if (!rows.length) return res.status(404).json({ error: 'Template not found' });
      res.json({ template: rows[0] });
    } catch (err) {
      console.error('Failed to get template:', err);
      res.status(500).json({ error: 'Failed to get template' });
    }
  });

  // ---- PUT /:code — update content ----

  router.put('/:code', checkPermission('admin.settings'), async (req, res) => {
    try {
      const { subject, body, name, description, is_active, requires_consent, consent_type } = req.body;
      if (!body) return res.status(400).json({ error: 'body is required' });

      const { rows } = await pool.query(
        `UPDATE notification_templates
         SET subject = COALESCE($1, subject),
             body = $2,
             name = COALESCE($3, name),
             description = COALESCE($4, description),
             is_active = COALESCE($5, is_active),
             requires_consent = COALESCE($6, requires_consent),
             consent_type = COALESCE($7, consent_type),
             updated_by = $8,
             updated_at = NOW()
         WHERE code = $9
         RETURNING *`,
        [subject, body, name, description, is_active, requires_consent, consent_type, req.user?.userId, req.params.code]
      );
      if (!rows.length) return res.status(404).json({ error: 'Template not found' });
      res.json({ template: rows[0] });
    } catch (err) {
      console.error('Failed to update template:', err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  // ---- POST /:code/preview ----

  router.post('/:code/preview', async (req, res) => {
    try {
      const { variables = {} } = req.body;
      const { rows } = await pool.query('SELECT * FROM notification_templates WHERE code = $1', [req.params.code]);
      if (!rows.length) return res.status(404).json({ error: 'Template not found' });

      const rendered = renderTemplate(rows[0], variables);
      res.json({ preview: rendered, channel: rows[0].channel });
    } catch (err) {
      console.error('Failed to preview template:', err);
      res.status(500).json({ error: 'Failed to preview template' });
    }
  });

  // ---- POST /:code/test — send test notification ----

  router.post('/:code/test', checkPermission('admin.settings'), async (req, res) => {
    try {
      const { recipient_email, recipient_phone, variables = {} } = req.body;
      const { rows } = await pool.query('SELECT * FROM notification_templates WHERE code = $1', [req.params.code]);
      if (!rows.length) return res.status(404).json({ error: 'Template not found' });

      const template = rows[0];
      const rendered = renderTemplate(template, variables);

      if (template.channel === 'email') {
        if (!recipient_email) return res.status(400).json({ error: 'recipient_email required for email templates' });
        await ses.send(new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: { ToAddresses: [recipient_email] },
          Content: {
            Simple: {
              Subject: { Data: rendered.subject || '[Test] Notification' },
              Body: { Text: { Data: rendered.body } }
            }
          }
        }));
        return res.json({ sent: true, channel: 'email', to: recipient_email });
      }

      if (template.channel === 'sms') {
        if (!recipient_phone) return res.status(400).json({ error: 'recipient_phone required for sms templates' });
        // SMS sending would integrate with SNS or Twilio — placeholder
        return res.json({ sent: false, channel: 'sms', message: 'SMS provider not configured. Preview body:', body: rendered.body });
      }

      if (template.channel === 'push') {
        return res.json({ sent: false, channel: 'push', message: 'Push provider not configured. Preview body:', body: rendered.body });
      }

      res.status(400).json({ error: `Unknown channel: ${template.channel}` });
    } catch (err) {
      console.error('Failed to send test notification:', err);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  });

  return router;
}

module.exports = { init, renderTemplate: null };

// Export renderTemplate standalone for use by other services
const _renderTemplate = function(template, variables) {
  let rendered = template.body;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  let subject = template.subject;
  if (subject) {
    for (const [key, value] of Object.entries(variables)) {
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
  }
  return { subject, body: rendered };
};
module.exports.renderTemplate = _renderTemplate;
