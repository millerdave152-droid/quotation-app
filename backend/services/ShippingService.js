'use strict';

/**
 * ShippingService — Carrier rate quotes, label generation, tracking, and cost reporting.
 *
 * Uses existing tables: shipping_carriers, shipping_rates, marketplace_shipments,
 * order_fulfillment, fulfillment_status_history, marketplace_orders.
 *
 * Carrier adapter framework: Real carrier API integrations (Canada Post, Purolator, UPS)
 * can be plugged in incrementally by implementing the CarrierAdapter interface.
 */

// ---------------------------------------------------------------------------
// Carrier Adapter Interface (base class — extend for real carrier APIs)
// ---------------------------------------------------------------------------

class CarrierAdapter {
  constructor(carrierRow) {
    this.id = carrierRow.id;
    this.code = carrierRow.carrier_code;
    this.name = carrierRow.carrier_name;
    this.apiEndpoint = carrierRow.api_endpoint;
    this.accountNumber = carrierRow.account_number;
    this.defaultPackageType = carrierRow.default_package_type;
    this.weightUnit = carrierRow.weight_unit;
    this.dimensionUnit = carrierRow.dimension_unit;
    this.markupPercent = parseFloat(carrierRow.rate_markup_percent || 0);
    this.markupFlat = parseFloat(carrierRow.rate_markup_flat || 0);
  }

  /** Override in subclass to call real API. Returns array of rate objects. */
  async getLiveRates(/* origin, destination, packages */) {
    return null; // null = fall back to table-based rates
  }

  /** Override in subclass to call real carrier label API. */
  async createLabel(/* shipmentDetails */) {
    return null; // null = generate a placeholder / manual label reference
  }

  /** Override in subclass to call real carrier tracking API. */
  async getTracking(/* trackingNumber */) {
    return null; // null = return only local DB data
  }

  applyMarkup(baseRate) {
    let rate = baseRate;
    if (this.markupPercent > 0) rate += rate * (this.markupPercent / 100);
    if (this.markupFlat > 0) rate += this.markupFlat;
    return Math.round(rate * 100) / 100;
  }
}

// ---------------------------------------------------------------------------
// Placeholder carrier implementations (to show the adapter pattern)
// ---------------------------------------------------------------------------

class CanadaPostAdapter extends CarrierAdapter {
  // Future: implement getLiveRates, createLabel, getTracking with CP API
}

class PurolatorAdapter extends CarrierAdapter {
  // Future: implement with Purolator E-Ship API
}

class UPSAdapter extends CarrierAdapter {
  // Future: implement with UPS Developer Kit
}

class FedExAdapter extends CarrierAdapter {
  // Future: implement with FedEx Web Services
}

const ADAPTER_MAP = {
  canada_post: CanadaPostAdapter,
  purolator: PurolatorAdapter,
  ups: UPSAdapter,
  fedex: FedExAdapter,
};

// ---------------------------------------------------------------------------
// ShippingService
// ---------------------------------------------------------------------------

class ShippingService {
  constructor(pool) {
    this.pool = pool;
    this._adapters = new Map(); // carrier_id -> CarrierAdapter
    this._loaded = false;
  }

  /** Lazy-load carrier adapters from the DB */
  async _ensureAdapters() {
    if (this._loaded) return;
    const { rows } = await this.pool.query(
      'SELECT * FROM shipping_carriers WHERE is_active = true'
    );
    for (const row of rows) {
      const AdapterClass = ADAPTER_MAP[row.carrier_code] || CarrierAdapter;
      this._adapters.set(row.id, new AdapterClass(row));
    }
    this._loaded = true;
  }

  _getAdapter(carrierId) {
    return this._adapters.get(carrierId) || null;
  }

