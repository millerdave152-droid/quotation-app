/**
 * TeleTime - Store Credits & Gift Cards Routes
 * Issue, lookup, redeem, and refund store credits and gift cards
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

let pool = null;

router.use(authenticate);

/**
 * Generate a unique store credit or gift card code
 */
function generateCode(type = 'store_credit') {
  const prefix = type === 'gift_card' ? 'GC' : 'SC';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = `${prefix}-`;
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

// ============================================================================
// POST / — Create a new store credit or gift card
// ============================================================================

router.post('/', asyncHandler(async (req, res) => {
  const {
    customerId, amountCents, creditType = 'store_credit',
    sourceType = 'manual', sourceId, expiryDate,
    recipientName, recipientEmail, notes,
  } = req.body;
  const userId = req.user.id;

  if (!amountCents || amountCents <= 0) {
    throw ApiError.badRequest('amountCents must be positive');
  }

  if (!['store_credit', 'gift_card'].includes(creditType)) {
    throw ApiError.badRequest('creditType must be store_credit or gift_card');
  }

  // Generate unique code with retry
  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateCode(creditType);
    const exists = await pool.query('SELECT 1 FROM store_credits WHERE code = $1', [code]);
    if (exists.rows.length === 0) break;
    attempts++;
  }
  if (attempts >= 10) {
    throw ApiError.create(500, 'Failed to generate unique credit code');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO store_credits (
        customer_id, code, credit_type, original_amount, current_balance,
        source_type, source_id, issued_by, expiry_date,
        recipient_name, recipient_email, notes
      ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        customerId || null, code, creditType, amountCents,
        sourceType, sourceId || null, userId, expiryDate || null,
        recipientName || null, recipientEmail || null, notes || null,
      ]
    );

    const credit = result.rows[0];

    // Record the issuance transaction
    await client.query(
      `INSERT INTO store_credit_transactions (store_credit_id, amount_cents, transaction_type, balance_after, notes, performed_by)
       VALUES ($1, $2, 'issue', $3, $4, $5)`,
      [credit.id, amountCents, amountCents, `Issued via ${sourceType}`, userId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        id: credit.id,
        code: credit.code,
        creditType: credit.credit_type,
        amount: amountCents / 100,
        amountCents,
        balance: amountCents / 100,
        balanceCents: amountCents,
        expiryDate: credit.expiry_date,
        status: credit.status,
        recipientName: credit.recipient_name,
        recipientEmail: credit.recipient_email,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// GET /customer/:customerId — All credits for a customer
// ============================================================================

router.get('/customer/:customerId', asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  if (isNaN(customerId)) throw ApiError.badRequest('Invalid customer ID');

  // Auto-expire any past-due credits
  await pool.query(
    `UPDATE store_credits SET status = 'expired', updated_at = NOW()
     WHERE customer_id = $1 AND status = 'active'
       AND expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE`,
    [customerId]
  );

  const result = await pool.query(
    `SELECT sc.*,
            (SELECT COUNT(*) FROM store_credit_transactions WHERE store_credit_id = sc.id) AS transaction_count
     FROM store_credits sc
     WHERE sc.customer_id = $1
     ORDER BY sc.status = 'active' DESC, sc.created_at DESC`,
    [customerId]
  );

  const credits = result.rows.map(row => ({
    id: row.id,
    code: row.code,
    creditType: row.credit_type || 'store_credit',
    originalAmountCents: row.original_amount,
    originalAmount: row.original_amount / 100,
    currentBalanceCents: row.current_balance,
    currentBalance: row.current_balance / 100,
    sourceType: row.source_type,
    sourceId: row.source_id,
    issuedDate: row.issued_date,
    expiryDate: row.expiry_date,
    status: row.status,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    transactionCount: parseInt(row.transaction_count),
    notes: row.notes,
    createdAt: row.created_at,
  }));

  // Summary
  const activeCredits = credits.filter(c => c.status === 'active');
  const totalBalance = activeCredits.reduce((sum, c) => sum + c.currentBalanceCents, 0);

  res.json({
    success: true,
    data: credits,
    summary: {
      totalCredits: credits.length,
      activeCredits: activeCredits.length,
      totalBalanceCents: totalBalance,
      totalBalance: totalBalance / 100,
    },
  });
}));

// ============================================================================
// GET /:code — Lookup a store credit by code
// ============================================================================

router.get('/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;

  // Don't match the /customer/:id route
  if (code === 'customer') return;

  const result = await pool.query(
    `SELECT sc.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
            (u.first_name || ' ' || u.last_name) as issued_by_name
     FROM store_credits sc
     LEFT JOIN customers c ON sc.customer_id = c.id
     LEFT JOIN users u ON sc.issued_by = u.id
     WHERE sc.code = $1`,
    [code.toUpperCase()]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Store credit');
  }

  const credit = result.rows[0];

  // Check if expired
  if (credit.expiry_date && new Date(credit.expiry_date) < new Date()) {
    if (credit.status === 'active') {
      await pool.query("UPDATE store_credits SET status = 'expired', updated_at = NOW() WHERE id = $1", [credit.id]);
      credit.status = 'expired';
    }
  }

  // Fetch transaction history
  const txns = await pool.query(
    `SELECT sct.*, (u.first_name || ' ' || u.last_name) as performed_by_name
     FROM store_credit_transactions sct
     LEFT JOIN users u ON sct.performed_by = u.id
     WHERE sct.store_credit_id = $1
     ORDER BY sct.created_at DESC`,
    [credit.id]
  );

  res.json({
    success: true,
    data: {
      id: credit.id,
      code: credit.code,
      creditType: credit.credit_type || 'store_credit',
      customerId: credit.customer_id,
      customerName: credit.customer_name,
      customerEmail: credit.customer_email,
      customerPhone: credit.customer_phone,
      originalAmountCents: credit.original_amount,
      originalAmount: credit.original_amount / 100,
      currentBalanceCents: credit.current_balance,
      currentBalance: credit.current_balance / 100,
      sourceType: credit.source_type,
      sourceId: credit.source_id,
      issuedDate: credit.issued_date,
      issuedByName: credit.issued_by_name,
      expiryDate: credit.expiry_date,
      status: credit.status,
      recipientName: credit.recipient_name,
      recipientEmail: credit.recipient_email,
      notes: credit.notes,
      transactions: txns.rows.map(t => ({
        id: t.id,
        type: t.transaction_type,
        amountCents: t.amount_cents,
        amount: t.amount_cents / 100,
        balanceAfterCents: t.balance_after,
        balanceAfter: t.balance_after / 100,
        orderId: t.order_id || t.transaction_id,
        performedByName: t.performed_by_name,
        notes: t.notes,
        createdAt: t.created_at,
      })),
    },
  });
}));

// ============================================================================
// POST /:code/redeem — Use store credit at checkout
// ============================================================================

router.post('/:code/redeem', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { amountCents, transactionId, orderId } = req.body;
  const userId = req.user.id;

  if (!amountCents || amountCents <= 0) {
    throw ApiError.badRequest('amountCents must be positive');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the credit row for update
    const result = await client.query(
      'SELECT * FROM store_credits WHERE code = $1 FOR UPDATE',
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Store credit');
    }

    const credit = result.rows[0];

    if (credit.status !== 'active') {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(`Store credit is ${credit.status}`);
    }

    if (credit.expiry_date && new Date(credit.expiry_date) < new Date()) {
      await client.query("UPDATE store_credits SET status = 'expired', updated_at = NOW() WHERE id = $1", [credit.id]);
      await client.query('COMMIT');
      throw ApiError.badRequest('Store credit has expired');
    }

    if (amountCents > credit.current_balance) {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(
        `Insufficient balance. Available: $${(credit.current_balance / 100).toFixed(2)}, Requested: $${(amountCents / 100).toFixed(2)}`
      );
    }

    const newBalance = credit.current_balance - amountCents;
    const newStatus = newBalance === 0 ? 'depleted' : 'active';

    await client.query(
      'UPDATE store_credits SET current_balance = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [newBalance, newStatus, credit.id]
    );

    await client.query(
      `INSERT INTO store_credit_transactions (
        store_credit_id, transaction_id, order_id,
        amount_cents, transaction_type, balance_after, performed_by
      ) VALUES ($1, $2, $3, $4, 'redeem', $5, $6)`,
      [credit.id, transactionId || null, orderId || null, -amountCents, newBalance, userId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        creditId: credit.id,
        code: credit.code,
        amountRedeemed: amountCents / 100,
        amountRedeemedCents: amountCents,
        remainingBalance: newBalance / 100,
        remainingBalanceCents: newBalance,
        status: newStatus,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// POST /:code/refund — Add amount back to a credit (for cancelled orders)
// ============================================================================

router.post('/:code/refund', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { amountCents, reason, orderId } = req.body;
  const userId = req.user.id;

  if (!amountCents || amountCents <= 0) {
    throw ApiError.badRequest('amountCents must be positive');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM store_credits WHERE code = $1 FOR UPDATE',
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Store credit');
    }

    const credit = result.rows[0];

    // Allow refunding even depleted/expired credits — reactivates them
    if (credit.status === 'cancelled') {
      await client.query('ROLLBACK');
      throw ApiError.badRequest('Cannot refund a cancelled store credit');
    }

    const newBalance = credit.current_balance + amountCents;

    // Cannot refund more than original amount
    if (newBalance > credit.original_amount) {
      await client.query('ROLLBACK');
      throw ApiError.badRequest(
        `Refund would exceed original amount. Original: $${(credit.original_amount / 100).toFixed(2)}, ` +
        `Current: $${(credit.current_balance / 100).toFixed(2)}, Refund: $${(amountCents / 100).toFixed(2)}`
      );
    }

    await client.query(
      "UPDATE store_credits SET current_balance = $1, status = 'active', updated_at = NOW() WHERE id = $2",
      [newBalance, credit.id]
    );

    await client.query(
      `INSERT INTO store_credit_transactions (
        store_credit_id, order_id, amount_cents, transaction_type,
        balance_after, notes, performed_by
      ) VALUES ($1, $2, $3, 'refund', $4, $5, $6)`,
      [credit.id, orderId || null, amountCents, newBalance, reason || 'Refund', userId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        creditId: credit.id,
        code: credit.code,
        amountRefunded: amountCents / 100,
        amountRefundedCents: amountCents,
        newBalance: newBalance / 100,
        newBalanceCents: newBalance,
        status: 'active',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  pool = deps.pool;
  return router;
};

module.exports = { init };
