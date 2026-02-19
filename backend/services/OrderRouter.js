const pool = require('../db');

/**
 * OrderRouter — Routes marketplace orders to the best fulfillment location.
 *
 * Decision logic:
 *  1. Load order items (product_id, quantity)
 *  2. Load all active fulfillment locations
 *  3. Check which locations can fulfill ALL items from their own inventory
 *  4. Apply routing rules (priority order) to narrow/prefer locations
 *  5. Use proximity heuristic (Canadian postal code FSA prefix) if customer address available
 *  6. Fall back to split-shipment if no single location can cover everything
 *  7. Store the routing_decision JSONB on marketplace_orders
 *
 * Usage:
 *   const orderRouter = require('./services/OrderRouter');
 *   const decision = await orderRouter.routeOrder(orderId);
 */
class OrderRouter {
  constructor(dbPool) {
    this.pool = dbPool;
  }

  // ============================================================
  // MAIN ROUTING
  // ============================================================

  /**
   * Route an order to the best fulfillment location(s).
   *
   * @param {number} orderId - marketplace_orders.id
   * @returns {{ locationId, locationName, splitShipment, decisions, reason }}
   */
  async routeOrder(orderId) {
    // 1. Load order + items
    const orderResult = await this.pool.query(
      `SELECT mo.*, mc.channel_code
       FROM marketplace_orders mo
       LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
       WHERE mo.id = $1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }
    const order = orderResult.rows[0];

    const itemsResult = await this.pool.query(
      `SELECT product_id, product_sku, quantity
       FROM marketplace_order_items
       WHERE order_id = $1 AND product_id IS NOT NULL`,
      [orderId]
    );
    const items = itemsResult.rows;

    if (items.length === 0) {
      const decision = {
        locationId: null,
        locationName: null,
        splitShipment: false,
        decisions: [],
        reason: 'No items with product IDs to route'
      };
      await this._storeDecision(orderId, decision);
      return decision;
    }

    // 2. Load active fulfillment locations
    const locations = await this._getActiveLocations();
    if (locations.length === 0) {
      const decision = {
        locationId: null,
        locationName: null,
        splitShipment: false,
        decisions: [],
        reason: 'No active fulfillment locations configured'
      };
      await this._storeDecision(orderId, decision);
      return decision;
    }

    // 3. Check inventory availability at each location
    const locationScores = await this._scoreLocations(locations, items, order);

    // 4. Apply routing rules
    const rules = await this.getRoutingRules();
    const adjustedScores = this._applyRules(locationScores, rules, order);

    // 5. Try single-location fulfillment first
    const fullCoverage = adjustedScores
      .filter(s => s.canFulfillAll)
      .sort((a, b) => b.score - a.score);

    if (fullCoverage.length > 0) {
      const best = fullCoverage[0];
      const decision = {
        locationId: best.locationId,
        locationName: best.locationName,
        splitShipment: false,
        decisions: [{
          locationId: best.locationId,
          locationName: best.locationName,
          items: items.map(i => ({
            productId: i.product_id,
            sku: i.product_sku,
            quantity: i.quantity
          })),
          reason: best.reason
        }],
        reason: `Routed to ${best.locationName}: ${best.reason}`,
        scoredAt: new Date().toISOString(),
        allScores: adjustedScores.map(s => ({
          locationId: s.locationId,
          name: s.locationName,
          score: s.score,
          canFulfillAll: s.canFulfillAll,
          coveredItems: s.coveredItems
        }))
      };
      await this._storeDecision(orderId, decision, best.locationId);
      return decision;
    }

    // 6. Try split shipment
    const splitAllowed = this._isSplitAllowed(rules, order);
    if (splitAllowed) {
      const splitResult = this._findSplitFulfillment(adjustedScores, items, rules);
      if (splitResult) {
        const decision = {
          locationId: splitResult.decisions[0]?.locationId || null,
          locationName: splitResult.decisions[0]?.locationName || null,
          splitShipment: true,
          decisions: splitResult.decisions,
          reason: `Split across ${splitResult.decisions.length} locations`,
          scoredAt: new Date().toISOString(),
          allScores: adjustedScores.map(s => ({
            locationId: s.locationId,
            name: s.locationName,
            score: s.score,
            canFulfillAll: s.canFulfillAll,
            coveredItems: s.coveredItems
          }))
        };
        // Store primary location as the first in the split
        await this._storeDecision(orderId, decision, decision.locationId);
        return decision;
      }
    }

    // 7. No solution — assign to highest-scoring location anyway (partial)
    const best = adjustedScores.sort((a, b) => b.score - a.score)[0];
    const decision = {
      locationId: best ? best.locationId : null,
      locationName: best ? best.locationName : null,
      splitShipment: false,
      decisions: best ? [{
        locationId: best.locationId,
        locationName: best.locationName,
        items: items.map(i => ({
          productId: i.product_id,
          sku: i.product_sku,
          quantity: i.quantity
        })),
        reason: 'Partial fulfillment — insufficient inventory across all locations'
      }] : [],
      reason: 'No location can fully fulfill this order',
      insufficientStock: true,
      scoredAt: new Date().toISOString()
    };
    await this._storeDecision(orderId, decision, decision.locationId);
    return decision;
  }

  /**
   * Route all unrouted orders (those without a routing_decision).
   * @returns {{ routed: number, errors: Array }}
   */
  async routeUnroutedOrders() {
    const { rows } = await this.pool.query(`
      SELECT id FROM marketplace_orders
      WHERE routing_decision IS NULL
        AND mirakl_order_state IN ('WAITING_ACCEPTANCE', 'SHIPPING')
      ORDER BY created_at
    `);

    let routed = 0;
    const errors = [];
    for (const row of rows) {
      try {
        await this.routeOrder(row.id);
        routed++;
      } catch (err) {
        errors.push({ orderId: row.id, error: err.message });
      }
    }
    return { routed, errors, total: rows.length };
  }

  // ============================================================
  // LOCATION INVENTORY
  // ============================================================

  /**
   * Get all products and quantities at a location.
   * @param {number} locationId
   * @returns {Array<{ productId, sku, name, quantity }>}
   */
  async getLocationInventory(locationId) {
    const { rows } = await this.pool.query(`
      SELECT fli.product_id, fli.quantity, fli.updated_at,
             p.sku, p.name, p.stock_quantity AS global_stock
      FROM fulfillment_location_inventory fli
      JOIN products p ON p.id = fli.product_id
      WHERE fli.location_id = $1
      ORDER BY p.name
    `, [locationId]);
    return rows;
  }

  /**
   * UPSERT inventory for a product at a location.
   * @param {number} locationId
   * @param {number} productId
   * @param {number} quantity
   * @returns {object} updated row
   */
  async updateLocationInventory(locationId, productId, quantity) {
    const { rows } = await this.pool.query(`
      INSERT INTO fulfillment_location_inventory (location_id, product_id, quantity, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (location_id, product_id) DO UPDATE
      SET quantity = $3, updated_at = NOW()
      RETURNING *
    `, [locationId, productId, quantity]);
    return rows[0];
  }

  /**
   * Bulk update inventory for a location.
   * @param {number} locationId
   * @param {Array<{ productId, quantity }>} items
   * @returns {{ updated: number }}
   */
  async bulkUpdateLocationInventory(locationId, items) {
    let updated = 0;
    for (const item of items) {
      await this.updateLocationInventory(locationId, item.productId, item.quantity);
      updated++;
    }
    return { updated };
  }

  /**
   * Sync a location's inventory from the global products table.
   * Sets location inventory = global stock for all products that have a listing.
   * @param {number} locationId
   * @returns {{ synced: number }}
   */
  async syncLocationFromGlobal(locationId) {
    const { rowCount } = await this.pool.query(`
      INSERT INTO fulfillment_location_inventory (location_id, product_id, quantity, updated_at)
      SELECT $1, p.id, COALESCE(p.stock_quantity, 0), NOW()
      FROM products p
      WHERE p.sku IS NOT NULL AND p.marketplace_enabled = true
      ON CONFLICT (location_id, product_id) DO UPDATE
      SET quantity = EXCLUDED.quantity, updated_at = NOW()
    `, [locationId]);
    return { synced: rowCount };
  }

  // ============================================================
  // FULFILLMENT LOCATIONS
  // ============================================================

  /**
   * Get all fulfillment locations.
   * @param {boolean} activeOnly
   * @returns {Array}
   */
  async getLocations(activeOnly = true) {
    const where = activeOnly ? 'WHERE active = true' : '';
    const { rows } = await this.pool.query(`
      SELECT fl.*,
        (SELECT COUNT(*) FROM fulfillment_location_inventory fli WHERE fli.location_id = fl.id) AS product_count,
        (SELECT COALESCE(SUM(fli.quantity), 0) FROM fulfillment_location_inventory fli WHERE fli.location_id = fl.id) AS total_units,
        (SELECT COUNT(*) FROM marketplace_orders mo WHERE mo.fulfillment_location_id = fl.id
           AND mo.mirakl_order_state IN ('WAITING_ACCEPTANCE', 'SHIPPING')) AS pending_orders
      FROM fulfillment_locations fl
      ${where}
      ORDER BY fl.name
    `);
    return rows;
  }

  /**
   * Add a fulfillment location.
   * @param {object} data
   * @returns {object} created row
   */
  async addLocation(data) {
    const { rows } = await this.pool.query(`
      INSERT INTO fulfillment_locations
        (name, location_type, address_line1, address_line2, city, province, postal_code,
         latitude, longitude, capacity_orders_per_day, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.name,
      data.locationType || 'STORE',
      data.addressLine1 || null,
      data.addressLine2 || null,
      data.city || null,
      data.province || null,
      data.postalCode || null,
      data.latitude || null,
      data.longitude || null,
      data.capacityOrdersPerDay || 50,
      JSON.stringify(data.config || {})
    ]);
    return rows[0];
  }

  /**
   * Update a fulfillment location.
   * @param {number} locationId
   * @param {object} updates
   * @returns {object|null}
   */
  async updateLocation(locationId, updates) {
    const sets = [];
    const params = [];
    let idx = 1;

    const fieldMap = {
      name: 'name', locationType: 'location_type',
      addressLine1: 'address_line1', addressLine2: 'address_line2',
      city: 'city', province: 'province', postalCode: 'postal_code',
      latitude: 'latitude', longitude: 'longitude',
      capacityOrdersPerDay: 'capacity_orders_per_day',
      active: 'active'
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (updates[jsKey] !== undefined) {
        sets.push(`${dbCol} = $${idx++}`);
        params.push(updates[jsKey]);
      }
    }
    if (updates.config !== undefined) {
      sets.push(`config = $${idx++}`);
      params.push(JSON.stringify(updates.config));
    }

    if (sets.length === 0) return null;
    params.push(locationId);

    const { rows } = await this.pool.query(
      `UPDATE fulfillment_locations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  // ============================================================
  // ROUTING RULES
  // ============================================================

  /**
   * Get all active routing rules, sorted by priority.
   * @returns {Array}
   */
  async getRoutingRules() {
    const { rows } = await this.pool.query(
      'SELECT * FROM routing_rules WHERE active = true ORDER BY priority'
    );
    return rows;
  }

  /**
   * Get all routing rules (including inactive).
   * @returns {Array}
   */
  async getAllRoutingRules() {
    const { rows } = await this.pool.query(
      'SELECT * FROM routing_rules ORDER BY priority'
    );
    return rows;
  }

  /**
   * Add a routing rule.
   * @param {object} rule
   * @returns {object}
   */
  async addRule(rule) {
    const { rows } = await this.pool.query(`
      INSERT INTO routing_rules (rule_name, priority, conditions, action, active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      rule.ruleName,
      rule.priority || 100,
      JSON.stringify(rule.conditions || {}),
      JSON.stringify(rule.action || {}),
      rule.active !== false
    ]);
    return rows[0];
  }

  /**
   * Update a routing rule.
   * @param {number} ruleId
   * @param {object} updates
   * @returns {object|null}
   */
  async updateRule(ruleId, updates) {
    const sets = [];
    const params = [];
    let idx = 1;

    if (updates.ruleName !== undefined) { sets.push(`rule_name = $${idx++}`); params.push(updates.ruleName); }
    if (updates.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(updates.priority); }
    if (updates.conditions !== undefined) { sets.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.action !== undefined) { sets.push(`action = $${idx++}`); params.push(JSON.stringify(updates.action)); }
    if (updates.active !== undefined) { sets.push(`active = $${idx++}`); params.push(updates.active); }

    if (sets.length === 0) return null;
    params.push(ruleId);

    const { rows } = await this.pool.query(
      `UPDATE routing_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  /**
   * Delete a routing rule.
   * @param {number} ruleId
   * @returns {boolean}
   */
  async deleteRule(ruleId) {
    const { rowCount } = await this.pool.query('DELETE FROM routing_rules WHERE id = $1', [ruleId]);
    return rowCount > 0;
  }

  // ============================================================
  // PRIVATE — Scoring & Routing Logic
  // ============================================================

  /** Get active fulfillment locations. @private */
  async _getActiveLocations() {
    const { rows } = await this.pool.query(`
      SELECT fl.*,
        (SELECT COUNT(*) FROM marketplace_orders mo
         WHERE mo.fulfillment_location_id = fl.id
           AND mo.mirakl_order_state = 'SHIPPING'
           AND mo.created_at >= CURRENT_DATE
        ) AS orders_today
      FROM fulfillment_locations fl
      WHERE fl.active = true
      ORDER BY fl.id
    `);
    return rows;
  }

  /**
   * Score each location's ability to fulfill the order items.
   * @private
   * @returns {Array<{ locationId, locationName, canFulfillAll, coveredItems, missingItems, score, reason }>}
   */
  async _scoreLocations(locations, items, order) {
    const productIds = items.map(i => i.product_id);

    // Batch-load all inventory for these products across all locations
    const invResult = await this.pool.query(`
      SELECT location_id, product_id, quantity
      FROM fulfillment_location_inventory
      WHERE product_id = ANY($1)
    `, [productIds]);

    // Build lookup: locationId -> productId -> quantity
    const invMap = new Map();
    for (const row of invResult.rows) {
      if (!invMap.has(row.location_id)) invMap.set(row.location_id, new Map());
      invMap.get(row.location_id).set(row.product_id, row.quantity);
    }

    // Extract customer postal prefix for proximity scoring
    const customerPostal = this._extractPostalPrefix(order);

    const scores = [];

    for (const loc of locations) {
      const locInv = invMap.get(loc.id) || new Map();
      let coveredItems = 0;
      let totalItemCount = items.length;
      const missing = [];

      for (const item of items) {
        const available = locInv.get(item.product_id) || 0;
        if (available >= item.quantity) {
          coveredItems++;
        } else {
          missing.push({
            productId: item.product_id,
            sku: item.product_sku,
            needed: item.quantity,
            available
          });
        }
      }

      const canFulfillAll = coveredItems === totalItemCount;

      // Base score: coverage percentage (0-100)
      let score = Math.round((coveredItems / totalItemCount) * 100);
      const reasons = [];

      // Bonus: warehouse preferred over store (+5)
      if (loc.location_type === 'WAREHOUSE') {
        score += 5;
        reasons.push('warehouse');
      }

      // Bonus: proximity (Canadian postal FSA match +10, first letter +3)
      if (customerPostal && loc.postal_code) {
        const locPrefix = loc.postal_code.replace(/\s/g, '').substring(0, 3).toUpperCase();
        if (customerPostal === locPrefix) {
          score += 10;
          reasons.push('same FSA');
        } else if (customerPostal[0] === locPrefix[0]) {
          score += 3;
          reasons.push('same province postal');
        }
      }

      // Penalty: at capacity (-20)
      const ordersToday = parseInt(loc.orders_today, 10) || 0;
      if (ordersToday >= loc.capacity_orders_per_day) {
        score -= 20;
        reasons.push('at capacity');
      }

      scores.push({
        locationId: loc.id,
        locationName: loc.name,
        locationType: loc.location_type,
        canFulfillAll,
        coveredItems,
        totalItemCount,
        missingItems: missing,
        score,
        reason: canFulfillAll
          ? `Full coverage${reasons.length ? ' (' + reasons.join(', ') + ')' : ''}`
          : `${coveredItems}/${totalItemCount} items${reasons.length ? ' (' + reasons.join(', ') + ')' : ''}`
      });
    }

    return scores;
  }

  /**
   * Apply routing rules to adjust location scores.
   * Rules with lower priority numbers run first.
   * @private
   */
  _applyRules(locationScores, rules, order) {
    for (const rule of rules) {
      const cond = rule.conditions || {};
      const action = rule.action || {};

      // Check if rule conditions match this order
      if (!this._matchesConditions(cond, order)) continue;

      // Apply actions
      for (const locScore of locationScores) {
        // prefer_location: boost score for specific location
        if (action.prefer_location && locScore.locationId === action.prefer_location) {
          locScore.score += 50;
          locScore.reason += `, rule: ${rule.rule_name}`;
        }

        // avoid_location: penalize a location
        if (action.avoid_location && locScore.locationId === action.avoid_location) {
          locScore.score -= 50;
          locScore.reason += `, avoided by: ${rule.rule_name}`;
        }

        // prefer_type: boost all locations of a type
        if (action.prefer_type && locScore.locationType === action.prefer_type) {
          locScore.score += 20;
        }
      }
    }

    return locationScores;
  }

  /**
   * Check whether an order matches a rule's conditions.
   * @private
   */
  _matchesConditions(conditions, order) {
    // Empty conditions = matches everything
    if (!conditions || Object.keys(conditions).length === 0) return true;

    // order_total_min
    if (conditions.order_total_min !== undefined) {
      const total = order.total_price_cents ? order.total_price_cents / 100 : 0;
      if (total < conditions.order_total_min) return false;
    }

    // order_total_max
    if (conditions.order_total_max !== undefined) {
      const total = order.total_price_cents ? order.total_price_cents / 100 : 0;
      if (total > conditions.order_total_max) return false;
    }

    // province (from shipping address)
    if (conditions.province) {
      const addr = order.shipping_address || {};
      const orderProvince = addr.state || addr.province || '';
      if (orderProvince.toUpperCase() !== conditions.province.toUpperCase()) return false;
    }

    // channel
    if (conditions.channel) {
      if ((order.channel_code || '').toUpperCase() !== conditions.channel.toUpperCase()) return false;
    }

    // channel_id
    if (conditions.channel_id) {
      if (order.channel_id !== conditions.channel_id) return false;
    }

    return true;
  }

  /**
   * Check if split shipment is allowed by any matching rule.
   * Default: not allowed unless a rule explicitly enables it.
   * @private
   */
  _isSplitAllowed(rules, order) {
    for (const rule of rules) {
      if (!this._matchesConditions(rule.conditions, order)) continue;
      const action = rule.action || {};
      if (action.split_allowed === true) return true;
      if (action.split_allowed === false) return false;
    }
    return false; // default: no split
  }

  /**
   * Find minimum set of locations to cover all items.
   * Greedy: pick location covering most uncovered items, repeat.
   * @private
   * @returns {{ decisions: Array }|null}
   */
  _findSplitFulfillment(locationScores, items, rules) {
    // Determine max locations allowed
    let maxLocations = 3;
    for (const rule of rules) {
      const action = rule.action || {};
      if (action.max_locations) {
        maxLocations = action.max_locations;
        break;
      }
    }

    const remaining = new Map(); // productId -> remaining qty needed
    for (const item of items) {
      remaining.set(item.product_id, {
        needed: item.quantity,
        sku: item.product_sku
      });
    }

    const decisions = [];
    const usedLocations = new Set();

    // Sort by score descending
    const sorted = [...locationScores].sort((a, b) => b.score - a.score);

    while (remaining.size > 0 && decisions.length < maxLocations) {
      // Find location that covers the most remaining items
      let bestLoc = null;
      let bestCovered = [];
      let bestCount = 0;

      for (const loc of sorted) {
        if (usedLocations.has(loc.locationId)) continue;

        const covered = [];
        for (const [productId, info] of remaining) {
          // Check if this location wasn't in the missingItems list for this product
          const isMissing = loc.missingItems.some(m => m.productId === productId);
          if (!isMissing) {
            covered.push({ productId, sku: info.sku, quantity: info.needed });
          }
        }

        if (covered.length > bestCount) {
          bestCount = covered.length;
          bestCovered = covered;
          bestLoc = loc;
        }
      }

      if (!bestLoc || bestCount === 0) break; // no location can help further

      decisions.push({
        locationId: bestLoc.locationId,
        locationName: bestLoc.locationName,
        items: bestCovered,
        reason: `Covers ${bestCount} item(s)`
      });

      usedLocations.add(bestLoc.locationId);

      // Remove fulfilled items from remaining
      for (const item of bestCovered) {
        remaining.delete(item.productId);
      }
    }

    // Check if all items are covered
    if (remaining.size > 0) return null; // can't cover everything even with splits

    return { decisions };
  }

  /**
   * Extract Canadian postal FSA prefix (first 3 chars) from order shipping address.
   * @private
   */
  _extractPostalPrefix(order) {
    const addr = order.shipping_address;
    if (!addr) return null;
    const postal = addr.zip_code || addr.postal_code || '';
    const cleaned = postal.replace(/\s/g, '').toUpperCase();
    return cleaned.length >= 3 ? cleaned.substring(0, 3) : null;
  }

  /**
   * Store routing decision on the order.
   * @private
   */
  async _storeDecision(orderId, decision, locationId = null) {
    await this.pool.query(
      `UPDATE marketplace_orders
       SET routing_decision = $1, fulfillment_location_id = $2
       WHERE id = $3`,
      [JSON.stringify(decision), locationId, orderId]
    );
  }
}

// Singleton instance
const orderRouter = new OrderRouter(pool);

module.exports = orderRouter;
