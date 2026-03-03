/**
 * Unit tests for backend/middleware/creditHoldCheck.js
 *
 * Tests the creditHoldCheck factory function which creates Express middleware
 * for blocking on-account sales when a customer's credit is on hold or
 * when the customer does not have an on-account setup.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

const { creditHoldCheck } = require('../middleware/creditHoldCheck');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Build a minimal Express-compatible mock request.
 */
function mockReq(overrides = {}) {
  return {
    headers: {},
    params: {},
    body: {},
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
 * Build a mock account service.
 */
function mockAccountService() {
  return {
    checkCreditHold: jest.fn(),
  };
}

/**
 * Execute middleware and capture the next() call.
 * Returns a promise that resolves to { error, called }.
 */
function callMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    const next = (err) => resolve({ error: err || null, called: true });
    try {
      const result = middleware(req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch((e) => resolve({ error: e, called: false }));
      }
    } catch (syncErr) {
      resolve({ error: syncErr, called: false });
    }
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Module exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('module exports', () => {
  test('should export creditHoldCheck function', () => {
    expect(typeof creditHoldCheck).toBe('function');
  });

  test('creditHoldCheck should return a middleware function', () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // (req, res, next)
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Skip conditions — non-on_account payments
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — skip conditions', () => {
  test('should skip when paymentMethod is not on_account', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'credit_card', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should skip when paymentMethod is cash', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'cash', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should skip when customerId is missing', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account' },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should skip when both paymentMethod and customerId are missing', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should skip when paymentMethod is on_account but customerId is null', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: null },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should skip when paymentMethod is on_account but customerId is 0', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 0 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Snake-case body field support
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — snake_case body fields', () => {
  test('should accept payment_method and customer_id snake_case fields', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: true,
      status: 'active',
      creditLimit: 100000,
      currentBalance: 50000,
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { payment_method: 'on_account', customer_id: 200 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).toHaveBeenCalledWith(200);
  });

  test('should prefer camelCase over snake_case when both present', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: true,
      status: 'active',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: {
        paymentMethod: 'on_account',
        payment_method: 'cash',
        customerId: 100,
        customer_id: 200,
      },
    });
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    // Should use camelCase customerId (100), not snake_case customer_id (200)
    expect(accountService.checkCreditHold).toHaveBeenCalledWith(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Success path — canCharge is true
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — successful credit check', () => {
  test('should attach customerCredit to req and call next on success', async () => {
    const creditResult = {
      hasAccount: true,
      canCharge: true,
      status: 'active',
      creditLimit: 500000,
      currentBalance: 150000,
      availableCredit: 350000,
    };
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue(creditResult);

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.customerCredit).toBe(creditResult);
    expect(req.customerCredit.creditLimit).toBe(500000);
    expect(req.customerCredit.availableCredit).toBe(350000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No account setup — hasAccount is false
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — no account', () => {
  test('should throw ApiError 400 when customer has no account', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: false,
      canCharge: false,
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(400);
    expect(error.message).toMatch(/does not have an on-account setup/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cannot charge — canCharge is false
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — cannot charge', () => {
  test('should throw ApiError 403 when account is on hold', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: false,
      status: 'hold',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(403);
    expect(error.message).toContain('Account status is "hold"');
    // Should NOT include credit limit exceeded for non-active status
    expect(error.message).not.toContain('credit limit exceeded');
  });

  test('should throw ApiError 403 with credit limit exceeded for active status', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: false,
      status: 'active',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(403);
    expect(error.message).toContain('Account status is "active"');
    expect(error.message).toContain('credit limit exceeded');
  });

  test('should throw ApiError 403 when account is suspended', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: false,
      status: 'suspended',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(403);
    expect(error.message).toContain('Account status is "suspended"');
    expect(error.message).not.toContain('credit limit exceeded');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — error handling', () => {
  test('should re-throw ApiError from accountService', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockRejectedValue(
      new ApiError(404, 'Customer not found')
    );

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 999 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(404);
    expect(error.message).toBe('Customer not found');
  });

  test('should wrap non-ApiError in ApiError 500', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockRejectedValue(
      new Error('Database connection failed')
    );

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(500);
    expect(error.message).toBe('Credit check failed');
  });

  test('should wrap TypeError in ApiError 500', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockRejectedValue(
      new TypeError('Cannot read properties of undefined')
    );

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(500);
    expect(error.message).toBe('Credit check failed');
  });

  test('should re-throw ApiError thrown inside the middleware logic', async () => {
    // This tests the path where checkCreditHold returns hasAccount: false
    // which throws an ApiError internally, then is re-thrown
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: false,
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 100 },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    // Should be the 400, not wrapped as 500
    expect(error.code).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditHoldCheck — edge cases', () => {
  test('should handle empty body gracefully', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    const req = mockReq({ body: {} });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).not.toHaveBeenCalled();
  });

  test('should handle undefined body gracefully', async () => {
    const accountService = mockAccountService();
    const middleware = creditHoldCheck(accountService);
    // Express sets req.body to undefined when no body parser runs
    const req = mockReq();
    delete req.body;
    const res = mockRes();

    // This should either skip or throw a clean error
    const { called } = await callMiddleware(middleware, req, res);

    // The middleware accesses req.body.customerId which will throw on undefined body
    // The catch block should wrap it in ApiError 500
    expect(called).toBe(true);
  });

  test('should call checkCreditHold with the correct customerId', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: true,
      status: 'active',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: 42 },
    });
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(accountService.checkCreditHold).toHaveBeenCalledTimes(1);
    expect(accountService.checkCreditHold).toHaveBeenCalledWith(42);
  });

  test('should work with string customerId', async () => {
    const accountService = mockAccountService();
    accountService.checkCreditHold.mockResolvedValue({
      hasAccount: true,
      canCharge: true,
      status: 'active',
    });

    const middleware = creditHoldCheck(accountService);
    const req = mockReq({
      body: { paymentMethod: 'on_account', customerId: '42' },
    });
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(accountService.checkCreditHold).toHaveBeenCalledWith('42');
  });
});
