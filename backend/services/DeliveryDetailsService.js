/**
 * TeleTime - Delivery Details Service
 * Manages comprehensive delivery information for orders
 */

const { ApiError } = require('../middleware/errorHandler');

const VALID_PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const VALID_DWELLING_TYPES = ['house', 'townhouse', 'condo', 'apartment', 'commercial'];
const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

class DeliveryDetailsService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create or update delivery details for an order (upsert)
   */
  async upsert(orderId, data) {
    // Verify order exists
    const orderResult = await this.pool.query(
      'SELECT id, fulfillment_type FROM unified_orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw ApiError.notFound('Order');
    }

    const result = await this.pool.query(
      `INSERT INTO delivery_details (
        order_id,
        street_number, street_name, unit, buzzer,
        city, province, postal_code,
        dwelling_type, entry_point, floor_number,
        elevator_required, elevator_booking_date, elevator_booking_time,
        concierge_phone, concierge_notes,
        access_steps, access_narrow_stairs,
        access_height_restriction, access_width_restriction, access_notes,
        parking_type, parking_distance, parking_notes,
        pathway_confirmed, pathway_notes,
        updated_at
      ) VALUES (
        $1,
        $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25, $26,
        NOW()
      )
      ON CONFLICT (order_id) DO UPDATE SET
        street_number = EXCLUDED.street_number,
        street_name = EXCLUDED.street_name,
        unit = EXCLUDED.unit,
        buzzer = EXCLUDED.buzzer,
        city = EXCLUDED.city,
        province = EXCLUDED.province,
        postal_code = EXCLUDED.postal_code,
        dwelling_type = EXCLUDED.dwelling_type,
        entry_point = EXCLUDED.entry_point,
        floor_number = EXCLUDED.floor_number,
        elevator_required = EXCLUDED.elevator_required,
        elevator_booking_date = EXCLUDED.elevator_booking_date,
        elevator_booking_time = EXCLUDED.elevator_booking_time,
        concierge_phone = EXCLUDED.concierge_phone,
        concierge_notes = EXCLUDED.concierge_notes,
        access_steps = EXCLUDED.access_steps,
        access_narrow_stairs = EXCLUDED.access_narrow_stairs,
        access_height_restriction = EXCLUDED.access_height_restriction,
        access_width_restriction = EXCLUDED.access_width_restriction,
        access_notes = EXCLUDED.access_notes,
        parking_type = EXCLUDED.parking_type,
        parking_distance = EXCLUDED.parking_distance,
        parking_notes = EXCLUDED.parking_notes,
        pathway_confirmed = EXCLUDED.pathway_confirmed,
        pathway_notes = EXCLUDED.pathway_notes,
        updated_at = NOW()
      RETURNING *`,
      [
        orderId,
        data.streetNumber,
        data.streetName,
        data.unit || null,
        data.buzzer || null,
        data.city,
        data.province.toUpperCase(),
        data.postalCode.toUpperCase().replace(/\s/g, '').replace(/^(.{3})/, '$1 '),
        data.dwellingType,
        data.entryPoint || null,
        data.floorNumber || null,
        data.elevatorRequired || false,
        data.elevatorBookingDate || null,
        data.elevatorBookingTime || null,
        data.conciergePhone || null,
        data.conciergeNotes || null,
        data.accessSteps || 0,
        data.accessNarrowStairs || false,
        data.accessHeightRestriction || null,
        data.accessWidthRestriction || null,
        data.accessNotes || null,
        data.parkingType || null,
        data.parkingDistance || null,
        data.parkingNotes || null,
        data.pathwayConfirmed || false,
        data.pathwayNotes || null,
      ]
    );

    // Also sync the formatted address back to unified_orders.delivery_address
    const row = result.rows[0];
    const formatted = this._formatAddress(row);
    await this.pool.query(
      `UPDATE unified_orders SET
        delivery_address = $1,
        delivery_street_number = $2,
        delivery_street_name = $3,
        delivery_unit = $4,
        delivery_buzzer = $5,
        delivery_city = $6,
        delivery_province = $7,
        delivery_postal_code = $8
      WHERE id = $9`,
      [
        formatted,
        row.street_number,
        row.street_name,
        row.unit,
        row.buzzer,
        row.city,
        row.province,
        row.postal_code,
        orderId,
      ]
    );

    return this._mapRow(row);
  }

  /**
   * Get delivery details for an order
   */
  async getByOrderId(orderId) {
    const result = await this.pool.query(
      'SELECT * FROM delivery_details WHERE order_id = $1',
      [orderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapRow(result.rows[0]);
  }

  /**
   * Validate that a delivery order is ready for completion.
   * Returns { valid, warnings, errors }.
   */
  async validateForCompletion(orderId) {
    const errors = [];
    const warnings = [];

    // Check order fulfillment type
    const orderResult = await this.pool.query(
      'SELECT fulfillment_type FROM unified_orders WHERE id = $1',
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return { valid: false, errors: ['Order not found'], warnings: [] };
    }

    if (orderResult.rows[0].fulfillment_type !== 'delivery') {
      return { valid: true, errors: [], warnings: [] };
    }

    // Delivery order — delivery_details must exist
    const details = await this.getByOrderId(orderId);
    if (!details) {
      errors.push('Delivery details are required for delivery orders');
      return { valid: false, errors, warnings };
    }

    if (!details.pathwayConfirmed) {
      errors.push('Delivery pathway must be confirmed before completing the order');
    }

    if (['condo', 'apartment'].includes(details.dwellingType)) {
      if (details.elevatorRequired && !details.elevatorBookingDate) {
        warnings.push('Elevator is required but no booking date has been set');
      }
      if (!details.floorNumber) {
        warnings.push('Floor number not specified for condo/apartment delivery');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  _formatAddress(row) {
    const street = row.unit
      ? `${row.unit}-${row.street_number} ${row.street_name}`
      : `${row.street_number} ${row.street_name}`;
    return `${street}, ${row.city}, ${row.province} ${row.postal_code}`;
  }

  _mapRow(row) {
    return {
      id: row.id,
      orderId: row.order_id,

      // Address
      streetNumber: row.street_number,
      streetName: row.street_name,
      unit: row.unit,
      buzzer: row.buzzer,
      city: row.city,
      province: row.province,
      postalCode: row.postal_code,

      // Dwelling
      dwellingType: row.dwelling_type,
      entryPoint: row.entry_point,
      floorNumber: row.floor_number,

      // Elevator
      elevatorRequired: row.elevator_required,
      elevatorBookingDate: row.elevator_booking_date,
      elevatorBookingTime: row.elevator_booking_time,
      conciergePhone: row.concierge_phone,
      conciergeNotes: row.concierge_notes,

      // Access
      accessSteps: row.access_steps,
      accessNarrowStairs: row.access_narrow_stairs,
      accessHeightRestriction: row.access_height_restriction,
      accessWidthRestriction: row.access_width_restriction,
      accessNotes: row.access_notes,

      // Parking
      parkingType: row.parking_type,
      parkingDistance: row.parking_distance,
      parkingNotes: row.parking_notes,

      // Confirmation
      pathwayConfirmed: row.pathway_confirmed,
      pathwayNotes: row.pathway_notes,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Static validation helpers for route-level use
DeliveryDetailsService.VALID_PROVINCES = VALID_PROVINCES;
DeliveryDetailsService.VALID_DWELLING_TYPES = VALID_DWELLING_TYPES;
DeliveryDetailsService.POSTAL_CODE_REGEX = POSTAL_CODE_REGEX;

module.exports = DeliveryDetailsService;
