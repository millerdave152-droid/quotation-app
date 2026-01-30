/**
 * TeleTime POS - Warranty Service Tests
 */

const WarrantyService = require('../services/WarrantyService');

describe('WarrantyService', () => {
  let warrantyService;
  let mockPool;
  let mockClient;

  beforeEach(() => {
    // Reset mocks
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    warrantyService = new WarrantyService(mockPool, null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // getEligibleWarranties Tests
  // ============================================================================

  describe('getEligibleWarranties', () => {
    it('should return eligible warranties for a product', async () => {
      // Mock product query
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Phone',
            sku: 'PHONE-001',
            price: 599.99,
            cost: 400,
            category_id: 2,
            category_name: 'Phones',
            category_slug: 'phones',
            manufacturer_warranty_months: 12,
          }],
        })
        // Mock warranties query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              product_id: 100,
              warranty_name: '2-Year Extended Warranty',
              warranty_type: 'extended',
              duration_months: 24,
              price_type: 'fixed',
              price_value: 79.99,
              coverage_details: { labor: true, parts: true },
              exclusions: ['cosmetic damage'],
              deductible_amount: 0,
              badge_text: 'Most Popular',
              is_featured: true,
              display_order: 1,
              warranty_cost: 15,
              calculated_price: 79.99,
            },
            {
              id: 2,
              product_id: 101,
              warranty_name: '2-Year Accidental',
              warranty_type: 'accidental',
              duration_months: 24,
              price_type: 'fixed',
              price_value: 99.99,
              coverage_details: { accidental_drops: true, liquid_spills: true },
              exclusions: ['intentional damage'],
              deductible_amount: 25,
              badge_text: null,
              is_featured: false,
              display_order: 2,
              warranty_cost: 25,
              calculated_price: 99.99,
            },
          ],
        });

      const result = await warrantyService.getEligibleWarranties(1, 599.99);

      expect(result.success).toBe(true);
      expect(result.eligible).toBe(true);
      expect(result.productId).toBe(1);
      expect(result.productName).toBe('Test Phone');
      expect(result.warranties).toHaveLength(2);

      // Check first warranty
      expect(result.warranties[0]).toMatchObject({
        warrantyId: expect.any(Number),
        name: expect.any(String),
        durationMonths: 24,
        price: expect.any(Number),
        pricePerMonth: expect.any(Number),
      });

      // Should have suggested script
      expect(result.suggestedScript).toBeTruthy();
      expect(result.suggestedScript).toContain('$');
    });

    it('should return ineligible for non-warranty categories', async () => {
      // Mock product in non-eligible category
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'T-Shirt',
          price: 29.99,
          category_id: 10,
          category_name: 'Clothing',
          category_slug: 'clothing',
          manufacturer_warranty_months: 0,
        }],
      });

      const result = await warrantyService.getEligibleWarranties(1);

      expect(result.success).toBe(true);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not eligible');
      expect(result.warranties).toHaveLength(0);
    });

    it('should return ineligible if manufacturer warranty > 1 year', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Premium Phone',
          price: 999.99,
          category_id: 2,
          category_name: 'Phones',
          category_slug: 'phones',
          manufacturer_warranty_months: 24, // 2 year manufacturer warranty
        }],
      });

      const result = await warrantyService.getEligibleWarranties(1);

      expect(result.success).toBe(true);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('manufacturer warranty');
    });

    it('should handle product not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await warrantyService.getEligibleWarranties(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should sort warranties by margin (highest first)', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Test Product',
            price: 500,
            category_id: 1,
            category_slug: 'electronics',
            manufacturer_warranty_months: 12,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, calculated_price: 50, warranty_cost: 40, warranty_name: 'Low Margin', duration_months: 12, price_type: 'fixed', price_value: 50, coverage_details: {}, exclusions: [], warranty_type: 'extended' },
            { id: 2, calculated_price: 80, warranty_cost: 20, warranty_name: 'High Margin', duration_months: 24, price_type: 'fixed', price_value: 80, coverage_details: {}, exclusions: [], warranty_type: 'extended' },
            { id: 3, calculated_price: 60, warranty_cost: 30, warranty_name: 'Medium Margin', duration_months: 12, price_type: 'fixed', price_value: 60, coverage_details: {}, exclusions: [], warranty_type: 'extended' },
          ],
        });

      const result = await warrantyService.getEligibleWarranties(1, 500);

      expect(result.success).toBe(true);
      // Should be sorted by margin: High (60), Medium (30), Low (10)
      expect(result.warranties[0].name).toBe('High Margin');
      expect(result.warranties[0].margin).toBe(60);
    });
  });

  // ============================================================================
  // calculateWarrantyPrice Tests
  // ============================================================================

  describe('calculateWarrantyPrice', () => {
    it('should calculate fixed price warranty', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          product_id: 100,
          warranty_name: '2-Year Extended',
          warranty_type: 'extended',
          duration_months: 24,
          price_type: 'fixed',
          price_value: 79.99,
          min_product_price: 100,
          max_product_price: 1000,
          deductible_amount: 0,
          warranty_cost: 15,
        }],
      });

      const result = await warrantyService.calculateWarrantyPrice(1, 599.99);

      expect(result.success).toBe(true);
      expect(result.calculatedPrice).toBe(79.99);
      expect(result.pricePerMonth).toBeCloseTo(3.33, 1);
      expect(result.durationMonths).toBe(24);
    });

    it('should calculate percentage-based warranty', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          product_id: 101,
          warranty_name: '3-Year Premium',
          warranty_type: 'comprehensive',
          duration_months: 36,
          price_type: 'percent',
          price_value: 15, // 15% of product price
          min_product_price: 200,
          max_product_price: 5000,
          deductible_amount: 0,
          warranty_cost: 35,
        }],
      });

      const result = await warrantyService.calculateWarrantyPrice(2, 1000);

      expect(result.success).toBe(true);
      expect(result.calculatedPrice).toBe(150); // 15% of 1000
      expect(result.pricePerMonth).toBeCloseTo(4.17, 1);
      expect(result.margin).toBe(115); // 150 - 35
    });

    it('should reject if product price outside range', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          warranty_name: 'Test Warranty',
          price_type: 'fixed',
          price_value: 50,
          min_product_price: 100,
          max_product_price: 500,
          warranty_cost: 10,
          duration_months: 12,
          warranty_type: 'extended',
        }],
      });

      const result = await warrantyService.calculateWarrantyPrice(1, 50); // Below minimum

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be between');
    });

    it('should handle warranty not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await warrantyService.calculateWarrantyPrice(999, 500);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================================
  // addWarrantyToOrder Tests
  // ============================================================================

  describe('addWarrantyToOrder', () => {
    it('should add warranty to a transaction', async () => {
      // Reset mock to setup the full sequence
      mockClient.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Covered item query
          rows: [{
            item_id: 1,
            product_id: 10,
            product_name: 'Test Phone',
            product_sku: 'PHONE-001',
            unit_price: 599.99,
            serial_number: 'SN123456',
            customer_id: 5,
            customer_name: 'John Doe',
            customer_email: 'john@example.com',
            customer_phone: '555-1234',
          }],
        })
        .mockResolvedValueOnce({
          // Warranty details query
          rows: [{
            id: 1,
            product_id: 100,
            warranty_name: '2-Year Extended',
            warranty_type: 'extended',
            duration_months: 24,
            price_type: 'fixed',
            price_value: 79.99,
            min_product_price: 100,
            max_product_price: 1000,
            warranty_cost: 15,
            sku: 'WRN-2YR-EXT',
          }],
        })
        // Insert warranty purchase
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            registration_code: 'WRN-20240115-ABC12',
            warranty_name: '2-Year Extended',
            warranty_type: 'extended',
            covered_product_name: 'Test Phone',
            coverage_start_date: new Date(),
            coverage_end_date: new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000),
            duration_months: 24,
          }],
        })
        // Insert line item
        .mockResolvedValueOnce({
          rows: [{ item_id: 2 }],
        })
        // Update warranty purchase with line item
        .mockResolvedValueOnce({ rows: [] })
        // COMMIT
        .mockResolvedValueOnce({ rows: [] });

      // Mock calculateWarrantyPrice pool query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          product_id: 100,
          warranty_name: '2-Year Extended',
          warranty_type: 'extended',
          duration_months: 24,
          price_type: 'fixed',
          price_value: 79.99,
          min_product_price: 100,
          max_product_price: 1000,
          deductible_amount: 0,
          warranty_cost: 15,
        }],
      });

      const result = await warrantyService.addWarrantyToOrder({
        transactionId: 1,
        coveredItemId: 1,
        warrantyProductId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.warrantyPurchase).toBeDefined();
      expect(result.warrantyPurchase.registrationCode).toBeDefined();
      expect(result.warrantyPurchase.warrantyName).toBe('2-Year Extended');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on error', async () => {
      // Reset mock to setup sequence for error case
      mockClient.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No covered item found
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await warrantyService.addWarrantyToOrder({
        transactionId: 1,
        coveredItemId: 999,
        warrantyProductId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ============================================================================
  // getWarrantyUpsellScript Tests
  // ============================================================================

  describe('getWarrantyUpsellScript', () => {
    it('should return upsell script for eligible product', async () => {
      // Mock getEligibleWarranties internal call
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Smart TV 55"',
            price: 799.99,
            category_id: 3,
            category_name: 'TVs',
            category_slug: 'tvs',
            manufacturer_warranty_months: 12,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            product_id: 100,
            warranty_name: '2-Year Protection',
            warranty_type: 'extended',
            duration_months: 24,
            price_type: 'fixed',
            price_value: 99.99,
            coverage_details: { labor: true, parts: true, in_home_service: true },
            exclusions: [],
            deductible_amount: 0,
            badge_text: 'Most Popular',
            is_featured: true,
            warranty_cost: 20,
            calculated_price: 99.99,
          }],
        });

      const result = await warrantyService.getWarrantyUpsellScript({
        id: 1,
        name: 'Smart TV 55"',
        price: 799.99,
        category: 'TVs',
      });

      expect(result.success).toBe(true);
      expect(result.showUpsell).toBe(true);
      expect(result.script).toBeTruthy();
      expect(result.script).toContain('Smart TV');
      expect(result.talkingPoints).toBeInstanceOf(Array);
      expect(result.talkingPoints.length).toBeGreaterThan(0);
      expect(result.objectionHandlers).toBeDefined();
      expect(result.objectionHandlers['too expensive']).toBeTruthy();
      expect(result.closeStatements).toBeInstanceOf(Array);
    });

    it('should return no upsell for ineligible product', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Book',
          price: 19.99,
          category_id: 20,
          category_name: 'Books',
          category_slug: 'books',
          manufacturer_warranty_months: 0,
        }],
      });

      const result = await warrantyService.getWarrantyUpsellScript({
        id: 1,
        name: 'Book',
        price: 19.99,
        category: 'Books',
      });

      expect(result.success).toBe(true);
      expect(result.showUpsell).toBe(false);
    });
  });

  // ============================================================================
  // trackWarrantyDecline Tests
  // ============================================================================

  describe('trackWarrantyDecline', () => {
    it('should track warranty decline', async () => {
      // Mock table creation check
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE IF NOT EXISTS
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT

      const result = await warrantyService.trackWarrantyDecline({
        productId: 1,
        transactionId: 100,
        warrantyOffered: [1, 2],
        declineReason: 'too expensive',
        cashierId: 5,
      });

      expect(result.success).toBe(true);
      expect(result.tracked).toBe(true);
    });

    it('should not fail transaction if tracking fails', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      const result = await warrantyService.trackWarrantyDecline({
        productId: 1,
        transactionId: 100,
      });

      // Should still return success to not block transaction
      expect(result.success).toBe(true);
      expect(result.tracked).toBe(false);
    });
  });

  // ============================================================================
  // getWarrantyByCode Tests
  // ============================================================================

  describe('getWarrantyByCode', () => {
    it('should return warranty details by registration code', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          registration_code: 'WRN-20240115-ABC12',
          warranty_name: '2-Year Extended',
          warranty_type: 'extended',
          covered_product_name: 'Test Phone',
          covered_product_serial: 'SN123456',
          warranty_price: 79.99,
          coverage_start_date: new Date('2024-01-15'),
          coverage_end_date: new Date('2026-01-15'),
          duration_months: 24,
          status: 'active',
          computed_status: 'active',
          days_remaining: 365,
          claims_count: '0',
          customer_name: 'John Doe',
          customer_email: 'john@example.com',
          customer_phone: '555-1234',
        }],
      });

      const result = await warrantyService.getWarrantyByCode('WRN-20240115-ABC12');

      expect(result.success).toBe(true);
      expect(result.warranty).toBeDefined();
      expect(result.warranty.registrationCode).toBe('WRN-20240115-ABC12');
      expect(result.warranty.status).toBe('active'); // Uses computed_status from DB
      expect(result.warranty.customer.name).toBe('John Doe');
    });

    it('should return error for invalid code', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await warrantyService.getWarrantyByCode('INVALID-CODE');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================================
  // Helper Method Tests
  // ============================================================================

  describe('_formatCoverageDescription', () => {
    it('should format coverage details into readable text', () => {
      const coverage = {
        labor: true,
        parts: true,
        accidental_drops: true,
        liquid_spills: true,
        in_home_service: true,
      };

      const description = warrantyService._formatCoverageDescription(coverage);

      expect(description).toContain('labor');
      expect(description).toContain('parts');
      expect(description).toContain('accidental drops');
      expect(description).toContain('liquid damage');
    });

    it('should handle empty coverage', () => {
      const description = warrantyService._formatCoverageDescription({});
      expect(description).toBe('Standard warranty coverage');
    });

    it('should handle null/undefined', () => {
      expect(warrantyService._formatCoverageDescription(null)).toBe('Standard coverage');
      expect(warrantyService._formatCoverageDescription(undefined)).toBe('Standard coverage');
    });
  });

  describe('_checkProductEligibility', () => {
    it('should return eligible for electronics category', () => {
      const result = warrantyService._checkProductEligibility({
        category_slug: 'electronics',
        manufacturer_warranty_months: 12,
      });

      expect(result.eligible).toBe(true);
    });

    it('should return ineligible for clothing category', () => {
      const result = warrantyService._checkProductEligibility({
        category_slug: 'clothing',
        manufacturer_warranty_months: 0,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not eligible');
    });

    it('should return ineligible if manufacturer warranty > 12 months', () => {
      const result = warrantyService._checkProductEligibility({
        category_slug: 'electronics',
        manufacturer_warranty_months: 24,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('manufacturer warranty');
    });
  });
});
