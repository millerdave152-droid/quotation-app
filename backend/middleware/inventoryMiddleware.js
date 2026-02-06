/**
 * TeleTime - Inventory Middleware
 *
 * Automatically handles inventory operations for:
 * - Quote creation/update (optional reservation)
 * - Quote-to-order conversion (convert reservations to sales)
 * - POS transaction completion (immediate deduction)
 * - Order/transaction void (restore inventory)
 */

const InventorySyncService = require('../services/InventorySyncService');

/**
 * Factory function to create inventory middleware
 */
function createInventoryMiddleware(pool, cache = null) {
  const service = new InventorySyncService(pool, cache);

  return {
    service,

    /**
     * Middleware: Reserve inventory for quote items
     * Use after quote creation/update if reservation is enabled
     * SECURITY: Must be used after authenticate middleware
     *
     * Expected req.body: { quoteId, items: [{productId, quantity}], customerId }
     * Sets req.inventoryResult with reservation details
     */
    reserveForQuote: async (req, res, next) => {
      try {
        // SECURITY: Verify user is authenticated before inventory operations
        if (!req.user || !req.user.id) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required for inventory operations',
          });
        }

        const { quoteId, items, customerId, reserveInventory = true, expiresHours = 72 } = req.body;

        // Skip if reservation not requested
        if (!reserveInventory || !items || items.length === 0) {
          req.inventoryResult = { skipped: true, reason: 'Reservation not requested' };
          return next();
        }

        const result = await service.reserveQuoteItems(quoteId, items, {
          customerId,
          expiresHours,
          userId: req.user.id,
        });

        req.inventoryResult = result;

        if (!result.success) {
          // Don't fail the quote, just log the inventory issue
          console.warn(`Inventory reservation failed for quote ${quoteId}:`, result.errors);
        }

        next();
      } catch (error) {
        console.error('Inventory reservation middleware error:', error);
        req.inventoryResult = { error: error.message };
        next(); // Continue even if inventory fails
      }
    },

    /**
     * Middleware: Release inventory reservations for a cancelled/expired quote
     *
     * Expected req.params.quoteId or req.body.quoteId
     * Sets req.inventoryResult with release details
     */
    releaseQuoteReservations: async (req, res, next) => {
      try {
        const quoteId = req.params.quoteId || req.body.quoteId;
        const reason = req.body.reason || 'Quote cancelled';

        if (!quoteId) {
          req.inventoryResult = { skipped: true, reason: 'No quote ID' };
          return next();
        }

        const result = await service.releaseQuoteReservations(
          parseInt(quoteId),
          reason,
          req.user?.id
        );

        req.inventoryResult = result;
        next();
      } catch (error) {
        console.error('Inventory release middleware error:', error);
        req.inventoryResult = { error: error.message };
        next();
      }
    },

    /**
     * Middleware: Convert quote reservations to sales when quote becomes order
     *
     * Expected req.body: { quoteId, orderId }
     * Sets req.inventoryResult with conversion details
     */
    convertQuoteToOrder: async (req, res, next) => {
      try {
        const { quoteId, orderId } = req.body;

        if (!quoteId || !orderId) {
          req.inventoryResult = { skipped: true, reason: 'Missing quoteId or orderId' };
          return next();
        }

        const result = await service.convertQuoteToOrder(
          parseInt(quoteId),
          parseInt(orderId),
          req.user?.id
        );

        req.inventoryResult = result;
        next();
      } catch (error) {
        console.error('Quote conversion middleware error:', error);
        req.inventoryResult = { error: error.message };
        next();
      }
    },

    /**
     * Middleware: Deduct inventory for POS transaction
     * Use after transaction is validated but before completion
     * SECURITY: Must be used after authenticate middleware
     *
     * Expected req.body: { items: [{productId, quantity}], transactionId, referenceNumber }
     * Sets req.inventoryResult with deduction details
     * Returns error response if insufficient inventory (unless allowNegative)
     */
    deductForTransaction: (options = {}) => async (req, res, next) => {
      try {
        // SECURITY: Verify user is authenticated before inventory operations
        if (!req.user || !req.user.id) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required for inventory operations',
          });
        }

        const { items, transactionId, orderId, referenceNumber } = req.body;
        const { allowNegative = false, failOnError = true } = options;

        if (!items || items.length === 0) {
          req.inventoryResult = { skipped: true, reason: 'No items to deduct' };
          return next();
        }

        const result = await service.deductForTransaction(items, {
          transactionId,
          orderId,
          referenceNumber,
          userId: req.user.id,
          allowNegative,
        });

        req.inventoryResult = result;

        if (!result.success && failOnError) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient inventory',
            inventoryErrors: result.errors,
          });
        }

        next();
      } catch (error) {
        console.error('Inventory deduction middleware error:', error);
        req.inventoryResult = { error: error.message };

        if (options.failOnError) {
          return res.status(500).json({
            success: false,
            error: 'Inventory operation failed',
          });
        }

        next();
      }
    },

    /**
     * Middleware: Restore inventory for voided transaction
     *
     * Expected req.body: { items: [{productId, quantity}], transactionId, referenceNumber }
     * Sets req.inventoryResult with restoration details
     */
    restoreForVoid: async (req, res, next) => {
      try {
        const { items, transactionId, orderId, referenceNumber } = req.body;

        if (!items || items.length === 0) {
          req.inventoryResult = { skipped: true, reason: 'No items to restore' };
          return next();
        }

        const result = await service.restoreForVoidedTransaction(items, {
          referenceType: orderId ? 'order' : 'pos_transaction',
          referenceId: orderId || transactionId,
          referenceNumber,
          userId: req.user?.id,
        });

        req.inventoryResult = result;
        next();
      } catch (error) {
        console.error('Inventory restoration middleware error:', error);
        req.inventoryResult = { error: error.message };
        next();
      }
    },

    /**
     * Middleware: Check inventory availability before proceeding
     * Returns 400 if any items are unavailable
     *
     * Expected req.body: { items: [{productId, quantity}] }
     */
    checkAvailability: (options = {}) => async (req, res, next) => {
      try {
        const { items } = req.body;
        const { allowBackorder = false } = options;

        if (!items || items.length === 0) {
          return next();
        }

        const result = await service.checkBulkAvailability(items);

        if (!result.allAvailable && !allowBackorder) {
          const unavailable = result.items.filter(i => !i.available);
          return res.status(400).json({
            success: false,
            error: 'Some items are not available',
            unavailableItems: unavailable,
          });
        }

        req.availabilityCheck = result;
        next();
      } catch (error) {
        console.error('Availability check middleware error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to check inventory availability',
        });
      }
    },

    /**
     * Middleware: Auto-expire old reservations
     * Can be used with a scheduler or as a cleanup endpoint
     */
    expireReservations: async (req, res, next) => {
      try {
        const result = await service.expireOldReservations();
        req.expiredReservations = result;
        next();
      } catch (error) {
        console.error('Reservation expiry middleware error:', error);
        req.expiredReservations = { error: error.message };
        next();
      }
    },
  };
}

