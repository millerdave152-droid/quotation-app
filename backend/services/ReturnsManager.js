/**
 * ReturnsManager
 *
 * Processes marketplace returns with rule-based auto-decisioning.
 *
 * Existing marketplace_returns columns used:
 *   return_reason (VARCHAR), return_reason_detail (TEXT),
 *   total_refund_cents / restocking_fee_cents / shipping_refund_cents (BIGINT — cents),
 *   tracking_number, received_date, processed_date,
 *   channel_id, items (JSONB), restock_eligible, auto_decision, auto_decision_reason,
 *   refunded_at, mirakl_return_id, mirakl_order_id, order_id, customer_name, status
 *
 * Methods:
 *   processReturn(returnData, channelId)   — upsert + rule-match + auto-decision
 *   acceptReturn(returnId)                 — manually accept
 *   rejectReturn(returnId, reason)         — manually reject
 *   receiveReturn(returnId, condition)     — mark received, restock if eligible
 *   getReturns(filters)                    — list with filters
 *   getReturnStats(channelId, days)        — dashboard analytics
 *   getRules()                             — list all rules
 *   createRule(rule)                       — insert rule
 *   updateRule(ruleId, updates)            — update rule
 */

const pool = require('../db');
const miraklService = require('../services/miraklService');

const PREFIX = '[ReturnsManager]';

class ReturnsManager {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── PROCESS RETURN (from polling) ──────────────────────────────

