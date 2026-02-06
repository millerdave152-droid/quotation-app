/**
 * Inter-Location Inventory Transfer Routes
 * Full transfer workflow: create → approve → ship → receive.
 * @module routes/inventory-transfers
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();

  // ---------- Helpers ----------

  async function generateTransferNumber(client) {
    const result = await client.query("SELECT nextval('transfer_number_seq') AS seq");
    const seq = String(result.rows[0].seq).padStart(5, '0');
    const year = new Date().getFullYear();
    return `TRF-${year}-${seq}`;
  }

  // ==========================================================================
  // POST /api/inventory/transfers
  // ==========================================================================
  router.post(
    '/',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { from_location_id, to_location_id, items, notes } = req.body;

        if (!from_location_id || !to_location_id) {
          return res.status(400).json({ success: false, message: 'from_location_id and to_location_id are required' });
        }
        if (parseInt(from_location_id) === parseInt(to_location_id)) {
          return res.status(400).json({ success: false, message: 'Source and destination must be different locations' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ success: false, message: 'items array is required' });
        }

        await client.query('BEGIN');

        // Validate locations
        const locResult = await client.query(
          'SELECT id, name FROM locations WHERE id = ANY($1) AND is_active = true',
          [[from_location_id, to_location_id]]
        );
        if (locResult.rows.length < 2) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'One or both locations not found or inactive' });
        }

        // Validate products and check source inventory
        const insufficientStock = [];
        for (const item of items) {
          if (!item.product_id || !item.quantity || item.quantity <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Each item needs product_id and positive quantity' });
          }

          const invResult = await client.query(
            'SELECT quantity_on_hand, quantity_reserved FROM location_inventory WHERE location_id = $1 AND product_id = $2',
            [from_location_id, item.product_id]
          );
          const available = invResult.rows.length > 0
            ? invResult.rows[0].quantity_on_hand - invResult.rows[0].quantity_reserved
            : 0;

          if (available < item.quantity) {
            const prodResult = await client.query('SELECT name FROM products WHERE id = $1', [item.product_id]);
            insufficientStock.push({
              product_id: item.product_id,
              product_name: prodResult.rows[0]?.name || `Product #${item.product_id}`,
              requested: item.quantity,
              available,
            });
          }
        }

        if (insufficientStock.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Insufficient stock at source location',
            insufficient_stock: insufficientStock,
          });
        }

        // Generate transfer number and create transfer
        const transferNumber = await generateTransferNumber(client);

        const transferResult = await client.query(
          `INSERT INTO inventory_transfers
             (transfer_number, from_location_id, to_location_id, status, requested_by, requested_at, notes)
           VALUES ($1, $2, $3, 'requested', $4, NOW(), $5)
           RETURNING *`,
          [transferNumber, from_location_id, to_location_id, req.user.id, notes || null]
        );
        const transfer = transferResult.rows[0];

        // Insert items and reserve inventory at source
        const insertedItems = [];
        for (const item of items) {
          const itemResult = await client.query(
            `INSERT INTO inventory_transfer_items (transfer_id, product_id, quantity_requested)
             VALUES ($1, $2, $3) RETURNING *`,
            [transfer.id, item.product_id, item.quantity]
          );
          insertedItems.push(itemResult.rows[0]);

          // Reserve at source
          await client.query(
            `UPDATE location_inventory
             SET quantity_reserved = quantity_reserved + $1, updated_at = NOW()
             WHERE location_id = $2 AND product_id = $3`,
            [item.quantity, from_location_id, item.product_id]
          );
        }

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          transfer: { ...transfer, items: insertedItems },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/transfers
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    async (req, res, next) => {
      try {
        const { status, from_location, to_location, date_from, date_to, page = 1, limit = 25 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (status) { conditions.push(`t.status = $${pi++}`); params.push(status); }
        if (from_location) { conditions.push(`t.from_location_id = $${pi++}`); params.push(parseInt(from_location, 10)); }
        if (to_location) { conditions.push(`t.to_location_id = $${pi++}`); params.push(parseInt(to_location, 10)); }
        if (date_from) { conditions.push(`t.created_at >= $${pi++}::timestamp`); params.push(date_from); }
        if (date_to) { conditions.push(`t.created_at <= $${pi++}::timestamp`); params.push(date_to); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM inventory_transfers t ${where}`, params
        );

        const result = await pool.query(
          `SELECT t.*,
                  fl.name AS from_location_name,
                  tl.name AS to_location_name,
                  ru.first_name || ' ' || ru.last_name AS requested_by_name,
                  au.first_name || ' ' || au.last_name AS approved_by_name,
                  (SELECT COUNT(*)::int FROM inventory_transfer_items ti WHERE ti.transfer_id = t.id) AS item_count,
                  (SELECT SUM(ti.quantity_requested)::int FROM inventory_transfer_items ti WHERE ti.transfer_id = t.id) AS total_units
           FROM inventory_transfers t
           JOIN locations fl ON t.from_location_id = fl.id
           JOIN locations tl ON t.to_location_id = tl.id
           LEFT JOIN users ru ON t.requested_by = ru.id
           LEFT JOIN users au ON t.approved_by = au.id
           ${where}
           ORDER BY t.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          transfers: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/transfers/:id
  // ==========================================================================
  router.get(
    '/:id',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `SELECT t.*,
                  fl.name AS from_location_name, fl.code AS from_location_code,
                  tl.name AS to_location_name, tl.code AS to_location_code,
                  ru.first_name || ' ' || ru.last_name AS requested_by_name,
                  au.first_name || ' ' || au.last_name AS approved_by_name,
                  su.first_name || ' ' || su.last_name AS shipped_by_name,
                  rcu.first_name || ' ' || rcu.last_name AS received_by_name
           FROM inventory_transfers t
           JOIN locations fl ON t.from_location_id = fl.id
           JOIN locations tl ON t.to_location_id = tl.id
           LEFT JOIN users ru ON t.requested_by = ru.id
           LEFT JOIN users au ON t.approved_by = au.id
           LEFT JOIN users su ON t.shipped_by = su.id
           LEFT JOIN users rcu ON t.received_by = rcu.id
           WHERE t.id = $1`,
          [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Transfer not found' });
        }

        const itemsResult = await pool.query(
          `SELECT ti.*, p.name AS product_name, p.sku AS product_sku, p.model AS product_model
           FROM inventory_transfer_items ti
           JOIN products p ON ti.product_id = p.id
           WHERE ti.transfer_id = $1
           ORDER BY ti.id`,
          [id]
        );

        res.json({
          success: true,
          transfer: { ...result.rows[0], items: itemsResult.rows },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/inventory/transfers/:id/approve
  // ==========================================================================
  router.put(
    '/:id/approve',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const current = await pool.query('SELECT id, status FROM inventory_transfers WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Transfer not found' });
        }
        if (current.rows[0].status !== 'requested') {
          return res.status(400).json({
            success: false,
            message: `Can only approve transfers with status 'requested'. Current: '${current.rows[0].status}'`,
          });
        }

        const result = await pool.query(
          `UPDATE inventory_transfers
           SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
           WHERE id = $2 RETURNING *`,
          [req.user.id, id]
        );

        res.json({ success: true, transfer: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/inventory/transfers/:id/ship
  // ==========================================================================
  router.put(
    '/:id/ship',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;
        const { items: shippedItems } = req.body;

        await client.query('BEGIN');

        const current = await client.query(
          'SELECT * FROM inventory_transfers WHERE id = $1 FOR UPDATE',
          [id]
        );
        if (current.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Transfer not found' });
        }
        const transfer = current.rows[0];
        if (!['requested', 'approved'].includes(transfer.status)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Can only ship transfers with status 'requested' or 'approved'. Current: '${transfer.status}'`,
          });
        }

        // Get transfer items
        const transferItems = await client.query(
          'SELECT * FROM inventory_transfer_items WHERE transfer_id = $1',
          [id]
        );

        // Build shipped quantities map
        const shippedMap = {};
        if (shippedItems && Array.isArray(shippedItems)) {
          for (const si of shippedItems) {
            shippedMap[si.product_id] = si.quantity_shipped;
          }
        }

        for (const item of transferItems.rows) {
          const qtyShipped = shippedMap[item.product_id] !== undefined
            ? parseInt(shippedMap[item.product_id], 10)
            : item.quantity_requested;

          // Update shipped quantity on transfer item
          await client.query(
            'UPDATE inventory_transfer_items SET quantity_shipped = $1 WHERE id = $2',
            [qtyShipped, item.id]
          );

          // Deduct from source: reduce on_hand and release reservation
          const invBefore = await client.query(
            'SELECT quantity_on_hand FROM location_inventory WHERE location_id = $1 AND product_id = $2',
            [transfer.from_location_id, item.product_id]
          );
          const qtyBefore = invBefore.rows[0]?.quantity_on_hand || 0;

          await client.query(
            `UPDATE location_inventory SET
               quantity_on_hand = quantity_on_hand - $1,
               quantity_reserved = GREATEST(0, quantity_reserved - $2),
               updated_at = NOW()
             WHERE location_id = $3 AND product_id = $4`,
            [qtyShipped, item.quantity_requested, transfer.from_location_id, item.product_id]
          );

          // Log adjustment
          await client.query(
            `INSERT INTO inventory_adjustments
               (location_id, product_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason, reference_id, adjusted_by)
             VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7, $8)`,
            [
              transfer.from_location_id, item.product_id,
              -qtyShipped, qtyBefore, qtyBefore - qtyShipped,
              `Transfer out: ${transfer.transfer_number}`,
              transfer.id, req.user.id,
            ]
          );
        }

        // Update transfer status
        await client.query(
          `UPDATE inventory_transfers SET
             status = 'in_transit', shipped_by = $1, shipped_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [req.user.id, id]
        );

        await client.query('COMMIT');

        // Fetch updated
        const updated = await pool.query('SELECT * FROM inventory_transfers WHERE id = $1', [id]);
        const updatedItems = await pool.query(
          `SELECT ti.*, p.name AS product_name
           FROM inventory_transfer_items ti JOIN products p ON ti.product_id = p.id
           WHERE ti.transfer_id = $1 ORDER BY ti.id`, [id]
        );

        res.json({
          success: true,
          transfer: { ...updated.rows[0], items: updatedItems.rows },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // PUT /api/inventory/transfers/:id/receive
  // ==========================================================================
  router.put(
    '/:id/receive',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;
        const { items: receivedItems } = req.body;

        await client.query('BEGIN');

        const current = await client.query(
          'SELECT * FROM inventory_transfers WHERE id = $1 FOR UPDATE',
          [id]
        );
        if (current.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Transfer not found' });
        }
        const transfer = current.rows[0];
        if (transfer.status !== 'in_transit') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Can only receive transfers with status 'in_transit'. Current: '${transfer.status}'`,
          });
        }

        const transferItems = await client.query(
          'SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [id]
        );

        // Build received quantities map
        const receivedMap = {};
        if (receivedItems && Array.isArray(receivedItems)) {
          for (const ri of receivedItems) {
            receivedMap[ri.product_id] = { quantity: ri.quantity_received, notes: ri.notes };
          }
        }

        let hasDiscrepancy = false;

        for (const item of transferItems.rows) {
          const received = receivedMap[item.product_id];
          const qtyReceived = received !== undefined
            ? parseInt(received.quantity, 10)
            : (item.quantity_shipped || item.quantity_requested);
          const itemNotes = received?.notes || null;

          if (qtyReceived !== (item.quantity_shipped || item.quantity_requested)) {
            hasDiscrepancy = true;
          }

          // Update received quantity
          await client.query(
            'UPDATE inventory_transfer_items SET quantity_received = $1, notes = COALESCE($2, notes) WHERE id = $3',
            [qtyReceived, itemNotes, item.id]
          );

          // Add to destination inventory (upsert)
          const destInv = await client.query(
            'SELECT quantity_on_hand FROM location_inventory WHERE location_id = $1 AND product_id = $2',
            [transfer.to_location_id, item.product_id]
          );

          const qtyBefore = destInv.rows[0]?.quantity_on_hand || 0;

          if (destInv.rows.length > 0) {
            await client.query(
              `UPDATE location_inventory SET
                 quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
               WHERE location_id = $2 AND product_id = $3`,
              [qtyReceived, transfer.to_location_id, item.product_id]
            );
          } else {
            await client.query(
              `INSERT INTO location_inventory (location_id, product_id, quantity_on_hand)
               VALUES ($1, $2, $3)`,
              [transfer.to_location_id, item.product_id, qtyReceived]
            );
          }

          // Log adjustment
          await client.query(
            `INSERT INTO inventory_adjustments
               (location_id, product_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason, reference_id, adjusted_by)
             VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7, $8)`,
            [
              transfer.to_location_id, item.product_id,
              qtyReceived, qtyBefore, qtyBefore + qtyReceived,
              `Transfer in: ${transfer.transfer_number}`,
              transfer.id, req.user.id,
            ]
          );
        }

        // Update transfer status
        await client.query(
          `UPDATE inventory_transfers SET
             status = 'completed', received_by = $1, received_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [req.user.id, id]
        );

        await client.query('COMMIT');

        const updated = await pool.query('SELECT * FROM inventory_transfers WHERE id = $1', [id]);
        const updatedItems = await pool.query(
          `SELECT ti.*, p.name AS product_name
           FROM inventory_transfer_items ti JOIN products p ON ti.product_id = p.id
           WHERE ti.transfer_id = $1 ORDER BY ti.id`, [id]
        );

        res.json({
          success: true,
          transfer: { ...updated.rows[0], items: updatedItems.rows },
          has_discrepancy: hasDiscrepancy,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // POST /api/inventory/transfers/:id/cancel
  // ==========================================================================
  router.post(
    '/:id/cancel',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;
        const { reason } = req.body;

        await client.query('BEGIN');

        const current = await client.query(
          'SELECT * FROM inventory_transfers WHERE id = $1 FOR UPDATE', [id]
        );
        if (current.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Transfer not found' });
        }
        const transfer = current.rows[0];

        if (['completed', 'cancelled'].includes(transfer.status)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Cannot cancel a transfer with status '${transfer.status}'`,
          });
        }

        // Release reserved inventory at source (only if not yet shipped)
        if (['draft', 'requested', 'approved'].includes(transfer.status)) {
          const transferItems = await client.query(
            'SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [id]
          );
          for (const item of transferItems.rows) {
            await client.query(
              `UPDATE location_inventory SET
                 quantity_reserved = GREATEST(0, quantity_reserved - $1), updated_at = NOW()
               WHERE location_id = $2 AND product_id = $3`,
              [item.quantity_requested, transfer.from_location_id, item.product_id]
            );
          }
        }

        await client.query(
          `UPDATE inventory_transfers SET
             status = 'cancelled', notes = COALESCE(notes || E'\\n', '') || $1, updated_at = NOW()
           WHERE id = $2`,
          [reason ? `Cancelled: ${reason}` : 'Cancelled', id]
        );

        await client.query('COMMIT');

        res.json({ success: true, message: 'Transfer cancelled' });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  return router;
}

module.exports = { init };
