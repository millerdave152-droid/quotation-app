/**
 * Dispatch Console API
 * Dashboard, delivery management, driver tracking, route planning, and map data.
 * @module routes/dispatch
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();

  // ==========================================================================
  // GET /api/dispatch/dashboard
  // ==========================================================================
  router.get(
    '/dashboard',
    authenticate,
    async (req, res, next) => {
      try {
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];
        const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;

        const locFilter = locationId ? 'AND db.zone_id IN (SELECT id FROM delivery_zones WHERE TRUE)' : '';

        // ---- Delivery summary from delivery_bookings ----
        const bookingSummary = await pool.query(
          `SELECT
             COUNT(*)::int AS total_deliveries,
             COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE status IN ('dispatched','en_route','in_progress'))::int AS in_progress,
             COUNT(*) FILTER (WHERE status IN ('completed','delivered'))::int AS completed,
             COUNT(*) FILTER (WHERE status IN ('failed','cancelled'))::int AS failed,
             COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
           FROM delivery_bookings
           WHERE scheduled_date = $1`,
          [targetDate]
        );

        // Also count from scheduled_deliveries
        const schedSummary = await pool.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
           FROM scheduled_deliveries
           WHERE delivery_date = $1`,
          [targetDate]
        );

        // Merge summaries
        const bs = bookingSummary.rows[0];
        const ss = schedSummary.rows[0];
        const totalDeliveries = bs.total_deliveries + ss.total;

        // ---- Driver summary ----
        const driverSummary = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status != 'off_duty' AND is_active)::int AS drivers_active,
             COUNT(*) FILTER (WHERE status = 'available' AND is_active)::int AS drivers_available,
             COUNT(*) FILTER (WHERE status = 'on_route' AND is_active)::int AS drivers_on_route
           FROM drivers`
        );

        // ---- Route summary ----
        const routeSummary = await pool.query(
          `SELECT
             COUNT(*)::int AS total_routes,
             COUNT(*) FILTER (WHERE status = 'planned')::int AS routes_planned,
             COUNT(*) FILTER (WHERE status = 'in_progress')::int AS routes_in_progress,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS routes_completed
           FROM dispatch_routes
           WHERE route_date = $1`,
          [targetDate]
        );

        const ds = driverSummary.rows[0];
        const rs = routeSummary.rows[0];

        // ---- By zone ----
        const byZone = await pool.query(
          `SELECT
             dz.id AS zone_id, dz.zone_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE db.status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE db.status IN ('completed','delivered'))::int AS completed,
             ROUND(AVG(EXTRACT(EPOCH FROM (db.actual_departure - db.actual_arrival)) / 60)
               FILTER (WHERE db.actual_arrival IS NOT NULL AND db.actual_departure IS NOT NULL))::int AS avg_delivery_minutes
           FROM delivery_bookings db
           JOIN delivery_zones dz ON db.zone_id = dz.id
           WHERE db.scheduled_date = $1
           GROUP BY dz.id, dz.zone_name
           ORDER BY dz.zone_name`,
          [targetDate]
        );

        // Also try scheduled_deliveries zones
        const byZoneSched = await pool.query(
          `SELECT
             dz.id AS zone_id, dz.zone_name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE sd.status = 'scheduled')::int AS scheduled,
             COUNT(*) FILTER (WHERE sd.status = 'completed')::int AS completed,
             NULL::int AS avg_delivery_minutes
           FROM scheduled_deliveries sd
           JOIN delivery_zones dz ON sd.zone_id = dz.id
           WHERE sd.delivery_date = $1
           GROUP BY dz.id, dz.zone_name
           ORDER BY dz.zone_name`,
          [targetDate]
        );

        // Merge zone data
        const zoneMap = {};
        for (const z of byZone.rows) {
          zoneMap[z.zone_id] = { ...z };
        }
        for (const z of byZoneSched.rows) {
          if (zoneMap[z.zone_id]) {
            zoneMap[z.zone_id].total += z.total;
            zoneMap[z.zone_id].scheduled += z.scheduled;
            zoneMap[z.zone_id].completed += z.completed;
          } else {
            zoneMap[z.zone_id] = { ...z };
          }
        }

        // ---- Alerts ----
        const alerts = [];

        // Late deliveries
        const lateBookings = await pool.query(
          `SELECT db.id, db.driver_name, db.contact_name, db.scheduled_end,
                  EXTRACT(EPOCH FROM (NOW() - (db.scheduled_date || ' ' || db.scheduled_end)::timestamp)) / 60 AS minutes_late
           FROM delivery_bookings db
           WHERE db.scheduled_date = $1
             AND db.status NOT IN ('completed','delivered','cancelled','failed')
             AND db.scheduled_end IS NOT NULL
             AND (db.scheduled_date || ' ' || db.scheduled_end)::timestamp < NOW()`,
          [targetDate]
        );
        for (const late of lateBookings.rows) {
          alerts.push({
            type: 'running_late',
            delivery_id: late.id,
            driver_name: late.driver_name,
            message: `Driver ${late.driver_name || 'Unassigned'} — delivery to ${late.contact_name} is ${Math.round(late.minutes_late)} min overdue`,
          });
        }

        // Unassigned deliveries
        const unassigned = await pool.query(
          `SELECT COUNT(*)::int AS count FROM delivery_bookings
           WHERE scheduled_date = $1 AND driver_id IS NULL
             AND status NOT IN ('completed','delivered','cancelled','failed')`,
          [targetDate]
        );
        if (unassigned.rows[0].count > 0) {
          alerts.push({
            type: 'unassigned',
            message: `${unassigned.rows[0].count} deliveries for today have no driver assigned`,
          });
        }

        res.json({
          success: true,
          date: targetDate,
          summary: {
            total_deliveries: totalDeliveries,
            scheduled: bs.scheduled + ss.scheduled,
            in_progress: bs.in_progress + ss.in_progress,
            completed: bs.completed + ss.completed,
            failed: bs.failed + ss.failed,
            processing: bs.processing,

            drivers_active: ds.drivers_active,
            drivers_available: ds.drivers_available,
            drivers_on_route: ds.drivers_on_route,

            routes_total: rs.total_routes,
            routes_planned: rs.routes_planned,
            routes_in_progress: rs.routes_in_progress,
            routes_completed: rs.routes_completed,
          },
          by_zone: Object.values(zoneMap),
          alerts,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/deliveries
  // ==========================================================================
  router.get(
    '/deliveries',
    authenticate,
    async (req, res, next) => {
      try {
        const { date, status, zone_id, driver_id, search, page = 1, limit = 50 } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = ['db.scheduled_date = $1'];
        const params = [targetDate];
        let pi = 2;

        if (status) { conditions.push(`db.status = $${pi++}`); params.push(status); }
        if (zone_id) { conditions.push(`db.zone_id = $${pi++}`); params.push(parseInt(zone_id, 10)); }
        if (driver_id) { conditions.push(`db.driver_id = $${pi++}`); params.push(parseInt(driver_id, 10)); }
        if (search) {
          conditions.push(`(db.contact_name ILIKE $${pi} OR db.booking_number ILIKE $${pi} OR db.delivery_address ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM delivery_bookings db WHERE ${where}`, params
        );

        const result = await pool.query(
          `SELECT db.*,
                  dz.zone_name,
                  o.order_number,
                  o.total_cents AS order_total_cents,
                  dr.route_number,
                  -- Items summary
                  (SELECT string_agg(oi.product_name, ', ' ORDER BY oi.id) FROM order_items oi WHERE oi.order_id = db.order_id LIMIT 5) AS items_summary,
                  (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = db.order_id) AS item_count,
                  -- Delivery details
                  dd.dwelling_type, dd.floor_number, dd.elevator_required,
                  dd.entry_point, dd.access_notes, dd.parking_type, dd.parking_notes,
                  dd.pathway_confirmed
           FROM delivery_bookings db
           LEFT JOIN delivery_zones dz ON db.zone_id = dz.id
           LEFT JOIN orders o ON db.order_id = o.id
           LEFT JOIN dispatch_routes dr ON db.route_id = dr.id
           LEFT JOIN delivery_details dd ON dd.order_id = db.order_id
           WHERE ${where}
           ORDER BY db.scheduled_start, db.route_order, db.id
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        const deliveries = result.rows.map(row => ({
          id: row.id,
          booking_number: row.booking_number,
          order_id: row.order_id,
          order_number: row.order_number,
          customer_name: row.contact_name,
          address: row.delivery_address,
          city: row.delivery_city,
          postal_code: row.delivery_postal_code,
          zone_id: row.zone_id,
          zone_name: row.zone_name,

          scheduled_date: row.scheduled_date,
          window_start: row.scheduled_start,
          window_end: row.scheduled_end,

          status: row.status,
          driver_id: row.driver_id,
          driver_name: row.driver_name,
          route_id: row.route_id,
          route_number: row.route_number,
          route_sequence: row.route_order,

          estimated_arrival: row.estimated_arrival,
          actual_arrival: row.actual_arrival,
          actual_departure: row.actual_departure,

          items_summary: row.item_count > 0
            ? `${row.item_count} item${row.item_count > 1 ? 's' : ''} — ${row.items_summary || ''}`
            : null,
          weight_kg: row.weight_kg,
          special_instructions: row.delivery_instructions,

          delivery_details: {
            dwelling_type: row.dwelling_type,
            floor: row.floor_number,
            elevator_required: row.elevator_required,
            entry_point: row.entry_point,
            access_notes: row.access_notes,
            parking_type: row.parking_type,
            parking_notes: row.parking_notes,
            pathway_confirmed: row.pathway_confirmed,
            access_code: row.access_code,
            floor_level: row.floor_level,
            has_elevator: row.has_elevator,
          },

          contact_phone: row.contact_phone,
          contact_email: row.contact_email,
          notes: row.notes,
        }));

        res.json({
          success: true,
          date: targetDate,
          deliveries,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/drivers
  // ==========================================================================
  router.get(
    '/drivers',
    authenticate,
    async (req, res, next) => {
      try {
        const { date, status } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const conditions = ['d.is_active = true'];
        const params = [];
        let pi = 1;

        if (status) { conditions.push(`d.status = $${pi++}`); params.push(status); }

        const where = conditions.join(' AND ');

        const result = await pool.query(
          `SELECT d.*,
                  v.name AS vehicle_name, v.plate_number, v.vehicle_type,
                  v.capacity_weight_kg, v.capacity_volume_cbm, v.capacity_items,

                  -- Current route
                  (SELECT dr.id FROM dispatch_routes dr
                   WHERE dr.driver_id = d.id AND dr.route_date = $${pi}
                     AND dr.status IN ('assigned','in_progress')
                   LIMIT 1) AS assigned_route_id,
                  (SELECT dr.route_number FROM dispatch_routes dr
                   WHERE dr.driver_id = d.id AND dr.route_date = $${pi}
                     AND dr.status IN ('assigned','in_progress')
                   LIMIT 1) AS assigned_route_number,
                  (SELECT dr.total_stops FROM dispatch_routes dr
                   WHERE dr.driver_id = d.id AND dr.route_date = $${pi}
                     AND dr.status IN ('assigned','in_progress')
                   LIMIT 1) AS total_stops,
                  (SELECT dr.completed_stops FROM dispatch_routes dr
                   WHERE dr.driver_id = d.id AND dr.route_date = $${pi}
                     AND dr.status IN ('assigned','in_progress')
                   LIMIT 1) AS current_stop_number,

                  -- Today's stats
                  (SELECT COUNT(*)::int FROM delivery_bookings db
                   WHERE db.driver_id = d.id AND db.scheduled_date = $${pi}
                     AND db.status IN ('completed','delivered')) AS completed_today,
                  (SELECT COUNT(*)::int FROM delivery_bookings db
                   WHERE db.driver_id = d.id AND db.scheduled_date = $${pi}
                     AND db.status NOT IN ('completed','delivered','cancelled','failed')) AS remaining_today

           FROM drivers d
           LEFT JOIN vehicles v ON d.vehicle_id = v.id
           WHERE ${where}
           ORDER BY d.status, d.name`,
          [...params, targetDate]
        );

        const drivers = result.rows.map(row => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          status: row.status,
          current_location: row.current_lat ? {
            lat: parseFloat(row.current_lat),
            lng: parseFloat(row.current_lng),
            updated_at: row.location_updated_at,
          } : null,

          assigned_route_id: row.assigned_route_id,
          assigned_route_number: row.assigned_route_number,
          current_stop_number: row.current_stop_number,
          total_stops: row.total_stops,

          completed_today: row.completed_today,
          remaining_today: row.remaining_today,

          vehicle: row.vehicle_id ? {
            id: row.vehicle_id,
            name: row.vehicle_name,
            plate_number: row.plate_number,
            type: row.vehicle_type,
            capacity_weight_kg: row.capacity_weight_kg ? parseFloat(row.capacity_weight_kg) : null,
            capacity_volume_cbm: row.capacity_volume_cbm ? parseFloat(row.capacity_volume_cbm) : null,
            capacity_items: row.capacity_items,
          } : null,
        }));

        res.json({ success: true, date: targetDate, drivers });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/map-data
  // ==========================================================================
  router.get(
    '/map-data',
    authenticate,
    async (req, res, next) => {
      try {
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];

        // Drivers with GPS
        const driversResult = await pool.query(
          `SELECT id, name, status, current_lat, current_lng, location_updated_at
           FROM drivers
           WHERE is_active = true AND current_lat IS NOT NULL`
        );
        const drivers = driversResult.rows.map(d => ({
          id: d.id,
          name: d.name,
          status: d.status,
          location: { lat: parseFloat(d.current_lat), lng: parseFloat(d.current_lng) },
          location_updated_at: d.location_updated_at,
        }));

        // Deliveries with geocoded addresses (use zone center as fallback)
        const deliveriesResult = await pool.query(
          `SELECT db.id, db.status, db.driver_id, db.delivery_postal_code,
                  db.contact_name,
                  dz.center_lat, dz.center_lng, dz.zone_name
           FROM delivery_bookings db
           LEFT JOIN delivery_zones dz ON db.zone_id = dz.id
           WHERE db.scheduled_date = $1
             AND db.status NOT IN ('cancelled','failed')`,
          [targetDate]
        );
        const deliveries = deliveriesResult.rows
          .filter(d => d.center_lat) // only those with coordinates
          .map(d => ({
            id: d.id,
            status: d.status,
            driver_id: d.driver_id,
            customer_name: d.contact_name,
            location: { lat: parseFloat(d.center_lat), lng: parseFloat(d.center_lng) },
            zone_name: d.zone_name,
          }));

        // Zones with boundaries
        const zonesResult = await pool.query(
          `SELECT id, zone_name, zone_code, center_lat, center_lng, radius_km
           FROM delivery_zones
           WHERE is_active = true`
        );
        const zones = zonesResult.rows.map(z => ({
          id: z.id,
          name: z.zone_name,
          code: z.zone_code,
          center: z.center_lat ? { lat: parseFloat(z.center_lat), lng: parseFloat(z.center_lng) } : null,
          radius_km: z.radius_km ? parseFloat(z.radius_km) : null,
        }));

        res.json({ success: true, date: targetDate, drivers, deliveries, zones });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/drivers/:id/status
  // ==========================================================================
  router.put(
    '/drivers/:id/status',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['available', 'on_route', 'break', 'off_duty'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const result = await pool.query(
          'UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *',
          [status, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        res.json({ success: true, driver: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/drivers/:id/location
  // GPS update endpoint (called by driver app)
  // ==========================================================================
  router.put(
    '/drivers/:id/location',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { lat, lng, speed_kmh, heading } = req.body;
        if (lat === undefined || lng === undefined) {
          return res.status(400).json({ success: false, message: 'lat and lng are required' });
        }

        await pool.query(
          `UPDATE drivers SET current_lat = $1, current_lng = $2, location_updated_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [lat, lng, id]
        );

        await pool.query(
          `INSERT INTO driver_location_log (driver_id, lat, lng, speed_kmh, heading)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, lat, lng, speed_kmh || null, heading || null]
        );

        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/deliveries/:id/assign
  // ==========================================================================
  router.put(
    '/deliveries/:id/assign',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { driver_id, route_id, route_order } = req.body;

        if (!driver_id) {
          return res.status(400).json({ success: false, message: 'driver_id is required' });
        }

        // Verify driver
        const driver = await pool.query('SELECT id, name FROM drivers WHERE id = $1 AND is_active = true', [driver_id]);
        if (driver.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        const result = await pool.query(
          `UPDATE delivery_bookings SET
             driver_id = $1, driver_name = $2, route_id = $3, route_order = $4,
             status = CASE WHEN status = 'processing' THEN 'scheduled' ELSE status END,
             updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [driver_id, driver.rows[0].name, route_id || null, route_order || null, id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Delivery not found' });
        }

        res.json({ success: true, delivery: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/dispatch/deliveries/:id/status
  // ==========================================================================
  router.put(
    '/deliveries/:id/status',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const validStatuses = ['scheduled', 'dispatched', 'en_route', 'in_progress', 'completed', 'delivered', 'failed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const updates = ['status = $1', 'updated_at = NOW()'];
        const params = [status];
        let pi = 2;

        if (status === 'completed' || status === 'delivered') {
          updates.push(`completed_at = NOW()`);
          updates.push(`actual_departure = NOW()`);
        }
        if (status === 'in_progress') {
          updates.push(`actual_arrival = NOW()`);
        }
        if (status === 'cancelled') {
          updates.push(`cancelled_at = NOW()`);
          if (notes) { updates.push(`cancellation_reason = $${pi++}`); params.push(notes); }
        }
        if (notes && status !== 'cancelled') {
          updates.push(`notes = COALESCE(notes || E'\\n', '') || $${pi++}`);
          params.push(notes);
        }

        params.push(id);
        const result = await pool.query(
          `UPDATE delivery_bookings SET ${updates.join(', ')} WHERE id = $${pi} RETURNING *`,
          params
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Delivery not found' });
        }

        // Update route completed_stops if completing
        if ((status === 'completed' || status === 'delivered') && result.rows[0].route_id) {
          await pool.query(
            'UPDATE dispatch_routes SET completed_stops = completed_stops + 1, updated_at = NOW() WHERE id = $1',
            [result.rows[0].route_id]
          );
        }

        res.json({ success: true, delivery: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/dispatch/routes
  // ==========================================================================
  router.post(
    '/routes',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { route_date, driver_id, vehicle_id, location_id, delivery_ids, notes } = req.body;

        if (!route_date) {
          return res.status(400).json({ success: false, message: 'route_date is required' });
        }

        // Generate route number
        const seqResult = await pool.query("SELECT nextval('dispatch_route_number_seq') AS seq");
        const seq = String(seqResult.rows[0].seq).padStart(5, '0');
        const routeNumber = `RT-${new Date(route_date).getFullYear()}-${seq}`;

        const totalStops = delivery_ids && Array.isArray(delivery_ids) ? delivery_ids.length : 0;

        const result = await pool.query(
          `INSERT INTO dispatch_routes
             (route_number, route_date, driver_id, vehicle_id, location_id, status, total_stops, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            routeNumber, route_date,
            driver_id || null, vehicle_id || null, location_id || null,
            driver_id ? 'assigned' : 'planned',
            totalStops, notes || null, req.user.id,
          ]
        );
        const route = result.rows[0];

        // Assign deliveries to route
        if (delivery_ids && delivery_ids.length > 0) {
          for (let i = 0; i < delivery_ids.length; i++) {
            await pool.query(
              `UPDATE delivery_bookings SET route_id = $1, route_order = $2, updated_at = NOW()
               WHERE id = $3`,
              [route.id, i + 1, delivery_ids[i]]
            );
          }

          // If driver assigned, also set driver on deliveries
          if (driver_id) {
            const driverResult = await pool.query('SELECT name FROM drivers WHERE id = $1', [driver_id]);
            const driverName = driverResult.rows[0]?.name || null;
            await pool.query(
              `UPDATE delivery_bookings SET driver_id = $1, driver_name = $2, updated_at = NOW()
               WHERE id = ANY($3) AND driver_id IS NULL`,
              [driver_id, driverName, delivery_ids]
            );
          }
        }

        res.status(201).json({ success: true, route });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/routes
  // ==========================================================================
  router.get(
    '/routes',
    authenticate,
    async (req, res, next) => {
      try {
        const { date, status, driver_id } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const conditions = ['dr.route_date = $1'];
        const params = [targetDate];
        let pi = 2;

        if (status) { conditions.push(`dr.status = $${pi++}`); params.push(status); }
        if (driver_id) { conditions.push(`dr.driver_id = $${pi++}`); params.push(parseInt(driver_id, 10)); }

        const result = await pool.query(
          `SELECT dr.*,
                  d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_status,
                  v.name AS vehicle_name, v.plate_number
           FROM dispatch_routes dr
           LEFT JOIN drivers d ON dr.driver_id = d.id
           LEFT JOIN vehicles v ON dr.vehicle_id = v.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY dr.created_at`,
          params
        );

        res.json({ success: true, date: targetDate, routes: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/dispatch/routes/:id
  // ==========================================================================
  router.get(
    '/routes/:id',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const routeResult = await pool.query(
          `SELECT dr.*,
                  d.name AS driver_name, d.phone AS driver_phone,
                  v.name AS vehicle_name, v.plate_number
           FROM dispatch_routes dr
           LEFT JOIN drivers d ON dr.driver_id = d.id
           LEFT JOIN vehicles v ON dr.vehicle_id = v.id
           WHERE dr.id = $1`, [id]
        );
        if (routeResult.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Route not found' });
        }

        const stopsResult = await pool.query(
          `SELECT db.*, dz.zone_name,
                  o.order_number,
                  dd.dwelling_type, dd.floor_number, dd.elevator_required
           FROM delivery_bookings db
           LEFT JOIN delivery_zones dz ON db.zone_id = dz.id
           LEFT JOIN orders o ON db.order_id = o.id
           LEFT JOIN delivery_details dd ON dd.order_id = db.order_id
           WHERE db.route_id = $1
           ORDER BY db.route_order, db.id`, [id]
        );

        res.json({
          success: true,
          route: { ...routeResult.rows[0], stops: stopsResult.rows },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
