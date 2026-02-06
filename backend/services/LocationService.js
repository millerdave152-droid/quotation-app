/**
 * TeleTime - Location Service
 * Manages store/warehouse locations and pickup availability
 */

const { ApiError } = require('../middleware/errorHandler');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

class LocationService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // LIST / GET
  // ==========================================================================

  async list(filters = {}) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (filters.type) {
      if (filters.type === 'pickup') {
        conditions.push(`is_pickup_location = true`);
      } else {
        conditions.push(`type = $${paramIndex}`);
        values.push(filters.type);
        paramIndex++;
      }
    }
    if (filters.pickupEnabled !== undefined) {
      conditions.push(`is_pickup_location = $${paramIndex++}`);
      values.push(filters.pickupEnabled);
    }
    if (filters.active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      values.push(filters.active);
    } else {
      conditions.push(`is_active = true`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `SELECT * FROM locations ${whereClause} ORDER BY name`,
      values
    );

    return result.rows.map(row => this._mapRow(row));
  }

  async getById(id) {
    const result = await this.pool.query(
      'SELECT * FROM locations WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapRow(result.rows[0]);
  }

  // ==========================================================================
  // PICKUP AVAILABILITY
  // ==========================================================================

  async getPickupAvailability(locationId, date) {
    const location = await this.getById(locationId);
    if (!location) {
      throw ApiError.notFound('Location');
    }

    if (!location.isPickupEnabled) {
      return {
        available: false,
        reason: 'This location does not offer pickup',
        nextAvailableDate: null,
        timeSlots: [],
      };
    }

    const dateObj = new Date(date);
    const dayName = DAY_NAMES[dateObj.getUTCDay()];
    const hours = location.businessHours?.[dayName];

    // Check if location is open on this day
    if (!hours || hours.open === 'closed') {
      const nextDate = this._findNextOpenDate(location.businessHours, dateObj);
      return {
        available: false,
        reason: `Location is closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s`,
        nextAvailableDate: nextDate,
        timeSlots: [],
      };
    }

    // Check if the date is today and already past closing
    const now = new Date();
    const isToday = dateObj.toISOString().split('T')[0] === now.toISOString().split('T')[0];

    // Generate time slots (1-hour increments within business hours)
    const timeSlots = this._generateTimeSlots(hours.open, hours.close, isToday ? now : null);

    if (timeSlots.length === 0 && isToday) {
      const nextDate = this._findNextOpenDate(location.businessHours, dateObj);
      return {
        available: false,
        reason: 'No remaining pickup slots for today',
        nextAvailableDate: nextDate,
        timeSlots: [],
      };
    }

    return {
      available: true,
      date,
      dayName,
      businessHours: hours,
      nextAvailableDate: null,
      timeSlots,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  _generateTimeSlots(openTime, closeTime, nowDate) {
    const slots = [];
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);

    let currentH = openH;
    let currentM = openM;

    while (currentH < closeH || (currentH === closeH && currentM < closeM)) {
      const endH = currentH + 1;

      // Skip slots that have already passed today
      if (nowDate) {
        const slotEndMinutes = endH * 60;
        const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
        if (slotEndMinutes <= nowMinutes) {
          currentH = endH;
          currentM = 0;
          continue;
        }
      }

      if (endH <= closeH) {
        slots.push({
          startTime: `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`,
          endTime: `${String(endH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`,
          label: `${this._formatTime(currentH, currentM)} - ${this._formatTime(endH, currentM)}`,
        });
      }

      currentH = endH;
      currentM = 0;
    }

    return slots;
  }

  _findNextOpenDate(businessHours, fromDate) {
    if (!businessHours) return null;

    const date = new Date(fromDate);
    for (let i = 1; i <= 7; i++) {
      date.setDate(date.getDate() + 1);
      const dayName = DAY_NAMES[date.getUTCDay()];
      const hours = businessHours[dayName];
      if (hours && hours.open !== 'closed') {
        return date.toISOString().split('T')[0];
      }
    }
    return null;
  }

  _formatTime(h, m) {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  _mapRow(row) {
    // pickup_hours is jsonb, already parsed by pg driver
    let businessHours = row.pickup_hours || null;

    return {
      id: row.id,
      name: row.name,
      locationType: row.type || 'store',
      streetAddress: row.address,
      city: row.city,
      province: row.province,
      postalCode: row.postal_code,
      phone: row.phone,
      isPickupEnabled: row.is_pickup_location,
      businessHours,
      isActive: row.is_active,
      code: row.code,
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = LocationService;
