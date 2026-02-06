const express = require('express');
const LayawayService = require('../services/LayawayService');

function init({ pool }) {
  LayawayService.init({ pool });

  const router = express.Router();

  // POST /api/layaways
  router.post('/', async (req, res) => {
    try {
      const layaway = await LayawayService.createLayaway(req.body, req.user?.id);
      res.status(201).json({ layaway });
    } catch (err) {
      console.error('Create layaway error:', err);
      const status = err.message.includes('not found') || err.message.includes('Minimum deposit') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // GET /api/layaways
  router.get('/', async (req, res) => {
    try {
      const result = await LayawayService.listLayaways({
        status: req.query.status,
        customer_id: req.query.customer_id ? parseInt(req.query.customer_id) : undefined,
        location_id: req.query.location_id ? parseInt(req.query.location_id) : undefined,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
      });
      res.json(result);
    } catch (err) {
      console.error('List layaways error:', err);
      res.status(500).json({ error: 'Failed to load layaways' });
    }
  });

  // GET /api/layaways/:id
  router.get('/:id', async (req, res) => {
    try {
      const layaway = await LayawayService.getLayaway(req.params.id);
      if (!layaway) return res.status(404).json({ error: 'Layaway not found' });
      res.json({ layaway });
    } catch (err) {
      console.error('Get layaway error:', err);
      res.status(500).json({ error: 'Failed to load layaway' });
    }
  });

  // POST /api/layaways/:id/payment
  router.post('/:id/payment', async (req, res) => {
    try {
      const layaway = await LayawayService.makePayment(
        req.params.id,
        req.body,
        req.user?.id
      );
      res.json({ layaway });
    } catch (err) {
      console.error('Layaway payment error:', err);
      const status = err.message.includes('not found') || err.message.includes('not active') ? 404
        : err.message.includes('exceeds') || err.message.includes('must be') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // POST /api/layaways/:id/cancel
  router.post('/:id/cancel', async (req, res) => {
    try {
      const result = await LayawayService.cancelLayaway(req.params.id);
      res.json(result);
    } catch (err) {
      console.error('Cancel layaway error:', err);
      const status = err.message.includes('not found') || err.message.includes('not active') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { init };
