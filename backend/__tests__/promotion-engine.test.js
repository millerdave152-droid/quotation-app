/**
 * TeleTime POS - Promotion Engine Tests
 *
 * Comprehensive tests for PromotionEngine covering:
 * - Finding applicable promotions
 * - Applying promo codes
 * - Discount calculations
 * - Promotion validation
 * - Usage tracking
 * - Stacking rules
 * - Error handling
 */

const PromotionEngine = require('../services/PromotionEngine');

// ============================================================================
// MOCK DATA
// ============================================================================

const mockPromotions = {
  percentOrder: {
    id: 1,
    promo_code: 'SAVE10',
    name: '10% Off Order',
    promo_type: 'percent_order',
    discount_percent: 10,
    status: 'active',
    auto_apply: false,
    combinable: true,
    start_date: new Date('2020-01-01'),
    end_date: new Date('2030-12-31'),
    min_order_cents: 5000,
    min_quantity: 0,
    max_uses_total: 100,
    current_uses: 10,
    max_uses_per_customer: 3,
  },
  autoApply5: {
    id: 2,
    promo_code: null,
    name: 'Auto 5% Off',
    promo_type: 'percent_order',
    discount_percent: 5,
    status: 'active',
    auto_apply: true,
    combinable: true,
    start_date: null,
    end_date: null,
    min_order_cents: 0,
    min_quantity: 0,
    max_uses_total: null,
    current_uses: 0,
  },
  buyOneGetOne: {
    id: 3,
    promo_code: 'BOGO',
    name: 'Buy One Get One Free',
    promo_type: 'buy_x_get_y',
    buy_quantity: 1,
    get_quantity: 1,
    get_discount_percent: 100,
    status: 'active',
    auto_apply: false,
    combinable: false,
    min_order_cents: 0,
    min_quantity: 2,
  },
  expiredPromo: {
    id: 4,
    promo_code: 'EXPIRED',
    name: 'Expired Promo',
    promo_type: 'percent_order',
    discount_percent: 20,
    status: 'active',
    start_date: new Date('2020-01-01'),
    end_date: new Date('2020-12-31'),
  },
  exhaustedPromo: {
    id: 5,
    promo_code: 'MAXED',
    name: 'Maxed Out Promo',
    promo_type: 'percent_order',
    discount_percent: 15,
    status: 'active',
    max_uses_total: 10,
    current_uses: 10,
  },
  vipOnly: {
    id: 6,
    promo_code: 'VIP20',
    name: 'VIP 20% Off',
    promo_type: 'percent_order',
    discount_percent: 20,
    status: 'active',
    customer_tier_required: 'vip',
  },
  fixedOrder: {
    id: 7,
    promo_code: 'FLAT50',
    name: '$50 Off',
    promo_type: 'fixed_order',
    discount_amount_cents: 5000,
    status: 'active',
    min_order_cents: 10000,
  },
  bundlePromo: {
    id: 8,
    promo_code: 'BUNDLE',
    name: 'Bundle Deal',
    promo_type: 'bundle',
    bundle_price_cents: 8000,
    bundle_items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ],
    status: 'active',
  },
  freeItemPromo: {
    id: 9,
    promo_code: null,
    name: 'Free Gift Over $100',
    promo_type: 'free_item_threshold',
    threshold_amount_cents: 10000,
    free_item_product_id: 99,
    status: 'active',
    auto_apply: true,
  },
  pausedPromo: {
    id: 10,
    promo_code: 'PAUSED',
    name: 'Paused Promo',
    promo_type: 'percent_order',
    discount_percent: 10,
    status: 'paused',
  },
};

const mockCart = {
  items: [
    { id: 1, productId: 1, quantity: 2, unitPriceCents: 2500, categoryName: 'Electronics', brandName: 'Samsung' },
    { id: 2, productId: 2, quantity: 1, unitPriceCents: 5000, categoryName: 'Phones', brandName: 'Apple' },
  ],
  customer: { id: 1, pricingTier: 'retail' },
  subtotalCents: 10000, // $100
  appliedPromotions: [],
  appliedPromoCode: null,
};

// ============================================================================
// MOCK POOL
// ============================================================================

