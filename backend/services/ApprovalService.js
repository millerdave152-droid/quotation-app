/**
 * TeleTime POS - Price Override Approval Service
 *
 * Core business logic for the tiered price-override approval workflow.
 * Handles request creation, approval/denial, counter-offers, token
 * consumption, manager availability, and audit history.
 *
 * Tier summary (configurable via approval_tier_settings):
 *   1 - Salesperson Discretion   0-10%   auto-approved
 *   2 - Standard Override       10-25%   manager, 180s timeout
 *   3 - Deep Override           25-50%   senior_manager, 300s timeout
 *   4 - Below Cost              50%+     admin, no timeout, reason required
 */

const crypto = require('crypto');

// Role hierarchy — higher index = more authority
const ROLE_HIERARCHY = ['user', 'salesperson', 'manager', 'senior_manager', 'admin'];

class ApprovalService {
  constructor(pool) {
    this.pool = pool;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * True when `userRole` has equal or greater authority than `requiredRole`.
   */
  _roleAtLeast(userRole, requiredRole) {
    const userIdx = ROLE_HIERARCHY.indexOf(userRole);
    const reqIdx = ROLE_HIERARCHY.indexOf(requiredRole);
    // Unknown roles get no authority; 'salesperson' maps to tier-1 auto-approve
    if (userIdx === -1 || reqIdx === -1) return false;
    return userIdx >= reqIdx;
  }

  /**
   * Determine which tier a given discount percentage falls into.
   * Returns the tier row or null if no tier matches.
   */
  async _resolveTier(discountPercent) {
    const { rows } = await this.pool.query(
      `SELECT * FROM approval_tier_settings
       WHERE $1 >= min_discount_percent AND $1 <= max_discount_percent
       ORDER BY tier
       LIMIT 1`,
      [discountPercent]
    );
    return rows[0] || null;
  }

  /**
   * Look up a product's current price and cost.
   */
  async _getProduct(productId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT id, name, sku, price, cost FROM products WHERE id = $1`,
      [productId]
    );
    if (rows.length === 0) throw new Error(`Product ${productId} not found`);
    return rows[0];
  }

  /**
   * Look up a user with role info.
   */
  async _getUser(userId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT id, first_name, last_name, email, role FROM users WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) throw new Error(`User ${userId} not found`);
    return rows[0];
  }

  /**
   * Check the manager's daily override count against their limit in
   * manager_pins (if a record exists).  Returns true if allowed.
   */
  async _checkDailyLimit(managerId, client = this.pool) {
    const { rows } = await client.query(
      `SELECT max_daily_overrides, override_count_today, last_override_date
       FROM manager_pins
       WHERE user_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [managerId]
    );
    // No PIN record → no daily limit enforced
    if (rows.length === 0) return true;
    const pin = rows[0];
    if (pin.max_daily_overrides === null) return true;

    const today = new Date().toISOString().split('T')[0];
    const lastDate = pin.last_override_date
      ? new Date(pin.last_override_date).toISOString().split('T')[0]
      : null;

    // Counter resets on a new day
    const usedToday = lastDate === today ? (pin.override_count_today || 0) : 0;
    return usedToday < pin.max_daily_overrides;
  }

  /**
   * Increment the manager's daily override counter in manager_pins.
   */
  async _incrementDailyCount(managerId, client = this.pool) {
    const today = new Date().toISOString().split('T')[0];
    await client.query(
      `UPDATE manager_pins
       SET override_count_today = CASE
             WHEN last_override_date = $2::date THEN override_count_today + 1
             ELSE 1
           END,
           last_override_date = $2::date,
           last_used_at = NOW()
       WHERE user_id = $1 AND is_active = TRUE`,
      [managerId, today]
    );
  }

  /**
   * Compute milliseconds between two timestamps.
   */
  _msBetween(a, b) {
    return Math.round(Math.abs(new Date(b) - new Date(a)));
  }

  /**
   * Check if a user has sufficient authority, either directly or via delegation.
   * Returns { authorized, user, delegation, effectiveRole }.
   */
  async _checkAuthority(userId, requiredRole, requiredTier, client = this.pool) {
    const user = await this._getUser(userId, client);

    // Check own role first
    if (this._roleAtLeast(user.role, requiredRole)) {
      return { authorized: true, user, delegation: null, effectiveRole: user.role };
    }

    // Fall back to active delegations
    const { rows } = await client.query(
      `SELECT md.*, u.role AS delegator_role,
              CONCAT(u.first_name, ' ', u.last_name) AS delegator_name
       FROM manager_delegations md
       JOIN users u ON u.id = md.delegator_id
       WHERE md.delegate_id = $1
         AND md.active = TRUE
         AND md.starts_at <= NOW()
         AND md.expires_at > NOW()
         AND md.max_tier >= $2
       ORDER BY u.role DESC
       LIMIT 1`,
      [userId, requiredTier]
    );

    if (rows.length > 0) {
      const delegation = rows[0];
      if (this._roleAtLeast(delegation.delegator_role, requiredRole)) {
        return {
          authorized: true,
          user,
          delegation,
          effectiveRole: delegation.delegator_role,
        };
      }
    }

    return { authorized: false, user, delegation: null, effectiveRole: user.role };
  }

  // ==========================================================================
  // CREATE REQUEST
  // ==========================================================================

