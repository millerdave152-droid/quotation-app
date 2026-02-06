const express = require('express');
const CallLogService = require('../services/CallLogService');

function init({ pool }) {
  CallLogService.init({ pool });

  const router = express.Router();

  // POST /api/customers/:id/calls
  router.post('/customers/:id/calls', async (req, res) => {
    try {
      const call = await CallLogService.createCall(req.params.id, req.body, req.user?.id);
      res.status(201).json({ call });
    } catch (err) {
      console.error('Create call error:', err);
      res.status(500).json({ error: 'Failed to log call' });
    }
  });

  // GET /api/customers/:id/calls
  router.get('/customers/:id/calls', async (req, res) => {
    try {
      const result = await CallLogService.getCustomerCalls(req.params.id, {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
      });
      res.json(result);
    } catch (err) {
      console.error('Get customer calls error:', err);
      res.status(500).json({ error: 'Failed to load calls' });
    }
  });

  // PUT /api/calls/:id
  router.put('/calls/:id', async (req, res) => {
    try {
      const call = await CallLogService.updateCall(req.params.id, req.body);
      if (!call) return res.status(404).json({ error: 'Call not found' });
      res.json({ call });
    } catch (err) {
      console.error('Update call error:', err);
      res.status(500).json({ error: 'Failed to update call' });
    }
  });

  // POST /api/calls/:id/complete-followup
  router.post('/calls/:id/complete-followup', async (req, res) => {
    try {
      const call = await CallLogService.completeFollowUp(req.params.id);
      if (!call) return res.status(404).json({ error: 'Call not found or no follow-up pending' });
      res.json({ call });
    } catch (err) {
      console.error('Complete follow-up error:', err);
      res.status(500).json({ error: 'Failed to complete follow-up' });
    }
  });

  // GET /api/calls/follow-ups
  router.get('/calls/follow-ups', async (req, res) => {
    try {
      const followUps = await CallLogService.getFollowUps({
        assigned_to: req.query.assigned_to ? parseInt(req.query.assigned_to) : undefined,
        date: req.query.date || undefined,
        overdue: req.query.overdue,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
      });
      res.json({ follow_ups: followUps });
    } catch (err) {
      console.error('Get follow-ups error:', err);
      res.status(500).json({ error: 'Failed to load follow-ups' });
    }
  });

  // GET /api/calls/recent
  router.get('/calls/recent', async (req, res) => {
    try {
      const calls = await CallLogService.getRecentCalls({
        limit: parseInt(req.query.limit) || 20,
        user_id: req.query.user_id ? parseInt(req.query.user_id) : undefined,
      });
      res.json({ calls });
    } catch (err) {
      console.error('Get recent calls error:', err);
      res.status(500).json({ error: 'Failed to load recent calls' });
    }
  });

  // GET /api/calls/stats
  router.get('/calls/stats', async (req, res) => {
    try {
      const stats = await CallLogService.getStats({
        date_from: req.query.date_from || undefined,
        date_to: req.query.date_to || undefined,
      });
      res.json(stats);
    } catch (err) {
      console.error('Get call stats error:', err);
      res.status(500).json({ error: 'Failed to load stats' });
    }
  });

  // POST /api/calls/quick-log
  router.post('/calls/quick-log', async (req, res) => {
    try {
      const result = await CallLogService.quickLog(req.body, req.user?.id);
      if (result.error === 'customer_not_found') {
        return res.status(404).json({ error: 'No customer found for phone number', phone: result.phone });
      }
      res.status(201).json(result);
    } catch (err) {
      console.error('Quick log error:', err);
      res.status(500).json({ error: 'Failed to quick-log call' });
    }
  });

  return router;
}

module.exports = { init };
