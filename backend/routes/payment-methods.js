/**
 * Payment Methods Routes
 *
 * Manages saved customer payment methods (Moneris Vault tokens).
 * All endpoints scoped under /api/customers/:customerId/payment-methods
 *
 * SECURITY:
 *   - moneris_token is NEVER returned in any response
 *   - All operations audit-logged via MonerisVaultService
 *   - Requires authentication
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams for :customerId
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

let vaultService = null;
let pool = null;

/**
 * Initialize with dependencies
 * @param {object} deps
 * @param {Pool} deps.pool
 * @param {MonerisVaultService} deps.vaultService
 */
const init = (deps) => {
  pool = deps.pool;
  vaultService = deps.vaultService;
  return router;
};

// ============================================================================
// Middleware: validate customer exists
// ============================================================================
router.use(authenticate, asyncHandler(async (req, res, next) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) {
    throw new ApiError('Invalid customer ID', 400);
  }

  const { rows } = await pool.query(
    'SELECT id, contact_name, company_name FROM customers WHERE id = $1',
    [customerId]
  );
  if (rows.length === 0) {
    throw new ApiError('Customer not found', 404);
  }

  req.customer = rows[0];
  req.customerId = customerId;
  next();
}));

// ============================================================================
// GET /api/customers/:customerId/payment-methods
// List all active saved payment methods for a customer
// ============================================================================
router.get('/', asyncHandler(async (req, res) => {
  const tokens = await vaultService.getCustomerTokens(req.customerId);

  res.json({
    success: true,
    data: tokens,
    count: tokens.length,
  });
}));

// ============================================================================
// GET /api/customers/:customerId/payment-methods/:tokenId
// Get a single saved payment method
// ============================================================================
router.get('/:tokenId', asyncHandler(async (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) throw new ApiError('Invalid token ID', 400);

  const token = await vaultService.getToken(req.customerId, tokenId);
  if (!token) {
    throw new ApiError('Payment method not found', 404);
  }

  res.json({ success: true, data: token });
}));

// ============================================================================
// POST /api/customers/:customerId/payment-methods
// Save a new payment method (tokenize card via Moneris Vault)
// ============================================================================
router.post('/', asyncHandler(async (req, res) => {
  const {
    cardNumber, expDate, cardBin, lastFour,
    cardType, cardBrand, cryptType,
    nickname, isDefault,
    // For importing an existing data_key (from Moneris Checkout callback)
    dataKey,
  } = req.body;

  let result;

  if (dataKey) {
    // Import an existing Moneris Vault token
    result = await vaultService.storeExistingToken(
      {
        data_key: dataKey,
        last_four: lastFour,
        card_bin: cardBin,
        card_type: cardType,
        card_brand: cardBrand,
        expiry_date: expDate,
      },
      req.customerId,
      { nickname, isDefault, createdBy: req.user.id }
    );
  } else if (cardNumber && expDate) {
    // Tokenize a new card via Moneris Vault
    result = await vaultService.storeCardToken(
      { cardNumber, expDate, cardBin, lastFour, cardType, cardBrand, cryptType },
      req.customerId,
      { nickname, isDefault, createdBy: req.user.id }
    );
  } else {
    throw new ApiError('Either cardNumber + expDate or dataKey is required', 400);
  }

  res.status(201).json({ success: true, data: result });
}));

// ============================================================================
// PUT /api/customers/:customerId/payment-methods/:tokenId
// Update a saved payment method (nickname, default)
// ============================================================================
router.put('/:tokenId', asyncHandler(async (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) throw new ApiError('Invalid token ID', 400);

  const { nickname, isDefault } = req.body;

  if (typeof isDefault === 'boolean' && isDefault) {
    await vaultService.setDefault(req.customerId, tokenId);
  }

  if (nickname && typeof nickname === 'string') {
    await vaultService.updateNickname(req.customerId, tokenId, nickname.trim());
  }

  const updated = await vaultService.getToken(req.customerId, tokenId);
  res.json({ success: true, data: updated });
}));

// ============================================================================
// DELETE /api/customers/:customerId/payment-methods/:tokenId
// Remove a saved payment method (deletes from Moneris Vault + soft-delete local)
// ============================================================================
router.delete('/:tokenId', asyncHandler(async (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) throw new ApiError('Invalid token ID', 400);

  const result = await vaultService.deleteToken(req.customerId, tokenId, req.user.id);

  res.json({
    success: true,
    message: 'Payment method removed',
    vaultDeleted: result.vaultDeleted,
  });
}));

// ============================================================================
// POST /api/customers/:customerId/payment-methods/:tokenId/charge
// Charge a saved payment method
// ============================================================================
router.post('/:tokenId/charge', asyncHandler(async (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) throw new ApiError('Invalid token ID', 400);

  const { amountCents, orderId, description } = req.body;

  if (!amountCents || typeof amountCents !== 'number' || amountCents <= 0) {
    throw new ApiError('amountCents is required and must be a positive integer', 400);
  }

  if (amountCents > 999999) { // $9,999.99 safety cap
    throw new ApiError('Amount exceeds maximum allowed for token transactions', 400);
  }

  const result = await vaultService.processTokenTransaction(
    req.customerId,
    tokenId,
    amountCents,
    {
      orderId,
      employeeId: req.user.id,
      description,
    }
  );

  res.json({ success: true, data: result });
}));

// ============================================================================
// POST /api/customers/:customerId/payment-methods/:tokenId/preauth
// Pre-authorize using a saved payment method
// ============================================================================
router.post('/:tokenId/preauth', asyncHandler(async (req, res) => {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) throw new ApiError('Invalid token ID', 400);

  const { amountCents, orderId } = req.body;

  if (!amountCents || typeof amountCents !== 'number' || amountCents <= 0) {
    throw new ApiError('amountCents is required and must be a positive integer', 400);
  }

  const result = await vaultService.preauthTokenTransaction(
    req.customerId,
    tokenId,
    amountCents,
    {
      orderId,
      employeeId: req.user.id,
    }
  );

  res.json({ success: true, data: result });
}));

module.exports = { router, init };
