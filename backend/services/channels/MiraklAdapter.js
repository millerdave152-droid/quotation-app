const axios = require('axios');
const FormData = require('form-data');
const ChannelAdapter = require('./ChannelAdapter');
const { validateProductForOffer, enrichOfferData } = require('../offerValidator');

/**
 * MiraklAdapter — Channel adapter for Mirakl-based marketplaces (Best Buy, etc.)
 *
 * Wraps all existing miraklService.js functionality into the ChannelAdapter
 * interface. Uses channel-record credentials (not process.env) so multiple
 * Mirakl channels can run side-by-side.
 *
 * Constructor expects a row from `marketplace_channels` with:
 *   credentials: { api_key, shop_id }
 *   api_url:     "https://marketplace.bestbuy.ca"
 */
class MiraklAdapter extends ChannelAdapter {
  constructor(channel) {
    super(channel);

    // Derive Mirakl base URL — always needs /api suffix
    let baseURL = this.apiUrl || '';
    if (!baseURL.endsWith('/api')) {
      baseURL = baseURL.replace(/\/$/, '') + '/api';
    }
    this.baseURL = baseURL;
    this.apiKey = this.credentials.api_key || '';
    this.shopId = this.credentials.shop_id || '';

    // Parameterised axios client — independent of process.env
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        console.error(`[${this.channelCode}] Mirakl API Error:`, {
          url: err.config?.url,
          method: err.config?.method,
          status: err.response?.status,
          data: err.response?.data
        });
        return Promise.reject(err);
      }
    );
  }

  // ============================================================
  // PRIVATE HELPERS (ported from miraklService)
  // ============================================================

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _stripHtml(input) {
    if (!input) return '';
    return String(input).replace(/<[^>]*>/g, '');
  }

  _escapeCsvValue(input) {
    if (input == null) return '';
    return String(input).replace(/[\r\n\t]+/g, ' ').replace(/;/g, '\\;');
  }

  _formatDate(dateValue) {
    if (!dateValue) return '';
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _getStockQuantity(product) {
    const candidates = [
      product.stock_quantity, product.qty_on_hand, product.quantity,
      product.quantity_in_stock, product.stock, product.qty_available
    ];
    const num = parseInt(candidates.find(v => v != null), 10);
    return Number.isNaN(num) ? 0 : num;
  }

  _getProductIdAndType(product) {
    const id = String(product.upc || '').replace(/\D/g, '');
    if (id.length === 13) return { id, type: 'EAN' };
    if (id.length === 12) return { id, type: 'UPC' };
    return { id: id || '', type: '' };
  }

  /**
   * Mirakl-specific retryable request (returns response.data).
   * Retries on 429 and 5xx; throws immediately on 401/403.
   */
  async _miraklRequest(fn, label = 'request', maxRetries = 3) {
    let attempt = 0;
    while (true) {
      try {
        const response = await fn();
        return response.data;
      } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) throw error;
        if (status === 429 && attempt < maxRetries) {
          const wait = parseInt(error.response?.headers?.['retry-after'] || '2', 10);
          console.warn(`[${this.channelCode}] 429 on ${label}, retry ${attempt + 1}/${maxRetries} after ${wait}s`);
          await this._sleep(Math.max(1, wait) * 1000);
          attempt++;
          continue;
        }
        if (status >= 500 && status < 600 && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`[${this.channelCode}] ${status} on ${label}, retry ${attempt + 1}/${maxRetries} after ${backoff}ms`);
          await this._sleep(backoff);
          attempt++;
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Look up expected Best Buy commission rate for a category label.
   */
  async _lookupCommissionRate(categoryLabel) {
    if (!categoryLabel) return null;
    const exact = await this.pool.query(
      `SELECT commission_pct FROM marketplace_commission_rates WHERE LOWER(category_leaf) = LOWER($1) LIMIT 1`,
      [categoryLabel.trim()]
    );
    if (exact.rows.length > 0) return parseFloat(exact.rows[0].commission_pct);

    const partial = await this.pool.query(
      `SELECT commission_pct FROM marketplace_commission_rates WHERE LOWER(category_path) LIKE LOWER($1) ORDER BY LENGTH(category_path) DESC LIMIT 1`,
      [`%${categoryLabel.trim()}%`]
    );
    if (partial.rows.length > 0) return parseFloat(partial.rows[0].commission_pct);
    return null;
  }

  // ============================================================
  // OFFERS / LISTINGS  (ChannelAdapter interface)
  // ============================================================

  /**
   * Push offers via Mirakl OF01 CSV import.
   * @param {Array} listings - product rows (joined with product data)
   * @returns {{ submitted: number, importId: string|null }}
   */
  async pushOffers(listings) {
    const startedAt = new Date();

    // 1. Generate semicolon-delimited CSV
    const header = [
      'sku', 'product-id', 'product-id-type', 'description', 'internal-description',
      'price', 'price-additional-info', 'quantity', 'min-quantity-alert', 'state',
      'available-start-date', 'available-end-date', 'logistic-class',
      'discount-price', 'discount-start-date', 'discount-end-date',
      'leadtime-to-ship', 'update-delete', 'product-tax-code'
    ].join(';');

    const today = this._formatDate(new Date());
    const rows = listings.map(p => {
      const sku = String(p.sku || p.mirakl_sku || p.model || '').slice(0, 40);
      const { id: prodId, type: prodIdType } = this._getProductIdAndType(p);
      const desc = this._escapeCsvValue(this._stripHtml(p.description || p.name || '')).slice(0, 2000);
      const price = parseFloat(p.price || (p.msrp_cents ? p.msrp_cents / 100 : 0)) || 0;
      const qty = this._getStockQuantity(p);
      const minAlert = p.bestbuy_min_quantity_alert != null ? p.bestbuy_min_quantity_alert : 5;
      const logistic = p.bestbuy_logistic_class || 'L';
      const discPrice = p.marketplace_discount_price != null ? p.marketplace_discount_price : '';
      const discStart = this._formatDate(p.marketplace_discount_start);
      const discEnd = this._formatDate(p.marketplace_discount_end);
      const lead = p.bestbuy_leadtime_to_ship != null ? p.bestbuy_leadtime_to_ship : 2;
      const taxCode = p.bestbuy_product_tax_code || '';

      return [
        sku, prodId, prodIdType, desc, '',
        price > 0 ? price.toFixed(2) : '', '', qty, minAlert, '11',
        today, '', logistic,
        discPrice === '' ? '' : parseFloat(discPrice).toFixed(2), discStart, discEnd,
        lead, '', taxCode
      ].map(v => this._escapeCsvValue(v)).join(';');
    });

    const csvString = [header, ...rows].join('\n');

    // 2. Upload via OF01
    const fileName = `offers_import_${Date.now()}.csv`;
    const form = new FormData();
    form.append('file', Buffer.from(csvString, 'utf8'), { filename: fileName, contentType: 'text/csv' });
    form.append('import_type', 'OFFER');

    const data = await this._miraklRequest(
      () => this.client.post('/offers/imports', form, {
        headers: { ...form.getHeaders(), 'Authorization': this.apiKey }
      }),
      'pushOffers(OF01)'
    );

    const importId = data?.import_id || data?.import?.import_id || null;

    // 3. Record import locally with channel_id
    if (importId) {
      await this.pool.query(
        `INSERT INTO marketplace_offer_imports (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at, channel_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [importId, 'OFFER', fileName, data?.status || 'SUBMITTED', listings.length, this.channelId]
      );
    }

    await this._logSync('offer_import', 'offer', 'SUCCESS', {
      direction: 'outbound', startedAt, count: listings.length, succeeded: listings.length
    });

    return { submitted: listings.length, importId };
  }

  /**
   * Push a single offer via OF24 JSON API.
   * @param {object} listing - product row
   * @returns {{ success: boolean }}
   */
  async pushSingleOffer(listing) {
    const startedAt = new Date();
    const sku = listing.sku || listing.mirakl_sku || listing.model;
    const { id: prodIdValue, type: prodIdType } = this._getProductIdAndType(listing);
    const price = parseFloat(listing.price || (listing.msrp_cents ? listing.msrp_cents / 100 : 0)) || 0;
    const quantity = this._getStockQuantity(listing);

    const payload = {
      offers: [{
        state_code: '11',
        shop_sku: sku,
        product_id: prodIdValue,
        product_id_type: prodIdType || 'UPC',
        price,
        quantity,
        logistic_class: listing.bestbuy_logistic_class || 'L',
        leadtime_to_ship: listing.bestbuy_leadtime_to_ship != null ? listing.bestbuy_leadtime_to_ship : 2,
        update_delete: ''
      }]
    };

    await this._miraklRequest(
      () => this.client.post('/offers', payload, { headers: { 'Content-Type': 'application/json' } }),
      `pushSingleOffer(${sku})`
    );

    // Update last sync timestamp
    if (listing.id) {
      await this.pool.query(
        'UPDATE products SET mirakl_last_offer_sync = NOW() WHERE id = $1',
        [listing.id]
      );
    }

    await this._logSync('offer_update', 'offer', 'SUCCESS', {
      direction: 'outbound', startedAt, count: 1, succeeded: 1,
      entityId: String(listing.id || sku)
    });

    return { success: true };
  }

  /**
   * Fetch current offers from the channel (OF21).
   * @param {object} options - { offset, max }
   * @returns {Array}
   */
  async getRemoteOffers(options = {}) {
    const offset = Number.isFinite(options.offset) ? options.offset : 0;
    const max = Number.isFinite(options.max) ? Math.min(options.max, 100) : 100;
    const data = await this._miraklRequest(
      () => this.client.get('/offers', { params: { offset, max } }),
      'getRemoteOffers(OF21)'
    );
    return data?.offers || [];
  }

  /**
   * Check status of a bulk import job (OF02 + OF03 error report).
   * @param {string} importId - Mirakl import ID
   * @returns {{ status, processed, errors, error_report }}
   */
  async checkImportStatus(importId) {
    const data = await this._miraklRequest(
      () => this.client.get(`/offers/imports/${importId}`),
      `checkImportStatus(${importId})`
    );

    const status = data.status || data.import_status || data.import?.status || 'UNKNOWN';

    let errorReport = null;
    if (status === 'COMPLETE' || status === 'COMPLETED') {
      try {
        const errRes = await this.client.get(`/offers/imports/${importId}/error_report`, { responseType: 'text' });
        errorReport = errRes.data || null;
      } catch (_) { /* error report may not exist */ }
    }

    const processed = data.lines_read || data.imported_lines || data.records_processed || 0;
    const withErrors = data.lines_in_error || data.rejected_lines || data.records_with_errors || 0;

    await this.pool.query(
      `UPDATE marketplace_offer_imports
       SET status = $1, records_processed = $2, records_with_errors = $3, error_report = $4,
           completed_at = CASE WHEN $1 IN ('COMPLETE','COMPLETED') THEN NOW() ELSE completed_at END
       WHERE mirakl_import_id = $5 AND (channel_id = $6 OR channel_id IS NULL)`,
      [status, processed, withErrors, errorReport, importId, this.channelId]
    );

    return { ...data, status, processed, errors: withErrors, error_report: errorReport };
  }

  // ============================================================
  // ORDERS  (ChannelAdapter interface)
  // ============================================================

  /**
   * Poll orders from Mirakl (OR11) with pagination and DB upsert.
   * @param {object} options - { states, since, offset }
   * @returns {{ newOrders, updatedOrders, totalPolled, errors }}
   */
  async pollOrders(options = {}) {
    const startedAt = new Date();
    const states = options.states || 'WAITING_ACCEPTANCE,SHIPPING,SHIPPED,RECEIVED';
    const errors = [];
    let newOrders = 0, updatedOrders = 0, totalPolled = 0;
    let offset = options.offset || 0;
    const pageSize = 100;

    try {
      while (true) {
        const params = { order_state_codes: states, max: pageSize, offset };
        if (options.since) params.start_date = options.since;

        const data = await this._miraklRequest(
          () => this.client.get('/orders', { params }),
          'pollOrders(OR11)'
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
            console.error(`[${this.channelCode}] Failed to upsert order ${order.order_id}:`, err.message);
          }
        }

        if (orders.length < pageSize) break;
        offset += pageSize;
      }

      await this._logSync('order_poll', 'order', errors.length > 0 ? 'PARTIAL' : 'SUCCESS', {
        direction: 'inbound', startedAt,
        count: totalPolled, succeeded: newOrders + updatedOrders, failed: errors.length
      });
    } catch (error) {
      await this._logSync('order_poll', 'order', 'FAILED', {
        direction: 'inbound', startedAt,
        count: totalPolled, succeeded: newOrders + updatedOrders, failed: errors.length + 1,
        error: error.message, errorDetails: error.response?.data || { error: error.toString() }
      });
      throw error;
    }

    return { newOrders, updatedOrders, totalPolled, errors };
  }

  /**
   * Upsert a single Mirakl order + line items.
   * Identical logic to miraklService._upsertOrder but stamps channel_id.
   * @private
   */
  async _upsertOrder(order) {
    const client = await this.pool.connect();
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
        ? parseFloat(order.order_lines[0].commission_rate_vat) : null;
      const shippingPrice = order.order_lines
        ? order.order_lines.reduce((sum, l) => sum + parseFloat(l.shipping_price || l.shipping_amount || 0), 0) : 0;
      const taxesTotal = order.order_lines
        ? order.order_lines.reduce((sum, l) => {
            const pt = (l.taxes || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
            const st = (l.shipping_taxes || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
            return sum + pt + st;
          }, 0) : 0;

      const totalPriceCents = Math.round(totalPrice * 100);
      const shippingPriceCents = Math.round(shippingPrice * 100);
      const taxCents = Math.round(taxesTotal * 100);
      const commissionCents = Math.round(totalCommission * 100);

      const shippingZoneCode = order.shipping_zone_code || null;
      const shippingZoneLabel = order.shipping_zone_label || null;
      const shippingTypeCode = order.shipping_type_code || null;
      const shippingTypeLabel = order.shipping_type_label || null;
      const leadtimeToShip = order.leadtime_to_ship != null ? parseInt(order.leadtime_to_ship) : null;
      const deliveryDateStart = order.delivery_date?.earliest || order.delivery_date_start || null;
      const deliveryDateEnd = order.delivery_date?.latest || order.delivery_date_end || null;

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
          delivery_date_start, delivery_date_end,
          channel_id
        ) VALUES (
          $1, $2, $2,
          $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $16,
          $17, $18, $19, NOW(),
          $20, $21, $22, $23,
          $24, $25, $26, $27,
          $28
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
          channel_id = COALESCE(EXCLUDED.channel_id, marketplace_orders.channel_id),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, (xmax = 0) AS inserted
      `, [
        order.order_id, order.order_state,
        customerName, customerEmail, customerPhone,
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        JSON.stringify(order.order_lines || []),
        totalPriceCents, shippingPriceCents, taxCents, commissionCents,
        shippingPrice, totalCommission, commissionRate, taxesTotal,
        order.currency_iso_code || 'CAD',
        order.created_date || null,
        order.shipping_deadline || order.acceptance_decision_date || null,
        order.last_updated_date || null,
        shippingZoneCode, shippingZoneLabel, shippingTypeCode, shippingTypeLabel,
        customerLocale, leadtimeToShip, deliveryDateStart, deliveryDateEnd,
        this.channelId
      ]);

      const localOrderId = upsertResult.rows[0].id;
      const wasInserted = upsertResult.rows[0].inserted;

      // Upsert line items
      for (const line of (order.order_lines || [])) {
        const offerSku = line.offer_sku || line.product_sku || '';
        const unitPrice = parseFloat(line.price || 0);
        const lineTotal = unitPrice * (parseInt(line.quantity) || 1);
        const lineCommission = parseFloat(line.commission_amount || 0);
        const lineTaxes = line.taxes || [];
        const lineShippingTaxes = line.shipping_taxes || [];
        const lineShippingAmount = parseFloat(line.shipping_price || line.shipping_amount || 0);
        const lineCommissionRate = line.commission_rate_vat != null ? parseFloat(line.commission_rate_vat) : null;
        const productTitle = line.product_title || null;
        const categoryCode = line.category_code || null;
        const categoryLabel = line.category_label || null;
        const orderLineState = line.order_line_state || null;
        const rawMediaUrl = line.product_medias?.[0]?.media_url || line.product_medias?.[0]?.url || null;
        const productMediaUrl = rawMediaUrl
          ? (rawMediaUrl.startsWith('http') ? rawMediaUrl : this.baseURL.replace('/api', '') + rawMediaUrl)
          : null;

        // Match to internal product
        let productId = null;
        if (offerSku) {
          const match = await client.query('SELECT id FROM products WHERE sku = $1 LIMIT 1', [offerSku]);
          if (match.rows.length > 0) productId = match.rows[0].id;
        }

        // Commission rate lookup
        let expectedCommRate = null;
        try { expectedCommRate = await this._lookupCommissionRate(categoryLabel); } catch (_) {}

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
          productId, offerSku, line.offer_id || null,
          parseInt(line.quantity) || 1,
          unitPrice, Math.round(unitPrice * 100),
          lineTotal, Math.round(lineTotal * 100),
          lineCommission, Math.round(lineCommission * 100),
          lineTaxes.length > 0 ? JSON.stringify(lineTaxes) : null,
          Math.round(lineTaxes.reduce((s, t) => s + parseFloat(t.amount || 0), 0) * 100),
          productTitle, categoryCode, categoryLabel,
          lineShippingAmount,
          lineShippingTaxes.length > 0 ? JSON.stringify(lineShippingTaxes) : null,
          lineCommissionRate, productMediaUrl, orderLineState,
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
   * @param {string} miraklOrderId - Mirakl order ID
   * @param {Array<{id: string, accepted: boolean, reason_code?: string}>} lines
   */
  async acceptOrder(miraklOrderId, lines) {
    const startedAt = new Date();

    const payload = {
      order_lines: lines.map(l => {
        const entry = { id: l.id, accepted: l.accepted };
        if (!l.accepted && l.reason_code) entry.reason_code = l.reason_code;
        return entry;
      })
    };

    const data = await this._miraklRequest(
      () => this.client.put(`/orders/${miraklOrderId}/accept`, payload),
      `acceptOrder(${miraklOrderId})`
    );

    // Update local DB
    const orderResult = await this.pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1', [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      const localId = orderResult.rows[0].id;
      await this.pool.query(
        `UPDATE marketplace_orders SET mirakl_order_state = COALESCE($1, mirakl_order_state),
           order_state = COALESCE($1, order_state), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [data?.order_state || null, localId]
      );
      for (const line of lines) {
        const status = line.accepted ? 'ACCEPTED' : 'REFUSED';
        await this.pool.query(
          `UPDATE marketplace_order_items SET status = $1, refused_reason = $2, updated_at = CURRENT_TIMESTAMP
           WHERE order_id = $3 AND mirakl_order_line_id = $4`,
          [status, line.accepted ? null : (line.reason_code || null), localId, line.id]
        );
      }
    }

    await this._logSync('order_accept', 'order', 'SUCCESS', {
      direction: 'outbound', startedAt, entityId: miraklOrderId,
      count: lines.length, succeeded: lines.filter(l => l.accepted).length,
      failed: lines.filter(l => !l.accepted).length
    });

    return data;
  }

  /**
   * Update tracking + confirm shipment (OR23 + OR24).
   * @param {string} miraklOrderId
   * @param {object} trackingInfo - { trackingNumber, carrierCode, carrierName, carrierUrl }
   */
  async shipOrder(miraklOrderId, trackingInfo) {
    const startedAt = new Date();
    const { trackingNumber, carrierCode, carrierName, carrierUrl } = trackingInfo;

    // 1. Update tracking (OR23)
    let trackingPayload;
    if (carrierCode) {
      trackingPayload = { carrier_code: carrierCode, tracking_number: trackingNumber };
    } else {
      trackingPayload = {
        carrier_name: carrierName || 'Other',
        carrier_url: carrierUrl || '',
        tracking_number: trackingNumber
      };
    }

    await this._miraklRequest(
      () => this.client.put(`/orders/${miraklOrderId}/tracking`, trackingPayload),
      `shipOrder:tracking(${miraklOrderId})`
    );

    // Update local items with tracking
    const orderResult = await this.pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1', [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      await this.pool.query(
        `UPDATE marketplace_order_items SET shipping_tracking = $1, shipping_carrier = $2, updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $3 AND status = 'ACCEPTED'`,
        [trackingNumber, carrierCode || carrierName || 'Other', orderResult.rows[0].id]
      );
    }

    // 2. Confirm shipment (OR24)
    const data = await this._miraklRequest(
      () => this.client.put(`/orders/${miraklOrderId}/ship`),
      `shipOrder:confirm(${miraklOrderId})`
    );

    if (orderResult.rows.length > 0) {
      const localId = orderResult.rows[0].id;
      await this.pool.query(
        `UPDATE marketplace_orders SET mirakl_order_state = 'SHIPPED', order_state = 'SHIPPED',
           shipped_date = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [localId]
      );
      await this.pool.query(
        `UPDATE marketplace_order_items SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'ACCEPTED'`,
        [localId]
      );
    }

    await this._logSync('order_ship', 'order', 'SUCCESS', {
      direction: 'outbound', startedAt, entityId: miraklOrderId, count: 1, succeeded: 1
    });

    return data;
  }

  /**
   * Process refunds on order lines (OR28).
   * @param {string} miraklOrderId
   * @param {Array<{order_line_id: string, amount: number, reason_code: string, shipping_amount?: number}>} refunds
   */
  async refundOrder(miraklOrderId, refunds) {
    const startedAt = new Date();

    const payload = {
      refunds: refunds.map(r => ({
        order_line_id: r.order_line_id,
        amount: r.amount,
        reason_code: r.reason_code || 'PRODUCT_RETURNED',
        shipping_amount: r.shipping_amount || 0
      }))
    };

    const data = await this._miraklRequest(
      () => this.client.put(`/orders/${miraklOrderId}/refund`, payload),
      `refundOrder(${miraklOrderId})`
    );

    const orderResult = await this.pool.query(
      'SELECT id FROM marketplace_orders WHERE mirakl_order_id = $1', [miraklOrderId]
    );
    if (orderResult.rows.length > 0) {
      const localId = orderResult.rows[0].id;
      for (const refund of refunds) {
        await this.pool.query(
          `UPDATE marketplace_order_items SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP
           WHERE order_id = $1 AND mirakl_order_line_id = $2`,
          [localId, refund.order_line_id]
        );
      }
    }

    await this._logSync('order_refund', 'order', 'SUCCESS', {
      direction: 'outbound', startedAt, entityId: miraklOrderId,
      count: refunds.length, succeeded: refunds.length
    });

    return data;
  }

  // ============================================================
  // INVENTORY  (ChannelAdapter interface)
  // ============================================================

  /**
   * Push stock levels to Mirakl via STO01 CSV import.
   * @param {Array<{sku: string, quantity: number}>} stockUpdates
   * @returns {{ submitted: number, importId: string|null }}
   */
  async pushInventory(stockUpdates) {
    const startedAt = new Date();

    // Generate stock CSV (semicolon-delimited for STO01)
    const csvLines = ['sku;quantity'];
    for (const row of stockUpdates) {
      csvLines.push(`${this._escapeCsvValue(row.sku)};${Math.max(0, parseInt(row.quantity, 10) || 0)}`);
    }
    const csvString = csvLines.join('\n');

    const fileName = `stock_import_${Date.now()}.csv`;
    const form = new FormData();
    form.append('file', Buffer.from(csvString, 'utf8'), { filename: fileName, contentType: 'text/csv' });

    const data = await this._miraklRequest(
      () => this.client.post('/offers/stock/imports', form, {
        headers: { ...form.getHeaders(), Authorization: this.apiKey }
      }),
      'pushInventory(STO01)'
    );

    const importId = data?.import_id || data?.import?.import_id || null;

    // Record import with channel_id
    await this.pool.query(
      `INSERT INTO marketplace_offer_imports (mirakl_import_id, import_type, file_name, status, records_submitted, submitted_at, channel_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [importId, 'STOCK', fileName, data?.status || 'QUEUED', stockUpdates.length, this.channelId]
    );

    await this._logSync('stock_import', 'inventory', 'SUCCESS', {
      direction: 'outbound', startedAt, count: stockUpdates.length, succeeded: stockUpdates.length
    });

    return { submitted: stockUpdates.length, importId };
  }

  // ============================================================
  // RETURNS  (NEW — Mirakl MR21 returns API)
  // ============================================================

  /**
   * Poll return/incident requests from Mirakl.
   * GET /api/messages/returns (or /api/returns depending on Mirakl version)
   * @param {object} options - { since, states, offset, max }
   * @returns {Array<{ returnId, orderId, items, reason, status }>}
   */
  async pollReturns(options = {}) {
    const startedAt = new Date();
    const params = {};
    if (options.since) params.start_date = options.since;
    if (options.states) params.status = options.states;
    params.offset = options.offset || 0;
    params.max = Math.min(options.max || 50, 100);

    let allReturns = [];
    try {
      const data = await this._miraklRequest(
        () => this.client.get('/returns', { params }),
        'pollReturns'
      );
      const returns = data.returns || data.incidents || [];

      allReturns = returns.map(r => ({
        returnId: r.id || r.return_id,
        orderId: r.order_id,
        miraklOrderId: r.order_commercial_id || r.mirakl_order_id,
        items: (r.return_lines || r.order_lines || []).map(l => ({
          lineId: l.order_line_id,
          sku: l.offer_sku || l.product_sku,
          quantity: l.quantity_returned || l.quantity,
          reason: l.return_reason || l.reason_code
        })),
        reason: r.reason_code || r.return_reason || '',
        status: r.status || r.state,
        createdAt: r.date_created || r.created_date
      }));

      await this._logSync('return_poll', 'return', 'SUCCESS', {
        direction: 'inbound', startedAt, count: allReturns.length, succeeded: allReturns.length
      });
    } catch (error) {
      // 404 means the endpoint isn't enabled — not fatal
      if (error.response?.status === 404) {
        console.warn(`[${this.channelCode}] Returns API not available (404)`);
        return [];
      }
      await this._logSync('return_poll', 'return', 'FAILED', {
        direction: 'inbound', startedAt, error: error.message
      });
      throw error;
    }

    return allReturns;
  }

  // ============================================================
  // MESSAGES  (NEW — Mirakl M10/M11 messaging API)
  // ============================================================

  /**
   * Fetch customer message threads from Mirakl inbox.
   * GET /api/inbox/threads
   * @param {object} options - { since, offset, max }
   */
  async pollMessages(options = {}) {
    const params = {};
    if (options.since) params.date_created_from = options.since;
    params.offset = options.offset || 0;
    params.max = Math.min(options.max || 50, 100);

    const data = await this._miraklRequest(
      () => this.client.get('/inbox/threads', { params }),
      'pollMessages'
    );

    return (data.threads || []).map(t => ({
      threadId: t.id || t.thread_id,
      topic: t.topic?.type || t.topic_type || 'ORDER',
      orderId: t.entity_id || t.order_id,
      subject: t.topic?.value || t.subject || '',
      unread: !t.current_participant_read,
      lastMessage: t.messages?.[0]?.body || '',
      lastMessageDate: t.messages?.[0]?.date_created || t.date_updated,
      participantCount: t.authorized_participants?.length || 0
    }));
  }

  /**
   * Send a message to a Mirakl inbox thread.
   * POST /api/inbox/threads/{threadId}/message
   * @param {string} threadId
   * @param {string} message - body text
   */
  async sendMessage(threadId, message) {
    const data = await this._miraklRequest(
      () => this.client.post(`/inbox/threads/${threadId}/message`, {
        body: message
      }),
      `sendMessage(${threadId})`
    );
    return data;
  }

  // ============================================================
  // VALIDATION  (ChannelAdapter interface)
  // ============================================================

  /**
   * Validate a product meets Best Buy / Mirakl listing requirements.
   * Delegates to the existing offerValidator.
   * @param {object} product
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  async validateProduct(product) {
    const enriched = enrichOfferData(product);
    return validateProductForOffer(enriched);
  }

  // ============================================================
  // UTILITIES  (ChannelAdapter interface)
  // ============================================================

  /**
   * Test if Mirakl credentials are valid by fetching a single offer.
   * @returns {{ connected: boolean, message: string, shopId?: string }}
   */
  async testConnection() {
    try {
      await this._miraklRequest(
        () => this.client.get('/offers', { params: { max: 1 } }),
        'testConnection'
      );
      return { connected: true, message: 'Connected to Mirakl API', shopId: this.shopId };
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return { connected: false, message: `Authentication failed (${status}): check api_key` };
      }
      return { connected: false, message: `Connection failed: ${error.message}` };
    }
  }

  getFeatures() {
    return {
      offers: true,
      orders: true,
      inventory: true,
      returns: true,
      messages: true,
      validation: true,
      csvImport: true,
      stockImport: true,
      ...(this.channel.features || {})
    };
  }

  // ============================================================
  // EXTRA: Inventory management (channel-allocation aware)
  // ============================================================

  /**
   * Compare Mirakl stock levels vs internal ALLOCATED stock (with safety_buffer & allocation_percent).
   * @returns {{ total, inSync, drifted, unknown }}
   */
  async getInventoryDrift() {
    let allOffers = [];
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const page = await this.getRemoteOffers({ offset, max: pageSize });
      allOffers = allOffers.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    // Pre-load channel listings for allocation data
    const listingResult = await this.pool.query(`
      SELECT pcl.channel_sku, pcl.product_id, p.sku, p.name, p.stock_quantity,
             COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
             COALESCE(pcl.allocation_percent, 100) AS allocation_percent
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status = 'ACTIVE'
    `, [this.channelId]);

    const listingMap = new Map();
    for (const row of listingResult.rows) {
      listingMap.set(row.channel_sku || row.sku, row);
    }

    let inSync = 0;
    const drifted = [];
    const unknown = [];

    for (const offer of allOffers) {
      const sku = offer.shop_sku || offer.sku || '';
      const miraklQty = parseInt(offer.quantity, 10) || 0;
      if (!sku) continue;

      const listing = listingMap.get(sku);
      if (!listing) {
        // Try DB lookup as fallback
        const result = await this.pool.query(
          'SELECT id, name, stock_quantity FROM products WHERE sku = $1 OR mirakl_sku = $1 LIMIT 1', [sku]
        );
        if (result.rows.length === 0) { unknown.push({ sku, miraklQty }); continue; }
        const product = result.rows[0];
        const ourQty = parseInt(product.stock_quantity, 10) || 0;
        if (miraklQty === ourQty) { inSync++; }
        else { drifted.push({ sku, productName: product.name, miraklQty, ourQty, allocatedQty: ourQty, diff: ourQty - miraklQty }); }
        continue;
      }

      const rawQty = parseInt(listing.stock_quantity, 10) || 0;
      const allocatedQty = Math.max(0, Math.floor(
        (rawQty - listing.safety_buffer) * (listing.allocation_percent / 100)
      ));

      if (miraklQty === allocatedQty) { inSync++; }
      else {
        drifted.push({
          sku,
          productName: listing.name,
          miraklQty,
          ourQty: rawQty,
          allocatedQty,
          safetyBuffer: listing.safety_buffer,
          allocationPercent: parseFloat(listing.allocation_percent),
          diff: allocatedQty - miraklQty
        });
      }
    }

    return { total: allOffers.length, inSync, drifted, unknown };
  }

  /**
   * Force full inventory sync — push ALL active listings for this channel
   * with allocation formula applied.
   * @returns {{ submitted, importId, dbImportId }}
   */
  async forceFullInventorySync() {
    const result = await this.pool.query(`
      SELECT p.id, p.sku, p.stock_quantity,
             pcl.channel_sku,
             COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
             COALESCE(pcl.allocation_percent, 100) AS allocation_percent
      FROM product_channel_listings pcl
      JOIN products p ON p.id = pcl.product_id
      WHERE pcl.channel_id = $1 AND pcl.listing_status = 'ACTIVE'
        AND p.sku IS NOT NULL
    `, [this.channelId]);

    if (result.rows.length === 0) return { submitted: 0, importId: null };

    const stockUpdates = result.rows.map(r => {
      const rawQty = parseInt(r.stock_quantity, 10) || 0;
      const allocatedQty = Math.max(0, Math.floor(
        (rawQty - r.safety_buffer) * (r.allocation_percent / 100)
      ));
      return {
        sku: r.channel_sku || r.sku,
        quantity: allocatedQty
      };
    });

    const res = await this.pushInventory(stockUpdates);

    // Update last-stock-sync on all pushed products
    const ids = result.rows.map(r => r.id);
    await this.pool.query('UPDATE products SET mirakl_last_stock_sync = NOW() WHERE id = ANY($1)', [ids]);

    // Clear pending queue entries for this channel
    await this.pool.query(
      'UPDATE marketplace_inventory_queue SET synced_at = NOW() WHERE synced_at IS NULL AND channel_id = $1',
      [this.channelId]
    );

    return res;
  }

  /**
   * Queue an inventory change for this channel specifically.
   */
  async queueInventoryChange(productId, sku, oldQty, newQty, changeSource) {
    const result = await this.pool.query(
      `INSERT INTO marketplace_inventory_queue (product_id, sku, old_quantity, new_quantity, change_source, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING queue_id`,
      [productId, sku, oldQty, newQty, changeSource, this.channelId]
    );
    return result.rows[0].queue_id;
  }

  /**
   * Process queued inventory changes as a batch stock upload.
   * Applies allocation formula (safety_buffer, allocation_percent) from product_channel_listings.
   */
  async processInventoryBatch() {
    const pending = await this.pool.query(`
      SELECT DISTINCT ON (q.product_id)
        q.product_id, q.sku, p.stock_quantity,
        pcl.channel_sku,
        COALESCE(pcl.safety_buffer, 0) AS safety_buffer,
        COALESCE(pcl.allocation_percent, 100) AS allocation_percent
      FROM marketplace_inventory_queue q
      JOIN products p ON p.id = q.product_id
      LEFT JOIN product_channel_listings pcl
        ON pcl.product_id = q.product_id
        AND pcl.channel_id = $1
        AND pcl.listing_status = 'ACTIVE'
      WHERE q.synced_at IS NULL AND (q.channel_id = $1 OR q.channel_id IS NULL)
      ORDER BY q.product_id, q.queued_at DESC
    `, [this.channelId]);

    if (pending.rows.length === 0) return { submitted: 0, importId: null, message: 'No pending changes' };

    const stockUpdates = pending.rows.map(r => {
      const rawQty = parseInt(r.stock_quantity, 10) || 0;
      const allocatedQty = Math.max(0, Math.floor(
        (rawQty - r.safety_buffer) * (r.allocation_percent / 100)
      ));
      return {
        sku: r.channel_sku || r.sku,
        quantity: allocatedQty
      };
    });
    const productIds = pending.rows.map(r => r.product_id);

    const res = await this.pushInventory(stockUpdates);

    // Mark queue entries as synced
    await this.pool.query(
      `UPDATE marketplace_inventory_queue SET synced_at = NOW()
       WHERE synced_at IS NULL AND product_id = ANY($1) AND (channel_id = $2 OR channel_id IS NULL)`,
      [productIds, this.channelId]
    );

    // Update products last-stock-sync
    await this.pool.query('UPDATE products SET mirakl_last_stock_sync = NOW() WHERE id = ANY($1)', [productIds]);

    return res;
  }

  /**
   * Check oversell risk for a product across ALL channels.
   * @param {number} productId
   * @returns {{ currentStock, committedQty, availableQty, atRisk, channels, allocations }}
   */
  async checkOversellRisk(productId) {
    const productResult = await this.pool.query(
      'SELECT stock_quantity FROM products WHERE id = $1', [productId]
    );
    if (productResult.rows.length === 0) throw new Error(`Product ${productId} not found`);
    const currentStock = parseInt(productResult.rows[0].stock_quantity, 10) || 0;

    // Sum unshipped order quantities across ALL channels
    const commitResult = await this.pool.query(`
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

    // Total allocation across channels
    const allocResult = await this.pool.query(`
      SELECT pcl.channel_id, mc.channel_code,
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
}

module.exports = MiraklAdapter;