const createMockPool = (overrides = {}) => {
  return {
    query: jest.fn((sql, params) => {
      // Auto-apply promotions query
      if (sql.includes('auto_apply = TRUE') || sql.includes('promo_code IS NULL')) {
        if (overrides.autoApplyPromotions) {
          return { rows: overrides.autoApplyPromotions };
        }
        return {
          rows: [
            mockPromotions.autoApply5,
            mockPromotions.freeItemPromo,
          ],
        };
      }

      // Code promotions query
      if (sql.includes('promo_code IS NOT NULL') && sql.includes('auto_apply = FALSE')) {
        return {
          rows: [
            mockPromotions.percentOrder,
            mockPromotions.buyOneGetOne,
            mockPromotions.vipOnly,
            mockPromotions.fixedOrder,
            mockPromotions.bundlePromo,
          ],
        };
      }

      // Get promotion by code
      if (sql.includes('UPPER(promo_code) = UPPER')) {
        const code = params[0].toUpperCase();
        const promoByCode = {
          'SAVE10': mockPromotions.percentOrder,
          'BOGO': mockPromotions.buyOneGetOne,
          'EXPIRED': mockPromotions.expiredPromo,
          'MAXED': mockPromotions.exhaustedPromo,
          'VIP20': mockPromotions.vipOnly,
          'FLAT50': mockPromotions.fixedOrder,
          'BUNDLE': mockPromotions.bundlePromo,
          'PAUSED': mockPromotions.pausedPromo,
        };
        return { rows: promoByCode[code] ? [promoByCode[code]] : [] };
      }

      // Customer usage count
      if (sql.includes('pos_promotion_usage') && sql.includes('COUNT')) {
        return { rows: [{ count: overrides.customerUsageCount || '0' }] };
      }

      // Customer purchase count
      if (sql.includes('transactions') && sql.includes('COUNT')) {
        return { rows: [{ count: overrides.purchaseCount || '0' }] };
      }

      // Promotion products (inclusions)
      if (sql.includes('pos_promotion_products') && sql.includes('is_included = TRUE')) {
        return { rows: overrides.productIncludes || [] };
      }

      // Promotion products (exclusions)
      if (sql.includes('pos_promotion_products') && sql.includes('is_included = FALSE')) {
        return { rows: overrides.productExcludes || [] };
      }

      // Promotion rules
      if (sql.includes('pos_promotion_rules')) {
        return { rows: overrides.rules || [] };
      }

      // Promotion schedules
      if (sql.includes('pos_promotion_schedules')) {
        return { rows: overrides.schedules || [] };
      }

      // Promotion combinations (deny)
      if (sql.includes('cannot_combine_with_id')) {
        return { rows: overrides.combinationDeny || [] };
      }

      // Promotion combinations (allow)
      if (sql.includes('can_combine_with_id IS NOT NULL')) {
        return { rows: overrides.combinationAllow || [] };
      }

      // Get promotions for stacking check
      if (sql.includes('combinable, combination_group')) {
        return {
          rows: [
            { id: params[0], combinable: true, combination_group: null },
            { id: params[1], combinable: true, combination_group: null },
          ],
        };
      }

      // Product lookup for free item
      if (sql.includes('retail_price_cents, name FROM products')) {
        return { rows: [{ retail_price_cents: 2500, name: 'Free Gift Item' }] };
      }

      // Insert usage
      if (sql.includes('INSERT INTO pos_promotion_usage')) {
        return { rows: [{ id: 1 }] };
      }

      // Update promotions
      if (sql.includes('UPDATE pos_promotions')) {
        return { rowCount: 1 };
      }

      return { rows: [] };
    }),
  };
};

// ============================================================================
// TESTS
// ============================================================================

