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
          offset
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
      const customerLocale = order.customer?.locale || null;
      const totalPrice = parseFloat(order.total_price || 0);
      const totalCommission = parseFloat(order.total_commission || 0);
      const commissionRate = order.order_lines?.[0]?.commission_rate_vat
        ? parseFloat(order.order_lines[0].commission_rate_vat)
        : null;
      const shippingPrice = order.order_lines
        ? order.order_lines.reduce((sum, l) => sum + parseFloat(l.shipping_price || l.shipping_amount || 0), 0)
        : 0;
      // Mirakl's l.taxes = product taxes, l.shipping_taxes = shipping taxes (separate)
      // Sum both for the order-level total
      const taxesTotal = order.order_lines
        ? order.order_lines.reduce((sum, l) => {
            const productTax = (l.taxes || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
            const shippingTax = (l.shipping_taxes || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
            return sum + productTax + shippingTax;
          }, 0)
        : 0;

      const totalPriceCents = Math.round(totalPrice * 100);
      const shippingPriceCents = Math.round(shippingPrice * 100);
      const taxCents = Math.round(taxesTotal * 100);
      const commissionCents = Math.round(totalCommission * 100);

      // Order-level shipping & delivery fields from Mirakl
      const shippingZoneCode = order.shipping_zone_code || null;
      const shippingZoneLabel = order.shipping_zone_label || null;
      const shippingTypeCode = order.shipping_type_code || null;
      const shippingTypeLabel = order.shipping_type_label || null;
      const leadtimeToShip = order.leadtime_to_ship != null ? parseInt(order.leadtime_to_ship) : null;
      const deliveryDateStart = order.delivery_date?.earliest || order.delivery_date_start || null;
      const deliveryDateEnd = order.delivery_date?.latest || order.delivery_date_end || null;

      // UPSERT order
      const upsertResult = await client.query(`
        INSERT INTO marketplace_orders (
          mirakl_order_id, order_state, mirakl_order_state,
          customer_name, customer_email, customer_phone,
          shipping_address, order_lines,
          total_price_cents, shipping_price_cents, tax_cents, commission_fee_cents,
          shipping_price, commission_amount, commission_rate, taxes_total,
          currency, currency_code,
          order_date, acceptance_deadline, last_updated, last_polled_at,
          shipping_zone_code, shipping_zone_label,
          shipping_type_code, shipping_type_label,
          customer_locale, leadtime_to_ship,
          delivery_date_start, delivery_date_end
        ) VALUES (
          $1, $2, $2,
          $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $16,
          $17, $18, $19, NOW(),
          $20, $21,
          $22, $23,
          $24, $25,
          $26, $27
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
          shipping_zone_code = COALESCE(EXCLUDED.shipping_zone_code, marketplace_orders.shipping_zone_code),
          shipping_zone_label = COALESCE(EXCLUDED.shipping_zone_label, marketplace_orders.shipping_zone_label),
          shipping_type_code = COALESCE(EXCLUDED.shipping_type_code, marketplace_orders.shipping_type_code),
          shipping_type_label = COALESCE(EXCLUDED.shipping_type_label, marketplace_orders.shipping_type_label),
          customer_locale = COALESCE(EXCLUDED.customer_locale, marketplace_orders.customer_locale),
          leadtime_to_ship = COALESCE(EXCLUDED.leadtime_to_ship, marketplace_orders.leadtime_to_ship),
          delivery_date_start = COALESCE(EXCLUDED.delivery_date_start, marketplace_orders.delivery_date_start),
          delivery_date_end = COALESCE(EXCLUDED.delivery_date_end, marketplace_orders.delivery_date_end),
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
        order.shipping_deadline || order.acceptance_decision_date || null,
        order.last_updated_date || null,
        shippingZoneCode,
        shippingZoneLabel,
        shippingTypeCode,
        shippingTypeLabel,
        customerLocale,
        leadtimeToShip,
        deliveryDateStart,
        deliveryDateEnd
      ]);

      const localOrderId = upsertResult.rows[0].id;
      const wasInserted = upsertResult.rows[0].inserted;

      // Upsert order line items
      for (const line of (order.order_lines || [])) {
        const offerSku = line.offer_sku || line.product_sku || '';
        const unitPrice = parseFloat(line.price || 0);
        const lineTotal = unitPrice * (parseInt(line.quantity) || 1);
        const lineCommission = parseFloat(line.commission_amount || 0);
        // Mirakl's taxes array already includes shipping taxes — don't combine
        const lineTaxes = (line.taxes || []);
        const lineShippingTaxes = (line.shipping_taxes || []);
        const lineShippingAmount = parseFloat(line.shipping_price || line.shipping_amount || 0);
        const lineCommissionRate = line.commission_rate_vat != null ? parseFloat(line.commission_rate_vat) : null;
        const productTitle = line.product_title || null;
        const categoryCode = line.category_code || null;
        const categoryLabel = line.category_label || null;
        const orderLineState = line.order_line_state || null;
        // Get the first product image URL — Mirakl returns relative paths, prepend base
        const rawMediaUrl = line.product_medias?.[0]?.media_url || line.product_medias?.[0]?.url || null;
        const productMediaUrl = rawMediaUrl
          ? (rawMediaUrl.startsWith('http') ? rawMediaUrl : this.baseURL.replace('/api', '') + rawMediaUrl)
          : null;

        // Match to internal product
        let productId = null;
        if (offerSku) {
          const match = await client.query(
            'SELECT id FROM products WHERE sku = $1 LIMIT 1',
            [offerSku]
          );
          if (match.rows.length > 0) productId = match.rows[0].id;
        }

        // Look up expected commission rate from reference table
        let expectedCommRate = null;
        try {
          expectedCommRate = await this.lookupCommissionRate(categoryLabel);
        } catch (lookupErr) {
          // Non-critical — don't fail the upsert
        }

        await client.query(`
          INSERT INTO marketplace_order_items (
            order_id, mirakl_order_line_id, order_line_id,
            product_id, product_sku, offer_sku, offer_id,
            quantity, unit_price, unit_price_cents, line_total, total_price_cents,
            commission_amount, commission_fee_cents,
            taxes, tax_cents,
            status,
            product_title, category_code, category_label,
            shipping_amount, shipping_taxes, commission_rate,
            product_media_url, order_line_state,
            expected_commission_rate
          ) VALUES (
            $1, $2, $2,
            $3, $4, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12,
            $13, $14,
            'PENDING',
            $15, $16, $17,
            $18, $19, $20,
            $21, $22,
            $23
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
            product_title = COALESCE(EXCLUDED.product_title, marketplace_order_items.product_title),
            category_code = COALESCE(EXCLUDED.category_code, marketplace_order_items.category_code),
            category_label = COALESCE(EXCLUDED.category_label, marketplace_order_items.category_label),
            shipping_amount = EXCLUDED.shipping_amount,
            shipping_taxes = EXCLUDED.shipping_taxes,
            commission_rate = COALESCE(EXCLUDED.commission_rate, marketplace_order_items.commission_rate),
            product_media_url = COALESCE(EXCLUDED.product_media_url, marketplace_order_items.product_media_url),
            order_line_state = COALESCE(EXCLUDED.order_line_state, marketplace_order_items.order_line_state),
            expected_commission_rate = COALESCE(EXCLUDED.expected_commission_rate, marketplace_order_items.expected_commission_rate),
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
          Math.round(lineTaxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0) * 100),
          productTitle,
          categoryCode,
          categoryLabel,
          lineShippingAmount,
          lineShippingTaxes.length > 0 ? JSON.stringify(lineShippingTaxes) : null,
          lineCommissionRate,
          productMediaUrl,
          orderLineState,
          expectedCommRate
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

    // Fetch order line IDs from local DB for this Mirakl order
    const orderResult = await pool.query(
      `SELECT mo.id, moi.order_line_id
       FROM marketplace_orders mo
       JOIN marketplace_order_items moi ON moi.order_id = mo.id
       WHERE mo.mirakl_order_id = $1 AND moi.order_line_state IN ('SHIPPING', 'ACCEPTED')`,
      [miraklOrderId]
    );

    const lineIds = orderResult.rows.map(r => r.order_line_id).filter(Boolean);
    const localOrderId = orderResult.rows.length > 0 ? orderResult.rows[0].id : null;

    // Build Mirakl OR23 payload — tracking per order line
    let trackingObj;
    if (carrierCode) {
      trackingObj = { carrier_code: carrierCode, tracking_number: trackingNumber };
    } else {
      trackingObj = {
        carrier_name: carrierName || 'Other',
        carrier_url: carrierUrl || '',
        tracking_number: trackingNumber
      };
    }

    const payload = {
      order_lines: lineIds.map(lineId => ({
        order_line_id: lineId,
        tracking: trackingObj
      }))
    };

    // If no line IDs found, fall back to flat payload for simpler API versions
    const finalPayload = lineIds.length > 0 ? payload : trackingObj;

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/tracking`, finalPayload),
      `updateTracking(${miraklOrderId})`
    );

    // Update local order items with tracking info
    if (localOrderId) {
      await pool.query(
        `UPDATE marketplace_order_items
         SET shipping_tracking = $1,
             shipping_carrier = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $3 AND order_line_state IN ('SHIPPING', 'ACCEPTED')`,
        [trackingNumber, carrierCode || carrierName || 'Other', localOrderId]
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

    // Fetch order line IDs for the Mirakl OR24 ship confirmation
    const linesResult = await pool.query(
      `SELECT mo.id, moi.order_line_id
       FROM marketplace_orders mo
       JOIN marketplace_order_items moi ON moi.order_id = mo.id
       WHERE mo.mirakl_order_id = $1 AND moi.order_line_state IN ('SHIPPING', 'ACCEPTED')`,
      [miraklOrderId]
    );
    const localId = linesResult.rows.length > 0 ? linesResult.rows[0].id : null;

    const data = await this._retryableRequest(
      () => this.client.put(`/orders/${miraklOrderId}/ship`),
      `confirmShipment(${miraklOrderId})`
    );

    // Update local DB
    if (localId) {
      await pool.query(
        `UPDATE marketplace_orders
         SET mirakl_order_state = 'SHIPPED', order_state = 'SHIPPED',
             shipped_date = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [localId]
      );
      await pool.query(
        `UPDATE marketplace_order_items
         SET status = 'SHIPPED', order_line_state = 'SHIPPED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND order_line_state IN ('SHIPPING', 'ACCEPTED')`,
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
   * Queue an inventory change for batch sync to marketplace channels.
   * Fast insert only — must not slow down POS checkout.
   *
   * Multi-channel fan-out: if channelId is null, inserts one queue entry
   * PER active channel that has a listing for this product.
   * If no channel listings exist, inserts one entry with channel_id = NULL
   * (legacy behaviour — picked up by the default Best Buy flow).
   *
   * @param {number} productId
   * @param {string} sku
   * @param {number} oldQty
   * @param {number} newQty
   * @param {string} changeSource - POS_SALE|MANUAL_ADJUST|RECEIVING|RETURN|QUOTE_CONVERT|CYCLE_COUNT|ORDER_ACCEPT
   * @param {number|null} channelId - specific channel, or null for auto-fan-out
   * @returns {number[]} array of queue_ids
   */
  async queueInventoryChange(productId, sku, oldQty, newQty, changeSource, channelId = null) {
    // If a specific channel was requested, insert just that one entry
    if (channelId) {
      const result = await pool.query(
        `INSERT INTO marketplace_inventory_queue (product_id, sku, old_quantity, new_quantity, change_source, channel_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING queue_id`,
        [productId, sku, oldQty, newQty, changeSource, channelId]
      );
      return [result.rows[0].queue_id];
    }

    // Auto-fan-out: find all active channel listings for this product
    const channels = await pool.query(
      `SELECT channel_id FROM product_channel_listings
       WHERE product_id = $1 AND listing_status = 'ACTIVE'`,
      [productId]
    );

    // If no channel listings, insert one entry with NULL channel_id (legacy)
    if (channels.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO marketplace_inventory_queue (product_id, sku, old_quantity, new_quantity, change_source)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING queue_id`,
        [productId, sku, oldQty, newQty, changeSource]
      );
      return [result.rows[0].queue_id];
    }

    // Insert one queue entry per channel
    const queueIds = [];
    for (const ch of channels.rows) {
      const result = await pool.query(
        `INSERT INTO marketplace_inventory_queue (product_id, sku, old_quantity, new_quantity, change_source, channel_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING queue_id`,
        [productId, sku, oldQty, newQty, changeSource, ch.channel_id]
      );
      queueIds.push(result.rows[0].queue_id);
    }
    return queueIds;
  }

  /**
   * Process pending inventory changes as a batch stock-only upload (STO01).
   * Collapses multiple queued changes per product into a single current-stock row.
   *
   * Multi-channel aware:
   *  - If channelId provided: process only that channel's queue
   *  - If null: group pending entries by channel_id and process each channel separately
   *  - Applies per-channel allocation formula from product_channel_listings:
   *    channel_qty = MAX(0, FLOOR((stock_quantity - safety_buffer) * (allocation_percent / 100)))
   *  - Falls back to raw stock for legacy entries (channel_id IS NULL)
   *
   * @param {number|null} channelId - specific channel, or null for all channels
   * @returns {{ processed: number, channels: Array, message?: string }}
   */
  async processInventoryBatch(channelId = null) {
    const startTime = Date.now();

    // If specific channel requested, process just that one
    if (channelId) {
      const result = await this._processChannelInventoryBatch(channelId, startTime);
      return { processed: result.processed, channels: [result] };
    }

    // Find all distinct channel_ids with pending queue entries
    const channelQuery = await pool.query(`
      SELECT DISTINCT COALESCE(channel_id, 0) AS cid
      FROM marketplace_inventory_queue
      WHERE synced_at IS NULL
      ORDER BY cid
    `);

    if (channelQuery.rows.length === 0) {
      return { processed: 0, channels: [], message: 'No pending inventory changes' };
    }

    // Process each channel separately
    const channelResults = [];
    let totalProcessed = 0;
    for (const row of channelQuery.rows) {
      const cid = row.cid === 0 ? null : row.cid;
      try {
        const result = await this._processChannelInventoryBatch(cid, startTime);
        channelResults.push(result);
        totalProcessed += result.processed;
      } catch (err) {
        channelResults.push({ channelId: cid, processed: 0, error: err.message });
      }
    }

    return { processed: totalProcessed, channels: channelResults };
  }

  /**
   * Process inventory batch for a single channel (or legacy NULL channel).
   * @private
   */
  async _processChannelInventoryBatch(channelId, startTime) {
    const channelFilter = channelId
      ? 'q.channel_id = $1'
      : 'q.channel_id IS NULL';
    const params = channelId ? [channelId] : [];

    // 1. Get distinct pending products with current live stock + channel allocation
    const pending = await pool.query(`
      SELECT DISTINCT ON (q.product_id)
        q.product_id, q.sku, p.stock_quantity,
        COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
        COALESCE(pcl.allocation_percent, 100) AS allocation_percent,
        pcl.channel_sku
      FROM marketplace_inventory_queue q
      JOIN products p ON p.id = q.product_id
      LEFT JOIN product_channel_listings pcl
        ON pcl.product_id = q.product_id
        AND pcl.channel_id = ${channelId ? '$1' : 'q.channel_id'}
        AND pcl.listing_status = 'ACTIVE'
      WHERE q.synced_at IS NULL AND ${channelFilter}
      ORDER BY q.product_id, q.queued_at DESC
    `, params);

    if (pending.rows.length === 0) {
      return { channelId, processed: 0, message: 'No pending changes' };
    }

    const rows = pending.rows;
    const productIds = rows.map(r => r.product_id);

    // 2. Try multi-channel path: use ChannelManager adapter if available
    let useAdapter = false;
    let adapter = null;
    if (channelId) {
      try {
        const { getInstance } = require('./ChannelManager');
        const manager = await getInstance();
        adapter = manager.getAdapter(channelId);
        useAdapter = true;
      } catch (_) { /* fall through to legacy */ }
    }

    // 3. Build stock updates with allocation formula
    const stockUpdates = rows.map(r => {
      const rawQty = parseInt(r.stock_quantity, 10) || 0;
      const allocatedQty = Math.max(0, Math.floor(
        (rawQty - r.safety_buffer) * (r.allocation_percent / 100)
      ));
      return {
        sku: r.channel_sku || r.sku,
        quantity: allocatedQty
      };
    });

    let miraklImportId = null;
    let dbImportId = null;

    if (useAdapter) {
      // Use the channel's adapter to push inventory
      const pushResult = await adapter.pushInventory(stockUpdates);
      miraklImportId = pushResult?.importId || null;
      dbImportId = pushResult?.dbImportId || null;
    } else {
      // Legacy path: direct Mirakl upload (Best Buy default)
      const csvLines = ['sku;quantity'];
      for (const update of stockUpdates) {
        csvLines.push(`${this._escapeCsvValue(update.sku)};${update.quantity}`);
      }
      const csvString = csvLines.join('\n');

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

      miraklImportId = data?.import_id || data?.import?.import_id || null;

      // Record the import locally
      const importResult = await pool.query(
        `INSERT INTO marketplace_offer_imports
         (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at, channel_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING import_id`,
        [miraklImportId, 'STOCK', fileName, data?.status || 'QUEUED', rows.length, channelId]
      );
      dbImportId = importResult.rows[0].import_id;
    }

    // 4. Mark queued entries as synced
    const markParams = channelId
      ? [dbImportId, productIds, channelId]
      : [dbImportId, productIds];
    const markFilter = channelId
      ? 'synced_at IS NULL AND product_id = ANY($2) AND channel_id = $3'
      : 'synced_at IS NULL AND product_id = ANY($2) AND channel_id IS NULL';

    await pool.query(
      `UPDATE marketplace_inventory_queue
       SET synced_at = NOW(), batch_import_id = $1
       WHERE ${markFilter}`,
      markParams
    );

    // 5. Update last-stock-sync timestamp on products
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

    return { channelId, processed: rows.length, importId: miraklImportId, dbImportId };
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
   * Check oversell risk for a product across ALL marketplace channels.
   * Sums all pending (unshipped) order quantities and compares against current stock.
   *
   * @param {number} productId
   * @returns {{ currentStock, committedQty, availableQty, atRisk, channels }}
   */
  async checkOversellRisk(productId) {
    // Get current stock
    const productResult = await pool.query(
      'SELECT stock_quantity FROM products WHERE id = $1',
      [productId]
    );
    if (productResult.rows.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }
    const currentStock = parseInt(productResult.rows[0].stock_quantity, 10) || 0;

    // Sum all unshipped order quantities across ALL channels
    // Orders in states: WAITING_ACCEPTANCE, SHIPPING (accepted, not yet shipped)
    const commitResult = await pool.query(`
      SELECT
        COALESCE(mo.channel_id, 0) AS channel_id,
        mc.channel_code,
        mc.channel_name,
        SUM(moi.quantity) AS committed_qty,
        COUNT(DISTINCT mo.id) AS order_count
      FROM marketplace_order_items moi
      JOIN marketplace_orders mo ON mo.id = moi.order_id
      LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
      WHERE moi.product_id = $1
        AND mo.mirakl_order_state IN ('WAITING_ACCEPTANCE', 'SHIPPING')
      GROUP BY mo.channel_id, mc.channel_code, mc.channel_name
    `, [productId]);

    const committedQty = commitResult.rows.reduce(
      (sum, r) => sum + (parseInt(r.committed_qty, 10) || 0), 0
    );

    // Also sum pending (unsynced) inventory queue decreases
    const pendingResult = await pool.query(`
      SELECT COALESCE(SUM(GREATEST(0, old_quantity - new_quantity)), 0) AS pending_decreases
      FROM marketplace_inventory_queue
      WHERE product_id = $1 AND synced_at IS NULL AND new_quantity < old_quantity
    `, [productId]);
    const pendingDecreases = parseInt(pendingResult.rows[0].pending_decreases, 10) || 0;

    // Total allocation across channels
    const allocResult = await pool.query(`
      SELECT
        pcl.channel_id,
        mc.channel_code,
        COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
        COALESCE(pcl.allocation_percent, 100) AS allocation_percent,
        FLOOR(GREATEST(0, ($2::int - COALESCE(pcl.safety_buffer, 0)) * (COALESCE(pcl.allocation_percent, 100) / 100.0))) AS allocated_qty
      FROM product_channel_listings pcl
      LEFT JOIN marketplace_channels mc ON mc.id = pcl.channel_id
      WHERE pcl.product_id = $1 AND pcl.listing_status = 'ACTIVE'
    `, [productId, currentStock]);

    const totalAllocated = allocResult.rows.reduce(
      (sum, r) => sum + (parseInt(r.allocated_qty, 10) || 0), 0
    );

    const availableQty = currentStock - committedQty;
    const atRisk = committedQty > currentStock || totalAllocated > currentStock;

    return {
      currentStock,
      committedQty,
      pendingDecreases,
      totalAllocated,
      availableQty,
      atRisk,
      channels: commitResult.rows.map(r => ({
        channelId: r.channel_id === 0 ? null : parseInt(r.channel_id),
        channelCode: r.channel_code || 'legacy',
        channelName: r.channel_name || 'Best Buy (Legacy)',
        committedQty: parseInt(r.committed_qty, 10) || 0,
        orderCount: parseInt(r.order_count, 10) || 0
      })),
      allocations: allocResult.rows.map(r => ({
        channelId: r.channel_id,
        channelCode: r.channel_code,
        safetyBuffer: r.safety_buffer,
        allocationPercent: parseFloat(r.allocation_percent),
        allocatedQty: parseInt(r.allocated_qty, 10) || 0
      }))
    };
  }

  /**
   * Push ALL marketplace-enabled products' current stock to channels (STO01).
   * Full reconciliation — ignores the queue and pushes everything.
   *
   * Multi-channel aware:
   *  - If channelId provided: sync only that channel (with allocation formula)
   *  - If null: sync all active channels sequentially, then legacy
   *
   * @param {number|null} channelId - specific channel, or null for all
   * @returns {{ processed: number, channels: Array, message?: string }}
   */
  async forceFullInventorySync(channelId = null) {
    const startTime = Date.now();

    // If specific channel, sync just that one
    if (channelId) {
      const result = await this._forceFullSyncChannel(channelId, startTime);
      return { processed: result.processed, channels: [result] };
    }

    // Get all active channels
    const channelRows = await pool.query(
      "SELECT id FROM marketplace_channels WHERE status = 'ACTIVE'"
    );

    const channelResults = [];
    let totalProcessed = 0;

    if (channelRows.rows.length > 0) {
      // Sync each active channel with allocation
      for (const ch of channelRows.rows) {
        try {
          const result = await this._forceFullSyncChannel(ch.id, startTime);
          channelResults.push(result);
          totalProcessed += result.processed;
        } catch (err) {
          channelResults.push({ channelId: ch.id, processed: 0, error: err.message });
        }
      }
    } else {
      // No channels configured — legacy path (raw stock, no allocation)
      const result = await this._forceFullSyncLegacy(startTime);
      channelResults.push(result);
      totalProcessed = result.processed;
    }

    return { processed: totalProcessed, channels: channelResults };
  }

  /**
   * Force full sync for a single channel with allocation formula.
   * @private
   */
  async _forceFullSyncChannel(channelId, startTime) {
    // Get products with active listings on this channel, applying allocation
    const result = await pool.query(`
      SELECT p.id, p.sku, p.stock_quantity,
             pcl.channel_sku,
             COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
             COALESCE(pcl.allocation_percent, 100) AS allocation_percent
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status = 'ACTIVE'
        AND p.sku IS NOT NULL
    `, [channelId]);

    if (result.rows.length === 0) {
      return { channelId, processed: 0, message: 'No active listings for this channel' };
    }

    const rows = result.rows;
    const productIds = rows.map(r => r.id);

    // Build stock updates with allocation formula
    const stockUpdates = rows.map(r => {
      const rawQty = parseInt(r.stock_quantity, 10) || 0;
      const allocatedQty = Math.max(0, Math.floor(
        (rawQty - r.safety_buffer) * (r.allocation_percent / 100)
      ));
      return {
        sku: r.channel_sku || r.sku,
        quantity: allocatedQty
      };
    });

    // Try to use channel adapter, fall back to legacy
    let miraklImportId = null;
    let dbImportId = null;
    let useAdapter = false;

    try {
      const { getInstance } = require('./ChannelManager');
      const manager = await getInstance();
      const adapter = manager.getAdapter(channelId);
      const pushResult = await adapter.pushInventory(stockUpdates);
      miraklImportId = pushResult?.importId || null;
      dbImportId = pushResult?.dbImportId || null;
      useAdapter = true;
    } catch (_) { /* fall through to legacy */ }

    if (!useAdapter) {
      // Legacy Mirakl upload
      const csvLines = ['sku;quantity'];
      for (const update of stockUpdates) {
        csvLines.push(`${this._escapeCsvValue(update.sku)};${update.quantity}`);
      }
      const csvString = csvLines.join('\n');

      const timestamp = Date.now();
      const fileName = `stock_full_sync_ch${channelId}_${timestamp}.csv`;
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

      miraklImportId = data?.import_id || data?.import?.import_id || null;

      const importResult = await pool.query(
        `INSERT INTO marketplace_offer_imports
         (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at, channel_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING import_id`,
        [miraklImportId, 'STOCK', fileName, data?.status || 'QUEUED', rows.length, channelId]
      );
      dbImportId = importResult.rows[0].import_id;
    }

    // Mark any unsynced queue entries for this channel as synced
    await pool.query(
      `UPDATE marketplace_inventory_queue
       SET synced_at = NOW(), batch_import_id = $1
       WHERE synced_at IS NULL AND channel_id = $2`,
      [dbImportId, channelId]
    );

    // Update mirakl_last_stock_sync on all pushed products
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

    return { channelId, processed: rows.length, importId: miraklImportId, dbImportId };
  }

  /**
   * Legacy full sync: raw stock, no allocation, no channel_id.
   * Used when no channels are configured in marketplace_channels.
   * @private
   */
  async _forceFullSyncLegacy(startTime) {
    const result = await pool.query(`
      SELECT id, sku, stock_quantity
      FROM products
      WHERE marketplace_enabled = true AND sku IS NOT NULL
    `);

    if (result.rows.length === 0) {
      return { channelId: null, processed: 0, message: 'No marketplace-enabled products with SKU' };
    }

    const rows = result.rows;
    const productIds = rows.map(r => r.id);

    const csvLines = ['sku;quantity'];
    for (const row of rows) {
      const qty = parseInt(row.stock_quantity, 10) || 0;
      csvLines.push(`${this._escapeCsvValue(row.sku)};${Math.max(0, qty)}`);
    }
    const csvString = csvLines.join('\n');

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

    const importResult = await pool.query(
      `INSERT INTO marketplace_offer_imports
       (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING import_id`,
      [miraklImportId, 'STOCK', fileName, data?.status || 'QUEUED', rows.length]
    );
    const dbImportId = importResult.rows[0].import_id;

    await pool.query(
      'UPDATE marketplace_inventory_queue SET synced_at = NOW(), batch_import_id = $1 WHERE synced_at IS NULL AND channel_id IS NULL',
      [dbImportId]
    );

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

    return { channelId: null, processed: rows.length, importId: miraklImportId, dbImportId };
  }

  // ============================================
  // COMMISSION RATE LOOKUP
  // ============================================

  /**
   * Look up the expected Best Buy commission rate for a category label.
   * Tries exact leaf match first, then partial path match.
   * @param {string} categoryLabel - e.g. "Remote Controls" or "Wall Mounts"
   * @returns {number|null} commission_pct or null if no match
   */
  async lookupCommissionRate(categoryLabel) {
    if (!categoryLabel) return null;

    // 1. Exact leaf match
    const exactResult = await pool.query(
      `SELECT commission_pct FROM marketplace_commission_rates
       WHERE LOWER(category_leaf) = LOWER($1)
       LIMIT 1`,
      [categoryLabel.trim()]
    );
    if (exactResult.rows.length > 0) {
      return parseFloat(exactResult.rows[0].commission_pct);
    }

    // 2. Partial path match (category_path contains the label)
    const partialResult = await pool.query(
      `SELECT commission_pct FROM marketplace_commission_rates
       WHERE LOWER(category_path) LIKE LOWER($1)
       ORDER BY LENGTH(category_path) DESC
       LIMIT 1`,
      [`%${categoryLabel.trim()}%`]
    );
    if (partialResult.rows.length > 0) {
      return parseFloat(partialResult.rows[0].commission_pct);
    }

    return null;
  }
}

MiraklService.prototype._setPool = function(p) { pool = p; };

// Export singleton instance
module.exports = new MiraklService();
