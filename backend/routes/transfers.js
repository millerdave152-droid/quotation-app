/**
 * Stock Transfer & Inventory-by-Location Routes
 * Uses stock_transfers + inventory_locations tables (migration 210).
 */

const express = require('express');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

function init({ pool }) {
  const router = express.Router();

  // ============================================================
  // GET /api/transfers
  // ============================================================
  router.get('/', authenticate, asyncHandler(async (req, res) => {
    const { status, location_id } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`st.status = $${idx++}`);
      params.push(status);
    }
    if (location_id) {
      conditions.push(`(st.from_location_id = $${idx} OR st.to_location_id = $${idx})`);
      params.push(parseInt(location_id));
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        st.*,
        fl.name AS from_location_name,
        tl.name AS to_location_name,
        p.name AS product_name,
        p.sku AS product_sku,
        NULLIF(TRIM(CONCAT(ru.first_name, ' ', ru.last_name)), '') AS requested_by_name,
        NULLIF(TRIM(CONCAT(au.first_name, ' ', au.last_name)), '') AS approved_by_name
      FROM stock_transfers st
      JOIN locations fl ON st.from_location_id = fl.id
      JOIN locations tl ON st.to_location_id = tl.id
      JOIN products p ON st.product_id = p.id
      LEFT JOIN users ru ON st.requested_by = ru.id
      LEFT JOIN users au ON st.approved_by = au.id
      ${where}
      ORDER BY st.created_at DESC
    `, params);

    res.json({ success: true, data: result.rows });
  }));

  // ============================================================
  // POST /api/transfers
  // ============================================================
  router.post('/', authenticate, asyncHandler(async (req, res) => {
    const { product_id, from_location_id, to_location_id, qty, serial_id } = req.body;

    if (!product_id || !from_location_id || !to_location_id || !qty) {
      throw ApiError.badRequest('product_id, from_location_id, to_location_id, and qty are required');
    }
    if (from_location_id === to_location_id) {
      throw ApiError.badRequest('From and to locations must be different');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check available stock at from_location
      const invResult = await client.query(
        'SELECT qty_on_hand, qty_reserved FROM inventory_locations WHERE product_id = $1 AND location_id = $2',
        [product_id, from_location_id]
      );
      if (invResult.rows.length === 0) {
        throw ApiError.badRequest('Product not found at source location');
      }
      const available = invResult.rows[0].qty_on_hand - invResult.rows[0].qty_reserved;
      if (available < qty) {
        throw ApiError.badRequest(`Insufficient stock: ${available} available, ${qty} requested`);
      }

      // Check if serialized product requires serial_id
      const prodResult = await client.query('SELECT is_serialized FROM products WHERE id = $1', [product_id]);
      if (prodResult.rows[0]?.is_serialized && !serial_id) {
        throw ApiError.badRequest('serial_id is required for serialized products');
      }

      const insertResult = await client.query(`
        INSERT INTO stock_transfers (product_id, from_location_id, to_location_id, qty, serial_id, requested_by, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'requested')
        RETURNING *
      `, [product_id, from_location_id, to_location_id, qty, serial_id || null, req.user.id]);

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: insertResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // ============================================================
  // PATCH /api/transfers/:id/approve
  // ============================================================
  router.patch('/:id/approve', authenticate, requireRole('manager', 'admin'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await client.query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
      if (transfer.rows.length === 0) throw ApiError.notFound('Transfer');
      if (transfer.rows[0].status !== 'requested') {
        throw ApiError.badRequest(`Cannot approve transfer in '${transfer.rows[0].status}' status`);
      }

      // Reserve stock at source
      await client.query(`
        UPDATE inventory_locations
        SET qty_reserved = qty_reserved + $1, updated_at = NOW()
        WHERE product_id = $2 AND location_id = $3
      `, [transfer.rows[0].qty, transfer.rows[0].product_id, transfer.rows[0].from_location_id]);

      const updated = await client.query(`
        UPDATE stock_transfers
        SET status = 'approved', approved_by = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, req.user.id]);

      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // ============================================================
  // PATCH /api/transfers/:id/pickup
  // ============================================================
  router.patch('/:id/pickup', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await client.query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
      if (transfer.rows.length === 0) throw ApiError.notFound('Transfer');
      if (transfer.rows[0].status !== 'approved') {
        throw ApiError.badRequest(`Cannot pick up transfer in '${transfer.rows[0].status}' status`);
      }

      const t = transfer.rows[0];

      // Decrement qty_on_hand and qty_reserved at source
      await client.query(`
        UPDATE inventory_locations
        SET qty_on_hand = qty_on_hand - $1, qty_reserved = qty_reserved - $1, updated_at = NOW()
        WHERE product_id = $2 AND location_id = $3
      `, [t.qty, t.product_id, t.from_location_id]);

      // Serial event if applicable
      if (t.serial_id) {
        const fromLoc = await client.query('SELECT name FROM locations WHERE id = $1', [t.from_location_id]);
        await client.query(`
          INSERT INTO serial_events (serial_id, event_type, reference_type, reference_id, location_id, performed_by, notes)
          VALUES ($1, 'transferred', 'stock_transfer', $2, $3, $4, $5)
        `, [t.serial_id, t.id, t.from_location_id, req.user.id,
            `Transfer #${t.id} picked up from ${fromLoc.rows[0]?.name || 'location ' + t.from_location_id}`]);
      }

      const updated = await client.query(`
        UPDATE stock_transfers
        SET status = 'picked_up', picked_up_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // ============================================================
  // PATCH /api/transfers/:id/receive
  // ============================================================
  router.patch('/:id/receive', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { driver_notes } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await client.query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
      if (transfer.rows.length === 0) throw ApiError.notFound('Transfer');
      if (transfer.rows[0].status !== 'picked_up') {
        throw ApiError.badRequest(`Cannot receive transfer in '${transfer.rows[0].status}' status`);
      }

      const t = transfer.rows[0];

      // Increment qty_on_hand at destination (upsert — location row may not exist yet)
      await client.query(`
        INSERT INTO inventory_locations (product_id, location_id, qty_on_hand, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET qty_on_hand = inventory_locations.qty_on_hand + $3, updated_at = NOW()
      `, [t.product_id, t.to_location_id, t.qty]);

      // Serial event if applicable
      if (t.serial_id) {
        const toLoc = await client.query('SELECT name FROM locations WHERE id = $1', [t.to_location_id]);
        await client.query(`
          INSERT INTO serial_events (serial_id, event_type, reference_type, reference_id, location_id, performed_by, notes)
          VALUES ($1, 'transferred', 'stock_transfer', $2, $3, $4, $5)
        `, [t.serial_id, t.id, t.to_location_id, req.user.id,
            `Transfer #${t.id} received at ${toLoc.rows[0]?.name || 'location ' + t.to_location_id}`]);
      }

      const updated = await client.query(`
        UPDATE stock_transfers
        SET status = 'received', received_at = NOW(), driver_notes = COALESCE($2, driver_notes), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, driver_notes || null]);

      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // ============================================================
  // PATCH /api/transfers/:id/cancel
  // ============================================================
  router.patch('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await client.query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
      if (transfer.rows.length === 0) throw ApiError.notFound('Transfer');

      const t = transfer.rows[0];
      if (!['requested', 'approved'].includes(t.status)) {
        throw ApiError.badRequest(`Cannot cancel transfer in '${t.status}' status`);
      }

      // If was approved, release the reserved qty
      if (t.status === 'approved') {
        await client.query(`
          UPDATE inventory_locations
          SET qty_reserved = qty_reserved - $1, updated_at = NOW()
          WHERE product_id = $2 AND location_id = $3
        `, [t.qty, t.product_id, t.from_location_id]);
      }

      const updated = await client.query(`
        UPDATE stock_transfers
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // ============================================================
  // GET /api/inventory/by-location/:location_id
  // ============================================================
  router.get('/by-location/:location_id', authenticate, asyncHandler(async (req, res) => {
    const { location_id } = req.params;

    const result = await pool.query(`
      SELECT
        il.id, il.product_id, il.location_id, il.qty_on_hand, il.qty_reserved, il.updated_at,
        p.name AS product_name, p.sku, p.manufacturer AS brand, p.category, p.is_serialized
      FROM inventory_locations il
      JOIN products p ON il.product_id = p.id
      WHERE il.location_id = $1
        AND (il.qty_on_hand > 0 OR il.qty_reserved > 0)
      ORDER BY p.name
    `, [parseInt(location_id)]);

    res.json({ success: true, data: result.rows });
  }));

  return router;
}

module.exports = { init };
