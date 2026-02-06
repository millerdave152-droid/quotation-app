const axios = require('axios');
let pool = require('../db');

/**
 * Mirakl API Service for Best Buy Marketplace Integration
 * Handles all communication with Mirakl API
 */
class MiraklService {
  constructor() {
    // Ensure baseURL ends with /api for Mirakl endpoints
    let baseURL = process.env.MIRAKL_API_URL || 'https://bestbuy-us.mirakl.net/api';
    if (!baseURL.endsWith('/api')) {
      baseURL = baseURL.replace(/\/$/, '') + '/api';
    }
    this.baseURL = baseURL;
    this.apiKey = process.env.MIRAKL_API_KEY;
    this.shopId = process.env.MIRAKL_SHOP_ID;

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('❌ Mirakl API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Log sync activity to database
   */
  async logSync(syncType, entityType, status, details = {}) {
    try {
      const query = `
        INSERT INTO marketplace_sync_log
        (sync_type, sync_direction, entity_type, entity_id, status,
         records_processed, records_succeeded, records_failed,
         error_message, error_details, sync_start_time, sync_end_time, duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `;

      const values = [
        syncType,
        details.direction || 'inbound',
        entityType,
        details.entityId || null,
        status,
        details.recordsProcessed || 0,
        details.recordsSucceeded || 0,
        details.recordsFailed || 0,
        details.errorMessage || null,
        details.errorDetails ? JSON.stringify(details.errorDetails) : null,
        details.startTime || new Date(),
        details.endTime || new Date(),
        details.duration || 0
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error logging sync:', error);
    }
  }

  // ============================================
  // OFFER MANAGEMENT
  // ============================================

  /**
   * Get all offers from Mirakl
   */
  async getOffers(params = {}) {
    try {
      const response = await this.client.get('/offers', { params });
      return response.data.offers || [];
    } catch (error) {
      console.error('Error fetching offers:', error.message);
      throw error;
    }
  }

  /**
   * Create or update an offer on Mirakl
   */
  async createOffer(offerData) {
    try {
      // Mirakl OF21 API expects offers array format
      const payload = {
        offers: [{
          shop_sku: offerData.sku,
          product_id: offerData.product_id || offerData.sku,
          product_id_type: 'SHOP_SKU',
          quantity: offerData.quantity || 0,
          price: parseFloat(offerData.price) || 0,
          state_code: offerData.state_code || '11', // 11 = Active
          leadtime_to_ship: offerData.leadtime_to_ship || 2,
          allow_quote_requests: false
        }]
      };

      // Use OF21 endpoint for offer import
      const response = await this.client.post('/offers', payload);
      return response.data;
    } catch (error) {
      // Log detailed error information for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        sku: offerData.sku
      };
      console.error('❌ Error creating offer:', JSON.stringify(errorDetails, null, 2));

      // Throw with more context
      const detailedError = new Error(
        `Mirakl API error for SKU ${offerData.sku}: ${error.response?.data?.message || error.message}`
      );
      detailedError.details = errorDetails;
      throw detailedError;
    }
  }

  /**
   * Batch import multiple offers in a single API call
   * More efficient than individual requests and avoids rate limiting
   */
  async batchImportOffers(products) {
    try {
      // Build offers array
      const offers = products.map(product => ({
        shop_sku: product.mirakl_sku || product.model,
        product_id: product.model,
        product_id_type: 'SHOP_SKU',
        quantity: product.stock_quantity || 0,
        price: parseFloat((product.msrp_cents / 100).toFixed(2)) || 0,
        state_code: product.active && (product.stock_quantity || 0) > 0 ? '11' : '12',
        leadtime_to_ship: 2,
        allow_quote_requests: false
      }));

      const payload = { offers };

      const response = await this.client.post('/offers', payload);

      return {
        success: true,
        count: products.length,
        data: response.data
      };
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        responseData: error.response?.data
      };
      console.error('❌ Batch import failed:', JSON.stringify(errorDetails, null, 2));

      return {
        success: false,
        error: error.message,
        details: errorDetails
      };
    }
  }

  /**
   * Update offer quantity
   */
  async updateOfferQuantity(offerId, quantity) {
    try {
      const payload = {
        offers: [{
          offer_id: offerId,
          quantity: quantity
        }]
      };

      const response = await this.client.put('/offers', payload);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating offer quantity:', error.message);
      throw error;
    }
  }

  /**
   * Delete an offer
   */
  async deleteOffer(offerId) {
    try {
      await this.client.delete(`/offers/${offerId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting offer:', error.message);
      throw error;
    }
  }

  // ============================================
  // ORDER MANAGEMENT
  // ============================================

  /**
   * Get orders from Mirakl
   */
  async getOrders(params = {}) {
    try {
      // Default params
      const queryParams = {
        start_date: params.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        order_state_codes: params.order_state_codes || 'WAITING_ACCEPTANCE,SHIPPING,SHIPPED',
        ...params
      };

      const response = await this.client.get('/orders', { params: queryParams });
      return response.data.orders || [];
    } catch (error) {
      console.error('❌ Error fetching orders:', error.message);
      throw error;
    }
  }

  /**
   * Accept an order
   */
  async acceptOrder(orderId, orderLines = []) {
    try {
      const payload = {
        order_lines: orderLines.map(line => ({
          accepted: true,
          id: line.id
        }))
      };

      const response = await this.client.put(`/orders/${orderId}/accept`, payload);
      return response.data;
    } catch (error) {
      console.error('❌ Error accepting order:', error.message);
      throw error;
    }
  }

  /**
   * Refuse an order
   */
  async refuseOrder(orderId, orderLines = [], reason) {
    try {
      const payload = {
        order_lines: orderLines.map(line => ({
          accepted: false,
          id: line.id,
          refused_reason_code: reason || '13' // Out of stock
        }))
      };

      const response = await this.client.put(`/orders/${orderId}/refuse`, payload);
      return response.data;
    } catch (error) {
      console.error('❌ Error refusing order:', error.message);
      throw error;
    }
  }

  // ============================================
  // SHIPPING/TRACKING
  // ============================================

  /**
   * Create shipment for an order
   */
  async createShipment(shipmentData) {
    try {
      const payload = {
        order_id: shipmentData.order_id,
        tracking_number: shipmentData.tracking_number,
        carrier_code: shipmentData.carrier_code,
        carrier_name: shipmentData.carrier_name || '',
        shipped_items: shipmentData.shipped_items || []
      };

      const response = await this.client.post('/shipments', payload);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating shipment:', error.message);
      throw error;
    }
  }

  /**
   * Update tracking information
   */
  async updateTracking(orderId, trackingNumber, carrierCode) {
    try {
      const payload = {
        tracking: {
          carrier_code: carrierCode,
          tracking_number: trackingNumber
        }
      };

      const response = await this.client.put(`/orders/${orderId}/tracking`, payload);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating tracking:', error.message);
      throw error;
    }
  }

  // ============================================
  // PRODUCT SYNCHRONIZATION
  // ============================================

  /**
   * Sync product to Mirakl as an offer
   */
  async syncProductToMirakl(productId) {
    const startTime = Date.now();

    try {
      // Get product from database
      const productQuery = await pool.query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );

      if (productQuery.rows.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      const product = productQuery.rows[0];

      // Create offer data - use actual stock_quantity from product
      const stockQuantity = product.stock_quantity !== null && product.stock_quantity !== undefined
        ? product.stock_quantity
        : 0;

      const offerData = {
        sku: product.mirakl_sku || product.model,
        product_id: product.model,
        quantity: stockQuantity,
        price: (product.msrp_cents / 100).toFixed(2),
        state_code: product.active && stockQuantity > 0 ? '11' : '12', // 11=active, 12=inactive/out of stock
        leadtime_to_ship: 2
      };

      // Create/update offer on Mirakl
      const miraklResponse = await this.createOffer(offerData);

      // Update product with Mirakl info
      await pool.query(
        `UPDATE products
         SET mirakl_sku = $1, mirakl_offer_id = $2, last_synced_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [offerData.sku, miraklResponse.offer_id, productId]
      );

      // Log successful sync
      await this.logSync('product_sync', 'product', 'SUCCESS', {
        entityId: productId,
        direction: 'outbound',
        recordsProcessed: 1,
        recordsSucceeded: 1,
        recordsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });

      return miraklResponse;

    } catch (error) {
      console.error('Product sync failed:', error.message);

      // Log failed sync
      await this.logSync('product_sync', 'product', 'FAILED', {
        entityId: productId,
        direction: 'outbound',
        recordsProcessed: 1,
        recordsSucceeded: 0,
        recordsFailed: 1,
        errorMessage: error.message,
        errorDetails: { error: error.toString() },
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Sync order from Mirakl to local database
   */
  async syncOrderToDatabase(miraklOrder) {
    const startTime = Date.now();

    try {
      // Check if order already exists
      const existingOrder = await pool.query(
        'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1',
        [miraklOrder.order_id]
      );

      // Helper to safely parse numbers and convert to cents
      const toCents = (value) => {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : Math.round(num * 100);
      };

      const totalPriceCents = toCents(miraklOrder.total_price);
      const shippingPriceCents = toCents(miraklOrder.shipping_price);
      const taxCents = toCents(miraklOrder.total_tax);

      let orderId;

      if (existingOrder.rows.length > 0) {
        // Update existing order
        const updateQuery = `
          UPDATE marketplace_orders
          SET order_state = $1,
              shipping_address = $2,
              billing_address = $3,
              order_lines = $4,
              total_price_cents = $5,
              shipping_price_cents = $6,
              tax_cents = $7,
              last_updated = $8,
              updated_at = CURRENT_TIMESTAMP
          WHERE mirakl_order_id = $9
          RETURNING id
        `;

        const result = await pool.query(updateQuery, [
          miraklOrder.order_state,
          JSON.stringify(miraklOrder.shipping_address),
          JSON.stringify(miraklOrder.billing_address),
          JSON.stringify(miraklOrder.order_lines),
          totalPriceCents,
          shippingPriceCents,
          taxCents,
          miraklOrder.last_updated_date,
          miraklOrder.order_id
        ]);

        orderId = result.rows[0].id;

      } else {
        // Insert new order
        const insertQuery = `
          INSERT INTO marketplace_orders
          (mirakl_order_id, order_state, customer_name, customer_email,
           shipping_address, billing_address, order_lines, total_price_cents,
           shipping_price_cents, tax_cents, currency, payment_type,
           order_date, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `;

        const result = await pool.query(insertQuery, [
          miraklOrder.order_id,
          miraklOrder.order_state,
          miraklOrder.customer.firstname + ' ' + miraklOrder.customer.lastname,
          miraklOrder.customer.email || '',
          JSON.stringify(miraklOrder.shipping_address),
          JSON.stringify(miraklOrder.billing_address),
          JSON.stringify(miraklOrder.order_lines),
          totalPriceCents,
          shippingPriceCents,
          taxCents,
          miraklOrder.currency_iso_code || 'USD',
          miraklOrder.payment_type || '',
          miraklOrder.created_date,
          miraklOrder.last_updated_date
        ]);

        orderId = result.rows[0].id;

        // Insert order items
        for (const line of miraklOrder.order_lines || []) {
          await pool.query(
            `INSERT INTO marketplace_order_items
             (order_id, order_line_id, product_sku, quantity, unit_price_cents, total_price_cents, offer_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              orderId,
              line.order_line_id || '',
              line.offer_sku || line.product_sku || '',
              parseInt(line.quantity) || 1,
              toCents(line.unit_price || line.price),
              toCents(line.total_price || (line.unit_price * (line.quantity || 1))),
              line.offer_id || null
            ]
          );
        }
      }

      // Log successful sync
      await this.logSync('order_sync', 'order', 'SUCCESS', {
        entityId: miraklOrder.order_id,
        direction: 'inbound',
        recordsProcessed: 1,
        recordsSucceeded: 1,
        recordsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });

      return orderId;

    } catch (error) {
      console.error('Order sync failed:', error.message);

      // Log failed sync
      await this.logSync('order_sync', 'order', 'FAILED', {
        entityId: miraklOrder.order_id,
        direction: 'inbound',
        recordsProcessed: 1,
        recordsSucceeded: 0,
        recordsFailed: 1,
        errorMessage: error.message,
        errorDetails: { error: error.toString() },
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });

      throw error;
    }
  }
}

MiraklService.prototype._setPool = function(p) { pool = p; };

// Export singleton instance
module.exports = new MiraklService();
