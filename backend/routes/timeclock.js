const express = require('express');
const TimeClockService = require('../services/TimeClockService');

function init({ pool }) {
  TimeClockService.init({ pool });

  const router = express.Router();

  // ── Employee endpoints ────────────────────────────────────────────

  // POST /api/timeclock/clock-in
  router.post('/clock-in', async (req, res) => {
    try {
      const entry = await TimeClockService.clockIn(req.user.id, {
        location_id: req.body.location_id,
        notes: req.body.notes,
      });
      res.status(201).json({ entry });
    } catch (err) {
      if (err.message === 'Already clocked in') {
        return res.status(409).json({ error: err.message });
      }
      console.error('Clock in error:', err);
      res.status(500).json({ error: 'Failed to clock in' });
    }
  });

  // POST /api/timeclock/clock-out
  router.post('/clock-out', async (req, res) => {
    try {
      const entry = await TimeClockService.clockOut(req.user.id, {
        notes: req.body.notes,
      });
      res.json({ entry });
    } catch (err) {
      if (err.message === 'No open time entry found') {
        return res.status(404).json({ error: err.message });
      }
      console.error('Clock out error:', err);
      res.status(500).json({ error: 'Failed to clock out' });
    }
  });

  // GET /api/timeclock/status
  router.get('/status', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const status = await TimeClockService.getStatus(req.user.id);
      res.json(status);
    } catch (err) {
      console.error('Time status error:', err);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // GET /api/timeclock/my-entries
  router.get('/my-entries', async (req, res) => {
    try {
      const result = await TimeClockService.getMyEntries(req.user.id, {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
      });
      res.json(result);
    } catch (err) {
      console.error('My entries error:', err);
      res.status(500).json({ error: 'Failed to load entries' });
    }
  });

  // ── Manager endpoints ─────────────────────────────────────────────

  // GET /api/timeclock/entries
  router.get('/entries', async (req, res) => {
    try {
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
    } catch (err) {
      console.error('Get entries error:', err);
      res.status(500).json({ error: 'Failed to load entries' });
    }
  });

  // PUT /api/timeclock/entries/:id/adjust
  router.put('/entries/:id/adjust', async (req, res) => {
    try {
      const entry = await TimeClockService.adjustEntry(
        req.params.id,
        req.body,
        req.user.id
      );
      res.json({ entry });
    } catch (err) {
      if (err.message === 'Entry not found') return res.status(404).json({ error: err.message });
      console.error('Adjust entry error:', err);
      res.status(500).json({ error: 'Failed to adjust entry' });
    }
  });

  // POST /api/timeclock/entries/:id/approve
  router.post('/entries/:id/approve', async (req, res) => {
    try {
      const entry = await TimeClockService.approveEntry(req.params.id, req.user.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found or already approved' });
      res.json({ entry });
    } catch (err) {
      console.error('Approve entry error:', err);
      res.status(500).json({ error: 'Failed to approve entry' });
    }
  });

  // POST /api/timeclock/entries/bulk-approve
  router.post('/entries/bulk-approve', async (req, res) => {
    try {
      const { entry_ids } = req.body;
      if (!Array.isArray(entry_ids) || entry_ids.length === 0) {
        return res.status(400).json({ error: 'entry_ids array required' });
      }
      const result = await TimeClockService.bulkApprove(entry_ids, req.user.id);
      res.json(result);
    } catch (err) {
      console.error('Bulk approve error:', err);
      res.status(500).json({ error: 'Failed to bulk approve' });
    }
  });

  // GET /api/timeclock/summary
  router.get('/summary', async (req, res) => {
    try {
      const summary = await TimeClockService.getSummary({
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
      });
      res.json(summary);
    } catch (err) {
      console.error('Time summary error:', err);
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  // GET /api/timeclock/export
  router.get('/export', async (req, res) => {
    try {
      const csv = await TimeClockService.exportCSV({
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
      });
      const filename = `timesheet-${req.query.date_from || 'all'}-to-${req.query.date_to || 'now'}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      console.error('Time export error:', err);
      res.status(500).json({ error: 'Failed to export' });
    }
  });

  return router;
}

module.exports = { init };
