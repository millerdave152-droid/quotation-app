const express = require('express');
const LayawayService = require('../services/LayawayService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  LayawayService.init({ pool });

  const router = express.Router();

  // POST /api/layaways
  router.post('/', asyncHandler(async (req, res) => {
    const layaway = await LayawayService.createLayaway(req.body, req.user?.id);
    res.status(201).json({ layaway });
  }));

  // GET /api/layaways
  router.get('/', asyncHandler(async (req, res) => {
    const result = await LayawayService.listLayaways({
      status: req.query.status,
      customer_id: req.query.customer_id ? parseInt(req.query.customer_id) : undefined,
      location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    });
    res.json(result);
  }));

  // GET /api/layaways/:id
  router.get('/:id', asyncHandler(async (req, res) => {
    const layaway = await LayawayService.getLayaway(req.params.id);
    if (!layaway) {
      throw ApiError.notFound('Layaway');
    }
    res.json({ layaway });
  }));

  // POST /api/layaways/:id/payment
  router.post('/:id/payment', asyncHandler(async (req, res) => {
    const layaway = await LayawayService.makePayment(
      req.params.id,
      req.body,
      req.user?.id
    );
    res.json({ layaway });
  }));

  // POST /api/layaways/:id/cancel
  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    const result = await LayawayService.cancelLayaway(req.params.id);
    res.json(result);
  }));

  return router;
}

module.exports = { init };
