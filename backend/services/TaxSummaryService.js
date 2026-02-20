let pool;

function init(deps) {
  pool = deps.pool;
}

// Province tax rate reference (Canadian)
const PROVINCE_TAX_RATES = {
  ON: { hst: 13 },
  NB: { hst: 15 },
  NL: { hst: 15 },
  NS: { hst: 15 },
  PE: { hst: 15 },
  AB: { gst: 5 },
  BC: { gst: 5, pst: 7 },
  MB: { gst: 5, pst: 7 },
  SK: { gst: 5, pst: 6 },
  QC: { gst: 5, qst: 9.975 },
  NT: { gst: 5 },
  NU: { gst: 5 },
  YT: { gst: 5 },
};

function getPeriodRange(type, year, value) {
  const y = parseInt(year);
  if (type === 'month') {
    const m = parseInt(value) - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    return { start, end, label: `${start.toLocaleString('default', { month: 'long' })} ${y}` };
  }
  if (type === 'quarter') {
    const q = parseInt(value);
    const startMonth = (q - 1) * 3;
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 1);
    return { start, end, label: `Q${q} ${y}` };
  }
  // year
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: `${y}` };
}

async function getTaxSummary({ period = 'month', year, month, quarter, location_id } = {}) {
  const now = new Date();
  const y = year || now.getFullYear();
  const val = period === 'quarter' ? (quarter || Math.ceil((now.getMonth() + 1) / 3))
    : period === 'month' ? (month || now.getMonth() + 1)
    : null;

  const { start, end, label } = getPeriodRange(period, y, val);

  const params = [start, end];
  let locFilter = '';
  if (location_id) {
    locFilter = 'AND t.location_id = $3';
    params.push(location_id);
  }

  // ── Sales data from transactions table ─────────────────────────────
  const { rows: dailyRows } = await pool.query(`
    SELECT
      DATE(t.created_at) AS sale_date,
      COALESCE(t.tax_province, 'ON') AS province,
      SUM(t.subtotal) AS subtotal,
      SUM(t.discount_amount) AS discounts,
      SUM(t.subtotal - t.discount_amount) AS net_sales,
      SUM(t.hst_amount) AS hst,
      SUM(t.gst_amount) AS gst,
      SUM(t.pst_amount) AS pst,
      SUM(t.hst_amount + t.gst_amount + t.pst_amount) AS total_tax,
      COUNT(t.transaction_id) AS order_count
    FROM transactions t
    WHERE t.created_at >= $1 AND t.created_at < $2
      AND t.status NOT IN ('cancelled', 'voided')
      ${locFilter}
    GROUP BY DATE(t.created_at), t.tax_province
    ORDER BY sale_date
  `, params);

  // ── Returns/refunds in the same period ─────────────────────────────
  const { rows: [refundRow] } = await pool.query(`
    SELECT
      COALESCE(SUM(t.total_amount), 0) AS total_returns,
      COALESCE(SUM(t.hst_amount + t.gst_amount + t.pst_amount), 0) AS tax_refunded
    FROM transactions t
    WHERE t.created_at >= $1 AND t.created_at < $2
      AND t.status = 'refunded'
      ${locFilter}
  `, params);

  // ── Aggregate ──────────────────────────────────────────────────────
  let totalSales = 0, totalDiscounts = 0, netSales = 0, totalTax = 0, txnCount = 0;
  let totalHST = 0, totalGST = 0, totalPST = 0;
  const provinceMap = {};
  const dailyMap = {};

  for (const r of dailyRows) {
    const sub = parseFloat(r.subtotal) || 0;
    const disc = parseFloat(r.discounts) || 0;
    const net = parseFloat(r.net_sales) || 0;
    const tax = parseFloat(r.total_tax) || 0;
    const hst = parseFloat(r.hst) || 0;
    const gst = parseFloat(r.gst) || 0;
    const pst = parseFloat(r.pst) || 0;
    const cnt = parseInt(r.order_count) || 0;

    totalSales += sub;
    totalDiscounts += disc;
    netSales += net;
    totalTax += tax;
    totalHST += hst;
    totalGST += gst;
    totalPST += pst;
    txnCount += cnt;

    // Province
    const prov = r.province || 'ON';
    if (!provinceMap[prov]) provinceMap[prov] = { province: prov, sales: 0, tax: 0 };
    provinceMap[prov].sales += net;
    provinceMap[prov].tax += tax;

    // Daily
    const dateKey = r.sale_date.toISOString().split('T')[0];
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, sales: 0, tax: 0, orders: 0 };
    dailyMap[dateKey].sales += net;
    dailyMap[dateKey].tax += tax;
    dailyMap[dateKey].orders += cnt;
  }

  const round2 = v => Math.round(v * 100) / 100;

  // Build by_tax_type
  const byTaxType = {};
  if (totalHST > 0) {
    byTaxType['HST (13%)'] = { taxable_amount: round2(netSales), tax_collected: round2(totalHST), rate: 13 };
  }
  if (totalGST > 0) {
    byTaxType['GST (5%)'] = { taxable_amount: round2(netSales), tax_collected: round2(totalGST), rate: 5 };
  }
  if (totalPST > 0) {
    byTaxType['PST'] = { taxable_amount: round2(netSales), tax_collected: round2(totalPST), rate: null };
  }

  const totalReturns = parseFloat(refundRow.total_returns) || 0;
  const taxRefunded = parseFloat(refundRow.tax_refunded) || 0;

  const periodInfo = { type: period, year: parseInt(y) };
  if (period === 'month') periodInfo.month = parseInt(val);
  if (period === 'quarter') periodInfo.quarter = parseInt(val);

  return {
    period: periodInfo,
    period_label: label,
    summary: {
      total_sales: round2(totalSales),
      total_discounts: round2(totalDiscounts),
      net_sales: round2(netSales),
      total_tax_collected: round2(totalTax),
      by_tax_type: byTaxType,
      by_province: Object.values(provinceMap).map(p => ({
        province: p.province,
        sales: round2(p.sales),
        tax: round2(p.tax),
      })),
    },
    returns_adjustments: {
      total_returns: round2(totalReturns),
      tax_refunded: round2(taxRefunded),
    },
    net_tax_liability: round2(totalTax - taxRefunded),
    transaction_count: txnCount,
    daily_breakdown: Object.values(dailyMap).map(d => ({
      date: d.date,
      sales: round2(d.sales),
      tax: round2(d.tax),
      orders: d.orders,
    })),
  };
}

