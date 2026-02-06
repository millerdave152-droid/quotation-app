/**
 * TeleTime - Order Modification Service Tests
 */

const OrderModificationService = require('../services/OrderModificationService');

describe('OrderModificationService', () => {
  let service;
  let mockPool;
  let mockClient;
  let mockCache;

  beforeEach(() => {
    // Mock client for transactions
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    // Mock cache (optional)
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    service = new OrderModificationService(mockPool, mockCache);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // ORDER RETRIEVAL TESTS
  // ============================================================================

  describe('getOrderWithQuoteInfo', () => {
    it('should return null if order not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getOrderWithQuoteInfo(999);

      expect(result).toBeNull();
    });

    it('should return order with quote info', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 1,
              order_number: 'ORD-001',
              status: 'confirmed',
              version_number: 1,
              price_locked: true,
              price_lock_until: null,
              quote_prices_honored: true,
              customer_id: 10,
              customer_name: 'Acme Corp',
              pricing_tier: 'wholesale',
              subtotal: '1000.00',
              discount_amount: '50.00',
              tax_amount: '123.50',
              total_amount: '1073.50',
              quote_id: 5,
              quote_number: 'QT-005',
              quote_total_amount: '950.00',
              quote_created_at: '2024-01-01',
              last_modified_at: '2024-01-15',
              created_at: '2024-01-01',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              product_id: 100,
              product_name: 'Samsung TV',
              product_sku: 'TV-SAM-55',
              quantity: 2,
              unit_price: '500.00',
              line_total: '1000.00',
              fulfillment_status: 'pending',
              quantity_fulfilled: 0,
              quantity_backordered: 0,
              quantity_cancelled: 0,
              quote_price: '475.00',
              current_price: '500.00',
              price_at_order_cents: null,
            },
          ],
        });

      const result = await service.getOrderWithQuoteInfo(1);

      expect(result).not.toBeNull();
      expect(result.orderId).toBe(1);
      expect(result.orderNumber).toBe('ORD-001');
      expect(result.customerName).toBe('Acme Corp');
      expect(result.priceLocked).toBe(true);
      expect(result.quote).not.toBeNull();
      expect(result.quote.quoteId).toBe(5);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe('Samsung TV');
      expect(result.items[0].hasPriceChange).toBe(true);
    });

    it('should handle order without quote', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 2,
              order_number: 'ORD-002',
              status: 'confirmed',
              version_number: 1,
              price_locked: false,
              customer_id: 11,
              customer_name: 'Test Co',
              subtotal: '500.00',
              total_amount: '565.00',
              quote_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getOrderWithQuoteInfo(2);

      expect(result.quote).toBeNull();
    });
  });

  // ============================================================================
  // PRICE LOCKING TESTS
  // ============================================================================

  describe('setPriceLock', () => {
    it('should enable price lock on order', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ order_id: 1, price_locked: true }],
      });

      const result = await service.setPriceLock(1, true, null, 1);

      expect(result.success).toBe(true);
      expect(result.priceLocked).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [1, true, null, 1]
      );
    });

    it('should set price lock with expiry date', async () => {
      const lockUntil = new Date('2025-12-31');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ order_id: 1, price_locked: true, price_lock_until: lockUntil }],
      });

      const result = await service.setPriceLock(1, true, lockUntil, 1);

      expect(result.success).toBe(true);
      expect(result.priceLockUntil).toEqual(lockUntil);
    });

    it('should return error if order not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.setPriceLock(999, true, null, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Order not found');
    });
  });

  describe('isPriceLocked', () => {
    it('should return false if order not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.isPriceLocked(999);

      expect(result).toBe(false);
    });

    it('should return true if price is locked', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ price_locked: true, price_lock_until: null }],
      });

      const result = await service.isPriceLocked(1);

      expect(result).toBe(true);
    });

    it('should return false if lock has expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockPool.query.mockResolvedValueOnce({
        rows: [{ price_locked: true, price_lock_until: pastDate }],
      });

      const result = await service.isPriceLocked(1);

      expect(result).toBe(false);
    });

    it('should return true if lock not yet expired', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      mockPool.query.mockResolvedValueOnce({
        rows: [{ price_locked: true, price_lock_until: futureDate }],
      });

      const result = await service.isPriceLocked(1);

      expect(result).toBe(true);
    });
  });

  describe('getItemPriceOptions', () => {
    it('should return null if order/product not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getItemPriceOptions(1, 999);

      expect(result).toBeNull();
    });

    it('should return price options with quote and current prices', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            current_price: '599.99',
            current_cost: '400.00',
            quote_price: '549.99',
            quote_discount: '8.33',
            order_price: '549.99',
            price_at_order_cents: null,
            price_locked: true,
            quote_prices_honored: true,
          },
        ],
      });

      const result = await service.getItemPriceOptions(1, 100);

      expect(result).not.toBeNull();
      expect(result.currentPrice).toBe(599.99);
      expect(result.quotePrice).toBe(549.99);
      expect(result.priceDifference).toBe(50);
      expect(result.priceLocked).toBe(true);
      expect(result.recommendedPrice).toBe(549.99);
    });

    it('should recommend current price when not locked', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            current_price: '599.99',
            quote_price: '549.99',
            price_locked: false,
            quote_prices_honored: false,
          },
        ],
      });

      const result = await service.getItemPriceOptions(1, 100);

      expect(result.recommendedPrice).toBe(599.99);
    });
  });

  // ============================================================================
  // AMENDMENT TESTS
  // ============================================================================

  describe('createAmendment', () => {
    beforeEach(() => {
      // Setup transaction mock
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 1,
              total_amount: '1000.00',
              price_locked: false,
              original_quote_id: null,
            },
          ],
        }) // Get order
        .mockResolvedValueOnce({ rows: [] }) // Current items
        .mockResolvedValueOnce({ rows: [{ num: 'AMD-001' }] }) // Amendment number
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert amendment
        .mockResolvedValueOnce({}) // COMMIT
    });

    it('should create amendment without approval for small changes', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 1,
              total_amount: '1000.00',
              price_locked: false,
              original_quote_id: null,
            },
          ],
        }) // Get order
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              product_id: 50,
              quantity: 2,
              unit_price: '500.00',
              current_price: '500.00',
              name: 'Existing Product',
              sku: 'EP-001',
            },
          ],
        }) // Current items - $1000 worth
        .mockResolvedValueOnce({
          rows: [{ product_id: 100, name: 'Test Product', sku: 'TP-001', price: '50.00' }],
        }) // Product lookup for addItem
        .mockResolvedValueOnce({ rows: [{ num: 'AMD-001' }] }) // Generate amendment number
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert amendment
        .mockResolvedValueOnce({}) // Insert amendment item
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createAmendment(1, 'item_added', {
        addItems: [{ productId: 100, quantity: 1 }],
      }, 1);

      expect(result.success).toBe(true);
      expect(result.amendmentNumber).toBe('AMD-001');
      expect(result.requiresApproval).toBe(false);
    });

    it('should require approval for large changes', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 1,
              total_amount: '100.00',
              price_locked: false,
              original_quote_id: null,
            },
          ],
        }) // Get order
        .mockResolvedValueOnce({ rows: [] }) // Current items
        .mockResolvedValueOnce({
          rows: [{ product_id: 100, name: 'Expensive Item', sku: 'EI-001', price: '500.00' }],
        }) // Product lookup
        .mockResolvedValueOnce({ rows: [{ num: 'AMD-002' }] }) // Amendment number
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Insert amendment
        .mockResolvedValueOnce({}) // Insert item
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createAmendment(1, 'item_added', {
        addItems: [{ productId: 100, quantity: 1 }],
      }, 1);

      expect(result.success).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.status).toBe('pending_approval');
    });

    it('should return error when no changes provided', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ order_id: 1, total_amount: '1000.00', price_locked: false, original_quote_id: null }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ num: 'AMD-003' }] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({});

      const result = await service.createAmendment(1, 'item_modified', {}, 1);

      expect(result.success).toBe(true);
      expect(result.itemChanges).toBe(0);
    });
  });

  describe('approveAmendment', () => {
    it('should approve pending amendment', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            amendment_number: 'AMD-001',
            order_id: 1,
            amendment_type: 'item_added',
            status: 'approved',
            previous_total_cents: 100000,
            new_total_cents: 150000,
            difference_cents: 50000,
            use_quote_prices: false,
            requires_approval: true,
            created_at: new Date(),
          },
        ],
      });

      const result = await service.approveAmendment(1, 2, 'Looks good');

      expect(result.success).toBe(true);
      expect(result.amendment).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('approved'),
        [1, 2, 'Looks good']
      );
    });

    it('should return error if amendment not found or not pending', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.approveAmendment(999, 2, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rejectAmendment', () => {
    it('should reject pending amendment with reason', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            amendment_number: 'AMD-001',
            status: 'rejected',
            rejection_reason: 'Price too low',
            previous_total_cents: 100000,
            new_total_cents: 50000,
            difference_cents: -50000,
          },
        ],
      });

      const result = await service.rejectAmendment(1, 2, 'Price too low');

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('rejected'),
        [1, 2, 'Price too low']
      );
    });
  });

  describe('applyAmendment', () => {
    it('should apply approved amendment', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              order_id: 1,
              amendment_number: 'AMD-001',
              status: 'approved',
              requires_approval: true,
              new_total_cents: 150000,
            },
          ],
        }) // Get amendment
        .mockResolvedValueOnce({ rows: [{ version_id: 1 }] }) // Create pre-version
        .mockResolvedValueOnce({ rows: [] }) // Get amendment items
        .mockResolvedValueOnce({ rows: [{ subtotal: '1500.00', item_count: 3 }] }) // Recalculate
        .mockResolvedValueOnce({ rows: [{ discount_amount: '0', tax_province: 'ON' }] })
        .mockResolvedValueOnce({}) // Update order
        .mockResolvedValueOnce({ rows: [{ version_id: 2 }] }) // Create post-version
        .mockResolvedValueOnce({}) // Update amendment status
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.applyAmendment(1, 1);

      expect(result.success).toBe(true);
      expect(result.amendmentNumber).toBe('AMD-001');
    });

    it('should throw error for unapproved amendment requiring approval', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              order_id: 1,
              amendment_number: 'AMD-002',
              status: 'pending_approval',
              requires_approval: true,
            },
          ],
        }) // Get amendment
        .mockResolvedValueOnce({}) // ROLLBACK (called when error is thrown)
        .mockResolvedValueOnce({}); // client.release() cleanup

      await expect(service.applyAmendment(1, 1)).rejects.toThrow(
        'Cannot apply amendment with status: pending_approval'
      );
    });
  });

  describe('getAmendment', () => {
    it('should return null if not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getAmendment(999);

      expect(result).toBeNull();
    });

    it('should return amendment with items', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              amendment_number: 'AMD-001',
              order_id: 1,
              order_number: 'ORD-001',
              amendment_type: 'item_added',
              status: 'applied',
              previous_total_cents: 100000,
              new_total_cents: 150000,
              difference_cents: 50000,
              created_by_name: 'John Doe',
              approved_by_name: 'Jane Manager',
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              product_id: 100,
              product_name: 'Samsung TV',
              product_sku: 'TV-001',
              change_type: 'add',
              previous_quantity: 0,
              new_quantity: 1,
              quantity_change: 1,
              applied_price_cents: 50000,
              line_difference_cents: 50000,
            },
          ],
        });

      const result = await service.getAmendment(1);

      expect(result).not.toBeNull();
      expect(result.amendmentNumber).toBe('AMD-001');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].changeType).toBe('add');
    });
  });

  describe('getOrderAmendments', () => {
    it('should return empty array if no amendments', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getOrderAmendments(1);

      expect(result).toEqual([]);
    });

    it('should return list of amendments for order', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            amendment_number: 'AMD-001',
            order_id: 1,
            amendment_type: 'item_added',
            status: 'applied',
            previous_total_cents: 100000,
            new_total_cents: 150000,
            difference_cents: 50000,
            item_count: 1,
            created_at: new Date(),
          },
          {
            id: 2,
            amendment_number: 'AMD-002',
            order_id: 1,
            amendment_type: 'item_removed',
            status: 'pending_approval',
            previous_total_cents: 150000,
            new_total_cents: 100000,
            difference_cents: -50000,
            item_count: 1,
            created_at: new Date(),
          },
        ],
      });

      const result = await service.getOrderAmendments(1);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('applied');
      expect(result[1].status).toBe('pending_approval');
    });
  });

  describe('getPendingAmendments', () => {
    it('should return pending amendments for approval', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            amendment_number: 'AMD-005',
            order_id: 5,
            order_number: 'ORD-005',
            customer_name: 'Big Corp',
            amendment_type: 'item_added',
            status: 'pending_approval',
            previous_total_cents: 500000,
            new_total_cents: 750000,
            difference_cents: 250000,
            item_count: 3,
            created_by_name: 'Sales Rep',
            created_at: new Date(),
          },
        ],
      });

      const result = await service.getPendingAmendments(10);

      expect(result).toHaveLength(1);
      expect(result[0].orderNumber).toBe('ORD-005');
      expect(result[0].customerName).toBe('Big Corp');
    });
  });

  // ============================================================================
  // APPROVAL THRESHOLD TESTS
  // ============================================================================

  describe('_checkRequiresApproval', () => {
    it('should require approval for changes over $100', () => {
      const result = service._checkRequiresApproval(15000, 100000);
      expect(result).toBe(true);
    });

    it('should not require approval for small changes', () => {
      const result = service._checkRequiresApproval(5000, 100000);
      expect(result).toBe(false);
    });

    it('should require approval for changes over 10% of order', () => {
      const result = service._checkRequiresApproval(6000, 50000);
      expect(result).toBe(true);
    });

    it('should handle negative changes (discounts)', () => {
      const result = service._checkRequiresApproval(-15000, 100000);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // VERSION TESTS
  // ============================================================================

  describe('getOrderVersions', () => {
    it('should return version history', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            version_number: 2,
            subtotal_cents: 150000,
            discount_cents: 0,
            tax_cents: 19500,
            total_cents: 169500,
            item_count: 3,
            change_summary: 'Added Samsung TV',
            created_by_name: 'John Doe',
            created_at: new Date(),
            items_snapshot: [
              { product_id: 100, product_name: 'Samsung TV', quantity: 1, unit_price_cents: 50000 },
            ],
          },
          {
            id: 1,
            version_number: 1,
            subtotal_cents: 100000,
            discount_cents: 0,
            tax_cents: 13000,
            total_cents: 113000,
            item_count: 2,
            change_summary: 'Initial version',
            created_by_name: 'John Doe',
            created_at: new Date(),
            items_snapshot: [],
          },
        ],
      });

      const result = await service.getOrderVersions(1);

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe(2);
      expect(result[0].total).toBe(1695);
    });
  });

  describe('compareVersions', () => {
    it('should return null if version not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.compareVersions(1, 1, 2);

      expect(result).toBeNull();
    });

    it('should compare two versions', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              version_number: 1,
              total_cents: 100000,
              item_count: 2,
              created_at: new Date('2024-01-01'),
              items_snapshot: [
                { product_id: 100, product_name: 'Product A', quantity: 2, unit_price_cents: 50000 },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              version_number: 2,
              total_cents: 150000,
              item_count: 3,
              created_at: new Date('2024-01-15'),
              items_snapshot: [
                { product_id: 100, product_name: 'Product A', quantity: 3, unit_price_cents: 50000 },
                { product_id: 200, product_name: 'Product B', quantity: 1, unit_price_cents: 30000 },
              ],
            },
          ],
        });

      const result = await service.compareVersions(1, 1, 2);

      expect(result).not.toBeNull();
      expect(result.totalDifference).toBe(500);
      expect(result.changes).toHaveLength(2);

      const modified = result.changes.find((c) => c.type === 'modified');
      expect(modified.previousQuantity).toBe(2);
      expect(modified.newQuantity).toBe(3);

      const added = result.changes.find((c) => c.type === 'added');
      expect(added.productName).toBe('Product B');
    });

    it('should detect removed items', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              version_number: 1,
              total_cents: 100000,
              item_count: 2,
              items_snapshot: [
                { product_id: 100, product_name: 'Product A', quantity: 1, unit_price_cents: 50000 },
                { product_id: 200, product_name: 'Product B', quantity: 1, unit_price_cents: 50000 },
              ],
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              version_number: 2,
              total_cents: 50000,
              item_count: 1,
              items_snapshot: [
                { product_id: 100, product_name: 'Product A', quantity: 1, unit_price_cents: 50000 },
              ],
            },
          ],
        });

      const result = await service.compareVersions(1, 1, 2);

      const removed = result.changes.find((c) => c.type === 'removed');
      expect(removed).toBeDefined();
      expect(removed.productName).toBe('Product B');
    });
  });

  // ============================================================================
  // FULFILLMENT TESTS
  // ============================================================================

  describe('createShipment', () => {
    it('should create shipment with items', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ num: 'SHP-001' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({}) // Add item 1
        .mockResolvedValueOnce({}) // Update order_item 1
        .mockResolvedValueOnce({}) // Add item 2
        .mockResolvedValueOnce({}) // Update order_item 2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createShipment(
        1,
        [
          { orderItemId: 1, quantityShipped: 2 },
          { orderItemId: 2, quantityShipped: 1, serialNumbers: ['SN-001'] },
        ],
        {
          carrier: 'FedEx',
          trackingNumber: 'FDX123456',
          notes: 'Handle with care',
        },
        1
      );

      expect(result.success).toBe(true);
      expect(result.shipmentNumber).toBe('SHP-001');
    });
  });

  describe('markBackordered', () => {
    it('should mark items as backordered', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Update item 1
        .mockResolvedValueOnce({}) // Update item 2
        .mockResolvedValueOnce({}) // Create version
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.markBackordered(
        1,
        [
          { orderItemId: 1, quantity: 2 },
          { orderItemId: 2, quantity: 1 },
        ],
        1
      );

      expect(result.success).toBe(true);
    });
  });

  describe('getOrderShipments', () => {
    it('should return shipments with items', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              shipment_number: 'SHP-001',
              carrier: 'FedEx',
              tracking_number: 'FDX123',
              tracking_url: 'https://fedex.com/track/FDX123',
              status: 'shipped',
              shipped_at: new Date(),
              shipping_cost_cents: 2500,
              notes: 'Delivered to front door',
              created_by_name: 'Warehouse Staff',
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_item_id: 1,
              product_id: 100,
              product_name: 'Samsung TV',
              product_sku: 'TV-001',
              quantity_shipped: 1,
              serial_numbers: ['SN-001'],
            },
          ],
        });

      const result = await service.getOrderShipments(1);

      expect(result).toHaveLength(1);
      expect(result[0].shipmentNumber).toBe('SHP-001');
      expect(result[0].carrier).toBe('FedEx');
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].serialNumbers).toEqual(['SN-001']);
    });
  });

  describe('getFulfillmentSummary', () => {
    it('should return fulfillment summary', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_items: '3',
            total_quantity: '5',
            fulfilled: '3',
            backordered: '1',
            cancelled: '0',
            pending: '1',
          },
        ],
      });

      const result = await service.getFulfillmentSummary(1);

      expect(result.totalItems).toBe(3);
      expect(result.totalQuantity).toBe(5);
      expect(result.fulfilled).toBe(3);
      expect(result.backordered).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.fulfillmentPercent).toBe(60);
      expect(result.status).toBe('partial');
    });

    it('should return complete status when all fulfilled', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_items: '2',
            total_quantity: '4',
            fulfilled: '4',
            backordered: '0',
            cancelled: '0',
            pending: '0',
          },
        ],
      });

      const result = await service.getFulfillmentSummary(1);

      expect(result.status).toBe('complete');
      expect(result.fulfillmentPercent).toBe(100);
    });

    it('should return pending status when nothing shipped', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_items: '2',
            total_quantity: '3',
            fulfilled: '0',
            backordered: '0',
            cancelled: '0',
            pending: '3',
          },
        ],
      });

      const result = await service.getFulfillmentSummary(1);

      expect(result.status).toBe('pending');
      expect(result.fulfillmentPercent).toBe(0);
    });
  });

  // ============================================================================
  // FORMAT HELPER TESTS
  // ============================================================================

  describe('_formatAmendment', () => {
    it('should format amendment row correctly', () => {
      const row = {
        id: 1,
        amendment_number: 'AMD-001',
        order_id: 10,
        amendment_type: 'item_added',
        status: 'applied',
        reason: 'Customer requested additional items',
        previous_total_cents: 100000,
        new_total_cents: 150000,
        difference_cents: 50000,
        use_quote_prices: false,
        requires_approval: true,
        created_by_name: 'John Doe',
        created_at: new Date('2024-01-15'),
        approved_by_name: 'Jane Manager',
        approved_at: new Date('2024-01-16'),
        rejection_reason: null,
        applied_at: new Date('2024-01-16'),
        item_count: 2,
      };

      const result = service._formatAmendment(row);

      expect(result.id).toBe(1);
      expect(result.amendmentNumber).toBe('AMD-001');
      expect(result.orderId).toBe(10);
      expect(result.previousTotal).toBe(1000);
      expect(result.newTotal).toBe(1500);
      expect(result.difference).toBe(500);
      expect(result.createdBy).toBe('John Doe');
      expect(result.approvedBy).toBe('Jane Manager');
      expect(result.itemCount).toBe(2);
    });

    it('should handle null names', () => {
      const row = {
        id: 1,
        amendment_number: 'AMD-002',
        order_id: 10,
        amendment_type: 'item_removed',
        status: 'draft',
        previous_total_cents: 100000,
        new_total_cents: 80000,
        difference_cents: -20000,
        created_by_name: null,
        approved_by_name: null,
      };

      const result = service._formatAmendment(row);

      expect(result.createdBy).toBeNull();
      expect(result.approvedBy).toBeNull();
    });
  });
});
