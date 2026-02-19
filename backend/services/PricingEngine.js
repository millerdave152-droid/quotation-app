const pool = require('../db');

/**
 * PricingEngine — Calculates optimal channel-specific prices using configurable rules.
 *
 * Rule types:
 *   MIN_MARGIN      — Ensures price >= cost * (1 + margin%). Floors the price.
 *   CHANNEL_MARKUP  — Applies a markup to the base price: price = base * (1 + markup%).
 *   SCHEDULED       — Time-bound price override (starts_at / ends_at on the rule).
 *   VOLUME          — Tier-based discounts for bulk quantities (formula.tiers[]).
 *   COMPETITIVE     — Cap/floor relative to MSRP (formula.msrp_discount_percent).
 *
 * Usage:
 *   const pricingEngine = require('./services/PricingEngine');
 *   const result = await pricingEngine.calculatePrice(productId, channelId);
 *   const batch  = await pricingEngine.recalculateChannel(channelId);
 */
class PricingEngine {
  constructor(dbPool) {
    this.pool = dbPool;
    // Price changes larger than this % require approval
    this.approvalThreshold = 20;
  }

  // ============================================================
  // PRICE CALCULATION
  // ============================================================

  /**
   * Calculate optimal price for a product on a channel.
   *
   * @param {number} productId
   * @param {number} channelId
   * @returns {{ recommendedPrice, basePrice, cost, margin, marginPercent, rulesApplied, warnings }}
   */
  async calculatePrice(productId, channelId) {
    // 1. Get product
    const productResult = await this.pool.query(
      'SELECT id, price, cost, msrp_cents, category, manufacturer, name FROM products WHERE id = $1',
      [productId]
    );
    if (productResult.rows.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }
    const product = productResult.rows[0];
    const basePrice = parseFloat(product.price) || 0;
    const cost = parseFloat(product.cost) || 0;
    const msrp = product.msrp_cents ? product.msrp_cents / 100 : null;

    // 2. Get channel listing constraints
    const listingResult = await this.pool.query(
      'SELECT min_price, max_price, channel_price FROM product_channel_listings WHERE product_id = $1 AND channel_id = $2',
      [productId, channelId]
    );
    const listing = listingResult.rows[0] || {};
    const minPrice = listing.min_price ? parseFloat(listing.min_price) : null;
    const maxPrice = listing.max_price ? parseFloat(listing.max_price) : null;

    // 3. Get applicable pricing rules
    const rules = await this._getApplicableRules(channelId, product);

    // 4. Apply rules in priority order
    let price = basePrice;
    const rulesApplied = [];
    const warnings = [];

    for (const rule of rules) {
      const formula = rule.formula || {};
      const before = price;

      switch (rule.rule_type) {
        case 'MIN_MARGIN': {
          if (cost > 0) {
            const marginPct = parseFloat(formula.min_margin_percent) || 0;
            const minMarginPrice = cost * (1 + marginPct / 100);
            if (price < minMarginPrice) {
              price = minMarginPrice;
              rulesApplied.push({
                ruleId: rule.id,
                ruleName: rule.rule_name,
                type: 'MIN_MARGIN',
                detail: `Floor to ${marginPct}% margin over cost $${cost.toFixed(2)}`,
                priceBefore: before,
                priceAfter: price
              });
            }
          }
          break;
        }

        case 'CHANNEL_MARKUP': {
          const markupPct = parseFloat(formula.markup_percent) || 0;
          if (markupPct !== 0) {
            price = basePrice * (1 + markupPct / 100);
            rulesApplied.push({
              ruleId: rule.id,
              ruleName: rule.rule_name,
              type: 'CHANNEL_MARKUP',
              detail: `${markupPct > 0 ? '+' : ''}${markupPct}% on base $${basePrice.toFixed(2)}`,
              priceBefore: before,
              priceAfter: price
            });
          }
          break;
        }

        case 'SCHEDULED': {
          const scheduledPrice = parseFloat(formula.price);
          if (!isNaN(scheduledPrice) && scheduledPrice > 0) {
            price = scheduledPrice;
            rulesApplied.push({
              ruleId: rule.id,
              ruleName: rule.rule_name,
              type: 'SCHEDULED',
              detail: `Scheduled price $${scheduledPrice.toFixed(2)} (${rule.starts_at} to ${rule.ends_at})`,
              priceBefore: before,
              priceAfter: price
            });
          } else if (formula.discount_percent) {
            const discPct = parseFloat(formula.discount_percent);
            price = basePrice * (1 - discPct / 100);
            rulesApplied.push({
              ruleId: rule.id,
              ruleName: rule.rule_name,
              type: 'SCHEDULED',
              detail: `Scheduled ${discPct}% off base $${basePrice.toFixed(2)}`,
              priceBefore: before,
              priceAfter: price
            });
          }
          break;
        }

        case 'VOLUME': {
          // Volume pricing stored in formula.tiers: [{ min_qty, discount_percent }]
          // For channel pricing we just note the best tier; actual qty-based pricing
          // would be applied at order time
          const tiers = formula.tiers || [];
          if (tiers.length > 0) {
            rulesApplied.push({
              ruleId: rule.id,
              ruleName: rule.rule_name,
              type: 'VOLUME',
              detail: `${tiers.length} volume tier(s) available`,
              tiers
            });
          }
          break;
        }

        case 'COMPETITIVE': {
          if (msrp && formula.msrp_discount_percent !== undefined) {
            const discPct = parseFloat(formula.msrp_discount_percent);
            const competitivePrice = msrp * (1 - discPct / 100);
            if (formula.mode === 'cap' && price > competitivePrice) {
              price = competitivePrice;
            } else if (formula.mode === 'floor' && price < competitivePrice) {
              price = competitivePrice;
            } else if (!formula.mode) {
              // Default: use as target
              price = competitivePrice;
            }
            rulesApplied.push({
              ruleId: rule.id,
              ruleName: rule.rule_name,
              type: 'COMPETITIVE',
              detail: `${discPct}% below MSRP $${msrp.toFixed(2)} (mode: ${formula.mode || 'target'})`,
              priceBefore: before,
              priceAfter: price
            });
          }
          break;
        }
      }
    }

    // 5. Apply rounding
    const roundTo = this._getRoundTo(rules);
    if (roundTo !== null) {
      price = this._roundPrice(price, roundTo);
    }

    // 6. Enforce min/max from product_channel_listings
    if (minPrice !== null && price < minPrice) {
      warnings.push(`Price $${price.toFixed(2)} raised to listing minimum $${minPrice.toFixed(2)}`);
      price = minPrice;
    }
    if (maxPrice !== null && price > maxPrice) {
      warnings.push(`Price $${price.toFixed(2)} capped to listing maximum $${maxPrice.toFixed(2)}`);
      price = maxPrice;
    }

    // Ensure price is never negative
    if (price < 0) {
      warnings.push('Calculated price was negative; set to 0.01');
      price = 0.01;
    }

    // Round to 2 decimal places
    price = Math.round(price * 100) / 100;

    // Calculate margin
    const margin = cost > 0 ? price - cost : null;
    const marginPercent = cost > 0 ? Math.round(((price - cost) / cost) * 10000) / 100 : null;

    return {
      recommendedPrice: price,
      basePrice,
      cost,
      msrp,
      currentChannelPrice: listing.channel_price ? parseFloat(listing.channel_price) : null,
      margin,
      marginPercent,
      rulesApplied,
      warnings
    };
  }

