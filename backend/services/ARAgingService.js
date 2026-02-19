let pool;

console.log('[ARAgingService] LOADED - version with unified_order_payments fix');

function init(deps) {
  pool = deps.pool;
}

/**
 * Full AR aging report with summary, buckets, and per-customer/invoice detail.
 */
async function getAgingReport({ as_of_date, location_id } = {}) {
  const asOf = as_of_date ? new Date(as_of_date) : new Date();
  const params = [asOf];
  let locationFilter = '';
  if (location_id) {
    locationFilter = `AND o.location_id = $2`;
    params.push(location_id);
  }

  // Get all outstanding invoices with aging
  const { rows: invoices } = await pool.query(`
    WITH order_aging AS (
      SELECT
        o.id AS order_id,
        o.order_number,
        o.customer_id,
        c.name AS customer_name,
        c.email,
        c.phone,
        o.created_at AS invoice_date,
        o.created_at + INTERVAL '15 days' AS due_date,
        o.total_cents / 100.0 AS original_amount,
        COALESCE(pay.amount_paid, 0) AS amount_paid,
        o.total_cents / 100.0 - COALESCE(pay.amount_paid, 0) AS balance_due,
        EXTRACT(DAYS FROM $1::timestamp - o.created_at)::int AS days_outstanding,
        CASE
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 30 THEN 'current'
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 60 THEN 'days_31_60'
          WHEN EXTRACT(DAYS FROM $1::timestamp - o.created_at) <= 90 THEN 'days_61_90'
          ELSE 'days_over_90'
        END AS aging_bucket
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN (
        SELECT order_id, SUM(amount_cents) / 100.0 AS amount_paid
        FROM unified_order_payments WHERE status = 'completed'
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      WHERE o.status NOT IN ('cancelled', 'voided', 'refunded')
        AND o.total_cents / 100.0 - COALESCE(pay.amount_paid, 0) > 0
        ${locationFilter}
    )
    SELECT * FROM order_aging ORDER BY customer_name, days_outstanding DESC
  `, params);

  // Build per-customer grouping
  const customerMap = new Map();
  for (const inv of invoices) {
    if (!customerMap.has(inv.customer_id)) {
      customerMap.set(inv.customer_id, {
        customer_id: inv.customer_id,
        customer_name: inv.customer_name.trim(),
        email: inv.email,
        phone: inv.phone,
        total_outstanding: 0,
        current: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_over_90: 0,
        oldest_invoice_date: null,
        oldest_invoice_days: 0,
        invoices: [],
      });
    }

    const cust = customerMap.get(inv.customer_id);
    const balance = parseFloat(inv.balance_due);

    cust.total_outstanding += balance;
    cust[inv.aging_bucket] += balance;

    if (!cust.oldest_invoice_date || new Date(inv.invoice_date) < new Date(cust.oldest_invoice_date)) {
      cust.oldest_invoice_date = inv.invoice_date;
      cust.oldest_invoice_days = inv.days_outstanding;
    }

    cust.invoices.push({
      order_id: inv.order_id,
      order_number: inv.order_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      original_amount: parseFloat(inv.original_amount),
      amount_paid: parseFloat(inv.amount_paid),
      balance_due: balance,
      days_outstanding: inv.days_outstanding,
      aging_bucket: inv.aging_bucket,
    });
  }

  const customers = Array.from(customerMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding);

  // Round customer totals
  for (const c of customers) {
    c.total_outstanding = Math.round(c.total_outstanding * 100) / 100;
    c.current = Math.round(c.current * 100) / 100;
    c.days_31_60 = Math.round(c.days_31_60 * 100) / 100;
    c.days_61_90 = Math.round(c.days_61_90 * 100) / 100;
    c.days_over_90 = Math.round(c.days_over_90 * 100) / 100;
  }

  // Summary
  const total = customers.reduce((s, c) => s + c.total_outstanding, 0);
  const current = customers.reduce((s, c) => s + c.current, 0);
  const d31 = customers.reduce((s, c) => s + c.days_31_60, 0);
  const d61 = customers.reduce((s, c) => s + c.days_61_90, 0);
  const d90 = customers.reduce((s, c) => s + c.days_over_90, 0);

  const round2 = v => Math.round(v * 100) / 100;
  const pct = v => total > 0 ? Math.round((v / total) * 10000) / 100 : 0;

  const summary = {
    total_outstanding: round2(total),
    current: round2(current),
    days_31_60: round2(d31),
    days_61_90: round2(d61),
    days_over_90: round2(d90),
    customer_count: customers.length,
  };

  const aging_buckets = [
    { bucket: 'Current (0-30)', amount: round2(current), count: customers.filter(c => c.current > 0).length, percentage: pct(current) },
    { bucket: '31-60 Days', amount: round2(d31), count: customers.filter(c => c.days_31_60 > 0).length, percentage: pct(d31) },
    { bucket: '61-90 Days', amount: round2(d61), count: customers.filter(c => c.days_61_90 > 0).length, percentage: pct(d61) },
    { bucket: 'Over 90 Days', amount: round2(d90), count: customers.filter(c => c.days_over_90 > 0).length, percentage: pct(d90) },
  ];

  return { as_of_date: asOf.toISOString(), summary, aging_buckets, customers };
}

