/**
 * TeleTime POS - Register & Shift Management Routes
 * Handles register setup, shift open/close, and cash reconciliation
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let pool = null;
let cache = null;
let scheduledBatchEmailService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createRegisterSchema = Joi.object({
  registerName: Joi.string().trim().min(1).max(50).required(),
  location: Joi.string().trim().max(100).optional().allow('', null)
});

const openShiftSchema = Joi.object({
  registerId: Joi.number().integer().positive().required(),
  openingCash: Joi.number().precision(2).min(0).required()
});

const closeShiftSchema = Joi.object({
  shiftId: Joi.number().integer().positive().required(),
  closingCash: Joi.number().precision(2).min(0).required(),
  notes: Joi.string().max(1000).optional().allow('', null)
});

const updateRegisterSchema = Joi.object({
  registerName: Joi.string().trim().min(1).max(50).optional(),
  location: Joi.string().trim().max(100).optional().allow('', null),
  isActive: Joi.boolean().optional()
}).min(1);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/registers
 * List all registers with current shift info
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
      r.register_id,
      r.register_name,
      r.location,
      r.is_active,
      r.created_at,
      rs.shift_id as current_shift_id,
      rs.opened_at as shift_opened_at,
      rs.opening_cash,
      rs.user_id as shift_user_id,
      u.first_name || ' ' || u.last_name as shift_user_name,
      (
        SELECT COUNT(*)
        FROM transactions t
        WHERE t.shift_id = rs.shift_id AND t.status = 'completed'
      ) as transaction_count,
      (
        SELECT COALESCE(SUM(t.total_amount), 0)
        FROM transactions t
        WHERE t.shift_id = rs.shift_id AND t.status = 'completed'
      ) as shift_total_sales
    FROM registers r
    LEFT JOIN register_shifts rs ON r.register_id = rs.register_id AND rs.status = 'open'
    LEFT JOIN users u ON rs.user_id = u.id
    ORDER BY r.register_id`
  );

  res.json({
    success: true,
    data: result.rows.map(row => ({
      registerId: row.register_id,
      registerName: row.register_name,
      location: row.location,
      isActive: row.is_active,
      createdAt: row.created_at,
      currentShift: row.current_shift_id ? {
        shiftId: row.current_shift_id,
        openedAt: row.shift_opened_at,
        openingCash: parseFloat(row.opening_cash),
        userId: row.shift_user_id,
        userName: row.shift_user_name,
        transactionCount: parseInt(row.transaction_count, 10),
        totalSales: parseFloat(row.shift_total_sales)
      } : null
    }))
  });
}));

/**
 * POST /api/registers
 * Create a new register
 */
router.post('/', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { error, value } = createRegisterSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { registerName, location } = value;

  // Check for duplicate name
  const existingResult = await pool.query(
    'SELECT register_id FROM registers WHERE LOWER(register_name) = LOWER($1)',
    [registerName]
  );

  if (existingResult.rows.length > 0) {
    throw ApiError.conflict('A register with this name already exists');
  }

  const result = await pool.query(
    `INSERT INTO registers (register_name, location)
     VALUES ($1, $2)
     RETURNING register_id, register_name, location, is_active, created_at`,
    [registerName, location || null]
  );

  const register = result.rows[0];

  res.status(201).json({
    success: true,
    data: {
      registerId: register.register_id,
      registerName: register.register_name,
      location: register.location,
      isActive: register.is_active,
      createdAt: register.created_at
    }
  });
}));

/**
 * PUT /api/registers/:id
 * Update a register
 */
router.put('/:id', authenticate, requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ID is a valid integer
  const registerId = parseInt(id, 10);
  if (isNaN(registerId) || registerId <= 0) {
    throw ApiError.badRequest('Invalid register ID');
  }

  const { error, value } = updateRegisterSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { registerName, location, isActive } = value;

  // Check register exists
  const existingResult = await pool.query(
    'SELECT register_id FROM registers WHERE register_id = $1',
    [registerId]
  );

  if (existingResult.rows.length === 0) {
    throw ApiError.notFound('Register');
  }

  // Check for duplicate name if changing
  if (registerName) {
    const duplicateResult = await pool.query(
      'SELECT register_id FROM registers WHERE LOWER(register_name) = LOWER($1) AND register_id != $2',
      [registerName, registerId]
    );

    if (duplicateResult.rows.length > 0) {
      throw ApiError.conflict('A register with this name already exists');
    }
  }

  // Build update query
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (registerName !== undefined) {
    updates.push(`register_name = $${paramIndex}`);
    params.push(registerName);
    paramIndex++;
  }

  if (location !== undefined) {
    updates.push(`location = $${paramIndex}`);
    params.push(location || null);
    paramIndex++;
  }

  if (isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(isActive);
    paramIndex++;
  }

  params.push(registerId);

  const result = await pool.query(
    `UPDATE registers
     SET ${updates.join(', ')}
     WHERE register_id = $${paramIndex}
     RETURNING register_id, register_name, location, is_active, created_at`,
    params
  );

  const register = result.rows[0];

  res.json({
    success: true,
    data: {
      registerId: register.register_id,
      registerName: register.register_name,
      location: register.location,
      isActive: register.is_active,
      createdAt: register.created_at
    }
  });
}));

