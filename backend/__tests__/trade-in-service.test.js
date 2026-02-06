/**
 * TradeInService Tests
 */

const TradeInService = require('../services/TradeInService');

describe('TradeInService', () => {
  let service;
  let mockPool;

  beforeEach(() => {
    // Mock database pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
    };

    service = new TradeInService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // searchTradeInProducts Tests
  // ============================================================================

  describe('searchTradeInProducts', () => {
    it('should search products by brand', async () => {
      const mockProducts = [
        {
          id: 1,
          category_id: 1,
          brand: 'Apple',
          model: 'iPhone 15 Pro',
          variant: '256GB',
          base_value: '850.00',
          category_name: 'Smartphones',
          requires_serial: true,
          requires_imei: true,
          is_age_acceptable: true,
          condition_values: [],
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: mockProducts })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await service.searchTradeInProducts({ brand: 'Apple' });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].brand).toBe('Apple');
      expect(result.pagination.total).toBe(1);
    });

    it('should search products by general search term', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await service.searchTradeInProducts({ searchTerm: 'Galaxy' });

      expect(result.products).toHaveLength(0);
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockPool.query.mock.calls[0][1]).toContain('%Galaxy%');
    });

    it('should filter by category', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await service.searchTradeInProducts({ categoryId: 1 });

      expect(mockPool.query.mock.calls[0][1]).toContain(1);
    });

    it('should respect pagination limits', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      const result = await service.searchTradeInProducts({}, { limit: 10, offset: 20 });

      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(20);
      expect(result.pagination.hasMore).toBe(true);
    });
  });

  // ============================================================================
  // assessTradeIn Tests
  // ============================================================================

  describe('assessTradeIn', () => {
    const mockProduct = {
      id: 1,
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      variant: '256GB',
      base_value: '850.00',
      release_year: 2023,
      category_name: 'Smartphones',
      requires_serial: true,
      requires_imei: true,
      max_age_years: 5,
      override_max_age_years: null,
      specifications: { storage: '256GB' },
    };

    const mockCondition = {
      id: 2,
      condition_name: 'Good',
      condition_code: 'GD',
      value_multiplier: '0.800',
      condition_criteria: 'Light wear',
      checklist: [],
    };

    it('should calculate trade-in value correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockProduct] })
        .mockResolvedValueOnce({ rows: [mockCondition] });

      const result = await service.assessTradeIn(1, 2, {
        serialNumber: 'ABC123',
        imei: '356938035643809', // Valid IMEI that passes Luhn check
      });

      expect(result.calculation.baseValue).toBe(850);
      expect(result.calculation.conditionMultiplier).toBe(0.8);
      expect(result.calculation.assessedValue).toBe(680); // 850 * 0.8
      expect(result.product.brand).toBe('Apple');
      expect(result.condition.name).toBe('Good');
    });

    it('should throw error if serial number required but not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      await expect(
        service.assessTradeIn(1, 2, { imei: '356938035643809' })
      ).rejects.toThrow('Serial number is required');
    });

    it('should throw error if IMEI required but not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      await expect(
        service.assessTradeIn(1, 2, { serialNumber: 'ABC123' })
      ).rejects.toThrow('IMEI is required');
    });

    it('should throw error for invalid IMEI format', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      await expect(
        service.assessTradeIn(1, 2, { serialNumber: 'ABC123', imei: '12345' })
      ).rejects.toThrow('Invalid IMEI format');
    });

    it('should throw error if product too old', async () => {
      const oldProduct = { ...mockProduct, release_year: 2010, max_age_years: 5 };
      mockPool.query.mockResolvedValueOnce({ rows: [oldProduct] });

      await expect(
        service.assessTradeIn(1, 2, { serialNumber: 'ABC123', imei: '356938035643809' })
      ).rejects.toThrow('too old for trade-in');
    });

    it('should throw error if product not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.assessTradeIn(999, 2)).rejects.toThrow('Trade-in product not found');
    });

    it('should throw error if condition not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, requires_imei: false }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        service.assessTradeIn(1, 999, { serialNumber: 'ABC123' })
      ).rejects.toThrow('Invalid condition grade');
    });

    it('should include custom adjustment in value', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, requires_imei: false }] })
        .mockResolvedValueOnce({ rows: [mockCondition] });

      const result = await service.assessTradeIn(1, 2, {
        serialNumber: 'ABC123',
        customAdjustment: -50,
        adjustmentReason: 'Missing charger',
      });

      expect(result.calculation.adjustmentAmount).toBe(-50);
      expect(result.calculation.assessedValue).toBe(630); // (850 * 0.8) - 50
    });

    it('should flag when manager approval required', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockProduct, requires_imei: false }] })
        .mockResolvedValueOnce({ rows: [{ ...mockCondition, value_multiplier: '1.000' }] });

      const result = await service.assessTradeIn(1, 1, { serialNumber: 'ABC123' });

      expect(result.requiresManagerApproval).toBe(true);
      expect(result.calculation.assessedValue).toBe(850);
    });
  });

  // ============================================================================
  // createTradeInAssessment Tests
  // ============================================================================

  describe('createTradeInAssessment', () => {
    const mockProduct = {
      id: 1,
      base_value: '500.00',
      category_id: 1,
      requires_serial: true,
      requires_imei: false,
    };

    const mockCondition = {
      id: 2,
      value_multiplier: '0.800',
    };

    const mockInsertResult = {
      rows: [{
        id: 1,
        base_value: '500.00',
        condition_multiplier: '0.800',
        assessed_value: '400.00',
        final_value: '400.00',
        status: 'approved',
      }],
    };

    it('should create assessment with product ID', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockProduct] }) // Product lookup
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [mockCondition] }) // Condition lookup
        .mockResolvedValueOnce(mockInsertResult) // Insert
        .mockResolvedValueOnce({ rows: [{ ...mockInsertResult.rows[0], product_brand: 'Samsung' }] }); // getAssessment

      const result = await service.createTradeInAssessment({
        productId: 1,
        serialNumber: 'XYZ789',
        conditionId: 2,
        assessedBy: 1,
      });

      expect(result).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should throw error if neither productId nor custom details provided', async () => {
      await expect(
        service.createTradeInAssessment({
          conditionId: 2,
          assessedBy: 1,
        })
      ).rejects.toThrow('Either productId or custom product details required');
    });

    it('should throw error if serial number required but missing', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockProduct] });

      await expect(
        service.createTradeInAssessment({
          productId: 1,
          conditionId: 2,
          assessedBy: 1,
        })
      ).rejects.toThrow('Serial number is required');
    });

    it('should throw error for duplicate serial number', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockProduct] })
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // Duplicate found

      await expect(
        service.createTradeInAssessment({
          productId: 1,
          serialNumber: 'DUPLICATE123',
          conditionId: 2,
          assessedBy: 1,
        })
      ).rejects.toThrow('already has an active trade-in assessment');
    });

    it('should create assessment with custom product details', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [mockCondition] }) // Condition lookup
        .mockResolvedValueOnce(mockInsertResult) // Insert
        .mockResolvedValueOnce({ rows: [{ ...mockInsertResult.rows[0], custom_brand: 'Generic' }] }); // getAssessment

      const result = await service.createTradeInAssessment({
        customBrand: 'Generic',
        customModel: 'Old Phone',
        baseValue: 100,
        categoryId: 1,
        serialNumber: 'CUSTOM123',
        conditionId: 2,
        assessedBy: 1,
      });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // applyTradeInToCart Tests
  // ============================================================================

  describe('applyTradeInToCart', () => {
    const mockAssessment = {
      id: 1,
      status: 'approved',
      finalValue: 400,
      final_value: '400.00',
      serialNumber: 'ABC123',
      serial_number: 'ABC123',
      product_brand: 'Apple',
      product_model: 'iPhone 14',
      product_variant: '128GB',
      valid_until: new Date(Date.now() + 86400000), // Tomorrow
    };

    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should apply trade-in to cart successfully', async () => {
      // Mock getAssessment
      mockPool.query.mockResolvedValueOnce({
        rows: [mockAssessment],
      });

      // Mock cart query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          transaction_id: 1,
          total_amount: '1000.00',
          existing_trade_ins: '0',
          existing_trade_in_total: '0',
        }],
      });

      // Mock client queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Update assessment
        .mockResolvedValueOnce({}) // Insert line item
        .mockResolvedValueOnce({}) // Update transaction
        .mockResolvedValueOnce({}); // COMMIT

      // Mock final cart query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ subtotal: '600.00', total_amount: '600.00', total_trade_in_value: '400.00' }],
      });

      const result = await service.applyTradeInToCart(1, 1, { userId: 1 });

      expect(result.success).toBe(true);
      expect(result.tradeInValue).toBe(400);
      expect(result.newTotal).toBe(600);
    });

    it('should throw error if assessment already applied', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockAssessment, status: 'applied' }],
      });

      await expect(
        service.applyTradeInToCart(1, 1)
      ).rejects.toThrow('already been applied');
    });

    it('should throw error if assessment voided', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockAssessment, status: 'void' }],
      });

      await expect(
        service.applyTradeInToCart(1, 1)
      ).rejects.toThrow('has been voided');
    });

    it('should throw error if assessment requires approval', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          ...mockAssessment,
          status: 'pending',
          final_value: '600.00',
        }],
      });

      await expect(
        service.applyTradeInToCart(1, 1)
      ).rejects.toThrow('requires manager approval');
    });

    it('should throw error if trade-in exceeds cart total', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockAssessment] })
        .mockResolvedValueOnce({
          rows: [{
            transaction_id: 1,
            total_amount: '200.00', // Less than trade-in value
            existing_trade_ins: '0',
            existing_trade_in_total: '0',
          }],
        });

      await expect(
        service.applyTradeInToCart(1, 1)
      ).rejects.toThrow('would exceed purchase total');
    });

    it('should throw error if max trade-ins reached', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockAssessment] })
        .mockResolvedValueOnce({
          rows: [{
            transaction_id: 1,
            total_amount: '5000.00',
            existing_trade_ins: '5', // Max reached
            existing_trade_in_total: '2000.00',
          }],
        });

      await expect(
        service.applyTradeInToCart(1, 1)
      ).rejects.toThrow('Maximum 5 trade-ins');
    });
  });

  // ============================================================================
  // getCustomerTradeIns Tests
  // ============================================================================

  describe('getCustomerTradeIns', () => {
    it('should return customer trade-in history', async () => {
      const mockTradeIns = [
        {
          id: 1,
          product_brand: 'Apple',
          product_model: 'iPhone 13',
          final_value: '300.00',
          status: 'applied',
          condition_name: 'Good',
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: mockTradeIns })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            completed_count: '5',
            pending_count: '1',
            total_value_traded: '2500.00',
          }],
        });

      const result = await service.getCustomerTradeIns(123);

      expect(result.tradeIns).toHaveLength(1);
      expect(result.summary.completedCount).toBe(5);
      expect(result.summary.totalValueTraded).toBe(2500);
    });

    it('should filter by status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ completed_count: '0', pending_count: '0', total_value_traded: '0' }] });

      await service.getCustomerTradeIns(123, { status: 'pending' });

      expect(mockPool.query.mock.calls[0][1]).toContain('pending');
    });
  });

  // ============================================================================
  // voidTradeIn Tests
  // ============================================================================

  describe('voidTradeIn', () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should void a pending assessment', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'pending',
          final_value: '400.00',
          transaction_id: null,
        }],
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Update status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.voidTradeIn(1, 'Customer changed mind', { userId: 1 });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('void');
    });

    it('should reverse transaction when voiding applied trade-in', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'applied',
          final_value: '400.00',
          finalValue: 400,
          transaction_id: 123,
          transactionId: 123,
          serial_number: 'ABC123',
          serialNumber: 'ABC123',
        }],
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Delete line item
        .mockResolvedValueOnce({}) // Update transaction
        .mockResolvedValueOnce({}) // Update status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.voidTradeIn(1, 'Sale cancelled', { userId: 1 });

      expect(result.success).toBe(true);
      expect(result.transactionReversed).toBe(true);
      expect(result.reversedValue).toBe(400);
    });

    it('should throw error if already voided', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'void' }],
      });

      await expect(
        service.voidTradeIn(1, 'Test reason')
      ).rejects.toThrow('already been voided');
    });

    it('should throw error if reason too short', async () => {
      await expect(
        service.voidTradeIn(1, 'abc')
      ).rejects.toThrow('minimum 5 characters');
    });
  });

  // ============================================================================
  // Helper Method Tests
  // ============================================================================

  describe('_validateIMEI', () => {
    it('should validate correct IMEI', () => {
      // Valid test IMEIs that pass Luhn check
      expect(service._validateIMEI('490154203237518')).toBe(true);
    });

    it('should reject IMEI with wrong length', () => {
      expect(service._validateIMEI('12345678901234')).toBe(false); // 14 digits
      expect(service._validateIMEI('1234567890123456')).toBe(false); // 16 digits
    });

    it('should reject IMEI failing Luhn check', () => {
      expect(service._validateIMEI('123456789012345')).toBe(false);
    });

    it('should handle IMEI with formatting', () => {
      expect(service._validateIMEI('49-015420-323751-8')).toBe(true);
    });
  });

  describe('getCategories', () => {
    it('should return active categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Smartphones', requires_serial: true },
        { id: 2, name: 'TVs', requires_serial: true },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCategories });

      const result = await service.getCategories();

      expect(result).toHaveLength(2);
      expect(mockPool.query.mock.calls[0][0]).toContain('is_active = true');
    });
  });

  describe('getConditions', () => {
    it('should return formatted conditions', async () => {
      const mockConditions = [
        { id: 1, condition_name: 'Excellent', condition_code: 'EXC', value_multiplier: '1.000', color: 'green' },
        { id: 2, condition_name: 'Good', condition_code: 'GD', value_multiplier: '0.800', color: 'blue' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockConditions });

      const result = await service.getConditions();

      expect(result).toHaveLength(2);
      expect(result[0].multiplier).toBe(1);
      expect(result[1].multiplier).toBe(0.8);
    });
  });

  describe('approveTradeIn', () => {
    it('should approve pending assessment', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'pending',
            final_value: '600.00',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Update query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'approved',
            final_value: '600.00',
          }],
        });

      const result = await service.approveTradeIn(1, { userId: 1 });

      expect(result.status).toBe('approved');
    });

    it('should approve with override value', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'pending',
            final_value: '600.00',
            assessed_value: '600.00',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'approved',
            final_value: '550.00',
            override_value: '550.00',
            override_reason: 'Market adjustment',
          }],
        });

      const result = await service.approveTradeIn(1, {
        userId: 1,
        overrideValue: 550,
        overrideReason: 'Market adjustment',
      });

      expect(result.override.value).toBe(550);
    });

    it('should throw error if not pending', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'approved' }],
      });

      await expect(
        service.approveTradeIn(1, { userId: 1 })
      ).rejects.toThrow('Cannot approve assessment with status');
    });
  });

  describe('rejectTradeIn', () => {
    it('should reject pending assessment', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'pending' }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            status: 'rejected',
            status_reason: 'Device has water damage',
          }],
        });

      const result = await service.rejectTradeIn(1, 'Device has water damage', 1);

      expect(result.status).toBe('rejected');
    });

    it('should throw error if reason too short', async () => {
      await expect(
        service.rejectTradeIn(1, 'No', 1)
      ).rejects.toThrow('minimum 5 characters');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return assessments requiring approval', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, final_value: '600.00', status: 'pending', product_brand: 'Apple' },
          { id: 2, final_value: '700.00', status: 'pending', product_brand: 'Samsung' },
        ],
      });

      const result = await service.getPendingApprovals();

      expect(result).toHaveLength(2);
      expect(mockPool.query.mock.calls[0][1][0]).toBe(500); // Threshold
    });
  });
});
