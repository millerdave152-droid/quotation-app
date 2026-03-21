/**
 * TeleTime - StripeService Tests
 *
 * Follows the pattern established in moneris-service.test.js:
 *   1. Import the service under test
 *   2. Mock external dependencies (pool, cache, Stripe SDK)
 *   3. beforeEach: create fresh mocks + service instance
 *   4. afterEach: clear all mocks
 *   5. Group tests by describe() per method
 *   6. Each test: set up mock responses → call method → assert results
 *
 * Key difference from Moneris: Stripe uses a JS SDK instead of raw XML/HTTPS,
 * so we mock the Stripe class methods directly rather than https.request.
 */

jest.mock('stripe');
const Stripe = require('stripe');

const StripeService = require('../services/StripeService');

// ============================================================================
// MOCK SETUP — fake Stripe SDK instance
// ============================================================================

/**
 * Build a mock Stripe SDK with chainable method stubs.
 * Each Stripe resource (paymentIntents, customers, etc.) gets its own jest.fn().
 */
function buildMockStripe() {
  return {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    customers: {
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('StripeService', () => {
  let service;
  let mockPool;
  let mockCache;
  let mockStripe;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn(),
      }),
    };

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      invalidatePattern: jest.fn(),
    };

    // Create mock Stripe instance and configure the constructor mock
    mockStripe = buildMockStripe();
    Stripe.mockReturnValue(mockStripe);

    service = new StripeService(mockPool, mockCache, {
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test_fake',
      currency: 'cad',
    });

    // Inject the mock stripe instance directly
    service.stripe = mockStripe;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('isConfigured', () => {
    it('should return true when Stripe SDK is initialized', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      const unconfigured = new StripeService(mockPool, mockCache, {});
      expect(unconfigured.isConfigured()).toBe(false);
    });
  });

  // ============================================================================
  // PAYMENT INTENT CREATION
  // ============================================================================

  describe('createPaymentIntent', () => {
    it('should create a successful payment intent', async () => {
      // Arrange
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_test_123',
        amount: 25000,
        currency: 'cad',
        status: 'requires_payment_method',
        client_secret: 'pi_test_123_secret_abc',
      });

      // Act
      const result = await service.createPaymentIntent(25000, {
        customer_id: 42,
      });

      // Assert
      expect(result.id).toBe('pi_test_123');
      expect(result.amount).toBe(25000);
      expect(result.currency).toBe('cad');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 25000,
        currency: 'cad',
        metadata: { customer_id: 42 },
        automatic_payment_methods: { enabled: true },
      });
    });

    it('should throw when Stripe is not configured', async () => {
      const unconfigured = new StripeService(mockPool, mockCache, {});
      await expect(unconfigured.createPaymentIntent(10000))
        .rejects.toThrow('Stripe is not configured');
    });

    it('should handle Stripe API errors (declined card)', async () => {
      // Arrange: Stripe SDK throws for card_declined
      mockStripe.paymentIntents.create.mockRejectedValue(
        Object.assign(new Error('Your card was declined.'), {
          type: 'StripeCardError',
          code: 'card_declined',
        })
      );

      // Act & Assert
      await expect(service.createPaymentIntent(50000))
        .rejects.toThrow('Your card was declined.');
    });

    it('should handle Stripe rate limit errors', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          type: 'StripeRateLimitError',
        })
      );

      await expect(service.createPaymentIntent(10000))
        .rejects.toThrow('Rate limit exceeded');
    });

    it('should handle Stripe network errors (timeout)', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(
        Object.assign(new Error('Request timed out'), {
          type: 'StripeConnectionError',
        })
      );

      await expect(service.createPaymentIntent(10000))
        .rejects.toThrow('Request timed out');
    });
  });

  // ============================================================================
  // CHECKOUT SESSION
  // ============================================================================

  describe('createCheckoutSession', () => {
    it('should create a checkout session for a valid invoice', async () => {
      // Arrange: invoice lookup returns a valid unpaid invoice
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            customer_id: 5,
            status: 'sent',
            total_cents: 50000,
            tax_cents: 6500,
            email: 'customer@test.com',
            contact_name: 'John Doe',
            stripe_customer_id: 'cus_existing',
            quotation_id: 1,
            order_id: 2,
          }],
        })
        // invoice items
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            description: 'Samsung TV',
            unit_price_cents: 50000,
            quantity: 1,
          }],
        })
        // update invoice with session ID
        .mockResolvedValueOnce({ rows: [] });

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_session',
        url: 'https://checkout.stripe.com/session/cs_test_session',
      });

      // Act
      const result = await service.createCheckoutSession(10, {
        successUrl: 'https://app.test.com/success',
        cancelUrl: 'https://app.test.com/cancel',
      });

      // Assert
      expect(result.id).toBe('cs_test_session');
      expect(result.url).toContain('checkout.stripe.com');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it('should throw for non-existent invoice', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.createCheckoutSession(999))
        .rejects.toThrow('Invoice 999 not found');
    });

    it('should throw for already paid invoice', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 10, status: 'paid' }],
      });

      await expect(service.createCheckoutSession(10))
        .rejects.toThrow('Invoice is already paid');
    });

    it('should throw for voided invoice', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 10, status: 'void' }],
      });

      await expect(service.createCheckoutSession(10))
        .rejects.toThrow('Cannot pay voided invoice');
    });

    it('should create Stripe customer if none exists', async () => {
      // Arrange: invoice with no stripe_customer_id but has email
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            customer_id: 5,
            status: 'sent',
            total_cents: 50000,
            tax_cents: 0,
            email: 'new@customer.com',
            contact_name: 'Jane',
            stripe_customer_id: null,
            quotation_id: null,
            order_id: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // invoice items
        .mockResolvedValueOnce({ rows: [] }) // update customer
        .mockResolvedValueOnce({ rows: [] }); // update invoice

      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new_123' });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test',
        url: 'https://checkout.stripe.com/cs_test',
      });

      // Act
      await service.createCheckoutSession(10, {
        successUrl: 'https://test.com/ok',
        cancelUrl: 'https://test.com/cancel',
      });

      // Assert: customer was created in Stripe
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'new@customer.com',
        name: 'Jane',
        metadata: { customer_id: 5 },
      });
    });
  });

  // ============================================================================
  // PAYMENT LINK GENERATION
  // ============================================================================

  describe('generatePaymentLink', () => {
    it('should generate a payment link with deposit', async () => {
      // Arrange
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            total_cents: 100000,
            balance_due_cents: 100000,
            email: 'test@test.com',
            contact_name: 'Test',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE quotations

      // Act
      const result = await service.generatePaymentLink(1, {
        depositPercent: 25,
        expiresInDays: 7,
      });

      // Assert
      expect(result.amountCents).toBe(25000); // 25% of 100000
      expect(result.depositRequired).toBe(25000);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBe(64); // 32 bytes hex
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent quotation', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.generatePaymentLink(999))
        .rejects.toThrow('Quotation 999 not found');
    });
  });

  // ============================================================================
  // WEBHOOK HANDLING
  // ============================================================================

  describe('handleWebhook', () => {
    it('should process a valid webhook event', async () => {
      // Arrange: constructEvent succeeds
      const fakeEvent = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        api_version: '2024-12-18.acacia',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 50000,
            metadata: { invoice_id: '10', quotation_id: '1' },
          },
        },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      // No duplicate event
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT existing event
        .mockResolvedValueOnce({ rows: [] }) // INSERT event
        .mockResolvedValueOnce({ rows: [] }) // payment processing
        .mockResolvedValueOnce({ rows: [] }); // UPDATE event as processed

      // Act
      const result = await service.handleWebhook('raw_payload', 'stripe_sig_header');

      // Assert
      expect(result.status).toBe('processed');
      expect(result.eventId).toBe('evt_test_123');
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw_payload',
        'stripe_sig_header',
        'whsec_test_fake'
      );
    });

    it('should reject invalid webhook signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(service.handleWebhook('tampered', 'bad_sig'))
        .rejects.toThrow('Webhook signature verification failed');
    });

    it('should skip already-processed events (replay prevention)', async () => {
      const fakeEvent = {
        id: 'evt_duplicate_456',
        type: 'payment_intent.succeeded',
        api_version: '2024-12-18.acacia',
        data: { object: {} },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      // Event already exists in DB
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      // Act
      const result = await service.handleWebhook('payload', 'sig');

      // Assert
      expect(result.status).toBe('already_processed');
      expect(result.eventId).toBe('evt_duplicate_456');
    });

    it('should ignore unhandled event types', async () => {
      const fakeEvent = {
        id: 'evt_unknown_789',
        type: 'customer.created',
        api_version: '2024-12-18.acacia',
        data: { object: {} },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await service.handleWebhook('payload', 'sig');

      // Assert
      expect(result.status).toBe('ignored');
      expect(result.reason).toContain('customer.created');
    });

    it('should handle processing errors without throwing', async () => {
      const fakeEvent = {
        id: 'evt_error_101',
        type: 'checkout.session.completed',
        api_version: '2024-12-18.acacia',
        data: { object: { metadata: {} } },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(fakeEvent);

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no duplicate
        .mockResolvedValueOnce({ rows: [] }) // insert event
        .mockRejectedValueOnce(new Error('DB insert failed')) // handler fails
        .mockResolvedValueOnce({ rows: [] }); // update with error

      // Act — should NOT throw
      const result = await service.handleWebhook('payload', 'sig');

      // Assert
      expect(result.status).toBe('error');
      expect(result.error).toBe('DB insert failed');
    });
  });

  // ============================================================================
  // PAYMENT LINK PROCESSING
  // ============================================================================

  describe('processPaymentLink', () => {
    it('should throw for invalid token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.processPaymentLink('bad_token', {}))
        .rejects.toThrow('Invalid payment link');
    });

    it('should throw for expired link', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          payment_link_expires_at: '2020-01-01T00:00:00Z',
          total_cents: 10000,
        }],
      });

      await expect(service.processPaymentLink('expired_token', {}))
        .rejects.toThrow('Payment link has expired');
    });
  });
});
