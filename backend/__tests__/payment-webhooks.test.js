/**
 * TeleTime - Payment Webhook Tests
 *
 * Follows the pattern established in moneris-service.test.js:
 *   1. Import middleware/services under test
 *   2. Mock external dependencies (req/res/next for middleware, pool for services)
 *   3. beforeEach: create fresh mocks
 *   4. afterEach: clear all mocks
 *   5. Group tests by describe() per webhook handler
 *   6. Each test: set up request data → call handler → assert response
 *
 * Covers:
 *   - Moneris webhook HMAC signature validation (middleware)
 *   - Stripe webhook signature validation (via constructEvent)
 *   - Replay attack prevention (duplicate event detection)
 *   - Event routing and processing
 */

const crypto = require('crypto');
const monerisWebhookVerify = require('../middleware/monerisWebhookVerify');

// ============================================================================
// MOCK SETUP — Express req/res/next for middleware testing
// ============================================================================

/**
 * Helper: build a mock Express response object with chainable json/status.
 */
function buildMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (data) {
      this.body = data;
      return this;
    }),
  };
  return res;
}

/**
 * Helper: compute a valid HMAC-SHA256 signature for a body using a secret.
 * Matches the algorithm in monerisWebhookVerify middleware.
 */
function computeHmac(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

// ============================================================================
// MONERIS WEBHOOK VERIFICATION MIDDLEWARE
// ============================================================================

describe('Moneris Webhook Verification', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret-32chars-long!';
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.MONERIS_WEBHOOK_SECRET;
    process.env.MONERIS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env.MONERIS_WEBHOOK_SECRET = originalEnv;
    jest.clearAllMocks();
  });

  it('should call next() for a valid signature', () => {
    const body = { event: 'payment.completed', order_id: 'ORD-123', amount: '129.99' };
    const signature = computeHmac(body, WEBHOOK_SECRET);

    const req = { body, headers: { 'x-moneris-signature': signature } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject when signature header is missing', () => {
    const req = { body: { order_id: 'ORD-123' }, headers: {} };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toBe('Missing webhook signature');
  });

  it('should reject an invalid/tampered signature', () => {
    const body = { order_id: 'ORD-123', amount: '129.99' };
    const badSignature = 'deadbeef'.repeat(8); // 64 hex chars, wrong value

    const req = { body, headers: { 'x-moneris-signature': badSignature } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toBe('Invalid webhook signature');
  });

  it('should reject when body is tampered after signing', () => {
    const originalBody = { order_id: 'ORD-123', amount: '129.99' };
    const signature = computeHmac(originalBody, WEBHOOK_SECRET);

    // Attacker modifies amount
    const tamperedBody = { order_id: 'ORD-123', amount: '0.01' };

    const req = { body: tamperedBody, headers: { 'x-moneris-signature': signature } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject malformed signature (non-hex)', () => {
    const body = { order_id: 'ORD-123' };

    const req = { body, headers: { 'x-moneris-signature': 'not-valid-hex!!' } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 503 when webhook secret is not configured', () => {
    process.env.MONERIS_WEBHOOK_SECRET = '';

    const req = { body: {}, headers: { 'x-moneris-signature': 'abc123' } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body.error).toBe('Webhook verification not configured');
  });

  it('should accept x-webhook-signature as alternate header', () => {
    const body = { event: 'refund.completed' };
    const signature = computeHmac(body, WEBHOOK_SECRET);

    const req = { body, headers: { 'x-webhook-signature': signature } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should use timing-safe comparison (prevents timing attacks)', () => {
    // Verify the middleware uses crypto.timingSafeEqual.
    // We can't directly test timing, but we verify that a signature
    // with correct length but wrong value is still rejected properly.
    const body = { order_id: 'ORD-123' };
    const correctSig = computeHmac(body, WEBHOOK_SECRET);

    // Build a sig with same length but different content
    const wrongSig = correctSig.replace(/./g, (c, i) =>
      i === 0 ? (c === 'a' ? 'b' : 'a') : c
    );

    const req = { body, headers: { 'x-moneris-signature': wrongSig } };
    const res = buildMockRes();
    const next = jest.fn();

    monerisWebhookVerify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ============================================================================
// STRIPE WEBHOOK HANDLING (via StripeService.handleWebhook)
// ============================================================================

jest.mock('stripe');
const Stripe = require('stripe');
const StripeService = require('../services/StripeService');

describe('Stripe Webhook Handling', () => {
  let service;
  let mockPool;
  let mockStripe;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    mockStripe = {
      paymentIntents: { create: jest.fn() },
      customers: { create: jest.fn() },
      checkout: { sessions: { create: jest.fn() } },
      webhooks: { constructEvent: jest.fn() },
      refunds: { create: jest.fn() },
    };

    Stripe.mockReturnValue(mockStripe);

    service = new StripeService(mockPool, null, {
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test_secret',
    });
    service.stripe = mockStripe;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Signature Validation
  // --------------------------------------------------------------------------

  describe('signature validation', () => {
    it('should verify valid Stripe signature via constructEvent', async () => {
      const fakeEvent = {
        id: 'evt_valid_001',
        type: 'payment_intent.succeeded',
        api_version: '2024-12-18.acacia',
        data: { object: { id: 'pi_123', metadata: {} } },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.handleWebhook('raw_body', 'valid_stripe_sig');

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw_body',
        'valid_stripe_sig',
        'whsec_test_secret'
      );
    });

    it('should reject invalid Stripe signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      await expect(service.handleWebhook('tampered_body', 'bad_sig'))
        .rejects.toThrow('Webhook signature verification failed');
    });

    it('should reject expired Stripe signature (tolerance exceeded)', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Timestamp outside the tolerance zone');
      });

      await expect(service.handleWebhook('old_body', 'expired_sig'))
        .rejects.toThrow('Webhook signature verification failed');
    });
  });

  // --------------------------------------------------------------------------
  // Replay Attack Prevention
  // --------------------------------------------------------------------------

  describe('replay attack prevention', () => {
    it('should skip processing for duplicate event IDs', async () => {
      const fakeEvent = {
        id: 'evt_replay_001',
        type: 'payment_intent.succeeded',
        api_version: '2024-12-18.acacia',
        data: { object: {} },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      // Event already in stripe_webhook_events table
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('already_processed');
      expect(result.eventId).toBe('evt_replay_001');
      // Should NOT insert or process
      expect(mockPool.query).toHaveBeenCalledTimes(1); // only the SELECT check
    });

    it('should store event ID to prevent future replays', async () => {
      const fakeEvent = {
        id: 'evt_new_001',
        type: 'payment_intent.succeeded',
        api_version: '2024-12-18.acacia',
        data: { object: { id: 'pi_123', metadata: {} } },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.handleWebhook('payload', 'sig');

      // Verify INSERT into stripe_webhook_events was called
      const insertCall = mockPool.query.mock.calls[1]; // [0] = SELECT, [1] = INSERT
      expect(insertCall[0]).toContain('INSERT INTO stripe_webhook_events');
      expect(insertCall[1]).toContain('evt_new_001');
    });
  });

  // --------------------------------------------------------------------------
  // Event Routing
  // --------------------------------------------------------------------------

  describe('event routing', () => {
    function setupEvent(type, dataObj = {}) {
      const fakeEvent = {
        id: `evt_${type.replace(/\./g, '_')}_001`,
        type,
        api_version: '2024-12-18.acacia',
        data: { object: dataObj },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);
      mockPool.query.mockResolvedValue({ rows: [] });
      return fakeEvent;
    }

    it('should route checkout.session.completed events', async () => {
      setupEvent('checkout.session.completed', {
        metadata: { invoice_id: '10', quotation_id: '1' },
      });
      service.handleCheckoutCompleted = jest.fn().mockResolvedValue({ updated: true });

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('processed');
      expect(service.handleCheckoutCompleted).toHaveBeenCalledTimes(1);
    });

    it('should route payment_intent.succeeded events', async () => {
      setupEvent('payment_intent.succeeded', {
        id: 'pi_123',
        metadata: { invoice_id: '5' },
      });
      service.handlePaymentSucceeded = jest.fn().mockResolvedValue({ updated: true });

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('processed');
      expect(service.handlePaymentSucceeded).toHaveBeenCalledTimes(1);
    });

    it('should route payment_intent.payment_failed events', async () => {
      setupEvent('payment_intent.payment_failed', {
        id: 'pi_456',
        last_payment_error: { message: 'Card declined' },
      });
      service.handlePaymentFailed = jest.fn().mockResolvedValue({ recorded: true });

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('processed');
      expect(service.handlePaymentFailed).toHaveBeenCalledTimes(1);
    });

    it('should route charge.refunded events', async () => {
      setupEvent('charge.refunded', {
        id: 'ch_789',
        amount_refunded: 5000,
      });
      service.handleRefund = jest.fn().mockResolvedValue({ refunded: true });

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('processed');
      expect(service.handleRefund).toHaveBeenCalledTimes(1);
    });

    it('should ignore unhandled event types gracefully', async () => {
      setupEvent('customer.subscription.deleted', {});

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('ignored');
      expect(result.reason).toContain('customer.subscription.deleted');
    });

    it('should mark event as processed in DB after success', async () => {
      setupEvent('payment_intent.succeeded', { id: 'pi_ok', metadata: {} });
      service.handlePaymentSucceeded = jest.fn().mockResolvedValue({});

      await service.handleWebhook('payload', 'sig');

      // Find the UPDATE ... SET processed = true call
      const updateCall = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('processed = true')
      );
      expect(updateCall).toBeDefined();
    });

    it('should record error in DB when handler throws', async () => {
      setupEvent('checkout.session.completed', { metadata: {} });
      service.handleCheckoutCompleted = jest.fn().mockRejectedValue(
        new Error('Invoice update failed')
      );

      const result = await service.handleWebhook('payload', 'sig');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Invoice update failed');

      // Verify error was recorded in DB
      const errorCall = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('error_message')
      );
      expect(errorCall).toBeDefined();
    });
  });
});
