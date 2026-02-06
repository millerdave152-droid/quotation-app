const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();
  router.use(authenticate);

  const eventEmitter = require('../services/eventEmitter');

  // ---- POST /trigger — manually fire a notification event ----

  router.post('/trigger', checkPermission('manager'), async (req, res) => {
    try {
      const { event, delivery_id, order_id } = req.body;
      if (!event) return res.status(400).json({ error: 'event is required' });

      const validEvents = [
        'order.confirmed', 'delivery.scheduled', 'delivery.reminder_due',
        'delivery.driver_enroute', 'delivery.completed'
      ];
      if (!validEvents.includes(event)) {
        return res.status(400).json({ error: `Invalid event. Valid: ${validEvents.join(', ')}` });
      }

      let payload = {};

      if (event === 'order.confirmed' && order_id) {
        const { rows } = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1', [order_id]);
        if (!rows.length) return res.status(404).json({ error: 'Order not found' });
        payload = { order: rows[0] };
      } else if (event.startsWith('delivery.') && delivery_id) {
        const { rows } = await pool.query('SELECT * FROM delivery_bookings WHERE id = $1', [delivery_id]);
        if (!rows.length) return res.status(404).json({ error: 'Delivery not found' });

        if (event === 'delivery.driver_enroute') {
          // For driver_enroute, include driver info if assigned
          let driver = null;
          if (rows[0].driver_id) {
            const driverResult = await pool.query('SELECT * FROM drivers WHERE id = $1', [rows[0].driver_id]);
            driver = driverResult.rows[0] || null;
          }
          payload = { delivery: rows[0], driver, stopsAway: null, eta: null };
        } else {
          payload = { delivery: rows[0] };
        }
      } else {
        return res.status(400).json({ error: 'Provide delivery_id or order_id for the event' });
      }

      eventEmitter.emit(event, payload);
      res.json({ triggered: true, event, payload_keys: Object.keys(payload) });
    } catch (err) {
      console.error('Failed to trigger notification:', err);
      res.status(500).json({ error: 'Failed to trigger notification' });
    }
  });

  // ---- GET /config — list trigger configs ----

  router.get('/config', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT tc.*, nt.name as template_name, nt.channel
         FROM notification_trigger_config tc
         LEFT JOIN notification_templates nt ON nt.code = tc.template_code
         ORDER BY tc.id`
      );
      res.json({ triggers: rows });
    } catch (err) {
      console.error('Failed to list trigger config:', err);
      res.status(500).json({ error: 'Failed to list trigger config' });
    }
  });

  // ---- PUT /config/:event_name — enable/disable trigger ----

  router.put('/config/:event_name', checkPermission('admin.settings'), async (req, res) => {
    try {
      const { is_enabled } = req.body;
      if (is_enabled === undefined) return res.status(400).json({ error: 'is_enabled required' });

      const { rows } = await pool.query(
        `UPDATE notification_trigger_config SET is_enabled = $1, updated_at = NOW()
         WHERE event_name = $2 RETURNING *`,
        [is_enabled, req.params.event_name]
      );
      if (!rows.length) return res.status(404).json({ error: 'Trigger config not found' });
      res.json({ trigger: rows[0] });
    } catch (err) {
      console.error('Failed to update trigger config:', err);
      res.status(500).json({ error: 'Failed to update trigger config' });
    }
  });

  // ---- POST /send — queue a notification directly ----

  router.post('/send', async (req, res) => {
    try {
      const { template_code, customer_id, variables = {}, scheduled_for, related_type, related_id } = req.body;
      if (!template_code || !customer_id) {
        return res.status(400).json({ error: 'template_code and customer_id are required' });
      }

      const notificationService = require('../services/NotificationTriggerService');
      const result = await notificationService.send(template_code, customer_id, variables, {
        scheduled_for: scheduled_for ? new Date(scheduled_for) : undefined,
        related_type,
        related_id
      });

      if (result.queued) {
        res.json({ queued: true, notification_id: result.id, channel: result.channel });
      } else {
        res.status(422).json({ queued: false, reason: result.reason });
      }
    } catch (err) {
      console.error('Failed to send notification:', err);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // ---- GET /history — queue-based notification history ----

  router.get('/history', async (req, res) => {
    try {
      const { customer_id, template_code, status, date_from, date_to, limit = 50, offset = 0 } = req.query;
      let where = [];
      let params = [];
      let idx = 1;

      if (customer_id) { where.push(`recipient_customer_id = $${idx++}`); params.push(customer_id); }
      if (template_code) { where.push(`template_code = $${idx++}`); params.push(template_code); }
      if (status) { where.push(`status = $${idx++}`); params.push(status); }
      if (date_from) { where.push(`created_at >= $${idx++}`); params.push(date_from); }
      if (date_to) { where.push(`created_at <= $${idx++}`); params.push(date_to); }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT nq.*, c.name as customer_name, c.email as customer_email
         FROM notification_queue nq
         LEFT JOIN customers c ON c.id = nq.recipient_customer_id
         ${whereClause}
         ORDER BY nq.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), parseInt(offset)]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM notification_queue ${whereClause}`,
        params
      );

      res.json({ notifications: rows, total: parseInt(countResult.rows[0].count) });
    } catch (err) {
      console.error('Failed to get notification history:', err);
      res.status(500).json({ error: 'Failed to get notification history' });
    }
  });

  // ---- GET /stats — notification statistics ----

  router.get('/stats', async (req, res) => {
    try {
      const { date_from, date_to } = req.query;
      let dateFilter = '';
      const params = [];
      let idx = 1;

      if (date_from) { dateFilter += ` AND created_at >= $${idx++}`; params.push(date_from); }
      if (date_to) { dateFilter += ` AND created_at <= $${idx++}`; params.push(date_to); }

      // Overall counts by status
      const statusResult = await pool.query(
        `SELECT status, COUNT(*)::int as count FROM notification_queue WHERE 1=1 ${dateFilter} GROUP BY status`,
        params
      );
      const byStatus = {};
      let total = 0;
      for (const row of statusResult.rows) {
        byStatus[row.status] = row.count;
        total += row.count;
      }

      // By template
      const templateResult = await pool.query(
        `SELECT template_code, channel, status, COUNT(*)::int as count
         FROM notification_queue WHERE 1=1 ${dateFilter}
         GROUP BY template_code, channel, status
         ORDER BY template_code`,
        params
      );
      const byTemplate = {};
      for (const row of templateResult.rows) {
        if (!byTemplate[row.template_code]) {
          byTemplate[row.template_code] = { template_code: row.template_code, channel: row.channel, total: 0, sent: 0, failed: 0, pending: 0 };
        }
        byTemplate[row.template_code].total += row.count;
        if (row.status === 'sent' || row.status === 'delivered') byTemplate[row.template_code].sent += row.count;
        else if (row.status === 'failed' || row.status === 'bounced') byTemplate[row.template_code].failed += row.count;
        else if (row.status === 'pending' || row.status === 'processing') byTemplate[row.template_code].pending += row.count;
      }

      // By channel
      const channelResult = await pool.query(
        `SELECT channel, COUNT(*)::int as count FROM notification_queue WHERE 1=1 ${dateFilter} GROUP BY channel`,
        params
      );
      const byChannel = {};
      for (const row of channelResult.rows) {
        byChannel[row.channel] = row.count;
      }

      // Queue health
      const queueResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')::int as queued,
           COUNT(*) FILTER (WHERE status = 'processing')::int as processing,
           COUNT(*) FILTER (WHERE status = 'failed' AND attempts < max_attempts)::int as retryable
         FROM notification_queue`
      );

      res.json({
        total,
        sent: (byStatus.sent || 0) + (byStatus.delivered || 0),
        delivered: byStatus.delivered || 0,
        failed: (byStatus.failed || 0) + (byStatus.bounced || 0),
        bounced: byStatus.bounced || 0,
        pending: (byStatus.pending || 0) + (byStatus.processing || 0),
        by_status: byStatus,
        by_template: Object.values(byTemplate),
        by_channel: byChannel,
        queue: queueResult.rows[0]
      });
    } catch (err) {
      console.error('Failed to get notification stats:', err);
      res.status(500).json({ error: 'Failed to get notification stats' });
    }
  });

  // ---- GET /log — audit log (notification_log table) ----

  router.get('/log', async (req, res) => {
    try {
      const { customer_id, template_code, related_type, related_id, limit = 50, offset = 0 } = req.query;
      let where = [];
      let params = [];
      let idx = 1;

      if (customer_id) { where.push(`customer_id = $${idx++}`); params.push(customer_id); }
      if (template_code) { where.push(`template_code = $${idx++}`); params.push(template_code); }
      if (related_type) { where.push(`related_type = $${idx++}`); params.push(related_type); }
      if (related_id) { where.push(`related_id = $${idx++}`); params.push(related_id); }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM notification_log ${whereClause}
         ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), parseInt(offset)]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM notification_log ${whereClause}`,
        params
      );

      res.json({ log: rows, total: parseInt(countResult.rows[0].count) });
    } catch (err) {
      console.error('Failed to get notification log:', err);
      res.status(500).json({ error: 'Failed to get notification log' });
    }
  });

  // ---- POST /queue/process — manually trigger queue processing ----

  router.post('/queue/process', checkPermission('admin.settings'), async (req, res) => {
    try {
      const notificationService = require('../services/NotificationTriggerService');
      await notificationService.processQueue();
      res.json({ processed: true });
    } catch (err) {
      console.error('Failed to process queue:', err);
      res.status(500).json({ error: 'Failed to process queue' });
    }
  });

  return router;
}

module.exports = { init };