/**
 * Export AR aging as CSV string.
 */
async function exportCSV(options) {
  const report = await getAgingReport(options);

  const lines = [
    `AR Aging Report as of ${report.as_of_date}`,
    '',
    'Customer,Total Outstanding,Current (0-30),31-60 Days,61-90 Days,Over 90 Days,Oldest Invoice,Email,Phone',
  ];

  for (const c of report.customers) {
    lines.push([
      `"${c.customer_name}"`,
      c.total_outstanding,
      c.current,
      c.days_31_60,
      c.days_61_90,
      c.days_over_90,
      c.oldest_invoice_date ? new Date(c.oldest_invoice_date).toLocaleDateString() : '',
      c.email || '',
      c.phone || '',
    ].join(','));
  }

  lines.push('');
  lines.push(`Total,${report.summary.total_outstanding},${report.summary.current},${report.summary.days_31_60},${report.summary.days_61_90},${report.summary.days_over_90}`);

  return lines.join('\n');
}

/**
 * Send payment reminder emails to specified customers.
 */
async function sendReminders(customerIds, { pool: _pool, emailService } = {}) {
  const results = { sent: [], failed: [] };

  for (const custId of customerIds) {
    try {
      // Get customer outstanding info
      const { rows: [cust] } = await pool.query(
        `SELECT c.id, c.name, c.email,
                SUM(o.total_cents / 100.0 - COALESCE(pay.paid, 0)) AS total_due,
                COUNT(o.id) AS invoice_count
         FROM customers c
         JOIN orders o ON o.customer_id = c.id AND o.status NOT IN ('cancelled', 'voided', 'refunded')
         LEFT JOIN (
           SELECT order_id, SUM(amount_cents) / 100.0 AS paid FROM unified_order_payments WHERE status = 'completed' GROUP BY order_id
         ) pay ON pay.order_id = o.id
         WHERE c.id = $1 AND o.total_cents / 100.0 - COALESCE(pay.paid, 0) > 0
         GROUP BY c.id`,
        [custId]
      );

      if (!cust || !cust.email) {
        results.failed.push({ customer_id: custId, reason: !cust ? 'No outstanding balance' : 'No email address' });
        continue;
      }

      // If emailService provided, send; otherwise just record intent
      if (emailService && typeof emailService.sendEmail === 'function') {
        await emailService.sendEmail({
          to: cust.email,
          subject: `Payment Reminder — $${parseFloat(cust.total_due).toFixed(2)} Outstanding`,
          html: buildReminderHtml(cust),
        });
      }

      results.sent.push({
        customer_id: custId,
        name: cust.name || cust.customer_name,
        email: cust.email,
        total_due: parseFloat(cust.total_due),
      });
    } catch (err) {
      results.failed.push({ customer_id: custId, reason: err.message });
    }
  }

  return results;
}

function buildReminderHtml(cust) {
  const total = parseFloat(cust.total_due).toFixed(2);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e293b;">Payment Reminder</h2>
      <p>Dear ${(cust.name || cust.customer_name || 'Customer').split(' ')[0]},</p>
      <p>This is a friendly reminder that you have an outstanding balance of <strong>$${total}</strong>
         across ${cust.invoice_count} invoice${parseInt(cust.invoice_count) !== 1 ? 's' : ''}.</p>
      <p>Please arrange payment at your earliest convenience. If you have already sent payment, please disregard this notice.</p>
      <p>If you have any questions about your account, please don't hesitate to contact us.</p>
      <p style="margin-top:24px;color:#64748b;font-size:12px;">Thank you for your business.</p>
    </div>
  `;
}

module.exports = { init, getAgingReport, exportCSV, sendReminders };
