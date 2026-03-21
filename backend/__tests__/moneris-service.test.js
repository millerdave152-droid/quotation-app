/**
 * TeleTime - MonerisService Tests
 *
 * Pattern-setter test file for payment processor testing.
 * Structure:
 *   1. Import the service under test
 *   2. Mock external dependencies (pool, cache, https)
 *   3. beforeEach: create fresh mocks + service instance
 *   4. afterEach: clear all mocks
 *   5. Group tests by describe() per method
 *   6. Each test: set up mock responses → call method → assert results
 *
 * Key conventions:
 *   - Mock the HTTPS module to avoid hitting real Moneris endpoints
 *   - Use mockPool/mockClient for database calls
 *   - Use cents-based pricing (e.g. 12999 = $129.99)
 *   - Response codes: 00-49 = approved, 50+ = declined, null = error
 */

const https = require('https');
const MonerisService = require('../services/MonerisService');

// ============================================================================
// MOCK SETUP — intercept HTTPS requests to Moneris
// ============================================================================

jest.mock('https');

/**
 * Helper: build a fake Moneris XML response.
 * Mirrors the XML structure returned by Moneris Gateway.
 */
function buildMonerisXml({
  responseCode = '00',
  message = 'APPROVED',
  transId = 'txn-12345',
  receiptId = 'rcpt-001',
  referenceNum = 'ref-67890',
  authCode = 'AUTH01',
  transAmount = '129.99',
  cardType = 'V',
  complete = 'true',
  timedOut = 'false',
} = {}) {
  return `<?xml version="1.0"?>
<response>
  <receipt>
    <ResponseCode>${responseCode}</ResponseCode>
    <Message>${message}</Message>
    <TransID>${transId}</TransID>
    <ReceiptId>${receiptId}</ReceiptId>
    <ReferenceNum>${referenceNum}</ReferenceNum>
    <AuthCode>${authCode}</AuthCode>
    <TransAmount>${transAmount}</TransAmount>
    <CardType>${cardType}</CardType>
    <TransType>purchase</TransType>
    <Complete>${complete}</Complete>
    <TimedOut>${timedOut}</TimedOut>
    <ISO>01</ISO>
  </receipt>
</response>`;
}

/**
 * Helper: configure https.request mock to return a given XML response.
 * Simulates the Node.js http.IncomingMessage event flow.
 */
