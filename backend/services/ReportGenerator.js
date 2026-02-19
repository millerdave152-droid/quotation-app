'use strict';

/**
 * ReportGenerator — Daily summaries, weekly P&L, monthly tax reconciliation,
 * and CSV/JSON export for marketplace reporting.
 *
 * Uses: marketplace_orders, marketplace_order_items, marketplace_channels,
 *       marketplace_returns, marketplace_shipments, products (cost).
 */

class ReportGenerator {
  constructor(pool) {
    this.pool = pool;
  }

  // -----------------------------------------------------------------------
  // 1. Daily Sales Summary
  // -----------------------------------------------------------------------
  async generateDailySummary(date) {
    const d = date ? new Date(date) : new Date();
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD

    // Revenue by channel
    const { rows: byChannel } = await this.pool.query(`
      SELECT
        c.id AS channel_id,
        c.channel_code,
        c.channel_name,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(oi.quantity)::int AS units_sold,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS gross_revenue,
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0)
          - COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS net_revenue
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($1::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.id, c.channel_code, c.channel_name
      ORDER BY gross_revenue DESC
    `, [dateStr]);

    // Top products
    const { rows: topProducts } = await this.pool.query(`
      SELECT
        oi.product_sku AS sku,
        oi.product_title AS title,
        SUM(oi.quantity)::int AS units_sold,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS revenue,
        COUNT(DISTINCT o.id)::int AS order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($1::date + INTERVAL '1 day')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY oi.product_sku, oi.product_title
      ORDER BY revenue DESC
      LIMIT 10
    `, [dateStr]);

    // Issues: orders pending acceptance near deadline, failed shipments, returns
    const { rows: [issues] } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE o.order_state = 'WAITING_ACCEPTANCE'
            AND o.acceptance_deadline IS NOT NULL
            AND o.acceptance_deadline < NOW() + INTERVAL '4 hours'
        )::int AS acceptance_urgent,
        COUNT(*) FILTER (WHERE o.order_state = 'WAITING_ACCEPTANCE')::int AS awaiting_acceptance,
        COUNT(*) FILTER (WHERE o.order_state = 'SHIPPING')::int AS awaiting_shipment
      FROM marketplace_orders o
      WHERE o.order_date >= $1::date
        AND o.order_date < ($1::date + INTERVAL '1 day')
    `, [dateStr]);

    // Returns created today
    const { rows: [returns] } = await this.pool.query(`
      SELECT
        COUNT(*)::int AS return_count,
        COALESCE(SUM(total_refund_cents / 100.0), 0)::numeric(14,2) AS refund_total
      FROM marketplace_returns
      WHERE created_at >= $1::date
        AND created_at < ($1::date + INTERVAL '1 day')
    `, [dateStr]);

    // Totals across all channels
    const totals = byChannel.reduce((acc, ch) => {
      acc.order_count += ch.order_count;
      acc.units_sold += ch.units_sold;
      acc.gross_revenue += parseFloat(ch.gross_revenue);
      acc.commission += parseFloat(ch.commission);
      acc.net_revenue += parseFloat(ch.net_revenue);
      return acc;
    }, { order_count: 0, units_sold: 0, gross_revenue: 0, commission: 0, net_revenue: 0 });

    // Round totals
    totals.gross_revenue = Math.round(totals.gross_revenue * 100) / 100;
    totals.commission = Math.round(totals.commission * 100) / 100;
    totals.net_revenue = Math.round(totals.net_revenue * 100) / 100;

    return {
      reportType: 'DailySummary',
      date: dateStr,
      generatedAt: new Date().toISOString(),
      totals,
      byChannel: byChannel.map(r => ({
        channelCode: r.channel_code,
        channelName: r.channel_name,
        orderCount: r.order_count,
        unitsSold: r.units_sold,
        grossRevenue: parseFloat(r.gross_revenue),
        commission: parseFloat(r.commission),
        netRevenue: parseFloat(r.net_revenue),
      })),
      topProducts: topProducts.map(r => ({
        sku: r.sku,
        title: r.title,
        unitsSold: r.units_sold,
        revenue: parseFloat(r.revenue),
        orderCount: r.order_count,
      })),
      issues: {
        acceptanceUrgent: issues?.acceptance_urgent || 0,
        awaitingAcceptance: issues?.awaiting_acceptance || 0,
        awaitingShipment: issues?.awaiting_shipment || 0,
      },
      returns: {
        count: returns?.return_count || 0,
        refundTotal: parseFloat(returns?.refund_total || 0),
      },
    };
  }

  // -----------------------------------------------------------------------
  // 2. Weekly P&L by Channel
  // -----------------------------------------------------------------------
  async generateWeeklyPnL(weekStartDate) {
    // Default to Monday of current week
    let start;
    if (weekStartDate) {
      start = new Date(weekStartDate);
    } else {
      start = new Date();
      const dow = start.getDay();
      start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday
    }
    const startStr = start.toISOString().slice(0, 10);

    const { rows: channelPnL } = await this.pool.query(`
      SELECT
        c.channel_code,
        c.channel_name,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(oi.quantity)::int AS units_sold,

