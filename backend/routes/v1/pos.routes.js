/**
 * POS Routes - v1 API
 * Handles transactions, registers, and shifts
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  ApiError,
  posStack,
  managerStack,
  adminStack,
  parsePagination,
  parseDateRange,
  normalizeMoneyFields,
  validate,
  validateId
} = require('../../shared/middleware');

const {
  createTransactionSchema,
  voidTransactionSchema,
  refundTransactionSchema,
  transactionQuerySchema,
  openShiftSchema,
  closeShiftSchema,
  createRegisterSchema,
  updateRegisterSchema
} = require('../../shared/validation/schemas');

// Dependencies injected via init()
let db;
let services;

/**
 * Initialize routes with dependencies
 */
const init = (deps) => {
  db = deps.db;
  services = deps.services || {};
  return router;
};

// ============================================================================
// TRANSACTIONS
// ============================================================================

/**
 * GET /api/v1/pos/transactions
 * List transactions with filters
 */
router.get('/transactions',
  ...posStack,
  parsePagination(50, 200),
  parseDateRange,
  validate(transactionQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset, sortBy, sortOrder } = req.pagination;
    const { startDate, endDate } = req.dateRange;
    const { status, shiftId, registerId, customerId, search } = req.query;

    let query = `
      SELECT
        t.transaction_id as id,
        t.transaction_number,
        t.shift_id,
        t.customer_id,
        c.name as customer_name,
        t.subtotal_cents,
        t.tax_cents,
        t.discount_cents,
        t.total_cents,
        t.status,
        t.created_at,
        t.completed_at,
        s.register_id,
        r.register_name,
        u.username as cashier_name,
        (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.transaction_id) as item_count
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN shifts s ON t.shift_id = s.shift_id
      LEFT JOIN registers r ON s.register_id = r.register_id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query += ` AND t.status = ANY($${paramIndex++})`;
      params.push(statuses);
    }

    if (shiftId) {
      query += ` AND t.shift_id = $${paramIndex++}`;
      params.push(shiftId);
    }

    if (registerId) {
      query += ` AND s.register_id = $${paramIndex++}`;
      params.push(registerId);
    }

    if (customerId) {
      query += ` AND t.customer_id = $${paramIndex++}`;
      params.push(customerId);
    }

    if (search) {
      query += ` AND (t.transaction_number ILIKE $${paramIndex++} OR c.name ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      query += ` AND t.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Count query
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Add sorting and pagination
    const validSortFields = ['created_at', 'total_cents', 'transaction_number'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    query += ` ORDER BY t.${sortField} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.success(result.rows, {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

/**
 * POST /api/v1/pos/transactions
 * Create new transaction
 */
router.post('/transactions',
  ...posStack,
  normalizeMoneyFields(),
  validate(createTransactionSchema),
  asyncHandler(async (req, res) => {
    const {
      shiftId,
      customerId,
      quoteId,
      salespersonId,
      items,
      payments,
      discountAmountCents = 0,
      discountReason,
      taxProvince = 'ON'
    } = req.body;

    // Verify shift is open
    const shiftResult = await db.query(
      'SELECT * FROM shifts WHERE shift_id = $1 AND status = $2',
      [shiftId, 'open']
    );

    if (shiftResult.rows.length === 0) {
      throw ApiError.badRequest('Shift is not open or does not exist');
    }

    // Generate transaction number
    const txnNumResult = await db.query(
      "SELECT 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 14) AS INTEGER)), 0) + 1, 4, '0') as next_number FROM transactions WHERE transaction_number LIKE 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '%'"
    );
    const transactionNumber = txnNumResult.rows[0].next_number;

    // Calculate totals
    let subtotalCents = 0;
    const processedItems = [];

    for (const item of items) {
      const productResult = await db.query(
        'SELECT id, name, model, sell_cents FROM products WHERE id = $1',
        [item.productId]
      );

      if (productResult.rows.length === 0) {
        throw ApiError.badRequest(`Product ${item.productId} not found`);
      }

      const product = productResult.rows[0];
      const unitPriceCents = item.unitPriceCents || product.sell_cents;
      const lineTotalCents = unitPriceCents * item.quantity;
      subtotalCents += lineTotalCents;

      processedItems.push({
        ...item,
        productName: product.name,
        productSku: product.model,
        unitPriceCents,
        lineTotalCents
      });
    }

    // Calculate tax
    const taxRates = { ON: 0.13, BC: 0.12, AB: 0.05, SK: 0.11, MB: 0.12, QC: 0.14975 };
    const taxRate = taxRates[taxProvince] || 0.13;
    const taxableAmount = subtotalCents - discountAmountCents;
    const taxCents = Math.round(taxableAmount * taxRate);
    const totalCents = taxableAmount + taxCents;

    // Verify payment totals
    const totalPaymentCents = payments.reduce((sum, p) => sum + (p.amountCents || 0), 0);
    if (totalPaymentCents < totalCents) {
      throw ApiError.badRequest(`Payment total (${totalPaymentCents}) is less than transaction total (${totalCents})`);
    }

    // Create transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const txnResult = await client.query(`
        INSERT INTO transactions (
          transaction_number, shift_id, customer_id, quote_id,
          subtotal_cents, tax_cents, discount_cents, total_cents,
          tax_rate, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        transactionNumber, shiftId, customerId, quoteId,
        subtotalCents, taxCents, discountAmountCents, totalCents,
        taxRate, 'completed', req.user.id
      ]);

      const transaction = txnResult.rows[0];

      // Insert items
      for (const item of processedItems) {
        await client.query(`
          INSERT INTO transaction_items (
            transaction_id, product_id, product_name, product_sku,
            quantity, unit_price_cents, discount_cents, line_total_cents
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          transaction.transaction_id, item.productId, item.productName, item.productSku,
          item.quantity, item.unitPriceCents, item.discountAmountCents || 0, item.lineTotalCents
        ]);
      }

      // Insert payments
      for (const payment of payments) {
        await client.query(`
          INSERT INTO payments (
            transaction_id, payment_method, amount_cents,
            cash_tendered_cents, change_cents
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          transaction.transaction_id,
          payment.paymentMethod,
          payment.amountCents,
          payment.cashTenderedCents || null,
          payment.cashTenderedCents ? payment.cashTenderedCents - payment.amountCents : null
        ]);
      }

      await client.query('COMMIT');

      res.status(201).success({
        id: transaction.transaction_id,
        transactionNumber: transaction.transaction_number,
        subtotalCents,
        taxCents,
        discountCents: discountAmountCents,
        totalCents,
        status: 'completed',
        itemCount: items.length,
        paymentCount: payments.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/pos/transactions/:id
 * Get transaction details
 */
router.get('/transactions/:id',
  ...posStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const txnResult = await db.query(`
      SELECT
        t.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        s.register_id,
        r.register_name,
        u.username as cashier_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN shifts s ON t.shift_id = s.shift_id
      LEFT JOIN registers r ON s.register_id = r.register_id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE t.transaction_id = $1
    `, [id]);

    if (txnResult.rows.length === 0) {
      throw ApiError.notFound('Transaction not found');
    }

    const transaction = txnResult.rows[0];

    // Get items
    const itemsResult = await db.query(`
      SELECT * FROM transaction_items WHERE transaction_id = $1 ORDER BY item_id
    `, [id]);

    // Get payments
    const paymentsResult = await db.query(`
      SELECT * FROM payments WHERE transaction_id = $1 ORDER BY payment_id
    `, [id]);

    res.success({
      ...transaction,
      items: itemsResult.rows,
      payments: paymentsResult.rows
    });
  })
);

/**
 * POST /api/v1/pos/transactions/:id/void
 * Void a transaction
 */
router.post('/transactions/:id/void',
  ...managerStack,
  validateId('id'),
  validate(voidTransactionSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const txnResult = await db.query(
      'SELECT * FROM transactions WHERE transaction_id = $1',
      [id]
    );

    if (txnResult.rows.length === 0) {
      throw ApiError.notFound('Transaction not found');
    }

    const transaction = txnResult.rows[0];

    if (transaction.status === 'voided') {
      throw ApiError.badRequest('Transaction is already voided');
    }

    await db.query(`
      UPDATE transactions
      SET status = 'voided', void_reason = $2, voided_by = $3, voided_at = NOW()
      WHERE transaction_id = $1
    `, [id, reason, req.user.id]);

    res.success({ message: 'Transaction voided successfully' });
  })
);

/**
 * POST /api/v1/pos/transactions/:id/refund
 * Process refund
 */
router.post('/transactions/:id/refund',
  ...managerStack,
  validateId('id'),
  normalizeMoneyFields(),
  validate(refundTransactionSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amountCents, items, reason } = req.body;

    const txnResult = await db.query(
      'SELECT * FROM transactions WHERE transaction_id = $1',
      [id]
    );

    if (txnResult.rows.length === 0) {
      throw ApiError.notFound('Transaction not found');
    }

    const transaction = txnResult.rows[0];

    if (transaction.status !== 'completed') {
      throw ApiError.badRequest('Can only refund completed transactions');
    }

    let refundAmountCents = amountCents;

    // Calculate refund from items if specified
    if (items && items.length > 0) {
      refundAmountCents = 0;
      for (const item of items) {
        const itemResult = await db.query(
          'SELECT * FROM transaction_items WHERE item_id = $1 AND transaction_id = $2',
          [item.itemId, id]
        );

        if (itemResult.rows.length === 0) {
          throw ApiError.badRequest(`Item ${item.itemId} not found in transaction`);
        }

        const txnItem = itemResult.rows[0];
        refundAmountCents += Math.round((txnItem.line_total_cents / txnItem.quantity) * item.quantity);
      }
    }

    if (refundAmountCents > transaction.total_cents) {
      throw ApiError.badRequest('Refund amount exceeds transaction total');
    }

    // Record refund
    await db.query(`
      UPDATE transactions
      SET status = 'refunded', refund_reason = $2, refund_amount_cents = $3, refunded_by = $4, refunded_at = NOW()
      WHERE transaction_id = $1
    `, [id, reason, refundAmountCents, req.user.id]);

    res.success({
      message: 'Refund processed successfully',
      refundAmountCents
    });
  })
);

// ============================================================================
// REGISTERS
// ============================================================================

/**
 * GET /api/v1/pos/registers
 * List all registers
 */
router.get('/registers',
  ...posStack,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT
        r.*,
        s.shift_id as current_shift_id,
        s.status as current_shift_status,
        u.username as current_user
      FROM registers r
      LEFT JOIN shifts s ON r.register_id = s.register_id AND s.status = 'open'
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY r.register_name
    `);

    res.success(result.rows);
  })
);

/**
 * POST /api/v1/pos/registers
 * Create new register
 */
router.post('/registers',
  ...adminStack,
  validate(createRegisterSchema),
  asyncHandler(async (req, res) => {
    const { registerName, location } = req.body;

    const result = await db.query(`
      INSERT INTO registers (register_name, location, is_active)
      VALUES ($1, $2, true)
      RETURNING *
    `, [registerName, location]);

    res.status(201).success(result.rows[0]);
  })
);

/**
 * GET /api/v1/pos/registers/:id
 * Get register details
 */
router.get('/registers/:id',
  ...posStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        r.*,
        s.shift_id as current_shift_id,
        s.status as current_shift_status,
        s.opening_cash_cents,
        u.username as current_user
      FROM registers r
      LEFT JOIN shifts s ON r.register_id = s.register_id AND s.status = 'open'
      LEFT JOIN users u ON s.user_id = u.id
      WHERE r.register_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Register not found');
    }

    res.success(result.rows[0]);
  })
);

/**
 * PUT /api/v1/pos/registers/:id
 * Update register
 */
router.put('/registers/:id',
  ...adminStack,
  validateId('id'),
  validate(updateRegisterSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { registerName, location, isActive } = req.body;

    const result = await db.query(`
      UPDATE registers
      SET register_name = COALESCE($2, register_name),
          location = COALESCE($3, location),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE register_id = $1
      RETURNING *
    `, [id, registerName, location, isActive]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Register not found');
    }

    res.success(result.rows[0]);
  })
);

// ============================================================================
// SHIFTS
// ============================================================================

/**
 * GET /api/v1/pos/shifts
 * List shifts with filters
 */
router.get('/shifts',
  ...posStack,
  parsePagination(50, 200),
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = req.pagination;
    const { startDate, endDate } = req.dateRange;
    const { registerId, status } = req.query;

    let query = `
      SELECT
        s.*,
        r.register_name,
        u.username,
        (SELECT COUNT(*) FROM transactions t WHERE t.shift_id = s.shift_id) as transaction_count,
        (SELECT COALESCE(SUM(total_cents), 0) FROM transactions t WHERE t.shift_id = s.shift_id AND t.status = 'completed') as total_sales_cents
      FROM shifts s
      JOIN registers r ON s.register_id = r.register_id
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (registerId) {
      query += ` AND s.register_id = $${paramIndex++}`;
      params.push(registerId);
    }

    if (status) {
      query += ` AND s.status = $${paramIndex++}`;
      params.push(status);
    }

    if (startDate) {
      query += ` AND s.opened_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND s.opened_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Pagination
    query += ` ORDER BY s.opened_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.success(result.rows, {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

/**
 * POST /api/v1/pos/shifts/open
 * Open a new shift
 */
router.post('/shifts/open',
  ...posStack,
  normalizeMoneyFields(),
  validate(openShiftSchema),
  asyncHandler(async (req, res) => {
    const { registerId } = req.query;
    const { openingCash, denominations } = req.body;

    if (!registerId) {
      throw ApiError.badRequest('registerId query parameter is required');
    }

    // Check register exists and is active
    const registerResult = await db.query(
      'SELECT * FROM registers WHERE register_id = $1 AND is_active = true',
      [registerId]
    );

    if (registerResult.rows.length === 0) {
      throw ApiError.notFound('Register not found or inactive');
    }

    // Check no open shift on this register
    const openShiftResult = await db.query(
      'SELECT * FROM shifts WHERE register_id = $1 AND status = $2',
      [registerId, 'open']
    );

    if (openShiftResult.rows.length > 0) {
      throw ApiError.badRequest('Register already has an open shift');
    }

    // Check user doesn't have another open shift
    const userShiftResult = await db.query(
      'SELECT * FROM shifts WHERE user_id = $1 AND status = $2',
      [req.user.id, 'open']
    );

    if (userShiftResult.rows.length > 0) {
      throw ApiError.badRequest('You already have an open shift on another register');
    }

    const openingCashCents = Math.round(openingCash * 100);

    const result = await db.query(`
      INSERT INTO shifts (register_id, user_id, opening_cash_cents, opening_denominations, status, opened_at)
      VALUES ($1, $2, $3, $4, 'open', NOW())
      RETURNING *
    `, [registerId, req.user.id, openingCashCents, denominations ? JSON.stringify(denominations) : null]);

    res.status(201).success(result.rows[0]);
  })
);

/**
 * POST /api/v1/pos/shifts/:id/close
 * Close a shift
 */
router.post('/shifts/:id/close',
  ...posStack,
  validateId('id'),
  normalizeMoneyFields(),
  validate(closeShiftSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { closingCash, denominations, blindClose } = req.body;

    const shiftResult = await db.query(
      'SELECT * FROM shifts WHERE shift_id = $1',
      [id]
    );

    if (shiftResult.rows.length === 0) {
      throw ApiError.notFound('Shift not found');
    }

    const shift = shiftResult.rows[0];

    if (shift.status !== 'open') {
      throw ApiError.badRequest('Shift is not open');
    }

    // Only the shift owner or manager can close
    const userRole = req.user.role?.toLowerCase();
    if (shift.user_id !== req.user.id && userRole !== 'admin' && userRole !== 'manager') {
      throw ApiError.forbidden('You can only close your own shift');
    }

    const closingCashCents = Math.round(closingCash * 100);

    // Calculate expected cash
    const salesResult = await db.query(`
      SELECT
        COALESCE(SUM(p.amount_cents), 0) as cash_sales,
        COALESCE(SUM(p.change_cents), 0) as change_given
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = $1 AND t.status = 'completed' AND p.payment_method = 'cash'
    `, [id]);

    const cashSales = parseInt(salesResult.rows[0]?.cash_sales || 0);
    const changeGiven = parseInt(salesResult.rows[0]?.change_given || 0);
    const expectedCashCents = shift.opening_cash_cents + cashSales - changeGiven;
    const varianceCents = closingCashCents - expectedCashCents;

    const result = await db.query(`
      UPDATE shifts
      SET status = 'closed',
          closing_cash_cents = $2,
          closing_denominations = $3,
          expected_cash_cents = $4,
          variance_cents = $5,
          closed_at = NOW()
      WHERE shift_id = $1
      RETURNING *
    `, [id, closingCashCents, denominations ? JSON.stringify(denominations) : null, expectedCashCents, varianceCents]);

    res.success({
      ...result.rows[0],
      expectedCashCents,
      varianceCents,
      varianceExplanation: varianceCents === 0 ? 'Balanced' :
        varianceCents > 0 ? 'Over by ' + (varianceCents / 100).toFixed(2) :
        'Short by ' + (Math.abs(varianceCents) / 100).toFixed(2)
    });
  })
);

/**
 * GET /api/v1/pos/shifts/:id
 * Get shift details
 */
router.get('/shifts/:id',
  ...posStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const shiftResult = await db.query(`
      SELECT
        s.*,
        r.register_name,
        u.username
      FROM shifts s
      JOIN registers r ON s.register_id = r.register_id
      JOIN users u ON s.user_id = u.id
      WHERE s.shift_id = $1
    `, [id]);

    if (shiftResult.rows.length === 0) {
      throw ApiError.notFound('Shift not found');
    }

    const shift = shiftResult.rows[0];

    // Get transaction summary
    const summaryResult = await db.query(`
      SELECT
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_cents ELSE 0 END), 0) as total_sales_cents,
        COALESCE(SUM(CASE WHEN status = 'voided' THEN total_cents ELSE 0 END), 0) as voided_cents,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN refund_amount_cents ELSE 0 END), 0) as refunded_cents
      FROM transactions
      WHERE shift_id = $1
    `, [id]);

    // Get payment breakdown
    const paymentResult = await db.query(`
      SELECT
        p.payment_method,
        COUNT(*) as count,
        COALESCE(SUM(p.amount_cents), 0) as total_cents
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = $1 AND t.status = 'completed'
      GROUP BY p.payment_method
    `, [id]);

    res.success({
      ...shift,
      summary: summaryResult.rows[0],
      paymentBreakdown: paymentResult.rows
    });
  })
);

/**
 * GET /api/v1/pos/shifts/current
 * Get current user's open shift
 */
router.get('/shifts/current',
  ...posStack,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT
        s.*,
        r.register_name,
        r.location
      FROM shifts s
      JOIN registers r ON s.register_id = r.register_id
      WHERE s.user_id = $1 AND s.status = 'open'
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.success(null);
    }

    res.success(result.rows[0]);
  })
);

module.exports = { router, init };
