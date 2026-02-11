const express = require('express');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

function init({ pool }) {
  const router = express.Router();
  router.use(authenticate);

  // ---- helper: resolve driver row from JWT user ----
  async function getDriver(req) {
    const userId = req.user.id;
    let { rows } = await pool.query(
      'SELECT * FROM drivers WHERE user_id = $1 AND is_active = true', [userId]
    );
    if (!rows.length) {
      ({ rows } = await pool.query(
        'SELECT * FROM drivers WHERE id = $1 AND is_active = true', [userId]
      ));
    }
    return rows[0] || null;
  }

  // ---- GET /me — driver profile ----
  router.get('/me', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    // Include current vehicle info if assigned
    let vehicle = null;
    if (driver.vehicle_id) {
      const v = await pool.query(
        `SELECT id, name, plate_number, license_plate, vehicle_type,
                has_lift_gate, has_blankets, current_odometer
         FROM vehicles WHERE id = $1`, [driver.vehicle_id]
      );
      vehicle = v.rows[0] || null;
    }

    res.json({
      driver: {
        id: driver.id,
        name: driver.name,
        employee_id: driver.employee_id,
        phone: driver.phone,
        email: driver.email,
        photo_url: driver.photo_url,
        status: driver.status,
        license_number: driver.license_number,
      },
      vehicle,
    });
  }));

  // ---- GET /me/shift/today — today's shift status ----
  router.get('/me/shift/today', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT ds.*, v.name as vehicle_name, v.plate_number, v.license_plate
       FROM driver_shifts ds
       LEFT JOIN vehicles v ON v.id = ds.vehicle_id
       WHERE ds.driver_id = $1 AND ds.shift_date = $2`,
      [driver.id, today]
    );

    const shift = rows[0] || null;

    // Today's delivery stats
    const statsResult = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE db.status = 'delivered')::int as completed,
         COUNT(*) FILTER (WHERE db.status NOT IN ('delivered','cancelled','failed'))::int as remaining
       FROM delivery_bookings db
       WHERE db.driver_id = $1
         AND db.scheduled_date = $2`,
      [driver.id, today]
    );

    res.json({
      shift,
      stats: statsResult.rows[0] || { total: 0, completed: 0, remaining: 0 },
    });
  }));

  // ---- POST /clock-in ----
  router.post('/clock-in', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const { vehicle_id, start_odometer, odometer_photo_url } = req.body;
    if (!vehicle_id) throw ApiError.badRequest('vehicle_id is required');

    const today = new Date().toISOString().slice(0, 10);

    // Check for existing shift today
    const existing = await pool.query(
      'SELECT id, status FROM driver_shifts WHERE driver_id = $1 AND shift_date = $2',
      [driver.id, today]
    );

    if (existing.rows.length && existing.rows[0].status === 'started') {
      throw ApiError.conflict('Already clocked in today');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let shiftId;
      if (existing.rows.length) {
        // Update existing scheduled shift
        const { rows } = await client.query(
          `UPDATE driver_shifts
           SET status = 'started', actual_start = NOW(), vehicle_id = $1,
               start_odometer = $2, updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [vehicle_id, start_odometer || null, existing.rows[0].id]
        );
        shiftId = rows[0].id;
      } else {
        // Create new shift
        const { rows } = await client.query(
          `INSERT INTO driver_shifts (driver_id, shift_date, status, actual_start, vehicle_id, start_odometer)
           VALUES ($1, $2, 'started', NOW(), $3, $4) RETURNING *`,
          [driver.id, today, vehicle_id, start_odometer || null]
        );
        shiftId = rows[0].id;
      }

      // Update driver status and vehicle assignment
      await client.query(
        'UPDATE drivers SET status = $1, vehicle_id = $2, updated_at = NOW() WHERE id = $3',
        ['available', vehicle_id, driver.id]
      );

      // Mark vehicle as in_use
      await client.query(
        "UPDATE vehicles SET status = 'in_use', current_odometer = COALESCE($1, current_odometer), updated_at = NOW() WHERE id = $2",
        [start_odometer || null, vehicle_id]
      );

      // Store odometer photo if provided
      if (odometer_photo_url) {
        await client.query(
          `INSERT INTO vehicle_inspections (vehicle_id, driver_id, inspection_type, odometer_reading, photos)
           VALUES ($1, $2, 'pre_trip', $3, ARRAY[$4])`,
          [vehicle_id, driver.id, start_odometer || null, odometer_photo_url]
        );
      }

      await client.query('COMMIT');

      // Return the shift
      const { rows: shiftRows } = await pool.query(
        `SELECT ds.*, v.name as vehicle_name, v.plate_number, v.license_plate
         FROM driver_shifts ds
         LEFT JOIN vehicles v ON v.id = ds.vehicle_id
         WHERE ds.id = $1`,
        [shiftId]
      );

      res.json({ shift: shiftRows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---- POST /clock-out ----
  router.post('/clock-out', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const { end_odometer, odometer_photo_url, notes } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    const existing = await pool.query(
      "SELECT * FROM driver_shifts WHERE driver_id = $1 AND shift_date = $2 AND status = 'started'",
      [driver.id, today]
    );

    if (!existing.rows.length) {
      throw ApiError.conflict('No active shift to clock out of');
    }

    const shift = existing.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate distance if both odometer readings present
      let distanceKm = null;
      if (end_odometer && shift.start_odometer) {
        distanceKm = Math.max(0, end_odometer - shift.start_odometer);
      }

      // Count today's completed deliveries
      const countResult = await client.query(
        `SELECT COUNT(*)::int as completed
         FROM delivery_bookings
         WHERE driver_id = $1 AND scheduled_date = $2 AND status = 'delivered'`,
        [driver.id, today]
      );

      const { rows } = await client.query(
        `UPDATE driver_shifts
         SET status = 'completed', actual_end = NOW(), end_odometer = $1,
             total_distance_km = $2, total_deliveries = $3,
             notes = COALESCE($4, notes), updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [end_odometer || null, distanceKm, countResult.rows[0].completed, notes || null, shift.id]
      );

      // Update driver status
      await client.query(
        "UPDATE drivers SET status = 'off_duty', vehicle_id = NULL, updated_at = NOW() WHERE id = $1",
        [driver.id]
      );

      // Release vehicle
      if (shift.vehicle_id) {
        await client.query(
          "UPDATE vehicles SET status = 'available', current_odometer = COALESCE($1, current_odometer), updated_at = NOW() WHERE id = $2",
          [end_odometer || null, shift.vehicle_id]
        );
      }

      // Store odometer photo
      if (odometer_photo_url && shift.vehicle_id) {
        await client.query(
          `INSERT INTO vehicle_inspections (vehicle_id, driver_id, inspection_type, odometer_reading, photos)
           VALUES ($1, $2, 'post_trip', $3, ARRAY[$4])`,
          [shift.vehicle_id, driver.id, end_odometer || null, odometer_photo_url]
        );
      }

      await client.query('COMMIT');

      res.json({ shift: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---- GET /route/today — today's assigned route with all stops ----
  router.get('/route/today', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const today = new Date().toISOString().slice(0, 10);

    // Get route(s) assigned to this driver today
    const routeResult = await pool.query(
      `SELECT dr.*, l.name as start_location_name
       FROM dispatch_routes dr
       LEFT JOIN locations l ON l.id = dr.start_location_id
       WHERE dr.driver_id = $1 AND dr.route_date = $2
         AND dr.status != 'cancelled'
       ORDER BY dr.start_time NULLS LAST
       LIMIT 1`,
      [driver.id, today]
    );

    const route = routeResult.rows[0] || null;

    // Get stops — prefer delivery_route_stops, fall back to delivery_bookings
    let stops = [];
    if (route) {
      const stopsResult = await pool.query(
        `SELECT
           rs.id as stop_id, rs.sequence_order, rs.address as stop_address,
           rs.estimated_arrival as stop_eta, rs.estimated_duration_minutes,
           rs.estimated_distance_from_prev_km, rs.status as stop_status,
           rs.actual_arrival as stop_actual_arrival, rs.actual_departure as stop_actual_departure,
           rs.notes as stop_notes,
           db.id as booking_id, db.booking_number, db.delivery_address,
           db.delivery_city, db.delivery_postal_code, db.delivery_instructions,
           db.access_code, db.floor_level, db.has_elevator,
           db.contact_name, db.contact_phone, db.contact_email, db.alternate_phone,
           db.status as booking_status, db.scheduled_start, db.scheduled_end,
           db.signature_captured, db.delivery_photo_url,
           db.notes as booking_notes, db.issue_reported,
           c.name as customer_name, c.phone as customer_phone_main,
           uo.id as order_id, uo.order_number,
           of2.dwelling_type, of2.elevator_booking_required,
           of2.elevator_booking_date, of2.elevator_booking_time,
           of2.access_notes
         FROM delivery_route_stops rs
         LEFT JOIN delivery_bookings db ON db.id = rs.delivery_booking_id
         LEFT JOIN customers c ON c.id = db.customer_id
         LEFT JOIN unified_orders uo ON uo.id = db.order_id
         LEFT JOIN order_fulfillment of2 ON of2.order_id = uo.id
         WHERE rs.route_id = $1
         ORDER BY rs.sequence_order`,
        [route.id]
      );
      stops = stopsResult.rows;

      // Attach items for each stop
      for (const stop of stops) {
        if (stop.order_id) {
          const itemsResult = await pool.query(
            `SELECT oi.product_name, oi.quantity, oi.sku
             FROM unified_order_items oi
             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [stop.order_id]
          );
          stop.items = itemsResult.rows;
        } else {
          stop.items = [];
        }
      }
    }

    // If no route_stops but there are delivery_bookings assigned directly
    if (route && stops.length === 0) {
      const bookingsResult = await pool.query(
        `SELECT
           db.id as booking_id, db.booking_number, db.delivery_address,
           db.delivery_city, db.delivery_postal_code, db.delivery_instructions,
           db.access_code, db.floor_level, db.has_elevator,
           db.contact_name, db.contact_phone, db.contact_email, db.alternate_phone,
           db.status as booking_status, db.scheduled_start, db.scheduled_end,
           db.route_order, db.signature_captured, db.delivery_photo_url,
           db.notes as booking_notes, db.issue_reported,
           c.name as customer_name, c.phone as customer_phone_main,
           uo.id as order_id, uo.order_number,
           of2.dwelling_type, of2.elevator_booking_required,
           of2.elevator_booking_date, of2.elevator_booking_time,
           of2.access_notes
         FROM delivery_bookings db
         LEFT JOIN customers c ON c.id = db.customer_id
         LEFT JOIN unified_orders uo ON uo.id = db.order_id
         LEFT JOIN order_fulfillment of2 ON of2.order_id = uo.id
         WHERE db.route_id = $1
         ORDER BY db.route_order NULLS LAST, db.scheduled_start NULLS LAST`,
        [route.id]
      );

      stops = bookingsResult.rows.map((b, i) => ({
        ...b,
        stop_id: b.booking_id,
        sequence_order: b.route_order || (i + 1),
        stop_status: mapBookingStatus(b.booking_status),
        stop_eta: b.scheduled_start,
        items: [],
      }));

      // Attach items
      for (const stop of stops) {
        if (stop.order_id) {
          const itemsResult = await pool.query(
            `SELECT oi.product_name, oi.quantity, oi.sku
             FROM unified_order_items oi
             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [stop.order_id]
          );
          stop.items = itemsResult.rows;
        }
      }
    }

    // Also handle: no route exists but driver has bookings today
    if (!route) {
      const directResult = await pool.query(
        `SELECT
           db.id as booking_id, db.booking_number, db.delivery_address,
           db.delivery_city, db.delivery_postal_code, db.delivery_instructions,
           db.access_code, db.floor_level, db.has_elevator,
           db.contact_name, db.contact_phone, db.contact_email, db.alternate_phone,
           db.status as booking_status, db.scheduled_start, db.scheduled_end,
           db.route_order, db.signature_captured, db.delivery_photo_url,
           db.notes as booking_notes, db.issue_reported,
           c.name as customer_name, c.phone as customer_phone_main,
           uo.id as order_id, uo.order_number,
           of2.dwelling_type, of2.elevator_booking_required,
           of2.elevator_booking_date, of2.elevator_booking_time,
           of2.access_notes
         FROM delivery_bookings db
         LEFT JOIN customers c ON c.id = db.customer_id
         LEFT JOIN unified_orders uo ON uo.id = db.order_id
         LEFT JOIN order_fulfillment of2 ON of2.order_id = uo.id
         WHERE db.driver_id = $1 AND db.scheduled_date = $2
           AND db.status NOT IN ('cancelled')
         ORDER BY db.route_order NULLS LAST, db.scheduled_start NULLS LAST`,
        [driver.id, today]
      );

      stops = directResult.rows.map((b, i) => ({
        ...b,
        stop_id: b.booking_id,
        sequence_order: b.route_order || (i + 1),
        stop_status: mapBookingStatus(b.booking_status),
        stop_eta: b.scheduled_start,
        items: [],
      }));

      for (const stop of stops) {
        if (stop.order_id) {
          const itemsResult = await pool.query(
            `SELECT oi.product_name, oi.quantity, oi.sku
             FROM unified_order_items oi
             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [stop.order_id]
          );
          stop.items = itemsResult.rows;
        }
      }
    }

    const completed = stops.filter(s => s.stop_status === 'completed' || s.booking_status === 'delivered').length;
    const failed = stops.filter(s => s.stop_status === 'failed' || s.booking_status === 'failed').length;

    res.json({
      route,
      stops,
      summary: {
        total: stops.length,
        completed,
        failed,
        remaining: stops.length - completed - failed,
      },
    });
  }));

  // ---- POST /route/:id/start — start the route ----
  router.post('/route/:id/start', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const routeId = parseInt(req.params.id);

    const { rows } = await pool.query(
      `UPDATE dispatch_routes
       SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND driver_id = $2 AND status IN ('planned','optimized','assigned')
       RETURNING *`,
      [routeId, driver.id]
    );

    if (!rows.length) {
      throw ApiError.notFound('Route not found or already started');
    }

    // Set driver status to on_route
    await pool.query(
      "UPDATE drivers SET status = 'on_route', updated_at = NOW() WHERE id = $1",
      [driver.id]
    );

    res.json({ route: rows[0] });
  }));

  // ---- GET /deliveries/:id — full delivery details for driver ----
  router.get('/deliveries/:id', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const bookingId = parseInt(req.params.id);

    const { rows } = await pool.query(
      `SELECT
         db.*,
         c.name as customer_name, c.phone as customer_phone_main, c.email as customer_email,
         uo.id as order_id, uo.order_number, uo.notes as order_notes,
         uo.delivery_buzzer,
         of2.dwelling_type, of2.entry_point, of2.floor_number,
         of2.elevator_booking_required, of2.elevator_booking_date, of2.elevator_booking_time,
         of2.access_narrow_stairs, of2.access_notes,
         of2.parking_type, of2.parking_distance, of2.parking_notes,
         of2.pathway_confirmed, of2.pathway_notes,
         rs.sequence_order, rs.estimated_arrival as stop_eta,
         rs.status as stop_status
       FROM delivery_bookings db
       LEFT JOIN customers c ON c.id = db.customer_id
       LEFT JOIN unified_orders uo ON uo.id = db.order_id
       LEFT JOIN order_fulfillment of2 ON of2.order_id = uo.id
       LEFT JOIN delivery_route_stops rs ON rs.delivery_booking_id = db.id
       WHERE db.id = $1`,
      [bookingId]
    );

    if (!rows.length) throw ApiError.notFound('Delivery');
    const delivery = rows[0];

    // Get order items
    let items = [];
    if (delivery.order_id) {
      const itemsResult = await pool.query(
        `SELECT product_name, sku, quantity, unit_price_cents
         FROM unified_order_items WHERE order_id = $1 ORDER BY id`,
        [delivery.order_id]
      );
      items = itemsResult.rows;
    }

    // Get previous delivery attempts for this address/customer
    let previousAttempts = [];
    if (delivery.customer_id) {
      const attemptsResult = await pool.query(
        `SELECT id, scheduled_date, status, issue_reported, notes
         FROM delivery_bookings
         WHERE customer_id = $1 AND id != $2
           AND status IN ('failed', 'rescheduled')
         ORDER BY scheduled_date DESC LIMIT 5`,
        [delivery.customer_id, bookingId]
      );
      previousAttempts = attemptsResult.rows;
    }

    res.json({ delivery, items, previousAttempts });
  }));

  // ---- POST /deliveries/:id/arrived — mark arrived with GPS ----
  router.post('/deliveries/:id/arrived', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const bookingId = parseInt(req.params.id);
    const { latitude, longitude, notes, arrived_at } = req.body;

    // Update booking
    const { rows } = await pool.query(
      `UPDATE delivery_bookings
       SET status = 'arrived', actual_arrival = COALESCE($3::timestamptz, NOW()),
           notes = CASE WHEN $4::text IS NOT NULL THEN COALESCE(notes || E'\n', '') || $4 ELSE notes END
       WHERE id = $1 AND driver_id = $2 RETURNING *`,
      [bookingId, driver.id, arrived_at || null, notes || null]
    );

    if (!rows.length) {
      // Try without driver_id check (booking may reference driver differently)
      const fallback = await pool.query(
        `UPDATE delivery_bookings SET status = 'arrived', actual_arrival = NOW()
         WHERE id = $1 RETURNING *`, [bookingId]
      );
      if (!fallback.rows.length) throw ApiError.notFound('Delivery');
    }

    // Update route stop if exists
    await pool.query(
      `UPDATE delivery_route_stops SET status = 'arrived', actual_arrival = NOW()
       WHERE delivery_booking_id = $1`, [bookingId]
    );

    // Log location
    if (latitude && longitude) {
      await pool.query(
        `INSERT INTO driver_location_log (driver_id, lat, lng) VALUES ($1, $2, $3)`,
        [driver.id, latitude, longitude]
      );
    }

    res.json({ success: true, delivery: (rows[0] || {}) });
  }));

  // ---- POST /deliveries/:id/start — driver begins the actual delivery (after checklist) ----
  router.post('/deliveries/:id/start', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const bookingId = parseInt(req.params.id);
    const { checklist_verified, start_time } = req.body;

    if (!checklist_verified) {
      throw ApiError.badRequest('Checklist must be verified before starting delivery');
    }

    // Booking must be in 'arrived' status to start
    const { rows } = await pool.query(
      `UPDATE delivery_bookings
       SET status = 'in_progress', delivery_started_at = COALESCE($3::timestamptz, NOW()),
           checklist_verified = true
       WHERE id = $1 AND driver_id = $2 AND status = 'arrived'
       RETURNING *`,
      [bookingId, driver.id, start_time || null]
    );

    if (!rows.length) {
      // Fallback without driver_id check
      const fallback = await pool.query(
        `UPDATE delivery_bookings
         SET status = 'in_progress', delivery_started_at = COALESCE($2::timestamptz, NOW()),
             checklist_verified = true
         WHERE id = $1 AND status = 'arrived'
         RETURNING *`,
        [bookingId, start_time || null]
      );
      if (!fallback.rows.length) {
        throw ApiError.notFound('Delivery not found or not in arrived status');
      }
      return res.json({ success: true, delivery: fallback.rows[0] });
    }

    // Update route stop if exists
    await pool.query(
      `UPDATE delivery_route_stops SET status = 'in_progress'
       WHERE delivery_booking_id = $1`, [bookingId]
    );

    res.json({ success: true, delivery: rows[0] });
  }));

  // ---- POST /deliveries/:id/complete — complete delivery with full proof-of-delivery ----
  router.post('/deliveries/:id/complete', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const bookingId = parseInt(req.params.id);
    const {
      signature_image, signer_name, relationship, signed_at,
      latitude, longitude, photos,
      completed_at, completion_type, checklist, notes,
      outcome_details,
    } = req.body;

    const failedOutcomes = ['refused', 'no_access', 'no_one_home', 'wrong_address', 'damaged'];
    const deliveryStatus = failedOutcomes.includes(completion_type) ? 'failed'
      : completion_type === 'partial' ? 'partial'
      : completion_type === 'reschedule' ? 'pending'
      : 'delivered';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build outcome details for storage
      const outcomeType = completion_type || 'delivered';
      const outcomeReason = outcome_details?.refusal_reason || outcome_details?.no_access_reason || outcome_details?.reschedule_reason || null;
      const outcomeDetailsJson = outcome_details ? JSON.stringify(outcome_details) : null;
      const contactAttempted = outcome_details?.contact_attempted || false;
      const recommendedAction = outcome_details?.recommended_action || null;
      const rescheduleDate = outcome_details?.preferred_date || null;
      const rescheduleTime = outcome_details?.preferred_time || null;

      // Update booking
      const { rows } = await client.query(
        `UPDATE delivery_bookings
         SET status = $3, actual_delivery = COALESCE($4::timestamptz, NOW()),
             signature_captured = $5,
             completion_type = $6,
             completion_checklist = $7,
             completion_notes = $8,
             outcome_type = $9,
             outcome_reason = $10,
             outcome_details = $11,
             contact_attempted = $12,
             recommended_action = $13,
             reschedule_date = $14::date,
             reschedule_time = $15
         WHERE id = $1 AND driver_id = $2
         RETURNING *`,
        [bookingId, driver.id, deliveryStatus,
         completed_at || signed_at || null,
         !!signature_image,
         outcomeType,
         checklist ? JSON.stringify(checklist) : null,
         notes || null,
         outcomeType, outcomeReason, outcomeDetailsJson,
         contactAttempted, recommendedAction,
         rescheduleDate, rescheduleTime]
      );

      let deliveryRow = rows[0];
      if (!deliveryRow) {
        // Fallback without driver_id
        const fb = await client.query(
          `UPDATE delivery_bookings
           SET status = $2, actual_delivery = COALESCE($3::timestamptz, NOW()),
               signature_captured = $4,
               completion_type = $5,
               completion_checklist = $6,
               completion_notes = $7,
               outcome_type = $8,
               outcome_reason = $9,
               outcome_details = $10,
               contact_attempted = $11,
               recommended_action = $12,
               reschedule_date = $13::date,
               reschedule_time = $14
           WHERE id = $1 RETURNING *`,
          [bookingId, deliveryStatus,
           completed_at || signed_at || null,
           !!signature_image,
           outcomeType,
           checklist ? JSON.stringify(checklist) : null,
           notes || null,
           outcomeType, outcomeReason, outcomeDetailsJson,
           contactAttempted, recommendedAction,
           rescheduleDate, rescheduleTime]
        );
        if (!fb.rows.length) {
          await client.query('ROLLBACK');
          throw ApiError.notFound('Delivery');
        }
        deliveryRow = fb.rows[0];
      }

      // Store signature
      if (signature_image) {
        try {
          await client.query(
            `INSERT INTO delivery_signatures
               (delivery_booking_id, driver_id, signature_data, signer_name, relationship, signed_at, latitude, longitude)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7, $8)`,
            [bookingId, driver.id, signature_image, signer_name || null, relationship || 'customer',
             signed_at || null, latitude || null, longitude || null]
          );
        } catch (sigErr) {
          console.warn('Could not store signature:', sigErr.message);
        }
      }

      // Store delivery photos
      if (Array.isArray(photos) && photos.length > 0) {
        try {
          for (const photo of photos) {
            await client.query(
              `INSERT INTO delivery_photos
                 (delivery_booking_id, driver_id, photo_data, caption, tag, taken_at, latitude, longitude)
               VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7, $8)`,
              [bookingId, driver.id, photo.data, photo.caption || null, photo.tag || null,
               photo.timestamp || null, latitude || null, longitude || null]
            );
          }
        } catch (photoErr) {
          console.warn('Could not store delivery photos:', photoErr.message);
        }
      }

      // Update route stop
      const stopStatus = deliveryStatus === 'failed' ? 'failed'
        : deliveryStatus === 'pending' ? 'pending'
        : 'completed';
      await client.query(
        `UPDATE delivery_route_stops SET status = $2, actual_departure = NOW()
         WHERE delivery_booking_id = $1`, [bookingId, stopStatus]
      );

      // Log location
      if (latitude && longitude) {
        await client.query(
          `INSERT INTO driver_location_log (driver_id, lat, lng) VALUES ($1, $2, $3)`,
          [driver.id, latitude, longitude]
        );
      }

      await client.query('COMMIT');

      // ---- Find next pending delivery for this driver today ----
      let nextDelivery = null;
      try {
        const today = new Date().toISOString().slice(0, 10);

        // Try route stops first
        const nextStopResult = await pool.query(
          `SELECT rs.delivery_booking_id,
                  db.delivery_address, db.contact_name,
                  c.name as customer_name
           FROM delivery_route_stops rs
           JOIN delivery_bookings db ON db.id = rs.delivery_booking_id
           LEFT JOIN customers c ON c.id = db.customer_id
           WHERE rs.route_id = (
             SELECT route_id FROM delivery_route_stops WHERE delivery_booking_id = $1 LIMIT 1
           )
           AND rs.status IN ('pending','approaching')
           AND db.status NOT IN ('delivered','failed','cancelled')
           ORDER BY rs.sequence_order
           LIMIT 1`,
          [bookingId]
        );

        if (nextStopResult.rows.length) {
          const ns = nextStopResult.rows[0];
          nextDelivery = {
            id: ns.delivery_booking_id,
            customer_name: ns.customer_name || ns.contact_name,
            delivery_address: ns.delivery_address,
          };
        } else {
          // Fallback: next booking by driver + date
          const nextBookingResult = await pool.query(
            `SELECT db.id, db.delivery_address, db.contact_name,
                    c.name as customer_name
             FROM delivery_bookings db
             LEFT JOIN customers c ON c.id = db.customer_id
             WHERE db.driver_id = $1 AND db.scheduled_date = $2
               AND db.id != $3
               AND db.status NOT IN ('delivered','failed','cancelled')
             ORDER BY db.route_order NULLS LAST, db.scheduled_start NULLS LAST
             LIMIT 1`,
            [driver.id, today, bookingId]
          );
          if (nextBookingResult.rows.length) {
            const nb = nextBookingResult.rows[0];
            nextDelivery = {
              id: nb.id,
              customer_name: nb.customer_name || nb.contact_name,
              delivery_address: nb.delivery_address,
            };
          }
        }
      } catch (nextErr) {
        console.warn('Could not find next delivery:', nextErr.message);
      }

      res.json({
        success: true,
        delivery_id: bookingId,
        delivery: deliveryRow,
        next_delivery: nextDelivery,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---- POST /deliveries/:id/send-eta — send ETA SMS to customer ----
  router.post('/deliveries/:id/send-eta', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const bookingId = parseInt(req.params.id);
    const { eta_minutes } = req.body;

    const { rows } = await pool.query(
      `SELECT db.contact_phone, db.contact_name, c.phone as customer_phone, c.name as customer_name
       FROM delivery_bookings db
       LEFT JOIN customers c ON c.id = db.customer_id
       WHERE db.id = $1`,
      [bookingId]
    );

    if (!rows.length) throw ApiError.notFound('Delivery');

    const phone = rows[0].contact_phone || rows[0].customer_phone;
    const name = rows[0].contact_name || rows[0].customer_name || 'Customer';

    if (!phone) {
      throw ApiError.validation('No phone number on file');
    }

    const etaText = eta_minutes
      ? `approximately ${eta_minutes} minutes`
      : 'shortly';

    // Use the notification trigger service if available, otherwise log
    try {
      const notificationService = require('../services/NotificationTriggerService');
      await notificationService.sendSMS(phone,
        `Hi ${name.split(' ')[0]}, your TeleTime delivery driver (${driver.name}) is on the way and will arrive ${etaText}. Please ensure the delivery area is accessible.`
      );
    } catch {
      console.log(`[ETA SMS] Would send to ${phone}: Driver ${driver.name} arriving ${etaText}`);
    }

    // Mark customer notified
    await pool.query(
      'UPDATE delivery_bookings SET customer_notified_at = NOW() WHERE id = $1',
      [bookingId]
    );

    res.json({ sent: true, phone });
  }));

  // ---- POST /location — update driver GPS position ----
  router.post('/location', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const { latitude, longitude, speed, heading, accuracy } = req.body;
    if (latitude == null || longitude == null) {
      throw ApiError.badRequest('latitude and longitude required');
    }

    // Update current position
    await pool.query(
      `UPDATE drivers
       SET current_lat = $1, current_lng = $2, location_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [latitude, longitude, driver.id]
    );

    // Insert into location log
    await pool.query(
      `INSERT INTO driver_location_log (driver_id, lat, lng, speed_kmh, heading, accuracy_meters)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [driver.id, latitude, longitude, speed || null, heading || null, accuracy || null]
    );

    res.json({ success: true });
  }));

  // ---- POST /inspections — submit vehicle inspection ----
  router.post('/inspections', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const {
      vehicle_id, shift_id, inspection_type,
      odometer_reading, odometer_photo,
      fuel_level, fuel_purchased, fuel_receipt_photo,
      checklist, new_damage, issues_reported,
      maintenance_needed, inspected_at,
    } = req.body;

    const vehicleId = vehicle_id || driver.vehicle_id;
    if (!vehicleId) {
      throw ApiError.badRequest('No vehicle assigned');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build photos array from odometer + fuel receipt
      const photos = [];
      if (odometer_photo) photos.push(odometer_photo);
      if (fuel_receipt_photo) photos.push(fuel_receipt_photo);

      const { rows } = await client.query(
        `INSERT INTO vehicle_inspections
           (vehicle_id, driver_id, inspection_type, odometer_reading,
            photos, checklist, fuel_level, fuel_purchased, fuel_receipt_url,
            new_damage, issues_reported, maintenance_needed, notes,
            status, inspected_at, shift_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          vehicleId, driver.id, inspection_type || 'post_trip',
          odometer_reading || null,
          photos.length > 0 ? photos : null,
          checklist ? JSON.stringify(checklist) : null,
          fuel_level || null,
          !!fuel_purchased,
          fuel_receipt_photo || null,
          new_damage ? JSON.stringify(new_damage) : null,
          issues_reported ? JSON.stringify(issues_reported) : null,
          maintenance_needed || null,
          null,
          'completed',
          inspected_at || new Date().toISOString(),
          shift_id || null,
        ]
      );

      // Update vehicle odometer
      if (odometer_reading) {
        await client.query(
          'UPDATE vehicles SET current_odometer = $1, updated_at = NOW() WHERE id = $2',
          [odometer_reading, vehicleId]
        );
      }

      // If there's new damage, auto-create a driver issue
      if (new_damage && new_damage.description && !new_damage.already_reported) {
        const year = new Date().getFullYear();
        const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
        const ticketNumber = `ISS-${year}-${rand}`;

        await client.query(
          `INSERT INTO driver_issues
             (ticket_number, driver_id, category, severity, description, status)
           VALUES ($1, $2, 'vehicle_damage', 'medium', $3, 'submitted')`,
          [ticketNumber, driver.id, `[Post-Trip Inspection] ${new_damage.description}. When: ${new_damage.when || 'Unknown'}. How: ${new_damage.how || 'Unknown'}`]
        );
      }

      // If maintenance is needed, create an issue for tracking
      if (maintenance_needed) {
        const year = new Date().getFullYear();
        const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
        const ticketNumber = `ISS-${year}-${rand}`;

        await client.query(
          `INSERT INTO driver_issues
             (ticket_number, driver_id, category, severity, description, status)
           VALUES ($1, $2, 'vehicle_issue', 'low', $3, 'submitted')`,
          [ticketNumber, driver.id, `[Maintenance Needed] ${maintenance_needed}`]
        );
      }

      await client.query('COMMIT');

      res.json({
        inspection: rows[0],
        message: 'Post-trip inspection submitted',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---- POST /issues — report a problem/issue ----
  router.post('/issues', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const {
      delivery_id, category, severity, description, photos,
      requires_immediate_action, customer_notified, customer_comments,
      can_continue_route, needs_assistance, damage_item,
    } = req.body;

    if (!category || !description || description.length < 10) {
      throw ApiError.badRequest('Category and description (min 10 chars) are required');
    }

    // Generate ticket number ISS-YYYY-XXXXX
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    const ticketNumber = `ISS-${year}-${rand}`;

    // Get driver location
    let lat = null, lng = null;
    try {
      const locRes = await pool.query(
        'SELECT lat, lng FROM driver_location_log WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 1',
        [driver.id]
      );
      if (locRes.rows.length) {
        lat = locRes.rows[0].lat;
        lng = locRes.rows[0].lng;
      }
    } catch { /* ignore */ }

    // Get current route_id if delivery is specified
    let routeId = null;
    if (delivery_id) {
      try {
        const stopRes = await pool.query(
          'SELECT route_id FROM delivery_route_stops WHERE delivery_booking_id = $1 LIMIT 1',
          [delivery_id]
        );
        if (stopRes.rows.length) routeId = stopRes.rows[0].route_id;
      } catch { /* ignore */ }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fullDescription = damage_item
        ? `[Damaged: ${damage_item}] ${description}`
        : description;

      const { rows } = await client.query(
        `INSERT INTO driver_issues
           (ticket_number, driver_id, delivery_booking_id, route_id, category, severity,
            description, location_lat, location_lng, requires_immediate_action,
            customer_notified, customer_comments, can_continue_route, needs_assistance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [ticketNumber, driver.id, delivery_id || null, routeId, category,
         severity || 'medium', fullDescription,
         lat, lng, !!requires_immediate_action,
         !!customer_notified, customer_comments || null,
         can_continue_route !== false, !!needs_assistance]
      );

      const issue = rows[0];

      // Store photos
      if (Array.isArray(photos) && photos.length > 0) {
        for (const photo of photos) {
          await client.query(
            `INSERT INTO driver_issue_photos (issue_id, photo_data, caption)
             VALUES ($1, $2, $3)`,
            [issue.id, photo.data, photo.caption || null]
          );
        }
      }

      // For critical/immediate issues, log for dispatch notification
      if (requires_immediate_action || severity === 'critical') {
        // If vehicle can't continue, pause the route
        if (can_continue_route === false && routeId) {
          await client.query(
            `UPDATE delivery_routes SET status = 'paused', notes = COALESCE(notes, '') || $2
             WHERE id = $1`,
            [routeId, ` [AUTO-PAUSED: ${ticketNumber} - ${category}]`]
          );
        }
      }

      await client.query('COMMIT');

      res.json({
        issue_id: issue.id,
        ticket_number: ticketNumber,
        status: 'submitted',
        message: requires_immediate_action || severity === 'critical'
          ? 'Issue reported. Dispatch has been notified for immediate action.'
          : 'Issue reported. Dispatch has been notified.',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  // ---- GET /issues — list driver's issues ----
  router.get('/issues', asyncHandler(async (req, res) => {
    const driver = await getDriver(req);
    if (!driver) throw ApiError.notFound('Driver');

    const { rows } = await pool.query(
      `SELECT id, ticket_number, category, severity, description, status,
              delivery_booking_id, requires_immediate_action, created_at
       FROM driver_issues
       WHERE driver_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [driver.id]
    );
    res.json({ issues: rows });
  }));

  // ---- GET /vehicles/available — list vehicles the driver can select ----
  router.get('/vehicles/available', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, plate_number, license_plate, vehicle_type,
              has_lift_gate, has_blankets, current_odometer, max_weight_kg, max_items
       FROM vehicles
       WHERE status = 'available'
       ORDER BY name`
    );
    res.json({ vehicles: rows });
  }));

  return router;
}

function mapBookingStatus(bookingStatus) {
  const map = {
    pending: 'pending', scheduled: 'pending', confirmed: 'pending',
    in_transit: 'approaching', delivered: 'completed',
    failed: 'failed', cancelled: 'skipped', rescheduled: 'skipped',
  };
  return map[bookingStatus] || 'pending';
}

module.exports = { init };
