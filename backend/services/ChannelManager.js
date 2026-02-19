const pool = require('../db');

/**
 * ChannelManager — Orchestration layer between routes and channel adapters.
 *
 * Routes call ChannelManager methods. ChannelManager finds the right adapter
 * (by channel ID or code), delegates the work, and returns results.
 *
 * Usage:
 *   const { getInstance } = require('./services/ChannelManager');
 *   const channelManager = await getInstance();
 *   const result = await channelManager.pollOrders(channelId);
 */
class ChannelManager {
  constructor() {
    this.adapters = new Map(); // channelId -> adapter instance
    this.pool = pool;
  }

  /**
   * Load all ACTIVE channels from DB and instantiate adapters.
   * Called once at startup; can be called again to hot-reload channels.
   */
  async initialize() {
    const { rows } = await this.pool.query(
      "SELECT * FROM marketplace_channels WHERE status = 'ACTIVE'"
    );
    for (const channel of rows) {
      try {
        this.adapters.set(channel.id, this._createAdapter(channel));
      } catch (err) {
        console.error(`[ChannelManager] Failed to create adapter for ${channel.channel_code}:`, err.message);
      }
    }
    console.log(`[ChannelManager] Initialized: ${this.adapters.size} active channel(s)`);
    return this;
  }

  /**
   * Factory: create the correct adapter based on channel_type.
   * @private
   */
  _createAdapter(channel) {
    switch (channel.channel_type) {
      case 'MIRAKL': {
        const { MiraklAdapter } = require('./channels');
        return new MiraklAdapter(channel);
      }
      // Future: case 'AMAZON_SP': return new AmazonAdapter(channel);
      // Future: case 'WALMART':   return new WalmartAdapter(channel);
      default:
        throw new Error(`Unknown channel type: ${channel.channel_type}`);
    }
  }

  // ============================================================
  // ADAPTER LOOKUPS
  // ============================================================

  /** Get adapter by channel ID. Throws if not loaded. */
  getAdapter(channelId) {
    const adapter = this.adapters.get(channelId);
    if (!adapter) throw new Error(`No adapter loaded for channel ${channelId}`);
    return adapter;
  }

  /** Get adapter by channel_code (e.g. "bestbuy_mirakl"). */
  getAdapterByCode(channelCode) {
    for (const [, adapter] of this.adapters) {
      if (adapter.channelCode === channelCode) return adapter;
    }
    throw new Error(`No adapter loaded for channel code "${channelCode}"`);
  }

  /** All currently loaded adapters. */
  getAllAdapters() {
    return Array.from(this.adapters.values());
  }

  /** Check whether a given channel has a loaded adapter. */
  hasAdapter(channelId) {
    return this.adapters.has(channelId);
  }

  // ============================================================
  // CHANNEL CRUD
  // ============================================================

  /** List all channels (active and inactive) from DB. */
  async listChannels() {
    const { rows } = await this.pool.query(
      `SELECT id, channel_code, channel_name, channel_type, status,
              onboarded_at, last_sync_at, created_at
       FROM marketplace_channels
       ORDER BY channel_name`
    );
    return rows;
  }

  /** Add a new channel (starts as INACTIVE). */
  async addChannel(channelData) {
    const { rows } = await this.pool.query(
      `INSERT INTO marketplace_channels
         (channel_code, channel_name, channel_type, api_url, credentials, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'INACTIVE')
       RETURNING *`,
      [
        channelData.code,
        channelData.name,
        channelData.type,
        channelData.apiUrl,
        JSON.stringify(channelData.credentials || {}),
        JSON.stringify(channelData.config || {})
      ]
    );
    return rows[0];
  }

