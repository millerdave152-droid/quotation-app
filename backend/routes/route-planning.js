/**
 * Route Planning & Optimization
 * Auto-generate routes, nearest-neighbor optimization, manual reorder, driver assignment.
 * @module routes/route-planning
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { ApiError } = require('../middleware/errorHandler');

function init({ pool }) {
  const router = express.Router();

  // ==========================================================================
  // GEOMETRY HELPERS
  // ==========================================================================

  /** Haversine distance between two lat/lng points in km */
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Estimate driving minutes from km (avg 30 km/h urban + 5 min buffer) */
  function estimateDriveMinutes(distKm) {
    return Math.round((distKm / 30) * 60) + 5;
  }

  /** Add minutes to a time string "HH:MM" → "HH:MM" */
  function addMinutesToTime(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = String(timeStr).split(':').map(Number);
    return h * 60 + (m || 0);
  }

  // ==========================================================================
  // NEAREST-NEIGHBOR OPTIMIZER
  // ==========================================================================

  function optimizeStops(stops, startLat, startLng) {
    if (stops.length <= 1) return { optimized: stops, totalDistanceKm: 0 };

    const remaining = stops.map((s, i) => ({ ...s, _origIdx: i }));
    const optimized = [];
    let curLat = startLat;
    let curLng = startLng;
    let totalDistance = 0;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const stop = remaining[i];
        if (!stop.latitude || !stop.longitude) {
          // No coords — put at end
          if (bestDist === Infinity) bestIdx = i;
          continue;
        }

        let dist = haversineKm(curLat, curLng, parseFloat(stop.latitude), parseFloat(stop.longitude));

        // Penalize if arrival would exceed delivery window end
        if (stop.window_end) {
          const travelMin = estimateDriveMinutes(dist);
          const currentTimeMin = optimized.length > 0
            ? timeToMinutes(optimized[optimized.length - 1]._estDeparture)
            : timeToMinutes(addMinutesToTime('00:00', 0));
          const arrivalMin = (currentTimeMin || 0) + travelMin;
          const windowEndMin = timeToMinutes(stop.window_end);
          if (windowEndMin && arrivalMin > windowEndMin) {
            dist += 50; // heavy penalty
          }
        }

        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      const chosen = remaining.splice(bestIdx, 1)[0];
      const realDist = (chosen.latitude && chosen.longitude)
        ? haversineKm(curLat, curLng, parseFloat(chosen.latitude), parseFloat(chosen.longitude))
        : 0;
      totalDistance += realDist;

      const travelMin = estimateDriveMinutes(realDist);
      const prevDeparture = optimized.length > 0
        ? optimized[optimized.length - 1]._estDeparture
        : null;

      chosen._distFromPrevKm = Math.round(realDist * 100) / 100;
      chosen._travelMinFromPrev = travelMin;

      // Estimate arrival/departure
      if (prevDeparture) {
        chosen._estArrival = addMinutesToTime(prevDeparture, travelMin);
      }
      const durationAtStop = chosen.estimated_duration_minutes || 15;
      if (chosen._estArrival) {
        chosen._estDeparture = addMinutesToTime(chosen._estArrival, durationAtStop);
      }

      optimized.push(chosen);

      if (chosen.latitude && chosen.longitude) {
        curLat = parseFloat(chosen.latitude);
        curLng = parseFloat(chosen.longitude);
      }
    }

    return {
      optimized,
      totalDistanceKm: Math.round(totalDistance * 100) / 100,
    };
  }

  // ==========================================================================
  // POST /api/dispatch/routes/auto-generate
  // ==========================================================================
  router.post(
    '/auto-generate',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { date, location_id } = req.body;
        const targetDate = date || new Date().toISOString().split('T')[0];

        if (!location_id) {
          throw ApiError.badRequest('location_id (warehouse) is required');
        }

        await client.query('BEGIN');

        // Get warehouse location
        const locResult = await client.query(
          'SELECT id, name, latitude, longitude FROM locations WHERE id = $1',
          [location_id]
        );
        if (locResult.rows.length === 0) {
          await client.query('ROLLBACK');
          throw ApiError.notFound('Location');
        }
        const warehouse = locResult.rows[0];

        // Get unassigned deliveries for the date
        const deliveries = await client.query(
          `SELECT db.id, db.order_id, db.zone_id, db.contact_name,
                  db.delivery_address, db.delivery_postal_code,
                  db.scheduled_start, db.scheduled_end,
                  db.latitude, db.longitude, db.weight_kg,
                  dz.zone_name, dz.center_lat, dz.center_lng
           FROM delivery_bookings db
           LEFT JOIN delivery_zones dz ON db.zone_id = dz.id
           WHERE db.scheduled_date = $1
             AND db.route_id IS NULL
             AND db.status NOT IN ('completed','delivered','cancelled','failed')
           ORDER BY db.zone_id, db.scheduled_start`,
          [targetDate]
        );

        if (deliveries.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.json({ success: true, routes_created: 0, deliveries_assigned: 0, message: 'No unassigned deliveries for this date' });
        }

        // Group by zone
        const zones = {};
        for (const d of deliveries.rows) {
          const zoneKey = d.zone_id || 'unzoned';
          if (!zones[zoneKey]) zones[zoneKey] = { zone_id: d.zone_id, zone_name: d.zone_name || 'Unzoned', deliveries: [] };
          zones[zoneKey].deliveries.push(d);
        }

        // Get available drivers
        const driversResult = await client.query(
          `SELECT d.id, d.name, d.vehicle_id,
                  v.capacity_weight_kg, v.capacity_items
           FROM drivers d
           LEFT JOIN vehicles v ON d.vehicle_id = v.id
           WHERE d.is_active = true
             AND d.id NOT IN (
               SELECT DISTINCT driver_id FROM dispatch_routes
               WHERE route_date = $1 AND status NOT IN ('cancelled','completed')
               AND driver_id IS NOT NULL
             )
           ORDER BY d.name`,
          [targetDate]
        );
        const availableDrivers = [...driversResult.rows];

        // Create routes: one per zone (or split large zones)
        const maxStopsPerRoute = 15;
        let routesCreated = 0;
        let deliveriesAssigned = 0;
        const createdRoutes = [];

        for (const [, zone] of Object.entries(zones)) {
          // Split zone into chunks if > maxStopsPerRoute
          const chunks = [];
          for (let i = 0; i < zone.deliveries.length; i += maxStopsPerRoute) {
            chunks.push(zone.deliveries.slice(i, i + maxStopsPerRoute));
          }

          for (const chunk of chunks) {
            // Generate route number
            const seqResult = await client.query("SELECT nextval('dispatch_route_number_seq') AS seq");
            const seq = String(seqResult.rows[0].seq).padStart(3, '0');
            const routeNumber = `RTE-${targetDate}-${seq}`;

            // Assign driver if available
            const driver = availableDrivers.shift() || null;

            const totalWeight = chunk.reduce((sum, d) => sum + (parseFloat(d.weight_kg) || 0), 0);

            const routeResult = await client.query(
              `INSERT INTO dispatch_routes
                 (route_number, route_date, driver_id, vehicle_id, start_location_id,
                  location_id, start_time, status, total_stops, total_weight_kg,
                  notes, created_by)
               VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11)
               RETURNING *`,
              [
                routeNumber, targetDate,
                driver ? driver.id : null,
                driver ? driver.vehicle_id : null,
                location_id,
                '08:00',
                driver ? 'assigned' : 'planned',
                chunk.length,
                Math.round(totalWeight * 100) / 100,
                `Auto-generated for zone: ${zone.zone_name}`,
                req.user.id,
              ]
            );
            const route = routeResult.rows[0];

            // Create stops and link bookings
            for (let i = 0; i < chunk.length; i++) {
              const d = chunk[i];
              const lat = d.latitude || d.center_lat || null;
              const lng = d.longitude || d.center_lng || null;

              await client.query(
                `INSERT INTO delivery_route_stops
                   (route_id, delivery_booking_id, sequence_order, address, latitude, longitude,
                    estimated_duration_minutes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [route.id, d.id, i + 1, d.delivery_address || 'N/A', lat, lng, 15]
              );

              // Link booking to route
              await client.query(
                `UPDATE delivery_bookings SET
                   route_id = $1, route_order = $2,
                   driver_id = COALESCE(driver_id, $3),
                   driver_name = COALESCE(driver_name, $4),
                   status = CASE WHEN status = 'processing' THEN 'scheduled' ELSE status END,
                   updated_at = NOW()
                 WHERE id = $5`,
                [route.id, i + 1, driver ? driver.id : null, driver ? driver.name : null, d.id]
              );

              deliveriesAssigned++;
            }

            routesCreated++;
            createdRoutes.push({
              id: route.id,
              route_number: routeNumber,
              zone: zone.zone_name,
              stops: chunk.length,
              driver: driver ? driver.name : null,
            });
          }
        }

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          routes_created: routesCreated,
          deliveries_assigned: deliveriesAssigned,
          drivers_remaining: availableDrivers.length,
          routes: createdRoutes,
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
  // POST /api/dispatch/routes/:id/optimize
  // ==========================================================================
  router.post(
    '/:id/optimize',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Get route
        const routeResult = await client.query(
          `SELECT dr.*, l.latitude AS start_lat, l.longitude AS start_lng, l.name AS start_name
           FROM dispatch_routes dr
           LEFT JOIN locations l ON dr.start_location_id = l.id
           WHERE dr.id = $1`,
          [id]
        );
        if (routeResult.rows.length === 0) {
          await client.query('ROLLBACK');
          throw ApiError.notFound('Route');
        }
        const route = routeResult.rows[0];

        if (['completed', 'cancelled'].includes(route.status)) {
          await client.query('ROLLBACK');
          throw ApiError.badRequest(`Cannot optimize a ${route.status} route`);
        }

        // Get current stops
        const stopsResult = await client.query(
          `SELECT drs.*,
                  db.scheduled_start AS window_start, db.scheduled_end AS window_end,
                  db.contact_name
           FROM delivery_route_stops drs
           LEFT JOIN delivery_bookings db ON drs.delivery_booking_id = db.id
           WHERE drs.route_id = $1
           ORDER BY drs.sequence_order`,
          [id]
        );

        if (stopsResult.rows.length <= 1) {
          await client.query('ROLLBACK');
          return res.json({
            success: true,
            optimized: true,
            message: 'Route has 0-1 stops, no optimization needed',
            distance_saved_km: 0,
            time_saved_minutes: 0,
          });
        }

        // Calculate original distance
        const startLat = parseFloat(route.start_lat) || 43.6532; // Toronto default
        const startLng = parseFloat(route.start_lng) || -79.3832;
        let originalDistance = 0;
        let prevLat = startLat;
        let prevLng = startLng;
        for (const stop of stopsResult.rows) {
          if (stop.latitude && stop.longitude) {
            originalDistance += haversineKm(prevLat, prevLng, parseFloat(stop.latitude), parseFloat(stop.longitude));
            prevLat = parseFloat(stop.latitude);
            prevLng = parseFloat(stop.longitude);
          }
        }

        // Run optimization
        const { optimized: optimizedStops, totalDistanceKm } = optimizeStops(
          stopsResult.rows, startLat, startLng
        );

        // Compute start time
        const startTime = route.start_time || '08:00';
        let currentTime = startTime;

        // Update stops with new order and estimated times
        const newSequence = [];
        for (let i = 0; i < optimizedStops.length; i++) {
          const stop = optimizedStops[i];

          // Calc arrival from prev
          let estArrival = stop._estArrival || null;
          let estDeparture = stop._estDeparture || null;
          if (i === 0) {
            // First stop: drive from warehouse
            const dist = (stop.latitude && stop.longitude)
              ? haversineKm(startLat, startLng, parseFloat(stop.latitude), parseFloat(stop.longitude))
              : 0;
            const travelMin = estimateDriveMinutes(dist);
            estArrival = addMinutesToTime(startTime, travelMin);
            estDeparture = addMinutesToTime(estArrival, stop.estimated_duration_minutes || 15);
            currentTime = estDeparture;
          } else if (stop._estArrival) {
            currentTime = stop._estDeparture || addMinutesToTime(stop._estArrival, 15);
          }

          await client.query(
            `UPDATE delivery_route_stops SET
               sequence_order = $1,
               estimated_arrival = $2,
               estimated_departure = $3,
               estimated_distance_from_prev_km = $4
             WHERE id = $5`,
            [i + 1, estArrival, estDeparture, stop._distFromPrevKm || null, stop.id]
          );

          // Update linked booking's route_order
          if (stop.delivery_booking_id) {
            await client.query(
              'UPDATE delivery_bookings SET route_order = $1, estimated_arrival = $2, updated_at = NOW() WHERE id = $3',
              [i + 1, estArrival ? `${route.route_date} ${estArrival}` : null, stop.delivery_booking_id]
            );
          }

          newSequence.push({
            stop_id: stop.id,
            sequence: i + 1,
            address: stop.address,
            customer: stop.contact_name,
            estimated_arrival: estArrival,
            distance_from_prev_km: stop._distFromPrevKm,
          });
        }

        // Calculate total estimated duration
        const startMin = timeToMinutes(startTime);
        const endMin = timeToMinutes(currentTime);
        const totalDuration = endMin ? endMin - startMin : null;

        const distanceSaved = Math.round((originalDistance - totalDistanceKm) * 100) / 100;
        const timeSaved = distanceSaved > 0 ? Math.round(estimateDriveMinutes(distanceSaved)) : 0;

        // Update route
        await client.query(
          `UPDATE dispatch_routes SET
             status = CASE WHEN status = 'planned' THEN 'optimized' ELSE status END,
             total_distance_km = $1,
             estimated_duration_minutes = $2,
             optimized_at = NOW(),
             updated_at = NOW()
           WHERE id = $3`,
          [totalDistanceKm, totalDuration, id]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          optimized: true,
          original_distance_km: Math.round(originalDistance * 100) / 100,
          optimized_distance_km: totalDistanceKm,
          distance_saved_km: Math.max(0, distanceSaved),
          time_saved_minutes: Math.max(0, timeSaved),
          estimated_duration_minutes: totalDuration,
          new_sequence: newSequence,
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
  // PUT /api/dispatch/routes/:id/assign-driver
  // ==========================================================================
  router.put(
    '/:id/assign-driver',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { driver_id, vehicle_id } = req.body;

        if (!driver_id) {
          throw ApiError.badRequest('driver_id is required');
        }

        const routeResult = await pool.query('SELECT * FROM dispatch_routes WHERE id = $1', [id]);
        if (routeResult.rows.length === 0) {
          throw ApiError.notFound('Route');
        }
        if (['completed', 'cancelled'].includes(routeResult.rows[0].status)) {
          throw ApiError.badRequest(`Cannot assign driver to ${routeResult.rows[0].status} route`);
        }

        const driverResult = await pool.query('SELECT id, name, vehicle_id FROM drivers WHERE id = $1 AND is_active = true', [driver_id]);
        if (driverResult.rows.length === 0) {
          throw ApiError.notFound('Driver');
        }
        const driver = driverResult.rows[0];

        const effectiveVehicleId = vehicle_id || driver.vehicle_id || null;

        const result = await pool.query(
          `UPDATE dispatch_routes SET
             driver_id = $1, vehicle_id = $2,
             status = CASE WHEN status IN ('planned','optimized') THEN 'assigned' ELSE status END,
             updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [driver_id, effectiveVehicleId, id]
        );

        // Update all bookings on this route
        await pool.query(
          `UPDATE delivery_bookings SET driver_id = $1, driver_name = $2, updated_at = NOW()
           WHERE route_id = $3 AND driver_id IS DISTINCT FROM $1`,
          [driver_id, driver.name, id]
        );

        res.json({ success: true, route: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/routes/:id/reorder
  // ==========================================================================
  router.put(
    '/:id/reorder',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { id } = req.params;
        const { stop_order } = req.body;

        if (!stop_order || !Array.isArray(stop_order) || stop_order.length === 0) {
          throw ApiError.badRequest('stop_order array of stop IDs is required');
        }

        const routeResult = await client.query('SELECT * FROM dispatch_routes WHERE id = $1', [id]);
        if (routeResult.rows.length === 0) {
          throw ApiError.notFound('Route');
        }

        await client.query('BEGIN');

        for (let i = 0; i < stop_order.length; i++) {
          await client.query(
            'UPDATE delivery_route_stops SET sequence_order = $1 WHERE id = $2 AND route_id = $3',
            [i + 1, stop_order[i], id]
          );

          // Update linked booking
          const stopResult = await client.query(
            'SELECT delivery_booking_id FROM delivery_route_stops WHERE id = $1', [stop_order[i]]
          );
          if (stopResult.rows[0]?.delivery_booking_id) {
            await client.query(
              'UPDATE delivery_bookings SET route_order = $1, updated_at = NOW() WHERE id = $2',
              [i + 1, stopResult.rows[0].delivery_booking_id]
            );
          }
        }

        await client.query('COMMIT');

        // Return updated stops
        const stops = await pool.query(
          `SELECT drs.*, db.contact_name, db.delivery_address
           FROM delivery_route_stops drs
           LEFT JOIN delivery_bookings db ON drs.delivery_booking_id = db.id
           WHERE drs.route_id = $1
           ORDER BY drs.sequence_order`,
          [id]
        );

        res.json({ success: true, stops: stops.rows });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/routes/:id/stops
  // ==========================================================================
  router.get(
    '/:id/stops',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const routeResult = await pool.query(
          `SELECT dr.*, d.name AS driver_name, l.name AS start_location_name,
                  l.latitude AS start_lat, l.longitude AS start_lng
           FROM dispatch_routes dr
           LEFT JOIN drivers d ON dr.driver_id = d.id
           LEFT JOIN locations l ON dr.start_location_id = l.id
           WHERE dr.id = $1`,
          [id]
        );
        if (routeResult.rows.length === 0) {
          throw ApiError.notFound('Route');
        }

        const stopsResult = await pool.query(
          `SELECT drs.*,
                  db.booking_number, db.contact_name, db.contact_phone,
                  db.delivery_address, db.delivery_city, db.delivery_postal_code,
                  db.scheduled_start AS window_start, db.scheduled_end AS window_end,
                  db.delivery_instructions, db.status AS booking_status,
                  dd.dwelling_type, dd.floor_number, dd.elevator_required,
                  dd.access_notes, dd.parking_type
           FROM delivery_route_stops drs
           LEFT JOIN delivery_bookings db ON drs.delivery_booking_id = db.id
           LEFT JOIN delivery_details dd ON dd.order_id = db.order_id
           WHERE drs.route_id = $1
           ORDER BY drs.sequence_order`,
          [id]
        );

        res.json({
          success: true,
          route: routeResult.rows[0],
          stops: stopsResult.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/routes/:id/start
  // ==========================================================================
  router.put(
    '/:id/start',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `UPDATE dispatch_routes SET
             status = 'in_progress', started_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status IN ('planned','optimized','assigned')
           RETURNING *`,
          [id]
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Route not found or cannot be started');
        }

        // Update driver status
        if (result.rows[0].driver_id) {
          await pool.query(
            "UPDATE drivers SET status = 'on_route', updated_at = NOW() WHERE id = $1",
            [result.rows[0].driver_id]
          );
        }

        res.json({ success: true, route: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/routes/:id/complete
  // ==========================================================================
  router.put(
    '/:id/complete',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `UPDATE dispatch_routes SET
             status = 'completed', completed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'in_progress'
           RETURNING *`,
          [id]
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Route not found or not in progress');
        }

        // Set driver to available
        if (result.rows[0].driver_id) {
          await pool.query(
            "UPDATE drivers SET status = 'available', updated_at = NOW() WHERE id = $1",
            [result.rows[0].driver_id]
          );
        }

        res.json({ success: true, route: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/routes/stops/:stopId/status
  // ==========================================================================
  router.put(
    '/stops/:stopId/status',
    authenticate,
    async (req, res, next) => {
      try {
        const { stopId } = req.params;
        const { status, notes } = req.body;
        const valid = ['pending', 'approaching', 'arrived', 'completed', 'skipped', 'failed'];
        if (!status || !valid.includes(status)) {
          throw ApiError.badRequest(`status must be one of: ${valid.join(', ')}`);
        }

        const updates = ['status = $1'];
        const params = [status];
        let pi = 2;

        if (status === 'arrived') updates.push('actual_arrival = NOW()');
        if (status === 'completed') updates.push('actual_departure = NOW()');
        if (notes) { updates.push(`notes = $${pi++}`); params.push(notes); }

        params.push(stopId);
        const result = await pool.query(
          `UPDATE delivery_route_stops SET ${updates.join(', ')} WHERE id = $${pi} RETURNING *`,
          params
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Stop');
        }

        const stop = result.rows[0];

        // Sync delivery booking status
        if (stop.delivery_booking_id) {
          const bookingStatus = status === 'completed' ? 'delivered'
            : status === 'arrived' ? 'in_progress'
            : status === 'approaching' ? 'en_route'
            : status === 'failed' ? 'failed'
            : null;
          if (bookingStatus) {
            await pool.query(
              `UPDATE delivery_bookings SET status = $1, updated_at = NOW()
               ${status === 'arrived' ? ', actual_arrival = NOW()' : ''}
               ${status === 'completed' ? ', actual_departure = NOW(), completed_at = NOW()' : ''}
               WHERE id = $2`,
              [bookingStatus, stop.delivery_booking_id]
            );
          }
        }

        // Update route completed_stops count
        if (status === 'completed' || status === 'skipped' || status === 'failed') {
          await pool.query(
            `UPDATE dispatch_routes SET
               completed_stops = (SELECT COUNT(*)::int FROM delivery_route_stops
                                  WHERE route_id = $1 AND status IN ('completed','skipped','failed')),
               updated_at = NOW()
             WHERE id = $1`,
            [stop.route_id]
          );
        }

        res.json({ success: true, stop });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
