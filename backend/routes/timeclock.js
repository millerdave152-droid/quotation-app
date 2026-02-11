const express = require('express');
const TimeClockService = require('../services/TimeClockService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  TimeClockService.init({ pool });

  const router = express.Router();

  // -- Employee endpoints ----

  // POST /api/timeclock/clock-in
  router.post('/clock-in', asyncHandler(async (req, res) => {
    const entry = await TimeClockService.clockIn(req.user.id, {
      location_id: req.body.location_id,
      notes: req.body.notes,
    });
    res.status(201).json({ entry });
  }));

  // POST /api/timeclock/clock-out
  router.post('/clock-out', asyncHandler(async (req, res) => {
    const entry = await TimeClockService.clockOut(req.user.id, {
      notes: req.body.notes,
    });
    res.json({ entry });
  }));

  // GET /api/timeclock/status
  router.get('/status', asyncHandler(async (req, res) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    const status = await TimeClockService.getStatus(req.user.id);
    res.json(status);
  }));

  // GET /api/timeclock/my-entries
  router.get('/my-entries', asyncHandler(async (req, res) => {
    const result = await TimeClockService.getMyEntries(req.user.id, {
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(result);
  }));

  // -- Manager endpoints ----

  // GET /api/timeclock/entries
  router.get('/entries', asyncHandler(async (req, res) => {
    const entries = await TimeClockService.getEntries({
      user_id: req.query.user_id ? parseInt(req.query.user_id) : undefined,
      location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      is_approved: req.query.is_approved !== undefined ? req.query.is_approved === 'true' : undefined,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json({ entries });
  }));

  // PUT /api/timeclock/entries/:id/adjust
  router.put('/entries/:id/adjust', asyncHandler(async (req, res) => {
    const entry = await TimeClockService.adjustEntry(
      req.params.id,
      req.body,
      req.user.id
    );
    res.json({ entry });
  }));

  // POST /api/timeclock/entries/:id/approve
  router.post('/entries/:id/approve', asyncHandler(async (req, res) => {
    const entry = await TimeClockService.approveEntry(req.params.id, req.user.id);
    if (!entry) {
      throw ApiError.notFound('Entry not found or already approved');
    }
    res.json({ entry });
  }));

  // POST /api/timeclock/entries/bulk-approve
  router.post('/entries/bulk-approve', asyncHandler(async (req, res) => {
    const { entry_ids } = req.body;
    if (!Array.isArray(entry_ids) || entry_ids.length === 0) {
      throw ApiError.badRequest('entry_ids array required');
    }
    const result = await TimeClockService.bulkApprove(entry_ids, req.user.id);
    res.json(result);
  }));

  // GET /api/timeclock/summary
  router.get('/summary', asyncHandler(async (req, res) => {
    const summary = await TimeClockService.getSummary({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
    });
    res.json(summary);
  }));

  // GET /api/timeclock/export
  router.get('/export', asyncHandler(async (req, res) => {
    const csv = await TimeClockService.exportCSV({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
    });
    const filename = `timesheet-${req.query.date_from || 'all'}-to-${req.query.date_to || 'now'}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }));

  return router;
}

module.exports = { init };