/**
 * POST /api/registers/open
 * Open a new shift on a register
 */
router.post('/open', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = openShiftSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { registerId, openingCash } = value;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check register exists and is active
    const registerResult = await client.query(
      'SELECT register_id, register_name, is_active FROM registers WHERE register_id = $1',
      [registerId]
    );

    if (registerResult.rows.length === 0) {
      throw ApiError.notFound('Register');
    }

    if (!registerResult.rows[0].is_active) {
      throw ApiError.badRequest('This register is not active');
    }

    // Check if register already has an open shift
    const openShiftResult = await client.query(
      `SELECT shift_id, user_id
       FROM register_shifts
       WHERE register_id = $1 AND status = 'open'`,
      [registerId]
    );

    if (openShiftResult.rows.length > 0) {
      const existingShift = openShiftResult.rows[0];
      throw ApiError.conflict(
        `Register already has an open shift (ID: ${existingShift.shift_id}). Please close it first.`
      );
    }

    // Check if user already has an open shift on another register
    const userShiftResult = await client.query(
      `SELECT rs.shift_id, r.register_name
       FROM register_shifts rs
       JOIN registers r ON rs.register_id = r.register_id
       WHERE rs.user_id = $1 AND rs.status = 'open'`,
      [userId]
    );

    if (userShiftResult.rows.length > 0) {
      const existingShift = userShiftResult.rows[0];
      throw ApiError.conflict(
        `You already have an open shift on ${existingShift.register_name}. Please close it first.`
      );
    }

    // Create new shift
    const shiftResult = await client.query(
      `INSERT INTO register_shifts (register_id, user_id, opening_cash, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING shift_id, opened_at, opening_cash`,
      [registerId, userId, openingCash]
    );

    await client.query('COMMIT');

    const shift = shiftResult.rows[0];

    res.status(201).json({
      success: true,
      data: {
        shiftId: shift.shift_id,
        registerId,
        registerName: registerResult.rows[0].register_name,
        openedAt: shift.opened_at,
        openingCash: parseFloat(shift.opening_cash),
        userId,
        userName: `${req.user.firstName} ${req.user.lastName}`
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/registers/active
 * Get the active shift for the current user
 */
router.get('/active', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT
      rs.shift_id,
      rs.register_id,
      r.register_name,
      r.location,
      rs.opened_at,
      rs.opening_cash,
      rs.status,
      (
        SELECT COUNT(*)
        FROM transactions t
        WHERE t.shift_id = rs.shift_id AND t.status = 'completed'
      ) as transaction_count,
      (
        SELECT COALESCE(SUM(t.total_amount), 0)
        FROM transactions t
        WHERE t.shift_id = rs.shift_id AND t.status = 'completed'
      ) as total_sales,
      (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        JOIN transactions t ON p.transaction_id = t.transaction_id
        WHERE t.shift_id = rs.shift_id
          AND t.status = 'completed'
          AND p.payment_method = 'cash'
          AND p.status = 'completed'
      ) as cash_received,
      (
        SELECT COALESCE(SUM(p.change_given), 0)
        FROM payments p
        JOIN transactions t ON p.transaction_id = t.transaction_id
        WHERE t.shift_id = rs.shift_id
          AND t.status = 'completed'
          AND p.payment_method = 'cash'
          AND p.status = 'completed'
      ) as change_given
    FROM register_shifts rs
    JOIN registers r ON rs.register_id = r.register_id
    WHERE rs.user_id = $1 AND rs.status = 'open'
    LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.json({
      success: true,
      data: null,
      message: 'No active shift found'
    });
  }

  const shift = result.rows[0];
  const expectedCash = parseFloat(shift.opening_cash) +
                       parseFloat(shift.cash_received) -
                       parseFloat(shift.change_given);

  res.json({
    success: true,
    data: {
      shiftId: shift.shift_id,
      registerId: shift.register_id,
      registerName: shift.register_name,
      location: shift.location,
      openedAt: shift.opened_at,
      openingCash: parseFloat(shift.opening_cash),
      status: shift.status,
      transactionCount: parseInt(shift.transaction_count, 10),
      totalSales: parseFloat(shift.total_sales),
      cashReceived: parseFloat(shift.cash_received),
      changeGiven: parseFloat(shift.change_given),
      expectedCash: parseFloat(expectedCash.toFixed(2))
    }
  });
}));

/**
 * GET /api/registers/shift/:shiftId
 * Get detailed shift information with running totals
 */
router.get('/shift/:shiftId', authenticate, asyncHandler(async (req, res) => {
  const { shiftId } = req.params;

  // Get shift details
  const shiftResult = await pool.query(
    `SELECT
      rs.*,
      r.register_name,
      r.location,
      u.first_name || ' ' || u.last_name as user_name
    FROM register_shifts rs
    JOIN registers r ON rs.register_id = r.register_id
    JOIN users u ON rs.user_id = u.id
    WHERE rs.shift_id = $1`,
    [shiftId]
  );

  if (shiftResult.rows.length === 0) {
    throw ApiError.notFound('Shift');
  }

  const shift = shiftResult.rows[0];

  // Get transaction totals
  const totalsResult = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE t.status = 'completed') as transaction_count,
      COUNT(*) FILTER (WHERE t.status = 'voided') as void_count,
      COUNT(*) FILTER (WHERE t.status = 'refunded') as refund_count,
      COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'completed'), 0) as total_sales,
      COALESCE(SUM(t.subtotal) FILTER (WHERE t.status = 'completed'), 0) as subtotal,
      COALESCE(SUM(t.discount_amount) FILTER (WHERE t.status = 'completed'), 0) as total_discounts,
      COALESCE(SUM(t.hst_amount + t.gst_amount + t.pst_amount) FILTER (WHERE t.status = 'completed'), 0) as total_tax
    FROM transactions t
    WHERE t.shift_id = $1`,
    [shiftId]
  );

  // Get payment breakdown
  const paymentsResult = await pool.query(
    `SELECT
      p.payment_method,
      COUNT(*) as count,
      COALESCE(SUM(p.amount), 0) as total,
      COALESCE(SUM(p.change_given), 0) as change_given
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.transaction_id
    WHERE t.shift_id = $1 AND t.status = 'completed' AND p.status = 'completed'
    GROUP BY p.payment_method`,
    [shiftId]
  );

  const totals = totalsResult.rows[0];
  const paymentBreakdown = {};
  let cashReceived = 0;
  let changeGiven = 0;

  paymentsResult.rows.forEach(row => {
    paymentBreakdown[row.payment_method] = {
      count: parseInt(row.count, 10),
      total: parseFloat(row.total)
    };
    if (row.payment_method === 'cash') {
      cashReceived = parseFloat(row.total);
      changeGiven = parseFloat(row.change_given);
    }
  });

  // Calculate expected cash
  const expectedCash = parseFloat(shift.opening_cash) + cashReceived - changeGiven;

  res.json({
    success: true,
    data: {
      shiftId: shift.shift_id,
      registerId: shift.register_id,
      registerName: shift.register_name,
      location: shift.location,
      userId: shift.user_id,
      userName: shift.user_name,
      openedAt: shift.opened_at,
      closedAt: shift.closed_at,
      status: shift.status,
      openingCash: parseFloat(shift.opening_cash),
      closingCash: shift.closing_cash ? parseFloat(shift.closing_cash) : null,
      expectedCash: parseFloat(expectedCash.toFixed(2)),
      cashVariance: shift.cash_variance ? parseFloat(shift.cash_variance) : null,
      notes: shift.notes,
      summary: {
        transactionCount: parseInt(totals.transaction_count, 10),
        voidCount: parseInt(totals.void_count, 10),
        refundCount: parseInt(totals.refund_count, 10),
        totalSales: parseFloat(totals.total_sales),
        subtotal: parseFloat(totals.subtotal),
        totalDiscounts: parseFloat(totals.total_discounts),
        totalTax: parseFloat(totals.total_tax),
        paymentBreakdown
      }
    }
  });
}));

/**
 * GET /api/registers/shift/:shiftId/transactions
 * Get all transactions for a shift
 */
router.get('/shift/:shiftId/transactions', authenticate, asyncHandler(async (req, res) => {
  const { shiftId } = req.params;

  // Verify shift exists
  const shiftResult = await pool.query(
    'SELECT shift_id FROM register_shifts WHERE shift_id = $1',
    [shiftId]
  );

  if (shiftResult.rows.length === 0) {
    throw ApiError.notFound('Shift');
  }

  // Get transactions
  const result = await pool.query(
    `SELECT
      t.transaction_id,
      t.transaction_number,
      t.customer_id,
      c.name as customer_name,
      t.subtotal,
      t.discount_amount,
      t.total_amount,
      t.status,
      t.created_at,
      t.completed_at,
      (
        SELECT json_agg(json_build_object(
          'paymentMethod', p.payment_method,
          'amount', p.amount
        ))
        FROM payments p
        WHERE p.transaction_id = t.transaction_id
      ) as payments,
      (
        SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.transaction_id
      ) as item_count
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.shift_id = $1
    ORDER BY t.created_at DESC`,
    [shiftId]
  );

  res.json({
    success: true,
    data: result.rows.map(row => ({
      transactionId: row.transaction_id,
      transactionNumber: row.transaction_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      subtotal: parseFloat(row.subtotal),
      discountAmount: parseFloat(row.discount_amount),
      totalAmount: parseFloat(row.total_amount),
      status: row.status,
      itemCount: parseInt(row.item_count, 10),
      payments: row.payments || [],
      createdAt: row.created_at,
      completedAt: row.completed_at
    }))
  });
}));

/**
 * POST /api/registers/close
 * Close an open shift
 */
router.post('/close', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = closeShiftSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw ApiError.badRequest('Validation failed');
  }

  const { shiftId, closingCash, notes } = value;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get shift with lock
    const shiftResult = await client.query(
      `SELECT rs.*, r.register_name
       FROM register_shifts rs
       JOIN registers r ON rs.register_id = r.register_id
       WHERE rs.shift_id = $1
       FOR UPDATE`,
      [shiftId]
    );

    if (shiftResult.rows.length === 0) {
      throw ApiError.notFound('Shift');
    }

    const shift = shiftResult.rows[0];

    if (shift.status !== 'open') {
      throw ApiError.badRequest('This shift is already closed');
    }

    // Check if user owns the shift or is admin/manager
    const isOwner = shift.user_id === userId;
    const isAdminOrManager = ['admin', 'manager'].includes(req.user.role?.toLowerCase());

    if (!isOwner && !isAdminOrManager) {
      throw ApiError.forbidden('You can only close your own shifts');
    }

    // Calculate expected cash
    const cashResult = await client.query(
      `SELECT
        COALESCE(SUM(p.amount), 0) as cash_received,
        COALESCE(SUM(p.change_given), 0) as change_given
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = $1
        AND t.status = 'completed'
        AND p.payment_method = 'cash'
        AND p.status = 'completed'`,
      [shiftId]
    );

    const cashData = cashResult.rows[0];
    const expectedCash = parseFloat(shift.opening_cash) +
                         parseFloat(cashData.cash_received) -
                         parseFloat(cashData.change_given);
    const variance = closingCash - expectedCash;

    // Update shift
    const updateResult = await client.query(
      `UPDATE register_shifts
       SET status = 'closed',
           closed_at = NOW(),
           closing_cash = $1,
           expected_cash = $2,
           cash_variance = $3,
           notes = $4
       WHERE shift_id = $5
       RETURNING closed_at`,
      [closingCash, expectedCash, variance, notes || null, shiftId]
    );

    await client.query('COMMIT');

    // Get final transaction summary
    const summaryResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as transaction_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) as total_sales
      FROM transactions
      WHERE shift_id = $1`,
      [shiftId]
    );

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        shiftId,
        registerName: shift.register_name,
        closedAt: updateResult.rows[0].closed_at,
        openingCash: parseFloat(shift.opening_cash),
        closingCash: parseFloat(closingCash.toFixed(2)),
        expectedCash: parseFloat(expectedCash.toFixed(2)),
        variance: parseFloat(variance.toFixed(2)),
        varianceStatus: variance === 0 ? 'balanced' : variance > 0 ? 'over' : 'short',
        transactionCount: parseInt(summary.transaction_count, 10),
        totalSales: parseFloat(summary.total_sales),
        notes
      }
    });

    // Trigger scheduled batch email if enabled (non-blocking)
    if (scheduledBatchEmailService) {
      scheduledBatchEmailService.onShiftEnd(shiftId, userId).catch(err => {
        console.error('[Register] Scheduled batch email error:', err);
      });
    }

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/registers/active-sales-reps
 * Get users who are currently on shift (active sales reps)
 * Falls back to all active users with sales/cashier roles if no shifts are open
 */
