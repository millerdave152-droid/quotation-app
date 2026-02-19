const pool = require('../db');

class TaxEngine {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Canadian provincial tax rates (2025-2026) ─────────────────────
  getTaxRates() {
    return {
      'ON': { type: 'HST', rate: 0.13, gst: 0.05, pst: 0.08 },
      'BC': { type: 'GST+PST', rate: 0.12, gst: 0.05, pst: 0.07 },
      'AB': { type: 'GST', rate: 0.05, gst: 0.05, pst: 0 },
      'SK': { type: 'GST+PST', rate: 0.11, gst: 0.05, pst: 0.06 },
      'MB': { type: 'GST+PST', rate: 0.12, gst: 0.05, pst: 0.07 },
      'QC': { type: 'GST+QST', rate: 0.14975, gst: 0.05, pst: 0.09975 },
      'NB': { type: 'HST', rate: 0.15, gst: 0.05, pst: 0.10 },
      'NS': { type: 'HST', rate: 0.15, gst: 0.05, pst: 0.10 },
      'PE': { type: 'HST', rate: 0.15, gst: 0.05, pst: 0.10 },
      'NL': { type: 'HST', rate: 0.15, gst: 0.05, pst: 0.10 },
      'NT': { type: 'GST', rate: 0.05, gst: 0.05, pst: 0 },
      'YT': { type: 'GST', rate: 0.05, gst: 0.05, pst: 0 },
      'NU': { type: 'GST', rate: 0.05, gst: 0.05, pst: 0 }
    };
  }

  // ─── Calculate tax for a given subtotal + province ─────────────────
  calculateTax(subtotal, province) {
    var rates = this.getTaxRates()[province] || this.getTaxRates()['ON'];
    return {
      province: province,
      taxType: rates.type,
      subtotal: subtotal,
      gstAmount: Math.round(subtotal * rates.gst * 100) / 100,
      pstAmount: Math.round(subtotal * rates.pst * 100) / 100,
      totalTax: Math.round(subtotal * rates.rate * 100) / 100,
      grandTotal: Math.round((subtotal + subtotal * rates.rate) * 100) / 100,
      effectiveRate: rates.rate
    };
  }

  // ─── Environmental Handling Fee lookup ──────────────────────────────
  getEHF(productCategory, province) {
    // EHF rates by province — Ontario has the most comprehensive program
    // Rates from Ontario Electronic Stewardship / EPRA / CSSA
    var ehfRates = {
      'ON': {
        'Refrigerators': 29.58, 'Freezers': 16.67, 'Washers': 7.35,
        'Dryers': 3.45, 'Dishwashers': 7.35, 'Ranges': 7.35,
        'Microwaves': 7.35, 'Air_Conditioners': 7.35,
        'TVs': 26.39, 'Monitors': 10.71, 'Computers': 4.42,
        'Printers': 3.23, 'Small_Appliance': 1.52, 'Audio': 1.52,
        'Phones': 0.18, 'Tablets': 0.18
      },
      'BC': {
        'Refrigerators': 24.00, 'Freezers': 14.00, 'Washers': 7.00,
        'Dryers': 3.00, 'Dishwashers': 7.00, 'Ranges': 7.00,
        'Microwaves': 6.00, 'Air_Conditioners': 7.00,
        'TVs': 18.50, 'Monitors': 8.00, 'Computers': 3.50,
        'Printers': 3.00, 'Small_Appliance': 1.25, 'Audio': 1.25,
        'Phones': 0.15, 'Tablets': 0.15
      },
      'QC': {
        'Refrigerators': 22.27, 'Freezers': 12.93, 'Washers': 6.60,
        'Dryers': 3.20, 'Dishwashers': 6.60, 'Ranges': 6.60,
        'Microwaves': 6.60, 'Air_Conditioners': 6.60,
        'TVs': 20.00, 'Monitors': 9.00, 'Computers': 3.80,
        'Printers': 2.80, 'Small_Appliance': 1.10, 'Audio': 1.10,
        'Phones': 0.15, 'Tablets': 0.15
      },
      'AB': {
        'TVs': 15.00, 'Monitors': 7.00, 'Computers': 3.00,
        'Printers': 2.50, 'Small_Appliance': 1.00, 'Phones': 0.10
      },
      'SK': {
        'TVs': 12.80, 'Monitors': 6.50, 'Computers': 2.80,
        'Printers': 2.20, 'Small_Appliance': 0.90, 'Phones': 0.10
      },
      'MB': {
        'TVs': 14.50, 'Monitors': 7.00, 'Computers': 3.00,
        'Printers': 2.50, 'Small_Appliance': 1.00, 'Phones': 0.10
      },
      'NB': {
        'TVs': 15.00, 'Monitors': 7.00, 'Computers': 3.00,
        'Small_Appliance': 1.00
      },
      'NS': {
        'TVs': 15.00, 'Monitors': 7.00, 'Computers': 3.00,
        'Small_Appliance': 1.00
      },
      'PE': {
        'TVs': 14.00, 'Monitors': 6.50, 'Computers': 2.80,
        'Small_Appliance': 0.90
      },
      'NL': {
        'TVs': 14.00, 'Monitors': 6.50, 'Computers': 2.80,
        'Small_Appliance': 0.90
      }
    };

    var provinceRates = ehfRates[province];
    if (!provinceRates) return { province: province, category: productCategory, ehfAmount: 0, note: 'No EHF program for this province' };

    var amount = provinceRates[productCategory] || 0;
    return {
      province: province,
      category: productCategory,
      ehfAmount: amount,
      note: amount > 0 ? 'EHF applicable' : 'No EHF for this category in ' + province
    };
  }

