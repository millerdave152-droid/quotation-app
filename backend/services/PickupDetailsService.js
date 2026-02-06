/**
 * TeleTime - Pickup Details Service
 * Manages pickup information, status tracking, and completion for orders
 */

const { ApiError } = require('../middleware/errorHandler');

class PickupDetailsService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // UPSERT
  // ==========================================================================

  async upsert(orderId, data) {
    const orderResult = await this.pool.query(
      'SELECT id, fulfillment_type FROM unified_orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw ApiError.notFound('Order');
    }

    // Verify location exists and allows pickup
    const locResult = await this.pool.query(
      'SELECT id, name, is_pickup_location FROM locations WHERE id = $1',
      [data.locationId]
    );
    if (locResult.rows.length === 0) {
      throw ApiError.badRequest('Location not found');
    }
    if (!locResult.rows[0].is_pickup_location) {
      throw ApiError.badRequest('This location does not offer pickup');
    }

    const result = await this.pool.query(
      `INSERT INTO pickup_details (
        order_id, location_id, pickup_date, pickup_time_preference,
        pickup_person_name, pickup_person_phone, pickup_person_email,
        vehicle_type, vehicle_notes, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (order_id) DO UPDATE SET
        location_id = EXCLUDED.location_id,
        pickup_date = EXCLUDED.pickup_date,
        pickup_time_preference = EXCLUDED.pickup_time_preference,
        pickup_person_name = EXCLUDED.pickup_person_name,
        pickup_person_phone = EXCLUDED.pickup_person_phone,
        pickup_person_email = EXCLUDED.pickup_person_email,
        vehicle_type = EXCLUDED.vehicle_type,
        vehicle_notes = EXCLUDED.vehicle_notes,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *`,
      [
        orderId,
        data.locationId,
        data.pickupDate,
        data.pickupTimePreference || null,
        data.pickupPersonName,
        data.pickupPersonPhone,
        data.pickupPersonEmail || null,
        data.vehicleType || null,
        data.vehicleNotes || null,
        data.notes || null,
      ]
    );

    return this._mapRow(result.rows[0]);
  }

  // ==========================================================================
  // GET
  // ==========================================================================

  async getByOrderId(orderId) {
    const result = await this.pool.query(
      `SELECT pd.*, l.name AS location_name, l.address AS location_address,
              l.city AS location_city, l.province AS location_province,
              l.postal_code AS location_postal_code, l.phone AS location_phone
       FROM pickup_details pd
       JOIN locations l ON l.id = pd.location_id
       WHERE pd.order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapRow(result.rows[0]);
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  async update(orderId, data) {
    // Verify exists
    const existing = await this.getByOrderId(orderId);
    if (!existing) {
      throw ApiError.notFound('Pickup details');
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = {
      locationId: 'location_id',
      pickupDate: 'pickup_date',
      pickupTimePreference: 'pickup_time_preference',
      pickupPersonName: 'pickup_person_name',
      pickupPersonPhone: 'pickup_person_phone',
      pickupPersonEmail: 'pickup_person_email',
      vehicleType: 'vehicle_type',
      vehicleNotes: 'vehicle_notes',
      notes: 'notes',
    };

    for (const [camel, snake] of Object.entries(allowedFields)) {
      if (data[camel] !== undefined) {
        updates.push(`${snake} = $${paramIndex++}`);
        values.push(data[camel]);
      }
    }

    if (updates.length === 0) {
      return existing;
    }

    // If changing location, verify new location
    if (data.locationId) {
      const locResult = await this.pool.query(
        'SELECT id, is_pickup_location FROM locations WHERE id = $1',
        [data.locationId]
      );
      if (locResult.rows.length === 0) {
        throw ApiError.badRequest('Location not found');
      }
      if (!locResult.rows[0].is_pickup_location) {
        throw ApiError.badRequest('This location does not offer pickup');
      }
    }

    updates.push('updated_at = NOW()');
    values.push(orderId);

    const result = await this.pool.query(
      `UPDATE pickup_details SET ${updates.join(', ')} WHERE order_id = $${paramIndex} RETURNING *`,
      values
    );

    return this._mapRow(result.rows[0]);
  }

  // ==========================================================================
  // STATUS TRANSITIONS
  // ==========================================================================

  async markReady(orderId) {
    const result = await this.pool.query(
      `UPDATE pickup_details
       SET status = 'ready', ready_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 AND status = 'pending'
       RETURNING *`,
      [orderId]
    );

    if (result.rows.length === 0) {
      // Check if it exists at all
      const exists = await this.pool.query(
        'SELECT id, status FROM pickup_details WHERE order_id = $1',
        [orderId]
      );
      if (exists.rows.length === 0) {
        throw ApiError.notFound('Pickup details');
      }
      throw ApiError.badRequest(`Cannot mark as ready: current status is '${exists.rows[0].status}'`);
    }

    return this._mapRow(result.rows[0]);
  }

  async markNotified(orderId) {
    const result = await this.pool.query(
      `UPDATE pickup_details
       SET status = 'notified', notified_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 AND status = 'ready'
       RETURNING *`,
      [orderId]
    );

    if (result.rows.length === 0) {
      const exists = await this.pool.query(
        'SELECT id, status FROM pickup_details WHERE order_id = $1',
        [orderId]
      );
      if (exists.rows.length === 0) {
        throw ApiError.notFound('Pickup details');
      }
      throw ApiError.badRequest(`Cannot mark as notified: current status is '${exists.rows[0].status}'`);
    }

    return this._mapRow(result.rows[0]);
  }

  async completePickup(orderId, staffName) {
    const result = await this.pool.query(
      `UPDATE pickup_details
       SET status = 'picked_up', picked_up_at = NOW(), picked_up_by = $2, updated_at = NOW()
       WHERE order_id = $1 AND status IN ('ready', 'notified')
       RETURNING *`,
      [orderId, staffName]
    );

    if (result.rows.length === 0) {
      const exists = await this.pool.query(
        'SELECT id, status FROM pickup_details WHERE order_id = $1',
        [orderId]
      );
      if (exists.rows.length === 0) {
        throw ApiError.notFound('Pickup details');
      }
      throw ApiError.badRequest(
        `Cannot complete pickup: current status is '${exists.rows[0].status}'. Order must be 'ready' or 'notified'.`
      );
    }

    return this._mapRow(result.rows[0]);
  }

  // ==========================================================================
  // PENDING PICKUPS (WAREHOUSE VIEW)
  // ==========================================================================

  async getPendingPickups(filters = {}) {
    const conditions = ["pd.status IN ('pending', 'ready', 'notified')"];
    const values = [];
    let paramIndex = 1;

    if (filters.locationId) {
      conditions.push(`pd.location_id = $${paramIndex++}`);
      values.push(filters.locationId);
    }
    if (filters.date) {
      conditions.push(`pd.pickup_date = $${paramIndex++}`);
      values.push(filters.date);
    }
    if (filters.status) {
      // Override the default IN clause
      conditions[0] = `pd.status = $${paramIndex++}`;
      values.push(filters.status);
    }

    const result = await this.pool.query(
      `SELECT pd.*,
              l.name AS location_name,
              uo.order_number, uo.customer_name, uo.customer_phone,
              uo.total_cents, uo.status AS order_status
       FROM pickup_details pd
       JOIN locations l ON l.id = pd.location_id
       JOIN unified_orders uo ON uo.id = pd.order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pd.pickup_date, pd.pickup_time_preference, pd.created_at`,
      values
    );

    return result.rows.map(row => ({
      ...this._mapRow(row),
      orderNumber: row.order_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      totalCents: row.total_cents,
      total: row.total_cents / 100,
      orderStatus: row.order_status,
    }));
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  async validateForCompletion(orderId) {
    const errors = [];

    const orderResult = await this.pool.query(
      'SELECT fulfillment_type FROM unified_orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return { valid: false, errors: ['Order not found'], warnings: [] };
    }

    if (orderResult.rows[0].fulfillment_type !== 'pickup') {
      return { valid: true, errors: [], warnings: [] };
    }

    const details = await this.getByOrderId(orderId);
    if (!details) {
      errors.push('Pickup details are required for pickup orders');
      return { valid: false, errors, warnings: [] };
    }

    return { valid: errors.length === 0, errors, warnings: [] };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  _mapRow(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      locationId: row.location_id,
      locationName: row.location_name || null,
      locationAddress: row.location_address || null,
      locationCity: row.location_city || null,
      locationProvince: row.location_province || null,
      locationPostalCode: row.location_postal_code || null,
      locationPhone: row.location_phone || null,
      pickupDate: row.pickup_date,
      pickupTimePreference: row.pickup_time_preference,
      pickupPersonName: row.pickup_person_name,
      pickupPersonPhone: row.pickup_person_phone,
      pickupPersonEmail: row.pickup_person_email,
      vehicleType: row.vehicle_type,
      vehicleNotes: row.vehicle_notes,
      status: row.status,
      readyAt: row.ready_at,
      notifiedAt: row.notified_at,
      pickedUpAt: row.picked_up_at,
      pickedUpBy: row.picked_up_by,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = PickupDetailsService;
