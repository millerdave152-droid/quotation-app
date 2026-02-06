/**
 * Driver Management & Live Tracking
 * Clock in/out, GPS tracking, shifts, vehicle CRUD, inspections.
 * @module routes/driver-management
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();

  // ==========================================================================
  // DRIVER CRUD
  // ==========================================================================

  // POST /api/dispatch/drivers — create driver
  router.post(
    '/drivers',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { name, phone, email, license_number, user_id, vehicle_id, home_location_id } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, message: 'name is required' });
        }

        const result = await pool.query(
          `INSERT INTO drivers (name, phone, email, license_number, user_id, vehicle_id, home_location_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [name.trim(), phone || null, email || null, license_number || null,
           user_id || null, vehicle_id || null, home_location_id || null]
        );

        res.status(201).json({ success: true, driver: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/dispatch/drivers/:id — update driver
  router.put(
    '/drivers/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const current = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        const merged = { ...current.rows[0], ...req.body };
        const result = await pool.query(
          `UPDATE drivers SET
             name = $1, phone = $2, email = $3, license_number = $4,
             user_id = $5, vehicle_id = $6, home_location_id = $7,
             is_active = $8, updated_at = NOW()
           WHERE id = $9 RETURNING *`,
          [merged.name, merged.phone, merged.email, merged.license_number,
           merged.user_id, merged.vehicle_id, merged.home_location_id,
           merged.is_active !== false, id]
        );

        res.json({ success: true, driver: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // CLOCK IN / CLOCK OUT
  // ==========================================================================

  // POST /api/dispatch/drivers/:id/clock-in
  router.post(
    '/drivers/:id/clock-in',
    authenticate,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const driverId = parseInt(req.params.id, 10);
        const { vehicle_id, start_odometer } = req.body;

        await client.query('BEGIN');

        // Verify driver
        const driverResult = await client.query(
          'SELECT * FROM drivers WHERE id = $1 AND is_active = true', [driverId]
        );
        if (driverResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        const effectiveVehicleId = vehicle_id || driverResult.rows[0].vehicle_id;

        // Upsert shift
        const shiftResult = await client.query(
          `INSERT INTO driver_shifts (driver_id, shift_date, actual_start, vehicle_id, start_odometer, status)
           VALUES ($1, $2, NOW(), $3, $4, 'started')
           ON CONFLICT (driver_id, shift_date)
           DO UPDATE SET actual_start = NOW(), vehicle_id = $3, start_odometer = $4, status = 'started', updated_at = NOW()
           RETURNING *`,
          [driverId, today, effectiveVehicleId || null, start_odometer || null]
        );

        // Update driver status
        await client.query(
          "UPDATE drivers SET status = 'available', vehicle_id = COALESCE($1, vehicle_id), updated_at = NOW() WHERE id = $2",
          [effectiveVehicleId, driverId]
        );

        // Update vehicle status
        if (effectiveVehicleId) {
          await client.query(
            "UPDATE vehicles SET status = 'in_use', current_odometer = COALESCE($1, current_odometer), updated_at = NOW() WHERE id = $2",
            [start_odometer, effectiveVehicleId]
          );
        }

        await client.query('COMMIT');

        res.json({ success: true, shift: shiftResult.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // POST /api/dispatch/drivers/:id/clock-out
  router.post(
    '/drivers/:id/clock-out',
    authenticate,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const driverId = parseInt(req.params.id, 10);
        const { end_odometer, notes } = req.body;
        const today = new Date().toISOString().split('T')[0];

        await client.query('BEGIN');

        // Get current shift
        const shiftResult = await client.query(
          "SELECT * FROM driver_shifts WHERE driver_id = $1 AND shift_date = $2 AND status IN ('started','on_break')",
          [driverId, today]
        );
        if (shiftResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'No active shift found for today' });
        }
        const shift = shiftResult.rows[0];

        // Calculate distance if both odometers present
        let totalDistanceKm = null;
        if (end_odometer && shift.start_odometer) {
          totalDistanceKm = end_odometer - shift.start_odometer;
        }

        // Count deliveries completed today
        const deliveriesResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM delivery_bookings
           WHERE driver_id = $1 AND scheduled_date = $2 AND status IN ('completed','delivered')`,
          [driverId, today]
        );

        const updated = await client.query(
          `UPDATE driver_shifts SET
             actual_end = NOW(), end_odometer = $1, status = 'completed',
             total_distance_km = $2, total_deliveries = $3, notes = $4, updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [end_odometer || null, totalDistanceKm, deliveriesResult.rows[0].count, notes || null, shift.id]
        );

        // Update driver status
        await client.query(
          "UPDATE drivers SET status = 'off_duty', updated_at = NOW() WHERE id = $1",
          [driverId]
        );

        // Update vehicle
        if (shift.vehicle_id) {
          await client.query(
            "UPDATE vehicles SET status = 'available', current_odometer = COALESCE($1, current_odometer), updated_at = NOW() WHERE id = $2",
            [end_odometer, shift.vehicle_id]
          );
        }

        await client.query('COMMIT');

        res.json({ success: true, shift: updated.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // GPS TRACKING
  // ==========================================================================

  // POST /api/dispatch/drivers/:id/location — batch-capable GPS update
  router.post(
    '/drivers/:id/location',
    authenticate,
    async (req, res, next) => {
      try {
        const driverId = parseInt(req.params.id, 10);
        const { latitude, longitude, accuracy, speed, heading, batch } = req.body;

        if (batch && Array.isArray(batch)) {
          // Batch insert
          for (const point of batch.slice(0, 100)) { // max 100 points per batch
            await pool.query(
              `INSERT INTO driver_location_log (driver_id, lat, lng, accuracy_meters, speed_kmh, heading, recorded_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [driverId, point.latitude, point.longitude,
               point.accuracy || null, point.speed || null, point.heading || null,
               point.recorded_at || new Date()]
            );
          }

          // Update driver current position with last point
          const last = batch[batch.length - 1];
          await pool.query(
            'UPDATE drivers SET current_lat = $1, current_lng = $2, location_updated_at = NOW(), updated_at = NOW() WHERE id = $3',
            [last.latitude, last.longitude, driverId]
          );

          return res.json({ success: true, recorded: batch.length });
        }

        // Single point
        if (latitude === undefined || longitude === undefined) {
          return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
        }

        await pool.query(
          `INSERT INTO driver_location_log (driver_id, lat, lng, accuracy_meters, speed_kmh, heading)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [driverId, latitude, longitude, accuracy || null, speed || null, heading || null]
        );

        await pool.query(
          'UPDATE drivers SET current_lat = $1, current_lng = $2, location_updated_at = NOW(), updated_at = NOW() WHERE id = $3',
          [latitude, longitude, driverId]
        );

        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/dispatch/drivers/:id/location/current
  router.get(
    '/drivers/:id/location/current',
    authenticate,
    async (req, res, next) => {
      try {
        const driverId = parseInt(req.params.id, 10);

        const result = await pool.query(
          `SELECT d.id, d.name, d.status, d.current_lat, d.current_lng, d.location_updated_at,
                  dll.speed_kmh, dll.heading, dll.accuracy_meters
           FROM drivers d
           LEFT JOIN LATERAL (
             SELECT speed_kmh, heading, accuracy_meters FROM driver_location_log
             WHERE driver_id = d.id ORDER BY recorded_at DESC LIMIT 1
           ) dll ON true
           WHERE d.id = $1`,
          [driverId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        const d = result.rows[0];

        res.json({
          success: true,
          location: d.current_lat ? {
            latitude: parseFloat(d.current_lat),
            longitude: parseFloat(d.current_lng),
            speed_kmh: d.speed_kmh ? parseInt(d.speed_kmh) : null,
            heading: d.heading,
            accuracy_meters: d.accuracy_meters,
            updated_at: d.location_updated_at,
          } : null,
          driver: { id: d.id, name: d.name, status: d.status },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/dispatch/drivers/:id/location/history
  router.get(
    '/drivers/:id/location/history',
    authenticate,
    async (req, res, next) => {
      try {
        const driverId = parseInt(req.params.id, 10);
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];

        const result = await pool.query(
          `SELECT lat, lng, speed_kmh, heading, accuracy_meters, recorded_at
           FROM driver_location_log
           WHERE driver_id = $1
             AND recorded_at >= $2::date
             AND recorded_at < $2::date + INTERVAL '1 day'
           ORDER BY recorded_at`,
          [driverId, targetDate]
        );

        res.json({
          success: true,
          driver_id: driverId,
          date: targetDate,
          points: result.rows.map(r => ({
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lng),
            speed_kmh: r.speed_kmh ? parseInt(r.speed_kmh) : null,
            heading: r.heading,
            accuracy_meters: r.accuracy_meters,
            recorded_at: r.recorded_at,
          })),
          total_points: result.rows.length,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/dispatch/drivers/:id/status
  router.post(
    '/drivers/:id/status',
    authenticate,
    async (req, res, next) => {
      try {
        const driverId = parseInt(req.params.id, 10);
        const { status } = req.body;
        const valid = ['available', 'on_route', 'break', 'off_duty'];
        if (!status || !valid.includes(status)) {
          return res.status(400).json({ success: false, message: `status must be one of: ${valid.join(', ')}` });
        }

        const result = await pool.query(
          'UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *',
          [status, driverId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        // Update shift if going on break
        if (status === 'break') {
          const today = new Date().toISOString().split('T')[0];
          await pool.query(
            "UPDATE driver_shifts SET status = 'on_break', updated_at = NOW() WHERE driver_id = $1 AND shift_date = $2 AND status = 'started'",
            [driverId, today]
          );
        } else if (status === 'available' || status === 'on_route') {
          const today = new Date().toISOString().split('T')[0];
          await pool.query(
            "UPDATE driver_shifts SET status = 'started', updated_at = NOW() WHERE driver_id = $1 AND shift_date = $2 AND status = 'on_break'",
            [driverId, today]
          );
        }

        res.json({ success: true, driver: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // SHIFTS
  // ==========================================================================

  // GET /api/dispatch/shifts
  router.get(
    '/shifts',
    authenticate,
    async (req, res, next) => {
      try {
        const { date, driver_id, status } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const conditions = ['ds.shift_date = $1'];
        const params = [targetDate];
        let pi = 2;

        if (driver_id) { conditions.push(`ds.driver_id = $${pi++}`); params.push(parseInt(driver_id, 10)); }
        if (status) { conditions.push(`ds.status = $${pi++}`); params.push(status); }

        const result = await pool.query(
          `SELECT ds.*,
                  d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_current_status,
                  v.name AS vehicle_name, v.license_plate, v.vehicle_type
           FROM driver_shifts ds
           JOIN drivers d ON ds.driver_id = d.id
           LEFT JOIN vehicles v ON ds.vehicle_id = v.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY ds.scheduled_start, d.name`,
          params
        );

        res.json({ success: true, date: targetDate, shifts: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/dispatch/shifts — schedule a shift
  router.post(
    '/shifts',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { driver_id, shift_date, scheduled_start, scheduled_end, vehicle_id, notes } = req.body;
        if (!driver_id || !shift_date) {
          return res.status(400).json({ success: false, message: 'driver_id and shift_date are required' });
        }

        const result = await pool.query(
          `INSERT INTO driver_shifts (driver_id, shift_date, scheduled_start, scheduled_end, vehicle_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (driver_id, shift_date) DO UPDATE SET
             scheduled_start = COALESCE($3, driver_shifts.scheduled_start),
             scheduled_end = COALESCE($4, driver_shifts.scheduled_end),
             vehicle_id = COALESCE($5, driver_shifts.vehicle_id),
             notes = COALESCE($6, driver_shifts.notes),
             updated_at = NOW()
           RETURNING *`,
          [driver_id, shift_date, scheduled_start || null, scheduled_end || null, vehicle_id || null, notes || null]
        );

        res.status(201).json({ success: true, shift: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/dispatch/drivers/:id/shifts — driver shift history
  router.get(
    '/drivers/:id/shifts',
    authenticate,
    async (req, res, next) => {
      try {
        const driverId = parseInt(req.params.id, 10);
        const { from_date, to_date, page = 1, limit = 30 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
        const offset = (pageNum - 1) * pageSize;

        const conditions = ['ds.driver_id = $1'];
        const params = [driverId];
        let pi = 2;

        if (from_date) { conditions.push(`ds.shift_date >= $${pi++}::date`); params.push(from_date); }
        if (to_date) { conditions.push(`ds.shift_date <= $${pi++}::date`); params.push(to_date); }

        const where = conditions.join(' AND ');

        const result = await pool.query(
          `SELECT ds.*, v.name AS vehicle_name, v.license_plate
           FROM driver_shifts ds
           LEFT JOIN vehicles v ON ds.vehicle_id = v.id
           WHERE ${where}
           ORDER BY ds.shift_date DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Summary
        const summaryResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total_shifts,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_shifts,
             SUM(total_deliveries)::int AS total_deliveries,
             SUM(total_distance_km)::numeric(10,2) AS total_distance_km,
             ROUND(AVG(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600) FILTER (WHERE actual_end IS NOT NULL), 1) AS avg_shift_hours
           FROM driver_shifts
           WHERE ${where}`,
          params
        );

        res.json({
          success: true,
          shifts: result.rows,
          summary: summaryResult.rows[0],
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // VEHICLES
  // ==========================================================================

  // GET /api/dispatch/vehicles
  router.get(
    '/vehicles',
    authenticate,
    async (req, res, next) => {
      try {
        const { status, type } = req.query;
        const conditions = ['v.is_active = true'];
        const params = [];
        let pi = 1;

        if (status) { conditions.push(`v.status = $${pi++}`); params.push(status); }
        if (type) { conditions.push(`v.vehicle_type = $${pi++}`); params.push(type); }

        const result = await pool.query(
          `SELECT v.*,
                  (SELECT d.name FROM drivers d WHERE d.vehicle_id = v.id AND d.is_active = true LIMIT 1) AS assigned_driver_name,
                  (SELECT d.id FROM drivers d WHERE d.vehicle_id = v.id AND d.is_active = true LIMIT 1) AS assigned_driver_id,
                  (SELECT vi.inspection_date FROM vehicle_inspections vi
                   WHERE vi.vehicle_id = v.id ORDER BY vi.inspection_date DESC LIMIT 1) AS last_inspection,
                  (SELECT vi.passed FROM vehicle_inspections vi
                   WHERE vi.vehicle_id = v.id ORDER BY vi.inspection_date DESC LIMIT 1) AS last_inspection_passed
           FROM vehicles v
           WHERE ${conditions.join(' AND ')}
           ORDER BY v.name`,
          params
        );

        res.json({ success: true, vehicles: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/dispatch/vehicles — create vehicle
  router.post(
    '/vehicles',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const {
          name, license_plate, vehicle_type,
          max_weight_kg, capacity_volume_cbm, max_items,
          has_lift_gate, has_blankets, notes,
        } = req.body;

        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, message: 'name is required' });
        }
        const validTypes = ['van', 'truck', 'box_truck', 'flatbed'];
        if (vehicle_type && !validTypes.includes(vehicle_type)) {
          return res.status(400).json({ success: false, message: `vehicle_type must be one of: ${validTypes.join(', ')}` });
        }

        const result = await pool.query(
          `INSERT INTO vehicles
             (name, license_plate, plate_number, vehicle_type,
              max_weight_kg, capacity_weight_kg, capacity_volume_cbm, max_items, capacity_items,
              has_lift_gate, has_blankets, notes)
           VALUES ($1,$2,$2,$3,$4,$4,$5,$6,$6,$7,$8,$9) RETURNING *`,
          [name.trim(), license_plate || null, vehicle_type || 'van',
           max_weight_kg || null, capacity_volume_cbm || null, max_items || null,
           has_lift_gate || false, has_blankets !== false, notes || null]
        );

        res.status(201).json({ success: true, vehicle: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/dispatch/vehicles/:id — update vehicle
  router.put(
    '/vehicles/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const current = await pool.query('SELECT * FROM vehicles WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        const m = { ...current.rows[0], ...req.body };
        const result = await pool.query(
          `UPDATE vehicles SET
             name = $1, license_plate = $2, plate_number = $2, vehicle_type = $3,
             max_weight_kg = $4, capacity_weight_kg = $4, capacity_volume_cbm = $5,
             max_items = $6, capacity_items = $6,
             has_lift_gate = $7, has_blankets = $8, status = $9,
             is_active = $10, notes = $11, updated_at = NOW()
           WHERE id = $12 RETURNING *`,
          [m.name, m.license_plate, m.vehicle_type,
           m.max_weight_kg, m.capacity_volume_cbm, m.max_items,
           m.has_lift_gate, m.has_blankets, m.status || 'available',
           m.is_active !== false, m.notes, id]
        );

        res.json({ success: true, vehicle: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // VEHICLE INSPECTIONS
  // ==========================================================================

  // POST /api/dispatch/vehicles/:id/inspection
  router.post(
    '/vehicles/:id/inspection',
    authenticate,
    async (req, res, next) => {
      try {
        const vehicleId = parseInt(req.params.id, 10);
        const { inspection_type, checklist, passed, issues_found, odometer_reading, photos, notes, driver_id } = req.body;

        const validTypes = ['pre_trip', 'post_trip', 'periodic'];
        if (!inspection_type || !validTypes.includes(inspection_type)) {
          return res.status(400).json({ success: false, message: `inspection_type must be one of: ${validTypes.join(', ')}` });
        }

        const vehicleResult = await pool.query('SELECT id FROM vehicles WHERE id = $1', [vehicleId]);
        if (vehicleResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        const result = await pool.query(
          `INSERT INTO vehicle_inspections
             (vehicle_id, driver_id, inspection_type, checklist, passed, issues_found,
              odometer_reading, photos, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            vehicleId, driver_id || null, inspection_type,
            checklist ? JSON.stringify(checklist) : '{}',
            passed !== false,
            issues_found || null,
            odometer_reading || null,
            photos || null,
            notes || null,
          ]
        );

        // Update vehicle
        await pool.query(
          `UPDATE vehicles SET
             last_inspection_date = CURRENT_DATE,
             current_odometer = COALESCE($1, current_odometer),
             updated_at = NOW()
           WHERE id = $2`,
          [odometer_reading, vehicleId]
        );

        // If inspection failed, set vehicle to maintenance
        if (passed === false) {
          await pool.query(
            "UPDATE vehicles SET status = 'maintenance', updated_at = NOW() WHERE id = $1",
            [vehicleId]
          );
        }

        res.status(201).json({ success: true, inspection: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/dispatch/vehicles/:id/inspections
  router.get(
    '/vehicles/:id/inspections',
    authenticate,
    async (req, res, next) => {
      try {
        const vehicleId = parseInt(req.params.id, 10);
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * pageSize;

        const result = await pool.query(
          `SELECT vi.*, d.name AS driver_name
           FROM vehicle_inspections vi
           LEFT JOIN drivers d ON vi.driver_id = d.id
           WHERE vi.vehicle_id = $1
           ORDER BY vi.created_at DESC
           LIMIT $2 OFFSET $3`,
          [vehicleId, pageSize, offset]
        );

        res.json({ success: true, inspections: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // LOCATION DATA CLEANUP (call via cron or manual)
  // ==========================================================================
  router.post(
    '/location-cleanup',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const days = parseInt(req.body.days_to_keep, 10) || 7;
        const result = await pool.query(
          "DELETE FROM driver_location_log WHERE recorded_at < NOW() - INTERVAL '1 day' * $1",
          [days]
        );
        res.json({ success: true, deleted: result.rowCount, days_kept: days });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
