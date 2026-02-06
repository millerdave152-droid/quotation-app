/**
 * TeleTime POS - Delivery & Fulfillment Service
 *
 * Manages delivery options, zones, fees, and scheduling
 */

class DeliveryFulfillmentService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.CACHE_TTL = 300; // 5 minutes
  }

  // ============================================================================
  // DELIVERY OPTIONS
  // ============================================================================

  /**
   * Get available fulfillment options for a cart
   * @param {object} cart - Cart with items, subtotal, customer info
   * @param {object} customerAddress - Customer delivery address (optional)
   * @returns {Promise<object>} Available options with fees
   */
  async getAvailableOptions(cart, customerAddress = null) {
    try {
      const { items = [], subtotalCents = 0, customer = null } = cart;
      const subtotal = subtotalCents / 100;

      // Check if any items require delivery (can't be picked up)
      const deliveryRequired = this._checkDeliveryRequired(items);

      // Get all active delivery options
      const optionsResult = await this.pool.query(`
        SELECT
          id,
          option_type,
          option_name,
          description,
          base_price,
          min_order_amount,
          free_threshold,
          requires_address,
          requires_scheduled_time,
          display_order,
          icon_name
        FROM delivery_options
        WHERE is_available = TRUE
        ORDER BY display_order
      `);

      const options = [];
      let deliveryZone = null;

      // If address provided, find matching delivery zone
      if (customerAddress?.postalCode) {
        deliveryZone = await this._findDeliveryZone(customerAddress.postalCode);
      }

      for (const opt of optionsResult.rows) {
        const option = {
          id: opt.id,
          type: opt.option_type,
          name: opt.option_name,
          description: opt.description,
          iconName: opt.icon_name,
          requiresAddress: opt.requires_address,
          requiresScheduledTime: opt.requires_scheduled_time,
          available: true,
          unavailableReason: null,
          fee: parseFloat(opt.base_price),
          freeThreshold: opt.free_threshold ? parseFloat(opt.free_threshold) : null,
          isFree: false,
          estimatedDays: null,
          sameDayAvailable: false,
        };

        // Check availability and calculate fees based on type
        switch (opt.option_type) {
          case 'pickup_now':
          case 'pickup_scheduled':
            // Check if delivery is required (items can't be picked up)
            if (deliveryRequired.required) {
              option.available = false;
              option.unavailableReason = `Some items require delivery: ${deliveryRequired.items.join(', ')}`;
            }
            option.fee = 0;
            option.isFree = true;
            option.estimatedDays = { min: 0, max: 0 };
            break;

          case 'local_delivery':
            if (!customerAddress?.postalCode) {
              option.available = true; // Available but needs address
              option.unavailableReason = 'Address required';
            } else if (!deliveryZone) {
              option.available = false;
              option.unavailableReason = 'Address outside delivery area';
            } else {
              // Calculate fee based on zone
              option.fee = deliveryZone.deliveryFee;
              option.freeThreshold = deliveryZone.minOrderForFree;
              option.isFree = deliveryZone.minOrderForFree && subtotal >= deliveryZone.minOrderForFree;
              option.estimatedDays = {
                min: deliveryZone.estimatedDaysMin,
                max: deliveryZone.estimatedDaysMax,
              };
              option.sameDayAvailable = deliveryZone.sameDayAvailable;
              option.zoneName = deliveryZone.zoneName;
              option.zoneId = deliveryZone.zoneId;

              if (option.isFree) {
                option.fee = 0;
              }
            }
            break;

          case 'shipping':
            // Check minimum order amount
            if (opt.min_order_amount && subtotal < parseFloat(opt.min_order_amount)) {
              option.available = false;
              option.unavailableReason = `Minimum order $${opt.min_order_amount} required`;
            }

            // Check free threshold
            if (opt.free_threshold && subtotal >= parseFloat(opt.free_threshold)) {
              option.isFree = true;
              option.fee = 0;
            }

            option.estimatedDays = { min: 3, max: 7 }; // Default shipping estimate

            // TODO: Calculate actual shipping rates from carriers
            break;
        }

        options.push(option);
      }

      // Sort: available first, then by display order
      options.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return 0;
      });

      return {
        success: true,
        data: {
          options,
          deliveryRequired: deliveryRequired.required,
          deliveryRequiredItems: deliveryRequired.items,
          deliveryZone,
          subtotal,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] getAvailableOptions error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate delivery fee for a specific option
   * @param {string} optionType - Fulfillment type
   * @param {object} cart - Cart with items and subtotal
   * @param {object} address - Delivery address (optional)
   * @returns {Promise<object>} Fee calculation result
   */
  async calculateDeliveryFee(optionType, cart, address = null) {
    try {
      const { subtotalCents = 0 } = cart;
      const subtotal = subtotalCents / 100;

      // Get the delivery option
      const optionResult = await this.pool.query(`
        SELECT * FROM delivery_options
        WHERE option_type = $1 AND is_available = TRUE
      `, [optionType]);

      if (optionResult.rows.length === 0) {
        return {
          success: false,
          error: 'Delivery option not available',
        };
      }

      const option = optionResult.rows[0];
      let fee = parseFloat(option.base_price);
      let isFree = false;
      let freeThreshold = option.free_threshold ? parseFloat(option.free_threshold) : null;
      let zone = null;

      // Handle local delivery zone-based pricing
      if (optionType === 'local_delivery' && address?.postalCode) {
        zone = await this._findDeliveryZone(address.postalCode);

        if (!zone) {
          return {
            success: false,
            error: 'Address outside delivery area',
          };
        }

        fee = zone.deliveryFee;
        freeThreshold = zone.minOrderForFree;
      }

      // Check free threshold
      if (freeThreshold && subtotal >= freeThreshold) {
        isFree = true;
        fee = 0;
      }

      // Pickup is always free
      if (optionType === 'pickup_now' || optionType === 'pickup_scheduled') {
        fee = 0;
        isFree = true;
      }

      return {
        success: true,
        data: {
          optionType,
          fee: Math.round(fee * 100) / 100,
          feeCents: Math.round(fee * 100),
          isFree,
          freeThreshold,
          amountToFreeDelivery: freeThreshold ? Math.max(0, freeThreshold - subtotal) : null,
          zone: zone ? {
            id: zone.zoneId,
            name: zone.zoneName,
            estimatedDays: {
              min: zone.estimatedDaysMin,
              max: zone.estimatedDaysMax,
            },
          } : null,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] calculateDeliveryFee error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate if an address is within a delivery zone
   * @param {object} address - Address to validate
   * @returns {Promise<object>} Validation result with zone info
   */
  async validateDeliveryAddress(address) {
    try {
      if (!address?.postalCode) {
        return {
          success: false,
          valid: false,
          error: 'Postal code required',
        };
      }

      const zone = await this._findDeliveryZone(address.postalCode);

      if (!zone) {
        return {
          success: true,
          valid: false,
          inDeliveryZone: false,
          message: 'Address is outside our delivery area. Shipping is available.',
          suggestedOption: 'shipping',
        };
      }

      return {
        success: true,
        valid: true,
        inDeliveryZone: true,
        zone: {
          id: zone.zoneId,
          name: zone.zoneName,
          deliveryFee: zone.deliveryFee,
          minOrderForFree: zone.minOrderForFree,
          estimatedDays: {
            min: zone.estimatedDaysMin,
            max: zone.estimatedDaysMax,
          },
          sameDayAvailable: zone.sameDayAvailable,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] validateDeliveryAddress error:', error);
      return {
        success: false,
        valid: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // SCHEDULING
  // ============================================================================

  /**
   * Get available delivery/pickup time slots for a date
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} optionType - Fulfillment type (optional)
   * @param {number} zoneId - Delivery zone ID (optional)
   * @returns {Promise<object>} Available time slots
   */
  async getDeliverySlots(date, optionType = null, zoneId = null) {
    try {
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay();
      const isToday = this._isToday(targetDate);

      // Get schedules for this day
      const schedulesQuery = `
        SELECT
          ds.id,
          ds.delivery_option_id,
          ds.delivery_zone_id,
          ds.start_time,
          ds.end_time,
          ds.max_orders,
          ds.slot_surcharge,
          do.option_type,
          do.option_name,
          dz.zone_name,
          dz.same_day_cutoff
        FROM delivery_schedules ds
        LEFT JOIN delivery_options do ON ds.delivery_option_id = do.id
        LEFT JOIN delivery_zones dz ON ds.delivery_zone_id = dz.id
        WHERE ds.day_of_week = $1
          AND ds.is_active = TRUE
          ${optionType ? 'AND do.option_type = $2' : ''}
          ${zoneId ? `AND (ds.delivery_zone_id = ${zoneId} OR ds.delivery_zone_id IS NULL)` : ''}
        ORDER BY ds.start_time
      `;

      const params = [dayOfWeek];
      if (optionType) params.push(optionType);

      const schedulesResult = await this.pool.query(schedulesQuery, params);

      // Count existing orders for each slot
      const slotsWithCapacity = await Promise.all(
        schedulesResult.rows.map(async (schedule) => {
          let bookedCount = 0;

          if (schedule.max_orders) {
            const countResult = await this.pool.query(`
              SELECT COUNT(*) as booked
              FROM order_fulfillment
              WHERE scheduled_date = $1
                AND scheduled_time_start = $2
                AND status NOT IN ('cancelled', 'returned')
            `, [date, schedule.start_time]);

            bookedCount = parseInt(countResult.rows[0].booked);
          }

          // Check if slot is available
          let available = true;
          let unavailableReason = null;

          // Check same-day cutoff
          if (isToday && schedule.same_day_cutoff) {
            const now = new Date();
            const cutoff = this._parseTime(schedule.same_day_cutoff);
            if (now.getHours() * 60 + now.getMinutes() > cutoff.hours * 60 + cutoff.minutes) {
              available = false;
              unavailableReason = 'Past cutoff time for same-day';
            }
          }

          // Check if slot start time has passed
          if (isToday) {
            const slotStart = this._parseTime(schedule.start_time);
            const now = new Date();
            if (now.getHours() * 60 + now.getMinutes() >= slotStart.hours * 60 + slotStart.minutes) {
              available = false;
              unavailableReason = 'Time slot has passed';
            }
          }

          // Check capacity
          if (schedule.max_orders && bookedCount >= schedule.max_orders) {
            available = false;
            unavailableReason = 'Fully booked';
          }

          return {
            id: schedule.id,
            optionType: schedule.option_type,
            optionName: schedule.option_name,
            zoneName: schedule.zone_name,
            startTime: schedule.start_time,
            endTime: schedule.end_time,
            displayTime: `${this._formatTime(schedule.start_time)} - ${this._formatTime(schedule.end_time)}`,
            surcharge: parseFloat(schedule.slot_surcharge) || 0,
            available,
            unavailableReason,
            spotsRemaining: schedule.max_orders ? schedule.max_orders - bookedCount : null,
          };
        })
      );

      // Generate default slots if none configured
      if (slotsWithCapacity.length === 0) {
        const defaultSlots = this._generateDefaultSlots(targetDate, isToday);
        return {
          success: true,
          data: {
            date,
            dayOfWeek,
            slots: defaultSlots,
            isDefault: true,
          },
        };
      }

      return {
        success: true,
        data: {
          date,
          dayOfWeek,
          slots: slotsWithCapacity,
          isDefault: false,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] getDeliverySlots error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get available dates for delivery/pickup
   * @param {string} optionType - Fulfillment type
   * @param {number} daysAhead - Number of days to look ahead
   * @returns {Promise<object>} Available dates
   */
  async getAvailableDates(optionType, daysAhead = 14) {
    try {
      const dates = [];
      const today = new Date();

      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().slice(0, 10);

        // Get slots for this date
        const slotsResult = await this.getDeliverySlots(dateStr, optionType);

        if (slotsResult.success) {
          const availableSlots = slotsResult.data.slots.filter(s => s.available);

          dates.push({
            date: dateStr,
            dayOfWeek: date.getDay(),
            dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
            available: availableSlots.length > 0,
            slotsAvailable: availableSlots.length,
            isToday: i === 0,
          });
        }
      }

      return {
        success: true,
        data: dates,
      };
    } catch (error) {
      console.error('[DeliveryService] getAvailableDates error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Schedule delivery/pickup for an order
   * @param {object} params - Scheduling parameters
   * @returns {Promise<object>} Scheduling result
   */
  async scheduleDelivery(params) {
    const {
      transactionId,
      orderId,
      fulfillmentType,
      scheduledDate,
      timeSlotId,
      startTime,
      endTime,
      deliveryAddress,
      zoneId,
      deliveryFee,
      customerNotes,
      userId,
    } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Validate time slot if provided
      if (timeSlotId) {
        const slotResult = await client.query(`
          SELECT * FROM delivery_schedules
          WHERE id = $1 AND is_active = TRUE
        `, [timeSlotId]);

        if (slotResult.rows.length === 0) {
          throw new Error('Time slot not available');
        }

        // Check capacity
        const slot = slotResult.rows[0];
        if (slot.max_orders) {
          const countResult = await client.query(`
            SELECT COUNT(*) as booked
            FROM order_fulfillment
            WHERE scheduled_date = $1
              AND scheduled_time_start = $2
              AND status NOT IN ('cancelled', 'returned')
          `, [scheduledDate, slot.start_time]);

          if (parseInt(countResult.rows[0].booked) >= slot.max_orders) {
            throw new Error('Time slot is fully booked');
          }
        }
      }

      // Get delivery option ID
      const optionResult = await client.query(`
        SELECT id FROM delivery_options WHERE option_type = $1
      `, [fulfillmentType]);

      const deliveryOptionId = optionResult.rows[0]?.id;

      // Create fulfillment record
      const insertResult = await client.query(`
        INSERT INTO order_fulfillment (
          transaction_id,
          order_id,
          fulfillment_type,
          delivery_option_id,
          delivery_zone_id,
          status,
          scheduled_date,
          scheduled_time_start,
          scheduled_time_end,
          delivery_address,
          delivery_fee,
          customer_notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        transactionId,
        orderId,
        fulfillmentType,
        deliveryOptionId,
        zoneId,
        'pending',
        scheduledDate,
        startTime,
        endTime,
        deliveryAddress ? JSON.stringify(deliveryAddress) : null,
        deliveryFee || 0,
        customerNotes,
        userId,
      ]);

      const fulfillment = insertResult.rows[0];

      // Log initial status
      await client.query(`
        INSERT INTO fulfillment_status_history (
          fulfillment_id,
          previous_status,
          new_status,
          changed_by,
          notes
        ) VALUES ($1, NULL, 'pending', $2, 'Order placed')
      `, [fulfillment.id, userId]);

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          fulfillmentId: fulfillment.id,
          pickupCode: fulfillment.pickup_code,
          status: fulfillment.status,
          scheduledDate: fulfillment.scheduled_date,
          scheduledTime: fulfillment.scheduled_time_start
            ? `${this._formatTime(fulfillment.scheduled_time_start)} - ${this._formatTime(fulfillment.scheduled_time_end)}`
            : null,
          deliveryFee: parseFloat(fulfillment.delivery_fee),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DeliveryService] scheduleDelivery error:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // FULFILLMENT MANAGEMENT
  // ============================================================================

  /**
   * Get fulfillment details for an order
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object>} Fulfillment details
   */
  async getFulfillment(transactionId) {
    try {
      const result = await this.pool.query(`
        SELECT
          of.*,
          do.option_name,
          dz.zone_name,
          sc.carrier_name,
          CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
        FROM order_fulfillment of
        LEFT JOIN delivery_options do ON of.delivery_option_id = do.id
        LEFT JOIN delivery_zones dz ON of.delivery_zone_id = dz.id
        LEFT JOIN shipping_carriers sc ON of.carrier_id = sc.id
        LEFT JOIN users u ON of.created_by = u.id
        WHERE of.transaction_id = $1
      `, [transactionId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Fulfillment not found',
        };
      }

      const f = result.rows[0];

      return {
        success: true,
        data: {
          id: f.id,
          transactionId: f.transaction_id,
          fulfillmentType: f.fulfillment_type,
          optionName: f.option_name,
          status: f.status,
          scheduledDate: f.scheduled_date,
          scheduledTimeStart: f.scheduled_time_start,
          scheduledTimeEnd: f.scheduled_time_end,
          deliveryAddress: f.delivery_address,
          zoneName: f.zone_name,
          pickupCode: f.pickup_code,
          pickupReadyAt: f.pickup_ready_at,
          pickupExpiresAt: f.pickup_expires_at,
          trackingNumber: f.tracking_number,
          trackingUrl: f.tracking_url,
          carrierName: f.carrier_name,
          deliveryFee: parseFloat(f.delivery_fee),
          feeWaived: f.fee_waived,
          customerNotes: f.customer_notes,
          internalNotes: f.internal_notes,
          deliveredAt: f.delivered_at,
          deliveredTo: f.delivered_to,
          createdAt: f.created_at,
          createdByName: f.created_by_name,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] getFulfillment error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update fulfillment status
   * @param {number} fulfillmentId - Fulfillment ID
   * @param {string} status - New status
   * @param {object} options - Additional options
   * @returns {Promise<object>} Update result
   */
  async updateFulfillmentStatus(fulfillmentId, status, options = {}) {
    const { userId, notes, deliveredTo, trackingNumber, trackingUrl } = options;

    try {
      const result = await this.pool.query(`
        SELECT update_fulfillment_status($1, $2, $3, $4)
      `, [fulfillmentId, status, userId, notes]);

      // Update additional fields if provided
      const updates = [];
      const params = [fulfillmentId];
      let paramIndex = 2;

      if (deliveredTo) {
        updates.push(`delivered_to = $${paramIndex}`);
        params.push(deliveredTo);
        paramIndex++;
      }

      if (trackingNumber) {
        updates.push(`tracking_number = $${paramIndex}`);
        params.push(trackingNumber);
        paramIndex++;
      }

      if (trackingUrl) {
        updates.push(`tracking_url = $${paramIndex}`);
        params.push(trackingUrl);
        paramIndex++;
      }

      if (updates.length > 0) {
        await this.pool.query(`
          UPDATE order_fulfillment
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $1
        `, params);
      }

      return {
        success: true,
        data: {
          fulfillmentId,
          status,
        },
      };
    } catch (error) {
      console.error('[DeliveryService] updateFulfillmentStatus error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get pending fulfillments for today
   * @param {object} filters - Optional filters
   * @returns {Promise<object>} List of pending fulfillments
   */
  async getPendingFulfillments(filters = {}) {
    try {
      const { status, fulfillmentType, date } = filters;

      let query = `
        SELECT * FROM v_pending_fulfillments
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (fulfillmentType) {
        query += ` AND fulfillment_type = $${paramIndex}`;
        params.push(fulfillmentType);
        paramIndex++;
      }

      if (date) {
        query += ` AND (scheduled_date = $${paramIndex} OR scheduled_date IS NULL)`;
        params.push(date);
        paramIndex++;
      }

      const result = await this.pool.query(query, params);

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      console.error('[DeliveryService] getPendingFulfillments error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get orders ready for pickup
   * @returns {Promise<object>} List of ready pickups
   */
  async getReadyForPickup() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM v_ready_for_pickup
        ORDER BY pickup_ready_at
      `);

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      console.error('[DeliveryService] getReadyForPickup error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify pickup code and mark as delivered
   * @param {string} pickupCode - Customer pickup code
   * @param {number} userId - User ID processing the pickup
   * @returns {Promise<object>} Pickup result
   */
  async processPickup(pickupCode, userId) {
    try {
      // Find fulfillment by pickup code
      const result = await this.pool.query(`
        SELECT of.*, t.transaction_number
        FROM order_fulfillment of
        LEFT JOIN transactions t ON of.transaction_id = t.transaction_id
        WHERE of.pickup_code = $1
          AND of.status = 'ready_for_pickup'
      `, [pickupCode.toUpperCase()]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Invalid pickup code or order not ready',
        };
      }

      const fulfillment = result.rows[0];

      // Update status to delivered
      await this.updateFulfillmentStatus(fulfillment.id, 'delivered', {
        userId,
        notes: 'Customer picked up',
      });

      return {
        success: true,
        data: {
          fulfillmentId: fulfillment.id,
          transactionNumber: fulfillment.transaction_number,
          customerName: fulfillment.delivery_address?.name,
          message: 'Pickup completed successfully',
        },
      };
    } catch (error) {
      console.error('[DeliveryService] processPickup error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // ZONES MANAGEMENT
  // ============================================================================

  /**
   * Get all delivery zones
   * @returns {Promise<object>} List of zones
   */
  async getDeliveryZones() {
    try {
      const result = await this.pool.query(`
        SELECT
          dz.*,
          (
            SELECT json_agg(dzpc.postal_code_pattern)
            FROM delivery_zone_postal_codes dzpc
            WHERE dzpc.zone_id = dz.id AND dzpc.is_active = TRUE
          ) AS postal_codes
        FROM delivery_zones dz
        WHERE dz.is_active = TRUE
        ORDER BY dz.priority, dz.zone_name
      `);

      return {
        success: true,
        data: result.rows.map(z => ({
          id: z.id,
          zoneName: z.zone_name,
          zoneCode: z.zone_code,
          zoneType: z.zone_type,
          baseDeliveryFee: parseFloat(z.base_delivery_fee),
          minOrderForFree: z.min_order_for_free ? parseFloat(z.min_order_for_free) : null,
          estimatedDaysMin: z.estimated_days_min,
          estimatedDaysMax: z.estimated_days_max,
          sameDayAvailable: z.same_day_available,
          sameDayCutoff: z.same_day_cutoff,
          postalCodes: z.postal_codes || [],
        })),
      };
    } catch (error) {
      console.error('[DeliveryService] getDeliveryZones error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Find delivery zone by postal code
   * @private
   */
  async _findDeliveryZone(postalCode) {
    const cacheKey = `zone:${postalCode.toUpperCase().replace(/\s/g, '')}`;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(cacheKey, 'short');
      if (cached) return cached;
    }

    const result = await this.pool.query(`
      SELECT * FROM find_delivery_zone_by_postal_code($1)
    `, [postalCode]);

    if (result.rows.length === 0) {
      return null;
    }

    const zone = {
      zoneId: result.rows[0].zone_id,
      zoneName: result.rows[0].zone_name,
      deliveryFee: parseFloat(result.rows[0].delivery_fee),
      minOrderForFree: result.rows[0].min_order_for_free
        ? parseFloat(result.rows[0].min_order_for_free)
        : null,
      estimatedDaysMin: result.rows[0].estimated_days_min,
      estimatedDaysMax: result.rows[0].estimated_days_max,
      sameDayAvailable: result.rows[0].same_day_available,
    };

    // Cache the result
    if (this.cache) {
      this.cache.set(cacheKey, zone, 'short');
    }

    return zone;
  }

  /**
   * Check if any items require delivery (can't be picked up)
   * @private
   */
  _checkDeliveryRequired(items) {
    const deliveryItems = items.filter(item =>
      item.requiresDelivery ||
      item.requires_delivery ||
      item.isLargeItem ||
      item.is_large_item
    );

    return {
      required: deliveryItems.length > 0,
      items: deliveryItems.map(i => i.productName || i.product_name || i.name),
    };
  }

  /**
   * Check if date is today
   * @private
   */
  _isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  /**
   * Parse time string to hours/minutes
   * @private
   */
  _parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  }

  /**
   * Format time for display
   * @private
   */
  _formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }

  /**
   * Generate default time slots if none configured
   * @private
   */
  _generateDefaultSlots(date, isToday) {
    const slots = [];
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Generate slots from 9 AM to 6 PM
    for (let hour = 9; hour < 18; hour += 2) {
      const startTime = `${hour.toString().padStart(2, '0')}:00:00`;
      const endTime = `${(hour + 2).toString().padStart(2, '0')}:00:00`;

      let available = true;
      let unavailableReason = null;

      // If today, check if slot has passed
      if (isToday) {
        if (hour <= currentHour || (hour === currentHour + 1 && currentMinute > 30)) {
          available = false;
          unavailableReason = 'Time slot has passed';
        }
      }

      slots.push({
        id: null,
        startTime,
        endTime,
        displayTime: `${this._formatTime(startTime)} - ${this._formatTime(endTime)}`,
        surcharge: 0,
        available,
        unavailableReason,
        spotsRemaining: null,
      });
    }

    return slots;
  }
}

module.exports = DeliveryFulfillmentService;
