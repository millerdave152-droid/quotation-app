/**
 * TeleTime POS - Promotions Service Tests
 *
 * Tests for POSPromotionService covering:
 * - Promotion CRUD
 * - Promo code validation
 * - Discount calculations
 * - Usage tracking
 * - All promotion types
 */

const POSPromotionService = require('../services/POSPromotionService');

// Mock pool for testing
const createMockPool = () => {
  const queryResults = new Map();
  let queryCallCount = 0;

  return {
    query: jest.fn((sql, params) => {
      queryCallCount++;

      // Return predefined results based on query pattern
      if (sql.includes('INSERT INTO pos_promotions')) {
        return {
          rows: [{
            id: 1,
            promo_code: params[0],
            name: params[1],
            promo_type: params[4],
            discount_percent: params[5],
            discount_amount_cents: params[6],
            status: 'active',
            auto_apply: params[25],
            start_date: new Date(),
            end_date: null,
            current_uses: 0,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      }

      if (sql.includes('SELECT p.*') && sql.includes('FROM pos_promotions p')) {
        if (sql.includes('WHERE p.id =')) {
          return {
            rows: [{
              id: params[0],
              promo_code: 'SAVE10',
              name: '10% Off',
              promo_type: 'percent_order',
              discount_percent: 10,
              status: 'active',
              auto_apply: false,
              min_order_cents: 0,
              min_quantity: 0,
              products: null,
              rules: null,
            }],
          };
        }
        if (sql.includes('UPPER(p.promo_code)')) {
          const code = params[0].toUpperCase();
          if (code === 'SAVE10' || code === 'VALID') {
            return {
              rows: [{
                id: 1,
                promo_code: code,
                name: '10% Off',
                promo_type: 'percent_order',
                discount_percent: 10,
                status: 'active',
                auto_apply: false,
                min_order_cents: 5000, // $50 minimum
                min_quantity: 0,
                customer_tier_required: null,
                customer_tiers_allowed: null,
                products: null,
                rules: null,
              }],
            };
          }
          return { rows: [] };
        }
      }

      // is_promotion_valid function
      if (sql.includes('is_promotion_valid')) {
        return { rows: [{ valid: true }] };
      }

      // can_customer_use_promotion function
      if (sql.includes('can_customer_use_promotion')) {
        return { rows: [{ can_use: true, reason: null }] };
      }

      // get_applicable_promotions function
      if (sql.includes('get_applicable_promotions')) {
        return {
          rows: [
            {
              promotion_id: 1,
              promo_code: null,
              name: 'Auto 5% Off',
              promo_type: 'percent_order',
              discount_preview_cents: 500,
              requires_code: false,
              priority: 10,
            },
            {
              promotion_id: 2,
              promo_code: 'BOGO',
              name: 'Buy One Get One',
              promo_type: 'buy_x_get_y',
              discount_preview_cents: 1000,
              requires_code: true,
              priority: 5,
            },
          ],
        };
      }

      // apply_promotion function
      if (sql.includes('apply_promotion')) {
        return { rows: [{ success: true, usage_id: 1, error_message: null }] };
      }

      // void_promotion_usage function
      if (sql.includes('void_promotion_usage')) {
        return { rows: [{ success: true }] };
      }

      // get_customer_promo_usage_count function
      if (sql.includes('get_customer_promo_usage_count')) {
        return { rows: [{ count: 2 }] };
      }

      // pos_promotion_products queries
      if (sql.includes('pos_promotion_products') && sql.includes('SELECT')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO pos_promotion_products')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO pos_promotion_rules')) {
        return { rows: [] };
      }

      if (sql.includes('DELETE FROM pos_promotion')) {
        return { rowCount: 1 };
      }

      if (sql.includes('UPDATE pos_promotions')) {
        return {
          rows: [{
            id: params[0],
            promo_code: 'SAVE10',
            name: 'Updated Name',
            status: 'active',
            promo_type: 'percent_order',
          }],
        };
      }

      // v_promotion_usage_summary view
      if (sql.includes('v_promotion_usage_summary')) {
        return {
          rows: [{
            promotion_id: params[0],
            name: '10% Off',
            promo_code: 'SAVE10',
            promo_type: 'percent_order',
            status: 'active',
            current_uses: 15,
            max_uses_total: 100,
            total_discount_cents: 75000,
            unique_customers: 12,
            transaction_count: 15,
            first_used: new Date('2024-01-01'),
            last_used: new Date('2024-01-15'),
          }],
        };
      }

      // v_active_promotions view
      if (sql.includes('v_active_promotions')) {
        return {
          rows: [
            { id: 1, name: 'Auto 5%', promo_type: 'percent_order', status: 'active' },
            { id: 2, name: 'BOGO', promo_type: 'buy_x_get_y', status: 'active' },
          ],
        };
      }

      // pos_promotion_usage queries
      if (sql.includes('pos_promotion_usage') && sql.includes('SELECT')) {
        return {
          rows: [
            {
              id: 1,
              promotion_id: 1,
              transaction_id: 100,
              customer_id: 5,
              customer_name: 'John Doe',
              user_id: 1,
              user_name: 'Admin',
              discount_applied_cents: 1000,
              items_affected: null,
              status: 'applied',
              applied_at: new Date(),
            },
          ],
        };
      }

      // Default list query
      if (sql.includes('FROM pos_promotions p') && sql.includes('ORDER BY')) {
        return {
          rows: [
            {
              id: 1,
              promo_code: 'SAVE10',
              name: '10% Off',
              promo_type: 'percent_order',
              status: 'active',
              uses_remaining: 85,
              total_redemptions: 15,
            },
            {
              id: 2,
              promo_code: null,
              name: 'Auto 5%',
              promo_type: 'percent_order',
              status: 'active',
              uses_remaining: 999999,
              total_redemptions: 50,
            },
          ],
        };
      }

      // Product price lookup
      if (sql.includes('retail_price_cents FROM products')) {
        return { rows: [{ retail_price_cents: 2500 }] };
      }

      return { rows: [], rowCount: 0 };
    }),
    getQueryCount: () => queryCallCount,
    resetQueryCount: () => { queryCallCount = 0; },
  };
};

describe('POSPromotionService', () => {
  let service;
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    service = new POSPromotionService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // PROMOTION CRUD
  // ============================================================================

  describe('CRUD Operations', () => {
    test('createPromotion - creates percent order promotion', async () => {
      const data = {
        promoCode: 'SAVE10',
        name: '10% Off Order',
        promoType: 'percent_order',
        discountPercent: 10,
        autoApply: false,
      };

      const result = await service.createPromotion(data);

      expect(result).toBeDefined();
      expect(result.promoCode).toBe('SAVE10');
      expect(result.promoType).toBe('percent_order');
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('createPromotion - creates fixed amount promotion', async () => {
      const data = {
        promoCode: 'FLAT50',
        name: '$50 Off',
        promoType: 'fixed_order',
        discountAmountCents: 5000,
        minOrderCents: 10000,
      };

      const result = await service.createPromotion(data);

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('createPromotion - creates buy X get Y promotion', async () => {
      const data = {
        name: 'Buy 2 Get 1 Free',
        promoType: 'buy_x_get_y',
        buyQuantity: 2,
        getQuantity: 1,
        getDiscountPercent: 100,
        autoApply: true,
      };

      const result = await service.createPromotion(data);

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('getPromotionById - returns promotion with products and rules', async () => {
      const result = await service.getPromotionById(1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.promoCode).toBe('SAVE10');
    });

    test('getPromotionByCode - returns promotion by code', async () => {
      const result = await service.getPromotionByCode('SAVE10');

      expect(result).toBeDefined();
      expect(result.promoCode).toBe('SAVE10');
    });

    test('getPromotionByCode - returns null for invalid code', async () => {
      const result = await service.getPromotionByCode('INVALID');

      expect(result).toBeNull();
    });

    test('listPromotions - returns filtered list', async () => {
      const result = await service.listPromotions({
        status: 'active',
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('updatePromotion - updates allowed fields', async () => {
      const result = await service.updatePromotion(1, {
        name: 'Updated Name',
        discountPercent: 15,
      });

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('deletePromotion - deletes promotion', async () => {
      const result = await service.deletePromotion(1);

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // PROMO CODE VALIDATION
  // ============================================================================

  describe('Promo Code Validation', () => {
    test('validatePromoCode - valid code returns promotion', async () => {
      const result = await service.validatePromoCode('VALID', 1, 10000);

      expect(result.valid).toBe(true);
      expect(result.promotion).toBeDefined();
    });

    test('validatePromoCode - invalid code returns error', async () => {
      const result = await service.validatePromoCode('NOTEXIST', null, 0);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid promo code');
    });

    test('validatePromoCode - below minimum order returns error', async () => {
      const result = await service.validatePromoCode('SAVE10', null, 1000); // $10, min is $50

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum order');
    });
  });

  // ============================================================================
  // APPLICABLE PROMOTIONS
  // ============================================================================

  describe('Get Applicable Promotions', () => {
    test('getApplicablePromotions - returns matching promotions', async () => {
      const cart = {
        customerId: 1,
        items: [
          { productId: 1, quantity: 2, unitPriceCents: 2500 },
          { productId: 2, quantity: 1, unitPriceCents: 5000 },
        ],
        subtotalCents: 10000,
      };

      const result = await service.getApplicablePromotions(cart);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].discountPreviewCents).toBeGreaterThan(0);
    });

    test('getApplicablePromotions - includes code-required promotions', async () => {
      const cart = {
        customerId: 1,
        items: [{ productId: 1, quantity: 1, unitPriceCents: 5000 }],
        subtotalCents: 5000,
      };

      const result = await service.getApplicablePromotions(cart);

      const codeRequired = result.find((p) => p.requiresCode);
      expect(codeRequired).toBeDefined();
    });
  });

  // ============================================================================
  // DISCOUNT CALCULATIONS
  // ============================================================================

  describe('Discount Calculations', () => {
    test('calculateDiscount - percent_order type', async () => {
      const cart = {
        items: [
          { id: 1, productId: 1, quantity: 2, unitPriceCents: 2500 },
          { id: 2, productId: 2, quantity: 1, unitPriceCents: 5000 },
        ],
        subtotalCents: 10000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(1000); // 10% of 10000
      expect(result.description).toContain('10%');
    });

    test('calculateDiscount - respects max discount cap', async () => {
      // Override the getPromotionById to return a promotion with maxDiscountCents
      const originalGetById = service.getPromotionById.bind(service);
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'percent_order',
        discountPercent: 50,
        maxDiscountCents: 2000, // $20 cap
      });

      const cart = {
        items: [{ id: 1, productId: 1, quantity: 1, unitPriceCents: 10000 }],
        subtotalCents: 10000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // Capped at $20

      service.getPromotionById = originalGetById;
    });

    test('calculateDiscount - buy_x_get_y type', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'buy_x_get_y',
        buyQuantity: 2,
        getQuantity: 1,
        getDiscountPercent: 100, // Free
      });

      const cart = {
        items: [
          { id: 1, productId: 1, quantity: 3, unitPriceCents: 1000 }, // Buy 2 get 1 free
        ],
        subtotalCents: 3000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(1000); // 1 free item worth $10
    });

    test('calculateDiscount - bundle type', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'bundle',
        bundlePriceCents: 8000, // Bundle for $80
        bundleItems: [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 1 },
        ],
      });

      const cart = {
        items: [
          { id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 },
          { id: 2, productId: 2, quantity: 1, unitPriceCents: 5000 },
        ],
        subtotalCents: 10000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // Save $20 with bundle
    });

    test('calculateDiscount - free_item_threshold type', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'free_item_threshold',
        thresholdAmountCents: 5000, // Spend $50
        freeItemProductId: 99,
        freeItemValueCents: null,
      });

      const cart = {
        items: [{ id: 1, productId: 1, quantity: 2, unitPriceCents: 3000 }],
        subtotalCents: 6000, // $60, over threshold
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.freeItems.length).toBe(1);
      expect(result.freeItems[0].productId).toBe(99);
    });

    test('calculateDiscount - returns error for non-existent promotion', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue(null);

      const result = await service.calculateDiscount(999, { items: [], subtotalCents: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Promotion not found');
    });
  });

  // ============================================================================
  // USAGE TRACKING
  // ============================================================================

  describe('Usage Tracking', () => {
    test('applyPromotion - records usage', async () => {
      const result = await service.applyPromotion({
        promotionId: 1,
        transactionId: 100,
        customerId: 5,
        userId: 1,
        discountCents: 1000,
        codeEntered: 'SAVE10',
      });

      expect(result.success).toBe(true);
      expect(result.usageId).toBe(1);
    });

    test('voidPromotionUsage - voids usage record', async () => {
      const result = await service.voidPromotionUsage(1, 1, 'Customer request');

      expect(result).toBe(true);
    });

    test('getPromotionUsage - returns usage history', async () => {
      const result = await service.getPromotionUsage(1, { limit: 10 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].discountAppliedCents).toBeDefined();
    });

    test('getCustomerUsageCount - returns customer usage count', async () => {
      const result = await service.getCustomerUsageCount(1, 5);

      expect(result).toBe(2);
    });
  });

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  describe('Analytics', () => {
    test('getPromotionPerformance - returns metrics', async () => {
      const result = await service.getPromotionPerformance(1);

      expect(result).toBeDefined();
      expect(result.currentUses).toBe(15);
      expect(result.totalDiscountCents).toBe(75000);
      expect(result.uniqueCustomers).toBe(12);
      expect(result.averageDiscountCents).toBe(5000); // 75000 / 15
    });

    test('getActivePromotionsSummary - returns active promotions', async () => {
      const result = await service.getActivePromotionsSummary();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  // ============================================================================
  // PROMOTION PRODUCTS & RULES
  // ============================================================================

  describe('Products and Rules', () => {
    test('addPromotionProducts - adds product targets', async () => {
      const products = [
        { targetType: 'product', productId: 1, isIncluded: true },
        { targetType: 'category', categoryName: 'Electronics', isIncluded: true },
        { targetType: 'brand', brandName: 'Samsung', isIncluded: false },
      ];

      await service.addPromotionProducts(1, products);

      expect(mockPool.query).toHaveBeenCalled();
    });

    test('addPromotionRules - adds rules', async () => {
      const rules = [
        { ruleType: 'min_order_amount', valueInt: 5000, description: 'Min $50' },
        { ruleType: 'customer_tier', valueText: 'vip', description: 'VIP only' },
      ];

      await service.addPromotionRules(1, rules);

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    test('replacePromotionProducts - clears and adds new products', async () => {
      const products = [
        { targetType: 'category', categoryName: 'Phones', isIncluded: true },
      ];

      await service.replacePromotionProducts(1, products);

      // Should call delete then insert
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    test('calculateDiscount - empty cart returns zero', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'percent_order',
        discountPercent: 10,
      });

      const cart = {
        items: [],
        subtotalCents: 0,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0);
    });

    test('calculateDiscount - fixed amount capped at subtotal', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'fixed_order',
        discountAmountCents: 5000, // $50 off
      });

      const cart = {
        items: [{ id: 1, productId: 1, quantity: 1, unitPriceCents: 2000 }],
        subtotalCents: 2000, // Only $20 order
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(2000); // Capped at subtotal
    });

    test('buy_x_get_y - not enough items', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'buy_x_get_y',
        buyQuantity: 3,
        getQuantity: 1,
        getDiscountPercent: 100,
      });

      const cart = {
        items: [{ id: 1, productId: 1, quantity: 2, unitPriceCents: 1000 }], // Only 2 items
        subtotalCents: 2000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0); // Not enough for promotion
    });

    test('bundle - incomplete bundle gets no discount', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'bundle',
        bundlePriceCents: 8000,
        bundleItems: [
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 1 },
        ],
      });

      const cart = {
        items: [
          { id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 },
          // Missing productId: 2
        ],
        subtotalCents: 5000,
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0); // Bundle incomplete
    });

    test('free_item_threshold - below threshold gets nothing', async () => {
      service.getPromotionById = jest.fn().mockResolvedValue({
        id: 1,
        promoType: 'free_item_threshold',
        thresholdAmountCents: 10000, // $100 minimum
        freeItemValueCents: 2500,
      });

      const cart = {
        items: [{ id: 1, productId: 1, quantity: 1, unitPriceCents: 5000 }],
        subtotalCents: 5000, // Only $50
      };

      const result = await service.calculateDiscount(1, cart);

      expect(result.success).toBe(true);
      expect(result.discountCents).toBe(0);
      expect(result.freeItems.length).toBe(0);
    });
  });
});
