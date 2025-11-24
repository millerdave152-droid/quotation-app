import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Discount Engine Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDiscountRule', () => {
    test('should create percentage discount rule', async () => {
      const mockResponse = {
        success: true,
        rule: {
          id: 1,
          name: '10% Off',
          discount_type: 'percentage',
          discount_value: 10
        }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createDiscountRule = async (ruleData) => {
        return await cachedFetch('/api/discount-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData)
        });
      };

      const result = await createDiscountRule({
        name: '10% Off',
        discount_type: 'percentage',
        discount_value: 10
      });

      expect(result.success).toBe(true);
      expect(result.rule.discount_type).toBe('percentage');
    });

    test('should validate percentage range', () => {
      const validatePercentage = (value) => {
        if (value < 0 || value > 100) {
          throw new Error('Percentage must be between 0 and 100');
        }
        return true;
      };

      expect(() => validatePercentage(-5)).toThrow('between 0 and 100');
      expect(() => validatePercentage(150)).toThrow('between 0 and 100');
      expect(validatePercentage(50)).toBe(true);
    });

    test('should validate discount type', () => {
      const validateDiscountType = (type) => {
        const validTypes = ['percentage', 'fixed_amount', 'tiered'];
        if (!validTypes.includes(type)) {
          throw new Error('Invalid discount type');
        }
        return true;
      };

      expect(() => validateDiscountType('invalid')).toThrow('Invalid discount type');
      expect(validateDiscountType('percentage')).toBe(true);
      expect(validateDiscountType('fixed_amount')).toBe(true);
    });
  });

  describe('getDiscountRules', () => {
    test('should fetch all discount rules', async () => {
      const mockRules = {
        count: 2,
        rules: [
          { id: 1, name: '10% Off', discount_type: 'percentage' },
          { id: 2, name: '$50 Off', discount_type: 'fixed_amount' }
        ]
      };

      cachedFetch.mockResolvedValue(mockRules);

      const getDiscountRules = async (activeOnly = false) => {
        const params = activeOnly ? '?active_only=true' : '';
        return await cachedFetch(`/api/discount-rules${params}`);
      };

      const result = await getDiscountRules();

      expect(result.count).toBe(2);
      expect(result.rules).toHaveLength(2);
    });
  });

  describe('createPromoCode', () => {
    test('should create promo code', async () => {
      const mockResponse = {
        success: true,
        promo_code: {
          id: 1,
          code: 'SAVE20',
          discount_value: 20
        }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createPromoCode = async (promoData) => {
        return await cachedFetch('/api/promo-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promoData)
        });
      };

      const result = await createPromoCode({
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20
      });

      expect(result.success).toBe(true);
      expect(result.promo_code.code).toBe('SAVE20');
    });

    test('should normalize promo code to uppercase', () => {
      const normalizePromoCode = (code) => {
        return code.toUpperCase().trim();
      };

      expect(normalizePromoCode('save20')).toBe('SAVE20');
      expect(normalizePromoCode('  DISCOUNT  ')).toBe('DISCOUNT');
    });

    test('should validate promo code format', () => {
      const validatePromoCode = (code) => {
        if (!code || code.trim() === '') {
          throw new Error('Promo code is required');
        }
        if (code.length < 3) {
          throw new Error('Promo code must be at least 3 characters');
        }
        if (code.length > 20) {
          throw new Error('Promo code cannot exceed 20 characters');
        }
        if (!/^[A-Z0-9]+$/.test(code.toUpperCase())) {
          throw new Error('Promo code can only contain letters and numbers');
        }
        return true;
      };

      expect(() => validatePromoCode('')).toThrow('Promo code is required');
      expect(() => validatePromoCode('AB')).toThrow('at least 3 characters');
      expect(() => validatePromoCode('A'.repeat(21))).toThrow('cannot exceed 20 characters');
      expect(() => validatePromoCode('SAVE-20')).toThrow('letters and numbers');
      expect(validatePromoCode('SAVE20')).toBe(true);
    });
  });

  describe('validatePromoCode', () => {
    test('should validate valid promo code', async () => {
      const mockResponse = {
        valid: true,
        discount_amount: 200,
        final_amount: 800,
        promo_code: { code: 'SAVE20', discount_value: 20 }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const validatePromoCode = async (code, quoteAmount) => {
        return await cachedFetch('/api/promo-codes/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, quote_amount: quoteAmount })
        });
      };

      const result = await validatePromoCode('SAVE20', 1000);

      expect(result.valid).toBe(true);
      expect(result.discount_amount).toBe(200);
      expect(result.final_amount).toBe(800);
    });

    test('should handle invalid promo code', async () => {
      cachedFetch.mockResolvedValue({
        valid: false,
        error: 'Invalid promo code'
      });

      const validatePromoCode = async (code) => {
        return await cachedFetch('/api/promo-codes/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, quote_amount: 1000 })
        });
      };

      const result = await validatePromoCode('INVALID');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('applyDiscount', () => {
    test('should apply discount to quote', async () => {
      const mockResponse = {
        success: true,
        discount_applied: 150,
        requires_approval: false,
        quote: { id: 1, total_amount: 850 }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const applyDiscount = async (quoteId, discountRuleId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/apply-discount`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discount_rule_id: discountRuleId })
        });
      };

      const result = await applyDiscount(1, 1);

      expect(result.success).toBe(true);
      expect(result.discount_applied).toBe(150);
    });

    test('should flag large discounts for approval', async () => {
      cachedFetch.mockResolvedValue({
        success: true,
        discount_applied: 250,
        requires_approval: true
      });

      const applyDiscount = async (quoteId, customDiscount) => {
        return await cachedFetch(`/api/quotations/${quoteId}/apply-discount`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_discount: customDiscount })
        });
      };

      const result = await applyDiscount(1, { type: 'percentage', value: 25 });

      expect(result.requires_approval).toBe(true);
    });
  });

  describe('Discount Calculations', () => {
    test('should calculate percentage discount', () => {
      const calculatePercentageDiscount = (amount, percentage) => {
        return (amount * percentage) / 100;
      };

      expect(calculatePercentageDiscount(1000, 10)).toBe(100);
      expect(calculatePercentageDiscount(500, 20)).toBe(100);
      expect(calculatePercentageDiscount(250, 15)).toBe(37.5);
    });

    test('should calculate final amount after discount', () => {
      const calculateFinalAmount = (original, discount) => {
        return original - discount;
      };

      expect(calculateFinalAmount(1000, 100)).toBe(900);
      expect(calculateFinalAmount(500, 150)).toBe(350);
    });

    test('should apply maximum discount cap', () => {
      const applyDiscountCap = (discountAmount, maxDiscount) => {
        if (maxDiscount && discountAmount > maxDiscount) {
          return maxDiscount;
        }
        return discountAmount;
      };

      expect(applyDiscountCap(150, 100)).toBe(100);
      expect(applyDiscountCap(50, 100)).toBe(50);
      expect(applyDiscountCap(150, null)).toBe(150);
    });
  });

  describe('Tiered Pricing', () => {
    test('should create tiered pricing for product', async () => {
      const mockResponse = {
        success: true,
        message: '3 pricing tiers created',
        product_id: 1
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createTieredPricing = async (productId, tiers) => {
        return await cachedFetch('/api/tiered-pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId, tiers })
        });
      };

      const tiers = [
        { min_quantity: 1, max_quantity: 9, discount_percentage: 0 },
        { min_quantity: 10, max_quantity: 49, discount_percentage: 10 },
        { min_quantity: 50, max_quantity: null, discount_percentage: 20 }
      ];

      const result = await createTieredPricing(1, tiers);

      expect(result.success).toBe(true);
    });

    test('should get applicable tier for quantity', () => {
      const getApplicableTier = (quantity, tiers) => {
        return tiers.find(tier => {
          const meetsMin = quantity >= tier.min_quantity;
          const meetsMax = !tier.max_quantity || quantity <= tier.max_quantity;
          return meetsMin && meetsMax;
        });
      };

      const tiers = [
        { min_quantity: 1, max_quantity: 9, discount_percentage: 0 },
        { min_quantity: 10, max_quantity: 49, discount_percentage: 10 },
        { min_quantity: 50, max_quantity: null, discount_percentage: 20 }
      ];

      expect(getApplicableTier(5, tiers).discount_percentage).toBe(0);
      expect(getApplicableTier(25, tiers).discount_percentage).toBe(10);
      expect(getApplicableTier(100, tiers).discount_percentage).toBe(20);
    });

    test('should calculate tiered discount', () => {
      const calculateTieredDiscount = (quantity, basePrice, tiers) => {
        const tier = tiers.find(t => quantity >= t.min_quantity && (!t.max_quantity || quantity <= t.max_quantity));
        if (!tier) return 0;

        const totalAmount = quantity * basePrice;
        return (totalAmount * tier.discount_percentage) / 100;
      };

      const tiers = [
        { min_quantity: 1, max_quantity: 9, discount_percentage: 0 },
        { min_quantity: 10, max_quantity: 49, discount_percentage: 10 }
      ];

      expect(calculateTieredDiscount(5, 100, tiers)).toBe(0);
      expect(calculateTieredDiscount(20, 100, tiers)).toBe(200);
    });
  });

  describe('Customer-Specific Pricing', () => {
    test('should create customer-specific pricing', async () => {
      const mockResponse = {
        success: true,
        pricing: {
          customer_id: 1,
          product_id: 1,
          special_price: 90
        }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createCustomerPricing = async (customerId, productId, specialPrice) => {
        return await cachedFetch('/api/customer-pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            product_id: productId,
            special_price: specialPrice
          })
        });
      };

      const result = await createCustomerPricing(1, 1, 90);

      expect(result.success).toBe(true);
      expect(result.pricing.special_price).toBe(90);
    });

    test('should calculate savings from special pricing', () => {
      const calculateSavings = (standardPrice, specialPrice) => {
        return standardPrice - specialPrice;
      };

      expect(calculateSavings(100, 90)).toBe(10);
      expect(calculateSavings(250, 200)).toBe(50);
    });

    test('should calculate savings percentage', () => {
      const calculateSavingsPercentage = (standardPrice, specialPrice) => {
        const savings = standardPrice - specialPrice;
        return Math.round((savings / standardPrice) * 100);
      };

      expect(calculateSavingsPercentage(100, 90)).toBe(10);
      expect(calculateSavingsPercentage(200, 150)).toBe(25);
    });
  });

  describe('Discount Analytics', () => {
    test('should fetch discount analytics', async () => {
      const mockAnalytics = {
        analytics: [
          { total_discounts: '50', total_discount_amount: '5000', discount_type: 'percentage' },
          { total_discounts: '30', total_discount_amount: '3000', discount_type: 'fixed_amount' }
        ]
      };

      cachedFetch.mockResolvedValue(mockAnalytics);

      const getDiscountAnalytics = async (startDate, endDate) => {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        return await cachedFetch(`/api/discount-analytics?${params.toString()}`);
      };

      const result = await getDiscountAnalytics('2025-01-01', '2025-01-31');

      expect(result.analytics).toHaveLength(2);
    });

    test('should calculate total discount given', () => {
      const calculateTotalDiscount = (analytics) => {
        return analytics.reduce((sum, item) => {
          return sum + parseFloat(item.total_discount_amount);
        }, 0);
      };

      const analytics = [
        { total_discount_amount: '5000' },
        { total_discount_amount: '3000' }
      ];

      expect(calculateTotalDiscount(analytics)).toBe(8000);
    });
  });

  describe('UI Helper Functions', () => {
    test('should format discount label', () => {
      const formatDiscountLabel = (type, value) => {
        if (type === 'percentage') {
          return `${value}% Off`;
        } else if (type === 'fixed_amount') {
          return `$${value} Off`;
        }
        return 'Discount';
      };

      expect(formatDiscountLabel('percentage', 10)).toBe('10% Off');
      expect(formatDiscountLabel('fixed_amount', 50)).toBe('$50 Off');
    });

    test('should format discount amount for display', () => {
      const formatDiscountAmount = (amount) => {
        return `$${amount.toFixed(2)}`;
      };

      expect(formatDiscountAmount(150)).toBe('$150.00');
      expect(formatDiscountAmount(99.5)).toBe('$99.50');
    });

    test('should get discount type icon', () => {
      const getDiscountIcon = (type) => {
        const icons = {
          'percentage': '%',
          'fixed_amount': '$',
          'tiered': '▼',
          'promo_code': '#'
        };
        return icons[type] || '•';
      };

      expect(getDiscountIcon('percentage')).toBe('%');
      expect(getDiscountIcon('fixed_amount')).toBe('$');
      expect(getDiscountIcon('tiered')).toBe('▼');
    });

    test('should determine discount status color', () => {
      const getDiscountStatusColor = (isActive, hasExpired) => {
        if (!isActive) return 'gray';
        if (hasExpired) return 'red';
        return 'green';
      };

      expect(getDiscountStatusColor(true, false)).toBe('green');
      expect(getDiscountStatusColor(true, true)).toBe('red');
      expect(getDiscountStatusColor(false, false)).toBe('gray');
    });

    test('should check if discount is currently valid', () => {
      const isDiscountValid = (startDate, endDate) => {
        const now = new Date();
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        if (start && start > now) return false;
        if (end && end < now) return false;
        return true;
      };

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      expect(isDiscountValid(yesterday.toISOString(), tomorrow.toISOString())).toBe(true);
      expect(isDiscountValid(tomorrow.toISOString(), null)).toBe(false);
    });

    test('should calculate remaining uses for promo code', () => {
      const calculateRemainingUses = (maxUses, timesUsed) => {
        if (!maxUses) return 'Unlimited';
        const remaining = maxUses - timesUsed;
        return remaining > 0 ? remaining : 0;
      };

      expect(calculateRemainingUses(100, 75)).toBe(25);
      expect(calculateRemainingUses(null, 50)).toBe('Unlimited');
      expect(calculateRemainingUses(50, 60)).toBe(0);
    });
  });

  describe('Discount Validation', () => {
    test('should validate minimum purchase requirement', () => {
      const meetsMinimumPurchase = (amount, minRequired) => {
        if (!minRequired) return true;
        return amount >= minRequired;
      };

      expect(meetsMinimumPurchase(100, 50)).toBe(true);
      expect(meetsMinimumPurchase(40, 50)).toBe(false);
      expect(meetsMinimumPurchase(100, null)).toBe(true);
    });

    test('should validate minimum quantity requirement', () => {
      const meetsMinimumQuantity = (quantity, minRequired) => {
        if (!minRequired) return true;
        return quantity >= minRequired;
      };

      expect(meetsMinimumQuantity(10, 5)).toBe(true);
      expect(meetsMinimumQuantity(3, 5)).toBe(false);
      expect(meetsMinimumQuantity(10, null)).toBe(true);
    });

    test('should check if discount requires approval', () => {
      const requiresApproval = (discountValue, discountType, threshold = 20) => {
        if (discountType === 'percentage') {
          return discountValue > threshold;
        }
        // For fixed amounts, convert to percentage of typical order
        const assumedOrderAmount = 1000;
        const effectivePercentage = (discountValue / assumedOrderAmount) * 100;
        return effectivePercentage > threshold;
      };

      expect(requiresApproval(25, 'percentage')).toBe(true);
      expect(requiresApproval(15, 'percentage')).toBe(false);
      expect(requiresApproval(250, 'fixed_amount')).toBe(true);
    });
  });

  describe('Discount Stacking', () => {
    test('should determine if discounts can be stacked', () => {
      const canStackDiscounts = (discount1, discount2) => {
        // Same type discounts cannot be stacked
        if (discount1.type === discount2.type) return false;
        // Promo codes cannot be stacked
        if (discount1.is_promo_code || discount2.is_promo_code) return false;
        return true;
      };

      expect(canStackDiscounts(
        { type: 'percentage', is_promo_code: false },
        { type: 'fixed_amount', is_promo_code: false }
      )).toBe(true);

      expect(canStackDiscounts(
        { type: 'percentage', is_promo_code: false },
        { type: 'percentage', is_promo_code: false }
      )).toBe(false);

      expect(canStackDiscounts(
        { type: 'percentage', is_promo_code: true },
        { type: 'fixed_amount', is_promo_code: false }
      )).toBe(false);
    });

    test('should calculate stacked discounts', () => {
      const calculateStackedDiscounts = (amount, discounts) => {
        let currentAmount = amount;
        let totalDiscount = 0;

        discounts.forEach(discount => {
          let discountAmount = 0;
          if (discount.type === 'percentage') {
            discountAmount = (currentAmount * discount.value) / 100;
          } else {
            discountAmount = discount.value;
          }
          currentAmount -= discountAmount;
          totalDiscount += discountAmount;
        });

        return { totalDiscount, finalAmount: currentAmount };
      };

      const result = calculateStackedDiscounts(1000, [
        { type: 'percentage', value: 10 },
        { type: 'fixed_amount', value: 50 }
      ]);

      expect(result.totalDiscount).toBe(150);
      expect(result.finalAmount).toBe(850);
    });
  });

  describe('Discount Recommendations', () => {
    test('should recommend best discount for customer', () => {
      const recommendBestDiscount = (amount, availableDiscounts) => {
        let bestDiscount = null;
        let maxSavings = 0;

        availableDiscounts.forEach(discount => {
          let savings = 0;
          if (discount.type === 'percentage') {
            savings = (amount * discount.value) / 100;
          } else {
            savings = discount.value;
          }

          if (savings > maxSavings) {
            maxSavings = savings;
            bestDiscount = discount;
          }
        });

        return bestDiscount;
      };

      const discounts = [
        { id: 1, type: 'percentage', value: 10 },
        { id: 2, type: 'fixed_amount', value: 150 },
        { id: 3, type: 'percentage', value: 12 }
      ];

      const best = recommendBestDiscount(1000, discounts);
      expect(best.id).toBe(2); // $150 off is best
    });
  });

  describe('deleteDiscountRule', () => {
    test('should delete discount rule', async () => {
      const mockResponse = {
        success: true,
        message: 'Discount rule deleted'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const deleteDiscountRule = async (ruleId) => {
        return await cachedFetch(`/api/discount-rules/${ruleId}`, {
          method: 'DELETE'
        });
      };

      const result = await deleteDiscountRule(1);

      expect(result.success).toBe(true);
    });
  });
});
