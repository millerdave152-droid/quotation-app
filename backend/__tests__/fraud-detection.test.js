/**
 * TeleTime - FraudDetectionService Tests
 *
 * Follows the pattern established in moneris-service.test.js:
 *   1. Import the service under test
 *   2. Mock external dependencies (pool, velocityService, binService)
 *   3. beforeEach: create fresh mocks + service instance + inject rules cache
 *   4. afterEach: clear all mocks
 *   5. Group tests by describe() per assessment type and rule
 *   6. Each test: set up rules + transaction data → call method → assert score/action
 *
 * Key conventions:
 *   - Rules are injected via the private _rulesCache to avoid DB queries
 *   - Each rule has: id, rule_code, rule_name, is_active, risk_points, severity, conditions
 *   - Risk score = sum of triggered rule risk_points
 *   - Actions: 'allow' (score < threshold), 'alert', 'require_approval', 'block'
 */

const FraudDetectionService = require('../services/FraudDetectionService');

// ============================================================================
// MOCK SETUP — rule definitions matching the 10+ production rules
// ============================================================================

/**
 * Helper: build a fraud rule object matching the DB schema.
 */
function buildRule(overrides = {}) {
  return {
    id: overrides.id || 1,
    rule_code: overrides.rule_code || 'test_rule',
    rule_name: overrides.rule_name || 'Test Rule',
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    risk_points: overrides.risk_points || 10,
    severity: overrides.severity || 'medium',
    conditions: overrides.conditions || {},
  };
}

/**
 * All production fraud rules used in assessTransaction, assessRefund, assessVoid, assessDiscount.
 */
