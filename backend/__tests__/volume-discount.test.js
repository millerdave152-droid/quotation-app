/**
 * TeleTime - VolumeDiscountService Unit Tests
 *
 * Tests for volume pricing including:
 * - Customer-specific volume tiers (Priority 1)
 * - Customer tier default volume pricing (Priority 2)
 * - Product default volume tiers (Priority 3)
 * - Base product price fallback (Priority 4)
 * - Cart batch pricing
 * - Tier management
 */

const VolumeDiscountService = require('../services/VolumeDiscountService');

// Mock database pool
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

mockPool.connect.mockResolvedValue(mockClient);

describe('VolumeDiscountService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockReset();
    service = new VolumeDiscountService(mockPool, null);
  });

  // ============================================================================
  // getVolumePrice() - MAIN API
  // ============================================================================

  describe('getVolumePrice', () => {
    describe('Input validation', () => {
      it('should return error for invalid product ID', async () => {
        const result = await service.getVolumePrice(null, 10);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid product ID');
      });

      it('should return error for invalid quantity', async () => {
        const result = await service.getVolumePrice(1, 0);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid quantity');
      });

      it('should return error for negative quantity', async () => {
        const result = await service.getVolumePrice(1, -5);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid quantity');
      });
    });

    describe('Priority 1: Customer-specific volume tier', () => {
      it('should return customer-specific volume pricing when available', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 8000,
            discount_percent: '20.00',
            tier_name: 'Customer Special',
            pricing_source: 'customer_volume',
            savings_cents: 2000,
          }],
        });

        const result = await service.getVolumePrice(100, 25, 1);

        expect(result.success).toBe(true);
        expect(result.pricingSource).toBe('customer_volume');
        expect(result.volumePriceCents).toBe(8000);
        expect(result.unitPrice).toBe(80);
        expect(result.tierName).toBe('Customer Special');
        expect(result.percentOff).toBe(20);
      });

      it('should use customer-specific pricing over tier defaults', async () => {
        // Customer 1 has a special deal for product 100
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 7500,
            discount_percent: '25.00',
            tier_name: 'VIP Deal',
            pricing_source: 'customer_volume',
            savings_cents: 2500,
          }],
        });

        const result = await service.getVolumePrice(100, 10, 1);

        expect(result.pricingSource).toBe('customer_volume');
        expect(result.percentOff).toBe(25);
      });
    });

    describe('Priority 2: Customer tier default volume pricing', () => {
      it('should return tier-specific volume pricing for wholesale customer', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 8500,
            discount_percent: '15.00',
            tier_name: 'wholesale Volume',
            pricing_source: 'tier_volume',
            savings_cents: 1500,
          }],
        });

        const result = await service.getVolumePrice(100, 25, 5); // Customer 5 is wholesale

        expect(result.success).toBe(true);
        expect(result.pricingSource).toBe('tier_volume');
        expect(result.volumePriceCents).toBe(8500);
        expect(result.percentOff).toBe(15);
      });

      it('should stack tier bonus with product volume tier', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 7650, // Base 10% + 5% tier bonus = ~15%
            discount_percent: '23.50',
            tier_name: 'Bulk',
            pricing_source: 'product_volume+tier_bonus',
            savings_cents: 2350,
          }],
        });

        const result = await service.getVolumePrice(100, 50, 10); // Dealer tier customer

        expect(result.pricingSource).toBe('product_volume+tier_bonus');
      });
    });

    describe('Priority 3: Product default volume tiers', () => {
      it('should return product volume pricing for no customer', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 9000,
            discount_percent: '10.00',
            tier_name: 'Bulk',
            pricing_source: 'product_volume',
            savings_cents: 1000,
          }],
        });

        const result = await service.getVolumePrice(100, 25, null);

        expect(result.success).toBe(true);
        expect(result.pricingSource).toBe('product_volume');
        expect(result.volumePriceCents).toBe(9000);
        expect(result.percentOff).toBe(10);
        expect(result.tierName).toBe('Bulk');
      });

      it('should return correct tier based on quantity', async () => {
        // 10 units should hit the 10-24 tier
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 9500,
            discount_percent: '5.00',
            tier_name: 'Case',
            pricing_source: 'product_volume',
            savings_cents: 500,
          }],
        });

        const result = await service.getVolumePrice(100, 10);

        expect(result.tierName).toBe('Case');
        expect(result.percentOff).toBe(5);
      });
    });

    describe('Priority 4: Base price fallback', () => {
      it('should return base price when no volume tiers apply', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 10000,
            discount_percent: '0',
            tier_name: 'Standard',
            pricing_source: 'base',
            savings_cents: 0,
          }],
        });

        const result = await service.getVolumePrice(100, 1, null);

        expect(result.success).toBe(true);
        expect(result.pricingSource).toBe('base');
        expect(result.volumePriceCents).toBe(10000);
        expect(result.percentOff).toBe(0);
        expect(result.totalDiscount).toBe(0);
      });

      it('should handle product without volume pricing', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 5000,
            volume_price_cents: 5000,
            discount_percent: '0',
            tier_name: 'Standard',
            pricing_source: 'base',
            savings_cents: 0,
          }],
        });

        const result = await service.getVolumePrice(200, 100);

        expect(result.pricingSource).toBe('base');
        expect(result.volumePriceCents).toBe(5000);
      });
    });

    describe('Response format', () => {
      it('should return all expected fields', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 8000,
            discount_percent: '20.00',
            tier_name: 'Bulk',
            pricing_source: 'product_volume',
            savings_cents: 2000,
          }],
        });

        const result = await service.getVolumePrice(100, 10, 1);

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('productId', 100);
        expect(result).toHaveProperty('quantity', 10);
        expect(result).toHaveProperty('customerId', 1);
        expect(result).toHaveProperty('basePriceCents', 10000);
        expect(result).toHaveProperty('volumePriceCents', 8000);
        expect(result).toHaveProperty('unitPrice', 80);
        expect(result).toHaveProperty('basePrice', 100);
        expect(result).toHaveProperty('tierName', 'Bulk');
        expect(result).toHaveProperty('percentOff', 20);
        expect(result).toHaveProperty('totalDiscount', 20); // Savings in dollars
        expect(result).toHaveProperty('totalDiscountCents', 2000);
        expect(result).toHaveProperty('pricingSource', 'product_volume');
        expect(result).toHaveProperty('lineTotalCents', 80000);
        expect(result).toHaveProperty('lineTotal', 800);
        expect(result).toHaveProperty('savingsPerUnit', 20);
        expect(result).toHaveProperty('totalSavings', 200); // 10 units * $20
      });

      it('should calculate line totals correctly', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            base_price_cents: 5000,
            volume_price_cents: 4500,
            discount_percent: '10.00',
            tier_name: 'Volume 10+',
            pricing_source: 'product_volume',
            savings_cents: 500,
          }],
        });

        const result = await service.getVolumePrice(100, 15);

        expect(result.lineTotalCents).toBe(67500); // 15 * 4500
        expect(result.lineTotal).toBe(675);
        expect(result.totalSavings).toBe(75); // 15 * $5
      });
    });

    describe('Error handling', () => {
      it('should return error for non-existent product', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            pricing_source: 'error',
          }],
        });

        const result = await service.getVolumePrice(999, 10);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Product not found');
      });

      it('should handle database errors gracefully', async () => {
        mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

        const result = await service.getVolumePrice(100, 10);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to calculate');
      });
    });
  });

  // ============================================================================
  // getCartVolumePrices() - BATCH PRICING
  // ============================================================================

  describe('getCartVolumePrices', () => {
    it('should return prices for multiple products', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 100,
            quantity: 5,
            base_price_cents: 10000,
            volume_price_cents: 9500,
            discount_percent: '5.00',
            tier_name: 'Small Bulk',
            line_total_cents: '47500',
            savings_cents: 500,
          },
          {
            product_id: 101,
            quantity: 10,
            base_price_cents: 5000,
            volume_price_cents: 4500,
            discount_percent: '10.00',
            tier_name: 'Case',
            line_total_cents: '45000',
            savings_cents: 500,
          },
        ],
      });

      const result = await service.getCartVolumePrices([
        { productId: 100, quantity: 5 },
        { productId: 101, quantity: 10 },
      ]);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].productId).toBe(100);
      expect(result.items[1].productId).toBe(101);
    });

    it('should calculate cart totals correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 100,
            quantity: 2,
            base_price_cents: 10000,
            volume_price_cents: 9000,
            discount_percent: '10.00',
            tier_name: 'Bulk',
            line_total_cents: '18000',
            savings_cents: 1000,
          },
          {
            product_id: 101,
            quantity: 3,
            base_price_cents: 5000,
            volume_price_cents: 4750,
            discount_percent: '5.00',
            tier_name: 'Small',
            line_total_cents: '14250',
            savings_cents: 250,
          },
        ],
      });

      const result = await service.getCartVolumePrices([
        { productId: 100, quantity: 2 },
        { productId: 101, quantity: 3 },
      ]);

      // Base total: (10000 * 2) + (5000 * 3) = 35000
      expect(result.totals.baseTotalCents).toBe(35000);
      // Volume total: 18000 + 14250 = 32250
      expect(result.totals.volumeTotalCents).toBe(32250);
      // Savings: (1000 * 2) + (250 * 3) = 2750
      expect(result.totals.totalSavingsCents).toBe(2750);
      expect(result.totals.itemCount).toBe(5);
    });

    it('should apply customer-specific pricing to cart', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 100,
            quantity: 10,
            base_price_cents: 10000,
            volume_price_cents: 7500, // Customer special price
            discount_percent: '25.00',
            tier_name: 'VIP Special',
            line_total_cents: '75000',
            savings_cents: 2500,
          },
        ],
      });

      const result = await service.getCartVolumePrices(
        [{ productId: 100, quantity: 10 }],
        1 // Customer ID
      );

      expect(result.customerId).toBe(1);
      expect(result.items[0].discountPercent).toBe(25);
    });

    it('should return error for empty items array', async () => {
      const result = await service.getCartVolumePrices([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Items array is required');
    });

    it('should return error for null items', async () => {
      const result = await service.getCartVolumePrices(null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Items array is required');
    });
  });

  // ============================================================================
  // PRODUCT VOLUME TIERS MANAGEMENT
  // ============================================================================

  describe('getProductVolumeTiers', () => {
    it('should return all tiers for a product', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, min_qty: 1, max_qty: 9, price_cents: 10000, discount_percent: null, tier_name: 'Single', is_active: true },
          { id: 2, min_qty: 10, max_qty: 24, price_cents: 9000, discount_percent: null, tier_name: 'Case', is_active: true },
          { id: 3, min_qty: 25, max_qty: null, price_cents: 8000, discount_percent: null, tier_name: 'Pallet', is_active: true },
        ],
      });

      const tiers = await service.getProductVolumeTiers(100);

      expect(tiers).toHaveLength(3);
      expect(tiers[0].minQty).toBe(1);
      expect(tiers[1].tierName).toBe('Case');
      expect(tiers[2].maxQty).toBeNull(); // Unlimited
    });

    it('should handle products with no tiers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const tiers = await service.getProductVolumeTiers(999);

      expect(tiers).toHaveLength(0);
    });
  });

  describe('createProductVolumeTier', () => {
    it('should create a new volume tier with fixed price', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          product_id: 100,
          min_qty: 10,
          max_qty: 24,
          price_cents: 9000,
          discount_percent: null,
          tier_name: 'Case',
          is_active: true,
          created_at: new Date(),
        }],
      });

      const tier = await service.createProductVolumeTier(100, {
        minQty: 10,
        maxQty: 24,
        priceCents: 9000,
        tierName: 'Case',
      }, 1);

      expect(tier.id).toBe(1);
      expect(tier.priceCents).toBe(9000);
      expect(tier.tierName).toBe('Case');
    });

    it('should create a tier with discount percentage', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          product_id: 100,
          min_qty: 25,
          max_qty: null,
          price_cents: null,
          discount_percent: '15.00',
          tier_name: 'Bulk',
          is_active: true,
        }],
      });

      const tier = await service.createProductVolumeTier(100, {
        minQty: 25,
        discountPercent: 15,
        tierName: 'Bulk',
      }, 1);

      expect(tier.discountPercent).toBe(15);
      expect(tier.priceCents).toBeNull();
    });

    it('should throw error when both priceCents and discountPercent provided', async () => {
      await expect(
        service.createProductVolumeTier(100, {
          minQty: 10,
          priceCents: 9000,
          discountPercent: 10,
        }, 1)
      ).rejects.toThrow('Must specify either priceCents or discountPercent');
    });

    it('should throw error when neither priceCents nor discountPercent provided', async () => {
      await expect(
        service.createProductVolumeTier(100, {
          minQty: 10,
        }, 1)
      ).rejects.toThrow('Must specify either priceCents or discountPercent');
    });
  });

  describe('updateProductVolumeTier', () => {
    it('should update an existing tier', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ product_id: 100 }] }) // Get current
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            product_id: 100,
            min_qty: 10,
            max_qty: 29,
            price_cents: 8500,
            tier_name: 'Updated Case',
            is_active: true,
          }],
        }); // Update

      const tier = await service.updateProductVolumeTier(1, {
        maxQty: 29,
        priceCents: 8500,
        tierName: 'Updated Case',
      });

      expect(tier.priceCents).toBe(8500);
      expect(tier.tierName).toBe('Updated Case');
    });

    it('should return null for non-existent tier', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const tier = await service.updateProductVolumeTier(999, { priceCents: 9000 });

      expect(tier).toBeNull();
    });
  });

  describe('deleteProductVolumeTier', () => {
    it('should delete a tier and return true', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ product_id: 100 }] })
        .mockResolvedValueOnce({});

      const result = await service.deleteProductVolumeTier(1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent tier', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.deleteProductVolumeTier(999);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // CUSTOMER VOLUME TIERS
  // ============================================================================

  describe('getCustomerVolumeTiers', () => {
    it('should return customer-specific volume tiers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            customer_id: 1,
            product_id: 100,
            product_name: 'Widget A',
            product_sku: 'WA-001',
            min_qty: 5,
            max_qty: null,
            price_cents: 8000,
            discount_percent: null,
            effective_from: '2024-01-01',
            effective_to: null,
            notes: 'Special deal',
          },
        ],
      });

      const tiers = await service.getCustomerVolumeTiers(1);

      expect(tiers).toHaveLength(1);
      expect(tiers[0].customerId).toBe(1);
      expect(tiers[0].productName).toBe('Widget A');
      expect(tiers[0].priceCents).toBe(8000);
    });

    it('should filter by product when productId provided', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            customer_id: 1,
            product_id: 100,
            min_qty: 10,
            price_cents: 7500,
          },
        ],
      });

      const tiers = await service.getCustomerVolumeTiers(1, 100);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('cvt.product_id = $2'),
        [1, 100]
      );
    });
  });

  describe('createCustomerVolumeTier', () => {
    it('should create a customer-specific tier', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = await service.createCustomerVolumeTier(1, {
        productId: 100,
        minQty: 5,
        priceCents: 8000,
        notes: 'Negotiated price',
      }, 10);

      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
    });
  });

  // ============================================================================
  // TIER VOLUME OVERRIDES
  // ============================================================================

  describe('getTierVolumeOverrides', () => {
    it('should return overrides for a pricing tier', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            product_id: null, // Global
            pricing_tier: 'wholesale',
            min_qty: 10,
            max_qty: 24,
            additional_discount_percent: '2.00',
            priority: 10,
          },
          {
            id: 2,
            product_id: null,
            pricing_tier: 'wholesale',
            min_qty: 25,
            max_qty: null,
            additional_discount_percent: '5.00',
            priority: 11,
          },
        ],
      });

      const overrides = await service.getTierVolumeOverrides('wholesale');

      expect(overrides).toHaveLength(2);
      expect(overrides[0].additionalDiscountPercent).toBe(2);
      expect(overrides[1].additionalDiscountPercent).toBe(5);
    });
  });

  describe('createTierVolumeOverride', () => {
    it('should create a tier volume override', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = await service.createTierVolumeOverride({
        pricingTier: 'dealer',
        minQty: 50,
        additionalDiscountPercent: 10,
        priority: 20,
      }, 1);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // PRODUCTS WITH VOLUME PRICING
  // ============================================================================

  describe('getProductsWithVolumePricing', () => {
    it('should return products that have volume pricing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 100,
            product_name: 'Widget A',
            model: 'WA-001',
            base_price_cents: 10000,
            has_volume_pricing: true,
            tier_count: '3',
          },
          {
            product_id: 101,
            product_name: 'Widget B',
            model: 'WB-001',
            base_price_cents: 5000,
            has_volume_pricing: true,
            tier_count: '2',
          },
        ],
      });

      const products = await service.getProductsWithVolumePricing();

      expect(products).toHaveLength(2);
      expect(products[0].tierCount).toBe(3);
      expect(products[0].basePrice).toBe(100);
    });
  });

  // ============================================================================
  // VOLUME PRICING PREVIEW
  // ============================================================================

  describe('previewVolumePricing', () => {
    it('should return pricing preview for all tiers', async () => {
      // First call: get tiers
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, min_qty: 1, max_qty: 9, price_cents: 10000, is_active: true, tier_name: 'Single' },
          { id: 2, min_qty: 10, max_qty: 24, price_cents: 9000, is_active: true, tier_name: 'Case' },
          { id: 3, min_qty: 25, max_qty: null, price_cents: 8000, is_active: true, tier_name: 'Pallet' },
        ],
      });

      // Subsequent calls: getVolumePrice for each tier
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 10000,
            discount_percent: '0',
            tier_name: 'Single',
            pricing_source: 'base',
            savings_cents: 0,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 9000,
            discount_percent: '10.00',
            tier_name: 'Case',
            pricing_source: 'product_volume',
            savings_cents: 1000,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            base_price_cents: 10000,
            volume_price_cents: 8000,
            discount_percent: '20.00',
            tier_name: 'Pallet',
            pricing_source: 'product_volume',
            savings_cents: 2000,
          }],
        });

      const preview = await service.previewVolumePricing(100);

      expect(preview).toHaveLength(3);
      expect(preview[0].tierName).toBe('Single');
      expect(preview[1].unitPrice).toBe(90);
      expect(preview[2].discountPercent).toBe(20);
    });

    it('should return base price when no tiers configured', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // No tiers
        .mockResolvedValueOnce({ rows: [{ price_cents: 10000 }] }); // Base price

      const preview = await service.previewVolumePricing(200);

      expect(preview).toHaveLength(1);
      expect(preview[0].tierName).toBe('Standard');
      expect(preview[0].unitPriceCents).toBe(10000);
    });
  });

  // ============================================================================
  // PRICING PRIORITY INTEGRATION TESTS
  // ============================================================================

  describe('Pricing Priority', () => {
    it('should prioritize customer-specific over tier-specific pricing', async () => {
      // Customer has negotiated $75 for product 100 at qty 10+
      // Wholesale tier would give $85
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          volume_price_cents: 7500,
          discount_percent: '25.00',
          tier_name: 'Customer Deal',
          pricing_source: 'customer_volume', // Priority 1
          savings_cents: 2500,
        }],
      });

      const result = await service.getVolumePrice(100, 10, 1);

      expect(result.pricingSource).toBe('customer_volume');
      expect(result.volumePriceCents).toBe(7500);
    });

    it('should fall back to tier pricing when no customer-specific exists', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          volume_price_cents: 8500,
          discount_percent: '15.00',
          tier_name: 'Wholesale Bulk',
          pricing_source: 'tier_volume', // Priority 2
          savings_cents: 1500,
        }],
      });

      const result = await service.getVolumePrice(100, 10, 5); // Wholesale customer

      expect(result.pricingSource).toBe('tier_volume');
      expect(result.volumePriceCents).toBe(8500);
    });

    it('should fall back to product tiers when no customer or tier pricing', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          volume_price_cents: 9000,
          discount_percent: '10.00',
          tier_name: 'Bulk',
          pricing_source: 'product_volume', // Priority 3
          savings_cents: 1000,
        }],
      });

      const result = await service.getVolumePrice(100, 10, null);

      expect(result.pricingSource).toBe('product_volume');
    });

    it('should fall back to base price when no volume pricing applies', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          base_price_cents: 10000,
          volume_price_cents: 10000,
          discount_percent: '0',
          tier_name: 'Standard',
          pricing_source: 'base', // Priority 4
          savings_cents: 0,
        }],
      });

      const result = await service.getVolumePrice(100, 1);

      expect(result.pricingSource).toBe('base');
      expect(result.percentOff).toBe(0);
    });
  });
});