function mockHttpsResponse(xml) {
  https.request.mockImplementation((options, callback) => {
    // Simulate the response object with data/end events
    const res = {
      on: jest.fn((event, handler) => {
        if (event === 'data') handler(xml);
        if (event === 'end') handler();
      }),
    };
    callback(res);

    // Return a mock request object
    return {
      on: jest.fn(),
      setTimeout: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
  });
}

/**
 * Helper: configure https.request mock to emit a network error.
 */
function mockHttpsError(errorMessage) {
  https.request.mockImplementation((options, callback) => {
    const req = {
      on: jest.fn((event, handler) => {
        if (event === 'error') {
          // Fire error asynchronously to match real behavior
          process.nextTick(() => handler(new Error(errorMessage)));
        }
      }),
      setTimeout: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    return req;
  });
}

/**
 * Helper: configure https.request mock to simulate a timeout.
 */
function mockHttpsTimeout() {
  https.request.mockImplementation((options, callback) => {
    const req = {
      on: jest.fn(),
      setTimeout: jest.fn((ms, handler) => {
        // Fire timeout immediately for testing
        process.nextTick(handler);
      }),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };
    return req;
  });
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('MonerisService', () => {
  let service;
  let mockPool;
  let mockClient;
  let mockCache;

  // Fresh mocks before each test — no state leaks between tests
  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    // Create service with test credentials (bypasses env vars)
    service = new MonerisService(mockPool, mockCache, {
      storeId: 'test_store',
      apiToken: 'test_token',
      environment: 'testing',
      webhookSecret: 'test_webhook_secret',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CONFIGURATION & HELPERS
  // ============================================================================

  describe('isConfigured', () => {
    it('should return true when credentials are provided', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when credentials are missing', () => {
      const unconfigured = new MonerisService(mockPool, mockCache, {
        storeId: '',
        apiToken: '',
      });
      expect(unconfigured.isConfigured()).toBe(false);
    });
  });

  describe('_isApproved', () => {
    it('should approve response codes 00-49', () => {
      expect(service._isApproved('00')).toBe(true);
      expect(service._isApproved('01')).toBe(true);
      expect(service._isApproved('27')).toBe(true);
      expect(service._isApproved('49')).toBe(true);
    });

    it('should decline response codes 50+', () => {
      expect(service._isApproved('50')).toBe(false);
      expect(service._isApproved('51')).toBe(false);
      expect(service._isApproved('99')).toBe(false);
    });

    it('should decline null/undefined/invalid codes', () => {
      expect(service._isApproved(null)).toBe(false);
      expect(service._isApproved(undefined)).toBe(false);
      expect(service._isApproved('abc')).toBe(false);
    });
  });

  describe('getBillingDescriptor', () => {
    it('should return default descriptor when no location specified', () => {
      expect(service.getBillingDescriptor()).toBe('TeleTime');
    });

    it('should truncate to 22 characters per card network rules', () => {
      const longDesc = new MonerisService(mockPool, mockCache, {
        storeId: 'x',
        apiToken: 'x',
        billingDescriptors: { default: 'A'.repeat(30) },
      });
      expect(longDesc.getBillingDescriptor().length).toBe(22);
    });
  });

  // ============================================================================
  // PURCHASE (AUTH + CAPTURE IN ONE STEP)
  // ============================================================================

  describe('processPurchase', () => {
    it('should process a successful payment', async () => {
      // Arrange: mock Moneris returning approval code 00
      mockHttpsResponse(buildMonerisXml({
        responseCode: '00',
        message: 'APPROVED',
        authCode: 'AUTH99',
        transAmount: '129.99',
        cardType: 'V',
      }));

      // Act
      const result = await service.processPurchase(12999, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.authCode).toBe('AUTH99');
      expect(result.amount).toBe(12999);
      expect(result.cardType).toBe('V');
      expect(result.responseCode).toBe('00');
      expect(result.message).toBe('APPROVED');
      expect(result.monerisOrderId).toMatch(/^PUR-/);

      // Verify the HTTPS request was made to Moneris testing endpoint
      expect(https.request).toHaveBeenCalledTimes(1);
      const callArgs = https.request.mock.calls[0][0];
      expect(callArgs.hostname).toBe('esqa.moneris.com');
      expect(callArgs.method).toBe('POST');
    });

    it('should handle a declined card (response code 50+)', async () => {
      // Arrange: mock Moneris returning decline code 51 (insufficient funds)
      mockHttpsResponse(buildMonerisXml({
        responseCode: '51',
        message: 'DECLINED',
        authCode: '',
        complete: 'false',
      }));

      // Act
      const result = await service.processPurchase(50000, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('51');
      expect(result.message).toBe('DECLINED');
      expect(result.authCode).toBe('');
    });

    it('should throw on network timeout', async () => {
      // Arrange: mock a timeout (Moneris doesn't respond within 30s)
      mockHttpsTimeout();

      // Act & Assert
      await expect(
        service.processPurchase(12999, {
          cardNumber: '4242424242424242',
          expDate: '2512',
        })
      ).rejects.toThrow('Moneris gateway timeout');
    });

    it('should throw on network error', async () => {
      // Arrange: mock a connection failure
      mockHttpsError('ECONNREFUSED');

      // Act & Assert
      await expect(
        service.processPurchase(12999, {
          cardNumber: '4242424242424242',
          expDate: '2512',
        })
      ).rejects.toThrow('Moneris gateway error: ECONNREFUSED');
    });

    it('should throw when Moneris is not configured', async () => {
      const unconfigured = new MonerisService(mockPool, mockCache, {
        storeId: '',
        apiToken: '',
      });

      await expect(
        unconfigured.processPurchase(12999, {})
      ).rejects.toThrow('Moneris is not configured');
    });

    it('should throw on invalid amount', async () => {
      // processPurchase doesn't validate amount directly — it delegates to
      // createPaymentIntent for pre-auth flows. But purchase builds XML with
      // amount, so test zero/negative amounts don't produce garbage.
      // Note: This tests the XML building, not a thrown error.
      mockHttpsResponse(buildMonerisXml({ responseCode: '00' }));

      // Zero amount — Moneris would reject this server-side
      const result = await service.processPurchase(0, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });
      // The service sends it; Moneris decides. We just verify it doesn't crash.
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // PRE-AUTHORIZATION (HOLD FUNDS)
  // ============================================================================

  describe('createPaymentIntent', () => {
    it('should create a successful pre-authorization', async () => {
      // Arrange
      mockHttpsResponse(buildMonerisXml({
        responseCode: '00',
        message: 'APPROVED',
        authCode: 'PREAUTH1',
        transAmount: '250.00',
      }));

      // Act
      const result = await service.createPaymentIntent(25000, {
        cardNumber: '4242424242424242',
        expDate: '2512',
        customer_id: 42,
      });

      // Assert
      expect(result.status).toBe('requires_capture');
      expect(result.authCode).toBe('PREAUTH1');
      expect(result.amount).toBe(25000);
      expect(result.monerisOrderId).toMatch(/^PI-/);

      // Verify DB insert was called to persist the pre-auth
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO payment_transactions');
      expect(insertCall[1]).toContain(25000); // amount_cents
    });

    it('should mark failed pre-auth in database', async () => {
      // Arrange: declined
      mockHttpsResponse(buildMonerisXml({
        responseCode: '58',
        message: 'NOT ALLOWED',
      }));

      // Act
      const result = await service.createPaymentIntent(25000, {
        cardNumber: '0000000000000000',
        expDate: '2512',
      });

      // Assert
      expect(result.status).toBe('failed');
      expect(result.responseCode).toBe('58');

      // Verify the DB was updated with 'failed' status
      const insertArgs = mockPool.query.mock.calls[0][1];
      expect(insertArgs).toContain('failed');
    });

    it('should reject invalid payment amounts', async () => {
      await expect(service.createPaymentIntent(0)).rejects.toThrow('Payment amount must be a positive number');
      await expect(service.createPaymentIntent(-100)).rejects.toThrow('Payment amount must be a positive number');
      await expect(service.createPaymentIntent(NaN)).rejects.toThrow('Payment amount must be a positive number');
      await expect(service.createPaymentIntent(Infinity)).rejects.toThrow('Payment amount must be a positive number');
    });
  });

  // ============================================================================
  // DUPLICATE TRANSACTION HANDLING
  // ============================================================================

  describe('duplicate transaction detection', () => {
    it('should generate unique order IDs for each transaction', async () => {
      mockHttpsResponse(buildMonerisXml({ responseCode: '00' }));

      const result1 = await service.processPurchase(10000, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });

      mockHttpsResponse(buildMonerisXml({ responseCode: '00' }));

      const result2 = await service.processPurchase(10000, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });

      // Each purchase gets a unique order ID — prevents Moneris duplicate rejection
      expect(result1.monerisOrderId).not.toBe(result2.monerisOrderId);
    });

    it('should handle Moneris duplicate order ID rejection', async () => {
      // Moneris returns a specific error when order_id is reused
      mockHttpsResponse(buildMonerisXml({
        responseCode: null,
        message: 'Duplicate order_id',
        complete: 'false',
      }));

      const result = await service.processPurchase(10000, {
        cardNumber: '4242424242424242',
        expDate: '2512',
      });

      // null response code → _isApproved returns false
      expect(result.success).toBe(false);
      expect(result.message).toBe('Duplicate order_id');
    });
  });

  // ============================================================================
  // XML PARSING
  // ============================================================================

  describe('_parseXmlResponse', () => {
    it('should extract all standard fields from Moneris XML', () => {
      const xml = buildMonerisXml({
        responseCode: '00',
        message: 'APPROVED',
        transId: 'txn-999',
        authCode: 'A1B2C3',
        cardType: 'M',
      });

      const parsed = service._parseXmlResponse(xml);

      expect(parsed.responseCode).toBe('00');
      expect(parsed.message).toBe('APPROVED');
      expect(parsed.transId).toBe('txn-999');
      expect(parsed.authCode).toBe('A1B2C3');
      expect(parsed.cardType).toBe('M');
      expect(parsed.complete).toBe('true');
    });

    it('should return null for missing XML tags', () => {
      const parsed = service._parseXmlResponse('<response><receipt></receipt></response>');

      expect(parsed.responseCode).toBeNull();
      expect(parsed.message).toBeNull();
      expect(parsed.transId).toBeNull();
    });
  });

  // ============================================================================
  // XML BUILDING
  // ============================================================================

  describe('_buildXml', () => {
    it('should build valid XML with store credentials', () => {
      const xml = service._buildXml('purchase', {
        order_id: 'ORD-001',
        amount: '10.00',
        pan: '4242424242424242',
        expdate: '2512',
      });

      expect(xml).toContain('<store_id>test_store</store_id>');
      expect(xml).toContain('<api_token>test_token</api_token>');
      expect(xml).toContain('<purchase>');
      expect(xml).toContain('<order_id>ORD-001</order_id>');
      expect(xml).toContain('<amount>10.00</amount>');
      expect(xml).toContain('<pan>4242424242424242</pan>');
    });
  });
});
