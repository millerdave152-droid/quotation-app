/**
 * Customer Routes - v1 API
 * Handles customer management
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  ApiError,
  standardStack,
  adminStack,
  parsePagination,
  validate,
  validateId
} = require('../../shared/middleware');

const {
  customerSchema,
  updateCustomerSchema,
  paginationSchema,
  id
} = require('../../shared/validation/schemas');

const Joi = require('joi');

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

// Query schema for customer search
const customerQuerySchema = paginationSchema.keys({
  search: Joi.string().max(100).optional(),
  customerType: Joi.string().valid('Retail', 'Commercial', 'Wholesale', 'VIP').optional(),
  hasBalance: Joi.boolean().optional(),
  minCreditLimit: Joi.number().min(0).optional()
});

// ============================================================================
// CUSTOMER CRUD
// ============================================================================

/**
 * GET /api/v1/customers
 * List customers with search and filters
 */
router.get('/',
  ...standardStack,
  parsePagination(50, 500),
  validate(customerQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, offset, sortBy, sortOrder } = req.pagination;
    const { search, customerType, hasBalance, minCreditLimit } = req.query;

    let query = `
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.company,
        c.address,
        c.city,
        c.province,
        c.postal_code,
        c.customer_type,
        c.credit_limit,
        c.current_balance,
        c.available_credit,
        c.tax_number,
        c.payment_terms,
        c.notes,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM quotations q WHERE q.customer_id = c.id) as quote_count,
        (SELECT COUNT(*) FROM transactions t WHERE t.customer_id = c.id) as transaction_count
      FROM customers c
      WHERE c.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (c.name ILIKE $${paramIndex++} OR c.email ILIKE $${paramIndex++} OR c.phone ILIKE $${paramIndex++} OR c.company ILIKE $${paramIndex++})`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (customerType) {
      query += ` AND c.customer_type = $${paramIndex++}`;
      params.push(customerType);
    }

    if (hasBalance === true) {
      query += ` AND c.current_balance > 0`;
    } else if (hasBalance === false) {
      query += ` AND c.current_balance = 0`;
    }

    if (minCreditLimit !== undefined) {
      query += ` AND c.credit_limit >= $${paramIndex++}`;
      params.push(minCreditLimit);
    }

    // Count query
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Sorting
    const validSortFields = ['name', 'email', 'created_at', 'current_balance', 'credit_limit'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    query += ` ORDER BY c.${sortField} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
 * POST /api/v1/customers
 * Create new customer
 */
router.post('/',
  ...standardStack,
  validate(customerSchema),
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      phone,
      company,
      address,
      city,
      province,
      postalCode,
      customerType = 'Retail',
      taxNumber,
      creditLimit = 0,
      paymentTerms = 'immediate',
      notes
    } = req.body;

    // Check for duplicate phone
    const existingResult = await db.query(
      'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL',
      [phone]
    );

    if (existingResult.rows.length > 0) {
      throw ApiError.conflict('Customer with this phone number already exists');
    }

    // Check for duplicate email if provided
    if (email) {
      const emailResult = await db.query(
        'SELECT id FROM customers WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );

      if (emailResult.rows.length > 0) {
        throw ApiError.conflict('Customer with this email already exists');
      }
    }

    const creditLimitCents = Math.round(creditLimit * 100);

    const result = await db.query(`
      INSERT INTO customers (
        name, email, phone, company, address, city, province, postal_code,
        customer_type, tax_number, credit_limit, available_credit, payment_terms, notes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, email || null, phone, company || null, address || null,
      city || null, province || null, postalCode || null,
      customerType, taxNumber || null, creditLimitCents, paymentTerms, notes || null,
      req.user.id
    ]);

    res.status(201).success(result.rows[0]);
  })
);

/**
 * GET /api/v1/customers/:id
 * Get customer details
 */
