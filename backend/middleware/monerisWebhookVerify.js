/**
 * Moneris Webhook HMAC Verification Middleware
 * Validates webhook signatures using HMAC-SHA256.
 * Skips verification if MONERIS_WEBHOOK_SECRET is not configured.
 */

const crypto = require('crypto');

module.exports = function monerisWebhookVerify(req, res, next) {
  const secret = process.env.MONERIS_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Webhook verification not configured' });
  }

  const signature = req.headers['x-moneris-signature'] || req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const computedBuf = Buffer.from(computed, 'hex');
    if (sigBuf.length !== computedBuf.length || !crypto.timingSafeEqual(sigBuf, computedBuf)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};