/**
 * Helper: Create inventory hooks for event-driven updates
 * These can be called from your quote/order services
 */
function createInventoryHooks(pool, cache = null) {
  const service = new InventorySyncService(pool, cache);

  return {
    /**
     * Call when a quote is created with items
     */
    async onQuoteCreated(quote, options = {}) {
      if (!options.reserveInventory) return null;

      const items = quote.items?.map(item => ({
        productId: item.product_id || item.productId,
        quantity: item.quantity,
        id: item.id,
      })) || [];

      if (items.length === 0) return null;

      return service.reserveQuoteItems(quote.id, items, {
        customerId: quote.customer_id || quote.customerId,
        expiresHours: options.expiresHours || 72,
        userId: options.userId,
      });
    },

    /**
     * Call when a quote is cancelled or expires
     */
    async onQuoteCancelled(quoteId, reason = 'Quote cancelled', userId = null) {
      return service.releaseQuoteReservations(quoteId, reason, userId);
    },

    /**
     * Call when a quote is converted to an order
     */
    async onQuoteConverted(quoteId, orderId, userId = null) {
      return service.convertQuoteToOrder(quoteId, orderId, userId);
    },

    /**
     * Call when a POS transaction is completed
     */
    async onTransactionCompleted(transaction, userId = null) {
      const items = transaction.items?.map(item => ({
        productId: item.product_id || item.productId,
        quantity: item.quantity,
      })) || [];

      if (items.length === 0) return null;

      return service.deductForTransaction(items, {
        transactionId: transaction.id,
        referenceNumber: transaction.transaction_number || transaction.transactionNumber,
        userId,
      });
    },

    /**
     * Call when a transaction is voided
     */
    async onTransactionVoided(transaction, userId = null) {
      const items = transaction.items?.map(item => ({
        productId: item.product_id || item.productId,
        quantity: item.quantity,
      })) || [];

      if (items.length === 0) return null;

      return service.restoreForVoidedTransaction(items, {
        referenceType: 'pos_transaction',
        referenceId: transaction.id,
        referenceNumber: transaction.transaction_number || transaction.transactionNumber,
        userId,
      });
    },

    /**
     * Call when processing a return
     */
    async onReturnProcessed(returnData, userId = null) {
      return service.processReturn({
        productId: returnData.productId,
        quantity: returnData.quantity,
        orderId: returnData.orderId,
        returnReason: returnData.reason || 'Customer return',
        userId,
      });
    },
  };
}

module.exports = {
  createInventoryMiddleware,
  createInventoryHooks,
};
