/**
 * TeleTime - Gift Card Routes
 * Purchase, public balance check, reload, expiring alerts, and reminder emails.
 */

const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const GiftCardService = require('../services/GiftCardService');

let giftCardService = null;

const router = express.Router();

// ============================================================================
// PUBLIC ENDPOINT — No auth required
// ============================================================================

/**
 * POST /api/gift-cards/:code/check-balance
 * Public balance check — rate limited at the middleware level.
 */
router.post('/:code/check-balance', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const data = await giftCardService.checkBalance(code);
  res.json({ success: true, data });
}));

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

router.use(authenticate);

/**
 * POST /api/gift-cards/purchase
 * Purchase a new gift card.
 * Body: { amountCents, recipientName?, recipientEmail?, purchaserCustomerId?,
 *         customerId?, giftMessage?, deliveryMethod?, sendDate?, expiryDate? }
 */
router.post('/purchase', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    amountCents: Joi.number().integer().min(100).required(),
    recipientName: Joi.string().max(255).optional().allow('', null),
    recipientEmail: Joi.string().email().optional().allow('', null),
    purchaserCustomerId: Joi.number().integer().optional(),
    customerId: Joi.number().integer().optional(),
    giftMessage: Joi.string().max(500).optional().allow('', null),
    deliveryMethod: Joi.string().valid('email', 'print', 'physical').default('email'),
    sendDate: Joi.date().iso().optional(),
    expiryDate: Joi.date().iso().optional(),
  });

  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) throw ApiError.badRequest(error.details[0].message);

  const data = await giftCardService.purchase(value, req.user.id);
  res.status(201).json({ success: true, data });
}));

/**
 * POST /api/gift-cards/:code/reload
 * Reload a gift card with additional funds.
 * Body: { amountCents }
 */
router.post('/:code/reload', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { error, value } = Joi.object({
    amountCents: Joi.number().integer().min(100).required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const data = await giftCardService.reload(code, value.amountCents, req.user.id);
  res.json({ success: true, data });
}));

/**
 * GET /api/gift-cards/expiring
 * Get gift cards expiring within N days. Manager/Admin only.
 * Query: ?days=30
 */
router.get('/expiring', requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days) : 30;
  if (isNaN(days) || days < 1) throw ApiError.badRequest('days must be a positive integer');

  const data = await giftCardService.getExpiring(days);
  res.json({ success: true, data, count: data.length });
}));

/**
 * POST /api/gift-cards/send-reminder
 * Send a balance reminder email for a gift card.
 * Body: { code }
 */
router.post('/send-reminder', asyncHandler(async (req, res) => {
  const { error, value } = Joi.object({
    code: Joi.string().required(),
  }).validate(req.body, { stripUnknown: true });

  if (error) throw ApiError.badRequest(error.details[0].message);

  const data = await giftCardService.sendReminder(value.code, req.user.id);
  res.json({ success: true, data });
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  giftCardService = new GiftCardService(deps.pool, {
    emailService: deps.emailService || null,
  });
  return router;
};

module.exports = { init };
