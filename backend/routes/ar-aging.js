const express = require('express');
const ARAgingService = require('../services/ARAgingService');

function init({ pool, emailService }) {
  ARAgingService.init({ pool });

  const router = express.Router();

  // GET /api/reports/ar-aging
  router.get('/ar-aging', async (req, res) => {
    try {
      const report = await ARAgingService.getAgingReport({
        as_of_date: req.query.as_of_date || undefined,
        location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
      });
      res.json(report);
    } catch (err) {
      console.error('AR aging report error:', err);
      res.status(500).json({ error: 'Failed to generate AR aging report' });
    }
  });

  // GET /api/reports/ar-aging/export
  router.get('/ar-aging/export', async (req, res) => {
    try {
      const format = req.query.format || 'csv';

      if (format === 'csv') {
        const csv = await ARAgingService.exportCSV({
          as_of_date: req.query.as_of_date || undefined,
          location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
        });
        const filename = `ar-aging-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      if (format === 'json') {
        const report = await ARAgingService.getAgingReport({
          as_of_date: req.query.as_of_date || undefined,
          location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
        });
        const filename = `ar-aging-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.json(report);
      }

      res.status(400).json({ error: 'Supported formats: csv, json' });
    } catch (err) {
      console.error('AR aging export error:', err);
      res.status(500).json({ error: 'Failed to export AR aging report' });
    }
  });

  // POST /api/reports/ar-aging/send-reminders
  router.post('/ar-aging/send-reminders', async (req, res) => {
    try {
      const { customer_ids } = req.body;
      if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
        return res.status(400).json({ error: 'customer_ids array required' });
      }
      const results = await ARAgingService.sendReminders(customer_ids, { emailService });
      res.json(results);
    } catch (err) {
      console.error('AR aging reminders error:', err);
      res.status(500).json({ error: 'Failed to send reminders' });
    }
  });

  return router;
}

module.exports = { init };