  /** Activate a channel: sets status to ACTIVE and loads the adapter. */
  async activateChannel(channelId) {
    await this.pool.query(
      "UPDATE marketplace_channels SET status = 'ACTIVE', onboarded_at = COALESCE(onboarded_at, NOW()), updated_at = NOW() WHERE id = $1",
      [channelId]
    );
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_channels WHERE id = $1', [channelId]
    );
    if (rows[0]) {
      this.adapters.set(channelId, this._createAdapter(rows[0]));
    }
    return rows[0];
  }

  /** Deactivate a channel: sets status to INACTIVE and removes adapter. */
  async deactivateChannel(channelId) {
    await this.pool.query(
      "UPDATE marketplace_channels SET status = 'INACTIVE', updated_at = NOW() WHERE id = $1",
      [channelId]
    );
    this.adapters.delete(channelId);
  }

  /** Update channel credentials or config (reloads adapter). */
  async updateChannel(channelId, updates) {
    const sets = [];
    const params = [];
    let idx = 1;

    if (updates.apiUrl !== undefined) { sets.push(`api_url = $${idx++}`); params.push(updates.apiUrl); }
    if (updates.credentials !== undefined) { sets.push(`credentials = $${idx++}`); params.push(JSON.stringify(updates.credentials)); }
    if (updates.config !== undefined) { sets.push(`config = $${idx++}`); params.push(JSON.stringify(updates.config)); }
    if (updates.name !== undefined) { sets.push(`channel_name = $${idx++}`); params.push(updates.name); }

    if (sets.length === 0) return null;

    sets.push(`updated_at = NOW()`);
    params.push(channelId);

    const { rows } = await this.pool.query(
      `UPDATE marketplace_channels SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Reload adapter if channel is active
    if (rows[0] && rows[0].status === 'ACTIVE') {
      this.adapters.set(channelId, this._createAdapter(rows[0]));
    }

    return rows[0];
  }

  // ============================================================
  // OFFERS
  // ============================================================

  /**
   * Push offers to a specific channel.
   * Queries product_channel_listings joined with products, then delegates.
   * @param {number} channelId
   * @param {number[]|null} productIds - optional filter
   */
  async pushOffers(channelId, productIds = null) {
    const adapter = this.getAdapter(channelId);

    let query = `
      SELECT pcl.*,
             p.name, p.sku, p.upc, p.price, p.msrp_cents,
             p.stock_quantity, p.description, p.manufacturer, p.model,
             p.bestbuy_logistic_class, p.bestbuy_leadtime_to_ship,
             p.bestbuy_product_tax_code, p.bestbuy_ehf_amount,
             p.bestbuy_min_quantity_alert,
             p.marketplace_discount_price, p.marketplace_discount_start,
             p.marketplace_discount_end
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status != 'DRAFT'
    `;
    const params = [channelId];

    if (productIds && productIds.length > 0) {
      query += ` AND pcl.product_id = ANY($2)`;
      params.push(productIds);
    }

    const { rows } = await this.pool.query(query, params);

    const result = await adapter.pushOffers(rows);

    // Update last_sync_at on the channel
    await this.pool.query(
      'UPDATE marketplace_channels SET last_sync_at = NOW() WHERE id = $1',
      [channelId]
    );

    return result;
  }

  // ============================================================
  // INVENTORY
  // ============================================================

  /**
   * Push inventory to a specific channel with allocation logic.
   * Applies safety_buffer and allocation_percent from product_channel_listings.
   * @param {number} channelId
   */
  async pushInventory(channelId) {
    const adapter = this.getAdapter(channelId);

    const { rows } = await this.pool.query(`
      SELECT pcl.channel_sku AS sku,
             p.stock_quantity,
             COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
             COALESCE(pcl.allocation_percent, 100) AS allocation_percent
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status = 'ACTIVE'
    `, [channelId]);

    // Apply allocation formula: available = floor((stock - buffer) * pct/100)
    const stockUpdates = rows.map(r => ({
      sku: r.sku,
      quantity: Math.max(0, Math.floor(
        (parseInt(r.stock_quantity, 10) - r.safety_buffer) * (r.allocation_percent / 100)
      ))
    }));

    return adapter.pushInventory(stockUpdates);
  }

  /**
   * Push inventory to ALL channels for a specific product.
   * @param {number} productId
   */
  async pushInventoryAllChannels(productId) {
    const { rows } = await this.pool.query(
      "SELECT DISTINCT channel_id FROM product_channel_listings WHERE product_id = $1 AND listing_status = 'ACTIVE'",
      [productId]
    );

    const results = [];
    for (const row of rows) {
      try {
        const result = await this.pushInventory(row.channel_id);
        results.push({ channelId: row.channel_id, ...result });
      } catch (err) {
        results.push({ channelId: row.channel_id, error: err.message });
      }
    }
    return results;
  }

  // ============================================================
  // ORDERS
  // ============================================================

  /**
   * Poll orders from a specific channel.
   * @param {number} channelId
   * @param {object} options - { states, since, offset }
   */
  async pollOrders(channelId, options = {}) {
    const adapter = this.getAdapter(channelId);
    const result = await adapter.pollOrders(options);

    // Update last_sync_at
    await this.pool.query(
      'UPDATE marketplace_channels SET last_sync_at = NOW() WHERE id = $1',
      [channelId]
    );

    return result;
  }

  /** Poll orders from ALL active channels. */
  async pollAllOrders() {
    const results = [];
    for (const [channelId, adapter] of this.adapters) {
      try {
        const result = await adapter.pollOrders();
        results.push({ channelId, channelCode: adapter.channelCode, ...result });
        await this.pool.query(
          'UPDATE marketplace_channels SET last_sync_at = NOW() WHERE id = $1',
          [channelId]
        );
      } catch (err) {
        results.push({ channelId, channelCode: adapter.channelCode, error: err.message });
      }
    }
    return results;
  }

  /**
   * Accept an order on a specific channel.
   * @param {number} channelId
   * @param {string} miraklOrderId
   * @param {Array} lines
   */
  async acceptOrder(channelId, miraklOrderId, lines) {
    const adapter = this.getAdapter(channelId);
    return adapter.acceptOrder(miraklOrderId, lines);
  }

  /**
   * Ship an order on a specific channel.
   * @param {number} channelId
   * @param {string} miraklOrderId
   * @param {object} trackingInfo - { trackingNumber, carrierCode, carrierName, carrierUrl }
   */
  async shipOrder(channelId, miraklOrderId, trackingInfo) {
    const adapter = this.getAdapter(channelId);
    return adapter.shipOrder(miraklOrderId, trackingInfo);
  }

  /**
   * Process refund on a specific channel.
   * @param {number} channelId
   * @param {string} miraklOrderId
   * @param {Array} refunds
   */
  async refundOrder(channelId, miraklOrderId, refunds) {
    const adapter = this.getAdapter(channelId);
    return adapter.refundOrder(miraklOrderId, refunds);
  }

  // ============================================================
  // RETURNS & MESSAGES
  // ============================================================

  async pollReturns(channelId, options = {}) {
    const adapter = this.getAdapter(channelId);
    return adapter.pollReturns(options);
  }

  async pollMessages(channelId, options = {}) {
    const adapter = this.getAdapter(channelId);
    return adapter.pollMessages(options);
  }

  async sendMessage(channelId, threadId, message) {
    const adapter = this.getAdapter(channelId);
    return adapter.sendMessage(threadId, message);
  }

  // ============================================================
  // VALIDATION & CONNECTION
  // ============================================================

  async testConnection(channelId) {
    const adapter = this.getAdapter(channelId);
    return adapter.testConnection();
  }

  async validateProduct(channelId, product) {
    const adapter = this.getAdapter(channelId);
    return adapter.validateProduct(product);
  }

  // ============================================================
  // CROSS-CHANNEL DASHBOARD
  // ============================================================

  /**
   * Dashboard stats across all channels.
   * Uses actual column names from marketplace_orders:
   *   total_price_cents (bigint), commission_amount (numeric),
   *   shipped_date (timestamp), mirakl_order_state, channel_id
   */
  async getDashboardStats() {
    const { rows } = await this.pool.query(`
      SELECT
        mc.id AS channel_id,
        mc.channel_code,
        mc.channel_name,
        mc.status,
        mc.last_sync_at,
        COUNT(mo.id) AS total_orders,
        COUNT(CASE WHEN mo.mirakl_order_state = 'WAITING_ACCEPTANCE' THEN 1 END) AS pending_acceptance,
        COUNT(CASE WHEN mo.mirakl_order_state = 'SHIPPING' THEN 1 END) AS awaiting_shipment,
        COUNT(CASE WHEN mo.mirakl_order_state = 'SHIPPED'
                    AND mo.shipped_date >= CURRENT_DATE THEN 1 END) AS shipped_today,
        COALESCE(SUM(CASE WHEN mo.created_at >= NOW() - INTERVAL '30 days'
                          THEN mo.total_price_cents / 100.0 END), 0) AS revenue_30d,
        COALESCE(SUM(CASE WHEN mo.created_at >= NOW() - INTERVAL '30 days'
                          THEN mo.commission_amount END), 0) AS commission_30d
      FROM marketplace_channels mc
      LEFT JOIN marketplace_orders mo ON mo.channel_id = mc.id
      GROUP BY mc.id, mc.channel_code, mc.channel_name, mc.status, mc.last_sync_at
      ORDER BY mc.channel_name
    `);

    return rows.map(r => ({
      channelId: r.channel_id,
      channelCode: r.channel_code,
      channelName: r.channel_name,
      status: r.status,
      lastSyncAt: r.last_sync_at,
      totalOrders: parseInt(r.total_orders) || 0,
      pendingAcceptance: parseInt(r.pending_acceptance) || 0,
      awaitingShipment: parseInt(r.awaiting_shipment) || 0,
      shippedToday: parseInt(r.shipped_today) || 0,
      revenue30d: parseFloat(r.revenue_30d) || 0,
      commission30d: parseFloat(r.commission_30d) || 0
    }));
  }

  /**
   * Get recent sync activity across all channels.
   */
  async getRecentSyncActivity(limit = 20) {
    const { rows } = await this.pool.query(`
      SELECT sl.*, mc.channel_code, mc.channel_name
      FROM marketplace_sync_log sl
      LEFT JOIN marketplace_channels mc ON mc.id = sl.channel_id
      ORDER BY sl.sync_start_time DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }
}

// ============================================================
// SINGLETON
// ============================================================

let instance = null;

module.exports = {
  /**
   * Get the singleton ChannelManager instance.
   * Initializes on first call (loads active channels from DB).
   */
  getInstance: async () => {
    if (!instance) {
      instance = new ChannelManager();
      await instance.initialize();
    }
    return instance;
  },

  /**
   * Reset singleton (useful for tests or hot-reload).
   */
  resetInstance: () => {
    instance = null;
  },

  ChannelManager
};
