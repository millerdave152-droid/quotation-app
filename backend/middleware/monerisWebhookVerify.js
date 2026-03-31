/**
 * Moneris Webhook HMAC Verification Middleware
 * Validates webhook signatures using HMAC-SHA256.
 *
 * Supports per-location secrets via location_moneris_config table (migration 210).
 * Falls back to MONERIS_WEBHOOK_SECRET env var when no matching store_id found.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

module.exports = async function monerisWebhookVerify(req, res, next) {
  const signature = req.headers['x-moneris-signature'] || req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  // Extract store_id from webhook payload for per-location secret lookup
  const storeId = req.body?.store_id || req.body?.storeId || null;
  let secret = null;

  // 1. Try per-location secret from location_moneris_config
  if (storeId) {
    const pool = req.app?.get('pool');
    if (pool) {
      try {
        const result = await pool.query(
          'SELECT webhook_secret FROM location_moneris_config WHERE store_id = $1 AND is_active = true LIMIT 1',
          [storeId]
        );
        if (result.rows.length > 0) {
          secret = result.rows[0].webhook_secret;
        }
      } catch (err) {
        logger.warn({ err: err.message, storeId }, 'Failed to query location_moneris_config — falling back to default secret');
      }
    }
  }

  // 2. Fall back to env var if no location-specific secret found
  if (!secret) {
    secret = process.env.MONERIS_WEBHOOK_SECRET;
    if (storeId) {
      logger.warn({ storeId }, 'Webhook received for unknown store_id — using default secret');
    }
  }

  if (!secret) {
    return res.status(503).json({ error: 'Webhook verification not configured' });
  }

  // HMAC-SHA256 verification with timing-safe comparison
  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const computedBuf = Buffer.from(computed, 'hex');
    if (sigBuf.length !== computedBuf.length || !crypto.timingSafeEqual(sigBuf, computedBuf)) {
      logger.error({ storeId, path: req.path }, 'Moneris webhook HMAC verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch {
    logger.error({ storeId, path: req.path }, 'Moneris webhook HMAC verification failed');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};
