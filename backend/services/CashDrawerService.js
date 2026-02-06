/**
 * Cash Drawer Service
 * Manages cash drawer operations for POS system
 * - Opening/closing drawers with cash counts
 * - Cash movements (paid-outs, drops, additions)
 * - Reconciliation and reporting
 */

class CashDrawerService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  // ============================================================================
  // DRAWER OPERATIONS
  // ============================================================================

  /**
   * Open a cash drawer (start shift)
   * @param {object} params - Opening parameters
   * @returns {Promise<object>} Shift details
   */
  async openDrawer(params) {
    const {
      registerId,
      userId,
      openingCash,
      denominations = null,
      notes = ''
    } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if there's already an open shift for this register
      const existingShift = await client.query(`
        SELECT shift_id, user_id FROM register_shifts
        WHERE register_id = $1 AND status = 'open'
      `, [registerId]);

      if (existingShift.rows.length > 0) {
        throw new Error(`Register already has an open shift (Shift #${existingShift.rows[0].shift_id})`);
      }

      // Create the shift
      const shiftResult = await client.query(`
        INSERT INTO register_shifts (
          register_id, user_id, opening_cash, status, drawer_status, notes
        ) VALUES ($1, $2, $3, 'open', 'open', $4)
        RETURNING shift_id, opened_at
      `, [registerId, userId, openingCash, notes]);

      const shift = shiftResult.rows[0];

      // Record denomination count if provided
      if (denominations) {
        const total = this.calculateDenominationTotal(denominations);
        await client.query(`
          INSERT INTO cash_counts (
            shift_id, count_type, counted_by, total_amount,
            bills_100, bills_50, bills_20, bills_10, bills_5,
            coins_200, coins_100, coins_25, coins_10, coins_5,
            rolls_200, rolls_100, rolls_25, rolls_10, rolls_5
          ) VALUES ($1, 'opening', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          shift.shift_id, userId, total,
          denominations.bills_100 || 0, denominations.bills_50 || 0,
          denominations.bills_20 || 0, denominations.bills_10 || 0,
          denominations.bills_5 || 0, denominations.coins_200 || 0,
          denominations.coins_100 || 0, denominations.coins_25 || 0,
          denominations.coins_10 || 0, denominations.coins_5 || 0,
          denominations.rolls_200 || 0, denominations.rolls_100 || 0,
          denominations.rolls_25 || 0, denominations.rolls_10 || 0,
          denominations.rolls_5 || 0
        ]);
      }

      // Log the action
      await this.logAudit(client, shift.shift_id, userId, 'shift_started', {
        openingCash,
        hasDenominations: !!denominations
      });

      await client.query('COMMIT');

      this.cache?.invalidatePattern('shifts:');

      return {
        shiftId: shift.shift_id,
        registerId,
        openedAt: shift.opened_at,
        openingCash,
        status: 'open'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close drawer and reconcile
   * @param {object} params - Closing parameters
   * @returns {Promise<object>} Closing summary
   */
  async closeDrawer(params) {
    const {
      shiftId,
      userId,
      closingCash,
      denominations = null,
      blindClose = false,
      notes = ''
    } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current shift
      const shiftResult = await client.query(`
        SELECT * FROM register_shifts WHERE shift_id = $1 FOR UPDATE
      `, [shiftId]);

      if (shiftResult.rows.length === 0) {
        throw new Error('Shift not found');
      }

      const shift = shiftResult.rows[0];

      if (shift.status !== 'open') {
        throw new Error('Shift is already closed');
      }

      // Calculate expected cash
      const expectedResult = await client.query(
        'SELECT calculate_expected_drawer_cash($1) as expected',
        [shiftId]
      );
      const expectedCash = parseFloat(expectedResult.rows[0].expected);

      // Record denomination count if provided
      if (denominations && !blindClose) {
        const total = this.calculateDenominationTotal(denominations);
        await client.query(`
          INSERT INTO cash_counts (
            shift_id, count_type, counted_by, total_amount,
            bills_100, bills_50, bills_20, bills_10, bills_5,
            coins_200, coins_100, coins_25, coins_10, coins_5,
            rolls_200, rolls_100, rolls_25, rolls_10, rolls_5
          ) VALUES ($1, 'closing', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          shiftId, userId, total,
          denominations.bills_100 || 0, denominations.bills_50 || 0,
          denominations.bills_20 || 0, denominations.bills_10 || 0,
          denominations.bills_5 || 0, denominations.coins_200 || 0,
          denominations.coins_100 || 0, denominations.coins_25 || 0,
          denominations.coins_10 || 0, denominations.coins_5 || 0,
          denominations.rolls_200 || 0, denominations.rolls_100 || 0,
          denominations.rolls_25 || 0, denominations.rolls_10 || 0,
          denominations.rolls_5 || 0
        ]);
      }

      // Calculate variance
      const variance = closingCash - expectedCash;

      // Update shift
      await client.query(`
        UPDATE register_shifts SET
          status = 'closed',
          drawer_status = 'closed',
          closing_cash = $2,
          expected_cash = $3,
          cash_variance = $4,
          closed_at = NOW(),
          closed_by = $5,
          blind_close = $6,
          notes = CASE WHEN $7 != '' THEN COALESCE(notes || E'\\n', '') || $7 ELSE notes END
        WHERE shift_id = $1
      `, [shiftId, closingCash, expectedCash, variance, userId, blindClose, notes]);

      // Log the action
      await this.logAudit(client, shiftId, userId, 'shift_ended', {
        closingCash,
        expectedCash,
        variance,
        blindClose
      });

      await client.query('COMMIT');

      // Get full summary
      const summary = await this.getShiftSummary(shiftId);

      this.cache?.invalidatePattern('shifts:');

      return summary;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CASH MOVEMENTS
  // ============================================================================

  /**
   * Record a cash movement (paid-out, drop, add)
   * @param {object} params - Movement parameters
   * @returns {Promise<object>} Movement record
   */
  async recordCashMovement(params) {
    const {
      shiftId,
      userId,
      movementType,
      amount,
      reason,
      referenceNumber = null,
      approvedBy = null,
      notes = ''
    } = params;

    // Validate movement type
    const validTypes = ['paid_out', 'drop', 'pickup', 'add', 'float_adjust', 'refund', 'correction'];
    if (!validTypes.includes(movementType)) {
      throw new Error(`Invalid movement type: ${movementType}`);
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // Use transaction to atomically check shift status and insert movement
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check shift is open with row lock
      const shiftCheck = await client.query(
        'SELECT status FROM register_shifts WHERE shift_id = $1 FOR UPDATE',
        [shiftId]
      );

      if (shiftCheck.rows.length === 0) {
        throw new Error('Shift not found');
      }

      if (shiftCheck.rows[0].status !== 'open') {
        throw new Error('Cannot add movement to closed shift');
      }

      // Determine if amount should be negative (cash out)
      const cashOutTypes = ['paid_out', 'drop', 'pickup', 'refund'];
      const recordedAmount = cashOutTypes.includes(movementType) ? -Math.abs(amount) : Math.abs(amount);

      const result = await client.query(`
        INSERT INTO cash_movements (
          shift_id, user_id, movement_type, amount, reason,
          reference_number, approved_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [shiftId, userId, movementType, recordedAmount, reason, referenceNumber, approvedBy, notes]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('shifts:');

      return {
        id: result.rows[0].id,
        shiftId,
        movementType,
        amount: Math.abs(amount),
        direction: recordedAmount < 0 ? 'out' : 'in',
        reason,
        referenceNumber,
        createdAt: result.rows[0].created_at
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get all movements for a shift
   * @param {number} shiftId - Shift ID
   * @returns {Promise<Array>} List of movements
   */
  async getShiftMovements(shiftId) {
    const result = await this.pool.query(`
      SELECT
        cm.*,
        u.first_name || ' ' || u.last_name as performed_by_name,
        approver.first_name || ' ' || approver.last_name as approved_by_name
      FROM cash_movements cm
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN users approver ON cm.approved_by = approver.id
      WHERE cm.shift_id = $1
      ORDER BY cm.created_at DESC
    `, [shiftId]);

    return result.rows.map(row => ({
      id: row.id,
      movementType: row.movement_type,
      amount: Math.abs(parseFloat(row.amount)),
      direction: parseFloat(row.amount) < 0 ? 'out' : 'in',
      reason: row.reason,
      referenceNumber: row.reference_number,
      performedBy: row.performed_by_name,
      approvedBy: row.approved_by_name,
      notes: row.notes,
      createdAt: row.created_at
    }));
  }

  // ============================================================================
  // RECONCILIATION & REPORTS
  // ============================================================================

  /**
   * Get detailed shift summary
   * @param {number} shiftId - Shift ID
   * @returns {Promise<object>} Shift summary
   */
  async getShiftSummary(shiftId) {
    // Get shift details
    const shiftResult = await this.pool.query(`
      SELECT
        rs.*,
        r.register_name,
        u.first_name || ' ' || u.last_name as cashier_name,
        closer.first_name || ' ' || closer.last_name as closed_by_name
      FROM register_shifts rs
      JOIN registers r ON rs.register_id = r.register_id
      JOIN users u ON rs.user_id = u.id
      LEFT JOIN users closer ON rs.closed_by = closer.id
      WHERE rs.shift_id = $1
    `, [shiftId]);

    if (shiftResult.rows.length === 0) {
      throw new Error('Shift not found');
    }

    const shift = shiftResult.rows[0];

    // Get cash summary from function
    const summaryResult = await this.pool.query(
      'SELECT * FROM get_shift_cash_summary($1)',
      [shiftId]
    );
    const cashSummary = summaryResult.rows[0];

    // Get transaction counts by payment method
    const paymentsResult = await this.pool.query(`
      SELECT
        p.payment_method,
        COUNT(*) as count,
        SUM(p.amount) as total
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.shift_id = $1 AND t.status = 'completed' AND p.status = 'completed'
      GROUP BY p.payment_method
    `, [shiftId]);

    const paymentsByMethod = {};
    paymentsResult.rows.forEach(row => {
      paymentsByMethod[row.payment_method] = {
        count: parseInt(row.count),
        total: parseFloat(row.total)
      };
    });

    // Get transaction stats
    const statsResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'voided') as voided_count,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunded_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) as total_sales,
        COALESCE(AVG(total_amount) FILTER (WHERE status = 'completed'), 0) as average_sale
      FROM transactions
      WHERE shift_id = $1
    `, [shiftId]);

    const stats = statsResult.rows[0];

    // Get cash counts if available
    const countsResult = await this.pool.query(`
      SELECT * FROM cash_counts
      WHERE shift_id = $1
      ORDER BY created_at
    `, [shiftId]);

    // Get movements
    const movements = await this.getShiftMovements(shiftId);

    return {
      shift: {
        shiftId: shift.shift_id,
        registerId: shift.register_id,
        registerName: shift.register_name,
        cashierName: shift.cashier_name,
        closedByName: shift.closed_by_name,
        status: shift.status,
        drawerStatus: shift.drawer_status,
        openedAt: shift.opened_at,
        closedAt: shift.closed_at,
        blindClose: shift.blind_close,
        notes: shift.notes
      },
      cash: {
        opening: parseFloat(cashSummary.opening_cash || 0),
        sales: parseFloat(cashSummary.cash_sales || 0),
        refunds: parseFloat(cashSummary.cash_refunds || 0),
        paidOuts: parseFloat(cashSummary.paid_outs || 0),
        drops: parseFloat(cashSummary.drops || 0),
        additions: parseFloat(cashSummary.additions || 0),
        expected: parseFloat(cashSummary.expected_cash || 0),
        actual: cashSummary.actual_cash ? parseFloat(cashSummary.actual_cash) : null,
        variance: cashSummary.variance ? parseFloat(cashSummary.variance) : null
      },
      transactions: {
        completed: parseInt(stats.completed_count),
        voided: parseInt(stats.voided_count),
        refunded: parseInt(stats.refunded_count),
        totalSales: parseFloat(stats.total_sales),
        averageSale: parseFloat(stats.average_sale)
      },
      paymentsByMethod,
      movements,
      cashCounts: countsResult.rows.map(c => ({
        type: c.count_type,
        total: parseFloat(c.total_amount),
        denominations: {
          bills_100: c.bills_100,
          bills_50: c.bills_50,
          bills_20: c.bills_20,
          bills_10: c.bills_10,
          bills_5: c.bills_5,
          coins_200: c.coins_200,
          coins_100: c.coins_100,
          coins_25: c.coins_25,
          coins_10: c.coins_10,
          coins_5: c.coins_5
        },
        countedAt: c.created_at
      }))
    };
  }

  /**
   * Get daily summary report
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} registerId - Optional register filter
   * @returns {Promise<object>} Daily summary
   */
  async getDailySummary(date, registerId = null) {
    let query = `
      SELECT
        rs.shift_id,
        r.register_name,
        u.first_name || ' ' || u.last_name as cashier_name,
        rs.opened_at,
        rs.closed_at,
        rs.opening_cash,
        rs.closing_cash,
        calculate_expected_drawer_cash(rs.shift_id) as expected_cash,
        CASE
          WHEN rs.closing_cash IS NOT NULL
          THEN rs.closing_cash - calculate_expected_drawer_cash(rs.shift_id)
          ELSE NULL
        END as variance,
        rs.status,
        (SELECT COUNT(*) FROM transactions t WHERE t.shift_id = rs.shift_id AND t.status = 'completed') as transaction_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM transactions t WHERE t.shift_id = rs.shift_id AND t.status = 'completed') as total_sales
      FROM register_shifts rs
      JOIN registers r ON rs.register_id = r.register_id
      JOIN users u ON rs.user_id = u.id
      WHERE DATE(rs.opened_at) = $1
    `;

    const params = [date];

    if (registerId) {
      query += ' AND rs.register_id = $2';
      params.push(registerId);
    }

    query += ' ORDER BY rs.opened_at';

    const result = await this.pool.query(query, params);

    // Calculate totals
    let totalSales = 0;
    let totalVariance = 0;
    let openShifts = 0;
    let closedShifts = 0;

    result.rows.forEach(row => {
      totalSales += parseFloat(row.total_sales);
      if (row.variance !== null) {
        totalVariance += parseFloat(row.variance);
      }
      if (row.status === 'open') openShifts++;
      else closedShifts++;
    });

    return {
      date,
      shifts: result.rows.map(row => ({
        shiftId: row.shift_id,
        registerName: row.register_name,
        cashierName: row.cashier_name,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openingCash: parseFloat(row.opening_cash),
        closingCash: row.closing_cash ? parseFloat(row.closing_cash) : null,
        expectedCash: parseFloat(row.expected_cash),
        variance: row.variance ? parseFloat(row.variance) : null,
        status: row.status,
        transactionCount: parseInt(row.transaction_count),
        totalSales: parseFloat(row.total_sales)
      })),
      totals: {
        shiftCount: result.rows.length,
        openShifts,
        closedShifts,
        totalSales,
        totalVariance: closedShifts > 0 ? totalVariance : null
      }
    };
  }

  /**
   * Get all safe drops for a date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Array>} List of drops
   */
  async getSafeDrops(startDate, endDate) {
    const result = await this.pool.query(`
      SELECT
        cm.id,
        DATE(cm.created_at) as drop_date,
        r.register_name,
        u.first_name || ' ' || u.last_name as performed_by,
        approver.first_name || ' ' || approver.last_name as approved_by,
        ABS(cm.amount) as amount,
        cm.reason,
        cm.reference_number,
        cm.created_at
      FROM cash_movements cm
      JOIN register_shifts rs ON cm.shift_id = rs.shift_id
      JOIN registers r ON rs.register_id = r.register_id
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN users approver ON cm.approved_by = approver.id
      WHERE cm.movement_type IN ('drop', 'pickup')
        AND DATE(cm.created_at) BETWEEN $1 AND $2
      ORDER BY cm.created_at DESC
    `, [startDate, endDate]);

    return result.rows.map(row => ({
      id: row.id,
      date: row.drop_date,
      registerName: row.register_name,
      performedBy: row.performed_by,
      approvedBy: row.approved_by,
      amount: parseFloat(row.amount),
      reason: row.reason,
      referenceNumber: row.reference_number,
      createdAt: row.created_at
    }));
  }

  /**
   * Generate end-of-day closing report
   * @param {string} date - Date
   * @returns {Promise<object>} Comprehensive EOD report
   */
  async generateEODReport(date) {
    const dailySummary = await this.getDailySummary(date);

    // Get all drops for the day
    const drops = await this.getSafeDrops(date, date);
    const totalDrops = drops.reduce((sum, d) => sum + d.amount, 0);

    // Get payment totals by method for the day
    const paymentResult = await this.pool.query(`
      SELECT
        p.payment_method,
        COUNT(*) as count,
        SUM(p.amount) as total
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      JOIN register_shifts rs ON t.shift_id = rs.shift_id
      WHERE DATE(rs.opened_at) = $1
        AND t.status = 'completed'
        AND p.status = 'completed'
      GROUP BY p.payment_method
    `, [date]);

    const paymentSummary = {};
    let grandTotal = 0;
    paymentResult.rows.forEach(row => {
      paymentSummary[row.payment_method] = {
        count: parseInt(row.count),
        total: parseFloat(row.total)
      };
      grandTotal += parseFloat(row.total);
    });

    // Get void/refund summary
    const voidResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'voided') as void_count,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'voided'), 0) as void_total,
        COUNT(*) FILTER (WHERE t.status = 'refunded') as refund_count,
        COALESCE(SUM(t.total_amount) FILTER (WHERE t.status = 'refunded'), 0) as refund_total
      FROM transactions t
      JOIN register_shifts rs ON t.shift_id = rs.shift_id
      WHERE DATE(rs.opened_at) = $1
    `, [date]);

    const voids = voidResult.rows[0];

    return {
      reportDate: date,
      generatedAt: new Date().toISOString(),
      shifts: dailySummary.shifts,
      shiftSummary: dailySummary.totals,
      payments: paymentSummary,
      grandTotal,
      safeDrops: {
        count: drops.length,
        total: totalDrops,
        details: drops
      },
      voids: {
        count: parseInt(voids.void_count),
        total: parseFloat(voids.void_total)
      },
      refunds: {
        count: parseInt(voids.refund_count),
        total: parseFloat(voids.refund_total)
      },
      cashReconciliation: {
        totalCashSales: paymentSummary.cash?.total || 0,
        totalDrops,
        totalVariance: dailySummary.totals.totalVariance,
        status: Math.abs(dailySummary.totals.totalVariance || 0) < 1 ? 'balanced' : 'variance'
      }
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate total from denomination counts
   */
  calculateDenominationTotal(d) {
    // Use integer cents to avoid floating-point errors, then convert back
    const totalCents =
      (d.bills_100 || 0) * 10000 +
      (d.bills_50 || 0) * 5000 +
      (d.bills_20 || 0) * 2000 +
      (d.bills_10 || 0) * 1000 +
      (d.bills_5 || 0) * 500 +
      (d.coins_200 || 0) * 200 +
      (d.coins_100 || 0) * 100 +
      (d.coins_25 || 0) * 25 +
      (d.coins_10 || 0) * 10 +
      (d.coins_5 || 0) * 5 +
      (d.rolls_200 || 0) * 5000 +
      (d.rolls_100 || 0) * 2500 +
      (d.rolls_25 || 0) * 1000 +
      (d.rolls_10 || 0) * 500 +
      (d.rolls_5 || 0) * 200;
    return totalCents / 100;
  }

  /**
   * Log audit action
   */
  async logAudit(client, shiftId, userId, action, details = {}) {
    await client.query(`
      INSERT INTO drawer_audit_log (shift_id, user_id, action, details)
      VALUES ($1, $2, $3, $4)
    `, [shiftId, userId, action, JSON.stringify(details)]);
  }

  /**
   * Get current open shift for a register
   */
  async getOpenShift(registerId) {
    const result = await this.pool.query(`
      SELECT
        rs.*,
        r.register_name,
        u.first_name || ' ' || u.last_name as cashier_name
      FROM register_shifts rs
      JOIN registers r ON rs.register_id = r.register_id
      JOIN users u ON rs.user_id = u.id
      WHERE rs.register_id = $1 AND rs.status = 'open'
    `, [registerId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      shiftId: row.shift_id,
      registerId: row.register_id,
      registerName: row.register_name,
      userId: row.user_id,
      cashierName: row.cashier_name,
      openingCash: parseFloat(row.opening_cash),
      openedAt: row.opened_at,
      status: row.status,
      drawerStatus: row.drawer_status
    };
  }

  /**
   * Perform no-sale drawer open (for change, etc.)
   */
  async noSaleOpen(shiftId, userId, reason = 'No Sale') {
    // Log the action
    await this.pool.query(`
      INSERT INTO drawer_audit_log (shift_id, user_id, action, details)
      VALUES ($1, $2, 'no_sale', $3)
    `, [shiftId, userId, JSON.stringify({ reason })]);

    return { success: true, reason };
  }
}

module.exports = CashDrawerService;