function buildAllRules() {
  return [
    buildRule({ id: 1, rule_code: 'amount_high_txn', rule_name: 'High Transaction Amount', risk_points: 15, severity: 'medium', conditions: { threshold: 5000 } }),
    buildRule({ id: 2, rule_code: 'amount_high_discount', rule_name: 'High Discount Percentage', risk_points: 20, severity: 'high', conditions: { threshold_percent: 30 } }),
    buildRule({ id: 3, rule_code: 'chargeback_history', rule_name: 'Customer Chargeback History', risk_points: 25, severity: 'high', conditions: {} }),
    buildRule({ id: 4, rule_code: 'card_not_present', rule_name: 'Card Not Present', risk_points: 10, severity: 'low', conditions: {} }),
    buildRule({ id: 5, rule_code: 'split_tender_many', rule_name: 'Many Payment Methods', risk_points: 15, severity: 'medium', conditions: { min_methods: 3 } }),
    buildRule({ id: 6, rule_code: 'outside_business_hours', rule_name: 'Outside Business Hours', risk_points: 10, severity: 'low', conditions: { start_hour: 8, end_hour: 22 } }),
    buildRule({ id: 7, rule_code: 'bin_prepaid_card', rule_name: 'Prepaid Card', risk_points: 15, severity: 'medium', conditions: {} }),
    buildRule({ id: 8, rule_code: 'bin_foreign_card', rule_name: 'Foreign Card', risk_points: 20, severity: 'high', conditions: {} }),
    buildRule({ id: 9, rule_code: 'amount_high_refund', rule_name: 'High Refund Amount', risk_points: 15, severity: 'medium', conditions: { threshold: 2000 } }),
    buildRule({ id: 10, rule_code: 'velocity_refund', rule_name: 'Refund Velocity', risk_points: 20, severity: 'high', conditions: {} }),
    buildRule({ id: 11, rule_code: 'pattern_self_refund', rule_name: 'Self Refund', risk_points: 30, severity: 'critical', conditions: {} }),
    buildRule({ id: 12, rule_code: 'pattern_repeat_return', rule_name: 'Repeat Returns', risk_points: 15, severity: 'medium', conditions: {} }),
    buildRule({ id: 13, rule_code: 'pattern_no_receipt', rule_name: 'No Receipt Return', risk_points: 10, severity: 'low', conditions: {} }),
    buildRule({ id: 14, rule_code: 'velocity_void', rule_name: 'Void Velocity', risk_points: 20, severity: 'high', conditions: {} }),
    buildRule({ id: 15, rule_code: 'pattern_void_complete', rule_name: 'Void Completed Transaction', risk_points: 25, severity: 'high', conditions: {} }),
    buildRule({ id: 16, rule_code: 'discount_max_pattern', rule_name: 'Discount Tier Maxing', risk_points: 15, severity: 'medium', conditions: {} }),
    buildRule({ id: 17, rule_code: 'discount_void_pattern', rule_name: 'Discount + Void Pattern', risk_points: 20, severity: 'high', conditions: {} }),
    buildRule({ id: 18, rule_code: 'discount_refund_ratio', rule_name: 'Discount Refund Ratio', risk_points: 15, severity: 'medium', conditions: {} }),
  ];
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('FraudDetectionService', () => {
  let service;
  let mockPool;
  let mockVelocityService;
  let mockBinService;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn(),
      }),
    };

    mockVelocityService = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };

    mockBinService = {
      lookup: jest.fn().mockResolvedValue(null),
    };

    service = new FraudDetectionService(mockPool, {
      velocityService: mockVelocityService,
      binService: mockBinService,
    });

    // Inject rules cache to avoid DB lookups
    service._rulesCache = buildAllRules();
    service._rulesCacheTime = Date.now();

    // Mock internal methods that hit the DB for pattern detection
    service._checkSplitTransaction = jest.fn().mockResolvedValue(null);
    service._checkCardTesting = jest.fn().mockResolvedValue(null);
    service._checkGeographicAnomaly = jest.fn().mockResolvedValue(null);
    service._recordFraudScore = jest.fn().mockResolvedValue(undefined);
    service.createAlert = jest.fn().mockResolvedValue({ id: 100 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // TRANSACTION ASSESSMENT — Individual Rule Tests
  // ============================================================================

  describe('assessTransaction', () => {
    it('should allow a normal low-value transaction', async () => {
      const result = await service.assessTransaction(
        { total_amount: 100, payments: [] },
        1, // userId
        1  // shiftId
      );

      expect(result.riskScore).toBe(0);
      expect(result.triggeredRules).toHaveLength(0);
      expect(result.action).toBe('allow');
      expect(result.alertId).toBeNull();
    });

    it('should trigger amount_high_txn for large transactions', async () => {
      const result = await service.assessTransaction(
        { total_amount: 6000 }, // above $5000 threshold
        1, 1
      );

      expect(result.triggeredRules.length).toBeGreaterThan(0);
      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'amount_high_txn');
      expect(triggered).toBeDefined();
      expect(triggered.details.amount).toBe(6000);
      expect(result.riskScore).toBeGreaterThanOrEqual(15);
    });

    it('should trigger amount_high_discount for excessive discounts', async () => {
      const result = await service.assessTransaction(
        { total_amount: 1000, subtotal: 1000, discount_amount: 400 }, // 40% discount
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'amount_high_discount');
      expect(triggered).toBeDefined();
      expect(parseFloat(triggered.details.discount_percent)).toBeCloseTo(40, 0);
    });

    it('should NOT trigger discount rule when discount is within threshold', async () => {
      const result = await service.assessTransaction(
        { total_amount: 1000, subtotal: 1000, discount_amount: 100 }, // 10% — under 30%
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'amount_high_discount');
      expect(triggered).toBeUndefined();
    });

    it('should trigger chargeback_history for flagged customers', async () => {
      // Mock: customer has chargeback history
      service._checkCustomerChargebackHistory = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'chargeback_history'),
        details: { chargeback_count: 2 },
      });

      const result = await service.assessTransaction(
        { total_amount: 500 },
        1, 1,
        42 // customerId
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'chargeback_history');
      expect(triggered).toBeDefined();
      expect(triggered.details.chargeback_count).toBe(2);
    });

    it('should trigger card_not_present for manual card entry', async () => {
      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [{ cardEntryMethod: 'manual', paymentMethod: 'credit' }],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'card_not_present');
      expect(triggered).toBeDefined();
    });

    it('should trigger split_tender_many for 3+ payment methods', async () => {
      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [
            { paymentMethod: 'cash' },
            { paymentMethod: 'credit' },
            { paymentMethod: 'debit' },
          ],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'split_tender_many');
      expect(triggered).toBeDefined();
      expect(triggered.details.payment_method_count).toBe(3);
    });

    it('should NOT trigger split_tender for 2 payment methods', async () => {
      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [
            { paymentMethod: 'cash' },
            { paymentMethod: 'credit' },
          ],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'split_tender_many');
      expect(triggered).toBeUndefined();
    });

    it('should trigger bin_prepaid_card for prepaid cards', async () => {
      mockBinService.lookup.mockResolvedValue({
        isPrepaid: true,
        cardType: 'VISA',
        issuerName: 'Green Dot',
        issuerCountry: 'CA',
      });

      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [{ cardBin: '411111', paymentMethod: 'credit' }],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'bin_prepaid_card');
      expect(triggered).toBeDefined();
      expect(triggered.details.card_type).toBe('VISA');
    });

    it('should trigger bin_foreign_card for non-CA/US issuers', async () => {
      mockBinService.lookup.mockResolvedValue({
        isPrepaid: false,
        cardType: 'MASTERCARD',
        issuerName: 'Some Foreign Bank',
        issuerCountry: 'RU',
      });

      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [{ cardBin: '520000', paymentMethod: 'credit' }],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'bin_foreign_card');
      expect(triggered).toBeDefined();
      expect(triggered.details.issuer_country).toBe('RU');
    });

    it('should NOT trigger bin_foreign_card for Canadian issuers', async () => {
      mockBinService.lookup.mockResolvedValue({
        isPrepaid: false,
        issuerCountry: 'CA',
      });

      const result = await service.assessTransaction(
        {
          total_amount: 500,
          payments: [{ cardBin: '411111', paymentMethod: 'credit' }],
        },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'bin_foreign_card');
      expect(triggered).toBeUndefined();
    });

    it('should skip inactive rules', async () => {
      // Deactivate all rules
      service._rulesCache = buildAllRules().map(r => ({ ...r, is_active: false }));

      const result = await service.assessTransaction(
        { total_amount: 99999, discount_amount: 50000, subtotal: 99999 },
        1, 1
      );

      expect(result.triggeredRules).toHaveLength(0);
      expect(result.riskScore).toBe(0);
    });

    it('should create alert when rules trigger', async () => {
      const result = await service.assessTransaction(
        { total_amount: 6000 },
        1, 1
      );

      expect(service.createAlert).toHaveBeenCalledTimes(1);
      expect(result.alertId).toBe(100);
    });

    it('should NOT create alert when no rules trigger', async () => {
      const result = await service.assessTransaction(
        { total_amount: 50 },
        1, 1
      );

      expect(service.createAlert).not.toHaveBeenCalled();
      expect(result.alertId).toBeNull();
    });

    it('should record velocity events', async () => {
      await service.assessTransaction(
        { total_amount: 100, payments: [] },
        1, 1
      );

      expect(mockVelocityService.recordEvent).toHaveBeenCalledWith(
        'employee_txn',
        '1',
        10000, // 100 * 100 cents
        expect.objectContaining({ shift_id: 1 })
      );
    });
  });

  // ============================================================================
  // REFUND ASSESSMENT
  // ============================================================================

  describe('assessRefund', () => {
    beforeEach(() => {
      // _checkVelocity hits the DB — mock it for all refund tests
      service._checkVelocity = jest.fn().mockResolvedValue({ triggered: false });
      service._checkSelfRefund = jest.fn().mockResolvedValue({ triggered: false });
      service._checkRepeatReturns = jest.fn().mockResolvedValue({ triggered: false });
    });

    it('should allow a normal low-value refund', async () => {
      const result = await service.assessRefund(
        { total_refund_amount: 50 },
        1, 1
      );

      expect(result.riskScore).toBe(0);
      expect(result.action).toBe('allow');
    });

    it('should trigger amount_high_refund for large refunds', async () => {
      const result = await service.assessRefund(
        { total_refund_amount: 3000 }, // above $2000 threshold
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'amount_high_refund');
      expect(triggered).toBeDefined();
    });

    it('should trigger pattern_no_receipt for receipt-less returns', async () => {
      const result = await service.assessRefund(
        { total_refund_amount: 100, no_receipt: true },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'pattern_no_receipt');
      expect(triggered).toBeDefined();
      expect(triggered.details.pattern).toBe('no_receipt_return');
    });

    it('should trigger pattern_self_refund when employee refunds own sale', async () => {
      service._checkSelfRefund = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'pattern_self_refund'),
        details: { original_cashier: 1, refunding_cashier: 1 },
      });

      const result = await service.assessRefund(
        { total_refund_amount: 200, original_transaction_id: 555 },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'pattern_self_refund');
      expect(triggered).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should check velocity for refund frequency', async () => {
      service._checkVelocity = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'velocity_refund'),
        details: { count: 5, window: '1h' },
      });

      const result = await service.assessRefund(
        { total_refund_amount: 100 },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'velocity_refund');
      expect(triggered).toBeDefined();
    });

    it('should check repeat returns for known customer', async () => {
      service._checkRepeatReturns = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'pattern_repeat_return'),
        details: { return_count: 4 },
      });

      const result = await service.assessRefund(
        { total_refund_amount: 100, customer_id: 42 },
        1, 1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'pattern_repeat_return');
      expect(triggered).toBeDefined();
    });
  });

  // ============================================================================
  // VOID ASSESSMENT
  // ============================================================================

  describe('assessVoid', () => {
    it('should allow a normal void', async () => {
      service._checkVelocity = jest.fn().mockResolvedValue({ triggered: false });
      service._checkVoidCompleted = jest.fn().mockResolvedValue({ triggered: false });

      const result = await service.assessVoid(123, 1, 1);

      expect(result.riskScore).toBe(0);
      expect(result.action).toBe('allow');
    });

    it('should trigger velocity_void for excessive voids', async () => {
      service._checkVelocity = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'velocity_void'),
        details: { count: 8, window: '1h' },
      });
      service._checkVoidCompleted = jest.fn().mockResolvedValue({ triggered: false });

      const result = await service.assessVoid(123, 1, 1);

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'velocity_void');
      expect(triggered).toBeDefined();
    });

    it('should trigger pattern_void_complete for voiding completed transactions', async () => {
      service._checkVelocity = jest.fn().mockResolvedValue({ triggered: false });
      service._checkVoidCompleted = jest.fn().mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'pattern_void_complete'),
        details: { txn_status: 'completed', minutes_since_complete: 120 },
      });

      const result = await service.assessVoid(123, 1, 1);

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'pattern_void_complete');
      expect(triggered).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(25);
    });
  });

  // ============================================================================
  // DISCOUNT ASSESSMENT
  // ============================================================================

  describe('assessDiscount', () => {
    beforeEach(() => {
      service._checkDiscountMaxPattern = jest.fn().mockResolvedValue({ triggered: false });
      service._checkDiscountVoidPattern = jest.fn().mockResolvedValue({ triggered: false });
      service._checkDiscountRefundRatio = jest.fn().mockResolvedValue({ triggered: false });
    });

    it('should allow a normal discount', async () => {
      const result = await service.assessDiscount(
        { discount_pct: 10, discount_amount: 100, original_price: 1000 },
        1
      );

      expect(result.riskScore).toBe(0);
      expect(result.action).toBe('allow');
    });

    it('should trigger amount_high_discount for excessive percentage', async () => {
      const result = await service.assessDiscount(
        { discount_pct: 45, discount_amount: 450, original_price: 1000 },
        1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'amount_high_discount');
      expect(triggered).toBeDefined();
    });

    it('should trigger discount_max_pattern for tier maxing', async () => {
      service._checkDiscountMaxPattern.mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'discount_max_pattern'),
        details: { pattern: 'consistently maxing discount tier' },
      });

      const result = await service.assessDiscount(
        { discount_pct: 25 },
        1
      );

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'discount_max_pattern');
      expect(triggered).toBeDefined();
    });

    it('should trigger discount_void_pattern', async () => {
      service._checkDiscountVoidPattern.mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'discount_void_pattern'),
        details: { discount_then_void_count: 3 },
      });

      const result = await service.assessDiscount({ discount_pct: 20 }, 1);

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'discount_void_pattern');
      expect(triggered).toBeDefined();
    });

    it('should trigger discount_refund_ratio', async () => {
      service._checkDiscountRefundRatio.mockResolvedValue({
        triggered: true,
        rule: buildAllRules().find(r => r.rule_code === 'discount_refund_ratio'),
        details: { ratio: 0.6 },
      });

      const result = await service.assessDiscount({ discount_pct: 20 }, 1);

      const triggered = result.triggeredRules.find(r => r.rule.rule_code === 'discount_refund_ratio');
      expect(triggered).toBeDefined();
    });
  });

  // ============================================================================
  // ALERT CREATION
  // ============================================================================

  describe('createAlert', () => {
    beforeEach(() => {
      // Restore the real createAlert for this block
      service.createAlert = FraudDetectionService.prototype.createAlert.bind(service);
    });

    it('should insert alert into fraud_alerts table', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 200, risk_score: 25 }] }) // INSERT alert
        .mockResolvedValueOnce({ rows: [] }); // employee risk profile upsert

      const alert = await service.createAlert(
        {
          riskScore: 25,
          triggeredRules: [{
            triggered: true,
            rule: buildRule({ id: 1, rule_code: 'amount_high_txn', rule_name: 'High Amount', risk_points: 25 }),
            details: { amount: 6000 },
          }],
          action: 'alert',
          alertType: 'transaction',
          severity: 'medium',
        },
        { userId: 1, shiftId: 1, customerId: null, transactionId: 555 }
      );

      expect(alert.id).toBe(200);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO fraud_alerts');
    });

    it('should add to review queue when score >= 30', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 201, risk_score: 35 }] }) // INSERT alert
        .mockResolvedValueOnce({ rows: [] }) // review queue insert
        .mockResolvedValueOnce({ rows: [] }); // employee profile upsert

      await service.createAlert(
        {
          riskScore: 35,
          triggeredRules: [{
            triggered: true,
            rule: buildRule({ risk_points: 35 }),
            details: {},
          }],
          action: 'require_approval',
          alertType: 'transaction',
          severity: 'high',
        },
        { userId: 1, shiftId: 1 }
      );

      // Verify review queue insert was called
      const reviewCall = mockPool.query.mock.calls[1];
      expect(reviewCall[0]).toContain('fraud_review_queue');
    });

    it('should return null if no triggered rules', async () => {
      const result = await service.createAlert(
        { riskScore: 0, triggeredRules: [], action: 'allow', alertType: 'transaction', severity: 'low' },
        { userId: 1 }
      );

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // RISK SCORE CALCULATION
  // ============================================================================

  describe('_calculateRiskScore', () => {
    it('should sum risk_points from all triggered rules', () => {
      const rules = [
        { triggered: true, rule: { risk_points: 15 } },
        { triggered: true, rule: { risk_points: 20 } },
        { triggered: true, rule: { risk_points: 10 } },
      ];

      const score = service._calculateRiskScore(rules);
      expect(score).toBe(45);
    });

    it('should return 0 for no triggered rules', () => {
      expect(service._calculateRiskScore([])).toBe(0);
    });
  });

  // ============================================================================
  // ACTION DETERMINATION
  // ============================================================================

  describe('_determineAction', () => {
    it('should return allow for score 0', () => {
      expect(service._determineAction(0, [])).toBe('allow');
    });

    it('should return appropriate action for non-zero scores', () => {
      // The exact thresholds depend on implementation, but with triggered rules
      // we should get a non-allow action
      const action = service._determineAction(50, [
        { triggered: true, rule: { risk_points: 50, severity: 'critical' } },
      ]);
      expect(action).not.toBe('allow');
    });
  });
});