  // ============================================================
  // BATCH RECALCULATION
  // ============================================================

  /**
   * Recalculate prices for all products on a channel.
   *
   * @param {number} channelId
   * @param {object} options - { dryRun: false, approvalThreshold: 20 }
   * @returns {{ updated, pendingApproval, unchanged, errors, total }}
   */
  async recalculateChannel(channelId, options = {}) {
    const dryRun = options.dryRun || false;
    const threshold = options.approvalThreshold ?? this.approvalThreshold;

    // Get all active listings on this channel
    const { rows: listings } = await this.pool.query(`
      SELECT pcl.product_id, pcl.channel_price, pcl.min_price, pcl.max_price
      FROM product_channel_listings pcl
      WHERE pcl.channel_id = $1 AND pcl.listing_status IN ('ACTIVE', 'PENDING', 'DRAFT')
    `, [channelId]);

    let updated = 0;
    let pendingApproval = 0;
    let unchanged = 0;
    let errorCount = 0;
    const changes = [];

    for (const listing of listings) {
      try {
        const result = await this.calculatePrice(listing.product_id, channelId);
        const currentPrice = listing.channel_price ? parseFloat(listing.channel_price) : null;
        const newPrice = result.recommendedPrice;

        // Skip if price hasn't changed
        if (currentPrice !== null && Math.abs(currentPrice - newPrice) < 0.01) {
          unchanged++;
          continue;
        }

        // Check if change exceeds approval threshold
        const changePct = currentPrice && currentPrice > 0
          ? Math.abs((newPrice - currentPrice) / currentPrice) * 100
          : 0;
        const needsApproval = currentPrice !== null && changePct > threshold;

        const status = needsApproval ? 'PENDING_APPROVAL' : 'APPLIED';
        const ruleId = result.rulesApplied.length > 0
          ? result.rulesApplied[result.rulesApplied.length - 1].ruleId
          : null;
        const reason = result.rulesApplied.length > 0
          ? result.rulesApplied.map(r => r.type).join(', ')
          : 'Base price';

        if (!dryRun) {
          // Log the price change
          await this.pool.query(
            `INSERT INTO price_change_log
               (product_id, channel_id, old_price, new_price, rule_id, reason, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [listing.product_id, channelId, currentPrice, newPrice, ruleId, reason, status]
          );

          // If approved, update the listing price immediately
          if (status === 'APPLIED') {
            await this.pool.query(
              `UPDATE product_channel_listings
               SET channel_price = $1, updated_at = NOW()
               WHERE product_id = $2 AND channel_id = $3`,
              [newPrice, listing.product_id, channelId]
            );
            updated++;
          } else {
            pendingApproval++;
          }
        } else {
          if (needsApproval) pendingApproval++;
          else updated++;
        }

        changes.push({
          productId: listing.product_id,
          oldPrice: currentPrice,
          newPrice,
          changePct: Math.round(changePct * 100) / 100,
          status
        });
      } catch (err) {
        errorCount++;
      }
    }

    return {
      updated,
      pendingApproval,
      unchanged,
      errors: errorCount,
      total: listings.length,
      dryRun,
      changes: changes.slice(0, 100) // first 100 for preview
    };
  }

  // ============================================================
  // PRICE PUSH
  // ============================================================

  /**
   * Push recently applied price changes to a channel via adapter.
   *
   * @param {number} channelId
   * @returns {{ pushed, errors }}
   */
  async pushPriceChanges(channelId) {
    // Get products with price changes applied but not yet synced
    const { rows } = await this.pool.query(`
      SELECT DISTINCT pcl.product_id, pcl.channel_sku, pcl.channel_price
      FROM product_channel_listings pcl
      JOIN price_change_log pclog ON pclog.product_id = pcl.product_id AND pclog.channel_id = pcl.channel_id
      WHERE pcl.channel_id = $1
        AND pclog.status = 'APPLIED'
        AND pclog.created_at > COALESCE(pcl.last_price_sync, '1970-01-01')
        AND pcl.listing_status = 'ACTIVE'
    `, [channelId]);

    if (rows.length === 0) {
      return { pushed: 0, message: 'No price changes to push' };
    }

    // Try to use channel adapter
    let pushed = 0;
    const errors = [];

    try {
      const { getInstance } = require('./ChannelManager');
      const manager = await getInstance();
      const adapter = manager.getAdapter(channelId);

      // Push prices by updating offers
      for (const row of rows) {
        try {
          await adapter.pushSingleOffer({
            channel_sku: row.channel_sku,
            product_id: row.product_id,
            price: parseFloat(row.channel_price)
          });
          pushed++;
        } catch (err) {
          errors.push({ productId: row.product_id, sku: row.channel_sku, error: err.message });
        }
      }

      // Update last_price_sync
      if (pushed > 0) {
        const productIds = rows.filter((_, i) => i < pushed).map(r => r.product_id);
        await this.pool.query(
          `UPDATE product_channel_listings
           SET last_price_sync = NOW()
           WHERE channel_id = $1 AND product_id = ANY($2)`,
          [channelId, productIds]
        );
      }
    } catch (err) {
      return { pushed: 0, error: `Adapter unavailable: ${err.message}` };
    }

    return { pushed, errors: errors.length > 0 ? errors : undefined, total: rows.length };
  }

  // ============================================================
  // APPROVALS
  // ============================================================

  /**
   * Get pending price change approvals.
   *
   * @param {number|null} channelId - filter by channel, or null for all
   * @returns {Array}
   */
  async getPendingApprovals(channelId = null) {
    const where = ["pclog.status = 'PENDING_APPROVAL'"];
    const params = [];
    let idx = 1;

    if (channelId) {
      where.push(`pclog.channel_id = $${idx++}`);
      params.push(channelId);
    }

    const { rows } = await this.pool.query(`
      SELECT pclog.*,
             p.name AS product_name, p.sku AS product_sku, p.cost AS product_cost,
             mc.channel_code, mc.channel_name,
             pr.rule_name, pr.rule_type
      FROM price_change_log pclog
      JOIN products p ON p.id = pclog.product_id
      LEFT JOIN marketplace_channels mc ON mc.id = pclog.channel_id
      LEFT JOIN pricing_rules pr ON pr.id = pclog.rule_id
      WHERE ${where.join(' AND ')}
      ORDER BY pclog.created_at DESC
    `, params);

    return rows;
  }

  /**
   * Approve or reject a price change.
   *
   * @param {number} changeId - price_change_log.id
   * @param {number} userId - who is approving
   * @param {boolean} approved - true to approve, false to reject
   * @returns {object} updated log entry
   */
  async approveChange(changeId, userId, approved) {
    const newStatus = approved ? 'APPLIED' : 'REJECTED';

    const { rows } = await this.pool.query(
      `UPDATE price_change_log
       SET status = $1, approved_by = $2
       WHERE id = $3 AND status = 'PENDING_APPROVAL'
       RETURNING *`,
      [newStatus, userId, changeId]
    );

    if (rows.length === 0) {
      throw new Error(`Price change ${changeId} not found or already processed`);
    }

    const change = rows[0];

    // If approved, update the listing price
    if (approved) {
      await this.pool.query(
        `UPDATE product_channel_listings
         SET channel_price = $1, updated_at = NOW()
         WHERE product_id = $2 AND channel_id = $3`,
        [change.new_price, change.product_id, change.channel_id]
      );
    }

    return change;
  }

  /**
   * Bulk approve all pending changes for a channel.
   *
   * @param {number} channelId
   * @param {number} userId
   * @returns {{ approved: number }}
   */
  async bulkApprove(channelId, userId) {
    const pending = await this.getPendingApprovals(channelId);
    let approved = 0;

    for (const change of pending) {
      await this.approveChange(change.id, userId, true);
      approved++;
    }

    return { approved };
  }

  // ============================================================
  // PRICE CHANGE LOG
  // ============================================================

  /**
   * Get price change history for a product or channel.
   *
   * @param {object} filters - { productId, channelId, status, limit, offset }
   * @returns {Array}
   */
  async getChangeLog(filters = {}) {
    const where = [];
    const params = [];
    let idx = 1;

    if (filters.productId) {
      where.push(`pclog.product_id = $${idx++}`);
      params.push(filters.productId);
    }
    if (filters.channelId) {
      where.push(`pclog.channel_id = $${idx++}`);
      params.push(filters.channelId);
    }
    if (filters.status) {
      where.push(`pclog.status = $${idx++}`);
      params.push(filters.status);
    }

    const limit = Math.min(parseInt(filters.limit, 10) || 50, 200);
    const offset = parseInt(filters.offset, 10) || 0;
    params.push(limit, offset);

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await this.pool.query(`
      SELECT pclog.*,
             p.name AS product_name, p.sku AS product_sku,
             mc.channel_code, mc.channel_name,
             pr.rule_name,
             u.email AS approved_by_email
      FROM price_change_log pclog
      JOIN products p ON p.id = pclog.product_id
      LEFT JOIN marketplace_channels mc ON mc.id = pclog.channel_id
      LEFT JOIN pricing_rules pr ON pr.id = pclog.rule_id
      LEFT JOIN users u ON u.id = pclog.approved_by
      ${whereClause}
      ORDER BY pclog.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, params);

    return rows;
  }

  // ============================================================
  // RULE CRUD
  // ============================================================

  /**
   * Get pricing rules, optionally filtered by channel.
   *
   * @param {number|null} channelId
   * @returns {Array}
   */
  async getRules(channelId = null) {
    if (channelId) {
      const { rows } = await this.pool.query(
        'SELECT * FROM pricing_rules WHERE (channel_id = $1 OR channel_id IS NULL) AND active = true ORDER BY priority',
        [channelId]
      );
      return rows;
    }
    const { rows } = await this.pool.query(
      'SELECT * FROM pricing_rules ORDER BY priority'
    );
    return rows;
  }

  /**
   * Create a pricing rule.
   *
   * @param {object} rule
   * @returns {object} created row
   */
  async createRule(rule) {
    const { rows } = await this.pool.query(
      `INSERT INTO pricing_rules
         (channel_id, rule_name, rule_type, conditions, formula, priority, active, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        rule.channelId || null,
        rule.ruleName,
        rule.ruleType,
        JSON.stringify(rule.conditions || {}),
        JSON.stringify(rule.formula || {}),
        rule.priority || 100,
        rule.active !== false,
        rule.startsAt || null,
        rule.endsAt || null
      ]
    );
    return rows[0];
  }

  /**
   * Update a pricing rule.
   *
   * @param {number} ruleId
   * @param {object} updates
   * @returns {object|null}
   */
  async updateRule(ruleId, updates) {
    const sets = [];
    const params = [];
    let idx = 1;

    if (updates.channelId !== undefined) { sets.push(`channel_id = $${idx++}`); params.push(updates.channelId); }
    if (updates.ruleName !== undefined) { sets.push(`rule_name = $${idx++}`); params.push(updates.ruleName); }
    if (updates.ruleType !== undefined) { sets.push(`rule_type = $${idx++}`); params.push(updates.ruleType); }
    if (updates.conditions !== undefined) { sets.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.formula !== undefined) { sets.push(`formula = $${idx++}`); params.push(JSON.stringify(updates.formula)); }
    if (updates.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(updates.priority); }
    if (updates.active !== undefined) { sets.push(`active = $${idx++}`); params.push(updates.active); }
    if (updates.startsAt !== undefined) { sets.push(`starts_at = $${idx++}`); params.push(updates.startsAt); }
    if (updates.endsAt !== undefined) { sets.push(`ends_at = $${idx++}`); params.push(updates.endsAt); }

    if (sets.length === 0) return null;
    params.push(ruleId);

    const { rows } = await this.pool.query(
      `UPDATE pricing_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  /**
   * Delete a pricing rule.
   *
   * @param {number} ruleId
   * @returns {boolean}
   */
  async deleteRule(ruleId) {
    const { rowCount } = await this.pool.query('DELETE FROM pricing_rules WHERE id = $1', [ruleId]);
    return rowCount > 0;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Get pricing rules applicable to a product on a channel.
   * Filters by channel, conditions, and time window.
   * @private
   */
  async _getApplicableRules(channelId, product) {
    const { rows } = await this.pool.query(`
      SELECT * FROM pricing_rules
      WHERE active = true
        AND (channel_id = $1 OR channel_id IS NULL)
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
      ORDER BY priority
    `, [channelId]);

    // Filter by product-level conditions
    return rows.filter(rule => this._matchesProductConditions(rule.conditions, product));
  }

  /**
   * Check if a product matches rule conditions.
   * @private
   */
  _matchesProductConditions(conditions, product) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    if (conditions.category) {
      if ((product.category || '').toLowerCase() !== conditions.category.toLowerCase()) return false;
    }

    if (conditions.brand) {
      if ((product.manufacturer || '').toLowerCase() !== conditions.brand.toLowerCase()) return false;
    }

    if (conditions.price_min !== undefined) {
      if (parseFloat(product.price) < conditions.price_min) return false;
    }

    if (conditions.price_max !== undefined) {
      if (parseFloat(product.price) > conditions.price_max) return false;
    }

    if (conditions.sku_pattern) {
      const regex = new RegExp(conditions.sku_pattern, 'i');
      if (!regex.test(product.sku || '')) return false;
    }

    return true;
  }

  /**
   * Find the rounding preference from applied rules.
   * @private
   * @returns {number|null} e.g. 0.99 means round down to X.99
   */
  _getRoundTo(rules) {
    for (const rule of rules) {
      const formula = rule.formula || {};
      if (formula.round_to !== undefined) return parseFloat(formula.round_to);
    }
    return null;
  }

  /**
   * Round price to nearest charm price.
   * E.g., round_to=0.99: $123.45 -> $122.99, $200.10 -> $199.99
   * E.g., round_to=0.95: $123.45 -> $122.95
   * @private
   */
  _roundPrice(price, roundTo) {
    if (roundTo >= 1) {
      // Round to nearest whole dollar increment
      return Math.round(price / roundTo) * roundTo;
    }
    // Charm pricing: floor the integer part, append the fractional suffix
    const intPart = Math.floor(price);
    const suffix = roundTo; // e.g., 0.99
    // If the price is already below X.suffix, go one dollar lower
    if (price - intPart < suffix) {
      return (intPart - 1) + suffix;
    }
    return intPart + suffix;
  }
}

// Singleton instance
const pricingEngine = new PricingEngine(pool);

module.exports = pricingEngine;