router.get('/:id',
  ...standardStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        c.*,
        u.username as created_by_name
      FROM customers c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    const customer = result.rows[0];

    // Get recent quotes
    const quotesResult = await db.query(`
      SELECT id, quote_number, status, total, created_at
      FROM quotations
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [id]);

    // Get recent transactions
    const transactionsResult = await db.query(`
      SELECT transaction_id, transaction_number, status, total_cents, created_at
      FROM transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [id]);

    // Get account history (if applicable)
    const accountHistoryResult = await db.query(`
      SELECT
        'transaction' as type,
        t.transaction_id as reference_id,
        t.transaction_number as reference,
        p.amount_cents,
        t.created_at
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.customer_id = $1 AND p.payment_method = 'account'
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [id]);

    res.success({
      ...customer,
      recentQuotes: quotesResult.rows,
      recentTransactions: transactionsResult.rows,
      accountHistory: accountHistoryResult.rows
    });
  })
);

/**
 * PUT /api/v1/customers/:id
 * Update customer
 */
router.put('/:id',
  ...standardStack,
  validateId('id'),
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Check customer exists
    const existingResult = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    // Check for duplicate phone if being changed
    if (updates.phone) {
      const phoneResult = await db.query(
        'SELECT id FROM customers WHERE phone = $1 AND id != $2 AND deleted_at IS NULL',
        [updates.phone, id]
      );

      if (phoneResult.rows.length > 0) {
        throw ApiError.conflict('Another customer with this phone number already exists');
      }
    }

    // Check for duplicate email if being changed
    if (updates.email) {
      const emailResult = await db.query(
        'SELECT id FROM customers WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [updates.email, id]
      );

      if (emailResult.rows.length > 0) {
        throw ApiError.conflict('Another customer with this email already exists');
      }
    }

    // Build update query dynamically
    const fieldMap = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      company: 'company',
      address: 'address',
      city: 'city',
      province: 'province',
      postalCode: 'postal_code',
      customerType: 'customer_type',
      taxNumber: 'tax_number',
      paymentTerms: 'payment_terms',
      notes: 'notes'
    };

    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(updates[key] === '' ? null : updates[key]);
      }
    }

    // Handle credit limit separately (convert to cents)
    if (updates.creditLimit !== undefined) {
      const creditLimitCents = Math.round(updates.creditLimit * 100);
      setClauses.push(`credit_limit = $${paramIndex++}`);
      params.push(creditLimitCents);

      // Recalculate available credit
      const currentBalance = existingResult.rows[0].current_balance || 0;
      setClauses.push(`available_credit = $${paramIndex++}`);
      params.push(Math.max(0, creditLimitCents - currentBalance));
    }

    if (setClauses.length === 0) {
      return res.success(existingResult.rows[0]);
    }

    setClauses.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE customers
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    res.success(result.rows[0]);
  })
);

/**
 * DELETE /api/v1/customers/:id
 * Soft delete customer
 */
router.delete('/:id',
  ...adminStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check customer exists
    const existingResult = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    // Check for outstanding balance
    if (existingResult.rows[0].current_balance > 0) {
      throw ApiError.badRequest('Cannot delete customer with outstanding balance');
    }

    // Soft delete
    await db.query(
      'UPDATE customers SET deleted_at = NOW() WHERE id = $1',
      [id]
    );

    res.success({ message: 'Customer deleted successfully' });
  })
);

// ============================================================================
// CUSTOMER ACCOUNT OPERATIONS
// ============================================================================

/**
 * GET /api/v1/customers/:id/credit
 * Get customer credit info
 */
router.get('/:id/credit',
  ...standardStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        id,
        name,
        credit_limit,
        current_balance,
        available_credit,
        payment_terms
      FROM customers
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    res.success(result.rows[0]);
  })
);

/**
 * POST /api/v1/customers/:id/credit/adjust
 * Adjust customer credit (admin only)
 */
router.post('/:id/credit/adjust',
  ...adminStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adjustmentCents, reason } = req.body;

    if (!adjustmentCents || !reason) {
      throw ApiError.badRequest('adjustmentCents and reason are required');
    }

    const customerResult = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (customerResult.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    const customer = customerResult.rows[0];
    const newBalance = customer.current_balance + adjustmentCents;

    if (newBalance < 0) {
      throw ApiError.badRequest('Adjustment would result in negative balance');
    }

    const newAvailableCredit = Math.max(0, customer.credit_limit - newBalance);

    const result = await db.query(`
      UPDATE customers
      SET current_balance = $2,
          available_credit = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, newBalance, newAvailableCredit]);

    // Log the adjustment (assuming a credit_adjustments table exists)
    // await db.query(`
    //   INSERT INTO credit_adjustments (customer_id, adjustment_cents, reason, adjusted_by)
    //   VALUES ($1, $2, $3, $4)
    // `, [id, adjustmentCents, reason, req.user.id]);

    res.success({
      ...result.rows[0],
      adjustment: {
        amountCents: adjustmentCents,
        reason,
        adjustedBy: req.user.id
      }
    });
  })
);

/**
 * GET /api/v1/customers/:id/statement
 * Get customer account statement
 */
router.get('/:id/statement',
  ...standardStack,
  validateId('id'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const customerResult = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (customerResult.rows.length === 0) {
      throw ApiError.notFound('Customer not found');
    }

    let query = `
      SELECT
        'charge' as transaction_type,
        t.transaction_id as id,
        t.transaction_number as reference,
        p.amount_cents,
        t.created_at as date,
        'Account charge' as description
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.customer_id = $1 AND p.payment_method = 'account' AND t.status = 'completed'
    `;
    const params = [id];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND t.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND t.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ' ORDER BY date DESC';

    const result = await db.query(query, params);

    const customer = customerResult.rows[0];

    res.success({
      customer: {
        id: customer.id,
        name: customer.name,
        creditLimit: customer.credit_limit,
        currentBalance: customer.current_balance,
        availableCredit: customer.available_credit
      },
      transactions: result.rows,
      periodStart: startDate || null,
      periodEnd: endDate || null
    });
  })
);

/**
 * GET /api/v1/customers/stats
 * Get customer statistics
 */
router.get('/stats',
  ...standardStack,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN customer_type = 'Retail' THEN 1 END) as retail_count,
        COUNT(CASE WHEN customer_type = 'Commercial' THEN 1 END) as commercial_count,
        COUNT(CASE WHEN customer_type = 'Wholesale' THEN 1 END) as wholesale_count,
        COUNT(CASE WHEN customer_type = 'VIP' THEN 1 END) as vip_count,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) as with_balance_count,
        COALESCE(SUM(current_balance), 0) as total_outstanding_balance,
        COALESCE(SUM(credit_limit), 0) as total_credit_limit,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_last_30_days
      FROM customers
      WHERE deleted_at IS NULL
    `);

    res.success(result.rows[0]);
  })
);

module.exports = { router, init };
