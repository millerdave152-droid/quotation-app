/**
 * TeleTime - Delivery Window Scheduling Service
 * Manages delivery zones, window configs, availability, and scheduled deliveries
 */

const { ApiError } = require('../middleware/errorHandler');

class DeliveryWindowService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // ZONE LOOKUP
  // ==========================================================================

  /**
   * Find the delivery zone for a postal code.
   * Matches against postal_code_patterns in delivery_zone_postal_codes
   * and falls back to the TEXT[] postal_codes column if present.
   */
  async findZoneByPostalCode(postalCode) {
    const normalized = postalCode.toUpperCase().replace(/\s/g, '');
    const prefix3 = normalized.substring(0, 3);
    const prefix1 = normalized.substring(0, 1);

    // Try delivery_zone_postal_codes table first (from migration 016)
    const pcResult = await this.pool.query(
      `SELECT dz.*
       FROM delivery_zones dz
       JOIN delivery_zone_postal_codes dzpc ON dzpc.zone_id = dz.id
       WHERE dz.is_active = true
         AND (
           dzpc.postal_code_pattern = $1
           OR dzpc.postal_code_pattern = $2
           OR dzpc.postal_code_pattern = $3
         )
       ORDER BY LENGTH(dzpc.postal_code_pattern) DESC, dz.priority ASC
       LIMIT 1`,
      [normalized, prefix3, prefix1]
    );

    if (pcResult.rows.length > 0) {
      return pcResult.rows[0];
    }

    // No match found
    return null;
  }

  // ==========================================================================
  // AVAILABLE WINDOWS
  // ==========================================================================

  /**
   * Get available delivery windows for a postal code and date.
   * Returns windows that still have capacity.
   */
  async getAvailableWindows(postalCode, date) {
    const zone = await this.findZoneByPostalCode(postalCode);
    if (!zone) {
      return {
        zone: null,
        windows: [],
        message: 'No delivery zone found for this postal code',
      };
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getUTCDay();

    // Get window configs for this zone and day, with booked counts
    const result = await this.pool.query(
      `SELECT
        dwc.id AS window_id,
        dwc.start_time,
        dwc.end_time,
        dwc.max_deliveries,
        COUNT(sd.id)::INTEGER AS booked_count,
        (dwc.max_deliveries - COUNT(sd.id)::INTEGER) AS available_slots
      FROM delivery_window_configs dwc
      LEFT JOIN scheduled_deliveries sd
        ON sd.window_config_id = dwc.id
        AND sd.delivery_date = $1
        AND sd.status NOT IN ('failed', 'rescheduled')
      WHERE dwc.zone_id = $2
        AND dwc.day_of_week = $3
        AND dwc.is_active = true
      GROUP BY dwc.id, dwc.start_time, dwc.end_time, dwc.max_deliveries
      HAVING (dwc.max_deliveries - COUNT(sd.id)::INTEGER) > 0
      ORDER BY dwc.start_time`,
      [date, zone.id, dayOfWeek]
    );

    return {
      zone: {
        id: zone.id,
        name: zone.zone_name,
        baseDeliveryFee: zone.base_delivery_fee,
      },
      date,
      dayOfWeek,
      windows: result.rows.map(row => ({
        windowId: row.window_id,
        startTime: row.start_time,
        endTime: row.end_time,
        maxDeliveries: row.max_deliveries,
        bookedCount: row.booked_count,
        availableSlots: row.available_slots,
      })),
    };
  }

  // ==========================================================================
  // SCHEDULE DELIVERY
  // ==========================================================================

  /**
   * Schedule a delivery for an order into a specific window.
   */
  async scheduleDelivery(orderId, data) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify order exists and is a delivery order
      const orderResult = await client.query(
        'SELECT id, fulfillment_type, status FROM unified_orders WHERE id = $1',
        [orderId]
      );
      if (orderResult.rows.length === 0) {
        throw ApiError.notFound('Order');
      }
      const order = orderResult.rows[0];

      if (order.fulfillment_type !== 'delivery') {
        throw ApiError.badRequest('Only delivery orders can be scheduled for delivery');
      }

      // Verify window config exists and has capacity
      const windowResult = await client.query(
        `SELECT
          dwc.id, dwc.zone_id, dwc.start_time, dwc.end_time, dwc.max_deliveries, dwc.day_of_week,
          COUNT(sd.id)::INTEGER AS booked_count
        FROM delivery_window_configs dwc
        LEFT JOIN scheduled_deliveries sd
          ON sd.window_config_id = dwc.id
          AND sd.delivery_date = $2
          AND sd.status NOT IN ('failed', 'rescheduled')
        WHERE dwc.id = $1
          AND dwc.is_active = true
        GROUP BY dwc.id`,
        [data.windowId, data.deliveryDate]
      );

      if (windowResult.rows.length === 0) {
        throw ApiError.badRequest('Delivery window not found or inactive');
      }

      const window = windowResult.rows[0];

      // Verify the date matches the window's day_of_week
      const dateObj = new Date(data.deliveryDate);
      if (dateObj.getUTCDay() !== window.day_of_week) {
        throw ApiError.badRequest(
          `Selected date is a ${this._dayName(dateObj.getUTCDay())} but this window is for ${this._dayName(window.day_of_week)}`
        );
      }

      if (window.booked_count >= window.max_deliveries) {
        throw ApiError.badRequest('This delivery window is fully booked');
      }

      // Upsert scheduled delivery
      const result = await client.query(
        `INSERT INTO scheduled_deliveries (
          order_id, zone_id, window_config_id,
          delivery_date, window_start, window_end,
          status, notes, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, NOW())
        ON CONFLICT (order_id) DO UPDATE SET
          zone_id = EXCLUDED.zone_id,
          window_config_id = EXCLUDED.window_config_id,
          delivery_date = EXCLUDED.delivery_date,
          window_start = EXCLUDED.window_start,
          window_end = EXCLUDED.window_end,
          status = 'scheduled',
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *`,
        [
          orderId,
          window.zone_id,
          window.id,
          data.deliveryDate,
          window.start_time,
          window.end_time,
          data.notes || null,
        ]
      );

      // Sync delivery date and time slot back to unified_orders
      await client.query(
        `UPDATE unified_orders
         SET delivery_date = $1, delivery_time_slot = $2
         WHERE id = $3`,
        [
          data.deliveryDate,
          `${this._formatTime(window.start_time)} - ${this._formatTime(window.end_time)}`,
          orderId,
        ]
      );

      await client.query('COMMIT');

      return this._mapScheduledDelivery(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // DELIVERY SCHEDULE (DISPATCH VIEW)
  // ==========================================================================

  /**
   * Get all scheduled deliveries for a given date, optionally filtered by zone and driver.
   */
  async getSchedule(filters = {}) {
    const { date, zoneId, driverId, status } = filters;
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (date) {
      conditions.push(`sd.delivery_date = $${paramIndex++}`);
      values.push(date);
    }
    if (zoneId) {
      conditions.push(`sd.zone_id = $${paramIndex++}`);
      values.push(zoneId);
    }
    if (driverId) {
      conditions.push(`sd.driver_id = $${paramIndex++}`);
      values.push(driverId);
    }
    if (status) {
      conditions.push(`sd.status = $${paramIndex++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `SELECT
        sd.*,
        uo.order_number,
        uo.customer_name,
        uo.customer_phone,
        uo.delivery_address,
        uo.total_cents,
        dz.zone_name,
        dd.dwelling_type,
        dd.floor_number,
        dd.elevator_required,
        dd.access_steps,
        dd.access_narrow_stairs,
        dd.parking_type,
        dd.parking_distance,
        dd.pathway_confirmed,
        u.name AS driver_name
      FROM scheduled_deliveries sd
      JOIN unified_orders uo ON uo.id = sd.order_id
      LEFT JOIN delivery_zones dz ON dz.id = sd.zone_id
      LEFT JOIN delivery_details dd ON dd.order_id = sd.order_id
      LEFT JOIN users u ON u.id = sd.driver_id
      ${whereClause}
      ORDER BY sd.delivery_date, sd.route_sequence NULLS LAST, sd.window_start`,
      values
    );

    return result.rows.map(row => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      deliveryAddress: row.delivery_address,
      totalCents: row.total_cents,
      total: row.total_cents / 100,

      // Schedule
      deliveryDate: row.delivery_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      status: row.status,
      estimatedArrival: row.estimated_arrival,
      actualArrival: row.actual_arrival,

      // Zone
      zoneId: row.zone_id,
      zoneName: row.zone_name,

      // Driver
      driverId: row.driver_id,
      driverName: row.driver_name,
      routeSequence: row.route_sequence,

      // Delivery details (from delivery_details table)
      dwellingType: row.dwelling_type,
      floorNumber: row.floor_number,
      elevatorRequired: row.elevator_required,
      accessSteps: row.access_steps,
      accessNarrowStairs: row.access_narrow_stairs,
      parkingType: row.parking_type,
      parkingDistance: row.parking_distance,
      pathwayConfirmed: row.pathway_confirmed,

      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // ==========================================================================
  // UPDATE DELIVERY STATUS
  // ==========================================================================

  async updateStatus(scheduledDeliveryId, newStatus, options = {}) {
    const validStatuses = ['scheduled', 'confirmed', 'out_for_delivery', 'delivered', 'failed', 'rescheduled'];
    if (!validStatuses.includes(newStatus)) {
      throw ApiError.badRequest(`Invalid status: ${newStatus}`);
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const values = [newStatus];
    let paramIndex = 2;

    if (options.driverId !== undefined) {
      updates.push(`driver_id = $${paramIndex++}`);
      values.push(options.driverId);
    }
    if (options.routeSequence !== undefined) {
      updates.push(`route_sequence = $${paramIndex++}`);
      values.push(options.routeSequence);
    }
    if (options.estimatedArrival !== undefined) {
      updates.push(`estimated_arrival = $${paramIndex++}`);
      values.push(options.estimatedArrival);
    }
    if (newStatus === 'delivered') {
      updates.push(`actual_arrival = NOW()`);
    }
    if (options.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(options.notes);
    }

    values.push(scheduledDeliveryId);

    const result = await this.pool.query(
      `UPDATE scheduled_deliveries SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Scheduled delivery');
    }

    return this._mapScheduledDelivery(result.rows[0]);
  }

  // ==========================================================================
  // ASSIGN DRIVER
  // ==========================================================================

  async assignDriver(scheduledDeliveryId, driverId, routeSequence = null) {
    return this.updateStatus(scheduledDeliveryId, undefined, {
      driverId,
      routeSequence,
    }).catch(() => {
      // If status update fails (undefined status), do a direct update
      return this.pool.query(
        `UPDATE scheduled_deliveries
         SET driver_id = $1, route_sequence = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [driverId, routeSequence, scheduledDeliveryId]
      ).then(r => {
        if (r.rows.length === 0) throw ApiError.notFound('Scheduled delivery');
        return this._mapScheduledDelivery(r.rows[0]);
      });
    });
  }

  // ==========================================================================
  // ZONE MANAGEMENT
  // ==========================================================================

  async getZones() {
    const result = await this.pool.query(
      `SELECT dz.*,
        ARRAY_AGG(dzpc.postal_code_pattern ORDER BY dzpc.postal_code_pattern)
          FILTER (WHERE dzpc.postal_code_pattern IS NOT NULL) AS postal_code_patterns
      FROM delivery_zones dz
      LEFT JOIN delivery_zone_postal_codes dzpc ON dzpc.zone_id = dz.id
      WHERE dz.is_active = true
      GROUP BY dz.id
      ORDER BY dz.priority, dz.zone_name`
    );

    return result.rows.map(row => ({
      id: row.id,
      zoneName: row.zone_name,
      zoneCode: row.zone_code,
      baseDeliveryFee: row.base_delivery_fee,
      postalCodePatterns: row.postal_code_patterns || [],
      isActive: row.is_active,
    }));
  }

  async getWindowConfigs(zoneId) {
    const result = await this.pool.query(
      `SELECT * FROM delivery_window_configs
       WHERE zone_id = $1 AND is_active = true
       ORDER BY day_of_week, start_time`,
      [zoneId]
    );

    return result.rows.map(row => ({
      id: row.id,
      zoneId: row.zone_id,
      dayOfWeek: row.day_of_week,
      dayName: this._dayName(row.day_of_week),
      startTime: row.start_time,
      endTime: row.end_time,
      maxDeliveries: row.max_deliveries,
      isActive: row.is_active,
    }));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  _mapScheduledDelivery(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      zoneId: row.zone_id,
      windowConfigId: row.window_config_id,
      deliveryDate: row.delivery_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      status: row.status,
      driverId: row.driver_id,
      routeSequence: row.route_sequence,
      estimatedArrival: row.estimated_arrival,
      actualArrival: row.actual_arrival,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _dayName(dow) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
  }

  _formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = String(timeStr).split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
}

module.exports = DeliveryWindowService;