  // ─── All EHF rates for a province ──────────────────────────────────
  getEHFByProvince(province) {
    var allRates = this.getEHF('_lookup', province);
    // Re-call for each category to build full list
    var categories = [
      'Refrigerators', 'Freezers', 'Washers', 'Dryers', 'Dishwashers',
      'Ranges', 'Microwaves', 'Air_Conditioners', 'TVs', 'Monitors',
      'Computers', 'Printers', 'Small_Appliance', 'Audio', 'Phones', 'Tablets'
    ];
    var results = [];
    for (var i = 0; i < categories.length; i++) {
      var r = this.getEHF(categories[i], province);
      if (r.ehfAmount > 0) results.push(r);
    }
    return results;
  }

  // ─── Tax reconciliation report (CRA-ready) ─────────────────────────
  async getTaxReconciliation(dateFrom, dateTo) {
    // Per-province, per-tax-code breakdown from actual order item taxes JSONB
    var { rows: taxByProvince } = await this.pool.query(`
      SELECT
        COALESCE(o.shipping_address->>'state', 'UNKNOWN') AS province,
        t.value->>'code' AS tax_code,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(oi.quantity)::int AS units,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS taxable_sales,
        SUM((t.value->>'amount')::numeric)::numeric(14,2) AS tax_collected,
        SUM(COALESCE(oi.shipping_amount, 0))::numeric(14,2) AS shipping_revenue
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id,
      LATERAL jsonb_array_elements(COALESCE(oi.taxes, '[]'::jsonb)) AS t(value)
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        AND (t.value->>'amount')::numeric > 0
      GROUP BY province, tax_code
      ORDER BY province, tax_code
    `, [dateFrom, dateTo]);

    // Shipping taxes
    var { rows: shippingTax } = await this.pool.query(`
      SELECT
        COALESCE(o.shipping_address->>'state', 'UNKNOWN') AS province,
        st.value->>'code' AS tax_code,
        SUM((st.value->>'amount')::numeric)::numeric(14,2) AS shipping_tax_collected
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id,
      LATERAL jsonb_array_elements(COALESCE(oi.shipping_taxes, '[]'::jsonb)) AS st(value)
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        AND (st.value->>'amount')::numeric > 0
      GROUP BY province, tax_code
      ORDER BY province, tax_code
    `, [dateFrom, dateTo]);

    // Overall totals
    var { rows: [totals] } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT o.id)::int AS total_orders,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS total_sales,
        SUM(COALESCE(o.taxes_total, o.tax_cents / 100.0))::numeric(14,2) AS total_tax_collected,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission_paid
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [dateFrom, dateTo]);

    // Per-channel breakdown
    var { rows: byChannel } = await this.pool.query(`
      SELECT
        c.channel_code,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS sales,
        SUM(COALESCE(o.taxes_total, o.tax_cents / 100.0))::numeric(14,2) AS tax_collected,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission_paid
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.channel_code
      ORDER BY sales DESC
    `, [dateFrom, dateTo]);

    // Build shipping tax lookup for merging
    var shippingMap = {};
    shippingTax.forEach(function(r) {
      var key = r.province + ':' + r.tax_code;
      shippingMap[key] = parseFloat(r.shipping_tax_collected);
    });

    // Merge shipping tax into main results
    var merged = taxByProvince.map(function(r) {
      var key = r.province + ':' + r.tax_code;
      return {
        province: r.province,
        tax_code: r.tax_code,
        order_count: r.order_count,
        units: r.units,
        taxable_sales: r.taxable_sales,
        product_tax: r.tax_collected,
        shipping_tax: shippingMap[key] ? shippingMap[key].toFixed(2) : '0.00',
        total_tax: (parseFloat(r.tax_collected) + (shippingMap[key] || 0)).toFixed(2)
      };
    });

    // CRA summary: aggregate GST/HST (federal) vs PST/QST (provincial)
    var federalTax = 0, provincialTax = 0;
    merged.forEach(function(r) {
      var amt = parseFloat(r.total_tax);
      if (r.tax_code === 'GST' || r.tax_code === 'HST') federalTax += amt;
      else provincialTax += amt;
    });

    return {
      period: { from: dateFrom, to: dateTo },
      summary: {
        total_orders: (totals && totals.total_orders) || 0,
        total_sales: (totals && totals.total_sales) || '0.00',
        total_tax_collected: (totals && totals.total_tax_collected) || '0.00',
        total_commission_paid: (totals && totals.total_commission_paid) || '0.00',
        federal_tax_gst_hst: federalTax.toFixed(2),
        provincial_tax_pst_qst: provincialTax.toFixed(2)
      },
      by_province_and_code: merged,
      by_channel: byChannel
    };
  }

  // ─── Commission tax report (for ITC claims) ────────────────────────
  async getCommissionTaxReport(dateFrom, dateTo) {
    // Marketplace commissions are a taxable supply — the marketplace charges
    // GST/HST on commission fees, which the seller can claim as Input Tax Credits

    var { rows: byProvince } = await this.pool.query(`
      SELECT
        COALESCE(o.shipping_address->>'state', 'UNKNOWN') AS province,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS gross_sales,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission_paid,
        AVG(COALESCE(oi.commission_rate, 0))::numeric(5,2) AS avg_commission_rate
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY province
      ORDER BY commission_paid DESC
    `, [dateFrom, dateTo]);

    // Calculate ITC on commissions (GST/HST component of marketplace fees)
    // Marketplace operator (Best Buy) is ON-registered, charges 13% HST on commissions
    var rates = this.getTaxRates();
    var itcRows = byProvince.map(function(r) {
      // Commission is charged by the marketplace (ON-based), so HST applies
      // ITC = commission * HST_rate / (1 + HST_rate) for tax-inclusive
      // Or commission * HST_rate for tax-exclusive
      // Best Buy commission is typically tax-exclusive, so ITC = commission * 0.13
      var commissionPaid = parseFloat(r.commission_paid);
      var hstOnCommission = Math.round(commissionPaid * 0.13 * 100) / 100;
      return {
        province: r.province,
        order_count: r.order_count,
        gross_sales: r.gross_sales,
        commission_paid: r.commission_paid,
        avg_commission_rate: r.avg_commission_rate,
        hst_on_commission: hstOnCommission.toFixed(2),
        itc_claimable: hstOnCommission.toFixed(2)
      };
    });

    var totalCommission = 0, totalITC = 0;
    itcRows.forEach(function(r) {
      totalCommission += parseFloat(r.commission_paid);
      totalITC += parseFloat(r.itc_claimable);
    });

    // Monthly breakdown for CRA filing
    var { rows: monthly } = await this.pool.query(`
      SELECT
        date_trunc('month', o.order_date) AS month,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS gross_sales,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission_paid
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY date_trunc('month', o.order_date)
      ORDER BY month ASC
    `, [dateFrom, dateTo]);

    var monthlyWithITC = monthly.map(function(m) {
      var cp = parseFloat(m.commission_paid);
      var itc = Math.round(cp * 0.13 * 100) / 100;
      return {
        month: m.month,
        order_count: m.order_count,
        gross_sales: m.gross_sales,
        commission_paid: m.commission_paid,
        hst_on_commission: itc.toFixed(2),
        itc_claimable: itc.toFixed(2)
      };
    });

    return {
      period: { from: dateFrom, to: dateTo },
      summary: {
        total_commission_paid: totalCommission.toFixed(2),
        total_hst_on_commission: totalITC.toFixed(2),
        total_itc_claimable: totalITC.toFixed(2),
        note: 'ITC calculated at 13% HST on marketplace commission fees (ON-registered marketplace operator)'
      },
      by_province: itcRows,
      monthly: monthlyWithITC
    };
  }
}

module.exports = new TaxEngine(pool);
