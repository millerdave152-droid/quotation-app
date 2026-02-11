const express = require('express');
const ARAgingService = require('../services/ARAgingService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool, emailService }) {
  ARAgingService.init({ pool });

  const router = express.Router();

  // GET /api/reports/ar-aging
  router.get('/ar-aging', asyncHandler(async (req, res) => {
    const report = await ARAgingService.getAgingReport({
      as_of_date: req.query.as_of_date || undefined,
      location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
    });
    res.json(report);
  }));

  // GET /api/reports/ar-aging/export
  router.get('/ar-aging/export', asyncHandler(async (req, res) => {
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

    throw ApiError.badRequest('Supported formats: csv, json');
  }));

  // POST /api/reports/ar-aging/send-reminders
  router.post('/ar-aging/send-reminders', asyncHandler(async (req, res) => {
    const { customer_ids } = req.body;
    if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
      throw ApiError.badRequest('customer_ids array required');
    }
    const results = await ARAgingService.sendReminders(customer_ids, { emailService });
    res.json(results);
  }));

  return router;
}

module.exports = { init };