  // -----------------------------------------------------------------------
  // 1. getRates — rate quotes for an order or ad-hoc shipment
  // -----------------------------------------------------------------------
  async getRates({ orderId, weightKg, destinationPostal, destinationProvince, destinationCountry }) {
    await this._ensureAdapters();

    let weight = weightKg;
    let destPostal = destinationPostal;
    let destProvince = destinationProvince;
    let destCountry = destinationCountry || 'CA';
    let orderData = null;

    // If orderId given, pull weight & destination from the order
    if (orderId) {
      const oRes = await this.pool.query(
        `SELECT mo.id, mo.shipping_address,
                COUNT(moi.id) AS item_count
         FROM marketplace_orders mo
         LEFT JOIN marketplace_order_items moi ON moi.order_id = mo.id
         WHERE mo.id = $1
         GROUP BY mo.id`,
        [orderId]
      );
      if (oRes.rows.length === 0) throw new Error('Order not found: ' + orderId);
      orderData = oRes.rows[0];
      // Estimate weight: ~2kg per item (products table has no weight column)
      weight = weight || Math.max(parseInt(orderData.item_count) * 2, 1);
      const addr = typeof orderData.shipping_address === 'string'
        ? JSON.parse(orderData.shipping_address)
        : orderData.shipping_address || {};
      destPostal = destPostal || addr.zip_code || addr.postal_code || '';
      destProvince = destProvince || addr.state || addr.province || '';
      destCountry = destCountry || addr.country || 'CA';
    }

    if (!weight || weight <= 0) weight = 1;

    // Query all matching rates from shipping_rates
    const ratesRes = await this.pool.query(
      `SELECT sr.*, sc.carrier_code, sc.carrier_name,
              sc.rate_markup_percent, sc.rate_markup_flat
       FROM shipping_rates sr
       JOIN shipping_carriers sc ON sc.id = sr.carrier_id AND sc.is_active = true
       WHERE sr.is_active = true
         AND sr.destination_country = $1
         AND (sr.min_weight_kg <= $2::numeric)
         AND (sr.max_weight_kg IS NULL OR sr.max_weight_kg >= $2::numeric)
       ORDER BY sc.carrier_name, sr.service_code`,
      [destCountry, weight]
    );

    const quotes = [];

    for (const r of ratesRes.rows) {
      const adapter = this._getAdapter(r.carrier_id);

      // Try live rates first (if carrier adapter implements it)
      let liveRates = null;
      if (adapter) {
        try {
          liveRates = await adapter.getLiveRates(
            { postalCode: '', province: 'ON', country: 'CA' }, // origin = store
            { postalCode: destPostal, province: destProvince, country: destCountry },
            [{ weightKg: weight }]
          );
        } catch (_) { /* fall back to table rates */ }
      }

      if (liveRates && liveRates.length > 0) {
        for (const lr of liveRates) {
          quotes.push({
            carrierId: r.carrier_id,
            carrierCode: r.carrier_code,
            carrierName: r.carrier_name,
            serviceCode: lr.serviceCode || r.service_code,
            serviceName: lr.serviceName || r.service_name,
            baseRate: lr.rate,
            totalRate: adapter.applyMarkup(lr.rate),
            estimatedDaysMin: lr.estimatedDaysMin || r.estimated_days_min,
            estimatedDaysMax: lr.estimatedDaysMax || r.estimated_days_max,
            source: 'live_api',
          });
        }
      } else {
        // Table-based rate calculation
        const baseRate = parseFloat(r.base_rate) + parseFloat(r.per_kg_rate || 0) * weight;
        const markup = adapter ? adapter.applyMarkup(baseRate) : baseRate;

        quotes.push({
          carrierId: r.carrier_id,
          carrierCode: r.carrier_code,
          carrierName: r.carrier_name,
          serviceCode: r.service_code,
          serviceName: r.service_name,
          baseRate: Math.round(baseRate * 100) / 100,
          totalRate: markup,
          estimatedDaysMin: r.estimated_days_min,
          estimatedDaysMax: r.estimated_days_max,
          weightKg: weight,
          source: 'rate_table',
        });
      }
    }

    return {
      orderId: orderId || null,
      weightKg: weight,
      destination: { postal: destPostal, province: destProvince, country: destCountry },
      quotes: quotes.sort((a, b) => a.totalRate - b.totalRate),
      quotedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // 2. autoSelectCarrier — pick best carrier/service for an order
  // -----------------------------------------------------------------------
  async autoSelectCarrier({ orderId, weightKg, destinationPostal, destinationProvince, preference }) {
    const ratesResult = await this.getRates({
      orderId, weightKg, destinationPostal, destinationProvince,
    });

    const quotes = ratesResult.quotes;
    if (quotes.length === 0) {
      return { selected: null, reason: 'No carrier rates available', quotes: [] };
    }

    let selected;
    const pref = (preference || 'cheapest').toLowerCase();

    if (pref === 'fastest') {
      selected = quotes.reduce((best, q) => {
        const days = q.estimatedDaysMin || 999;
        const bestDays = best.estimatedDaysMin || 999;
        return days < bestDays ? q : best;
      }, quotes[0]);
    } else {
      // cheapest (default)
      selected = quotes[0]; // already sorted by totalRate
    }

    return {
      selected,
      preference: pref,
      alternativeCount: quotes.length - 1,
      quotes,
    };
  }

  // -----------------------------------------------------------------------
  // 3. generateLabel — create a shipping label for an order
  // -----------------------------------------------------------------------
  async generateLabel({ orderId, carrierId, serviceCode, packages, notes }) {
    await this._ensureAdapters();

    // Look up order
    const oRes = await this.pool.query(
      `SELECT mo.*, mo.shipping_address FROM marketplace_orders mo WHERE mo.id = $1`,
      [orderId]
    );
    if (oRes.rows.length === 0) throw new Error('Order not found: ' + orderId);
    const order = oRes.rows[0];

    const addr = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : order.shipping_address || {};

    // Resolve carrier
    let carrier;
    if (carrierId) {
      const cRes = await this.pool.query('SELECT * FROM shipping_carriers WHERE id = $1', [carrierId]);
      if (cRes.rows.length === 0) throw new Error('Carrier not found: ' + carrierId);
      carrier = cRes.rows[0];
    } else {
      // auto-select cheapest
      const auto = await this.autoSelectCarrier({ orderId });
      if (!auto.selected) throw new Error('No carriers available');
      carrierId = auto.selected.carrierId;
      serviceCode = serviceCode || auto.selected.serviceCode;
      const cRes = await this.pool.query('SELECT * FROM shipping_carriers WHERE id = $1', [carrierId]);
      carrier = cRes.rows[0];
    }

    serviceCode = serviceCode || 'regular';

    // Try live label generation via adapter
    const adapter = this._getAdapter(carrierId);
    let labelResult = null;
    if (adapter) {
      try {
        labelResult = await adapter.createLabel({
          orderId,
          carrier,
          serviceCode,
          destination: addr,
          packages: packages || [{ weightKg: 1 }],
        });
      } catch (_) { /* fall back to manual */ }
    }

    // Generate tracking number placeholder if no live API
    const trackingNumber = labelResult?.trackingNumber
      || `${carrier.carrier_code.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const labelUrl = labelResult?.labelUrl || null;
    const trackingUrl = labelResult?.trackingUrl || null;

    // Look up rate for cost recording (fall back to any rate for carrier if exact service not found)
    let rateRes = await this.pool.query(
      `SELECT base_rate, per_kg_rate FROM shipping_rates
       WHERE carrier_id = $1 AND service_code = $2 AND is_active = true
       LIMIT 1`,
      [carrierId, serviceCode]
    );
    if (rateRes.rows.length === 0) {
      rateRes = await this.pool.query(
        `SELECT base_rate, per_kg_rate FROM shipping_rates
         WHERE carrier_id = $1 AND is_active = true
         ORDER BY base_rate ASC LIMIT 1`,
        [carrierId]
      );
    }
    const totalWeightKg = (packages || []).reduce((s, p) => s + (p.weightKg || 1), 0) || 1;
    let shippingCost = 0;
    if (rateRes.rows.length > 0) {
      const r = rateRes.rows[0];
      shippingCost = parseFloat(r.base_rate) + parseFloat(r.per_kg_rate || 0) * totalWeightKg;
      if (adapter) shippingCost = adapter.applyMarkup(shippingCost);
    }

    // Create fulfillment record
    const fRes = await this.pool.query(
      `INSERT INTO order_fulfillment
       (order_id, fulfillment_type, carrier_id, shipping_service, tracking_number,
        tracking_url, label_url, ship_date, delivery_fee, total_weight_kg,
        package_count, delivery_address, status, customer_notes, status_updated_at)
       VALUES ($1, 'shipping', $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, $9, $10, 'processing', $11, NOW())
       RETURNING *`,
      [
        orderId, carrierId, serviceCode, trackingNumber,
        trackingUrl, labelUrl, Math.round(shippingCost * 100) / 100,
        totalWeightKg, (packages || [{}]).length,
        JSON.stringify(addr), notes || null,
      ]
    );

    // Also insert into marketplace_shipments for marketplace order tracking
    await this.pool.query(
      `INSERT INTO marketplace_shipments
       (order_id, tracking_number, carrier_code, carrier_name, shipping_method,
        shipment_date, shipment_status)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'PROCESSING')`,
      [orderId, trackingNumber, carrier.carrier_code, carrier.carrier_name, serviceCode]
    );

    return {
      fulfillmentId: fRes.rows[0].id,
      orderId,
      trackingNumber,
      trackingUrl,
      labelUrl,
      carrier: { id: carrierId, code: carrier.carrier_code, name: carrier.carrier_name },
      serviceCode,
      shippingCost: Math.round(shippingCost * 100) / 100,
      weightKg: totalWeightKg,
      packageCount: (packages || [{}]).length,
      status: 'processing',
      labelGenerated: !!labelResult,
      createdAt: fRes.rows[0].created_at,
    };
  }

  // -----------------------------------------------------------------------
  // 4. generateBatchLabels — batch label generation for multiple orders
  // -----------------------------------------------------------------------
  async generateBatchLabels({ orderIds, carrierId, serviceCode }) {
    if (!orderIds || orderIds.length === 0) throw new Error('orderIds array is required');

    const results = [];
    for (const oid of orderIds) {
      try {
        const label = await this.generateLabel({ orderId: oid, carrierId, serviceCode });
        results.push({ orderId: oid, success: true, ...label });
      } catch (err) {
        results.push({ orderId: oid, success: false, error: err.message });
      }
    }

    return {
      total: orderIds.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  // -----------------------------------------------------------------------
  // 5. trackShipment — look up tracking info by tracking number
  // -----------------------------------------------------------------------
  async trackShipment(trackingNumber) {
    await this._ensureAdapters();

    // Check marketplace_shipments
    const msRes = await this.pool.query(
      `SELECT ms.*, mo.mirakl_order_id, mo.order_state, mo.customer_name,
              mo.shipping_address
       FROM marketplace_shipments ms
       JOIN marketplace_orders mo ON mo.id = ms.order_id
       WHERE ms.tracking_number = $1
       ORDER BY ms.created_at DESC LIMIT 1`,
      [trackingNumber]
    );

    // Check order_fulfillment
    const ofRes = await this.pool.query(
      `SELECT of2.*, sc.carrier_code, sc.carrier_name
       FROM order_fulfillment of2
       LEFT JOIN shipping_carriers sc ON sc.id = of2.carrier_id
       WHERE of2.tracking_number = $1
       ORDER BY of2.created_at DESC LIMIT 1`,
      [trackingNumber]
    );

    // Get status history if fulfillment exists
    let statusHistory = [];
    if (ofRes.rows.length > 0) {
      const hRes = await this.pool.query(
        `SELECT * FROM fulfillment_status_history
         WHERE fulfillment_id = $1
         ORDER BY changed_at ASC`,
        [ofRes.rows[0].id]
      );
      statusHistory = hRes.rows;
    }

    // Try live tracking from carrier adapter
    const shipment = msRes.rows[0] || null;
    const fulfillment = ofRes.rows[0] || null;
    let liveTracking = null;

    if (fulfillment && fulfillment.carrier_id) {
      const adapter = this._getAdapter(fulfillment.carrier_id);
      if (adapter) {
        try {
          liveTracking = await adapter.getTracking(trackingNumber);
        } catch (_) { /* use local data only */ }
      }
    }

    if (!shipment && !fulfillment) {
      return { found: false, trackingNumber, message: 'No shipment found with this tracking number' };
    }

    return {
      found: true,
      trackingNumber,
      carrier: shipment
        ? { code: shipment.carrier_code, name: shipment.carrier_name }
        : { code: fulfillment?.carrier_code, name: fulfillment?.carrier_name },
      status: fulfillment?.status || shipment?.shipment_status || 'unknown',
      shipmentDate: shipment?.shipment_date || fulfillment?.ship_date,
      estimatedDelivery: shipment?.estimated_delivery_date || null,
      actualDelivery: shipment?.actual_delivery_date || fulfillment?.delivered_at || null,
      orderId: shipment?.order_id || fulfillment?.order_id,
      customerName: shipment?.customer_name || null,
      shippingAddress: shipment?.shipping_address || fulfillment?.delivery_address,
      labelUrl: fulfillment?.label_url || null,
      trackingUrl: fulfillment?.tracking_url || null,
      statusHistory,
      liveTracking,
    };
  }

  // -----------------------------------------------------------------------
  // 6. getShippingCostReport — shipping P&L: actual cost vs charged
  // -----------------------------------------------------------------------
  async getShippingCostReport({ startDate, endDate, channelId, carrierId, groupBy }) {
    const params = [];
    const wheres = [];
    let paramIdx = 1;

    if (startDate) {
      wheres.push(`ms.shipment_date >= $${paramIdx}::timestamp`);
      params.push(startDate);
      paramIdx++;
    }
    if (endDate) {
      wheres.push(`ms.shipment_date <= $${paramIdx}::timestamp`);
      params.push(endDate);
      paramIdx++;
    }
    if (channelId) {
      wheres.push(`mo.channel_id = $${paramIdx}::int`);
      params.push(channelId);
      paramIdx++;
    }
    if (carrierId) {
      wheres.push(`ms.carrier_code = (SELECT carrier_code FROM shipping_carriers WHERE id = $${paramIdx}::int)`);
      params.push(carrierId);
      paramIdx++;
    }

    const whereClause = wheres.length > 0 ? 'WHERE ' + wheres.join(' AND ') : '';

    // Determine GROUP BY field
    const groupField = groupBy === 'carrier' ? 'ms.carrier_code'
      : groupBy === 'channel' ? 'mc.channel_name'
      : groupBy === 'month' ? "to_char(ms.shipment_date, 'YYYY-MM')"
      : 'ms.carrier_code'; // default

    const groupLabel = groupBy === 'carrier' ? 'carrier'
      : groupBy === 'channel' ? 'channel'
      : groupBy === 'month' ? 'month'
      : 'carrier';

    // Main report query
    const reportRes = await this.pool.query(
      `SELECT
         ${groupField} AS group_key,
         COUNT(DISTINCT ms.id) AS shipment_count,
         COUNT(DISTINCT ms.order_id) AS order_count,
         COALESCE(SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0)), 0) AS revenue_charged,
         COALESCE(SUM(of2.delivery_fee), 0) AS actual_cost,
         COALESCE(SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0)), 0)
           - COALESCE(SUM(of2.delivery_fee), 0) AS profit,
         CASE WHEN SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0)) > 0
           THEN ROUND(
             (SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0))
              - COALESCE(SUM(of2.delivery_fee), 0))
             / SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0)) * 100, 2)
           ELSE 0
         END AS margin_percent,
         ROUND(AVG(COALESCE(of2.delivery_fee, 0)), 2) AS avg_cost_per_shipment
       FROM marketplace_shipments ms
       JOIN marketplace_orders mo ON mo.id = ms.order_id
       LEFT JOIN marketplace_channels mc ON mc.id = mo.channel_id
       LEFT JOIN order_fulfillment of2 ON of2.order_id = ms.order_id
         AND of2.tracking_number = ms.tracking_number
       ${whereClause}
       GROUP BY ${groupField}
       ORDER BY shipment_count DESC`,
      params
    );

    // Summary totals
    const totalRes = await this.pool.query(
      `SELECT
         COUNT(DISTINCT ms.id) AS total_shipments,
         COUNT(DISTINCT ms.order_id) AS total_orders,
         COALESCE(SUM(COALESCE(mo.shipping_price, mo.shipping_price_cents / 100.0, 0)), 0) AS total_revenue,
         COALESCE(SUM(of2.delivery_fee), 0) AS total_cost,
         COUNT(DISTINCT ms.carrier_code) AS carrier_count,
         ROUND(AVG(COALESCE(of2.delivery_fee, 0)), 2) AS avg_cost
       FROM marketplace_shipments ms
       JOIN marketplace_orders mo ON mo.id = ms.order_id
       LEFT JOIN order_fulfillment of2 ON of2.order_id = ms.order_id
         AND of2.tracking_number = ms.tracking_number
       ${whereClause}`,
      params
    );

    const totals = totalRes.rows[0];
    const totalRevenue = parseFloat(totals.total_revenue || 0);
    const totalCost = parseFloat(totals.total_cost || 0);

    return {
      period: { startDate: startDate || 'all-time', endDate: endDate || 'now' },
      summary: {
        totalShipments: parseInt(totals.total_shipments),
        totalOrders: parseInt(totals.total_orders),
        totalRevenue: totalRevenue,
        totalCost: totalCost,
        totalProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
        marginPercent: totalRevenue > 0
          ? Math.round((totalRevenue - totalCost) / totalRevenue * 10000) / 100
          : 0,
        avgCostPerShipment: parseFloat(totals.avg_cost || 0),
        carrierCount: parseInt(totals.carrier_count),
      },
      breakdown: reportRes.rows.map(r => ({
        [groupLabel]: r.group_key,
        shipmentCount: parseInt(r.shipment_count),
        orderCount: parseInt(r.order_count),
        revenueCharged: parseFloat(r.revenue_charged),
        actualCost: parseFloat(r.actual_cost),
        profit: parseFloat(r.profit),
        marginPercent: parseFloat(r.margin_percent),
        avgCostPerShipment: parseFloat(r.avg_cost_per_shipment),
      })),
    };
  }
}

// Export singleton
const pool = require('../db');
module.exports = new ShippingService(pool);