router.get('/active-sales-reps', authenticate, asyncHandler(async (req, res) => {
  // Get users currently on open shifts
  const onShiftResult = await pool.query(
    `SELECT DISTINCT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.role,
      u.department,
      u.job_title,
      u.avatar_url,
      r.register_name,
      rs.shift_id,
      rs.opened_at,
      true as is_on_shift
    FROM register_shifts rs
    JOIN users u ON rs.user_id = u.id
    JOIN registers r ON rs.register_id = r.register_id
    WHERE rs.status = 'open'
      AND u.is_active = true
    ORDER BY u.first_name, u.last_name`
  );

  // If there are users on shift, return them
  if (onShiftResult.rows.length > 0) {
    return res.json({
      success: true,
      data: {
        reps: onShiftResult.rows.map(row => ({
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          name: `${row.first_name} ${row.last_name}`,
          role: row.role,
          department: row.department,
          jobTitle: row.job_title,
          avatarUrl: row.avatar_url,
          registerName: row.register_name,
          shiftId: row.shift_id,
          shiftOpenedAt: row.opened_at,
          isOnShift: true
        })),
        source: 'shifts',
        count: onShiftResult.rows.length
      }
    });
  }

  // Fallback: Get all active users (for when no shifts are open)
  const allActiveResult = await pool.query(
    `SELECT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.role,
      u.department,
      u.job_title,
      u.avatar_url,
      false as is_on_shift
    FROM users u
    WHERE u.is_active = true
      AND u.role IN ('admin', 'manager', 'cashier', 'sales', 'user')
    ORDER BY u.first_name, u.last_name
    LIMIT 20`
  );

  res.json({
    success: true,
    data: {
      reps: allActiveResult.rows.map(row => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        name: `${row.first_name} ${row.last_name}`,
        role: row.role,
        department: row.department,
        jobTitle: row.job_title,
        avatarUrl: row.avatar_url,
        registerName: null,
        shiftId: null,
        shiftOpenedAt: null,
        isOnShift: false
      })),
      source: 'all_active',
      count: allActiveResult.rows.length
    }
  });
}));