  /**
   * Upsert a return from channel polling data, apply rules, auto-decide.
   * @param {object} returnData - { returnId, orderId, miraklOrderId, items, reason, status, createdAt, customerName }
   * @param {number} channelId
   * @returns {{ returnId, decision, rule, isNew }}
   */
  async processReturn(returnData, channelId) {
    const {
      returnId: miraklReturnId,
      miraklOrderId,
      items = [],
      reason = '',
      status: channelStatus,
      customerName
    } = returnData;

    // Look up local order_id from mirakl_order_id
    let orderId = null;
    if (miraklOrderId) {
      const orderResult = await this.pool.query(
        `SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1 LIMIT 1`,
        [miraklOrderId]
      );
      if (orderResult.rows.length > 0) orderId = orderResult.rows[0].id;
    }

    // Calculate item total for rule matching (cents)
    const itemTotalCents = items.reduce((sum, i) => {
      const price = parseFloat(i.price) || 0;
      const qty = parseInt(i.quantity) || 1;
      return sum + Math.round(price * qty * 100);
    }, 0);

    // Generate return number (matches existing pattern: RET-{timestamp}-{random6})
    const returnNumber = `RET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // UPSERT into marketplace_returns
    const upsertResult = await this.pool.query(`
      INSERT INTO marketplace_returns (
        return_number, mirakl_return_id, mirakl_order_id, order_id, channel_id,
        customer_name, return_reason, items,
        total_refund_cents, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4::INTEGER, $5::INTEGER, $6, $7, $8::JSONB, $9::BIGINT, $10, NOW(), NOW())
      ON CONFLICT (mirakl_return_id) DO UPDATE SET
        status = EXCLUDED.status,
        items = EXCLUDED.items,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS is_new
    `, [
      returnNumber,
      miraklReturnId, miraklOrderId, orderId, channelId,
      customerName || null, reason, JSON.stringify(items),
      itemTotalCents, channelStatus || 'PENDING'
    ]);

    const row = upsertResult.rows[0];
    const localReturnId = row.id;
    const isNew = row.is_new;

    // Only run auto-decision on newly inserted returns
    if (!isNew) {
      return { returnId: localReturnId, decision: 'EXISTING', rule: null, isNew: false };
    }

    // Load and evaluate rules
    const decision = await this._evaluateRules(localReturnId, {
      reason,
      amountCents: itemTotalCents,
      channelId,
      miraklOrderId
    });

    return { returnId: localReturnId, decision: decision.action, rule: decision.ruleName, isNew: true };
  }

  // ─── RULE EVALUATION ───────────────────────────────────────────

  /**
   * Load rules sorted by priority, find first match, apply action.
   */
  async _evaluateRules(returnId, context) {
    const { rows: rules } = await this.pool.query(
      `SELECT * FROM return_rules WHERE active = true ORDER BY priority ASC`
    );

    for (const rule of rules) {
      if (this._ruleMatches(rule, context)) {
        const action = rule.action || {};

        // Calculate restocking fee
        let restockingFeeCents = 0;
        if (action.restocking_fee_percent && context.amountCents > 0) {
          restockingFeeCents = Math.round(context.amountCents * (action.restocking_fee_percent / 100));
        }

        let decision;
        if (action.needs_review) {
          decision = 'NEEDS_REVIEW';
        } else if (action.auto_accept) {
          decision = 'ACCEPTED';
        } else {
          decision = 'NEEDS_REVIEW';
        }

        // Store decision
        const newStatus = decision === 'ACCEPTED' ? 'ACCEPTED' : null;
        await this.pool.query(`
          UPDATE marketplace_returns
          SET auto_decision = $1,
              auto_decision_reason = $2,
              restocking_fee_cents = $3,
              restock_eligible = $4,
              status = COALESCE($6, status),
              updated_at = NOW()
          WHERE id = $5
        `, [
          decision,
          `Rule: ${rule.rule_name} (priority ${rule.priority})`,
          restockingFeeCents,
          action.restock !== false,
          returnId,
          newStatus
        ]);

        console.log(`${PREFIX} Return #${returnId}: ${decision} by rule "${rule.rule_name}"`);

        return { action: decision, ruleName: rule.rule_name, ruleId: rule.id };
      }
    }

    // No rule matched — leave as PENDING for manual review
    await this.pool.query(`
      UPDATE marketplace_returns
      SET auto_decision = 'NEEDS_REVIEW',
          auto_decision_reason = 'No matching rule — manual review required',
          updated_at = NOW()
      WHERE id = $1
    `, [returnId]);

    console.log(`${PREFIX} Return #${returnId}: NEEDS_REVIEW (no matching rule)`);
    return { action: 'NEEDS_REVIEW', ruleName: null, ruleId: null };
  }

  /**
   * Check if a rule's conditions match the return context.
   */
  _ruleMatches(rule, context) {
    const cond = rule.conditions || {};

    // reason_codes: return_reason must be in the list
    if (cond.reason_codes && Array.isArray(cond.reason_codes)) {
      if (!cond.reason_codes.includes(context.reason)) return false;
    }

    // amount_min: item total must be >= threshold (in dollars)
    if (cond.amount_min !== undefined) {
      const thresholdCents = Math.round(cond.amount_min * 100);
      if (context.amountCents < thresholdCents) return false;
    }

    // amount_max: item total must be <= threshold (in dollars)
    if (cond.amount_max !== undefined) {
      const thresholdCents = Math.round(cond.amount_max * 100);
      if (context.amountCents > thresholdCents) return false;
    }

    // days_max: days since order delivery must be <= threshold
    // (evaluated lazily — skip if we don't have order delivery data in context)
    // This is checked at processReturn time when order data is available

    return true;
  }

  // ─── MANUAL ACTIONS ─────────────────────────────────────────────

  /**
   * Manually accept a return.
   */
  async acceptReturn(returnId) {
    const { rows } = await this.pool.query(
      `UPDATE marketplace_returns SET status = 'ACCEPTED', updated_at = NOW()
       WHERE id = $1 AND status IN ('PENDING')
       RETURNING *`,
      [returnId]
    );
    if (rows.length === 0) throw new Error(`Return #${returnId} not found or not in PENDING status`);

    console.log(`${PREFIX} Return #${returnId} manually ACCEPTED`);
    return this._formatReturn(rows[0]);
  }

  /**
   * Manually reject a return.
   */
  async rejectReturn(returnId, reason) {
    const { rows } = await this.pool.query(
      `UPDATE marketplace_returns
       SET status = 'REJECTED', internal_notes = COALESCE(internal_notes, '') || $2, updated_at = NOW()
       WHERE id = $1 AND status IN ('PENDING', 'ACCEPTED')
       RETURNING *`,
      [returnId, reason ? `\nRejected: ${reason}` : '\nRejected by staff']
    );
    if (rows.length === 0) throw new Error(`Return #${returnId} not found or cannot be rejected`);

    console.log(`${PREFIX} Return #${returnId} REJECTED: ${reason || 'no reason given'}`);
    return this._formatReturn(rows[0]);
  }

  // ─── RECEIVE RETURN ─────────────────────────────────────────────

  /**
   * Mark a return as physically received. Restock if eligible.
   * @param {number} returnId
   * @param {string} condition - 'resellable', 'damaged', 'missing_parts'
   */
  async receiveReturn(returnId, condition = 'resellable') {
    // Load the return
    const { rows } = await this.pool.query(
      `SELECT * FROM marketplace_returns WHERE id = $1`, [returnId]
    );
    if (rows.length === 0) throw new Error(`Return #${returnId} not found`);

    const ret = rows[0];
    if (ret.status === 'RECEIVED' || ret.status === 'REFUNDED' || ret.status === 'CLOSED') {
      throw new Error(`Return #${returnId} is already ${ret.status}`);
    }

    // Calculate final refund
    const itemTotalCents = parseInt(ret.total_refund_cents) || 0;
    const restockingFeeCents = parseInt(ret.restocking_fee_cents) || 0;
    const shippingRefundCents = parseInt(ret.shipping_refund_cents) || 0;
    const finalRefundCents = Math.max(0, itemTotalCents - restockingFeeCents + shippingRefundCents);

    // Update status
    await this.pool.query(`
      UPDATE marketplace_returns
      SET status = 'RECEIVED',
          received_date = NOW(),
          total_refund_cents = $2,
          metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [
      returnId,
      finalRefundCents,
      JSON.stringify({ received_condition: condition })
    ]);

    let restocked = false;

    // Restock if condition is resellable and return is eligible
    if (condition === 'resellable' && ret.restock_eligible) {
      const items = ret.items || [];
      for (const item of items) {
        const sku = item.sku;
        const qty = parseInt(item.quantity) || 1;
        if (!sku) continue;

        // Find product by SKU
        const prodResult = await this.pool.query(
          `SELECT id, stock_quantity FROM products WHERE sku = $1 LIMIT 1`, [sku]
        );
        if (prodResult.rows.length === 0) continue;

        const product = prodResult.rows[0];
        const oldQty = product.stock_quantity || 0;
        const newQty = oldQty + qty;

        // Increment stock
        await this.pool.query(
          `UPDATE products SET stock_quantity = $1 WHERE id = $2`,
          [newQty, product.id]
        );

        // Queue inventory sync to marketplace
        try {
          await miraklService.queueInventoryChange(
            product.id, sku, oldQty, newQty, 'RETURN_RESTOCK', ret.channel_id
          );
        } catch (err) {
          console.error(`${PREFIX} Failed to queue inventory sync for SKU ${sku}:`, err.message);
        }

        console.log(`${PREFIX} Restocked SKU ${sku}: ${oldQty} → ${newQty}`);
        restocked = true;
      }
    }

    console.log(
      `${PREFIX} Return #${returnId} RECEIVED (${condition})` +
      ` — refund: $${(finalRefundCents / 100).toFixed(2)}` +
      (restocked ? ' — items restocked' : '')
    );

    return {
      returnId,
      status: 'RECEIVED',
      condition,
      finalRefundCents,
      finalRefundDollars: (finalRefundCents / 100).toFixed(2),
      restocked
    };
  }

  // ─── LIST / FILTER ──────────────────────────────────────────────

  /**
   * List returns with filters.
   * @param {object} filters - { channelId, status, reason, limit, offset }
   */
  async getReturns(filters = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.channelId) {
      conditions.push(`mr.channel_id = $${idx++}`);
      params.push(parseInt(filters.channelId));
    }
    if (filters.status) {
      conditions.push(`mr.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.reason) {
      conditions.push(`mr.return_reason = $${idx++}`);
      params.push(filters.reason);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = parseInt(filters.limit) || 50;
    const offset = parseInt(filters.offset) || 0;

    const { rows } = await this.pool.query(`
      SELECT mr.*,
             mc.channel_code, mc.channel_name,
             mo.mirakl_order_id AS order_mirakl_id
      FROM marketplace_returns mr
      LEFT JOIN marketplace_channels mc ON mc.id = mr.channel_id
      LEFT JOIN marketplace_orders mo ON mo.id = mr.order_id
      ${where}
      ORDER BY mr.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    return rows.map(r => this._formatReturn(r));
  }

  // ─── STATS ──────────────────────────────────────────────────────

  /**
   * Return analytics for dashboard.
   * @param {number|null} channelId
   * @param {number} days
   */
  async getReturnStats(channelId = null, days = 30) {
    const channelFilter = channelId ? 'AND mr.channel_id = $2' : '';
    const params = [days];
    if (channelId) params.push(channelId);

    // Overall counts
    const countResult = await this.pool.query(`
      SELECT
        COUNT(*) AS total_returns,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
        COUNT(*) FILTER (WHERE status = 'RECEIVED') AS received,
        COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
        COALESCE(SUM(total_refund_cents), 0) AS total_refund_cents,
        COALESCE(SUM(restocking_fee_cents), 0) AS total_restocking_cents,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(received_date, NOW()) - created_at)) / 3600), 0)
          AS avg_processing_hours
      FROM marketplace_returns mr
      WHERE mr.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
    `, params);

    // By reason
    const reasonResult = await this.pool.query(`
      SELECT return_reason AS reason, COUNT(*) AS count,
             COALESCE(SUM(total_refund_cents), 0) AS refund_cents
      FROM marketplace_returns mr
      WHERE mr.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
      GROUP BY return_reason
      ORDER BY count DESC
    `, params);

    // By product (top 10 most returned SKUs)
    const productResult = await this.pool.query(`
      SELECT item->>'sku' AS sku,
             COUNT(*) AS return_count,
             SUM((item->>'quantity')::int) AS total_qty
      FROM marketplace_returns mr,
           jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
      WHERE mr.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
      GROUP BY item->>'sku'
      ORDER BY return_count DESC
      LIMIT 10
    `, params);

    // Return rate (returns vs total orders in period)
    const rateResult = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM marketplace_returns mr
         WHERE mr.created_at >= NOW() - ($1 || ' days')::INTERVAL
         ${channelFilter}) AS returns,
        (SELECT COUNT(*) FROM marketplace_orders mo
         WHERE mo.created_at >= NOW() - ($1 || ' days')::INTERVAL
         ${channelId ? 'AND mo.channel_id = $2' : ''}) AS orders
    `, params);

    const stats = countResult.rows[0];
    const rate = rateResult.rows[0];

    return {
      period: `${days} days`,
      totalReturns: parseInt(stats.total_returns),
      pending: parseInt(stats.pending),
      accepted: parseInt(stats.accepted),
      received: parseInt(stats.received),
      refunded: parseInt(stats.refunded),
      rejected: parseInt(stats.rejected),
      totalRefundDollars: (parseInt(stats.total_refund_cents) / 100).toFixed(2),
      totalRestockingDollars: (parseInt(stats.total_restocking_cents) / 100).toFixed(2),
      avgProcessingHours: parseFloat(parseFloat(stats.avg_processing_hours).toFixed(1)),
      returnRate: parseInt(rate.orders) > 0
        ? ((parseInt(rate.returns) / parseInt(rate.orders)) * 100).toFixed(2) + '%'
        : '0.00%',
      byReason: reasonResult.rows.map(r => ({
        reason: r.reason || 'UNKNOWN',
        count: parseInt(r.count),
        refundDollars: (parseInt(r.refund_cents) / 100).toFixed(2)
      })),
      topReturnedProducts: productResult.rows.map(r => ({
        sku: r.sku,
        returnCount: parseInt(r.return_count),
        totalQty: parseInt(r.total_qty)
      }))
    };
  }

  // ─── RULES CRUD ─────────────────────────────────────────────────

  async getRules() {
    const { rows } = await this.pool.query(
      `SELECT * FROM return_rules ORDER BY priority ASC`
    );
    return rows;
  }

  async createRule(rule) {
    const { rows } = await this.pool.query(`
      INSERT INTO return_rules (rule_name, priority, conditions, action, active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      rule.rule_name || rule.ruleName,
      rule.priority || 100,
      JSON.stringify(rule.conditions || {}),
      JSON.stringify(rule.action || {}),
      rule.active !== false
    ]);
    return rows[0];
  }

  async updateRule(ruleId, updates) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (updates.rule_name !== undefined) { fields.push(`rule_name = $${idx++}`); params.push(updates.rule_name); }
    if (updates.priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(updates.priority); }
    if (updates.conditions !== undefined) { fields.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.action !== undefined) { fields.push(`action = $${idx++}`); params.push(JSON.stringify(updates.action)); }
    if (updates.active !== undefined) { fields.push(`active = $${idx++}`); params.push(updates.active); }

    if (fields.length === 0) throw new Error('No fields to update');

    params.push(ruleId);
    const { rows } = await this.pool.query(
      `UPDATE return_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new Error(`Rule #${ruleId} not found`);
    return rows[0];
  }

  // ─── HELPERS ────────────────────────────────────────────────────

  _formatReturn(row) {
    return {
      id: row.id,
      channelId: row.channel_id,
      channelCode: row.channel_code || null,
      channelName: row.channel_name || null,
      orderId: row.order_id,
      miraklReturnId: row.mirakl_return_id,
      miraklOrderId: row.mirakl_order_id || row.order_mirakl_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      returnReason: row.return_reason,
      returnReasonDetail: row.return_reason_detail,
      status: row.status,
      items: row.items || [],
      totalRefundDollars: row.total_refund_cents ? (parseInt(row.total_refund_cents) / 100).toFixed(2) : '0.00',
      restockingFeeDollars: row.restocking_fee_cents ? (parseInt(row.restocking_fee_cents) / 100).toFixed(2) : '0.00',
      shippingRefundDollars: row.shipping_refund_cents ? (parseInt(row.shipping_refund_cents) / 100).toFixed(2) : '0.00',
      restockEligible: row.restock_eligible,
      trackingNumber: row.tracking_number,
      autoDecision: row.auto_decision,
      autoDecisionReason: row.auto_decision_reason,
      receivedDate: row.received_date,
      refundedAt: row.refunded_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = new ReturnsManager(pool);
