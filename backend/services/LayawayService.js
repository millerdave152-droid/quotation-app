let pool;

function init(deps) {
  pool = deps.pool;
}

const MIN_DEPOSIT_PERCENT = 20;

async function generateNumber() {
  const year = new Date().getFullYear();
  const { rows: [{ next }] } = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(layaway_number FROM 'LAY-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 AS next
     FROM layaways WHERE layaway_number LIKE $1`,
    [`LAY-${year}-%`]
  );
  return `LAY-${year}-${String(next).padStart(5, '0')}`;
}

// ── Create ──────────────────────────────────────────────────────────

async function createLayaway({ customer_id, location_id, items, deposit_amount, term_weeks = 12, notes }, createdBy) {
  if (!items || items.length === 0) throw new Error('At least one item required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate total from items and resolve product info
    let totalAmount = 0;
    const resolvedItems = [];

    for (const item of items) {
      const { rows: [product] } = await client.query(
        'SELECT id, name, sku, price FROM products WHERE id = $1',
        [item.product_id]
      );
      if (!product) throw new Error(`Product ${item.product_id} not found`);

      const unitPrice = item.unit_price || Math.round(parseFloat(product.price) * 100);
      const qty = item.quantity || 1;
      const lineTotal = unitPrice * qty;
      totalAmount += lineTotal;

      resolvedItems.push({
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    // Validate deposit
    const minDeposit = Math.ceil(totalAmount * MIN_DEPOSIT_PERCENT / 100);
    if (deposit_amount < minDeposit) {
      throw new Error(`Minimum deposit is ${MIN_DEPOSIT_PERCENT}% ($${(minDeposit / 100).toFixed(2)})`);
    }

    const balanceDue = totalAmount - deposit_amount;
    const minimumPayment = Math.ceil(balanceDue / term_weeks);
    const startDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + term_weeks * 7);

    const layawayNumber = await generateNumber();

    const { rows: [layaway] } = await client.query(
      `INSERT INTO layaways
         (layaway_number, customer_id, location_id, total_amount, deposit_amount, balance_due,
          term_weeks, minimum_payment, start_date, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [layawayNumber, customer_id, location_id, totalAmount, deposit_amount, balanceDue,
       term_weeks, minimumPayment, startDate, dueDate, notes || null, createdBy]
    );

    // Insert items
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO layaway_items (layaway_id, product_id, product_name, sku, quantity, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [layaway.id, item.product_id, item.product_name, item.sku, item.quantity, item.unit_price, item.line_total]
      );
    }

    // Record deposit as first payment
    await client.query(
      `INSERT INTO layaway_payments (layaway_id, amount, payment_method, reference_number, received_by)
       VALUES ($1,$2,'deposit',NULL,$3)`,
      [layaway.id, deposit_amount, createdBy]
    );

    // Reserve inventory
    for (const item of resolvedItems) {
      await client.query(
        `UPDATE location_inventory SET quantity_reserved = COALESCE(quantity_reserved, 0) + $1
         WHERE product_id = $2 AND location_id = $3`,
        [item.quantity, item.product_id, location_id]
      );
    }

    await client.query('COMMIT');
    return getLayaway(layaway.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Read ────────────────────────────────────────────────────────────

async function getLayaway(id) {
  const { rows: [layaway] } = await pool.query(
    `SELECT l.*, c.first_name || ' ' || COALESCE(c.last_name, '') AS customer_name,
            c.email AS customer_email, c.phone AS customer_phone,
            loc.name AS location_name, u.name AS created_by_name
     FROM layaways l
     JOIN customers c ON c.id = l.customer_id
     LEFT JOIN locations loc ON loc.id = l.location_id
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.id = $1`,
    [id]
  );
  if (!layaway) return null;

  const { rows: items } = await pool.query(
    'SELECT * FROM layaway_items WHERE layaway_id = $1 ORDER BY id', [id]
  );
  const { rows: payments } = await pool.query(
    `SELECT lp.*, u.name AS received_by_name
     FROM layaway_payments lp LEFT JOIN users u ON u.id = lp.received_by
     WHERE lp.layaway_id = $1 ORDER BY lp.created_at`, [id]
  );

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return {
    ...layaway,
    customer_name: layaway.customer_name.trim(),
    items,
    payments,
    total_paid: totalPaid,
    payment_progress: layaway.total_amount > 0
      ? Math.round((totalPaid / layaway.total_amount) * 10000) / 100
      : 100,
  };
}

async function listLayaways({ status, customer_id, location_id, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`l.status = $${idx++}`); params.push(status); }
  if (customer_id) { conditions.push(`l.customer_id = $${idx++}`); params.push(customer_id); }
  if (location_id) { conditions.push(`l.location_id = $${idx++}`); params.push(location_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT l.*, c.first_name || ' ' || COALESCE(c.last_name, '') AS customer_name,
            loc.name AS location_name,
            (SELECT COALESCE(SUM(amount), 0) FROM layaway_payments WHERE layaway_id = l.id) AS total_paid
     FROM layaways l
     JOIN customers c ON c.id = l.customer_id
     LEFT JOIN locations loc ON loc.id = l.location_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*) AS total FROM layaways l ${where}`,
    params.slice(0, conditions.length)
  );

  return { layaways: rows.map(r => ({ ...r, customer_name: r.customer_name.trim() })), total: parseInt(total) };
}

// ── Payment ─────────────────────────────────────────────────────────

async function makePayment(layawayId, { amount, payment_method, reference_number }, receivedBy) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [layaway] } = await client.query(
      'SELECT * FROM layaways WHERE id = $1 AND status = $2 FOR UPDATE',
      [layawayId, 'active']
    );
    if (!layaway) throw new Error('Layaway not found or not active');
    if (amount <= 0) throw new Error('Payment amount must be positive');
    if (amount > layaway.balance_due) throw new Error('Payment exceeds balance due');

    await client.query(
      `INSERT INTO layaway_payments (layaway_id, amount, payment_method, reference_number, received_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [layawayId, amount, payment_method || null, reference_number || null, receivedBy]
    );

    const newBalance = layaway.balance_due - amount;

    if (newBalance <= 0) {
      // Paid in full — complete
      await client.query(
        `UPDATE layaways SET balance_due = 0, status = 'completed', completed_date = CURRENT_DATE WHERE id = $1`,
        [layawayId]
      );

      // Release reserved inventory
      const { rows: items } = await client.query(
        'SELECT product_id, quantity FROM layaway_items WHERE layaway_id = $1', [layawayId]
      );
      for (const item of items) {
        await client.query(
          `UPDATE location_inventory
           SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0),
               quantity_on_hand = GREATEST(COALESCE(quantity_on_hand, 0) - $1, 0)
           WHERE product_id = $2 AND location_id = $3`,
          [item.quantity, item.product_id, layaway.location_id]
        );
      }
    } else {
      await client.query(
        'UPDATE layaways SET balance_due = $1 WHERE id = $2',
        [newBalance, layawayId]
      );
    }

    await client.query('COMMIT');
    return getLayaway(layawayId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Cancel ──────────────────────────────────────────────────────────

async function cancelLayaway(layawayId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [layaway] } = await client.query(
      'SELECT * FROM layaways WHERE id = $1 AND status = $2 FOR UPDATE',
      [layawayId, 'active']
    );
    if (!layaway) throw new Error('Layaway not found or not active');

    // Calculate refund
    const { rows: [{ total_paid }] } = await client.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM layaway_payments WHERE layaway_id = $1',
      [layawayId]
    );
    const paid = parseInt(total_paid);
    const feePercent = parseFloat(layaway.cancellation_fee_percent) || 10;
    const cancellationFee = Math.round(paid * feePercent / 100);
    const refundAmount = Math.max(paid - cancellationFee, 0);

    await client.query(
      `UPDATE layaways SET
         status = 'cancelled', balance_due = 0,
         restocking_fee = $1, refund_amount = $2
       WHERE id = $3`,
      [cancellationFee, refundAmount, layawayId]
    );

    // Release reserved inventory
    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM layaway_items WHERE layaway_id = $1', [layawayId]
    );
    for (const item of items) {
      await client.query(
        `UPDATE location_inventory
         SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)
         WHERE product_id = $2 AND location_id = $3`,
        [item.quantity, item.product_id, layaway.location_id]
      );
    }

    await client.query('COMMIT');

    return {
      ...(await getLayaway(layawayId)),
      cancellation_summary: {
        total_paid: paid,
        cancellation_fee: cancellationFee,
        fee_percent: feePercent,
        refund_amount: refundAmount,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { init, createLayaway, getLayaway, listLayaways, makePayment, cancelLayaway };