/**
 * QuickBooks-compatible CSV export.
 */
async function exportQuickBooksCSV(options) {
  const report = await getTaxSummary(options);

  const lines = [
    'Date,Type,Net Sales,Tax Code,Tax Amount,Province,Order Count',
  ];

  for (const d of report.daily_breakdown) {
    // Determine primary tax code from province
    const taxCode = report.summary.by_tax_type['HST (13%)'] ? 'HST' : 'GST';
    lines.push([
      d.date,
      'Sales',
      d.sales.toFixed(2),
      taxCode,
      d.tax.toFixed(2),
      report.summary.by_province[0]?.province || 'ON',
      d.orders,
    ].join(','));
  }

  lines.push('');
  lines.push(`"Total",,${report.summary.net_sales.toFixed(2)},,${report.summary.total_tax_collected.toFixed(2)},,${report.transaction_count}`);
  if (report.returns_adjustments.total_returns > 0) {
    lines.push(`"Returns/Adjustments",,${(-report.returns_adjustments.total_returns).toFixed(2)},,${(-report.returns_adjustments.tax_refunded).toFixed(2)},,`);
  }
  lines.push(`"Net Tax Liability",,,,${report.net_tax_liability.toFixed(2)},,`);

  return lines.join('\n');
}

/**
 * CRA HST filing summary.
 */
async function exportCRASummary(options) {
  const report = await getTaxSummary(options);

  const lines = [
    `CRA HST FILING SUMMARY — ${report.period_label}`,
    `Generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    'SALES SUMMARY',
    `Total Sales (before discounts):,$${report.summary.total_sales.toFixed(2)}`,
    `Total Discounts:,$${report.summary.total_discounts.toFixed(2)}`,
    `Net Sales:,$${report.summary.net_sales.toFixed(2)}`,
    '',
    'TAX COLLECTED',
  ];

  for (const [name, data] of Object.entries(report.summary.by_tax_type)) {
    lines.push(`${name}:,$${data.tax_collected.toFixed(2)}`);
  }
  lines.push(`Total Tax Collected:,$${report.summary.total_tax_collected.toFixed(2)}`);

  lines.push('');
  lines.push('ADJUSTMENTS');
  lines.push(`Returns:,$${report.returns_adjustments.total_returns.toFixed(2)}`);
  lines.push(`Tax Refunded on Returns:,$${report.returns_adjustments.tax_refunded.toFixed(2)}`);

  lines.push('');
  lines.push(`NET TAX LIABILITY:,$${report.net_tax_liability.toFixed(2)}`);

  lines.push('');
  lines.push('BY PROVINCE');
  for (const p of report.summary.by_province) {
    const rates = PROVINCE_TAX_RATES[p.province];
    const rateStr = rates ? Object.entries(rates).map(([k, v]) => `${k.toUpperCase()} ${v}%`).join(' + ') : '';
    lines.push(`${p.province} (${rateStr}):,Sales $${p.sales.toFixed(2)},Tax $${p.tax.toFixed(2)}`);
  }

  lines.push('');
  lines.push(`Total Transactions:,${report.transaction_count}`);

  return lines.join('\n');
}

module.exports = { init, getTaxSummary, exportQuickBooksCSV, exportCRASummary };
