/**
 * Inventory Reporting & Alert System
 * Stock reports, alert rules CRUD, alert management, and background alert checker.
 * @module routes/inventory-reports
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { ApiError } = require('../middleware/errorHandler');

const VALID_RULE_TYPES = ['low_stock', 'out_of_stock', 'overstock', 'stuck_inventory'];
const VALID_SCOPES = ['all', 'category', 'brand', 'location'];

function init({ pool }) {
  const router = express.Router();

  // ========================================================================
  // BACKGROUND JOB: Check inventory alerts
  // ========================================================================

  async function checkInventoryAlerts() {
    const rulesResult = await pool.query(
      'SELECT * FROM inventory_alert_rules WHERE is_active = true'
    );

    let created = 0;
    let autoResolved = 0;

    for (const rule of rulesResult.rows) {
      // Build scope filter
      let scopeJoin = '';
      let scopeWhere = '';
      const params = [];
      let pi = 1;

      if (rule.applies_to === 'category' && rule.category_id) {
        scopeWhere = ` AND p.category_id = $${pi++}`;
        params.push(rule.category_id);
      } else if (rule.applies_to === 'brand' && rule.brand_id) {
        scopeWhere = ` AND p.manufacturer = $${pi++}`;
        params.push(rule.brand_id); // stored as manufacturer string match
      } else if (rule.applies_to === 'location' && rule.location_id) {
        scopeWhere = ` AND li.location_id = $${pi++}`;
        params.push(rule.location_id);
      }

      let query;

      switch (rule.rule_type) {
        case 'low_stock':
          query = `
            SELECT li.product_id, li.location_id,
                   (li.quantity_on_hand - li.quantity_reserved) AS quantity_available,
                   p.name AS product_name
            FROM location_inventory li
            JOIN products p ON li.product_id = p.id
            WHERE (li.quantity_on_hand - li.quantity_reserved) <= $${pi}
              AND (li.quantity_on_hand - li.quantity_reserved) > 0
              ${scopeWhere}`;
          params.push(rule.threshold_quantity || 0);
          break;

        case 'out_of_stock':
          query = `
            SELECT li.product_id, li.location_id,
                   (li.quantity_on_hand - li.quantity_reserved) AS quantity_available,
                   p.name AS product_name
            FROM location_inventory li
            JOIN products p ON li.product_id = p.id
            WHERE (li.quantity_on_hand - li.quantity_reserved) <= 0
              ${scopeWhere}`;
          break;

        case 'overstock':
          query = `
            SELECT li.product_id, li.location_id,
                   li.quantity_on_hand AS quantity_available,
                   p.name AS product_name
            FROM location_inventory li
            JOIN products p ON li.product_id = p.id
            WHERE li.quantity_on_hand > $${pi}
              ${scopeWhere}`;
          params.push(rule.threshold_quantity || 999999);
          break;

        case 'stuck_inventory':
          query = `
            SELECT li.product_id, li.location_id,
                   li.quantity_on_hand AS quantity_available,
                   p.name AS product_name
            FROM location_inventory li
            JOIN products p ON li.product_id = p.id
            WHERE li.quantity_on_hand > $${pi}
              AND p.id NOT IN (
                SELECT DISTINCT oi.product_id
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.created_at > NOW() - INTERVAL '1 day' * $${pi + 1}
              )
              ${scopeWhere}`;
          params.push(rule.threshold_quantity || 0);
          params.push(rule.threshold_days || 90);
          break;

        default:
          continue;
      }

      const products = await pool.query(query, params);

      const alertedProductIds = new Set();

      for (const product of products.rows) {
        alertedProductIds.add(`${product.product_id}-${product.location_id}`);

        // Check if active alert already exists
        const existing = await pool.query(
          `SELECT id FROM inventory_alerts
           WHERE product_id = $1 AND rule_id = $2 AND status = 'active'
             AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))`,
          [product.product_id, rule.id, product.location_id]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO inventory_alerts
               (rule_id, product_id, location_id, alert_type, current_quantity, threshold_quantity)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              rule.id, product.product_id, product.location_id,
              rule.rule_type, product.quantity_available,
              rule.threshold_quantity || null,
            ]
          );
          created++;
        }
      }

      // Auto-resolve alerts that no longer match
      const activeAlerts = await pool.query(
        "SELECT id, product_id, location_id FROM inventory_alerts WHERE rule_id = $1 AND status = 'active'",
        [rule.id]
      );
      for (const alert of activeAlerts.rows) {
        const key = `${alert.product_id}-${alert.location_id}`;
        if (!alertedProductIds.has(key)) {
          await pool.query(
            "UPDATE inventory_alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1",
            [alert.id]
          );
          autoResolved++;
        }
      }

      // Update last triggered
      await pool.query(
        'UPDATE inventory_alert_rules SET last_triggered_at = NOW() WHERE id = $1',
        [rule.id]
      );
    }

    return { created, autoResolved, rulesChecked: rulesResult.rows.length };
  }

  // ========================================================================
  // ALERT RULES CRUD
  // ========================================================================

  // POST /api/inventory/alert-rules
  router.post(
    '/alert-rules',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const {
          name, rule_type, applies_to,
          category_id, brand_id, location_id,
          threshold_quantity, threshold_days, threshold_value,
          notify_emails, notify_slack_channel,
        } = req.body;

        const errors = [];
        if (!name || !name.trim()) errors.push('name is required');
        if (!rule_type || !VALID_RULE_TYPES.includes(rule_type)) {
          errors.push(`rule_type must be one of: ${VALID_RULE_TYPES.join(', ')}`);
        }
        if (applies_to && !VALID_SCOPES.includes(applies_to)) {
          errors.push(`applies_to must be one of: ${VALID_SCOPES.join(', ')}`);
        }
        if (rule_type === 'low_stock' && (threshold_quantity === undefined || threshold_quantity === null)) {
          errors.push('threshold_quantity required for low_stock rules');
        }
        if (rule_type === 'stuck_inventory' && !threshold_days) {
          errors.push('threshold_days required for stuck_inventory rules');
        }
        if (errors.length > 0) {
          throw ApiError.badRequest('Validation failed', errors);
        }

        const result = await pool.query(
          `INSERT INTO inventory_alert_rules
             (name, rule_type, applies_to, category_id, brand_id, location_id,
              threshold_quantity, threshold_days, threshold_value,
              notify_emails, notify_slack_channel, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            name.trim(), rule_type, applies_to || 'all',
            category_id || null, brand_id || null, location_id || null,
            threshold_quantity || null, threshold_days || null, threshold_value || null,
            notify_emails || null, notify_slack_channel || null,
            req.user.id,
          ]
        );

        res.status(201).json({ success: true, rule: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/inventory/alert-rules
  router.get(
    '/alert-rules',
    authenticate,
    async (req, res, next) => {
      try {
        const result = await pool.query(
          `SELECT r.*,
                  u.first_name || ' ' || u.last_name AS created_by_name,
                  (SELECT COUNT(*)::int FROM inventory_alerts a WHERE a.rule_id = r.id AND a.status = 'active') AS active_alert_count
           FROM inventory_alert_rules r
           LEFT JOIN users u ON r.created_by = u.id
           ORDER BY r.created_at DESC`
        );
        res.json({ success: true, rules: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/inventory/alert-rules/:id
  router.put(
    '/alert-rules/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const current = await pool.query('SELECT * FROM inventory_alert_rules WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          throw ApiError.notFound('Alert rule');
        }

        const merged = { ...current.rows[0], ...req.body };

        const result = await pool.query(
          `UPDATE inventory_alert_rules SET
             name = $1, rule_type = $2, applies_to = $3,
             category_id = $4, brand_id = $5, location_id = $6,
             threshold_quantity = $7, threshold_days = $8, threshold_value = $9,
             notify_emails = $10, notify_slack_channel = $11, is_active = $12
           WHERE id = $13
           RETURNING *`,
          [
            merged.name, merged.rule_type, merged.applies_to,
            merged.category_id || null, merged.brand_id || null, merged.location_id || null,
            merged.threshold_quantity || null, merged.threshold_days || null, merged.threshold_value || null,
            merged.notify_emails || null, merged.notify_slack_channel || null,
            merged.is_active !== false,
            id,
          ]
        );

        res.json({ success: true, rule: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/inventory/alert-rules/:id
  router.delete(
    '/alert-rules/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM inventory_alert_rules WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
          throw ApiError.notFound('Alert rule');
        }
        res.json({ success: true, message: 'Alert rule deleted' });
      } catch (err) {
        next(err);
      }
    }
  );

  // ========================================================================
  // ALERTS
  // ========================================================================

  // GET /api/inventory/alerts
  router.get(
    '/alerts',
    authenticate,
    async (req, res, next) => {
      try {
        const { status, alert_type, location_id, product_id, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (status) { conditions.push(`a.status = $${pi++}`); params.push(status); }
        else { conditions.push("a.status = 'active'"); } // default to active
        if (alert_type) { conditions.push(`a.alert_type = $${pi++}`); params.push(alert_type); }
        if (location_id) { conditions.push(`a.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }
        if (product_id) { conditions.push(`a.product_id = $${pi++}`); params.push(parseInt(product_id, 10)); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM inventory_alerts a ${where}`, params
        );

        const result = await pool.query(
          `SELECT a.*,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  l.name AS location_name,
                  r.name AS rule_name,
                  u.first_name || ' ' || u.last_name AS acknowledged_by_name
           FROM inventory_alerts a
           JOIN products p ON a.product_id = p.id
           LEFT JOIN locations l ON a.location_id = l.id
           LEFT JOIN inventory_alert_rules r ON a.rule_id = r.id
           LEFT JOIN users u ON a.acknowledged_by = u.id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Summary counts
        const summaryResult = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'active')::int AS active,
             COUNT(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged,
             COUNT(*) FILTER (WHERE alert_type = 'low_stock' AND status = 'active')::int AS low_stock,
             COUNT(*) FILTER (WHERE alert_type = 'out_of_stock' AND status = 'active')::int AS out_of_stock,
             COUNT(*) FILTER (WHERE alert_type = 'overstock' AND status = 'active')::int AS overstock,
             COUNT(*) FILTER (WHERE alert_type = 'stuck_inventory' AND status = 'active')::int AS stuck_inventory
           FROM inventory_alerts`
        );

        res.json({
          success: true,
          alerts: result.rows,
          summary: summaryResult.rows[0],
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

  // PUT /api/inventory/alerts/:id/acknowledge
  router.put(
    '/alerts/:id/acknowledge',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const current = await pool.query("SELECT id, status FROM inventory_alerts WHERE id = $1", [id]);
        if (current.rows.length === 0) {
          throw ApiError.notFound('Alert');
        }
        if (current.rows[0].status !== 'active') {
          throw ApiError.badRequest(`Alert is already '${current.rows[0].status}'`);
        }

        const result = await pool.query(
          `UPDATE inventory_alerts SET
             status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
           WHERE id = $2 RETURNING *`,
          [req.user.id, id]
        );

        res.json({ success: true, alert: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/inventory/alerts/:id/resolve
  router.put(
    '/alerts/:id/resolve',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const result = await pool.query(
          `UPDATE inventory_alerts SET status = 'resolved', resolved_at = NOW()
           WHERE id = $1 AND status != 'resolved' RETURNING *`,
          [id]
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Alert not found or already resolved');
        }
        res.json({ success: true, alert: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/inventory/alerts/check — trigger background check manually
  router.post(
    '/alerts/check',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const stats = await checkInventoryAlerts();
        res.json({ success: true, message: 'Alert check completed', ...stats });
      } catch (err) {
        next(err);
      }
    }
  );

  // ========================================================================
  // STOCK REPORTS
  // ========================================================================

  // GET /api/inventory/reports/stock-levels
  router.get(
    '/reports/stock-levels',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id, category_id, brand, search, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (location_id) { conditions.push(`li.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }
        if (category_id) { conditions.push(`p.category_id = $${pi++}`); params.push(parseInt(category_id, 10)); }
        if (brand) { conditions.push(`p.manufacturer ILIKE $${pi++}`); params.push(`%${brand}%`); }
        if (search) {
          conditions.push(`(p.name ILIKE $${pi} OR p.sku ILIKE $${pi} OR p.model ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(DISTINCT p.id)::int
           FROM products p
           LEFT JOIN location_inventory li ON li.product_id = p.id
           ${where}`,
          params
        );

        const result = await pool.query(
          `SELECT p.id AS product_id, p.name, p.sku, p.model, p.manufacturer,
                  p.category, p.price, p.cost,
                  COALESCE(SUM(li.quantity_on_hand), 0)::int AS total_on_hand,
                  COALESCE(SUM(li.quantity_reserved), 0)::int AS total_reserved,
                  COALESCE(SUM(li.quantity_on_hand - li.quantity_reserved), 0)::int AS total_available,
                  COUNT(DISTINCT li.location_id)::int AS locations_stocked,
                  COALESCE(SUM(li.quantity_on_hand) * p.cost, 0) AS stock_value_cost,
                  COALESCE(SUM(li.quantity_on_hand) * p.price, 0) AS stock_value_retail,
                  MIN(li.reorder_point) AS reorder_point,
                  CASE
                    WHEN COALESCE(SUM(li.quantity_on_hand - li.quantity_reserved), 0) <= 0 THEN 'out_of_stock'
                    WHEN MIN(li.reorder_point) IS NOT NULL
                         AND COALESCE(SUM(li.quantity_on_hand - li.quantity_reserved), 0) <= MIN(li.reorder_point) THEN 'low_stock'
                    ELSE 'in_stock'
                  END AS stock_status
           FROM products p
           LEFT JOIN location_inventory li ON li.product_id = p.id
           ${where}
           GROUP BY p.id, p.name, p.sku, p.model, p.manufacturer, p.category, p.price, p.cost
           ORDER BY total_available ASC, p.name
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Totals
        const totalsResult = await pool.query(
          `SELECT
             COUNT(DISTINCT p.id)::int AS total_products,
             COALESCE(SUM(li.quantity_on_hand), 0)::int AS total_units_on_hand,
             COALESCE(SUM(li.quantity_reserved), 0)::int AS total_units_reserved,
             COALESCE(SUM(li.quantity_on_hand * p.cost), 0)::numeric(12,2) AS total_value_cost,
             COALESCE(SUM(li.quantity_on_hand * p.price), 0)::numeric(12,2) AS total_value_retail
           FROM products p
           LEFT JOIN location_inventory li ON li.product_id = p.id
           ${where}`,
          params
        );

        res.json({
          success: true,
          products: result.rows,
          totals: totalsResult.rows[0],
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

  // GET /api/inventory/reports/low-stock
  router.get(
    '/reports/low-stock',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id } = req.query;

        const conditions = [
          'li.reorder_point IS NOT NULL',
          '(li.quantity_on_hand - li.quantity_reserved) <= li.reorder_point',
          '(li.quantity_on_hand - li.quantity_reserved) > 0',
        ];
        const params = [];
        let pi = 1;

        if (location_id) {
          conditions.push(`li.location_id = $${pi++}`);
          params.push(parseInt(location_id, 10));
        }

        const result = await pool.query(
          `SELECT li.*,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  p.manufacturer, p.cost, p.price,
                  l.name AS location_name, l.code AS location_code,
                  (li.quantity_on_hand - li.quantity_reserved) AS quantity_available,
                  li.reorder_point - (li.quantity_on_hand - li.quantity_reserved) AS units_below_reorder
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY units_below_reorder DESC, p.name`,
          params
        );

        res.json({
          success: true,
          count: result.rows.length,
          products: result.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/inventory/reports/out-of-stock
  router.get(
    '/reports/out-of-stock',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id } = req.query;

        const conditions = ['(li.quantity_on_hand - li.quantity_reserved) <= 0'];
        const params = [];
        let pi = 1;

        if (location_id) {
          conditions.push(`li.location_id = $${pi++}`);
          params.push(parseInt(location_id, 10));
        }

        const result = await pool.query(
          `SELECT li.*,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  p.manufacturer, p.cost, p.price,
                  l.name AS location_name, l.code AS location_code,
                  (li.quantity_on_hand - li.quantity_reserved) AS quantity_available
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY p.name`,
          params
        );

        res.json({
          success: true,
          count: result.rows.length,
          products: result.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/inventory/reports/valuation
  router.get(
    '/reports/valuation',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id } = req.query;

        const locFilter = location_id ? 'WHERE li.location_id = $1' : '';
        const params = location_id ? [parseInt(location_id, 10)] : [];

        // By location
        const byLocation = await pool.query(
          `SELECT l.id AS location_id, l.name AS location_name,
                  COUNT(DISTINCT li.product_id)::int AS product_count,
                  SUM(li.quantity_on_hand)::int AS total_units,
                  SUM(li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost,
                  SUM(li.quantity_on_hand * p.price)::numeric(12,2) AS value_at_retail
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           ${locFilter}
           GROUP BY l.id, l.name
           ORDER BY value_at_cost DESC`,
          params
        );

        // By category
        const byCategory = await pool.query(
          `SELECT p.category,
                  COUNT(DISTINCT li.product_id)::int AS product_count,
                  SUM(li.quantity_on_hand)::int AS total_units,
                  SUM(li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost,
                  SUM(li.quantity_on_hand * p.price)::numeric(12,2) AS value_at_retail
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           ${locFilter}
           GROUP BY p.category
           ORDER BY value_at_cost DESC`,
          params
        );

        // By manufacturer
        const byManufacturer = await pool.query(
          `SELECT p.manufacturer,
                  COUNT(DISTINCT li.product_id)::int AS product_count,
                  SUM(li.quantity_on_hand)::int AS total_units,
                  SUM(li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost,
                  SUM(li.quantity_on_hand * p.price)::numeric(12,2) AS value_at_retail
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           ${locFilter}
           GROUP BY p.manufacturer
           ORDER BY value_at_cost DESC`,
          params
        );

        // Grand totals
        const totals = await pool.query(
          `SELECT
             COUNT(DISTINCT li.product_id)::int AS total_products,
             SUM(li.quantity_on_hand)::int AS total_units,
             SUM(li.quantity_on_hand * p.cost)::numeric(12,2) AS total_value_cost,
             SUM(li.quantity_on_hand * p.price)::numeric(12,2) AS total_value_retail,
             SUM(li.quantity_on_hand * (p.price - p.cost))::numeric(12,2) AS total_potential_margin
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           ${locFilter}`,
          params
        );

        res.json({
          success: true,
          totals: totals.rows[0],
          by_location: byLocation.rows,
          by_category: byCategory.rows,
          by_manufacturer: byManufacturer.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