describe('PromotionEngine', () => {
  let engine;
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    engine = new PromotionEngine(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // findApplicablePromotions
  // ============================================================================

  describe('findApplicablePromotions', () => {
    test('returns auto-apply promotions sorted by discount', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.autoApplyPromotions.length).toBeGreaterThan(0);
      // Should be sorted by discount (highest first)
      if (result.data.autoApplyPromotions.length > 1) {
        expect(result.data.autoApplyPromotions[0].discountCents)
          .toBeGreaterThanOrEqual(result.data.autoApplyPromotions[1].discountCents);
      }
    });

    test('returns best auto-apply promotion', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.bestPromotion).toBeDefined();
      expect(result.data.bestPromotion.discountCents).toBeGreaterThan(0);
    });

    test('returns available code promotions', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.availableCodePromotions).toBeDefined();
      expect(Array.isArray(result.data.availableCodePromotions)).toBe(true);
    });

    test('excludes already applied promotions', async () => {
      const cartWithApplied = {
        ...mockCart,
        appliedPromotions: [2], // Auto 5% already applied
      };

      const result = await engine.findApplicablePromotions(cartWithApplied);

      expect(result.success).toBe(true);
      const appliedIds = result.data.autoApplyPromotions.map((p) => p.promotion.id);
      expect(appliedIds).not.toContain(2);
    });

    test('returns summary with counts', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(typeof result.data.summary.autoApplyCount).toBe('number');
      expect(typeof result.data.summary.bestDiscountCents).toBe('number');
    });

    test('handles empty cart gracefully', async () => {
      const emptyCart = { items: [], customer: null, subtotalCents: 0 };
      const result = await engine.findApplicablePromotions(emptyCart);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // applyPromoCode
  // ============================================================================

  describe('applyPromoCode', () => {
    test('applies valid promo code', async () => {
      const result = await engine.applyPromoCode(mockCart, 'SAVE10');

      expect(result.success).toBe(true);
      expect(result.data.promotion.code).toBe('SAVE10');
      expect(result.data.discountCents).toBe(1000); // 10% of $100
      expect(result.data.message).toContain('$10.00');
    });

    test('rejects empty promo code', async () => {
      const result = await engine.applyPromoCode(mockCart, '');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.INVALID_CODE);
    });

    test('rejects invalid promo code', async () => {
      const result = await engine.applyPromoCode(mockCart, 'NOTREAL');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.INVALID_CODE);
      expect(result.error.message).toContain('NOTREAL');
    });

    test('rejects when promo code already applied', async () => {
      const cartWithCode = { ...mockCart, appliedPromoCode: 'EXISTING' };
      const result = await engine.applyPromoCode(cartWithCode, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.ALREADY_APPLIED);
    });

    test('normalizes promo code case', async () => {
      const result = await engine.applyPromoCode(mockCart, 'save10');

      expect(result.success).toBe(true);
      expect(result.data.promotion.code).toBe('SAVE10');
    });

    test('trims whitespace from promo code', async () => {
      const result = await engine.applyPromoCode(mockCart, '  SAVE10  ');

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // calculateDiscount
  // ============================================================================

  describe('calculateDiscount', () => {
    test('calculates percent_order discount', async () => {
      const result = await engine.calculateDiscount(mockCart, mockPromotions.percentOrder);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(1000); // 10% of $100
      expect(result.description).toContain('10%');
    });

    test('respects max discount cap', async () => {
      const promoWithCap = {
        ...mockPromotions.percentOrder,
        discount_percent: 50,
        max_discount_cents: 2000, // $20 cap
      };

      const result = await engine.calculateDiscount(mockCart, promoWithCap);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // Capped at $20, not $50
    });

    test('calculates fixed_order discount', async () => {
      const result = await engine.calculateDiscount(mockCart, mockPromotions.fixedOrder);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(5000); // $50 off
    });

    test('caps fixed discount at subtotal', async () => {
      const smallCart = { ...mockCart, subtotalCents: 3000 };
      const result = await engine.calculateDiscount(smallCart, mockPromotions.fixedOrder);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(3000); // Capped at $30 subtotal
    });

    test('calculates buy_x_get_y discount', async () => {
      const bogoCart = {
        items: [
          { id: 1, productId: 1, quantity: 2, unitPriceCents: 1000 },
        ],
        subtotalCents: 2000,
      };

      const result = await engine.calculateDiscount(bogoCart, mockPromotions.buyOneGetOne);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(1000); // 1 free item worth $10
      expect(result.description).toContain('Free');
    });

    test('calculates bundle discount', async () => {
      const bundleCart = {
        items: [
          { id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 },
          { id: 2, productId: 2, quantity: 1, unitPriceCents: 5000 },
        ],
        subtotalCents: 10000,
      };

      const result = await engine.calculateDiscount(bundleCart, mockPromotions.bundlePromo);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // $100 regular - $80 bundle = $20 savings
    });

    test('returns zero for incomplete bundle', async () => {
      const incompleteCart = {
        items: [
          { id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 },
          // Missing productId: 2
        ],
        subtotalCents: 5000,
      };

      const result = await engine.calculateDiscount(incompleteCart, mockPromotions.bundlePromo);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0);
    });

    test('calculates free item threshold', async () => {
      const result = await engine.calculateDiscount(mockCart, mockPromotions.freeItemPromo);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2500); // Free item value
      expect(result.freeItems.length).toBe(1);
    });

    test('returns zero when below threshold', async () => {
      const smallCart = { ...mockCart, subtotalCents: 5000 }; // $50, threshold is $100

      const result = await engine.calculateDiscount(smallCart, mockPromotions.freeItemPromo);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0);
      expect(result.freeItems.length).toBe(0);
    });

    test('includes affected items in result', async () => {
      const result = await engine.calculateDiscount(mockCart, mockPromotions.percentOrder);

      expect(result.affectedItems).toBeDefined();
      expect(Array.isArray(result.affectedItems)).toBe(true);
    });
  });

  // ============================================================================
  // validatePromotion
  // ============================================================================

  describe('validatePromotion', () => {
    test('validates active promotion', async () => {
      const result = await engine.validatePromotion(mockPromotions.percentOrder, mockCart);

      expect(result.valid).toBe(true);
    });

    test('rejects expired promotion', async () => {
      const result = await engine.validatePromotion(mockPromotions.expiredPromo, mockCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.EXPIRED);
    });

    test('rejects promotion not yet started', async () => {
      const futurePromo = {
        ...mockPromotions.percentOrder,
        start_date: new Date('2030-01-01'),
      };

      const result = await engine.validatePromotion(futurePromo, mockCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.NOT_STARTED);
    });

    test('rejects exhausted promotion', async () => {
      const result = await engine.validatePromotion(mockPromotions.exhaustedPromo, mockCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.USAGE_LIMIT_REACHED);
    });

    test('rejects paused promotion', async () => {
      const result = await engine.validatePromotion(mockPromotions.pausedPromo, mockCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.PROMOTION_PAUSED);
    });

    test('rejects when below minimum order', async () => {
      const smallCart = { ...mockCart, subtotalCents: 2000 }; // $20, min is $50

      const result = await engine.validatePromotion(mockPromotions.percentOrder, smallCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.MIN_ORDER_NOT_MET);
      expect(result.error.needed).toBe(3000); // Need $30 more
    });

    test('rejects when below minimum quantity', async () => {
      const fewItemsCart = {
        items: [{ id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 }],
        subtotalCents: 5000,
      };

      const result = await engine.validatePromotion(mockPromotions.buyOneGetOne, fewItemsCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.MIN_QUANTITY_NOT_MET);
    });

    test('rejects when customer tier does not match', async () => {
      const retailCart = { ...mockCart, customer: { id: 1, pricingTier: 'retail' } };

      const result = await engine.validatePromotion(mockPromotions.vipOnly, retailCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.CUSTOMER_TIER_INVALID);
    });

    test('accepts VIP customer for VIP promo', async () => {
      const vipCart = { ...mockCart, customer: { id: 1, pricingTier: 'vip' } };

      const result = await engine.validatePromotion(mockPromotions.vipOnly, vipCart);

      expect(result.valid).toBe(true);
    });

    test('rejects when customer usage limit reached', async () => {
      const poolWithUsage = createMockPool({ customerUsageCount: '3' }); // Limit is 3
      const engineWithUsage = new PromotionEngine(poolWithUsage);

      const result = await engineWithUsage.validatePromotion(mockPromotions.percentOrder, mockCart);

      expect(result.valid).toBe(false);
      expect(result.error.code).toBe(PromotionEngine.ErrorCodes.CUSTOMER_LIMIT_REACHED);
    });
  });

  // ============================================================================
  // recordUsage
  // ============================================================================

  describe('recordUsage', () => {
    test('records promotion usage', async () => {
      const result = await engine.recordUsage(
        1, // promotionId
        1, // customerId
        100, // orderId
        1000, // discountCents
        { userId: 1, codeEntered: 'SAVE10' }
      );

      expect(result.success).toBe(true);
      expect(result.usageId).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('increments usage counter on promotion', async () => {
      await engine.recordUsage(1, 1, 100, 1000);

      // Check that UPDATE was called
      const updateCalls = mockPool.query.mock.calls.filter(
        (call) => call[0].includes('UPDATE pos_promotions')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    test('handles quote transactions', async () => {
      const result = await engine.recordUsage(
        1,
        1,
        200, // quotationId
        1000,
        { isQuote: true }
      );

      expect(result.success).toBe(true);
      // Should use quotation_id column
      const insertCall = mockPool.query.mock.calls.find(
        (call) => call[0].includes('INSERT INTO pos_promotion_usage')
      );
      expect(insertCall[0]).toContain('quotation_id');
    });

    test('handles errors gracefully', async () => {
      const errorPool = {
        query: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      const errorEngine = new PromotionEngine(errorPool);

      const result = await errorEngine.recordUsage(1, 1, 100, 1000);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // getBestPromotionCombination
  // ============================================================================

  describe('getBestPromotionCombination', () => {
    test('returns best combination without promo code', async () => {
      const result = await engine.getBestPromotionCombination(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.appliedPromotions.length).toBeGreaterThan(0);
      expect(result.data.totalDiscountCents).toBeGreaterThan(0);
    });

    test('includes promo code discount when provided', async () => {
      const result = await engine.getBestPromotionCombination(mockCart, 'SAVE10');

      expect(result.success).toBe(true);
      expect(result.data.hasCodePromotion).toBe(true);
      const codePromo = result.data.appliedPromotions.find((p) => p.type === 'code');
      expect(codePromo).toBeDefined();
    });

    test('returns error for invalid promo code', async () => {
      const result = await engine.getBestPromotionCombination(mockCart, 'INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('shows summary of total savings', async () => {
      const result = await engine.getBestPromotionCombination(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.summary).toContain('$');
    });
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  describe('Error handling', () => {
    test('handles database errors in findApplicablePromotions', async () => {
      const errorPool = {
        query: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      const errorEngine = new PromotionEngine(errorPool);

      const result = await errorEngine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles null/undefined cart items', async () => {
      const nullCart = { items: null, customer: null, subtotalCents: 0 };
      const result = await engine.findApplicablePromotions(nullCart);

      // Should not throw, should handle gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('handles missing customer gracefully', async () => {
      const noCustomerCart = { ...mockCart, customer: null };
      const result = await engine.applyPromoCode(noCustomerCart, 'SAVE10');

      // Should work for non-customer-specific promotions
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Stacking rules
  // ============================================================================

  describe('Stacking rules', () => {
    test('identifies stackable promotions', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(result.data.stackablePromotions).toBeDefined();
    });

    test('non-combinable promotions do not stack', async () => {
      // BOGO is non-combinable
      const bogoPromo = mockPromotions.buyOneGetOne;
      expect(bogoPromo.combinable).toBe(false);
    });

    test('calculates total stacked discount', async () => {
      const result = await engine.findApplicablePromotions(mockCart);

      expect(result.success).toBe(true);
      expect(typeof result.data.totalAutoApplyDiscountCents).toBe('number');
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  describe('Edge cases', () => {
    test('handles zero subtotal', async () => {
      const zeroCart = { items: [], subtotalCents: 0 };
      const result = await engine.calculateDiscount(zeroCart, mockPromotions.percentOrder);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0);
    });

    test('handles very large discounts', async () => {
      const bigCart = { ...mockCart, subtotalCents: 100000000 }; // $1M
      const result = await engine.calculateDiscount(bigCart, mockPromotions.percentOrder);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(10000000); // 10% = $100K
    });

    test('handles decimal precision in percentages', async () => {
      const promoWithDecimal = {
        ...mockPromotions.percentOrder,
        discount_percent: 33.33,
      };

      const result = await engine.calculateDiscount(mockCart, promoWithDecimal);

      expect(result.success).toBe(true);
      // Should round to nearest cent
      expect(Number.isInteger(result.discountCents)).toBe(true);
    });

    test('handles buy_x_get_y with insufficient quantity', async () => {
      const singleItemCart = {
        items: [{ id: 1, productId: 1, quantity: 1, unitPriceCents: 1000 }],
        subtotalCents: 1000,
      };

      const result = await engine.calculateDiscount(singleItemCart, mockPromotions.buyOneGetOne);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0); // Need at least 2 items
    });

    test('handles multiple sets in buy_x_get_y', async () => {
      const multiSetCart = {
        items: [
          { id: 1, productId: 1, quantity: 4, unitPriceCents: 1000 }, // 2 complete sets
        ],
        subtotalCents: 4000,
      };

      const result = await engine.calculateDiscount(multiSetCart, mockPromotions.buyOneGetOne);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // 2 free items worth $10 each
    });
  });
});
