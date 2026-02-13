const axios = require('axios');
const FormData = require('form-data');
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
  // HELPERS
  // ============================================

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _stripHtml(input) {
    if (!input) return '';
    return String(input).replace(/<[^>]*>/g, '');
  }

  _escapeCsvValue(input) {
    if (input == null) return '';
    return String(input)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/;/g, '\\;');
  }

  _formatDate(dateValue) {
    if (!dateValue) return '';
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  _getStockQuantity(product) {
    const candidates = [
      product.stock_quantity,
      product.qty_on_hand,
      product.quantity,
      product.quantity_in_stock,
      product.stock,
      product.qty_available,
      product.qty_on_hand
    ];
    const value = candidates.find(v => v !== null && v !== undefined);
    const num = parseInt(value, 10);
    return Number.isNaN(num) ? 0 : num;
  }

  _getProductIdAndType(product) {
    const raw = product.upc || '';
    const id = String(raw).replace(/\D/g, '');
    if (id.length === 13) return { id, type: 'EAN' };
    if (id.length === 12) return { id, type: 'UPC' };
    return { id: id || '', type: '' };
  }

  // ============================================
  // OFFER CSV IMPORT (OF01)
  // ============================================

  /**
   * Generate semicolon-delimited CSV for Mirakl OF01 offer import.
   * @param {Array<object>} products
   * @returns {string}
   */
  generateOfferCSV(products = []) {
    const header = [
      'sku',
      'product-id',
      'product-id-type',
      'description',
      'internal-description',
      'price',
      'price-additional-info',
      'quantity',
      'min-quantity-alert',
      'state',
      'available-start-date',
      'available-end-date',
      'logistic-class',
      'discount-price',
      'discount-start-date',
      'discount-end-date',
      'leadtime-to-ship',
      'update-delete',
      'product-tax-code'
    ].join(';');

    const today = this._formatDate(new Date());

    const rows = products.map((product) => {
      const skuRaw = product.sku || product.mirakl_sku || product.model || '';
      const sku = String(skuRaw).slice(0, 40);
      const { id: productId, type: productIdType } = this._getProductIdAndType(product);
      const description = this._escapeCsvValue(
        this._stripHtml(product.description || product.name || '')
      ).slice(0, 2000);

      const price = parseFloat(product.price || (product.msrp_cents ? product.msrp_cents / 100 : 0)) || 0;
      const quantity = this._getStockQuantity(product);
      const minQtyAlert = product.bestbuy_min_quantity_alert != null ? product.bestbuy_min_quantity_alert : 5;
      const logisticClass = product.bestbuy_logistic_class || 'L';
      const discountPrice = product.marketplace_discount_price != null ? product.marketplace_discount_price : '';
      const discountStart = this._formatDate(product.marketplace_discount_start);
      const discountEnd = this._formatDate(product.marketplace_discount_end);
      const leadtime = product.bestbuy_leadtime_to_ship != null ? product.bestbuy_leadtime_to_ship : 2;
      const productTaxCode = product.bestbuy_product_tax_code || '';

      return [
        sku,
        productId,
        productIdType,
        description,
        '',
        price > 0 ? price.toFixed(2) : '',
        '',
        quantity,
        minQtyAlert,
        '11',
        today,
        '',
        logisticClass,
        discountPrice === '' ? '' : parseFloat(discountPrice).toFixed(2),
        discountStart,
        discountEnd,
        leadtime,
        '',
        productTaxCode
      ].map(v => this._escapeCsvValue(v)).join(';');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Upload offers CSV to Mirakl (OF01).
   * @param {string} csvString
   * @param {string} importType
   */
  async uploadOfferCSV(csvString, importType = 'OFFER') {
    const startTime = Date.now();
    const timestamp = Date.now();
    const fileName = `offers_import_${timestamp}.csv`;
    const form = new FormData();
    form.append('file', Buffer.from(csvString, 'utf8'), { filename: fileName, contentType: 'text/csv' });
    form.append('import_type', importType);

    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        const response = await this.client.post('/offers/imports', form, {
          headers: {
            ...form.getHeaders(),
            'Authorization': this.apiKey
          }
        });

        const importId = response.data?.import_id || response.data?.import?.import_id || null;

        if (importId) {
          await pool.query(
            `INSERT INTO marketplace_offer_imports
             (mirakl_import_id, import_type, file_name, status, submitted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [importId, importType, fileName, response.data?.status || 'SUBMITTED']
          );
        }

        await this.logSync('offer_import', 'offer', 'SUCCESS', {
          direction: 'outbound',
          recordsProcessed: 0,
          recordsSucceeded: 0,
          recordsFailed: 0,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime
        });

        return response.data;
      } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          console.error('❌ Mirakl auth error during offer import:', error.response?.data || error.message);
          throw error;
        }

        if (status === 429 && attempt < maxRetries) {
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '1', 10);
          await this._sleep(Math.max(1, retryAfter) * 1000);
          attempt += 1;
          continue;
        }

        if (status >= 500 && status < 600 && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await this._sleep(backoff);
          attempt += 1;
          continue;
        }

        await this.logSync('offer_import', 'offer', 'FAILED', {
          direction: 'outbound',
          errorMessage: error.message,
          errorDetails: error.response?.data || { error: error.toString() },
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime
        });

        throw error;
      }
    }
  }

  /**
   * Check Mirakl import status (OF02) and fetch error report (OF03) if complete.
   * @param {string} miraklImportId
   */
  async checkImportStatus(miraklImportId) {
    const response = await this.client.get(`/offers/imports/${miraklImportId}`);
    const data = response.data || {};
    const status = data.status || data.import_status || data.import?.status || 'UNKNOWN';

    let errorReport = null;
    if (status === 'COMPLETE' || status === 'COMPLETED') {
      try {
        const errRes = await this.client.get(`/offers/imports/${miraklImportId}/error_report`, {
          responseType: 'text'
        });
        errorReport = errRes.data || null;
      } catch (err) {
        console.warn('⚠️ Failed to fetch Mirakl error report:', err.message);
      }
    }

    const recordsProcessed = data.lines_read || data.imported_lines || data.records_processed || 0;
    const recordsWithErrors = data.lines_in_error || data.rejected_lines || data.records_with_errors || 0;

    await pool.query(
      `UPDATE marketplace_offer_imports
       SET status = $1,
           records_processed = $2,
           records_with_errors = $3,
           error_report = $4,
           completed_at = CASE WHEN $1 IN ('COMPLETE','COMPLETED') THEN NOW() ELSE completed_at END
       WHERE mirakl_import_id = $5`,
      [status, recordsProcessed, recordsWithErrors, errorReport, miraklImportId]
    );

    return { ...data, status, error_report: errorReport };
  }

  /**
   * Update a single offer (OF24)
   * @param {object} product
   */
  async updateSingleOffer(product) {
    const startTime = Date.now();
    const { id: productId } = product;
    const sku = product.sku || product.mirakl_sku || product.model;
    const { id: productIdValue, type: productIdType } = this._getProductIdAndType(product);
    const price = parseFloat(product.price || (product.msrp_cents ? product.msrp_cents / 100 : 0)) || 0;
    const quantity = this._getStockQuantity(product);
    const logisticClass = product.bestbuy_logistic_class || 'L';
    const leadtime = product.bestbuy_leadtime_to_ship != null ? product.bestbuy_leadtime_to_ship : 2;

    const payload = {
      offers: [{
        state_code: '11',
        shop_sku: sku,
        product_id: productIdValue,
        product_id_type: productIdType || 'UPC',
        price,
        quantity,
        logistic_class: logisticClass,
        leadtime_to_ship: leadtime,
        update_delete: ''
      }]
    };

    const maxRetries = 3;
    let attempt = 0;
    while (true) {
      try {
        const response = await this.client.post('/offers', payload, {
          headers: { 'Content-Type': 'application/json' }
        });

        if (productId) {
          await pool.query(
            `UPDATE products
             SET mirakl_last_offer_sync = NOW()
             WHERE id = $1`,
            [productId]
          );
        }

        await this.logSync('offer_update', 'offer', 'SUCCESS', {
          direction: 'outbound',
          entityId: productId || null,
          recordsProcessed: 1,
          recordsSucceeded: 1,
          recordsFailed: 0,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime
        });

        return response.data;
      } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          console.error('❌ Mirakl auth error during offer update:', error.response?.data || error.message);
          throw error;
        }

        if (status === 429 && attempt < maxRetries) {
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '1', 10);
          await this._sleep(Math.max(1, retryAfter) * 1000);
          attempt += 1;
          continue;
        }

        if (status >= 500 && status < 600 && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await this._sleep(backoff);
          attempt += 1;
          continue;
        }

        await this.logSync('offer_update', 'offer', 'FAILED', {
          direction: 'outbound',
          entityId: productId || null,
          recordsProcessed: 1,
          recordsSucceeded: 0,
          recordsFailed: 1,
          errorMessage: error.message,
          errorDetails: error.response?.data || { error: error.toString() },
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime
        });

        throw error;
      }
    }
  }

  /**
   * Get offer list (OF21)
   */
  async getOfferList(options = {}) {
    const offset = Number.isFinite(options.offset) ? options.offset : 0;
    const max = Number.isFinite(options.max) ? Math.min(options.max, 100) : 100;
    const response = await this.client.get('/offers', { params: { offset, max } });
    return response.data?.offers || [];
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
  // RETRY HELPER
  // ============================================

  /**
   * Execute an API call with rate-limit (429) and server-error (5xx) retry.
   * Auth errors (401/403) are thrown immediately.
   * @param {Function} fn  - async () => axios response
   * @param {string} label - for logging
   * @param {number} maxRetries
   * @returns {Promise<object>} response.data
   */
  async _retryableRequest(fn, label = 'request', maxRetries = 3) {
    let attempt = 0;
    while (true) {
      try {
        const response = await fn();
        return response.data;
      } catch (error) {
        const status = error.response?.status;

        if (status === 401 || status === 403) {
          console.error(`[Mirakl] Auth error (${status}) during ${label}:`, error.response?.data || error.message);
          throw error;
        }

        if (status === 429 && attempt < maxRetries) {
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '2', 10);
          console.warn(`[Mirakl] 429 rate-limited on ${label}, retry ${attempt + 1}/${maxRetries} after ${retryAfter}s`);
          await this._sleep(Math.max(1, retryAfter) * 1000);
          attempt++;
          continue;
        }

        if (status >= 500 && status < 600 && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`[Mirakl] ${status} server error on ${label}, retry ${attempt + 1}/${maxRetries} after ${backoff}ms`);
          await this._sleep(backoff);
          attempt++;
          continue;
        }

        throw error;
      }
    }
  }

  // ============================================
  // ORDER MANAGEMENT
  // ============================================

  /**
   * Poll orders from Mirakl (OR11) with pagination and DB upsert.
   * @param {object} options
   * @param {string} options.states   - comma-separated order states
   * @param {string} options.since    - ISO date string to filter by
   * @param {number} options.offset   - starting offset
   * @returns {{ newOrders, updatedOrders, totalPolled, errors }}
   */
  async pollOrders(options = {}) {
    const startTime = Date.now();
    const states = options.states || 'WAITING_ACCEPTANCE,SHIPPING,SHIPPED,RECEIVED';
    const errors = [];
    let newOrders = 0;
    let updatedOrders = 0;
    let totalPolled = 0;
    let offset = options.offset || 0;
    const pageSize = 100;

    try {
      while (true) {
        const params = {
          order_state_codes: states,
          max: pageSize,
          offset,
          sort: 'date_created:desc'
        };
        if (options.since) params.start_date = options.since;

        const data = await this._retryableRequest(
          () => this.client.get('/orders', { params }),
          'pollOrders'
        );

        const orders = data.orders || [];
        totalPolled += orders.length;

        for (const order of orders) {
          try {
            const result = await this._upsertOrder(order);
            if (result === 'inserted') newOrders++;
            else updatedOrders++;
          } catch (err) {
            errors.push({ orderId: order.order_id, error: err.message });
            console.error(`[Mirakl] Failed to upsert order ${order.order_id}:`, err.message);
          }
        }

        // If we got a full page, there may be more
        if (orders.length < pageSize) break;
        offset += pageSize;
      }

      await this.logSync('order_poll', 'order', errors.length > 0 ? 'PARTIAL' : 'SUCCESS', {
        direction: 'inbound',
        recordsProcessed: totalPolled,
        recordsSucceeded: newOrders + updatedOrders,
        recordsFailed: errors.length,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });
    } catch (error) {
      await this.logSync('order_poll', 'order', 'FAILED', {
        direction: 'inbound',
        recordsProcessed: totalPolled,
        recordsSucceeded: newOrders + updatedOrders,
        recordsFailed: errors.length + 1,
        errorMessage: error.message,
        errorDetails: error.response?.data || { error: error.toString() },
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime
      });
      throw error;
    }

    return { newOrders, updatedOrders, totalPolled, errors };
  }

  /**
   * Upsert a single Mirakl order + its line items into the database.
   * @returns {'inserted'|'updated'}
   */
  async _upsertOrder(order) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const customerName = order.customer
        ? `${order.customer.firstname || ''} ${order.customer.lastname || ''}`.trim()
        : '';
      const customerEmail = order.customer?.email || '';
      const customerPhone = order.customer?.shipping_address?.phone || order.customer?.phone || '';
      const shippingAddress = order.customer?.shipping_address || order.shipping_address || null;
      const totalPrice = parseFloat(order.total_price || 0);
      const totalCommission = parseFloat(order.total_commission || 0);
      const commissionRate = order.order_lines?.[0]?.commission_rate_vat
        ? parseFloat(order.order_lines[0].commission_rate_vat)
        : null;
      const shippingPrice = order.order_lines
        ? order.order_lines.reduce((sum, l) => sum + parseFloat(l.shipping_amount || 0), 0)
        : 0;
      const taxesTotal = order.order_lines
        ? order.order_lines.reduce((sum, l) => {
            const taxes = l.shipping_taxes || l.taxes || [];
            return sum + taxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
          }, 0)
        : 0;

      const totalPriceCents = Math.round(totalPrice * 100);
      const shippingPriceCents = Math.round(shippingPrice * 100);
      const taxCents = Math.round(taxesTotal * 100);
      const commissionCents = Math.round(totalCommission * 100);

      // UPSERT order
      const upsertResult = await client.query(`
        INSERT INTO marketplace_orders (
          mirakl_order_id, order_state, mirakl_order_state,
          customer_name, customer_email, customer_phone,
          shipping_address, order_lines,
          total_price_cents, shipping_price_cents, tax_cents, commission_fee_cents,
          shipping_price, commission_amount, commission_rate, taxes_total,
          currency, currency_code,
          order_date, acceptance_deadline, last_updated, last_polled_at
        ) VALUES (
          $1, $2, $2,
          $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $16,
          $17, $18, $19, NOW()
        )
        ON CONFLICT (mirakl_order_id) DO UPDATE SET
          order_state = EXCLUDED.order_state,
          mirakl_order_state = EXCLUDED.mirakl_order_state,
          customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), marketplace_orders.customer_name),
          customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), marketplace_orders.customer_email),
          customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), marketplace_orders.customer_phone),
          shipping_address = COALESCE(EXCLUDED.shipping_address, marketplace_orders.shipping_address),
          order_lines = EXCLUDED.order_lines,
          total_price_cents = EXCLUDED.total_price_cents,
          shipping_price_cents = EXCLUDED.shipping_price_cents,
          tax_cents = EXCLUDED.tax_cents,
          commission_fee_cents = EXCLUDED.commission_fee_cents,
          shipping_price = EXCLUDED.shipping_price,
          commission_amount = EXCLUDED.commission_amount,
          commission_rate = COALESCE(EXCLUDED.commission_rate, marketplace_orders.commission_rate),
          taxes_total = EXCLUDED.taxes_total,
          acceptance_deadline = COALESCE(EXCLUDED.acceptance_deadline, marketplace_orders.acceptance_deadline),
          last_updated = EXCLUDED.last_updated,
          last_polled_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, (xmax = 0) AS inserted
      `, [
        order.order_id,
        order.order_state,
        customerName,
        customerEmail,
        customerPhone,
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        JSON.stringify(order.order_lines || []),
        totalPriceCents,
        shippingPriceCents,
        taxCents,
        commissionCents,
        shippingPrice,
        totalCommission,
        commissionRate,
        taxesTotal,
        order.currency_iso_code || 'CAD',
        order.created_date || null,
        order.acceptance_decision_date || null,
        order.last_updated_date || null
      ]);

      const localOrderId = upsertResult.rows[0].id;
      const wasInserted = upsertResult.rows[0].inserted;

      // Upsert order line items
      for (const line of (order.order_lines || [])) {
        const offerSku = line.offer_sku || line.product_sku || '';
        const unitPrice = parseFloat(line.price || 0);
        const lineTotal = unitPrice * (parseInt(line.quantity) || 1);
        const lineCommission = parseFloat(line.commission_amount || 0);
        const lineTaxes = (line.taxes || []);

        // Match to internal product
        let productId = null;
        if (offerSku) {
          const match = await client.query(
            'SELECT id FROM products WHERE sku = $1 LIMIT 1',
            [offerSku]
          );
          if (match.rows.length > 0) productId = match.rows[0].id;
        }

        await client.query(`
          INSERT INTO marketplace_order_items (
            order_id, mirakl_order_line_id, order_line_id,
            product_id, product_sku, offer_sku, offer_id,
            quantity, unit_price, unit_price_cents, line_total, total_price_cents,
            commission_amount, commission_fee_cents,
            taxes, tax_cents,
            status
          ) VALUES (
            $1, $2, $2,
            $3, $4, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12,
            $13, $14,
            'PENDING'
          )
          ON CONFLICT (order_id, mirakl_order_line_id)
            WHERE mirakl_order_line_id IS NOT NULL
          DO UPDATE SET
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            unit_price_cents = EXCLUDED.unit_price_cents,
            line_total = EXCLUDED.line_total,
            total_price_cents = EXCLUDED.total_price_cents,
            commission_amount = EXCLUDED.commission_amount,
            commission_fee_cents = EXCLUDED.commission_fee_cents,
            taxes = EXCLUDED.taxes,
            tax_cents = EXCLUDED.tax_cents,
            product_id = COALESCE(EXCLUDED.product_id, marketplace_order_items.product_id),
            updated_at = CURRENT_TIMESTAMP
        `, [
          localOrderId,
          line.order_line_id || null,
          productId,
          offerSku,
          line.offer_id || null,
          parseInt(line.quantity) || 1,
          unitPrice,
          Math.round(unitPrice * 100),
          lineTotal,
          Math.round(lineTotal * 100),
          lineCommission,
          Math.round(lineCommission * 100),
          lineTaxes.length > 0 ? JSON.stringify(lineTaxes) : null,
          Math.round(lineTaxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0) * 100)
        ]);
      }

      await client.query('COMMIT');
      return wasInserted ? 'inserted' : 'updated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Accept or refuse order lines (OR21).
   * @param {string} miraklOrderId
   * @param {Array<{id: string, accepted: boolean, reason_code?: string}>} lines
   */
  async acceptOrderLines(miraklOrderId, lines) {
    const startTime = Date.now();

    const payload = {
      order_lines: lines.map(line => {
        const entry = { id: line.id, accepted: line.accepted };
        if (!line.accepted && line.reason_code) {
          entry.reason_code = line.reason_code;
        }
        return entry;
      })
    };

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/accept`, payload),
      `acceptOrderLines(${miraklOrderId})`
    );

    // Update local DB
    const orderResult = await pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1',
      [miraklOrderId]
    );

    if (orderResult.rows.length > 0) {
      const localOrderId = orderResult.rows[0].id;

      // Update order state
      await pool.query(
        `UPDATE marketplace_orders
         SET mirakl_order_state = COALESCE($1, mirakl_order_state),
             order_state = COALESCE($1, order_state),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [data?.order_state || null, localOrderId]
      );

      // Update each line item status
      for (const line of lines) {
        const status = line.accepted ? 'ACCEPTED' : 'REFUSED';
        await pool.query(
          `UPDATE marketplace_order_items
           SET status = $1,
               refused_reason = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE order_id = $3 AND mirakl_order_line_id = $4`,
          [status, line.accepted ? null : (line.reason_code || null), localOrderId, line.id]
        );
      }
    }

    await this.logSync('order_accept', 'order', 'SUCCESS', {
      direction: 'outbound',
      entityId: miraklOrderId,
      recordsProcessed: lines.length,
      recordsSucceeded: lines.filter(l => l.accepted).length,
      recordsFailed: lines.filter(l => !l.accepted).length,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return data;
  }

  // ============================================
  // SHIPPING/TRACKING
  // ============================================

  /**
   * Update tracking information for an order (OR23).
   * Supports registered carriers (by code) or unregistered (by name/url).
   * @param {string} miraklOrderId
   * @param {string} trackingNumber
   * @param {string} [carrierCode]  - e.g. CANADA_POST, PUROLATOR, UPS, FEDEX, DHL
   * @param {string} [carrierName]  - for unregistered carriers
   * @param {string} [carrierUrl]   - tracking URL template for unregistered carriers
   */
  async updateTracking(miraklOrderId, trackingNumber, carrierCode, carrierName, carrierUrl) {
    const startTime = Date.now();

    let payload;
    if (carrierCode) {
      payload = { carrier_code: carrierCode, tracking_number: trackingNumber };
    } else {
      payload = {
        carrier_name: carrierName || 'Other',
        carrier_url: carrierUrl || '',
        tracking_number: trackingNumber
      };
    }

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/tracking`, payload),
      `updateTracking(${miraklOrderId})`
    );

    // Update local order items with tracking info
    const orderResult = await pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1',
      [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      await pool.query(
        `UPDATE marketplace_order_items
         SET shipping_tracking = $1,
             shipping_carrier = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $3 AND status = 'ACCEPTED'`,
        [trackingNumber, carrierCode || carrierName || 'Other', orderResult.rows[0].id]
      );
    }

    await this.logSync('order_tracking', 'order', 'SUCCESS', {
      direction: 'outbound',
      entityId: miraklOrderId,
      recordsProcessed: 1, recordsSucceeded: 1, recordsFailed: 0,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return data;
  }

  /**
   * Confirm shipment for an order (OR24).
   * @param {string} miraklOrderId
   */
  async confirmShipment(miraklOrderId) {
    const startTime = Date.now();

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/ship`),
      `confirmShipment(${miraklOrderId})`
    );

    // Update local DB
    const orderResult = await pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1',
      [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      const localId = orderResult.rows[0].id;
      await pool.query(
        `UPDATE marketplace_orders
         SET mirakl_order_state = 'SHIPPED', order_state = 'SHIPPED',
             shipped_date = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [localId]
      );
      await pool.query(
        `UPDATE marketplace_order_items
         SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'ACCEPTED'`,
        [localId]
      );
    }

    await this.logSync('order_ship', 'order', 'SUCCESS', {
      direction: 'outbound',
      entityId: miraklOrderId,
      recordsProcessed: 1, recordsSucceeded: 1, recordsFailed: 0,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return data;
  }

  /**
   * Process refund for order lines (OR28).
   * @param {string} miraklOrderId
   * @param {Array<{order_line_id: string, amount: number, reason_code: string, shipping_amount?: number}>} refunds
   *   reason_code: PRODUCT_RETURNED | PRODUCT_DAMAGED | PRODUCT_WRONG | PRODUCT_LATE | COMMERCIAL_GESTURE
   */
  async processRefund(miraklOrderId, refunds) {
    const startTime = Date.now();

    const payload = {
      refunds: refunds.map(r => ({
        order_line_id: r.order_line_id,
        amount: r.amount,
        reason_code: r.reason_code || 'PRODUCT_RETURNED',
        shipping_amount: r.shipping_amount || 0
      }))
    };

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/refund`, payload),
      `processRefund(${miraklOrderId})`
    );

    // Update local line item statuses
    const orderResult = await pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1',
      [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      const localId = orderResult.rows[0].id;
      for (const refund of refunds) {
        await pool.query(
          `UPDATE marketplace_order_items
           SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP
           WHERE order_id = $1 AND mirakl_order_line_id = $2`,
          [localId, refund.order_line_id]
        );
      }
    }

    await this.logSync('order_refund', 'order', 'SUCCESS', {
      direction: 'outbound',
      entityId: miraklOrderId,
      recordsProcessed: refunds.length,
      recordsSucceeded: refunds.length,
      recordsFailed: 0,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return data;
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

  // ============================================
  // INVENTORY MANAGEMENT
  // ============================================

  /**
   * Queue an inventory change for batch sync to Mirakl.
   * Fast insert only — must not slow down POS checkout.
   * @param {number} productId
   * @param {string} sku
   * @param {number} oldQty
   * @param {number} newQty
   * @param {string} changeSource - POS_SALE|MANUAL_ADJUST|RECEIVING|RETURN|QUOTE_CONVERT|CYCLE_COUNT|ORDER_ACCEPT
   * @returns {number} queue_id
   */
  async queueInventoryChange(productId, sku, oldQty, newQty, changeSource) {
    const result = await pool.query(
      `INSERT INTO marketplace_inventory_queue (product_id, sku, old_quantity, new_quantity, change_source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING queue_id`,
      [productId, sku, oldQty, newQty, changeSource]
    );
    return result.rows[0].queue_id;
  }

  /**
   * Process pending inventory changes as a batch stock-only upload (STO01).
   * Collapses multiple queued changes per product into a single current-stock row.
   * @returns {{ processed: number, importId?: string, dbImportId?: number, message?: string }}
   */
  async processInventoryBatch() {
    const startTime = Date.now();

    // 1. Get distinct pending products with their current live stock
    const pending = await pool.query(`
      SELECT DISTINCT ON (q.product_id)
        q.product_id, q.sku, p.stock_quantity
      FROM marketplace_inventory_queue q
      JOIN products p ON p.id = q.product_id
      WHERE q.synced_at IS NULL
      ORDER BY q.product_id, q.queued_at DESC
    `);

    if (pending.rows.length === 0) {
      return { processed: 0, message: 'No pending inventory changes' };
    }

    const rows = pending.rows;
    const productIds = rows.map(r => r.product_id);

    // 2. Generate stock CSV (semicolon-delimited for STO01)
    const csvLines = ['sku;quantity'];
    for (const row of rows) {
      const qty = parseInt(row.stock_quantity, 10) || 0;
      csvLines.push(`${this._escapeCsvValue(row.sku)};${Math.max(0, qty)}`);
    }
    const csvString = csvLines.join('\n');

    // 3. Upload via POST /offers/stock/imports (STO01)
    const timestamp = Date.now();
    const fileName = `stock_import_${timestamp}.csv`;
    const form = new FormData();
    form.append('file', Buffer.from(csvString, 'utf8'), {
      filename: fileName,
      contentType: 'text/csv'
    });

    const data = await this._retryableRequest(
      () => this.client.post('/offers/stock/imports', form, {
        headers: { ...form.getHeaders(), Authorization: this.apiKey }
      }),
      'processInventoryBatch(STO01)'
    );

    const miraklImportId = data?.import_id || data?.import?.import_id || null;

    // 4. Record the import locally
    const importResult = await pool.query(
      `INSERT INTO marketplace_offer_imports
       (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING import_id`,
      [miraklImportId, 'STOCK', fileName, data?.status || 'QUEUED', rows.length]
    );
    const dbImportId = importResult.rows[0].import_id;

    // 5. Mark queued entries as synced
    await pool.query(
      `UPDATE marketplace_inventory_queue
       SET synced_at = NOW(), batch_import_id = $1
       WHERE synced_at IS NULL AND product_id = ANY($2)`,
      [dbImportId, productIds]
    );

    // 6. Update last-stock-sync timestamp on products
    await pool.query(
      'UPDATE products SET mirakl_last_stock_sync = NOW() WHERE id = ANY($1)',
      [productIds]
    );

    await this.logSync('stock_import', 'inventory', 'SUCCESS', {
      direction: 'outbound',
      recordsProcessed: rows.length,
      recordsSucceeded: rows.length,
      recordsFailed: 0,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return { processed: rows.length, importId: miraklImportId, dbImportId };
  }

  /**
   * Compare Mirakl's stock levels vs our internal stock to detect drift.
   * Paginates through all Mirakl offers and checks against products table.
   * @returns {{ total: number, inSync: number, drifted: Array, unknown: Array }}
   */
  async getInventoryDrift() {
    // Paginate through all Mirakl offers
    let allOffers = [];
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const page = await this.getOfferList({ offset, max: pageSize });
      allOffers = allOffers.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    const inSyncCount = { value: 0 };
    const drifted = [];
    const unknown = [];

    for (const offer of allOffers) {
      const sku = offer.shop_sku || offer.sku || '';
      const miraklQty = parseInt(offer.quantity, 10) || 0;

      if (!sku) continue;

      const result = await pool.query(
        'SELECT id, name, stock_quantity FROM products WHERE sku = $1 OR mirakl_sku = $1 LIMIT 1',
        [sku]
      );

      if (result.rows.length === 0) {
        unknown.push({ sku, miraklQty });
        continue;
      }

      const product = result.rows[0];
      const ourQty = parseInt(product.stock_quantity, 10) || 0;

      if (miraklQty === ourQty) {
        inSyncCount.value++;
      } else {
        drifted.push({
          sku,
          productName: product.name,
          miraklQty,
          ourQty,
          diff: ourQty - miraklQty,
        });
      }
    }

    return {
      total: allOffers.length,
      inSync: inSyncCount.value,
      drifted,
      unknown,
    };
  }

  /**
   * Push ALL marketplace-enabled products' current stock to Mirakl (STO01).
   * Full reconciliation — ignores the queue and pushes everything.
   * @returns {{ processed: number, importId?: string, dbImportId?: number, message?: string }}
   */
  async forceFullInventorySync() {
    const startTime = Date.now();

    // 1. Get all marketplace-enabled products with a SKU
    const result = await pool.query(`
      SELECT id, sku, stock_quantity
      FROM products
      WHERE marketplace_enabled = true AND sku IS NOT NULL
    `);

    if (result.rows.length === 0) {
      return { processed: 0, message: 'No marketplace-enabled products with SKU' };
    }

    const rows = result.rows;
    const productIds = rows.map(r => r.id);

    // 2. Generate stock CSV (semicolon-delimited for STO01)
    const csvLines = ['sku;quantity'];
    for (const row of rows) {
      const qty = parseInt(row.stock_quantity, 10) || 0;
      csvLines.push(`${this._escapeCsvValue(row.sku)};${Math.max(0, qty)}`);
    }
    const csvString = csvLines.join('\n');

    // 3. Upload via POST /offers/stock/imports (STO01)
    const timestamp = Date.now();
    const fileName = `stock_full_sync_${timestamp}.csv`;
    const form = new FormData();
    form.append('file', Buffer.from(csvString, 'utf8'), {
      filename: fileName,
      contentType: 'text/csv'
    });

    const data = await this._retryableRequest(
      () => this.client.post('/offers/stock/imports', form, {
        headers: { ...form.getHeaders(), Authorization: this.apiKey }
      }),
      'forceFullInventorySync(STO01)'
    );

    const miraklImportId = data?.import_id || data?.import?.import_id || null;

    // 4. Record the import
    const importResult = await pool.query(
      `INSERT INTO marketplace_offer_imports
       (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING import_id`,
      [miraklImportId, 'STOCK', fileName, data?.status || 'QUEUED', rows.length]
    );
    const dbImportId = importResult.rows[0].import_id;

    // 5. Mark any unsynced queue entries as synced (full sync covers everything)
    await pool.query(
      'UPDATE marketplace_inventory_queue SET synced_at = NOW(), batch_import_id = $1 WHERE synced_at IS NULL',
      [dbImportId]
    );

    // 6. Update mirakl_last_stock_sync on all pushed products
    await pool.query(
      'UPDATE products SET mirakl_last_stock_sync = NOW() WHERE id = ANY($1)',
      [productIds]
    );

    await this.logSync('stock_full_sync', 'inventory', 'SUCCESS', {
      direction: 'outbound',
      recordsProcessed: rows.length,
      recordsSucceeded: rows.length,
      recordsFailed: 0,
      startTime: new Date(startTime),
      endTime: new Date(),
      duration: Date.now() - startTime
    });

    return { processed: rows.length, importId: miraklImportId, dbImportId };
  }
}

MiraklService.prototype._setPool = function(p) { pool = p; };

// Export singleton instance
module.exports = new MiraklService();
