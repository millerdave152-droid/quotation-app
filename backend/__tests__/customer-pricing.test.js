/**
 * TeleTime - CustomerPricingService Unit Tests
 *
 * Tests for customer-specific pricing including:
 * - Tier discounts
 * - Volume pricing
 * - Price overrides
 * - Approval workflow
 */

const CustomerPricingService = require('../services/CustomerPricingService');

// Mock database
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

mockPool.connect.mockResolvedValue(mockClient);

describe('CustomerPricingService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    mockClient.query.mockReset();
    service = new CustomerPricingService(mockPool, null);
  });

  // ============================================================================
  // CUSTOMER PRICING INFO
  // ============================================================================

  describe('getCustomerPricingInfo', () => {
    it('should return default info for null customer', async () => {
      const info = await service.getCustomerPricingInfo(null);

      expect(info.pricingTier).toBe('retail');
      expect(info.effectiveDiscount).toBe(0);
      expect(info.canSeeCost).toBe(false);
    });

    it('should return customer pricing info', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 1,
          customer_name: 'Acme Corp',
          pricing_tier: 'wholesale',
          default_discount_percent: 5,
          tier_name: 'Wholesale',
          tier_base_discount: 10,
          can_see_cost: false,
          requires_approval_over_percent: 25,
          max_additional_discount_percent: 15,
          volume_discount_eligible: true,
        }],
      });

      const info = await service.getCustomerPricingInfo(1);

      expect(info.customerId).toBe(1);
      expect(info.customerName).toBe('Acme Corp');
      expect(info.pricingTier).toBe('wholesale');
      expect(info.tierBaseDiscount).toBe(10);
      expect(info.customerDiscount).toBe(5);
      expect(info.effectiveDiscount).toBe(10); // Higher of tier (10) vs customer (5)
    });

    it('should return default info for non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const info = await service.getCustomerPricingInfo(999);

      expect(info.pricingTier).toBe('retail');
      expect(info.effectiveDiscount).toBe(0);
    });

    it('should handle VIP tier correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 2,
          name: 'VIP Customer',
          pricing_tier: 'vip',
          default_discount_percent: 20,
          tier_name: 'VIP',
          tier_base_discount: 15,
          requires_approval_over_percent: 30,
        }],
      });

      const info = await service.getCustomerPricingInfo(2);

      expect(info.pricingTier).toBe('vip');
      expect(info.effectiveDiscount).toBe(20); // Customer discount > tier discount
    });
  });

  // ============================================================================
  // PRICE CALCULATION
  // ============================================================================

  describe('calculateCustomerPrice', () => {
    it('should calculate customer price using database function', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          customer_price_cents: 8500,
          discount_percent: 10,
          pricing_source: 'tier',
          volume_discount_percent: 5,
          total_discount_percent: 15,
        }],
      });

      const result = await service.calculateCustomerPrice(1, 100, 10);

      expect(result.basePriceCents).toBe(10000);
      expect(result.customerPriceCents).toBe(8500);
      expect(result.savingsCents).toBe(1500);
      expect(result.discountPercent).toBe(10);
      expect(result.volumeDiscountPercent).toBe(5);
      expect(result.pricingSource).toBe('tier');
    });

    it('should return null for non-existent product', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateCustomerPrice(1, 999, 1);

      expect(result).toBeNull();
    });

    it('should handle customer with fixed pricing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          customer_price_cents: 7500,
          discount_percent: 25,
          pricing_source: 'customer_fixed',
          volume_discount_percent: 0,
          total_discount_percent: 25,
        }],
      });

      const result = await service.calculateCustomerPrice(1, 100, 1);

      expect(result.customerPriceCents).toBe(7500);
      expect(result.pricingSource).toBe('customer_fixed');
      expect(result.savingsPercent).toBe(25);
    });
  });

  describe('calculateBulkPrices', () => {
    it('should calculate prices for multiple products', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            customer_price_cents: 9000,
            discount_percent: 10,
            pricing_source: 'tier',
            volume_discount_percent: 0,
            total_discount_percent: 10,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            base_price_cents: 5000,
            customer_price_cents: 4500,
            discount_percent: 10,
            pricing_source: 'tier',
            volume_discount_percent: 0,
            total_discount_percent: 10,
          }],
        });

      const result = await service.calculateBulkPrices(1, [
        { productId: 100, quantity: 2 },
        { productId: 101, quantity: 3 },
      ]);

      expect(result.items).toHaveLength(2);
      expect(result.totals.baseTotalCents).toBe(2 * 10000 + 3 * 5000); // 35000
      expect(result.totals.customerTotalCents).toBe(2 * 9000 + 3 * 4500); // 31500
      expect(result.totals.totalSavingsCents).toBe(3500);
    });
  });

  // ============================================================================
  // CUSTOMER PRODUCT PRICING
  // ============================================================================

  describe('getCustomerProductPrices', () => {
    it('should return customer-specific product prices', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            product_id: 100,
            product_name: 'Widget A',
            product_sku: 'WA-001',
            base_price_cents: 10000,
            pricing_type: 'discount_percent',
            fixed_price_cents: null,
            discount_percent: 15,
            cost_plus_percent: null,
            effective_from: '2024-01-01',
            effective_to: null,
          },
        ],
      });

      const prices = await service.getCustomerProductPrices(1);

      expect(prices).toHaveLength(1);
      expect(prices[0].productName).toBe('Widget A');
      expect(prices[0].discountPercent).toBe(15);
      expect(prices[0].pricingType).toBe('discount_percent');
    });
  });

  describe('setCustomerProductPrice', () => {
    it('should set customer-specific product price', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Expire existing
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert new
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.setCustomerProductPrice(1, 100, {
        pricingType: 'fixed',
        fixedPriceCents: 8000,
        notes: 'Special price for volume buyer',
      }, 10);

      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
      expect(mockClient.query).toHaveBeenCalledTimes(4);
    });
  });

  // ============================================================================
  // PRICE OVERRIDE
  // ============================================================================

  describe('checkOverrideRequiresApproval', () => {
    it('should return false for small discounts', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ requires_approval: false }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          requires_approval_over_percent: 15,
          max_additional_discount_percent: 10,
        }],
      });

      const result = await service.checkOverrideRequiresApproval(1, 10000, 9000);

      expect(result.requiresApproval).toBe(false);
      expect(result.discountPercent).toBe(10);
    });

    it('should return true for large discounts', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ requires_approval: true }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          requires_approval_over_percent: 15,
          max_additional_discount_percent: 10,
          effective_discount: 10,
        }],
      });

      const result = await service.checkOverrideRequiresApproval(1, 10000, 7000);

      expect(result.requiresApproval).toBe(true);
      expect(result.discountPercent).toBe(30);
    });
  });

  describe('requestPriceOverride', () => {
    it('should create override request and auto-approve within threshold', async () => {
      // Check approval
      mockPool.query.mockResolvedValueOnce({
        rows: [{ requires_approval: false }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          requires_approval_over_percent: 15,
          max_additional_discount_percent: 10,
          effective_discount: 10,
        }],
      });
      // Get product cost
      mockPool.query.mockResolvedValueOnce({
        rows: [{ cost: 50 }],
      });
      // Insert override
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'auto_approved',
          requires_approval: false,
        }],
      });

      const result = await service.requestPriceOverride({
        productId: 100,
        customerId: 1,
        originalPriceCents: 10000,
        customerTierPriceCents: 9000,
        overridePriceCents: 8500,
        overrideReason: 'Price match',
        userId: 10,
      });

      expect(result.status).toBe('auto_approved');
      expect(result.requiresApproval).toBe(false);
    });

    it('should create pending override for large discounts', async () => {
      // Check approval
      mockPool.query.mockResolvedValueOnce({
        rows: [{ requires_approval: true }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          requires_approval_over_percent: 15,
          max_additional_discount_percent: 10,
          effective_discount: 10,
        }],
      });
      // Get product cost
      mockPool.query.mockResolvedValueOnce({
        rows: [{ cost: 50 }],
      });
      // Insert override
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          status: 'pending',
          requires_approval: true,
        }],
      });

      const result = await service.requestPriceOverride({
        productId: 100,
        customerId: 1,
        originalPriceCents: 10000,
        customerTierPriceCents: 9000,
        overridePriceCents: 6000,
        overrideReason: 'Customer negotiation',
        userId: 10,
      });

      expect(result.status).toBe('pending');
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('approveOverride', () => {
    it('should approve pending override', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'approved',
          product_id: 100,
          original_price_cents: 10000,
          override_price_cents: 8000,
          override_reason: 'Price match',
        }],
      });

      const result = await service.approveOverride(1, 5, 'Approved for regular customer');

      expect(result.success).toBe(true);
      expect(result.override.id).toBe(1);
    });

    it('should fail for already processed override', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.approveOverride(999, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rejectOverride', () => {
    it('should reject pending override with reason', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'rejected',
          product_id: 100,
          original_price_cents: 10000,
          override_price_cents: 5000,
        }],
      });

      const result = await service.rejectOverride(1, 5, 'Discount too high');

      expect(result.success).toBe(true);
      expect(result.override.id).toBe(1);
    });
  });

  describe('getPendingOverrides', () => {
    it('should return list of pending overrides', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            product_id: 100,
            product_name: 'Widget A',
            product_sku: 'WA-001',
            customer_id: 1,
            customer_name: 'Acme Corp',
            pricing_tier: 'wholesale',
            original_price_cents: 10000,
            override_price_cents: 7000,
            override_reason: 'Volume discount',
            status: 'pending',
            created_at: new Date(),
            requested_by_name: 'John Doe',
          },
          {
            id: 2,
            product_id: 101,
            product_name: 'Widget B',
            product_sku: 'WB-001',
            customer_id: 2,
            customer_name: 'Beta Inc',
            pricing_tier: 'vip',
            original_price_cents: 5000,
            override_price_cents: 4000,
            override_reason: 'Price match',
            status: 'pending',
            created_at: new Date(),
            requested_by_name: 'Jane Smith',
          },
        ],
      });

      const overrides = await service.getPendingOverrides();

      expect(overrides).toHaveLength(2);
      expect(overrides[0].productName).toBe('Widget A');
      expect(overrides[1].overrideReason).toBe('Price match');
    });
  });

  // ============================================================================
  // VOLUME DISCOUNTS
  // ============================================================================

  describe('getVolumeDiscounts', () => {
    it('should return volume discounts for product', async () => {
      // First call: get product category
      mockPool.query.mockResolvedValueOnce({
        rows: [{ category_id: 10 }],
      });
      // Second call: get volume pricing rules (no customer means no tier lookup)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, min_quantity: 5, max_quantity: 9, discount_percent: 2 },
          { id: 2, min_quantity: 10, max_quantity: 24, discount_percent: 5 },
          { id: 3, min_quantity: 25, max_quantity: null, discount_percent: 10 },
        ],
      });

      const discounts = await service.getVolumeDiscounts(100);

      expect(discounts).toHaveLength(3);
      expect(discounts[0].minQuantity).toBe(5);
      expect(discounts[2].discountPercent).toBe(10);
    });

    it('should return volume discounts for product and customer', async () => {
      // First call: get product category
      mockPool.query.mockResolvedValueOnce({
        rows: [{ category_id: 10 }],
      });
      // Second call: get customer tier
      mockPool.query.mockResolvedValueOnce({
        rows: [{ pricing_tier: 'wholesale' }],
      });
      // Third call: get volume pricing rules
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, min_quantity: 10, max_quantity: 24, discount_percent: 7, pricing_tier: 'wholesale' },
          { id: 2, min_quantity: 25, max_quantity: null, discount_percent: 12, pricing_tier: 'wholesale' },
        ],
      });

      const discounts = await service.getVolumeDiscounts(100, 1);

      expect(discounts).toHaveLength(2);
      expect(discounts[0].discountPercent).toBe(7);
    });
  });

  // ============================================================================
  // TIER MANAGEMENT
  // ============================================================================

  describe('getPricingTiers', () => {
    it('should return all pricing tiers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            tier: 'retail',
            display_name: 'Retail',
            base_discount_percent: 0,
            requires_approval_over_percent: 15,
          },
          {
            tier: 'wholesale',
            display_name: 'Wholesale',
            base_discount_percent: 10,
            requires_approval_over_percent: 25,
          },
          {
            tier: 'vip',
            display_name: 'VIP',
            base_discount_percent: 15,
            requires_approval_over_percent: 30,
          },
        ],
      });

      const tiers = await service.getPricingTiers();

      expect(tiers).toHaveLength(3);
      expect(tiers[0].tier).toBe('retail');
      expect(tiers[1].baseDiscountPercent).toBe(10);
      expect(tiers[2].displayName).toBe('VIP');
    });
  });

  describe('setCustomerTier', () => {
    it('should update customer tier', async () => {
      mockPool.query.mockResolvedValueOnce({});

      const result = await service.setCustomerTier(1, 'vip', 10);

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers'),
        [1, 'vip']
      );
    });
  });

  // ============================================================================
  // OVERRIDE HISTORY
  // ============================================================================

  describe('getOverrideHistory', () => {
    it('should return filtered override history', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            product_id: 100,
            product_name: 'Widget A',
            status: 'approved',
            original_price_cents: 10000,
            override_price_cents: 8000,
            created_at: new Date(),
          },
        ],
      });

      const history = await service.getOverrideHistory({
        customerId: 1,
        status: 'approved',
        limit: 10,
      });

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('approved');
    });
  });
});
