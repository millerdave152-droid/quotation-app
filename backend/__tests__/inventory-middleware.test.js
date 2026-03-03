/**
 * Unit tests for backend/middleware/inventoryMiddleware.js
 *
 * Tests createInventoryMiddleware factory (7 middleware methods) and
 * createInventoryHooks factory (5 hook methods).
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockReserveQuoteItems = jest.fn();
const mockReleaseQuoteReservations = jest.fn();
const mockConvertQuoteToOrder = jest.fn();
const mockDeductForTransaction = jest.fn();
const mockRestoreForVoidedTransaction = jest.fn();
const mockCheckBulkAvailability = jest.fn();
const mockExpireOldReservations = jest.fn();
const mockDeductForSale = jest.fn();
const mockProcessReturn = jest.fn();

jest.mock('../services/InventorySyncService', () => {
  return jest.fn().mockImplementation(() => ({
    reserveQuoteItems: mockReserveQuoteItems,
    releaseQuoteReservations: mockReleaseQuoteReservations,
    convertQuoteToOrder: mockConvertQuoteToOrder,
    deductForTransaction: mockDeductForTransaction,
    restoreForVoidedTransaction: mockRestoreForVoidedTransaction,
    checkBulkAvailability: mockCheckBulkAvailability,
    expireOldReservations: mockExpireOldReservations,
    deductForSale: mockDeductForSale,
    processReturn: mockProcessReturn,
  }));
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const { createInventoryMiddleware, createInventoryHooks } = require('../middleware/inventoryMiddleware');
const InventorySyncService = require('../services/InventorySyncService');

const mockPool = { query: jest.fn(), connect: jest.fn() };
const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

/**
 * Build a minimal Express-compatible mock request.
 */
function mockReq(overrides = {}) {
  return {
    headers: {},
    params: {},
    body: {},
    user: null,
    ...overrides,
  };
}

/**
 * Build a minimal Express-compatible mock response.
 */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Execute middleware and capture the next() call or response.
 */
function callMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const next = (err) => done({ error: err || null, called: true });

    // Also resolve when res.json is called (e.g. 401/400/500 response paths)
    const origJson = res.json;
    res.json = jest.fn((...args) => {
      origJson(...args);
      done({ error: null, called: false });
      return res;
    });

    try {
      const result = middleware(req, res, next);
      if (result && typeof result.then === 'function') {
        result.then(() => {
          done({ error: null, called: false });
        }).catch((e) => done({ error: e, called: false }));
      }
    } catch (syncErr) {
      done({ error: syncErr, called: false });
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Module exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('module exports', () => {
  test('should export createInventoryMiddleware function', () => {
    expect(typeof createInventoryMiddleware).toBe('function');
  });

  test('should export createInventoryHooks function', () => {
    expect(typeof createInventoryHooks).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createInventoryMiddleware — factory
// ═══════════════════════════════════════════════════════════════════════════════

describe('createInventoryMiddleware — factory', () => {
  test('should instantiate InventorySyncService with pool and cache', () => {
    createInventoryMiddleware(mockPool, mockCache);
    expect(InventorySyncService).toHaveBeenCalledWith(mockPool, mockCache);
  });

  test('should instantiate with null cache when not provided', () => {
    createInventoryMiddleware(mockPool);
    expect(InventorySyncService).toHaveBeenCalledWith(mockPool, null);
  });

  test('should return object with all middleware methods', () => {
    const mw = createInventoryMiddleware(mockPool, mockCache);

    expect(typeof mw.reserveForQuote).toBe('function');
    expect(typeof mw.releaseQuoteReservations).toBe('function');
    expect(typeof mw.convertQuoteToOrder).toBe('function');
    expect(typeof mw.deductForTransaction).toBe('function');
    expect(typeof mw.restoreForVoid).toBe('function');
    expect(typeof mw.checkAvailability).toBe('function');
    expect(typeof mw.expireReservations).toBe('function');
  });

  test('should expose the service instance', () => {
    const mw = createInventoryMiddleware(mockPool, mockCache);
    expect(mw.service).toBeDefined();
  });

  test('deductForTransaction should be a factory returning middleware', () => {
    const mw = createInventoryMiddleware(mockPool, mockCache);
    const middleware = mw.deductForTransaction();
    expect(typeof middleware).toBe('function');
  });

  test('checkAvailability should be a factory returning middleware', () => {
    const mw = createInventoryMiddleware(mockPool, mockCache);
    const middleware = mw.checkAvailability();
    expect(typeof middleware).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reserveForQuote
// ═══════════════════════════════════════════════════════════════════════════════

describe('reserveForQuote', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should return 401 when user is not authenticated', async () => {
    const req = mockReq({ body: { quoteId: 1, items: [{ productId: 1, quantity: 2 }] } });
    const res = mockRes();

    await callMiddleware(mw.reserveForQuote, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Authentication required for inventory operations',
      })
    );
  });

  test('should return 401 when user has no id', async () => {
    const req = mockReq({
      user: {},
      body: { quoteId: 1, items: [{ productId: 1, quantity: 2 }] },
    });
    const res = mockRes();

    await callMiddleware(mw.reserveForQuote, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('should skip when reserveInventory is false', async () => {
    const req = mockReq({
      user: { id: 42 },
      body: {
        quoteId: 1,
        items: [{ productId: 1, quantity: 2 }],
        reserveInventory: false,
      },
    });
    const res = mockRes();

    const { called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'Reservation not requested',
    });
    expect(mockReserveQuoteItems).not.toHaveBeenCalled();
  });

  test('should skip when items array is empty', async () => {
    const req = mockReq({
      user: { id: 42 },
      body: { quoteId: 1, items: [], reserveInventory: true },
    });
    const res = mockRes();

    const { called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult.skipped).toBe(true);
    expect(mockReserveQuoteItems).not.toHaveBeenCalled();
  });

  test('should skip when items is not provided', async () => {
    const req = mockReq({
      user: { id: 42 },
      body: { quoteId: 1, reserveInventory: true },
    });
    const res = mockRes();

    const { called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult.skipped).toBe(true);
  });

  test('should reserve items successfully and attach result', async () => {
    const reserveResult = {
      success: true,
      reservations: [
        { reservationId: 1, productId: 1, quantity: 5 },
        { reservationId: 2, productId: 2, quantity: 3 },
      ],
    };
    mockReserveQuoteItems.mockResolvedValue(reserveResult);

    const req = mockReq({
      user: { id: 42 },
      body: {
        quoteId: 100,
        items: [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
        customerId: 50,
        reserveInventory: true,
        expiresHours: 48,
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(mockReserveQuoteItems).toHaveBeenCalledWith(
      100,
      [{ productId: 1, quantity: 5 }, { productId: 2, quantity: 3 }],
      { customerId: 50, expiresHours: 48, userId: 42 }
    );
    expect(req.inventoryResult).toBe(reserveResult);
  });

  test('should use default expiresHours of 72 when not specified', async () => {
    mockReserveQuoteItems.mockResolvedValue({ success: true, reservations: [] });

    const req = mockReq({
      user: { id: 42 },
      body: {
        quoteId: 100,
        items: [{ productId: 1, quantity: 2 }],
        customerId: 50,
      },
    });
    const res = mockRes();

    await callMiddleware(mw.reserveForQuote, req, res);

    expect(mockReserveQuoteItems).toHaveBeenCalledWith(
      100,
      [{ productId: 1, quantity: 2 }],
      expect.objectContaining({ expiresHours: 72 })
    );
  });

  test('should log warning but continue when reservation fails', async () => {
    const failResult = {
      success: false,
      errors: ['Insufficient inventory for product 1'],
    };
    mockReserveQuoteItems.mockResolvedValue(failResult);

    const req = mockReq({
      user: { id: 42 },
      body: {
        quoteId: 100,
        items: [{ productId: 1, quantity: 1000 }],
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toBe(failResult);
    expect(console.warn).toHaveBeenCalled();
  });

  test('should catch errors and continue with error info on req', async () => {
    mockReserveQuoteItems.mockRejectedValue(new Error('DB connection lost'));

    const req = mockReq({
      user: { id: 42 },
      body: {
        quoteId: 100,
        items: [{ productId: 1, quantity: 2 }],
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.reserveForQuote, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toEqual({ error: 'DB connection lost' });
    expect(console.error).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// releaseQuoteReservations
// ═══════════════════════════════════════════════════════════════════════════════

describe('releaseQuoteReservations', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should skip when no quoteId is provided', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { called } = await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'No quote ID',
    });
    expect(mockReleaseQuoteReservations).not.toHaveBeenCalled();
  });

  test('should use quoteId from params', async () => {
    const releaseResult = { success: true, released: 3 };
    mockReleaseQuoteReservations.mockResolvedValue(releaseResult);

    const req = mockReq({
      params: { quoteId: '100' },
      body: {},
      user: { id: 42 },
    });
    const res = mockRes();

    const { called } = await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(called).toBe(true);
    expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(100, 'Quote cancelled', 42);
    expect(req.inventoryResult).toBe(releaseResult);
  });

  test('should use quoteId from body when not in params', async () => {
    mockReleaseQuoteReservations.mockResolvedValue({ success: true });

    const req = mockReq({
      body: { quoteId: 200, reason: 'Expired' },
      user: { id: 42 },
    });
    const res = mockRes();

    await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(200, 'Expired', 42);
  });

  test('should use default reason when not provided', async () => {
    mockReleaseQuoteReservations.mockResolvedValue({ success: true });

    const req = mockReq({
      params: { quoteId: '100' },
      body: {},
      user: { id: 42 },
    });
    const res = mockRes();

    await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(100, 'Quote cancelled', 42);
  });

  test('should handle null user gracefully', async () => {
    mockReleaseQuoteReservations.mockResolvedValue({ success: true });

    const req = mockReq({
      params: { quoteId: '100' },
      body: {},
    });
    const res = mockRes();

    await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(100, 'Quote cancelled', undefined);
  });

  test('should catch errors and continue', async () => {
    mockReleaseQuoteReservations.mockRejectedValue(new Error('Release failed'));

    const req = mockReq({
      params: { quoteId: '100' },
      body: {},
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.releaseQuoteReservations, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toEqual({ error: 'Release failed' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// convertQuoteToOrder
// ═══════════════════════════════════════════════════════════════════════════════

describe('convertQuoteToOrder', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should skip when quoteId is missing', async () => {
    const req = mockReq({ body: { orderId: 200 } });
    const res = mockRes();

    const { called } = await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'Missing quoteId or orderId',
    });
  });

  test('should skip when orderId is missing', async () => {
    const req = mockReq({ body: { quoteId: 100 } });
    const res = mockRes();

    const { called } = await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'Missing quoteId or orderId',
    });
  });

  test('should skip when both quoteId and orderId are missing', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { called } = await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult.skipped).toBe(true);
  });

  test('should convert quote to order successfully', async () => {
    const convertResult = { success: true, converted: 3 };
    mockConvertQuoteToOrder.mockResolvedValue(convertResult);

    const req = mockReq({
      body: { quoteId: 100, orderId: 200 },
      user: { id: 42 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(mockConvertQuoteToOrder).toHaveBeenCalledWith(100, 200, 42);
    expect(req.inventoryResult).toBe(convertResult);
  });

  test('should parse quoteId and orderId as integers', async () => {
    mockConvertQuoteToOrder.mockResolvedValue({ success: true });

    const req = mockReq({
      body: { quoteId: '100', orderId: '200' },
      user: { id: 42 },
    });
    const res = mockRes();

    await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(mockConvertQuoteToOrder).toHaveBeenCalledWith(100, 200, 42);
  });

  test('should catch errors and continue', async () => {
    mockConvertQuoteToOrder.mockRejectedValue(new Error('Conversion failed'));

    const req = mockReq({
      body: { quoteId: 100, orderId: 200 },
      user: { id: 42 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.convertQuoteToOrder, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toEqual({ error: 'Conversion failed' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deductForTransaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('deductForTransaction', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should return 401 when user is not authenticated', async () => {
    const middleware = mw.deductForTransaction();
    const req = mockReq({ body: { items: [{ productId: 1, quantity: 2 }] } });
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Authentication required for inventory operations',
      })
    );
  });

  test('should return 401 when user has no id', async () => {
    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: {},
      body: { items: [{ productId: 1, quantity: 2 }] },
    });
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('should skip when items array is empty', async () => {
    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: { id: 42 },
      body: { items: [] },
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'No items to deduct',
    });
    expect(mockDeductForTransaction).not.toHaveBeenCalled();
  });

  test('should skip when items is not provided', async () => {
    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: { id: 42 },
      body: {},
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult.skipped).toBe(true);
  });

  test('should deduct successfully and call next', async () => {
    const deductResult = {
      success: true,
      items: [
        { productId: 1, deducted: 5 },
        { productId: 2, deducted: 3 },
      ],
    };
    mockDeductForTransaction.mockResolvedValue(deductResult);

    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: { id: 42 },
      body: {
        items: [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
        transactionId: 100,
        orderId: 50,
        referenceNumber: 'TXN-001',
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(mockDeductForTransaction).toHaveBeenCalledWith(
      [{ productId: 1, quantity: 5 }, { productId: 2, quantity: 3 }],
      {
        transactionId: 100,
        orderId: 50,
        referenceNumber: 'TXN-001',
        userId: 42,
        allowNegative: false,
      }
    );
    expect(req.inventoryResult).toBe(deductResult);
  });

  test('should pass allowNegative option to service', async () => {
    mockDeductForTransaction.mockResolvedValue({ success: true, items: [] });

    const middleware = mw.deductForTransaction({ allowNegative: true });
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 5 }] },
    });
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(mockDeductForTransaction).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ allowNegative: true })
    );
  });

  test('should return 400 when deduction fails and failOnError is true (default)', async () => {
    const failResult = {
      success: false,
      errors: ['Insufficient inventory for product 1: available 3, requested 10'],
    };
    mockDeductForTransaction.mockResolvedValue(failResult);

    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 10 }] },
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    // Should NOT call next — returns error response
    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Insufficient inventory',
        inventoryErrors: failResult.errors,
      })
    );
  });

  test('should continue when deduction fails and failOnError is false', async () => {
    const failResult = {
      success: false,
      errors: ['Insufficient inventory'],
    };
    mockDeductForTransaction.mockResolvedValue(failResult);

    const middleware = mw.deductForTransaction({ failOnError: false });
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 10 }] },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toBe(failResult);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 500 on thrown error when failOnError is true', async () => {
    mockDeductForTransaction.mockRejectedValue(new Error('DB crash'));

    const middleware = mw.deductForTransaction({ failOnError: true });
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 5 }] },
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Inventory operation failed',
      })
    );
    expect(req.inventoryResult).toEqual({ error: 'DB crash' });
  });

  test('should continue on thrown error when failOnError is false', async () => {
    mockDeductForTransaction.mockRejectedValue(new Error('Timeout'));

    const middleware = mw.deductForTransaction({ failOnError: false });
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 5 }] },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toEqual({ error: 'Timeout' });
  });

  test('should default failOnError to false when not in options', async () => {
    mockDeductForTransaction.mockRejectedValue(new Error('Error'));

    // Default options = {} which means failOnError = false and allowNegative = false
    const middleware = mw.deductForTransaction();
    const req = mockReq({
      user: { id: 42 },
      body: { items: [{ productId: 1, quantity: 5 }] },
    });
    const res = mockRes();

    // With default options, failOnError is false from destructuring default
    // BUT: looking at the source, failOnError defaults to true only in the options param,
    // actually: const { allowNegative = false, failOnError = true } = options;
    // Wait - let me re-read: failOnError = true is not in the source...
    // Actually in the source: const { allowNegative = false, failOnError = true } = options;
    // Hmm, no. Looking at source: const { allowNegative = false, failOnError = true } = options;
    // is not present. Let me check the actual source...
    // From the source: options.failOnError is checked. Default options = {}
    // So options.failOnError is undefined (falsy), so the catch block won't fail on error.

    const { called } = await callMiddleware(middleware, req, res);
    // With options = {}, options.failOnError is undefined (falsy)
    // So the catch block goes to next()
    expect(called).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// restoreForVoid
// ═══════════════════════════════════════════════════════════════════════════════

describe('restoreForVoid', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should skip when items array is empty', async () => {
    const req = mockReq({ body: { items: [] } });
    const res = mockRes();

    const { called } = await callMiddleware(mw.restoreForVoid, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult).toEqual({
      skipped: true,
      reason: 'No items to restore',
    });
  });

  test('should skip when items is not provided', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { called } = await callMiddleware(mw.restoreForVoid, req, res);

    expect(called).toBe(true);
    expect(req.inventoryResult.skipped).toBe(true);
  });

  test('should restore inventory for voided POS transaction', async () => {
    const restoreResult = { success: true, restored: 2 };
    mockRestoreForVoidedTransaction.mockResolvedValue(restoreResult);

    const req = mockReq({
      body: {
        items: [{ productId: 1, quantity: 5 }],
        transactionId: 100,
        referenceNumber: 'TXN-001',
      },
      user: { id: 42 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.restoreForVoid, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(mockRestoreForVoidedTransaction).toHaveBeenCalledWith(
      [{ productId: 1, quantity: 5 }],
      {
        referenceType: 'pos_transaction',
        referenceId: 100,
        referenceNumber: 'TXN-001',
        userId: 42,
      }
    );
    expect(req.inventoryResult).toBe(restoreResult);
  });

  test('should use order reference type when orderId is present', async () => {
    mockRestoreForVoidedTransaction.mockResolvedValue({ success: true });

    const req = mockReq({
      body: {
        items: [{ productId: 1, quantity: 5 }],
        orderId: 200,
        transactionId: 100,
        referenceNumber: 'ORD-001',
      },
      user: { id: 42 },
    });
    const res = mockRes();

    await callMiddleware(mw.restoreForVoid, req, res);

    expect(mockRestoreForVoidedTransaction).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        referenceType: 'order',
        referenceId: 200,
      })
    );
  });

  test('should handle null user gracefully', async () => {
    mockRestoreForVoidedTransaction.mockResolvedValue({ success: true });

    const req = mockReq({
      body: {
        items: [{ productId: 1, quantity: 5 }],
        transactionId: 100,
      },
    });
    const res = mockRes();

    await callMiddleware(mw.restoreForVoid, req, res);

    expect(mockRestoreForVoidedTransaction).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ userId: undefined })
    );
  });

  test('should catch errors and continue', async () => {
    mockRestoreForVoidedTransaction.mockRejectedValue(new Error('Restore failed'));

    const req = mockReq({
      body: {
        items: [{ productId: 1, quantity: 5 }],
        transactionId: 100,
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.restoreForVoid, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.inventoryResult).toEqual({ error: 'Restore failed' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkAvailability
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkAvailability', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should skip when items is not provided', async () => {
    const middleware = mw.checkAvailability();
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(mockCheckBulkAvailability).not.toHaveBeenCalled();
  });

  test('should skip when items array is empty', async () => {
    const middleware = mw.checkAvailability();
    const req = mockReq({ body: { items: [] } });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
  });

  test('should pass when all items are available', async () => {
    const availabilityResult = {
      allAvailable: true,
      items: [
        { productId: 1, available: true, qtyAvailable: 50 },
        { productId: 2, available: true, qtyAvailable: 30 },
      ],
    };
    mockCheckBulkAvailability.mockResolvedValue(availabilityResult);

    const middleware = mw.checkAvailability();
    const req = mockReq({
      body: {
        items: [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.availabilityCheck).toBe(availabilityResult);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 400 when items are unavailable and allowBackorder is false', async () => {
    const availabilityResult = {
      allAvailable: false,
      items: [
        { productId: 1, available: true, qtyAvailable: 50 },
        { productId: 2, available: false, qtyAvailable: 0, reason: 'Out of stock' },
      ],
    };
    mockCheckBulkAvailability.mockResolvedValue(availabilityResult);

    const middleware = mw.checkAvailability();
    const req = mockReq({
      body: {
        items: [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
      },
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Some items are not available',
        unavailableItems: [
          { productId: 2, available: false, qtyAvailable: 0, reason: 'Out of stock' },
        ],
      })
    );
  });

  test('should allow unavailable items when allowBackorder is true', async () => {
    const availabilityResult = {
      allAvailable: false,
      items: [
        { productId: 1, available: true },
        { productId: 2, available: false },
      ],
    };
    mockCheckBulkAvailability.mockResolvedValue(availabilityResult);

    const middleware = mw.checkAvailability({ allowBackorder: true });
    const req = mockReq({
      body: {
        items: [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
      },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.availabilityCheck).toBe(availabilityResult);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 500 on thrown error', async () => {
    mockCheckBulkAvailability.mockRejectedValue(new Error('DB error'));

    const middleware = mw.checkAvailability();
    const req = mockReq({
      body: { items: [{ productId: 1, quantity: 5 }] },
    });
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to check inventory availability',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// expireReservations
// ═══════════════════════════════════════════════════════════════════════════════

describe('expireReservations', () => {
  let mw;

  beforeEach(() => {
    mw = createInventoryMiddleware(mockPool, mockCache);
  });

  test('should expire reservations and attach result', async () => {
    const expireResult = { expired: 5, released: 12 };
    mockExpireOldReservations.mockResolvedValue(expireResult);

    const req = mockReq();
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.expireReservations, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.expiredReservations).toBe(expireResult);
    expect(mockExpireOldReservations).toHaveBeenCalledTimes(1);
  });

  test('should catch errors and continue with error info', async () => {
    mockExpireOldReservations.mockRejectedValue(new Error('Expiry failed'));

    const req = mockReq();
    const res = mockRes();

    const { error, called } = await callMiddleware(mw.expireReservations, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.expiredReservations).toEqual({ error: 'Expiry failed' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createInventoryHooks
// ═══════════════════════════════════════════════════════════════════════════════

describe('createInventoryHooks', () => {
  let hooks;

  beforeEach(() => {
    hooks = createInventoryHooks(mockPool, mockCache);
  });

  test('should return object with all hook methods', () => {
    expect(typeof hooks.onQuoteCreated).toBe('function');
    expect(typeof hooks.onQuoteCancelled).toBe('function');
    expect(typeof hooks.onQuoteConverted).toBe('function');
    expect(typeof hooks.onTransactionCompleted).toBe('function');
    expect(typeof hooks.onTransactionVoided).toBe('function');
    expect(typeof hooks.onReturnProcessed).toBe('function');
  });

  // ── onQuoteCreated ─────────────────────────────────────────────────────────

  describe('onQuoteCreated', () => {
    test('should return null when reserveInventory is false', async () => {
      const result = await hooks.onQuoteCreated(
        { id: 1, items: [{ product_id: 1, quantity: 5 }] },
        { reserveInventory: false }
      );

      expect(result).toBeNull();
      expect(mockReserveQuoteItems).not.toHaveBeenCalled();
    });

    test('should return null when reserveInventory not in options', async () => {
      const result = await hooks.onQuoteCreated(
        { id: 1, items: [{ product_id: 1, quantity: 5 }] },
        {}
      );

      expect(result).toBeNull();
    });

    test('should return null when quote has no items', async () => {
      const result = await hooks.onQuoteCreated(
        { id: 1, items: [] },
        { reserveInventory: true }
      );

      expect(result).toBeNull();
    });

    test('should return null when quote items is undefined', async () => {
      const result = await hooks.onQuoteCreated(
        { id: 1 },
        { reserveInventory: true }
      );

      expect(result).toBeNull();
    });

    test('should reserve items with snake_case product_id', async () => {
      mockReserveQuoteItems.mockResolvedValue({ success: true });

      await hooks.onQuoteCreated(
        {
          id: 100,
          customer_id: 50,
          items: [
            { product_id: 1, quantity: 5, id: 10 },
            { product_id: 2, quantity: 3, id: 11 },
          ],
        },
        { reserveInventory: true, expiresHours: 48, userId: 42 }
      );

      expect(mockReserveQuoteItems).toHaveBeenCalledWith(
        100,
        [
          { productId: 1, quantity: 5, id: 10 },
          { productId: 2, quantity: 3, id: 11 },
        ],
        { customerId: 50, expiresHours: 48, userId: 42 }
      );
    });

    test('should reserve items with camelCase productId', async () => {
      mockReserveQuoteItems.mockResolvedValue({ success: true });

      await hooks.onQuoteCreated(
        {
          id: 100,
          customerId: 50,
          items: [
            { productId: 1, quantity: 5, id: 10 },
          ],
        },
        { reserveInventory: true, userId: 42 }
      );

      expect(mockReserveQuoteItems).toHaveBeenCalledWith(
        100,
        [{ productId: 1, quantity: 5, id: 10 }],
        { customerId: 50, expiresHours: 72, userId: 42 }
      );
    });

    test('should default expiresHours to 72', async () => {
      mockReserveQuoteItems.mockResolvedValue({ success: true });

      await hooks.onQuoteCreated(
        { id: 100, items: [{ product_id: 1, quantity: 5, id: 10 }] },
        { reserveInventory: true }
      );

      expect(mockReserveQuoteItems).toHaveBeenCalledWith(
        100,
        expect.any(Array),
        expect.objectContaining({ expiresHours: 72 })
      );
    });
  });

  // ── onQuoteCancelled ───────────────────────────────────────────────────────

  describe('onQuoteCancelled', () => {
    test('should release reservations with default reason', async () => {
      mockReleaseQuoteReservations.mockResolvedValue({ success: true });

      await hooks.onQuoteCancelled(100);

      expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(
        100,
        'Quote cancelled',
        null
      );
    });

    test('should release reservations with custom reason', async () => {
      mockReleaseQuoteReservations.mockResolvedValue({ success: true });

      await hooks.onQuoteCancelled(100, 'Expired', 42);

      expect(mockReleaseQuoteReservations).toHaveBeenCalledWith(
        100,
        'Expired',
        42
      );
    });
  });

  // ── onQuoteConverted ───────────────────────────────────────────────────────

  describe('onQuoteConverted', () => {
    test('should convert quote to order', async () => {
      mockConvertQuoteToOrder.mockResolvedValue({ success: true });

      await hooks.onQuoteConverted(100, 200, 42);

      expect(mockConvertQuoteToOrder).toHaveBeenCalledWith(100, 200, 42);
    });

    test('should handle null userId', async () => {
      mockConvertQuoteToOrder.mockResolvedValue({ success: true });

      await hooks.onQuoteConverted(100, 200);

      expect(mockConvertQuoteToOrder).toHaveBeenCalledWith(100, 200, null);
    });
  });

  // ── onTransactionCompleted ─────────────────────────────────────────────────

  describe('onTransactionCompleted', () => {
    test('should return null when transaction has no items', async () => {
      const result = await hooks.onTransactionCompleted({ id: 100, items: [] });

      expect(result).toBeNull();
      expect(mockDeductForTransaction).not.toHaveBeenCalled();
    });

    test('should return null when items is undefined', async () => {
      const result = await hooks.onTransactionCompleted({ id: 100 });

      expect(result).toBeNull();
    });

    test('should deduct for transaction with snake_case fields', async () => {
      mockDeductForTransaction.mockResolvedValue({ success: true });

      await hooks.onTransactionCompleted(
        {
          id: 100,
          transaction_number: 'TXN-001',
          items: [
            { product_id: 1, quantity: 5 },
            { product_id: 2, quantity: 3 },
          ],
        },
        42
      );

      expect(mockDeductForTransaction).toHaveBeenCalledWith(
        [
          { productId: 1, quantity: 5 },
          { productId: 2, quantity: 3 },
        ],
        {
          transactionId: 100,
          referenceNumber: 'TXN-001',
          userId: 42,
        }
      );
    });

    test('should deduct for transaction with camelCase fields', async () => {
      mockDeductForTransaction.mockResolvedValue({ success: true });

      await hooks.onTransactionCompleted(
        {
          id: 100,
          transactionNumber: 'TXN-002',
          items: [{ productId: 1, quantity: 5 }],
        },
        42
      );

      expect(mockDeductForTransaction).toHaveBeenCalledWith(
        [{ productId: 1, quantity: 5 }],
        expect.objectContaining({ referenceNumber: 'TXN-002' })
      );
    });
  });

  // ── onTransactionVoided ────────────────────────────────────────────────────

  describe('onTransactionVoided', () => {
    test('should return null when transaction has no items', async () => {
      const result = await hooks.onTransactionVoided({ id: 100, items: [] });

      expect(result).toBeNull();
    });

    test('should return null when items is undefined', async () => {
      const result = await hooks.onTransactionVoided({ id: 100 });

      expect(result).toBeNull();
    });

    test('should restore inventory for voided transaction', async () => {
      mockRestoreForVoidedTransaction.mockResolvedValue({ success: true });

      await hooks.onTransactionVoided(
        {
          id: 100,
          transaction_number: 'TXN-001',
          items: [
            { product_id: 1, quantity: 5 },
          ],
        },
        42
      );

      expect(mockRestoreForVoidedTransaction).toHaveBeenCalledWith(
        [{ productId: 1, quantity: 5 }],
        {
          referenceType: 'pos_transaction',
          referenceId: 100,
          referenceNumber: 'TXN-001',
          userId: 42,
        }
      );
    });
  });

  // ── onReturnProcessed ──────────────────────────────────────────────────────

  describe('onReturnProcessed', () => {
    test('should process return with provided reason', async () => {
      mockProcessReturn.mockResolvedValue({ success: true });

      await hooks.onReturnProcessed(
        {
          productId: 1,
          quantity: 2,
          orderId: 100,
          reason: 'Defective item',
        },
        42
      );

      expect(mockProcessReturn).toHaveBeenCalledWith({
        productId: 1,
        quantity: 2,
        orderId: 100,
        returnReason: 'Defective item',
        userId: 42,
      });
    });

    test('should use default reason when not provided', async () => {
      mockProcessReturn.mockResolvedValue({ success: true });

      await hooks.onReturnProcessed(
        { productId: 1, quantity: 1, orderId: 100 },
        42
      );

      expect(mockProcessReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          returnReason: 'Customer return',
        })
      );
    });

    test('should handle null userId', async () => {
      mockProcessReturn.mockResolvedValue({ success: true });

      await hooks.onReturnProcessed({ productId: 1, quantity: 1, orderId: 100 });

      expect(mockProcessReturn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null })
      );
    });
  });
});
