const express = require('express');
const CallLogService = require('../services/CallLogService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  CallLogService.init({ pool });

  const router = express.Router();

  // POST /api/customers/:id/calls
  router.post('/customers/:id/calls', asyncHandler(async (req, res) => {
    const call = await CallLogService.createCall(req.params.id, req.body, req.user?.id);
    res.status(201).json({ call });
  }));

  // GET /api/customers/:id/calls
  router.get('/customers/:id/calls', asyncHandler(async (req, res) => {
    const result = await CallLogService.getCustomerCalls(req.params.id, {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(result);
  }));

  // PUT /api/calls/:id
  router.put('/calls/:id', asyncHandler(async (req, res) => {
    const call = await CallLogService.updateCall(req.params.id, req.body);
    if (!call) throw ApiError.notFound('Call');
    res.json({ call });
  }));

  // POST /api/calls/:id/complete-followup
  router.post('/calls/:id/complete-followup', asyncHandler(async (req, res) => {
    const call = await CallLogService.completeFollowUp(req.params.id);
    if (!call) throw ApiError.notFound('Call not found or no follow-up pending');
    res.json({ call });
  }));

  // GET /api/calls/follow-ups
  router.get('/calls/follow-ups', asyncHandler(async (req, res) => {
    const followUps = await CallLogService.getFollowUps({
      assigned_to: req.query.assigned_to ? parseInt(req.query.assigned_to) : undefined,
      date: req.query.date || undefined,
      overdue: req.query.overdue,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json({ follow_ups: followUps });
  }));

  // GET /api/calls/recent
  router.get('/calls/recent', asyncHandler(async (req, res) => {
    const calls = await CallLogService.getRecentCalls({
      limit: parseInt(req.query.limit) || 20,
      user_id: req.query.user_id ? parseInt(req.query.user_id) : undefined,
    });
    res.json({ calls });
  }));

  // GET /api/calls/stats
  router.get('/calls/stats', asyncHandler(async (req, res) => {
    const stats = await CallLogService.getStats({
      date_from: req.query.date_from || undefined,
      date_to: req.query.date_to || undefined,
    });
    res.json(stats);
  }));

  // POST /api/calls/quick-log
  router.post('/calls/quick-log', asyncHandler(async (req, res) => {
    const result = await CallLogService.quickLog(req.body, req.user?.id);
    if (result.error === 'customer_not_found') {
      throw ApiError.notFound('No customer found for phone number');
    }
    res.status(201).json(result);
  }));

  return router;
}

module.exports = { init };
