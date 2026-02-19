const pool = require('../../db');

/**
 * ChannelAdapter — Base class for all marketplace channel adapters.
 *
 * Every channel (Best Buy / Mirakl, Amazon, Walmart, etc.) extends this class
 * and implements the methods relevant to that channel's API.
 *
 * Constructor expects a row from the `marketplace_channels` table.
 */
class ChannelAdapter {
  constructor(channel) {
    // channel = row from marketplace_channels table
    this.channel = channel;
    this.channelId = channel.id;
    this.channelCode = channel.channel_code;
    this.channelName = channel.channel_name;
    this.apiUrl = channel.api_url;
    this.credentials = channel.credentials || {};
    this.config = channel.config || {};
    this.pool = pool;
  }

  // === OFFERS / LISTINGS ===

  async pushOffers(listings) {
    // listings = array of product_channel_listings rows joined with product data
    // Push product offers/listings to the channel
    // Return: { submitted: count, importId: string }
    throw new Error(`pushOffers not implemented for ${this.channelCode}`);
  }

  async pushSingleOffer(listing) {
    // Push a single product offer update
    // Return: { success: boolean }
    throw new Error(`pushSingleOffer not implemented for ${this.channelCode}`);
  }

  async getRemoteOffers(options = {}) {
    // Fetch current offers/listings from the channel
    // Return: [{ sku, price, quantity, status, ... }]
    throw new Error(`getRemoteOffers not implemented for ${this.channelCode}`);
  }

  async checkImportStatus(importId) {
    // Check status of a bulk import job
    // Return: { status, processed, errors }
    throw new Error(`checkImportStatus not implemented for ${this.channelCode}`);
  }

  // === ORDERS ===

  async pollOrders(options = {}) {
    // Fetch orders from channel, upsert into marketplace_orders
    // Return: { newOrders, updatedOrders, totalPolled }
    throw new Error(`pollOrders not implemented for ${this.channelCode}`);
  }

  async acceptOrder(orderId, lines) {
    // Accept/refuse order lines
    throw new Error(`acceptOrder not implemented for ${this.channelCode}`);
  }

  async shipOrder(orderId, trackingInfo) {
    // Update tracking and confirm shipment
    throw new Error(`shipOrder not implemented for ${this.channelCode}`);
  }

  async refundOrder(orderId, refunds) {
    // Process refunds on order lines
    throw new Error(`refundOrder not implemented for ${this.channelCode}`);
  }

  // === INVENTORY ===

  async pushInventory(stockUpdates) {
    // stockUpdates = [{ sku, quantity }]
    // Push stock levels to channel
    // Return: { submitted: count, importId: string }
    throw new Error(`pushInventory not implemented for ${this.channelCode}`);
  }

  // === RETURNS ===

  async pollReturns(options = {}) {
    // Fetch return requests from channel
    // Return: [{ returnId, orderId, items, reason, status }]
    throw new Error(`pollReturns not implemented for ${this.channelCode}`);
  }

  // === MESSAGES ===

  async pollMessages(options = {}) {
    // Fetch customer messages
    throw new Error(`pollMessages not implemented for ${this.channelCode}`);
  }

  async sendMessage(threadId, message) {
    throw new Error(`sendMessage not implemented for ${this.channelCode}`);
  }

  // === VALIDATION ===

  async validateProduct(product) {
    // Validate a product meets this channel's listing requirements
    // Return: { valid, errors, warnings }
    throw new Error(`validateProduct not implemented for ${this.channelCode}`);
  }

  // === UTILITIES ===

  async testConnection() {
    // Test if credentials are valid and API is reachable
    // Return: { connected: boolean, message: string }
    throw new Error(`testConnection not implemented for ${this.channelCode}`);
  }

  getFeatures() {
    // Return channel capabilities
    return this.channel.features || {};
  }

  // Shared retry logic — subclasses can use this
  async _retryableRequest(fn, label, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          throw err; // don't retry auth errors
        }
        if (err.response?.status === 429) {
          const retryAfter = parseInt(err.response.headers['retry-after'] || '60', 10);
          console.warn(`[${this.channelCode}] Rate limited on ${label}, waiting ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }
        if (attempt === maxRetries) throw err;
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[${this.channelCode}] ${label} failed (attempt ${attempt}), retrying in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  /**
   * Log to marketplace_sync_log.
   *
   * Actual table columns:
   *   id, sync_type, sync_direction, entity_type, entity_id, status,
   *   records_processed, records_succeeded, records_failed,
   *   error_message, error_details, sync_start_time, sync_end_time,
   *   duration_ms, created_at, channel_id
   */
  async _logSync(syncType, entityType, status, details = {}) {
    try {
      const startTime = details.startedAt || new Date();
      const endTime = new Date();
      const durationMs = endTime - startTime;

      await this.pool.query(
        `INSERT INTO marketplace_sync_log
           (channel_id, sync_type, sync_direction, entity_type, entity_id, status,
            records_processed, records_succeeded, records_failed,
            error_message, error_details, sync_start_time, sync_end_time, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          this.channelId,
          syncType,
          details.direction || 'outbound',
          entityType,
          details.entityId || null,
          status,
          details.count || 0,
          details.succeeded || 0,
          details.failed || 0,
          details.error || null,
          details.errorDetails ? JSON.stringify(details.errorDetails) : null,
          startTime,
          endTime,
          durationMs
        ]
      );
    } catch (e) {
      console.error('Failed to log sync:', e.message);
    }
  }
}

module.exports = ChannelAdapter;
