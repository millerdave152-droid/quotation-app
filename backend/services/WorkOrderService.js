const { ApiError } = require('../middleware/errorHandler');

class WorkOrderService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
  }

  async _generateWONumber(client) {
    const db = client || this.pool;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { rows } = await db.query(
      `SELECT wo_number FROM work_orders WHERE wo_number LIKE $1 ORDER BY wo_number DESC LIMIT 1`,
      [`WO-${today}-%`]
    );
    let seq = 1;
    if (rows.length) {
      const last = rows[0].wo_number.split('-')[2];
      seq = parseInt(last) + 1;
    }
    return `WO-${today}-${String(seq).padStart(4, '0')}`;
  }

  async createWorkOrder(data, userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const woNumber = await this._generateWONumber(client);

      const { rows: [wo] } = await client.query(
        `INSERT INTO work_orders (wo_number, customer_id, transaction_id, order_id, location_id,
         work_type, status, priority, scheduled_date, scheduled_time_start, scheduled_time_end,
         assigned_to, assigned_team, address_line1, address_line2, city, province, postal_code,
         labor_cost_cents, parts_cost_cents, total_cost_cents, billed_to, description, internal_notes,
         customer_notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         COALESCE($18,0)+COALESCE($19,0),$20,$21,$22,$23,$24)
         RETURNING *`,
        [woNumber, data.customerId, data.transactionId || null, data.orderId || null,
         data.locationId || null, data.workType || 'delivery', data.priority || 'normal',
         data.scheduledDate || null, data.scheduledTimeStart || null, data.scheduledTimeEnd || null,
         data.assignedTo || null, data.assignedTeam || null,
         data.addressLine1 || null, data.addressLine2 || null, data.city || null,
         data.province || null, data.postalCode || null,
         data.laborCostCents || 0, data.partsCostCents || 0,
         data.billedTo || 'customer', data.description || null, data.internalNotes || null,
         data.customerNotes || null, userId]
      );

      // Record initial status
      await client.query(
        `INSERT INTO work_order_status_history (work_order_id, to_status, changed_by, notes)
         VALUES ($1, 'draft', $2, 'Work order created')`,
        [wo.id, userId]
      );

      // Add items if provided
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await client.query(
            `INSERT INTO work_order_items (work_order_id, product_id, serial_number, description, quantity, unit_cost_cents, item_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [wo.id, item.productId || null, item.serialNumber || null, item.description || null,
             item.quantity || 1, item.unitCostCents || 0, item.itemType || 'product']
          );
        }
      }

      await client.query('COMMIT');
      return wo;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getWorkOrder(woId) {
    const { rows: [wo] } = await this.pool.query(
      `SELECT wo.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
       l.name as location_name, u.name as assigned_to_name, u2.name as created_by_name
       FROM work_orders wo
       LEFT JOIN customers c ON c.id = wo.customer_id
       LEFT JOIN locations l ON l.id = wo.location_id
       LEFT JOIN users u ON u.id = wo.assigned_to
       LEFT JOIN users u2 ON u2.id = wo.created_by
       WHERE wo.id = $1`, [woId]
    );
    if (!wo) throw new ApiError(404, 'Work order not found');

    const { rows: items } = await this.pool.query(
      `SELECT woi.*, p.name as product_name, p.sku
       FROM work_order_items woi LEFT JOIN products p ON p.id = woi.product_id
       WHERE woi.work_order_id = $1 ORDER BY woi.id`, [woId]
    );

    const { rows: history } = await this.pool.query(
      `SELECT wsh.*, u.name as changed_by_name
       FROM work_order_status_history wsh LEFT JOIN users u ON u.id = wsh.changed_by
       WHERE wsh.work_order_id = $1 ORDER BY wsh.created_at`, [woId]
    );

    const { rows: photos } = await this.pool.query(
      `SELECT id, photo_type, caption, latitude, longitude, created_at FROM work_order_photos WHERE work_order_id = $1`, [woId]
    );

    const { rows: signatures } = await this.pool.query(
      `SELECT id, signer_name, relationship, created_at FROM work_order_signatures WHERE work_order_id = $1`, [woId]
    );

    return { ...wo, items, history, photos, signatures };
  }

  async listWorkOrders({ status, workType, assignedTo, locationId, customerId, scheduledDate, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let pi = 1;

    if (status) { conditions.push(`wo.status = $${pi++}`); params.push(status); }
    if (workType) { conditions.push(`wo.work_type = $${pi++}`); params.push(workType); }
    if (assignedTo) { conditions.push(`wo.assigned_to = $${pi++}`); params.push(assignedTo); }
    if (locationId) { conditions.push(`wo.location_id = $${pi++}`); params.push(locationId); }
    if (customerId) { conditions.push(`wo.customer_id = $${pi++}`); params.push(customerId); }
    if (scheduledDate) { conditions.push(`wo.scheduled_date = $${pi++}`); params.push(scheduledDate); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await this.pool.query(
      `SELECT wo.*, c.name as customer_name, l.name as location_name, u.name as assigned_to_name
       FROM work_orders wo
       LEFT JOIN customers c ON c.id = wo.customer_id
       LEFT JOIN locations l ON l.id = wo.location_id
       LEFT JOIN users u ON u.id = wo.assigned_to
       ${where}
       ORDER BY CASE wo.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
       wo.scheduled_date ASC NULLS LAST, wo.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const { rows: [{ total }] } = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM work_orders wo ${where}`, params
    );

    return { workOrders: rows, total };
  }

  async updateWorkOrder(woId, data, userId) {
    const fields = [];
    const params = [];
    let pi = 1;

    const allowed = ['customer_id', 'location_id', 'work_type', 'priority', 'scheduled_date',
      'scheduled_time_start', 'scheduled_time_end', 'assigned_to', 'assigned_team',
      'address_line1', 'address_line2', 'city', 'province', 'postal_code',
      'labor_cost_cents', 'parts_cost_cents', 'billed_to', 'description', 'internal_notes', 'customer_notes'];

    for (const [key, val] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(col)) {
        fields.push(`${col} = $${pi++}`);
        params.push(val);
      }
    }

    if (fields.length === 0) throw new ApiError(400, 'No valid fields to update');

    fields.push(`total_cost_cents = COALESCE(labor_cost_cents, 0) + COALESCE(parts_cost_cents, 0)`);
    fields.push(`updated_at = NOW()`);
    params.push(woId);

    const { rows: [wo] } = await this.pool.query(
      `UPDATE work_orders SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`,
      params
    );
    if (!wo) throw new ApiError(404, 'Work order not found');
    return wo;
  }

  async transitionStatus(woId, newStatus, userId, notes = null) {
    const validTransitions = {
      draft: ['scheduled', 'cancelled'],
      scheduled: ['assigned', 'cancelled'],
      assigned: ['in_progress', 'cancelled'],
      in_progress: ['on_hold', 'completed', 'cancelled'],
      on_hold: ['in_progress', 'cancelled'],
      completed: ['closed'],
      closed: [],
      cancelled: []
    };

    const { rows: [wo] } = await this.pool.query(
      `SELECT * FROM work_orders WHERE id = $1`, [woId]
    );
    if (!wo) throw new ApiError(404, 'Work order not found');

    if (!validTransitions[wo.status]?.includes(newStatus)) {
      throw new ApiError(400, `Cannot transition from ${wo.status} to ${newStatus}`);
    }

    const updateFields = [`status = $2`, `updated_at = NOW()`];
    const params = [woId, newStatus];
    let pi = 3;

    if (newStatus === 'in_progress' && !wo.started_at) {
      updateFields.push(`started_at = NOW()`);
    } else if (newStatus === 'completed') {
      updateFields.push(`completed_at = NOW()`);
    } else if (newStatus === 'closed') {
      updateFields.push(`closed_at = NOW()`);
    }

    const { rows: [updated] } = await this.pool.query(
      `UPDATE work_orders SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    await this.pool.query(
      `INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [woId, wo.status, newStatus, userId, notes]
    );

    return updated;
  }

  async assignWorkOrder(woId, assignedTo, userId) {
    const { rows: [wo] } = await this.pool.query(
      `UPDATE work_orders SET assigned_to = $2, status = CASE WHEN status = 'scheduled' THEN 'assigned' ELSE status END,
       updated_at = NOW() WHERE id = $1 RETURNING *`,
      [woId, assignedTo]
    );
    if (!wo) throw new ApiError(404, 'Work order not found');

    await this.pool.query(
      `INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [woId, wo.status, wo.status, userId, `Assigned to user ${assignedTo}`]
    );

    return wo;
  }

  async addItem(woId, item) {
    const { rows: [newItem] } = await this.pool.query(
      `INSERT INTO work_order_items (work_order_id, product_id, serial_number, description, quantity, unit_cost_cents, item_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [woId, item.productId || null, item.serialNumber || null, item.description || null,
       item.quantity || 1, item.unitCostCents || 0, item.itemType || 'product']
    );

    // Recalculate parts cost
    await this.pool.query(
      `UPDATE work_orders SET parts_cost_cents = (
        SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) FROM work_order_items WHERE work_order_id = $1 AND item_type != 'labor'
       ), total_cost_cents = labor_cost_cents + (
        SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) FROM work_order_items WHERE work_order_id = $1 AND item_type != 'labor'
       ), updated_at = NOW() WHERE id = $1`,
      [woId]
    );

    return newItem;
  }

  async removeItem(woId, itemId) {
    await this.pool.query(
      `DELETE FROM work_order_items WHERE id = $1 AND work_order_id = $2`, [itemId, woId]
    );

    await this.pool.query(
      `UPDATE work_orders SET parts_cost_cents = (
        SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) FROM work_order_items WHERE work_order_id = $1 AND item_type != 'labor'
       ), total_cost_cents = labor_cost_cents + (
        SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) FROM work_order_items WHERE work_order_id = $1 AND item_type != 'labor'
       ), updated_at = NOW() WHERE id = $1`,
      [woId]
    );
  }

  async addPhoto(woId, photoData, photoType, caption, gps, userId) {
    const { rows: [photo] } = await this.pool.query(
      `INSERT INTO work_order_photos (work_order_id, photo_data, photo_type, caption, latitude, longitude, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, photo_type, caption, created_at`,
      [woId, photoData, photoType || 'other', caption || null, gps?.lat || null, gps?.lng || null, userId]
    );
    return photo;
  }

  async addSignature(woId, signatureData, signerName, relationship, gps) {
    const { rows: [sig] } = await this.pool.query(
      `INSERT INTO work_order_signatures (work_order_id, signature_data, signer_name, relationship, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [woId, signatureData, signerName, relationship || null, gps?.lat || null, gps?.lng || null]
    );
    return sig;
  }

  async getDashboardStats() {
    const { rows: [stats] } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'closed', 'cancelled'))::int as active_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_date = CURRENT_DATE)::int as today_scheduled,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('completed', 'closed', 'cancelled'))::int as urgent_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '7 days')::int as completed_this_week
      FROM work_orders
    `);
    return stats;
  }

  async getSchedule(startDate, endDate, locationId = null) {
    const params = [startDate, endDate];
    let locFilter = '';
    if (locationId) {
      locFilter = 'AND wo.location_id = $3';
      params.push(locationId);
    }

    const { rows } = await this.pool.query(
      `SELECT wo.*, c.name as customer_name, u.name as assigned_to_name
       FROM work_orders wo
       LEFT JOIN customers c ON c.id = wo.customer_id
       LEFT JOIN users u ON u.id = wo.assigned_to
       WHERE wo.scheduled_date BETWEEN $1 AND $2
       AND wo.status NOT IN ('cancelled', 'closed')
       ${locFilter}
       ORDER BY wo.scheduled_date, wo.scheduled_time_start`,
      params
    );
    return rows;
  }
}

module.exports = WorkOrderService;
