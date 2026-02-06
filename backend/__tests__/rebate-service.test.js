/**
 * RebateService Tests
 * Tests for manufacturer rebate management
 */

const RebateService = require('../services/RebateService');

describe('RebateService', () => {
  let service;
  let mockDb;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    service = new RebateService(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // GET PRODUCT REBATES
  // ============================================================================

  describe('getProductRebates', () => {
    it('should return active rebates for a product', async () => {
      const mockRebates = [
        {
          rebate_id: 1,
          name: 'Samsung $100 Holiday Rebate',
          description: 'Get $100 off instantly',
          rebate_type: 'instant',
          amount: '100.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'Samsung',
          valid_from: '2026-01-01',
          valid_to: '2026-02-28',
          terms_url: 'https://samsung.com/rebate',
          submission_url: null,
          requires_upc: false,
          requires_receipt: true,
          requires_registration: false,
          claim_deadline_days: 30,
          stackable_with_promotions: true,
          stackable_with_other_rebates: false,
          max_claims_per_customer: null,
          min_quantity: 1,
          max_quantity: null,
          override_amount: null,
          product_name: 'Samsung Galaxy S24',
          product_price: '999.99',
          sku: 'SAM-S24-128',
          days_remaining: 32,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getProductRebates(123);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [123]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        rebateId: 1,
        name: 'Samsung $100 Holiday Rebate',
        rebateType: 'instant',
        amount: 100,
        manufacturer: 'Samsung',
      });
    });

    it('should return empty array when no rebates found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.getProductRebates(999);

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // GET CART REBATES
  // ============================================================================

  describe('getCartRebates', () => {
    it('should analyze cart and separate instant vs mail-in rebates', async () => {
      const cartItems = [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ];

      const mockRebates = [
        {
          rebate_id: 1,
          rebate_name: 'Instant Rebate',
          rebate_type: 'instant',
          amount: '50.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'Samsung',
          product_id: 1,
          product_name: 'Product A',
          product_price: '500.00',
          min_quantity: 1,
          max_quantity: null,
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: true,
          days_remaining: 30,
        },
        {
          rebate_id: 2,
          rebate_name: 'Mail-In Rebate',
          rebate_type: 'mail_in',
          amount: '100.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'Google',
          product_id: 2,
          product_name: 'Product B',
          product_price: '800.00',
          min_quantity: 1,
          max_quantity: 3,
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: false,
          claim_deadline_days: 45,
          submission_url: 'https://google.com/rebate',
          terms_url: 'https://google.com/terms',
          requires_upc: true,
          requires_receipt: true,
          days_remaining: 60,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getCartRebates(cartItems);

      expect(result.instantRebates).toHaveLength(1);
      expect(result.instantRebates[0]).toMatchObject({
        rebateId: 1,
        productId: 1,
        productName: 'Product A',
        amount: 50,
        applied: false,
      });

      expect(result.mailInRebates).toHaveLength(1);
      expect(result.mailInRebates[0]).toMatchObject({
        rebateId: 2,
        productId: 2,
        productName: 'Product B',
        amount: 200, // 2 units x $100
        submissionUrl: 'https://google.com/rebate',
      });
      expect(result.mailInRebates[0].instructions).toBeDefined();
      expect(result.mailInRebates[0].deadline).toBeDefined();

      expect(result.totalInstantSavings).toBe(50);
      expect(result.totalMailInSavings).toBe(200);
      expect(result.totalPotentialSavings).toBe(250);
    });

    it('should return empty result for empty cart', async () => {
      const result = await service.getCartRebates([]);

      expect(result).toEqual({
        instantRebates: [],
        mailInRebates: [],
        onlineRebates: [],
        totalInstantSavings: 0,
        totalMailInSavings: 0,
        totalOnlineSavings: 0,
        totalPotentialSavings: 0,
      });

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should respect minimum quantity requirements', async () => {
      const cartItems = [{ productId: 1, quantity: 1 }];

      const mockRebates = [
        {
          rebate_id: 1,
          rebate_name: 'Buy 2 Get Rebate',
          rebate_type: 'instant',
          amount: '50.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'Samsung',
          product_id: 1,
          product_name: 'Product A',
          product_price: '500.00',
          min_quantity: 2, // Requires 2 units
          max_quantity: null,
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: true,
          days_remaining: 30,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getCartRebates(cartItems);

      // Should not qualify because quantity is 1, but min is 2
      expect(result.instantRebates).toHaveLength(0);
      expect(result.totalInstantSavings).toBe(0);
    });

    it('should cap rebates at max_quantity', async () => {
      const cartItems = [{ productId: 1, quantity: 5 }];

      const mockRebates = [
        {
          rebate_id: 1,
          rebate_name: 'Limited Rebate',
          rebate_type: 'instant',
          amount: '20.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'Apple',
          product_id: 1,
          product_name: 'Product A',
          product_price: '100.00',
          min_quantity: 1,
          max_quantity: 3, // Max 3 units eligible
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: true,
          days_remaining: 30,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getCartRebates(cartItems);

      expect(result.instantRebates).toHaveLength(1);
      expect(result.instantRebates[0].quantity).toBe(3); // Capped at 3
      expect(result.instantRebates[0].amount).toBe(60); // 3 x $20
    });

    it('should calculate percent rebates correctly', async () => {
      const cartItems = [{ productId: 1, quantity: 1 }];

      const mockRebates = [
        {
          rebate_id: 1,
          rebate_name: '10% Rebate',
          rebate_type: 'instant',
          amount: '10.00', // 10%
          amount_type: 'percent',
          max_rebate_amount: '50.00', // Capped at $50
          manufacturer: 'Apple',
          product_id: 1,
          product_name: 'Expensive Product',
          product_price: '1000.00',
          min_quantity: 1,
          max_quantity: null,
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: true,
          days_remaining: 30,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getCartRebates(cartItems);

      // 10% of $1000 = $100, but capped at $50
      expect(result.instantRebates[0].amount).toBe(50);
    });

    it('should handle online rebates separately', async () => {
      const cartItems = [{ productId: 1, quantity: 1 }];

      const mockRebates = [
        {
          rebate_id: 1,
          rebate_name: 'Online Registration Rebate',
          rebate_type: 'online',
          amount: '75.00',
          amount_type: 'fixed',
          max_rebate_amount: null,
          manufacturer: 'OnePlus',
          product_id: 1,
          product_name: 'OnePlus Phone',
          product_price: '600.00',
          min_quantity: 1,
          max_quantity: null,
          override_amount: null,
          stackable_with_promotions: true,
          stackable_with_other_rebates: true,
          claim_deadline_days: 30,
          submission_url: 'https://oneplus.com/rebate',
          terms_url: 'https://oneplus.com/terms',
          requires_registration: true,
          days_remaining: 60,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRebates });

      const result = await service.getCartRebates(cartItems);

      expect(result.onlineRebates).toHaveLength(1);
      expect(result.onlineRebates[0]).toMatchObject({
        rebateId: 1,
        amount: 75,
        submissionUrl: 'https://oneplus.com/rebate',
      });
      expect(result.onlineRebates[0].instructions).toBeDefined();
      expect(result.totalOnlineSavings).toBe(75);
    });
  });

  // ============================================================================
  // APPLY INSTANT REBATE
  // ============================================================================

  describe('applyInstantRebate', () => {
    it('should apply instant rebate to transaction', async () => {
      const mockRebate = {
        id: 1,
        name: 'Instant Rebate',
        rebate_type: 'instant',
        amount: '50.00',
        amount_type: 'fixed',
        max_rebate_amount: null,
        manufacturer: 'Samsung',
        min_quantity: 1,
        max_quantity: null,
        override_amount: null,
      };

      const mockItem = {
        id: 10,
        quantity: 2,
        unit_price: '500.00',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] }) // Rebate query
        .mockResolvedValueOnce({ rows: [mockItem] }) // Item query
        .mockResolvedValueOnce({ rows: [] }) // Existing check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert applied_rebates
        .mockResolvedValueOnce({ rows: [] }) // Update transaction_items
        .mockResolvedValueOnce({ rows: [] }) // Update rebate count
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.applyInstantRebate(100, 1, 123, 1);

      expect(result.success).toBe(true);
      expect(result.rebateId).toBe(1);
      expect(result.amount).toBe(100); // 2 units x $50
      expect(result.quantity).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if rebate not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Empty rebate result

      await expect(
        service.applyInstantRebate(100, 999, 123, 1)
      ).rejects.toThrow('Rebate not found or not eligible for this product');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if product not in transaction', async () => {
      const mockRebate = {
        id: 1,
        name: 'Instant Rebate',
        rebate_type: 'instant',
        amount: '50.00',
        amount_type: 'fixed',
        min_quantity: 1,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] }) // Rebate found
        .mockResolvedValueOnce({ rows: [] }); // No item in transaction

      await expect(
        service.applyInstantRebate(100, 1, 123, 1)
      ).rejects.toThrow('Product not found in transaction');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if rebate already applied', async () => {
      const mockRebate = {
        id: 1,
        name: 'Instant Rebate',
        rebate_type: 'instant',
        amount: '50.00',
        amount_type: 'fixed',
        min_quantity: 1,
      };

      const mockItem = {
        id: 10,
        quantity: 1,
        unit_price: '500.00',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] })
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Already exists

      await expect(
        service.applyInstantRebate(100, 1, 123, 1)
      ).rejects.toThrow('Rebate already applied to this transaction');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should enforce minimum quantity requirement', async () => {
      const mockRebate = {
        id: 1,
        name: 'Buy 3 Rebate',
        rebate_type: 'instant',
        amount: '50.00',
        amount_type: 'fixed',
        min_quantity: 3,
      };

      const mockItem = {
        id: 10,
        quantity: 2, // Only 2, but need 3
        unit_price: '500.00',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] })
        .mockResolvedValueOnce({ rows: [mockItem] })
        .mockResolvedValueOnce({ rows: [] }); // No existing

      await expect(
        service.applyInstantRebate(100, 1, 123, 1)
      ).rejects.toThrow('Minimum quantity of 3 required for this rebate');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ============================================================================
  // CREATE REBATE CLAIM
  // ============================================================================

  describe('createRebateClaim', () => {
    it('should create a claim for mail-in rebate', async () => {
      const mockRebate = {
        id: 1,
        name: 'Mail-In Rebate',
        rebate_type: 'mail_in',
        amount: '100.00',
        amount_type: 'fixed',
        max_rebate_amount: null,
        manufacturer: 'Google',
        submission_url: 'https://google.com/rebate',
        terms_url: 'https://google.com/terms',
        requires_upc: true,
        requires_receipt: true,
        requires_registration: false,
        claim_deadline_days: 45,
        max_claims_per_customer: 2,
      };

      const mockOrderItems = [
        { product_id: 1, quantity: 1, unit_price: '800.00', product_name: 'Pixel 8' },
      ];

      const mockCustomer = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St',
        city: 'Toronto',
        state: 'ON',
        postal_code: 'M5V 1A1',
      };

      const mockClaim = {
        id: 1,
        rebate_id: 1,
        order_id: 100,
        customer_id: 50,
        claim_status: 'pending',
        rebate_amount: '100.00',
        quantity: 1,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] }) // Rebate query
        .mockResolvedValueOnce({ rows: [{ claim_count: '0' }] }) // Customer claims check
        .mockResolvedValueOnce({ rows: mockOrderItems }) // Order items
        .mockResolvedValueOnce({ rows: [mockCustomer] }) // Customer info
        .mockResolvedValueOnce({ rows: [mockClaim] }) // Insert claim
        .mockResolvedValueOnce({ rows: [] }) // Insert applied_rebates
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createRebateClaim(100, 1, 50);

      expect(result.claimId).toBe(1);
      expect(result.rebateAmount).toBe(100);
      expect(result.rebateType).toBe('mail_in');
      expect(result.submissionUrl).toBe('https://google.com/rebate');
      expect(result.requiresUpc).toBe(true);
      expect(result.instructions).toBeDefined();
      expect(result.instructions.steps).toContain('Cut out the UPC barcode from the product packaging');
    });

    it('should throw error if customer exceeds claim limit', async () => {
      const mockRebate = {
        id: 1,
        name: 'Mail-In Rebate',
        rebate_type: 'mail_in',
        amount: '100.00',
        amount_type: 'fixed',
        max_claims_per_customer: 1,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] })
        .mockResolvedValueOnce({ rows: [{ claim_count: '1' }] }); // Already has 1 claim

      await expect(
        service.createRebateClaim(100, 1, 50)
      ).rejects.toThrow('Maximum 1 claims per customer exceeded');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if no eligible products in order', async () => {
      const mockRebate = {
        id: 1,
        name: 'Mail-In Rebate',
        rebate_type: 'mail_in',
        amount: '100.00',
        amount_type: 'fixed',
        max_claims_per_customer: null,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRebate] })
        .mockResolvedValueOnce({ rows: [] }); // No eligible products

      await expect(
        service.createRebateClaim(100, 1, 50)
      ).rejects.toThrow('No eligible products found in order for this rebate');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  // ============================================================================
  // GET CUSTOMER REBATE CLAIMS
  // ============================================================================

  describe('getCustomerRebateClaims', () => {
    it('should return customer claims with deadlines', async () => {
      const mockClaims = [
        {
          claim_id: 1,
          status: 'pending',
          rebate_amount: '100.00',
          quantity: 1,
          submitted_at: null,
          claim_reference: null,
          processed_at: null,
          paid_at: null,
          payment_method: null,
          denial_reason: null,
          receipt_uploaded: false,
          upc_uploaded: false,
          registration_completed: false,
          created_at: '2026-01-15',
          rebate_id: 1,
          rebate_name: 'Google Pixel Rebate',
          rebate_description: 'Get $100 back',
          rebate_type: 'mail_in',
          manufacturer: 'Google',
          submission_url: 'https://google.com/rebate',
          terms_url: 'https://google.com/terms',
          requires_upc: true,
          requires_receipt: true,
          requires_registration: false,
          claim_deadline_days: 45,
          order_id: 100,
          order_date: '2026-01-15',
          submission_deadline: '2026-03-01',
          days_until_deadline: 33,
          products: [{ productId: 1, productName: 'Pixel 8', quantity: 1 }],
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockClaims });

      const result = await service.getCustomerRebateClaims(50);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [50]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        claimId: 1,
        status: 'pending',
        rebateAmount: 100,
      });
      expect(result[0].rebate.name).toBe('Google Pixel Rebate');
      expect(result[0].deadline.daysRemaining).toBe(33);
      expect(result[0].deadline.isUrgent).toBe(false);
      expect(result[0].requirements.upc.required).toBe(true);
      expect(result[0].requirements.upc.completed).toBe(false);
      expect(result[0].nextSteps).toHaveLength(2); // upload_receipt, upload_upc
    });

    it('should filter by status when provided', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await service.getCustomerRebateClaims(50, { status: 'submitted' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('claim_status = $2'),
        [50, 'submitted']
      );
    });

    it('should identify urgent claims (< 7 days remaining)', async () => {
      const mockClaims = [
        {
          claim_id: 1,
          status: 'pending',
          rebate_amount: '100.00',
          quantity: 1,
          submitted_at: null,
          claim_reference: null,
          processed_at: null,
          paid_at: null,
          payment_method: null,
          denial_reason: null,
          receipt_uploaded: true,
          upc_uploaded: true,
          registration_completed: false,
          created_at: '2026-01-15',
          rebate_id: 1,
          rebate_name: 'Urgent Rebate',
          rebate_description: 'Almost expired',
          rebate_type: 'mail_in',
          manufacturer: 'Test',
          submission_url: 'https://test.com',
          terms_url: null,
          requires_upc: true,
          requires_receipt: true,
          requires_registration: false,
          claim_deadline_days: 30,
          order_id: 100,
          order_date: '2026-01-15',
          submission_deadline: '2026-02-03',
          days_until_deadline: 5, // Urgent!
          products: [],
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockClaims });

      const result = await service.getCustomerRebateClaims(50);

      expect(result[0].deadline.isUrgent).toBe(true);
      expect(result[0].deadline.daysRemaining).toBe(5);
    });

    it('should identify expired claims', async () => {
      const mockClaims = [
        {
          claim_id: 1,
          status: 'pending',
          rebate_amount: '100.00',
          quantity: 1,
          submitted_at: null,
          claim_reference: null,
          processed_at: null,
          paid_at: null,
          payment_method: null,
          denial_reason: null,
          receipt_uploaded: false,
          upc_uploaded: false,
          registration_completed: false,
          created_at: '2025-12-01',
          rebate_id: 1,
          rebate_name: 'Expired Rebate',
          rebate_description: 'Too late',
          rebate_type: 'mail_in',
          manufacturer: 'Test',
          submission_url: 'https://test.com',
          terms_url: null,
          requires_upc: false,
          requires_receipt: true,
          requires_registration: false,
          claim_deadline_days: 30,
          order_id: 100,
          order_date: '2025-12-01',
          submission_deadline: '2025-12-31',
          days_until_deadline: -27, // Expired
          products: [],
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockClaims });

      const result = await service.getCustomerRebateClaims(50, { includeExpired: true });

      expect(result[0].deadline.isExpired).toBe(true);
    });
  });

  // ============================================================================
  // UPDATE CLAIM STATUS
  // ============================================================================

  describe('updateClaimStatus', () => {
    it('should update claim to submitted status', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 1, claim_status: 'submitted', claim_reference: 'REF123' }],
      });

      const result = await service.updateClaimStatus(1, 'submitted', {
        claimReference: 'REF123',
      });

      expect(result.claim_status).toBe('submitted');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('submitted_at = NOW()'),
        expect.arrayContaining([1, 'submitted', 'REF123'])
      );
    });

    it('should update claim to denied with reason', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 1, claim_status: 'denied', denial_reason: 'Invalid UPC' }],
      });

      const result = await service.updateClaimStatus(1, 'denied', {
        denialReason: 'Invalid UPC',
        userId: 5,
      });

      expect(result.claim_status).toBe('denied');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('denial_reason'),
        expect.arrayContaining([1, 'denied', 5, 'Invalid UPC'])
      );
    });

    it('should update claim to paid with payment info', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ id: 1, claim_status: 'paid', payment_method: 'check' }],
      });

      await service.updateClaimStatus(1, 'paid', {
        paymentMethod: 'check',
        paymentReference: 'CHK-12345',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('paid_at = NOW()'),
        expect.arrayContaining([1, 'paid', 'check', 'CHK-12345'])
      );
    });

    it('should throw error if claim not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        service.updateClaimStatus(999, 'submitted')
      ).rejects.toThrow('Claim not found');
    });
  });

  // ============================================================================
  // GET REBATE BY ID
  // ============================================================================

  describe('getRebateById', () => {
    it('should return rebate with eligible products', async () => {
      const mockRebate = {
        id: 1,
        name: 'Test Rebate',
        description: 'Test description',
        rebate_type: 'instant',
        amount: '50.00',
        amount_type: 'fixed',
        max_rebate_amount: null,
        manufacturer: 'Test',
        manufacturer_rebate_code: 'TEST-001',
        valid_from: '2026-01-01',
        valid_to: '2026-12-31',
        terms_url: 'https://test.com/terms',
        submission_url: null,
        requires_upc: false,
        requires_receipt: true,
        requires_registration: false,
        claim_deadline_days: 30,
        stackable_with_promotions: true,
        stackable_with_other_rebates: false,
        max_claims_per_customer: null,
        max_total_claims: 1000,
        current_claim_count: 50,
        eligible_products: [
          { productId: 1, categoryId: null, skuPattern: null, minQuantity: 1, maxQuantity: null },
          { productId: null, categoryId: 5, skuPattern: null, minQuantity: 1, maxQuantity: 3 },
        ],
      };

      mockDb.query.mockResolvedValue({ rows: [mockRebate] });

      const result = await service.getRebateById(1);

      expect(result).toMatchObject({
        rebateId: 1,
        name: 'Test Rebate',
        rebateType: 'instant',
        amount: 50,
      });
      expect(result.limits.total).toBe(1000);
      expect(result.limits.currentCount).toBe(50);
      expect(result.eligibleProducts).toHaveLength(2);
    });

    it('should return null if rebate not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await service.getRebateById(999);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // LIST ACTIVE REBATES
  // ============================================================================

  describe('listActiveRebates', () => {
    it('should return paginated list of active rebates', async () => {
      const mockRebates = [
        {
          id: 1,
          name: 'Rebate 1',
          rebate_type: 'instant',
          amount: '50.00',
          amount_type: 'fixed',
          manufacturer: 'Samsung',
          product_count: '3',
          category_count: '1',
          days_remaining: 30,
        },
        {
          id: 2,
          name: 'Rebate 2',
          rebate_type: 'mail_in',
          amount: '100.00',
          amount_type: 'fixed',
          manufacturer: 'Google',
          product_count: '5',
          category_count: '0',
          days_remaining: 60,
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockRebates })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      const result = await service.listActiveRebates({ page: 1, limit: 10 });

      expect(result.rebates).toHaveLength(2);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by manufacturer', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await service.listActiveRebates({ manufacturer: 'Samsung' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('r.manufacturer = $1'),
        expect.arrayContaining(['Samsung'])
      );
    });

    it('should filter by rebate type', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await service.listActiveRebates({ rebateType: 'mail_in' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('r.rebate_type = $1'),
        expect.arrayContaining(['mail_in'])
      );
    });
  });

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  describe('Helper Methods', () => {
    describe('_calculateRebateAmount', () => {
      it('should calculate fixed amount correctly', () => {
        const amount = service._calculateRebateAmount(50, 'fixed', 500, null);
        expect(amount).toBe(50);
      });

      it('should calculate percent amount correctly', () => {
        const amount = service._calculateRebateAmount(10, 'percent', 500, null);
        expect(amount).toBe(50); // 10% of 500
      });

      it('should cap percent at max amount', () => {
        const amount = service._calculateRebateAmount(20, 'percent', 1000, 100);
        // 20% of 1000 = 200, but capped at 100
        expect(amount).toBe(100);
      });
    });

    describe('_calculateDeadline', () => {
      it('should calculate deadline from days', () => {
        const deadline = service._calculateDeadline(30);
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + 30);

        expect(new Date(deadline).toDateString()).toBe(expectedDate.toDateString());
      });

      it('should return null if no days provided', () => {
        const deadline = service._calculateDeadline(null);
        expect(deadline).toBeNull();
      });
    });

    describe('_generateMailInInstructions', () => {
      it('should include UPC step when required', () => {
        const instructions = service._generateMailInInstructions({
          requires_upc: true,
          requires_receipt: true,
          submission_url: 'https://test.com',
          claim_deadline_days: 30,
        });

        expect(instructions.steps).toContain('Cut out the UPC barcode from the product packaging');
        expect(instructions.requiredDocuments).toContain('UPC barcode from packaging');
      });

      it('should include receipt step when required', () => {
        const instructions = service._generateMailInInstructions({
          requires_upc: false,
          requires_receipt: true,
          submission_url: 'https://test.com',
          claim_deadline_days: 30,
        });

        expect(instructions.steps).toContain('Keep your original receipt');
        expect(instructions.requiredDocuments).toContain('Original receipt or copy');
      });
    });

    describe('_generateOnlineInstructions', () => {
      it('should include registration step when required', () => {
        const instructions = service._generateOnlineInstructions({
          requires_registration: true,
          requires_receipt: false,
          submission_url: 'https://test.com',
          claim_deadline_days: 30,
        });

        expect(instructions.steps).toContain('Register your product on the manufacturer website');
        expect(instructions.requiredDocuments).toContain('Product registration confirmation');
      });
    });
  });
});