  /**
   * Create a price-override approval request.
   *
   * If the discount falls within Tier 1 (salesperson discretion), the
   * request is auto-approved immediately — no manager interaction required.
   *
   * @param {object} params
   * @returns {object} The created request row, plus { autoApproved: boolean }
   */
  async createRequest({ cartId, cartItemId, productId, salespersonId, managerId = null, requestedPrice }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Look up product pricing
      const product = await this._getProduct(productId, client);
      const originalPrice = parseFloat(product.price);
      const cost = parseFloat(product.cost || 0);

      if (requestedPrice < 0) {
        throw new Error('Requested price cannot be negative');
      }
      if (requestedPrice > originalPrice) {
        throw new Error('Requested price cannot exceed the original price');
      }

      // 2. Calculate discount & margin
      const discountPct = originalPrice > 0
        ? ((originalPrice - requestedPrice) / originalPrice) * 100
        : 0;
      const marginAmount = requestedPrice - cost;
      const marginPercent = requestedPrice > 0
        ? ((requestedPrice - cost) / requestedPrice) * 100
        : -100;

      // 3. Determine tier
      const tier = await this._resolveTier(discountPct);
      if (!tier) {
        throw new Error(`No approval tier covers a ${discountPct.toFixed(2)}% discount`);
      }

      // 4. Enforce margin floor (if tier defines one)
      if (tier.min_margin_percent !== null && marginPercent < parseFloat(tier.min_margin_percent)) {
        if (!tier.allows_below_cost) {
          throw new Error(
            `Tier ${tier.tier} (${tier.name}) requires at least ${tier.min_margin_percent}% margin. ` +
            `This price gives ${marginPercent.toFixed(2)}%`
          );
        }
      }

      // 5. Below-cost guard
      if (requestedPrice < cost && !tier.allows_below_cost) {
        throw new Error(
          `Tier ${tier.tier} (${tier.name}) does not allow below-cost pricing. ` +
          `Cost is $${cost.toFixed(2)}, requested price is $${requestedPrice.toFixed(2)}`
        );
      }

      // 6. Tier 1 — auto-approve
      if (tier.tier === 1) {
        const token = crypto.randomBytes(32).toString('hex');
        const { rows } = await client.query(
          `INSERT INTO approval_requests (
             cart_id, cart_item_id, product_id, salesperson_id, manager_id,
             status, tier,
             original_price, requested_price, approved_price,
             cost_at_time, margin_amount, margin_percent,
             method, approval_token, token_used, token_expires_at,
             response_time_ms, responded_at
           ) VALUES (
             $1, $2, $3, $4, $4,
             'approved', $5,
             $6, $7, $7,
             $8, $9, $10,
             'pin', $11, FALSE, NOW() + INTERVAL '10 minutes',
             0, NOW()
           ) RETURNING *`,
          [
            cartId, cartItemId, productId, salespersonId,
            tier.tier,
            originalPrice, requestedPrice,
            cost, marginAmount, marginPercent,
            token,
          ]
        );

        await client.query('COMMIT');
        return { ...rows[0], autoApproved: true, tierName: tier.name };
      }

      // 7. Tier 2-4 — create pending request
      if (tier.requires_reason_code) {
        // Reason enforcement happens at approval time; just flag it here
      }

      const { rows } = await client.query(
        `INSERT INTO approval_requests (
           cart_id, cart_item_id, product_id, salesperson_id, manager_id,
           status, tier,
           original_price, requested_price,
           cost_at_time, margin_amount, margin_percent
         ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          cartId, cartItemId, productId, salespersonId, managerId,
          tier.tier,
          originalPrice, requestedPrice,
          cost, marginAmount, marginPercent,
        ]
      );

      await client.query('COMMIT');
      return {
        ...rows[0],
        autoApproved: false,
        tierName: tier.name,
        timeoutSeconds: tier.timeout_seconds,
        requiresReasonCode: tier.requires_reason_code,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // APPROVE REQUEST
  // ==========================================================================

  /**
   * Approve a pending (or countered) approval request.
   *
   * @param {object}  params
   * @param {number}  params.requestId
   * @param {number}  params.managerId
   * @param {string}  params.method         'remote' | 'pin'
   * @param {number}  [params.approvedPrice] Override the approved price (used by counter-offer acceptance)
   * @returns {object} The updated request row with approval token
   */
  async approveRequest({ requestId, managerId, method = 'remote', approvedPrice = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Load request (lock row)
      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      if (!request) throw new Error(`Approval request ${requestId} not found`);
      if (request.status !== 'pending' && request.status !== 'countered') {
        throw new Error(`Request is '${request.status}', expected 'pending' or 'countered'`);
      }

      // 2. Authorization — manager role must meet tier requirement (or delegation)
      const { rows: [tierSetting] } = await client.query(
        `SELECT * FROM approval_tier_settings WHERE tier = $1`,
        [request.tier]
      );
      if (!tierSetting) throw new Error(`Tier ${request.tier} configuration not found`);

      const auth = await this._checkAuthority(managerId, tierSetting.required_role, request.tier, client);
      if (!auth.authorized) {
        throw new Error(
          `Insufficient authority: tier ${request.tier} (${tierSetting.name}) requires ` +
          `'${tierSetting.required_role}' role, but ${auth.user.first_name} ${auth.user.last_name} is '${auth.user.role}'`
        );
      }

      // 3. Daily limit check
      const withinLimit = await this._checkDailyLimit(managerId, client);
      if (!withinLimit) {
        throw new Error('Daily override limit reached for this manager');
      }

      // 4. Determine final approved price
      const finalPrice = approvedPrice !== null
        ? approvedPrice
        : parseFloat(request.requested_price);

      // Re-calc margin at approved price
      const cost = parseFloat(request.cost_at_time);
      const marginAmount = finalPrice - cost;
      const marginPercent = finalPrice > 0
        ? ((finalPrice - cost) / finalPrice) * 100
        : -100;

      // 5. Generate one-time token
      const token = crypto.randomBytes(32).toString('hex');
      const responseTimeMs = this._msBetween(request.created_at, new Date());

      // 6. Update request
      const { rows: [updated] } = await client.query(
        `UPDATE approval_requests SET
           status = 'approved',
           manager_id = $2,
           approved_price = $3,
           margin_amount = $4,
           margin_percent = $5,
           method = $6,
           approval_token = $7,
           token_used = FALSE,
           token_expires_at = NOW() + INTERVAL '10 minutes',
           response_time_ms = $8,
           responded_at = NOW(),
           delegation_id = $9
         WHERE id = $1
         RETURNING *`,
        [
          requestId, managerId,
          finalPrice, marginAmount, marginPercent,
          method, token, responseTimeMs,
          auth.delegation ? auth.delegation.id : null,
        ]
      );

      // 7. Increment daily counter
      await this._incrementDailyCount(managerId, client);

      await client.query('COMMIT');
      return { ...updated, _delegation: auth.delegation };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // DENY REQUEST
  // ==========================================================================

  async denyRequest({ requestId, managerId, reasonCode = null, reasonNote = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      if (!request) throw new Error(`Approval request ${requestId} not found`);
      if (request.status !== 'pending' && request.status !== 'countered') {
        throw new Error(`Request is '${request.status}', expected 'pending' or 'countered'`);
      }

      // Authorization (with delegation support)
      const { rows: [tierSetting] } = await client.query(
        `SELECT * FROM approval_tier_settings WHERE tier = $1`,
        [request.tier]
      );
      if (tierSetting) {
        const auth = await this._checkAuthority(managerId, tierSetting.required_role, request.tier, client);
        if (!auth.authorized) {
          throw new Error(
            `Insufficient authority: tier ${request.tier} requires '${tierSetting.required_role}' role`
          );
        }
        var denyDelegation = auth.delegation;
      }

      const responseTimeMs = this._msBetween(request.created_at, new Date());

      const { rows: [updated] } = await client.query(
        `UPDATE approval_requests SET
           status = 'denied',
           manager_id = $2,
           reason_code = $3,
           reason_note = $4,
           response_time_ms = $5,
           responded_at = NOW(),
           delegation_id = $6
         WHERE id = $1
         RETURNING *`,
        [requestId, managerId, reasonCode, reasonNote, responseTimeMs, denyDelegation?.id || null]
      );

      await client.query('COMMIT');
      return { ...updated, _delegation: denyDelegation || null };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // COUNTER OFFERS
  // ==========================================================================

  /**
   * Manager proposes a different price.
   */
  async createCounterOffer({ requestId, managerId, counterPrice }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      if (!request) throw new Error(`Approval request ${requestId} not found`);
      if (request.status !== 'pending' && request.status !== 'countered') {
        throw new Error(`Cannot counter a '${request.status}' request`);
      }

      if (counterPrice < 0) throw new Error('Counter price cannot be negative');
      if (counterPrice > parseFloat(request.original_price)) {
        throw new Error('Counter price cannot exceed the original price');
      }

      // Authorization (with delegation support)
      const { rows: [tierSetting] } = await client.query(
        `SELECT * FROM approval_tier_settings WHERE tier = $1`,
        [request.tier]
      );
      if (tierSetting) {
        const auth = await this._checkAuthority(managerId, tierSetting.required_role, request.tier, client);
        if (!auth.authorized) {
          throw new Error(
            `Insufficient authority: tier ${request.tier} requires '${tierSetting.required_role}' role`
          );
        }
      }

      // Calculate margin at counter price
      const cost = parseFloat(request.cost_at_time);
      const marginAmount = counterPrice - cost;
      const marginPercent = counterPrice > 0
        ? ((counterPrice - cost) / counterPrice) * 100
        : -100;

      // Expire any previous pending counter-offers for this request
      await client.query(
        `UPDATE approval_counter_offers
         SET status = 'expired', responded_at = NOW()
         WHERE approval_request_id = $1 AND status = 'pending'`,
        [requestId]
      );

      // Insert the new counter-offer
      const { rows: [offer] } = await client.query(
        `INSERT INTO approval_counter_offers (
           approval_request_id, offered_by, price,
           margin_amount, margin_percent, status
         ) VALUES ($1, 'manager', $2, $3, $4, 'pending')
         RETURNING *`,
        [requestId, counterPrice, marginAmount, marginPercent]
      );

      // Mark parent request as countered, record responding manager
      await client.query(
        `UPDATE approval_requests SET status = 'countered', manager_id = $2 WHERE id = $1`,
        [requestId, managerId]
      );

      await client.query('COMMIT');
      return { ...offer, marginAmount, marginPercent };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Salesperson accepts a manager's counter-offer.
   * Internally calls approveRequest with the counter price.
   */
  async acceptCounterOffer({ counterOfferId, salespersonId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Load the counter-offer
      const { rows: [offer] } = await client.query(
        `SELECT * FROM approval_counter_offers WHERE id = $1 FOR UPDATE`,
        [counterOfferId]
      );
      if (!offer) throw new Error(`Counter offer ${counterOfferId} not found`);
      if (offer.status !== 'pending') {
        throw new Error(`Counter offer is '${offer.status}', expected 'pending'`);
      }

      // 2. Verify the parent request belongs to this salesperson
      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1`,
        [offer.approval_request_id]
      );
      if (!request) throw new Error('Parent approval request not found');
      if (request.salesperson_id !== salespersonId) {
        throw new Error('This request does not belong to you');
      }

      // 3. Mark the counter-offer as accepted
      await client.query(
        `UPDATE approval_counter_offers SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
        [counterOfferId]
      );

      await client.query('COMMIT');

      // 4. Approve the request at the counter price (separate transaction inside approveRequest)
      const approved = await this.approveRequest({
        requestId: offer.approval_request_id,
        managerId: request.manager_id,
        method: 'remote',
        approvedPrice: parseFloat(offer.price),
      });

      return approved;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Salesperson declines a counter-offer.
   * The parent request returns to 'pending' so the salesperson can
   * re-request, cancel, or wait for the manager to try again.
   */
  async declineCounterOffer({ counterOfferId, salespersonId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [offer] } = await client.query(
        `SELECT * FROM approval_counter_offers WHERE id = $1 FOR UPDATE`,
        [counterOfferId]
      );
      if (!offer) throw new Error(`Counter offer ${counterOfferId} not found`);
      if (offer.status !== 'pending') {
        throw new Error(`Counter offer is '${offer.status}', expected 'pending'`);
      }

      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1`,
        [offer.approval_request_id]
      );
      if (!request) throw new Error('Parent approval request not found');
      if (request.salesperson_id !== salespersonId) {
        throw new Error('This request does not belong to you');
      }

      await client.query(
        `UPDATE approval_counter_offers SET status = 'declined', responded_at = NOW() WHERE id = $1`,
        [counterOfferId]
      );
      const { rows: [updated] } = await client.query(
        `UPDATE approval_requests SET status = 'pending' WHERE id = $1 RETURNING *`,
        [offer.approval_request_id]
      );

      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // TOKEN CONSUMPTION
  // ==========================================================================

  /**
   * Consume a one-time approval token so the approved price can be applied
   * to the cart.  Each token can only be used once.
   *
   * @returns {object} { approvedPrice, requestId, productId }
   */
  async consumeToken({ token, cartId, cartItemId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [request] } = await client.query(
        `SELECT * FROM approval_requests
         WHERE approval_token = $1
           AND token_used = FALSE
           AND token_expires_at > NOW()
         FOR UPDATE`,
        [token]
      );

      if (!request) {
        throw new Error('Invalid, expired, or already-used approval token');
      }

      // Verify the token is being used for the correct cart context
      if (request.cart_id !== null && request.cart_id !== cartId) {
        throw new Error('Token cart_id mismatch');
      }
      if (request.cart_item_id !== null && request.cart_item_id !== cartItemId) {
        throw new Error('Token cart_item_id mismatch');
      }

      await client.query(
        `UPDATE approval_requests SET token_used = TRUE WHERE id = $1`,
        [request.id]
      );

      await client.query('COMMIT');
      return {
        approvedPrice: parseFloat(request.approved_price),
        requestId: request.id,
        productId: request.product_id,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // CANCEL REQUEST
  // ==========================================================================

  async cancelRequest({ requestId, salespersonId }) {
    const { rows: [request] } = await this.pool.query(
      `SELECT * FROM approval_requests WHERE id = $1`,
      [requestId]
    );
    if (!request) throw new Error(`Approval request ${requestId} not found`);
    if (request.salesperson_id !== salespersonId) {
      throw new Error('This request does not belong to you');
    }
    if (request.status !== 'pending' && request.status !== 'countered') {
      throw new Error(`Cannot cancel a '${request.status}' request`);
    }

    const { rows: [updated] } = await this.pool.query(
      `UPDATE approval_requests SET status = 'cancelled', responded_at = NOW() WHERE id = $1 RETURNING *`,
      [requestId]
    );
    return updated;
  }

  // ==========================================================================
  // MANAGER AVAILABILITY
  // ==========================================================================

  /**
   * Get managers who are online or away and authorised for the given tier.
   * Returns fewest-pending-requests first, online before away.
   */
  async getAvailableManagers({ tier }) {
    // Look up what role is required for this tier
    const { rows: [tierSetting] } = await this.pool.query(
      `SELECT required_role FROM approval_tier_settings WHERE tier = $1`,
      [tier]
    );
    if (!tierSetting) throw new Error(`Tier ${tier} not found`);

    // Build the minimum-role filter from the hierarchy
    const requiredIdx = ROLE_HIERARCHY.indexOf(tierSetting.required_role);
    const qualifiedRoles = requiredIdx >= 0
      ? ROLE_HIERARCHY.slice(requiredIdx)
      : [tierSetting.required_role];

    // Direct managers
    const { rows: directManagers } = await this.pool.query(
      `SELECT
         u.id,
         CONCAT(u.first_name, ' ', u.last_name) AS name,
         u.email,
         u.role,
         ma.status AS availability,
         ma.last_heartbeat,
         ma.pending_request_count,
         ma.active_device_count,
         FALSE AS "isDelegated",
         NULL AS "delegatorName",
         NULL AS "delegatorRole",
         NULL::int AS "maxDelegatedTier",
         NULL::timestamptz AS "delegationExpires"
       FROM users u
       JOIN manager_availability ma ON ma.user_id = u.id
       WHERE ma.status IN ('online', 'away')
         AND u.role = ANY($1)`,
      [qualifiedRoles]
    );

    // Delegated users who are online/away
    const { rows: delegatedManagers } = await this.pool.query(
      `SELECT
         delegate.id,
         CONCAT(delegate.first_name, ' ', delegate.last_name) AS name,
         delegate.email,
         delegate.role,
         ma.status AS availability,
         ma.last_heartbeat,
         ma.pending_request_count,
         ma.active_device_count,
         TRUE AS "isDelegated",
         CONCAT(delegator.first_name, ' ', delegator.last_name) AS "delegatorName",
         delegator.role AS "delegatorRole",
         md.max_tier AS "maxDelegatedTier",
         md.expires_at AS "delegationExpires"
       FROM manager_delegations md
       JOIN users delegate ON delegate.id = md.delegate_id
       JOIN users delegator ON delegator.id = md.delegator_id
       JOIN manager_availability ma ON ma.user_id = delegate.id
       WHERE md.active = TRUE
         AND md.starts_at <= NOW()
         AND md.expires_at > NOW()
         AND md.max_tier >= $1
         AND delegator.role = ANY($2)
         AND ma.status IN ('online', 'away')`,
      [tier, qualifiedRoles]
    );

    // Merge, dedup (direct manager takes priority over delegation)
    const directIds = new Set(directManagers.map(m => m.id));
    const merged = [
      ...directManagers,
      ...delegatedManagers.filter(d => !directIds.has(d.id)),
    ];

    // Sort: online first, then fewest pending
    merged.sort((a, b) => {
      const statusOrder = { online: 0, away: 1, offline: 2 };
      const s = (statusOrder[a.availability] ?? 2) - (statusOrder[b.availability] ?? 2);
      if (s !== 0) return s;
      return (a.pending_request_count || 0) - (b.pending_request_count || 0);
    });

    return merged;
  }

  // ==========================================================================
  // BATCH APPROVAL — CREATE
  // ==========================================================================

  /**
   * Create a batch approval request covering multiple cart items at once.
   *
   * @param {object}   params
   * @param {number}   params.salespersonId
   * @param {string}   [params.cartId]
   * @param {number}   [params.managerId]
   * @param {Array}    params.items - [{ cartItemId, productId, requestedPrice }]
   * @returns {{ parent, children, allAutoApproved }}
   */
  async createBatchRequest({ salespersonId, cartId = null, managerId = null, items }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required for batch approval');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let maxTier = 1;
      let totalOriginal = 0;
      let totalRequested = 0;
      let totalCost = 0;
      const childData = [];

      // Resolve each item's product, discount, and tier
      for (const item of items) {
        const product = await this._getProduct(item.productId, client);
        const originalPrice = parseFloat(product.price);
        const cost = parseFloat(product.cost || 0);
        const requestedPrice = parseFloat(item.requestedPrice);

        if (requestedPrice < 0) throw new Error('Requested price cannot be negative');
        if (requestedPrice > originalPrice) throw new Error(`Requested price for ${product.name} exceeds original price`);

        const discountPct = originalPrice > 0
          ? ((originalPrice - requestedPrice) / originalPrice) * 100
          : 0;
        const marginAmount = requestedPrice - cost;
        const marginPercent = requestedPrice > 0
          ? ((requestedPrice - cost) / requestedPrice) * 100
          : -100;

        const tier = await this._resolveTier(discountPct);
        if (!tier) throw new Error(`No approval tier covers a ${discountPct.toFixed(2)}% discount`);

        // Enforce margin floor
        if (tier.min_margin_percent !== null && marginPercent < parseFloat(tier.min_margin_percent)) {
          if (!tier.allows_below_cost) {
            throw new Error(
              `Tier ${tier.tier} (${tier.name}) requires at least ${tier.min_margin_percent}% margin for ${product.name}. ` +
              `This price gives ${marginPercent.toFixed(2)}%`
            );
          }
        }

        // Below-cost guard
        if (requestedPrice < cost && !tier.allows_below_cost) {
          throw new Error(
            `Tier ${tier.tier} (${tier.name}) does not allow below-cost pricing for ${product.name}.`
          );
        }

        if (tier.tier > maxTier) maxTier = tier.tier;
        totalOriginal += originalPrice;
        totalRequested += requestedPrice;
        totalCost += cost;

        childData.push({
          cartItemId: item.cartItemId || null,
          productId: item.productId,
          originalPrice,
          requestedPrice,
          cost,
          marginAmount,
          marginPercent,
          tier: tier.tier,
          tierName: tier.name,
        });
      }

      const allAutoApproved = maxTier === 1;
      const parentStatus = allAutoApproved ? 'approved' : 'pending';
      const batchLabel = `${items.length} items, max Tier ${maxTier}`;

      const totalMarginAmount = totalRequested - totalCost;
      const totalMarginPercent = totalRequested > 0
        ? ((totalRequested - totalCost) / totalRequested) * 100
        : -100;

      // INSERT parent row (product_id = NULL for batch parent)
      const { rows: [parent] } = await client.query(
        `INSERT INTO approval_requests (
           cart_id, product_id, salesperson_id, manager_id,
           status, tier, request_type, batch_label,
           original_price, requested_price,
           cost_at_time, margin_amount, margin_percent
           ${allAutoApproved ? ', approved_price, method, responded_at, response_time_ms' : ''}
         ) VALUES (
           $1, NULL, $2, $3,
           $4, $5, 'batch', $6,
           $7, $8,
           $9, $10, $11
           ${allAutoApproved ? ", $8, 'pin', NOW(), 0" : ''}
         ) RETURNING *`,
        [
          cartId, salespersonId, allAutoApproved ? salespersonId : managerId,
          parentStatus, maxTier, batchLabel,
          totalOriginal, totalRequested,
          totalCost, totalMarginAmount, totalMarginPercent,
        ]
      );

      // INSERT each child row
      const children = [];
      for (const cd of childData) {
        const childStatus = allAutoApproved ? 'approved' : 'pending';
        const token = allAutoApproved ? crypto.randomBytes(32).toString('hex') : null;

        const { rows: [child] } = await client.query(
          `INSERT INTO approval_requests (
             cart_id, cart_item_id, product_id, salesperson_id, manager_id,
             status, tier, request_type, parent_request_id,
             original_price, requested_price,
             cost_at_time, margin_amount, margin_percent
             ${allAutoApproved ? ', approved_price, approval_token, token_used, token_expires_at, method, responded_at, response_time_ms' : ''}
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, 'child', $8,
             $9, $10,
             $11, $12, $13
             ${allAutoApproved ? ", $10, $14, FALSE, NOW() + INTERVAL '10 minutes', 'pin', NOW(), 0" : ''}
           ) RETURNING *`,
          [
            cartId, cd.cartItemId, cd.productId, salespersonId,
            allAutoApproved ? salespersonId : managerId,
            childStatus, cd.tier, parent.id,
            cd.originalPrice, cd.requestedPrice,
            cd.cost, cd.marginAmount, cd.marginPercent,
            ...(allAutoApproved ? [token] : []),
          ]
        );

        children.push(child);
      }

      await client.query('COMMIT');
      return { parent, children, allAutoApproved };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // BATCH APPROVAL — APPROVE
  // ==========================================================================

  /**
   * Approve all pending children of a batch request.
   *
   * @param {object}  params
   * @param {number}  params.parentRequestId
   * @param {number}  params.managerId
   * @param {string}  [params.method='remote']
   * @param {Array}   [params.adjustments] - [{ childId, approvedPrice }]
   */
  async approveBatchRequest({ parentRequestId, managerId, method = 'remote', adjustments = [] }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock parent
      const { rows: [parent] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1 AND request_type = 'batch' FOR UPDATE`,
        [parentRequestId]
      );
      if (!parent) throw new Error(`Batch request ${parentRequestId} not found`);
      if (parent.status !== 'pending' && parent.status !== 'countered') {
        throw new Error(`Batch request is '${parent.status}', expected 'pending' or 'countered'`);
      }

      // Auth check (with delegation support)
      const { rows: [tierSetting] } = await client.query(
        `SELECT * FROM approval_tier_settings WHERE tier = $1`,
        [parent.tier]
      );
      if (!tierSetting) throw new Error(`Tier ${parent.tier} configuration not found`);

      const auth = await this._checkAuthority(managerId, tierSetting.required_role, parent.tier, client);
      if (!auth.authorized) {
        throw new Error(
          `Insufficient authority: batch tier ${parent.tier} (${tierSetting.name}) requires ` +
          `'${tierSetting.required_role}' role, but ${auth.user.first_name} ${auth.user.last_name} is '${auth.user.role}'`
        );
      }

      // Daily limit
      const withinLimit = await this._checkDailyLimit(managerId, client);
      if (!withinLimit) throw new Error('Daily override limit reached for this manager');

      // Build adjustment map
      const adjustmentMap = new Map();
      for (const adj of adjustments) {
        adjustmentMap.set(adj.childId, parseFloat(adj.approvedPrice));
      }

      // Load & lock children
      const { rows: childRows } = await client.query(
        `SELECT * FROM approval_requests
         WHERE parent_request_id = $1 AND request_type = 'child' AND status = 'pending'
         FOR UPDATE`,
        [parentRequestId]
      );

      const responseTimeMs = this._msBetween(parent.created_at, new Date());
      const approvedChildren = [];

      for (const child of childRows) {
        const finalPrice = adjustmentMap.has(child.id)
          ? adjustmentMap.get(child.id)
          : parseFloat(child.requested_price);

        const cost = parseFloat(child.cost_at_time);
        const marginAmount = finalPrice - cost;
        const marginPercent = finalPrice > 0
          ? ((finalPrice - cost) / finalPrice) * 100
          : -100;

        const token = crypto.randomBytes(32).toString('hex');

        const delegationId = auth.delegation ? auth.delegation.id : null;
        const { rows: [updated] } = await client.query(
          `UPDATE approval_requests SET
             status = 'approved',
             manager_id = $2,
             approved_price = $3,
             margin_amount = $4,
             margin_percent = $5,
             method = $6,
             approval_token = $7,
             token_used = FALSE,
             token_expires_at = NOW() + INTERVAL '10 minutes',
             response_time_ms = $8,
             responded_at = NOW(),
             delegation_id = $9
           WHERE id = $1
           RETURNING *`,
          [
            child.id, managerId,
            finalPrice, marginAmount, marginPercent,
            method, token, responseTimeMs,
            delegationId,
          ]
        );

        approvedChildren.push(updated);
      }

      // Update parent
      const { rows: [updatedParent] } = await client.query(
        `UPDATE approval_requests SET
           status = 'approved',
           manager_id = $2,
           approved_price = $3,
           method = $4,
           response_time_ms = $5,
           responded_at = NOW(),
           delegation_id = $6
         WHERE id = $1
         RETURNING *`,
        [
          parentRequestId, managerId,
          approvedChildren.reduce((s, c) => s + parseFloat(c.approved_price), 0),
          method, responseTimeMs,
          auth.delegation ? auth.delegation.id : null,
        ]
      );

      // Increment daily count (once for the batch)
      await this._incrementDailyCount(managerId, client);

      await client.query('COMMIT');
      return { parent: updatedParent, children: approvedChildren, _delegation: auth.delegation };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // BATCH APPROVAL — DENY
  // ==========================================================================

  async denyBatchRequest({ parentRequestId, managerId, reasonCode = null, reasonNote = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [parent] } = await client.query(
        `SELECT * FROM approval_requests WHERE id = $1 AND request_type = 'batch' FOR UPDATE`,
        [parentRequestId]
      );
      if (!parent) throw new Error(`Batch request ${parentRequestId} not found`);
      if (parent.status !== 'pending' && parent.status !== 'countered') {
        throw new Error(`Batch request is '${parent.status}', expected 'pending' or 'countered'`);
      }

      // Auth check (with delegation support)
      const { rows: [tierSetting] } = await client.query(
        `SELECT * FROM approval_tier_settings WHERE tier = $1`,
        [parent.tier]
      );
      let batchDenyDelegation = null;
      if (tierSetting) {
        const auth = await this._checkAuthority(managerId, tierSetting.required_role, parent.tier, client);
        if (!auth.authorized) {
          throw new Error(
            `Insufficient authority: tier ${parent.tier} requires '${tierSetting.required_role}' role`
          );
        }
        batchDenyDelegation = auth.delegation;
      }

      const responseTimeMs = this._msBetween(parent.created_at, new Date());
      const delegationId = batchDenyDelegation?.id || null;

      // Deny all pending children
      await client.query(
        `UPDATE approval_requests SET
           status = 'denied',
           manager_id = $2,
           reason_code = $3,
           reason_note = $4,
           response_time_ms = $5,
           responded_at = NOW(),
           delegation_id = $6
         WHERE parent_request_id = $1 AND status = 'pending'`,
        [parentRequestId, managerId, reasonCode, reasonNote, responseTimeMs, delegationId]
      );

      // Deny parent
      const { rows: [updatedParent] } = await client.query(
        `UPDATE approval_requests SET
           status = 'denied',
           manager_id = $2,
           reason_code = $3,
           reason_note = $4,
           response_time_ms = $5,
           responded_at = NOW(),
           delegation_id = $6
         WHERE id = $1
         RETURNING *`,
        [parentRequestId, managerId, reasonCode, reasonNote, responseTimeMs, delegationId]
      );

      await client.query('COMMIT');
      return { ...updatedParent, _delegation: batchDenyDelegation };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // BATCH APPROVAL — GET DETAILS
  // ==========================================================================

  async getBatchDetails({ parentRequestId }) {
    const { rows: [parent] } = await this.pool.query(
      `SELECT
         ar.*,
         CONCAT(s.first_name, ' ', s.last_name) AS salesperson_name,
         CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
         ats.name AS tier_name
       FROM approval_requests ar
       JOIN users s ON ar.salesperson_id = s.id
       LEFT JOIN users m ON ar.manager_id = m.id
       LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
       WHERE ar.id = $1 AND ar.request_type = 'batch'`,
      [parentRequestId]
    );

    if (!parent) throw new Error(`Batch request ${parentRequestId} not found`);

    const { rows: children } = await this.pool.query(
      `SELECT
         ar.*,
         p.name AS product_name,
         p.sku  AS product_sku,
         ats.name AS tier_name
       FROM approval_requests ar
       JOIN products p ON ar.product_id = p.id
       LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
       WHERE ar.parent_request_id = $1 AND ar.request_type = 'child'
       ORDER BY ar.id ASC`,
      [parentRequestId]
    );

    return { ...parent, children };
  }

  // ==========================================================================
  // BATCH APPROVAL — CONSUME TOKENS
  // ==========================================================================

  async consumeBatchTokens({ parentRequestId, cartId = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: children } = await client.query(
        `SELECT * FROM approval_requests
         WHERE parent_request_id = $1
           AND request_type = 'child'
           AND status = 'approved'
           AND token_used = FALSE
           AND token_expires_at > NOW()
         FOR UPDATE`,
        [parentRequestId]
      );

      if (children.length === 0) {
        throw new Error('No valid tokens found for this batch');
      }

      const consumed = [];
      for (const child of children) {
        await client.query(
          `UPDATE approval_requests SET token_used = TRUE WHERE id = $1`,
          [child.id]
        );
        consumed.push({
          childId: child.id,
          approvedPrice: parseFloat(child.approved_price),
          productId: child.product_id,
          cartItemId: child.cart_item_id,
        });
      }

      await client.query('COMMIT');
      return consumed;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // HISTORY & DETAILS
  // ==========================================================================

  /**
   * Recent approved overrides for a specific product.
   */
  async getProductOverrideHistory({ productId, limit = 10 }) {
    const { rows } = await this.pool.query(
      `SELECT
         ar.id,
         ar.approved_price,
         ar.original_price,
         ar.margin_amount,
         ar.margin_percent,
         ar.tier,
         ar.responded_at,
         CONCAT(m.first_name, ' ', m.last_name) AS manager_name
       FROM approval_requests ar
       LEFT JOIN users m ON ar.manager_id = m.id
       WHERE ar.product_id = $1
         AND ar.status = 'approved'
       ORDER BY ar.responded_at DESC
       LIMIT $2`,
      [productId, limit]
    );
    return rows;
  }

  /**
   * Full request details including product info, people, and counter-offer
   * history.
   */
  async getRequestWithDetails({ requestId }) {
    const { rows: [request] } = await this.pool.query(
      `SELECT
         ar.*,
         p.name   AS product_name,
         p.sku    AS product_sku,
         p.price  AS current_retail_price,
         p.cost   AS current_cost,
         CONCAT(s.first_name, ' ', s.last_name) AS salesperson_name,
         s.email  AS salesperson_email,
         CONCAT(m.first_name, ' ', m.last_name) AS manager_name,
         m.email  AS manager_email,
         ats.name AS tier_name,
         ats.required_role,
         ats.timeout_seconds,
         ats.requires_reason_code
       FROM approval_requests ar
       JOIN products p ON ar.product_id = p.id
       JOIN users s    ON ar.salesperson_id = s.id
       LEFT JOIN users m ON ar.manager_id = m.id
       LEFT JOIN approval_tier_settings ats ON ats.tier = ar.tier
       WHERE ar.id = $1`,
      [requestId]
    );

    if (!request) throw new Error(`Approval request ${requestId} not found`);

    // Attach counter-offer history
    const { rows: counterOffers } = await this.pool.query(
      `SELECT * FROM approval_counter_offers
       WHERE approval_request_id = $1
       ORDER BY created_at ASC`,
      [requestId]
    );

    return { ...request, counterOffers };
  }
  // ==========================================================================
  // DELEGATION CRUD
  // ==========================================================================

  /**
   * Create a delegation: delegator grants approval authority to delegate.
   */
  async createDelegation({ delegatorId, delegateId, maxTier, expiresAt, reason }) {
    if (delegatorId === delegateId) {
      throw new Error('Cannot delegate to yourself');
    }

    const delegator = await this._getUser(delegatorId);
    if (!this._roleAtLeast(delegator.role, 'manager')) {
      throw new Error('Only managers and above can delegate authority');
    }

    const delegate = await this._getUser(delegateId);
    if (!delegate) throw new Error('Delegate user not found');

    // Validate maxTier doesn't exceed delegator's capability
    const delegatorIdx = ROLE_HIERARCHY.indexOf(delegator.role);
    // manager=2 -> max tier 2, senior_manager=3 -> max tier 3, admin=4 -> max tier 4
    const delegatorMaxTier = Math.min(delegatorIdx, 4);
    if (maxTier > delegatorMaxTier) {
      throw new Error(
        `Cannot delegate tier ${maxTier} authority. Your role (${delegator.role}) supports up to tier ${delegatorMaxTier}`
      );
    }

    // Deactivate any existing active delegation from this delegator to this delegate
    await this.pool.query(
      `UPDATE manager_delegations
       SET active = FALSE, revoked_at = NOW()
       WHERE delegator_id = $1 AND delegate_id = $2 AND active = TRUE`,
      [delegatorId, delegateId]
    );

    const { rows: [delegation] } = await this.pool.query(
      `INSERT INTO manager_delegations (delegator_id, delegate_id, max_tier, expires_at, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [delegatorId, delegateId, maxTier, expiresAt, reason || null]
    );

    return delegation;
  }

  /**
   * Get active delegations for a user (both outgoing and incoming).
   */
  async getActiveDelegations(userId) {
    const { rows: delegatedTo } = await this.pool.query(
      `SELECT md.*,
              CONCAT(u.first_name, ' ', u.last_name) AS delegate_name,
              u.email AS delegate_email,
              u.role AS delegate_role
       FROM manager_delegations md
       JOIN users u ON u.id = md.delegate_id
       WHERE md.delegator_id = $1 AND md.active = TRUE AND md.expires_at > NOW()
       ORDER BY md.created_at DESC`,
      [userId]
    );

    const { rows: receivedFrom } = await this.pool.query(
      `SELECT md.*,
              CONCAT(u.first_name, ' ', u.last_name) AS delegator_name,
              u.email AS delegator_email,
              u.role AS delegator_role
       FROM manager_delegations md
       JOIN users u ON u.id = md.delegator_id
       WHERE md.delegate_id = $1 AND md.active = TRUE AND md.expires_at > NOW()
       ORDER BY md.created_at DESC`,
      [userId]
    );

    return { delegatedTo, receivedFrom };
  }

  /**
   * Revoke a delegation.
   */
  async revokeDelegation(delegationId, userId) {
    const { rows: [delegation] } = await this.pool.query(
      `SELECT * FROM manager_delegations WHERE id = $1`,
      [delegationId]
    );
    if (!delegation) throw new Error('Delegation not found');
    if (delegation.delegator_id !== userId) {
      throw new Error('Only the delegator can revoke a delegation');
    }
    if (!delegation.active) {
      throw new Error('Delegation is already inactive');
    }

    const { rows: [updated] } = await this.pool.query(
      `UPDATE manager_delegations
       SET active = FALSE, revoked_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [delegationId]
    );
    return updated;
  }

  /**
   * Get users eligible to receive delegation from a delegator.
   */
  async getEligibleDelegates(delegatorId) {
    const { rows } = await this.pool.query(
      `SELECT id, CONCAT(first_name, ' ', last_name) AS name, email, role
       FROM users
       WHERE id != $1
         AND is_active = TRUE
       ORDER BY last_name, first_name`,
      [delegatorId]
    );
    return rows;
  }
}

module.exports = ApprovalService;
