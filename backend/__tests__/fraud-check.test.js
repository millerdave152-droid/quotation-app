/**
 * Unit tests for backend/middleware/fraudCheck.js
 *
 * Tests the fraudCheck factory function which creates Express middleware
 * for fraud assessment on transaction, void, and refund routes.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock the errorHandler module to provide asyncHandler
jest.mock('../middleware/errorHandler', () => {
  const actual = jest.requireActual('../middleware/errorHandler');
  return {
    ...actual,
    asyncHandler: actual.asyncHandler,
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const { fraudCheck } = require('../middleware/fraudCheck');

/**
 * Build a minimal Express-compatible mock request.
 */
function mockReq(overrides = {}) {
  const app = {
    get: jest.fn(),
  };
  return {
    app,
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
 * Build a mock fraud service with all methods.
 */
function mockFraudService() {
  return {
    assessTransaction: jest.fn(),
    assessVoid: jest.fn(),
    assessRefund: jest.fn(),
    logAuditEntry: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Execute middleware and capture the next() call or response.
 * Returns a promise that resolves to { error, called }.
 */
function callMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

    const next = (err) => done({ error: err || null, called: true });

    // Also resolve when res.json is called (e.g. block path returns 403)
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
          // If middleware resolved without calling next or res.json, resolve anyway
          done({ error: null, called: false });
        }).catch((e) => done({ error: e, called: false }));
      }
    } catch (syncErr) {
      done({ error: syncErr, called: false });
    }
  });
}

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ALLOW_RESULT = {
  riskScore: 15,
  triggeredRules: [
    {
      rule: {
        rule_code: 'RULE_001',
        rule_name: 'Low Risk Pattern',
        severity: 'low',
        risk_points: 15,
      },
      details: 'Minor pattern detected',
    },
  ],
  action: 'allow',
  alertId: null,
};

const BLOCK_RESULT = {
  riskScore: 95,
  triggeredRules: [
    {
      rule: {
        rule_code: 'RULE_HIGH_VALUE',
        rule_name: 'High Value Transaction',
        severity: 'critical',
        risk_points: 50,
      },
      details: 'Transaction exceeds $10,000',
    },
    {
      rule: {
        rule_code: 'RULE_VELOCITY',
        rule_name: 'High Velocity',
        severity: 'high',
        risk_points: 45,
      },
      details: '5 transactions in 10 minutes',
    },
  ],
  action: 'block',
  alertId: 'ALERT-123',
};