/**
 * GET /api/registers/all-sales-reps
 * Get all active users for the full searchable list
 */
router.get('/all-sales-reps', authenticate, asyncHandler(async (req, res) => {
  const { search } = req.query;

  let query = `
    SELECT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.role,
      u.department,
      u.job_title,
      u.avatar_url,
      EXISTS(
        SELECT 1 FROM register_shifts rs
        WHERE rs.user_id = u.id AND rs.status = 'open'
      ) as is_on_shift
    FROM users u
    WHERE u.is_active = true
  `;

  const params = [];

  if (search) {
    query += ` AND (
      u.first_name ILIKE $1 OR
      u.last_name ILIKE $1 OR
      (u.first_name || ' ' || u.last_name) ILIKE $1 OR
      u.email ILIKE $1
    )`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY u.first_name, u.last_name LIMIT 50`;

  const result = await pool.query(query, params);

  res.json({
    success: true,
    data: {
      reps: result.rows.map(row => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        name: `${row.first_name} ${row.last_name}`,
        role: row.role,
        department: row.department,
        jobTitle: row.job_title,
        avatarUrl: row.avatar_url,
        isOnShift: row.is_on_shift
      })),
      count: result.rows.length
    }
  });
}));

/**
 * DELETE /api/registers/:id
 * Deactivate a register (soft delete)
 */
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check for open shifts
  const openShiftResult = await pool.query(
    "SELECT shift_id FROM register_shifts WHERE register_id = $1 AND status = 'open'",
    [id]
  );

  if (openShiftResult.rows.length > 0) {
    throw ApiError.badRequest('Cannot deactivate register with an open shift');
  }

  const result = await pool.query(
    `UPDATE registers
     SET is_active = false
     WHERE register_id = $1
     RETURNING register_id, register_name`,
    [id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Register');
  }

  res.json({
    success: true,
    message: `Register '${result.rows[0].register_name}' has been deactivated`
  });
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize routes with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 * @returns {Router} Express router instance
 */
const init = (deps) => {
  pool = deps.pool;
  cache = deps.cache;
  scheduledBatchEmailService = deps.scheduledBatchEmailService || null;
  return router;
};

module.exports = { init };
