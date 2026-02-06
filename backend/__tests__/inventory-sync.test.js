/**
 * TeleTime - InventorySyncService Unit Tests
 *
 * Tests for inventory synchronization between quotes and POS.
 */

const InventorySyncService = require('../services/InventorySyncService');

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(() => Promise.resolve(mockClient)),
};

describe('InventorySyncService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockPool.query.mockReset();
    service = new InventorySyncService(mockPool, null);
  });

  // ============================================================================
  // INVENTORY QUERIES
  // ============================================================================

  describe('getProductInventory', () => {
    it('should return product inventory details', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          model: 'TEST-001',
          qty_on_hand: 100,
          qty_reserved: 10,
          qty_available: 90,
          track_inventory: true,
          allow_backorder: false,
        }],
      });

      const result = await service.getProductInventory(1);

      expect(result).not.toBeNull();
      expect(result.qty_on_hand).toBe(100);
      expect(result.qty_reserved).toBe(10);
      expect(result.qty_available).toBe(90);
    });

    it('should return null for non-existent product', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getProductInventory(999);

      expect(result).toBeNull();
    });
  });

  describe('checkAvailability', () => {
    it('should confirm availability when stock is sufficient', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          qty_on_hand: 100,
          qty_reserved: 10,
          qty_available: 90,
          track_inventory: true,
          allow_backorder: false,
        }],
      });

      const result = await service.checkAvailability(1, 50);

      expect(result.available).toBe(true);
      expect(result.qtyAvailable).toBe(90);
    });

    it('should deny availability when stock is insufficient', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          qty_on_hand: 100,
          qty_reserved: 10,
          qty_available: 90,
          track_inventory: true,
          allow_backorder: false,
        }],
      });

      const result = await service.checkAvailability(1, 100);

      expect(result.available).toBe(false);
      expect(result.reason).toContain('Insufficient inventory');
    });

    it('should allow backorder when product permits', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          qty_on_hand: 10,
          qty_reserved: 5,
          qty_available: 5,
          track_inventory: true,
          allow_backorder: true,
        }],
      });

      const result = await service.checkAvailability(1, 20);

      expect(result.available).toBe(true);
      expect(result.backorder).toBe(true);
      expect(result.backorderQty).toBe(15);
    });

    it('should always be available when tracking is disabled', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          qty_on_hand: 0,
          qty_reserved: 0,
          qty_available: 0,
          track_inventory: false,
        }],
      });

      const result = await service.checkAvailability(1, 100);

      expect(result.available).toBe(true);
      expect(result.reason).toBe('Inventory tracking disabled');
    });
  });

  describe('checkBulkAvailability', () => {
    it('should check multiple products at once', async () => {
      // First product available
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, qty_on_hand: 100, qty_reserved: 0, qty_available: 100, track_inventory: true, allow_backorder: false }],
      });
      // Second product not available
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 2, qty_on_hand: 5, qty_reserved: 5, qty_available: 0, track_inventory: true, allow_backorder: false }],
      });

      const result = await service.checkBulkAvailability([
        { productId: 1, quantity: 10 },
        { productId: 2, quantity: 10 },
      ]);

      expect(result.allAvailable).toBe(false);
      expect(result.items[0].available).toBe(true);
      expect(result.items[1].available).toBe(false);
    });
  });

  // ============================================================================
  // RESERVATIONS
  // ============================================================================

  describe('createReservation', () => {
    it('should create reservation when inventory available', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: true,
          reservation_id: 1,
          reservation_number: 'RES-20240101-0001',
          message: 'Reservation created successfully',
        }],
      });

      const result = await service.createReservation({
        productId: 1,
        quantity: 10,
        quoteId: 100,
      });

      expect(result.success).toBe(true);
      expect(result.reservationId).toBe(1);
      expect(result.reservationNumber).toBe('RES-20240101-0001');
    });

    it('should fail when inventory insufficient', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: false,
          reservation_id: null,
          reservation_number: null,
          message: 'Insufficient inventory. Available: 5, Requested: 10',
        }],
      });

      const result = await service.createReservation({
        productId: 1,
        quantity: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient inventory');
    });
  });

  describe('reserveQuoteItems', () => {
    it('should reserve all items for a quote', async () => {
      // Set up transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ success: true, reservation_id: 1, reservation_number: 'RES-1' }] })
        .mockResolvedValueOnce({ rows: [{ success: true, reservation_id: 2, reservation_number: 'RES-2' }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.reserveQuoteItems(100, [
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 3 },
      ], { customerId: 50 });

      expect(result.success).toBe(true);
      expect(result.reservations).toHaveLength(2);
    });

    it('should rollback if any item fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ success: true, reservation_id: 1, reservation_number: 'RES-1' }] })
        .mockResolvedValueOnce({ rows: [{ success: false, message: 'Insufficient inventory' }] })
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await service.reserveQuoteItems(100, [
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 100 },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('releaseReservation', () => {
    it('should release active reservation', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ success: true, message: 'Released 10 units' }],
      });

      // Mock getReservation for cache invalidation
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, product_id: 1 }],
      });

      const result = await service.releaseReservation(1, 'Quote cancelled');

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // SALES DEDUCTIONS
  // ============================================================================

  describe('deductForSale', () => {
    it('should deduct inventory for sale', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: true,
          message: 'Inventory deducted successfully',
          transaction_log_id: 1,
        }],
      });

      const result = await service.deductForSale({
        productId: 1,
        quantity: 5,
        transactionId: 100,
      });

      expect(result.success).toBe(true);
      expect(result.transactionLogId).toBe(1);
    });

    it('should fail when insufficient stock and backorder disabled', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: false,
          message: 'Insufficient inventory. Available: 3, Requested: 5',
          transaction_log_id: null,
        }],
      });

      const result = await service.deductForSale({
        productId: 1,
        quantity: 5,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient inventory');
    });
  });

  describe('deductForTransaction', () => {
    it('should deduct all items for a transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ success: true, transaction_log_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ success: true, transaction_log_id: 2 }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.deductForTransaction([
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 3 },
      ], { transactionId: 100 });

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
    });

    it('should rollback if any deduction fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ success: true, transaction_log_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ success: false, message: 'Insufficient inventory' }] })
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await service.deductForTransaction([
        { productId: 1, quantity: 5 },
        { productId: 2, quantity: 100 },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ============================================================================
  // CONVERSION
  // ============================================================================

  describe('convertReservationToSale', () => {
    it('should convert reservation to sale', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: true,
          message: 'Converted 10 units to sale',
          quantity_converted: 10,
        }],
      });

      // Mock for cache invalidation
      mockPool.query.mockResolvedValueOnce({
        rows: [{ product_id: 1 }],
      });

      const result = await service.convertReservationToSale(1, 200);

      expect(result.success).toBe(true);
      expect(result.quantityConverted).toBe(10);
    });
  });

  describe('convertQuoteToOrder', () => {
    it('should convert all quote reservations', async () => {
      // Mock getQuoteReservations
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, product_id: 1, status: 'active', quantity: 5, quantity_fulfilled: 0 },
          { id: 2, product_id: 2, status: 'active', quantity: 3, quantity_fulfilled: 0 },
        ],
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ success: true, quantity_converted: 5 }] })
        .mockResolvedValueOnce({ rows: [{ success: true, quantity_converted: 3 }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.convertQuoteToOrder(100, 200);

      expect(result.success).toBe(true);
      expect(result.converted).toBe(2);
    });
  });

  // ============================================================================
  // RESTORATION
  // ============================================================================

  describe('restoreForVoid', () => {
    it('should restore inventory for voided transaction', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: true,
          message: 'Restored 5 units to inventory',
          transaction_log_id: 1,
        }],
      });

      const result = await service.restoreForVoid({
        productId: 1,
        quantity: 5,
        referenceType: 'pos_transaction',
        referenceId: 100,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Restored 5 units');
    });
  });

  // ============================================================================
  // ADJUSTMENTS
  // ============================================================================

  describe('adjustInventory', () => {
    it('should adjust inventory count', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          success: true,
          message: 'Inventory adjusted by 10 (was 90, now 100)',
          adjustment: 10,
        }],
      });

      const result = await service.adjustInventory(1, 100, 'Stock count correction');

      expect(result.success).toBe(true);
      expect(result.adjustment).toBe(10);
    });
  });

  describe('receiveInventory', () => {
    it('should receive inventory from supplier', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ qty_on_hand: 50, qty_reserved: 5 }] }) // Current qty
        .mockResolvedValueOnce({}) // UPDATE products
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Get location
        .mockResolvedValueOnce({}) // INSERT transaction
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.receiveInventory({
        productId: 1,
        quantity: 25,
        purchaseOrderNumber: 'PO-12345',
        unitCostCents: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(75);
    });
  });

  // ============================================================================
  // AUDIT & REPORTS
  // ============================================================================

  describe('getProductHistory', () => {
    it('should return transaction history for product', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, transaction_type: 'sale', quantity: -5, created_at: new Date() },
          { id: 2, transaction_type: 'receipt', quantity: 20, created_at: new Date() },
        ],
      });

      const history = await service.getProductHistory(1);

      expect(history).toHaveLength(2);
      expect(history[0].transaction_type).toBe('sale');
    });

    it('should filter by transaction types', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, transaction_type: 'sale', quantity: -5 },
        ],
      });

      await service.getProductHistory(1, { transactionTypes: ['sale'] });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('transaction_type = ANY'),
        expect.arrayContaining([['sale']])
      );
    });
  });

  describe('getLowStockProducts', () => {
    it('should return products below reorder point', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, model: 'LOW-001', qty_available: 3, reorder_point: 10 },
          { id: 2, model: 'LOW-002', qty_available: 5, reorder_point: 15 },
        ],
      });

      const products = await service.getLowStockProducts();

      expect(products).toHaveLength(2);
    });
  });
});