const WARN_RESULT = {
  riskScore: 45,
  triggeredRules: [
    {
      rule: {
        rule_code: 'RULE_UNUSUAL',
        rule_name: 'Unusual Pattern',
        severity: 'medium',
        risk_points: 45,
      },
      details: 'Unusual purchase pattern',
    },
  ],
  action: 'warn',
  alertId: 'ALERT-456',
};

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Module exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('module exports', () => {
  test('should export fraudCheck function', () => {
    expect(typeof fraudCheck).toBe('function');
  });

  test('fraudCheck should return a middleware function', () => {
    const middleware = fraudCheck('transaction.create');
    expect(typeof middleware).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No fraudService configured
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — no fraudService', () => {
  test('should call next() when fraudService is not configured', async () => {
    const middleware = fraudCheck('transaction.create');
    const req = mockReq();
    req.app.get.mockReturnValue(undefined);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should call next() when fraudService is null', async () => {
    const middleware = fraudCheck('transaction.void');
    const req = mockReq();
    req.app.get.mockReturnValue(null);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// transaction.create
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — transaction.create', () => {
  test('should assess transaction and attach result to req on allow', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: {
        shiftId: 5,
        customerId: 100,
        totalAmount: 50000,
        items: [{ productId: 1, quantity: 2 }],
      },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(res.status).not.toHaveBeenCalled();

    // Verify assessTransaction was called correctly
    expect(fraudService.assessTransaction).toHaveBeenCalledWith(
      req.body,
      42,
      5,
      100
    );

    // Verify audit entry was logged
    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      42,
      'transaction.create',
      'transaction',
      null,
      expect.objectContaining({
        shift_id: 5,
        risk_score: 15,
        total_amount: 50000,
        item_count: 1,
      }),
      req
    );

    // Verify assessment is attached to request
    expect(req.fraudAssessment).toBeDefined();
    expect(req.fraudAssessment.riskScore).toBe(15);
    expect(req.fraudAssessment.action).toBe('allow');
    expect(req.fraudAssessment.triggeredRules).toHaveLength(1);
    expect(req.fraudAssessment.triggeredRules[0].rule_code).toBe('RULE_001');
    expect(req.fraudAssessment.triggeredRules[0].risk_points).toBe(15);
  });

  test('should use snake_case alternatives for body fields', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 10 },
      body: {
        shift_id: 7,
        customer_id: 200,
        total_amount: 30000,
        items: [{ productId: 1 }, { productId: 2 }],
      },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.assessTransaction).toHaveBeenCalledWith(
      req.body,
      10,
      7,
      200
    );

    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      10,
      'transaction.create',
      'transaction',
      null,
      expect.objectContaining({
        shift_id: 7,
        total_amount: 30000,
        item_count: 2,
      }),
      req
    );
  });

  test('should handle missing items array for item_count', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 1 },
      body: { shiftId: 1, customerId: 1, totalAmount: 1000 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      1,
      'transaction.create',
      'transaction',
      null,
      expect.objectContaining({
        item_count: 0,
      }),
      req
    );
  });

  test('should block transaction when assessment returns block action', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(BLOCK_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, totalAmount: 1500000, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    // Should NOT call next
    expect(called).toBe(false);

    // Should return 403
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Transaction blocked by fraud detection',
        code: 'FRAUD_BLOCKED',
        fraudAssessment: expect.objectContaining({
          riskScore: 95,
          action: 'block',
          alertId: 'ALERT-123',
        }),
      })
    );

    // Verify triggered rules are mapped correctly in block response
    const response = res.json.mock.calls[0][0];
    expect(response.fraudAssessment.triggeredRules).toHaveLength(2);
    expect(response.fraudAssessment.triggeredRules[0]).toEqual({
      rule_code: 'RULE_HIGH_VALUE',
      rule_name: 'High Value Transaction',
      severity: 'critical',
      details: 'Transaction exceeds $10,000',
    });
    expect(response.fraudAssessment.triggeredRules[1]).toEqual({
      rule_code: 'RULE_VELOCITY',
      rule_name: 'High Velocity',
      severity: 'high',
      details: '5 transactions in 10 minutes',
    });
  });

  test('should pass through warn action and attach assessment', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(WARN_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, totalAmount: 75000, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.fraudAssessment.riskScore).toBe(45);
    expect(req.fraudAssessment.action).toBe('warn');
    expect(req.fraudAssessment.alertId).toBe('ALERT-456');
  });

  test('should handle null customerId and shiftId gracefully', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { totalAmount: 5000 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.assessTransaction).toHaveBeenCalledWith(
      req.body,
      42,
      null,
      null
    );
  });

  test('should handle missing user gracefully', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      body: { totalAmount: 5000, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.assessTransaction).toHaveBeenCalledWith(
      req.body,
      undefined,
      null,
      null
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// transaction.void
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — transaction.void', () => {
  test('should assess void and attach result to req on allow', async () => {
    const fraudService = mockFraudService();
    fraudService.assessVoid.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.void');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '123' },
      body: { shift_id: 5, reason: 'Customer changed mind' },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();

    // Verify assessVoid was called with parsed integer ID
    expect(fraudService.assessVoid).toHaveBeenCalledWith(123, 42, 5);

    // Verify audit entry
    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      42,
      'transaction.void',
      'transaction',
      123,
      expect.objectContaining({
        shift_id: 5,
        risk_score: 15,
        void_reason: 'Customer changed mind',
      }),
      req
    );

    expect(req.fraudAssessment).toBeDefined();
    expect(req.fraudAssessment.action).toBe('allow');
  });

  test('should parse transaction ID as integer', async () => {
    const fraudService = mockFraudService();
    fraudService.assessVoid.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.void');
    const req = mockReq({
      user: { id: 1 },
      params: { id: '456' },
      body: { shiftId: 1 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.assessVoid).toHaveBeenCalledWith(456, 1, 1);
  });

  test('should use void_reason body field as fallback', async () => {
    const fraudService = mockFraudService();
    fraudService.assessVoid.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.void');
    const req = mockReq({
      user: { id: 1 },
      params: { id: '789' },
      body: { shiftId: 1, void_reason: 'Duplicate entry' },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      1,
      'transaction.void',
      'transaction',
      789,
      expect.objectContaining({
        void_reason: 'Duplicate entry',
      }),
      req
    );
  });

  test('should block void when assessment returns block action', async () => {
    const fraudService = mockFraudService();
    fraudService.assessVoid.mockResolvedValue(BLOCK_RESULT);

    const middleware = fraudCheck('transaction.void');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '123' },
      body: { shiftId: 5 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'FRAUD_BLOCKED',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// refund.process
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — refund.process', () => {
  test('should assess refund and attach result to req on allow', async () => {
    const fraudService = mockFraudService();
    fraudService.assessRefund.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('refund.process');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '999' },
      body: {
        shiftId: 5,
        refundAmount: 25000,
        reason: 'Defective product',
      },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();

    // Verify assessRefund was called with merged body and parsed ID
    expect(fraudService.assessRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        shiftId: 5,
        refundAmount: 25000,
        reason: 'Defective product',
        original_transaction_id: 999,
      }),
      42,
      5
    );

    // Verify audit entry
    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      42,
      'refund.process',
      'transaction',
      999,
      expect.objectContaining({
        shift_id: 5,
        risk_score: 15,
        refund_amount: 25000,
      }),
      req
    );

    expect(req.fraudAssessment.riskScore).toBe(15);
    expect(req.fraudAssessment.action).toBe('allow');
  });

  test('should use total_refund_amount as fallback', async () => {
    const fraudService = mockFraudService();
    fraudService.assessRefund.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('refund.process');
    const req = mockReq({
      user: { id: 1 },
      params: { id: '100' },
      body: { shiftId: 1, total_refund_amount: 15000 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(fraudService.logAuditEntry).toHaveBeenCalledWith(
      1,
      'refund.process',
      'transaction',
      100,
      expect.objectContaining({
        refund_amount: 15000,
      }),
      req
    );
  });

  test('should block refund when assessment returns block action', async () => {
    const fraudService = mockFraudService();
    fraudService.assessRefund.mockResolvedValue(BLOCK_RESULT);

    const middleware = fraudCheck('refund.process');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '999' },
      body: { shiftId: 5, refundAmount: 150000 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Transaction blocked by fraud detection',
        code: 'FRAUD_BLOCKED',
        fraudAssessment: expect.objectContaining({
          riskScore: 95,
          action: 'block',
          alertId: 'ALERT-123',
        }),
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — error handling', () => {
  test('should catch assessment errors and attach fallback assessment', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockRejectedValue(
      new Error('Fraud service unavailable')
    );

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(res.status).not.toHaveBeenCalled();

    // Should attach fallback assessment with error
    expect(req.fraudAssessment).toEqual({
      riskScore: 0,
      triggeredRules: [],
      action: 'allow',
      error: 'Fraud service unavailable',
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[FraudCheck] Error during transaction.create assessment:'),
      'Fraud service unavailable'
    );
  });

  test('should catch void assessment errors and not block', async () => {
    const fraudService = mockFraudService();
    fraudService.assessVoid.mockRejectedValue(
      new Error('Database timeout')
    );

    const middleware = fraudCheck('transaction.void');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '123' },
      body: { shiftId: 5 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.fraudAssessment).toEqual(
      expect.objectContaining({
        riskScore: 0,
        action: 'allow',
        error: 'Database timeout',
      })
    );
  });

  test('should catch refund assessment errors and not block', async () => {
    const fraudService = mockFraudService();
    fraudService.assessRefund.mockRejectedValue(
      new Error('Connection reset')
    );

    const middleware = fraudCheck('refund.process');
    const req = mockReq({
      user: { id: 42 },
      params: { id: '999' },
      body: { shiftId: 5 },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.fraudAssessment.error).toBe('Connection reset');
  });

  test('should catch audit log errors and still not block', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);
    fraudService.logAuditEntry.mockRejectedValue(
      new Error('Audit log write failed')
    );

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    // The error from logAuditEntry should be caught by the try/catch
    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(req.fraudAssessment).toBeDefined();
    expect(req.fraudAssessment.error).toBe('Audit log write failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Unknown assessment type
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — unknown assessment type', () => {
  test('should call next() with no assessment for unrecognized type', async () => {
    const fraudService = mockFraudService();

    const middleware = fraudCheck('unknown.type');
    const req = mockReq({
      user: { id: 42 },
      body: {},
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    const { error, called } = await callMiddleware(middleware, req, res);

    expect(called).toBe(true);
    expect(error).toBeNull();
    expect(res.status).not.toHaveBeenCalled();

    // No assessment methods should be called
    expect(fraudService.assessTransaction).not.toHaveBeenCalled();
    expect(fraudService.assessVoid).not.toHaveBeenCalled();
    expect(fraudService.assessRefund).not.toHaveBeenCalled();

    // result will be undefined, so next() is called without setting assessment
    expect(req.fraudAssessment).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Response format for blocked transactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — blocked response format', () => {
  test('should include rule_code, rule_name, severity, and details in blocked response', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(BLOCK_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    const response = res.json.mock.calls[0][0];
    const rules = response.fraudAssessment.triggeredRules;

    // Block response should NOT include risk_points in rules
    rules.forEach((rule) => {
      expect(rule).toHaveProperty('rule_code');
      expect(rule).toHaveProperty('rule_name');
      expect(rule).toHaveProperty('severity');
      expect(rule).toHaveProperty('details');
      expect(rule).not.toHaveProperty('risk_points');
    });
  });

  test('should include risk_points in allowed/warn assessment attached to req', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(ALLOW_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    // Non-blocked assessment should include risk_points
    const rules = req.fraudAssessment.triggeredRules;
    rules.forEach((rule) => {
      expect(rule).toHaveProperty('risk_points');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Allowed assessment with alertId
// ═══════════════════════════════════════════════════════════════════════════════

describe('fraudCheck — alertId handling', () => {
  test('should include alertId in allowed assessment', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue(WARN_RESULT);

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(req.fraudAssessment.alertId).toBe('ALERT-456');
  });

  test('should include null alertId when no alert generated', async () => {
    const fraudService = mockFraudService();
    fraudService.assessTransaction.mockResolvedValue({
      ...ALLOW_RESULT,
      alertId: null,
    });

    const middleware = fraudCheck('transaction.create');
    const req = mockReq({
      user: { id: 42 },
      body: { shiftId: 5, customerId: 100, items: [] },
    });
    req.app.get.mockReturnValue(fraudService);
    const res = mockRes();

    await callMiddleware(middleware, req, res);

    expect(req.fraudAssessment.alertId).toBeNull();
  });
});