        -- Revenue
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS gross_revenue,

        -- COGS
        SUM(COALESCE(p.cost, 0) * oi.quantity)::numeric(14,2) AS cogs,

        -- Commission
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS commission,

        -- Shipping cost (what we allocated per item)
        SUM(COALESCE(oi.shipping_amount, 0))::numeric(14,2) AS shipping_costs

      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.order_date >= $1::date
        AND o.order_date < ($1::date + INTERVAL '7 days')
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
      GROUP BY c.channel_code, c.channel_name
      ORDER BY gross_revenue DESC
    `, [startStr]);

    // Returns for the week
    const { rows: returnsByChannel } = await this.pool.query(`
      SELECT
        c.channel_code,
        COALESCE(SUM(r.total_refund_cents / 100.0), 0)::numeric(14,2) AS return_costs
      FROM marketplace_returns r
      JOIN marketplace_orders o ON o.id = r.order_id
      JOIN marketplace_channels c ON c.id = o.channel_id
      WHERE r.created_at >= $1::date
        AND r.created_at < ($1::date + INTERVAL '7 days')
      GROUP BY c.channel_code
    `, [startStr]);

    const returnMap = {};
    returnsByChannel.forEach(r => { returnMap[r.channel_code] = parseFloat(r.return_costs); });

    // Build P&L per channel
    const channels = channelPnL.map(r => {
      const gross = parseFloat(r.gross_revenue);
      const cogs = parseFloat(r.cogs);
      const commission = parseFloat(r.commission);
      const shipping = parseFloat(r.shipping_costs);
      const returns = returnMap[r.channel_code] || 0;
      const netProfit = Math.round((gross - cogs - commission - shipping - returns) * 100) / 100;

      return {
        channelCode: r.channel_code,
        channelName: r.channel_name,
        orderCount: r.order_count,
        unitsSold: r.units_sold,
        grossRevenue: gross,
        cogs,
        commission,
        shippingCosts: shipping,
        returnCosts: returns,
        netProfit,
        marginPercent: gross > 0 ? Math.round(netProfit / gross * 10000) / 100 : 0,
      };
    });

    // Consolidated totals
    const totals = channels.reduce((acc, ch) => {
      acc.orderCount += ch.orderCount;
      acc.unitsSold += ch.unitsSold;
      acc.grossRevenue += ch.grossRevenue;
      acc.cogs += ch.cogs;
      acc.commission += ch.commission;
      acc.shippingCosts += ch.shippingCosts;
      acc.returnCosts += ch.returnCosts;
      acc.netProfit += ch.netProfit;
      return acc;
    }, { orderCount: 0, unitsSold: 0, grossRevenue: 0, cogs: 0, commission: 0, shippingCosts: 0, returnCosts: 0, netProfit: 0 });

    totals.marginPercent = totals.grossRevenue > 0
      ? Math.round(totals.netProfit / totals.grossRevenue * 10000) / 100 : 0;

    // Round all numeric fields
    for (const key of ['grossRevenue', 'cogs', 'commission', 'shippingCosts', 'returnCosts', 'netProfit']) {
      totals[key] = Math.round(totals[key] * 100) / 100;
    }

    return {
      reportType: 'WeeklyPnL',
      weekStart: startStr,
      weekEnd: new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      totals,
      byChannel: channels,
    };
  }

  // -----------------------------------------------------------------------
  // 3. Monthly Tax Reconciliation
  // -----------------------------------------------------------------------
  async generateMonthlyTaxReport(year, month) {
    const y = parseInt(year);
    const m = parseInt(month);
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    // End = first day of next month
    const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    // Tax by province and tax code from JSONB
    const { rows: taxByProvince } = await this.pool.query(`
      SELECT
        COALESCE(o.shipping_address->>'state', 'UNKNOWN') AS province,
        t.value->>'code' AS tax_code,
        COUNT(DISTINCT o.id)::int AS order_count,
        SUM(oi.quantity)::int AS units,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS taxable_sales,
        SUM((t.value->>'amount')::numeric)::numeric(14,2) AS product_tax
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id,
      LATERAL jsonb_array_elements(COALESCE(oi.taxes, '[]'::jsonb)) AS t(value)
      WHERE o.order_date >= $1::date
        AND o.order_date < $2::date
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        AND (t.value->>'amount')::numeric > 0
      GROUP BY province, tax_code
      ORDER BY province, tax_code
    `, [startStr, endDate]);

    // Shipping taxes
    const { rows: shippingTax } = await this.pool.query(`
      SELECT
        COALESCE(o.shipping_address->>'state', 'UNKNOWN') AS province,
        st.value->>'code' AS tax_code,
        SUM((st.value->>'amount')::numeric)::numeric(14,2) AS shipping_tax
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id,
      LATERAL jsonb_array_elements(COALESCE(oi.shipping_taxes, '[]'::jsonb)) AS st(value)
      WHERE o.order_date >= $1::date
        AND o.order_date < $2::date
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        AND (st.value->>'amount')::numeric > 0
      GROUP BY province, tax_code
    `, [startStr, endDate]);

    const shippingMap = {};
    shippingTax.forEach(r => {
      shippingMap[r.province + ':' + r.tax_code] = parseFloat(r.shipping_tax);
    });

    // Commission fees (ITC eligible at 13% HST — marketplace registered in ON)
    const { rows: [commissionData] } = await this.pool.query(`
      SELECT
        SUM(COALESCE(oi.commission_amount, oi.commission_fee_cents / 100.0))::numeric(14,2) AS total_commission,
        COUNT(DISTINCT o.id)::int AS order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < $2::date
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [startStr, endDate]);

    const totalCommission = parseFloat(commissionData?.total_commission || 0);
    const commissionHST = Math.round(totalCommission * 0.13 * 100) / 100; // ITC claimable

    // EHF collected (from taxes JSONB where code = 'EHF')
    const { rows: [ehfData] } = await this.pool.query(`
      SELECT
        COALESCE(SUM((t.value->>'amount')::numeric), 0)::numeric(14,2) AS ehf_collected
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id,
      LATERAL jsonb_array_elements(COALESCE(oi.taxes, '[]'::jsonb)) AS t(value)
      WHERE o.order_date >= $1::date
        AND o.order_date < $2::date
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
        AND UPPER(t.value->>'code') = 'EHF'
    `, [startStr, endDate]);

    // Merge tax rows with shipping tax
    let federalTax = 0, provincialTax = 0;
    const mergedTax = taxByProvince.map(r => {
      const key = r.province + ':' + r.tax_code;
      const shipTax = shippingMap[key] || 0;
      const totalTax = parseFloat(r.product_tax) + shipTax;
      if (r.tax_code === 'GST' || r.tax_code === 'HST') federalTax += totalTax;
      else provincialTax += totalTax;

      return {
        province: r.province,
        taxCode: r.tax_code,
        orderCount: r.order_count,
        units: r.units,
        taxableSales: parseFloat(r.taxable_sales),
        productTax: parseFloat(r.product_tax),
        shippingTax: Math.round(shipTax * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
      };
    });

    // Overall summary
    const { rows: [summary] } = await this.pool.query(`
      SELECT
        COUNT(DISTINCT o.id)::int AS total_orders,
        SUM(COALESCE(oi.line_total, oi.total_price_cents / 100.0))::numeric(14,2) AS total_sales,
        SUM(COALESCE(o.taxes_total, o.tax_cents / 100.0))::numeric(14,2) AS total_tax_on_orders
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON o.id = oi.order_id
      WHERE o.order_date >= $1::date
        AND o.order_date < $2::date
        AND o.order_state NOT IN ('CANCELED', 'REFUSED')
    `, [startStr, endDate]);

    return {
      reportType: 'MonthlyTaxReport',
      period: { year: y, month: m, startDate: startStr, endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalOrders: summary?.total_orders || 0,
        totalSales: parseFloat(summary?.total_sales || 0),
        totalTaxCollected: Math.round((federalTax + provincialTax) * 100) / 100,
        federalTax: Math.round(federalTax * 100) / 100,
        provincialTax: Math.round(provincialTax * 100) / 100,
      },
      commissionITC: {
        totalCommissionPaid: totalCommission,
        hstOnCommission: commissionHST,
        itcClaimable: commissionHST,
        note: 'Input Tax Credits claimable on marketplace commission fees (13% HST, ON-registered marketplace)',
      },
      ehf: {
        totalCollected: parseFloat(ehfData?.ehf_collected || 0),
        note: 'Environmental Handling Fees collected — remit to provincial stewardship programs',
      },
      byProvinceAndCode: mergedTax,
    };
  }

  // -----------------------------------------------------------------------
  // 4. Export Report (CSV or JSON)
  // -----------------------------------------------------------------------
  async exportReport(reportType, params, format) {
    const fmt = (format || 'csv').toLowerCase();

    // Map report type to generator method
    let data;
    switch (reportType) {
      case 'DailySummary':
        data = await this.generateDailySummary(params.date);
        break;
      case 'WeeklyPnL':
        data = await this.generateWeeklyPnL(params.weekStartDate);
        break;
      case 'MonthlyTaxReport':
        data = await this.generateMonthlyTaxReport(params.year, params.month);
        break;
      default:
        throw new Error('Unknown report type: ' + reportType + '. Valid: DailySummary, WeeklyPnL, MonthlyTaxReport');
    }

    if (fmt === 'json') return { format: 'json', data };

    // CSV: pick the most useful array from the report for tabular export
    let rows;
    let filename;
    switch (reportType) {
      case 'DailySummary':
        // Export channel summary + top products as two sections
        rows = this._dailySummaryToRows(data);
        filename = `daily-summary-${data.date}.csv`;
        break;
      case 'WeeklyPnL':
        rows = data.byChannel.map(ch => ({
          Channel: ch.channelCode,
          'Channel Name': ch.channelName,
          Orders: ch.orderCount,
          'Units Sold': ch.unitsSold,
          'Gross Revenue': ch.grossRevenue,
          COGS: ch.cogs,
          Commission: ch.commission,
          'Shipping Costs': ch.shippingCosts,
          'Return Costs': ch.returnCosts,
          'Net Profit': ch.netProfit,
          'Margin %': ch.marginPercent,
        }));
        // Add totals row
        rows.push({
          Channel: 'TOTAL',
          'Channel Name': '',
          Orders: data.totals.orderCount,
          'Units Sold': data.totals.unitsSold,
          'Gross Revenue': data.totals.grossRevenue,
          COGS: data.totals.cogs,
          Commission: data.totals.commission,
          'Shipping Costs': data.totals.shippingCosts,
          'Return Costs': data.totals.returnCosts,
          'Net Profit': data.totals.netProfit,
          'Margin %': data.totals.marginPercent,
        });
        filename = `weekly-pnl-${data.weekStart}.csv`;
        break;
      case 'MonthlyTaxReport':
        rows = data.byProvinceAndCode.map(r => ({
          Province: r.province,
          'Tax Code': r.taxCode,
          Orders: r.orderCount,
          Units: r.units,
          'Taxable Sales': r.taxableSales,
          'Product Tax': r.productTax,
          'Shipping Tax': r.shippingTax,
          'Total Tax': r.totalTax,
        }));
        // Add commission ITC and EHF as summary rows
        rows.push({ Province: '', 'Tax Code': '', Orders: '', Units: '',
          'Taxable Sales': 'Commission ITC', 'Product Tax': data.commissionITC.totalCommissionPaid,
          'Shipping Tax': 'HST @ 13%', 'Total Tax': data.commissionITC.itcClaimable });
        rows.push({ Province: '', 'Tax Code': '', Orders: '', Units: '',
          'Taxable Sales': 'EHF Collected', 'Product Tax': data.ehf.totalCollected,
          'Shipping Tax': '', 'Total Tax': '' });
        filename = `monthly-tax-${data.period.year}-${String(data.period.month).padStart(2, '0')}.csv`;
        break;
    }

    return {
      format: 'csv',
      filename,
      content: this._toCSV(rows),
      data,
    };
  }

  // -----------------------------------------------------------------------
  // CSV helpers
  // -----------------------------------------------------------------------

  _dailySummaryToRows(data) {
    const rows = [];

    // Channel section
    data.byChannel.forEach(ch => {
      rows.push({
        Section: 'Channel',
        Name: ch.channelCode,
        Detail: ch.channelName,
        Orders: ch.orderCount,
        Units: ch.unitsSold,
        Revenue: ch.grossRevenue,
        Commission: ch.commission,
        Net: ch.netRevenue,
      });
    });

    // Totals row
    rows.push({
      Section: 'Total',
      Name: '',
      Detail: '',
      Orders: data.totals.order_count,
      Units: data.totals.units_sold,
      Revenue: data.totals.gross_revenue,
      Commission: data.totals.commission,
      Net: data.totals.net_revenue,
    });

    // Top products
    data.topProducts.forEach(p => {
      rows.push({
        Section: 'Top Product',
        Name: p.sku,
        Detail: p.title,
        Orders: p.orderCount,
        Units: p.unitsSold,
        Revenue: p.revenue,
        Commission: '',
        Net: '',
      });
    });

    return rows;
  }

  _toCSV(rows) {
    if (!rows || rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape fields containing commas, quotes, or newlines
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }
}

// Export singleton
const pool = require('../db');
module.exports = new ReportGenerator(pool);
