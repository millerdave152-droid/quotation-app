/**
 * Delivery Service
 * Handles delivery zones, scheduling, slots, and bookings
 */

class DeliveryService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
  }

  // =====================================================
  // ZONE MANAGEMENT
  // =====================================================

  /**
   * Get delivery zone by postal code
   * @param {string} postalCode - Postal code to look up
   * @returns {Promise<object|null>} Zone if found
   */
  async getZoneByPostalCode(postalCode) {
    if (!postalCode) return null;

    // Extract prefix (first 3 chars for Canadian postal codes)
    const prefix = postalCode.toUpperCase().replace(/\s/g, '').substring(0, 3);

    const cacheKey = `delivery:zone:${prefix}`;

    const fetchZone = async () => {
      const result = await this.pool.query(`
        SELECT *
        FROM delivery_zones
        WHERE is_active = true
          AND $1 = ANY(postal_codes)
        ORDER BY priority DESC
        LIMIT 1
      `, [prefix.substring(0, 2)]); // Match on first 2 chars (L5, M1, etc.)

      return result.rows[0] || null;
    };

    if (!this.cache) {
      return await fetchZone();
    }

    return await this.cache.cacheQuery(cacheKey, 'medium', fetchZone);
  }

  /**
   * Get all delivery zones
   * @param {boolean} activeOnly - Only return active zones
   * @returns {Promise<Array>} Zones
   */
  async getZones(activeOnly = true) {
    const query = activeOnly
      ? `SELECT * FROM delivery_zones WHERE is_active = true ORDER BY zone_name`
      : `SELECT * FROM delivery_zones ORDER BY zone_name`;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Create a delivery zone
   * @param {object} zoneData - Zone details
   * @returns {Promise<object>} Created zone
   */
  async createZone(zoneData) {
    const {
      zoneName,
      zoneCode,
      description,
      postalCodes = [],
      cities = [],
      regions = [],
      baseDeliveryFeeCents = 0,
      perKmFeeCents = 0,
      minimumOrderCents = 0,
      freeDeliveryThresholdCents = null,
      defaultCapacity = 10,
      leadTimeDays = 2,
      maxLeadTimeDays = 14
    } = zoneData;

    const result = await this.pool.query(`
      INSERT INTO delivery_zones (
        zone_name, zone_code, description,
        postal_codes, cities, regions,
        base_delivery_fee_cents, per_km_fee_cents,
        minimum_order_cents, free_delivery_threshold_cents,
        default_capacity, lead_time_days, max_lead_time_days
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      zoneName, zoneCode, description,
      postalCodes, cities, regions,
      baseDeliveryFeeCents, perKmFeeCents,
      minimumOrderCents, freeDeliveryThresholdCents,
      defaultCapacity, leadTimeDays, maxLeadTimeDays
    ]);

    this.cache?.invalidatePattern('delivery:*');

    return result.rows[0];
  }

  /**
   * Update a delivery zone
   * @param {number} zoneId - Zone ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated zone
   */
  async updateZone(zoneId, updates) {
    const allowedFields = [
      'zone_name', 'zone_code', 'description',
      'postal_codes', 'cities', 'regions',
      'base_delivery_fee_cents', 'per_km_fee_cents',
      'minimum_order_cents', 'free_delivery_threshold_cents',
      'default_capacity', 'lead_time_days', 'max_lead_time_days',
      'is_active', 'priority'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(zoneId);

    const result = await this.pool.query(`
      UPDATE delivery_zones
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    this.cache?.invalidatePattern('delivery:*');

    return result.rows[0];
  }

  // =====================================================
  // SLOT MANAGEMENT
  // =====================================================

  /**
   * Generate delivery slots for a date range
   * @param {number} zoneId - Zone ID (null for all zones)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<number>} Number of slots created
   */
  async generateSlots(zoneId, startDate, endDate) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get zones
      let zones;
      if (zoneId) {
        const zoneResult = await client.query(`
          SELECT * FROM delivery_zones WHERE id = $1 AND is_active = true
        `, [zoneId]);
        zones = zoneResult.rows;
      } else {
        const zonesResult = await client.query(`
          SELECT * FROM delivery_zones WHERE is_active = true
        `);
        zones = zonesResult.rows;
      }

      let slotsCreated = 0;
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (const zone of zones) {
        // Get schedule config for this zone
        const configResult = await client.query(`
          SELECT * FROM delivery_schedule_config
          WHERE zone_id = $1 AND is_available = true
        `, [zone.id]);

        const configs = configResult.rows;

        // Check for blocked dates
        const blockedResult = await client.query(`
          SELECT blocked_date FROM delivery_blocked_dates
          WHERE (zone_id = $1 OR zone_id IS NULL)
            AND blocked_date BETWEEN $2 AND $3
        `, [zone.id, start, end]);

        const blockedDates = new Set(
          blockedResult.rows.map(r => r.blocked_date.toISOString().split('T')[0])
        );

        // Generate slots for each day
        const currentDate = new Date(start);
        while (currentDate <= end) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayOfWeek = currentDate.getDay();

          // Skip blocked dates
          if (blockedDates.has(dateStr)) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }

          // Find config for this day
          const dayConfig = configs.find(c => c.day_of_week === dayOfWeek);

          if (dayConfig) {
            // Create slots based on config
            const slots = [
              { start: dayConfig.slot_1_start, end: dayConfig.slot_1_end, capacity: dayConfig.slot_1_capacity },
              { start: dayConfig.slot_2_start, end: dayConfig.slot_2_end, capacity: dayConfig.slot_2_capacity },
              { start: dayConfig.slot_3_start, end: dayConfig.slot_3_end, capacity: dayConfig.slot_3_capacity }
            ].filter(s => s.start && s.end);

            for (const slot of slots) {
              try {
                await client.query(`
                  INSERT INTO delivery_slots (
                    zone_id, slot_date, slot_start, slot_end, capacity, surcharge_cents
                  )
                  VALUES ($1, $2, $3, $4, $5, $6)
                  ON CONFLICT (zone_id, slot_date, slot_start) DO NOTHING
                `, [
                  zone.id,
                  currentDate,
                  slot.start,
                  slot.end,
                  slot.capacity || zone.default_capacity,
                  dayConfig.day_surcharge_cents || 0
                ]);
                slotsCreated++;
              } catch (e) {
                // Ignore duplicate errors
              }
            }
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      await client.query('COMMIT');

      this.cache?.invalidatePattern('delivery:slots:*');

      return slotsCreated;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get available delivery slots
   * @param {object} options - Query options
   * @returns {Promise<Array>} Available slots
   */
  async getAvailableSlots(options = {}) {
    const {
      postalCode,
      zoneId,
      startDate,
      endDate,
      minCapacity = 1
    } = options;

    // Determine zone
    let targetZoneId = zoneId;
    if (!targetZoneId && postalCode) {
      const zone = await this.getZoneByPostalCode(postalCode);
      if (!zone) {
        return [];
      }
      targetZoneId = zone.id;
    }

    if (!targetZoneId) {
      throw new Error('Either postalCode or zoneId is required');
    }

    // Get zone details for lead time
    const zoneResult = await this.pool.query(`
      SELECT * FROM delivery_zones WHERE id = $1
    `, [targetZoneId]);

    if (zoneResult.rows.length === 0) {
      return [];
    }

    const zone = zoneResult.rows[0];

    // Calculate date range based on lead time
    const minDate = startDate || new Date();
    minDate.setDate(minDate.getDate() + zone.lead_time_days);

    const maxDate = endDate || new Date();
    if (!endDate) {
      maxDate.setDate(maxDate.getDate() + zone.max_lead_time_days);
    }

    const result = await this.pool.query(`
      SELECT
        ds.*,
        dz.zone_name,
        dz.base_delivery_fee_cents,
        (ds.capacity - ds.booked) as available
      FROM delivery_slots ds
      JOIN delivery_zones dz ON ds.zone_id = dz.id
      WHERE ds.zone_id = $1
        AND ds.slot_date >= $2
        AND ds.slot_date <= $3
        AND ds.is_blocked = false
        AND (ds.capacity - ds.booked) >= $4
      ORDER BY ds.slot_date, ds.slot_start
    `, [targetZoneId, minDate, maxDate, minCapacity]);

    return result.rows;
  }

  /**
   * Block a delivery slot
   * @param {number} slotId - Slot ID
   * @param {string} reason - Block reason
   * @param {string} blockedBy - User blocking
   * @returns {Promise<object>} Updated slot
   */
  async blockSlot(slotId, reason, blockedBy) {
    const result = await this.pool.query(`
      UPDATE delivery_slots
      SET
        is_blocked = true,
        block_reason = $2,
        blocked_by = $3,
        blocked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [slotId, reason, blockedBy]);

    this.cache?.invalidatePattern('delivery:slots:*');

    return result.rows[0];
  }

  /**
   * Unblock a delivery slot
   * @param {number} slotId - Slot ID
   * @returns {Promise<object>} Updated slot
   */
  async unblockSlot(slotId) {
    const result = await this.pool.query(`
      UPDATE delivery_slots
      SET
        is_blocked = false,
        block_reason = NULL,
        blocked_by = NULL,
        blocked_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [slotId]);

    this.cache?.invalidatePattern('delivery:slots:*');

    return result.rows[0];
  }

  // =====================================================
  // BOOKING MANAGEMENT
  // =====================================================

  /**
   * Generate booking number
   * @returns {Promise<string>} Booking number
   */
  async generateBookingNumber() {
    const result = await this.pool.query(`
      SELECT nextval('delivery_booking_seq') as seq
    `);
    return `DEL-${String(result.rows[0].seq).padStart(6, '0')}`;
  }

  /**
   * Book a delivery slot
   * @param {number} slotId - Slot ID
   * @param {object} bookingData - Booking details
   * @returns {Promise<object>} Created booking
   */
  async bookSlot(slotId, bookingData) {
    const {
      orderId = null,
      quotationId = null,
      customerId = null,
      deliveryAddress,
      deliveryCity,
      deliveryPostalCode,
      deliveryInstructions,
      accessCode,
      floorLevel,
      hasElevator = false,
      contactName,
      contactPhone,
      contactEmail,
      alternatePhone,
      notes,
      bookedBy = 'system'
    } = bookingData;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get slot and verify availability
      const slotResult = await client.query(`
        SELECT ds.*, dz.base_delivery_fee_cents
        FROM delivery_slots ds
        JOIN delivery_zones dz ON ds.zone_id = dz.id
        WHERE ds.id = $1
        FOR UPDATE
      `, [slotId]);

      if (slotResult.rows.length === 0) {
        throw new Error(`Slot ${slotId} not found`);
      }

      const slot = slotResult.rows[0];

      if (slot.is_blocked) {
        throw new Error('This slot is blocked');
      }

      if (slot.capacity - slot.booked < 1) {
        throw new Error('No availability in this slot');
      }

      // Generate booking number
      const bookingNumber = await this.generateBookingNumber();

      // Calculate delivery fee
      const deliveryFeeCents = slot.base_delivery_fee_cents + (slot.surcharge_cents || 0);

      // Create booking
      const bookingResult = await client.query(`
        INSERT INTO delivery_bookings (
          booking_number, slot_id, order_id, quotation_id, customer_id,
          delivery_address, delivery_city, delivery_postal_code,
          delivery_instructions, access_code, floor_level, has_elevator,
          contact_name, contact_phone, contact_email, alternate_phone,
          scheduled_date, scheduled_start, scheduled_end,
          delivery_fee_cents, surcharge_cents,
          notes, booked_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING *
      `, [
        bookingNumber, slotId, orderId, quotationId, customerId,
        deliveryAddress, deliveryCity, deliveryPostalCode,
        deliveryInstructions, accessCode, floorLevel, hasElevator,
        contactName, contactPhone, contactEmail, alternatePhone,
        slot.slot_date, slot.slot_start, slot.slot_end,
        slot.base_delivery_fee_cents, slot.surcharge_cents || 0,
        notes, bookedBy
      ]);

      // CRITICAL FIX: Update the slot's booked count atomically
      await client.query(`
        UPDATE delivery_slots
        SET booked = booked + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [slotId]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('delivery:*');

      return bookingResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get booking by ID
   * @param {number} bookingId - Booking ID
   * @returns {Promise<object|null>} Booking
   */
  async getBookingById(bookingId) {
    const result = await this.pool.query(`
      SELECT
        db.*,
        ds.slot_date,
        ds.slot_start,
        ds.slot_end,
        dz.zone_name,
        o.order_number,
        q.quote_number,
        c.company_name,
        c.contact_name as customer_contact
      FROM delivery_bookings db
      JOIN delivery_slots ds ON db.slot_id = ds.id
      JOIN delivery_zones dz ON ds.zone_id = dz.id
      LEFT JOIN orders o ON db.order_id = o.id
      LEFT JOIN quotations q ON db.quotation_id = q.id
      LEFT JOIN customers c ON db.customer_id = c.id
      WHERE db.id = $1
    `, [bookingId]);

    return result.rows[0] || null;
  }

  /**
   * Update booking status
   * @param {number} bookingId - Booking ID
   * @param {string} status - New status
   * @param {object} details - Additional details
   * @returns {Promise<object>} Updated booking
   */
  async updateBookingStatus(bookingId, status, details = {}) {
    const validStatuses = ['pending', 'scheduled', 'confirmed', 'in_transit', 'delivered', 'failed', 'cancelled', 'rescheduled'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
    }

    const {
      actualArrival,
      actualDeparture,
      signatureCaptured,
      signatureData,
      deliveryPhotoUrl,
      issueReported,
      internalNotes
    } = details;

    const result = await this.pool.query(`
      UPDATE delivery_bookings
      SET
        status = $2,
        actual_arrival = COALESCE($3, actual_arrival),
        actual_departure = COALESCE($4, actual_departure),
        signature_captured = COALESCE($5, signature_captured),
        signature_data = COALESCE($6, signature_data),
        delivery_photo_url = COALESCE($7, delivery_photo_url),
        issue_reported = COALESCE($8, issue_reported),
        internal_notes = COALESCE($9, internal_notes),
        completed_at = ${status === 'delivered' ? 'CURRENT_TIMESTAMP' : 'completed_at'},
        cancelled_at = ${status === 'cancelled' ? 'CURRENT_TIMESTAMP' : 'cancelled_at'},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [
      bookingId, status,
      actualArrival, actualDeparture,
      signatureCaptured, signatureData, deliveryPhotoUrl,
      issueReported, internalNotes
    ]);

    this.cache?.invalidatePattern('delivery:*');

    return result.rows[0];
  }

  /**
   * Cancel a booking
   * @param {number} bookingId - Booking ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<object>} Cancelled booking
   */
  async cancelBooking(bookingId, reason) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get booking
      const bookingResult = await client.query(`
        SELECT * FROM delivery_bookings WHERE id = $1
      `, [bookingId]);

      if (bookingResult.rows.length === 0) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const booking = bookingResult.rows[0];

      if (booking.status === 'cancelled') {
        throw new Error('Booking is already cancelled');
      }

      if (['delivered', 'in_transit'].includes(booking.status)) {
        throw new Error(`Cannot cancel booking with status ${booking.status}`);
      }

      // Update booking
      await client.query(`
        UPDATE delivery_bookings
        SET
          status = 'cancelled',
          cancelled_at = CURRENT_TIMESTAMP,
          cancellation_reason = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [bookingId, reason]);

      // CRITICAL FIX: Decrement the slot's booked count to free up capacity
      await client.query(`
        UPDATE delivery_slots
        SET booked = GREATEST(booked - 1, 0), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [booking.slot_id]);

      await client.query('COMMIT');

      this.cache?.invalidatePattern('delivery:*');

      return await this.getBookingById(bookingId);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get bookings with filters
   * @param {object} options - Filter options
   * @returns {Promise<object>} Bookings with pagination
   */
  async getBookings(options = {}) {
    const {
      zoneId,
      status,
      date,
      fromDate,
      toDate,
      customerId,
      orderId,
      search,
      page = 1,
      limit = 50,
      sortBy = 'scheduled_date',
      sortOrder = 'ASC'
    } = options;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (zoneId) {
      conditions.push(`ds.zone_id = $${paramIndex++}`);
      params.push(zoneId);
    }

    if (status) {
      conditions.push(`db.status = $${paramIndex++}`);
      params.push(status);
    }

    if (date) {
      conditions.push(`db.scheduled_date = $${paramIndex++}`);
      params.push(date);
    }

    if (fromDate) {
      conditions.push(`db.scheduled_date >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`db.scheduled_date <= $${paramIndex++}`);
      params.push(toDate);
    }

    if (customerId) {
      conditions.push(`db.customer_id = $${paramIndex++}`);
      params.push(customerId);
    }

    if (orderId) {
      conditions.push(`db.order_id = $${paramIndex++}`);
      params.push(orderId);
    }

    if (search) {
      conditions.push(`(
        db.booking_number ILIKE $${paramIndex} OR
        db.contact_name ILIKE $${paramIndex} OR
        db.delivery_address ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.pool.query(`
      SELECT COUNT(*) as total
      FROM delivery_bookings db
      JOIN delivery_slots ds ON db.slot_id = ds.id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Get bookings
    const validSortColumns = ['scheduled_date', 'booking_number', 'status', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'scheduled_date';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const bookingsResult = await this.pool.query(`
      SELECT
        db.*,
        dz.zone_name,
        o.order_number,
        q.quote_number
      FROM delivery_bookings db
      JOIN delivery_slots ds ON db.slot_id = ds.id
      JOIN delivery_zones dz ON ds.zone_id = dz.id
      LEFT JOIN orders o ON db.order_id = o.id
      LEFT JOIN quotations q ON db.quotation_id = q.id
      ${whereClause}
      ORDER BY db.${sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    return {
      bookings: bookingsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Calculate delivery fee for an order
   * @param {string} postalCode - Delivery postal code
   * @param {number} orderTotalCents - Order total in cents
   * @returns {Promise<object>} Fee calculation
   */
  async calculateDeliveryFee(postalCode, orderTotalCents) {
    const zone = await this.getZoneByPostalCode(postalCode);

    if (!zone) {
      return {
        deliverable: false,
        reason: 'Postal code not in delivery area'
      };
    }

    // Check minimum order
    if (zone.minimum_order_cents && orderTotalCents < zone.minimum_order_cents) {
      return {
        deliverable: false,
        reason: `Minimum order of $${(zone.minimum_order_cents / 100).toFixed(2)} required`,
        minimumOrderCents: zone.minimum_order_cents
      };
    }

    // Check free delivery threshold
    if (zone.free_delivery_threshold_cents && orderTotalCents >= zone.free_delivery_threshold_cents) {
      return {
        deliverable: true,
        feeCents: 0,
        freeDelivery: true,
        zone: zone.zone_name
      };
    }

    return {
      deliverable: true,
      feeCents: zone.base_delivery_fee_cents,
      freeDeliveryThresholdCents: zone.free_delivery_threshold_cents,
      zone: zone.zone_name
    };
  }
}

module.exports = DeliveryService;
