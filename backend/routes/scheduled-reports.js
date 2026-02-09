/**
 * Scheduled Reports Routes & Background Job
 * CRUD for scheduled reports, on-demand generation, and cron-based email delivery.
 * @module routes/scheduled-reports
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const XLSX = require('xlsx');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

const REPORT_TYPES = ['stock_levels', 'low_stock', 'aging', 'turnover', 'daily_sales', 'commission'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const FORMATS = ['excel', 'csv'];
const REPORTS_DIR = path.join(__dirname, '..', 'uploads', 'reports');

function init({ pool }) {
  const router = express.Router();

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // ---------- Report data generators ----------

  async function generateReportData(reportType, filters = {}) {
    const { location_id, category_id, category, brand, date_from, date_to, days_threshold } = filters;

    switch (reportType) {
      case 'stock_levels': {
        const conditions = [];
        const params = [];
        let pi = 1;
        if (location_id) { conditions.push(`li.location_id = $${pi++}`); params.push(parseInt(location_id)); }
        if (category_id) { conditions.push(`p.category_id = $${pi++}`); params.push(parseInt(category_id)); }
        if (category) { conditions.push(`p.category ILIKE $${pi++}`); params.push(`%${category}%`); }
        if (brand) { conditions.push(`p.manufacturer ILIKE $${pi++}`); params.push(`%${brand}%`); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `SELECT p.sku, p.name, p.model, p.manufacturer AS brand, p.category,
                  p.cost::numeric(10,2) AS cost, p.price::numeric(10,2) AS retail_price,
                  l.name AS location,
                  li.quantity_on_hand, li.quantity_reserved,
                  (li.quantity_on_hand - li.quantity_reserved) AS available,
                  li.bin_location, li.reorder_point,
                  (li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           ${where}
           ORDER BY p.name, l.name`,
          params
        );
        return { title: 'Stock Levels Report', rows: result.rows };
      }

      case 'low_stock': {
        const conditions = [
          'li.reorder_point IS NOT NULL',
          '(li.quantity_on_hand - li.quantity_reserved) <= li.reorder_point',
          '(li.quantity_on_hand - li.quantity_reserved) > 0',
        ];
        const params = [];
        let pi = 1;
        if (location_id) { conditions.push(`li.location_id = $${pi++}`); params.push(parseInt(location_id)); }

        const result = await pool.query(
          `SELECT p.sku, p.name, p.model, p.manufacturer AS brand,
                  l.name AS location,
                  li.quantity_on_hand, li.quantity_reserved,
                  (li.quantity_on_hand - li.quantity_reserved) AS available,
                  li.reorder_point,
                  li.reorder_point - (li.quantity_on_hand - li.quantity_reserved) AS units_below_reorder,
                  li.reorder_quantity AS suggested_order_qty,
                  (li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY units_below_reorder DESC`,
          params
        );
        return { title: 'Low Stock Report', rows: result.rows };
      }

      case 'aging': {
        const conditions = [];
        const params = [];
        let pi = 1;
        if (location_id) { conditions.push(`a.location_id = $${pi++}`); params.push(parseInt(location_id)); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `SELECT a.sku, a.name, a.manufacturer, a.category,
                  l.name AS location,
                  a.quantity_on_hand, a.cost::numeric(10,2),
                  a.inventory_value_cost::numeric(12,2) AS value_at_cost,
                  a.days_in_stock, a.days_since_last_sale, a.units_sold_90d,
                  a.age_bucket
           FROM inventory_aging a
           JOIN locations l ON a.location_id = l.id
           ${where}
           ORDER BY a.days_in_stock DESC`,
          params
        );
        return { title: 'Inventory Aging Report', rows: result.rows };
      }

      case 'turnover': {
        const endDate = date_to || new Date().toISOString().split('T')[0];
        const startDate = date_from || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const periodDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));

        const conditions = [];
        const params = [startDate, endDate];
        let pi = 3;
        if (category_id) { conditions.push(`p.category_id = $${pi++}`); params.push(parseInt(category_id)); }
        if (category) { conditions.push(`p.category ILIKE $${pi++}`); params.push(`%${category}%`); }
        const extraWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `WITH sales AS (
            SELECT oi.product_id,
                   SUM(oi.quantity)::int AS units_sold,
                   SUM(oi.unit_cost_cents * oi.quantity)::int AS cogs_cents
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= $1::date AND o.created_at <= $2::date + INTERVAL '1 day'
            GROUP BY oi.product_id
          ),
          current_inv AS (
            SELECT product_id, SUM(quantity_on_hand)::int AS ending_inventory
            FROM location_inventory GROUP BY product_id
          )
          SELECT p.sku, p.name, p.model, p.manufacturer AS brand, p.category,
                 COALESCE(s.units_sold, 0) AS units_sold,
                 COALESCE(ci.ending_inventory, 0) AS ending_inventory,
                 COALESCE(ci.ending_inventory, 0) + COALESCE(s.units_sold, 0) AS beginning_inventory,
                 ROUND(((COALESCE(ci.ending_inventory,0) + COALESCE(s.units_sold,0)) + COALESCE(ci.ending_inventory,0))::numeric/2, 1) AS avg_inventory,
                 COALESCE(s.cogs_cents, 0) AS cogs_cents,
                 CASE WHEN COALESCE(ci.ending_inventory,0) > 0 THEN
                   ROUND(COALESCE(s.units_sold,0)::numeric / NULLIF(((COALESCE(ci.ending_inventory,0)+COALESCE(s.units_sold,0))+COALESCE(ci.ending_inventory,0))::numeric/2,0), 2)
                 ELSE 0 END AS turnover_rate,
                 CASE WHEN COALESCE(s.units_sold,0) > 0 THEN
                   ROUND(${periodDays}::numeric / (COALESCE(s.units_sold,0)::numeric / NULLIF(((COALESCE(ci.ending_inventory,0)+COALESCE(s.units_sold,0))+COALESCE(ci.ending_inventory,0))::numeric/2,0)), 0)::int
                 ELSE NULL END AS days_to_sell
          FROM products p
          LEFT JOIN sales s ON s.product_id = p.id
          LEFT JOIN current_inv ci ON ci.product_id = p.id
          WHERE (COALESCE(s.units_sold,0) > 0 OR COALESCE(ci.ending_inventory,0) > 0) ${extraWhere}
          ORDER BY turnover_rate DESC`,
          params
        );
        return { title: `Inventory Turnover Report (${startDate} to ${endDate})`, rows: result.rows };
      }

      case 'daily_sales': {
        const targetDate = date_from || new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const result = await pool.query(
          `SELECT p.sku, p.name, p.model, p.manufacturer AS brand,
                  SUM(oi.quantity)::int AS units_sold,
                  SUM(oi.total_cents)::int AS revenue_cents,
                  SUM(oi.unit_cost_cents * oi.quantity)::int AS cost_cents,
                  SUM(oi.total_cents - oi.unit_cost_cents * oi.quantity)::int AS margin_cents
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products p ON oi.product_id = p.id
           WHERE o.created_at >= $1::date AND o.created_at < $1::date + INTERVAL '1 day'
           GROUP BY p.sku, p.name, p.model, p.manufacturer
           ORDER BY revenue_cents DESC`,
          [targetDate]
        );
        return { title: `Daily Sales Report — ${targetDate}`, rows: result.rows };
      }

      case 'commission': {
        const endDate = date_to || new Date().toISOString().split('T')[0];
        const startDate = date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const result = await pool.query(
          `SELECT u.first_name || ' ' || u.last_name AS sales_rep,
                  COUNT(DISTINCT o.id)::int AS orders,
                  SUM(oi.total_cents)::int AS revenue_cents,
                  SUM(oi.total_cents - oi.unit_cost_cents * oi.quantity)::int AS margin_cents
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           JOIN users u ON o.created_by = u.id
           WHERE o.created_at >= $1::date AND o.created_at <= $2::date + INTERVAL '1 day'
           GROUP BY u.id, u.first_name, u.last_name
           ORDER BY revenue_cents DESC`,
          [startDate, endDate]
        );
        return { title: `Commission Report (${startDate} to ${endDate})`, rows: result.rows };
      }

      default:
        return { title: 'Unknown Report', rows: [] };
    }
  }

  // ---------- File creation ----------

  function createReportFile(data, format, reportName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = reportName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const filename = `${safeName}_${timestamp}.${ext}`;
    const filePath = path.join(REPORTS_DIR, filename);

    if (data.rows.length === 0) {
      // Create empty file with headers
      if (format === 'csv') {
        fs.writeFileSync(filePath, 'No data for this report period\n');
      } else {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['No data for this report period']]);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        XLSX.writeFile(wb, filePath);
      }
      return { filePath, filename, rowCount: 0 };
    }

    if (format === 'csv') {
      const headers = Object.keys(data.rows[0]);
      const lines = [headers.join(',')];
      for (const row of data.rows) {
        const values = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        });
        lines.push(values.join(','));
      }
      fs.writeFileSync(filePath, lines.join('\n'));
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data.rows);

      // Auto-size columns
      const headers = Object.keys(data.rows[0]);
      ws['!cols'] = headers.map(h => {
        const maxLen = Math.max(h.length, ...data.rows.slice(0, 100).map(r => String(r[h] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, filePath);
    }

    const stats = fs.statSync(filePath);
    return { filePath, filename, rowCount: data.rows.length, fileSize: stats.size };
  }

  // ---------- Email sending ----------

  async function sendReportEmail(recipientEmails, reportName, filePath, filename, title) {
    const sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const fromEmail = process.env.EMAIL_FROM || 'noreply@teletime.ca';
    const companyName = process.env.COMPANY_NAME || 'Teletime';

    const fileContent = fs.readFileSync(filePath);
    const base64File = fileContent.toString('base64');
    const mimeType = filename.endsWith('.csv')
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const boundary = `----=_Part_${Date.now()}`;
    const toList = Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails];

    const rawMessage = [
      `From: ${companyName} <${fromEmail}>`,
      `To: ${toList.join(', ')}`,
      `Subject: ${title || reportName} — ${companyName}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      `<h2>${title || reportName}</h2>
       <p>Your scheduled report is attached.</p>
       <p>Generated: ${new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })}</p>
       <p style="color:#666;font-size:12px;">This is an automated report from ${companyName}.</p>`,
      '',
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64File,
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const { SendRawEmailCommand } = require('@aws-sdk/client-ses');
    const rawClient = new (require('@aws-sdk/client-ses').SESClient)({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    await rawClient.send(new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    }));
  }

  // ---------- Schedule helpers ----------

  function calculateNextSendDate(report) {
    const now = new Date();
    const [hours, minutes] = (report.time_of_day || '08:00').split(':').map(Number);

    switch (report.frequency) {
      case 'daily': {
        const next = new Date(now);
        next.setDate(next.getDate() + 1);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      case 'weekly': {
        const targetDay = report.day_of_week || 1; // Monday default
        const next = new Date(now);
        const daysUntil = ((targetDay - next.getDay()) + 7) % 7 || 7;
        next.setDate(next.getDate() + daysUntil);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      case 'monthly': {
        const targetDom = report.day_of_month || 1;
        const next = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(targetDom, 28));
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      default:
        return new Date(now.getTime() + 86400000);
    }
  }

  function calculateFirstSendDate(report) {
    const now = new Date();
    const [hours, minutes] = (report.time_of_day || '08:00').split(':').map(Number);

    switch (report.frequency) {
      case 'daily': {
        const next = new Date(now);
        next.setDate(next.getDate() + 1);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      case 'weekly': {
        const targetDay = report.day_of_week || 1;
        const next = new Date(now);
        let daysUntil = ((targetDay - next.getDay()) + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        next.setDate(next.getDate() + daysUntil);
        next.setHours(hours, minutes, 0, 0);
        return next;
      }
      case 'monthly': {
        const targetDom = report.day_of_month || 1;
        let next = new Date(now.getFullYear(), now.getMonth(), Math.min(targetDom, 28));
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
          next = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(targetDom, 28));
          next.setHours(hours, minutes, 0, 0);
        }
        return next;
      }
      default:
        return new Date(now.getTime() + 86400000);
    }
  }

  // ---------- Core send function ----------

  async function generateAndSendReport(report, triggeredBy = null) {
    const logResult = await pool.query(
      `INSERT INTO report_generation_log
         (scheduled_report_id, report_type, format, recipient_emails, status, generated_by)
       VALUES ($1, $2, $3, $4, 'generating', $5) RETURNING id`,
      [report.id || null, report.report_type, report.format || 'excel', report.recipient_emails, triggeredBy]
    );
    const logId = logResult.rows[0].id;

    try {
      const data = await generateReportData(report.report_type, report.filters || {});
      const { filePath, filename, rowCount, fileSize } = createReportFile(data, report.format || 'excel', report.name || report.report_type);

      // Try sending email — don't fail the whole operation if email fails
      let emailSent = false;
      try {
        await sendReportEmail(report.recipient_emails, report.name, filePath, filename, data.title);
        emailSent = true;
      } catch (emailErr) {
        console.error(`Email send failed for report ${report.id || 'ad-hoc'}:`, emailErr.message);
      }

      await pool.query(
        `UPDATE report_generation_log SET
           status = $1, file_path = $2, file_size_bytes = $3, row_count = $4, completed_at = NOW()
         WHERE id = $5`,
        [emailSent ? 'sent' : 'failed', filePath, fileSize || 0, rowCount, logId]
      );

      return { logId, filePath, filename, rowCount, fileSize, emailSent, title: data.title };
    } catch (err) {
      await pool.query(
        "UPDATE report_generation_log SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
        [err.message, logId]
      );
      throw err;
    }
  }

  // ---------- Background cron job — check every hour ----------

  cron.schedule('0 * * * *', async () => {
    try {
      const dueReports = await pool.query(
        "SELECT * FROM scheduled_reports WHERE is_active = true AND next_send_at <= NOW()"
      );

      for (const report of dueReports.rows) {
        try {
          await generateAndSendReport(report);

          await pool.query(
            `UPDATE scheduled_reports SET
               last_sent_at = NOW(), next_send_at = $1,
               send_count = COALESCE(send_count, 0) + 1, last_error = NULL, updated_at = NOW()
             WHERE id = $2`,
            [calculateNextSendDate(report), report.id]
          );
          console.log(`✅ Scheduled report #${report.id} (${report.name}) sent`);
        } catch (err) {
          console.error(`❌ Scheduled report #${report.id} failed:`, err.message);
          await pool.query(
            "UPDATE scheduled_reports SET last_error = $1, updated_at = NOW() WHERE id = $2",
            [err.message, report.id]
          );
        }
      }
    } catch (err) {
      console.error('Scheduled reports cron error:', err.message);
    }
  });

  // ==========================================================================
  // POST /api/scheduled-reports
  // ==========================================================================
  router.post(
    '/',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const {
          name, report_type, frequency, day_of_week, day_of_month,
          time_of_day, timezone, filters, recipient_emails, format,
        } = req.body;

        const errors = [];
        if (!name || !name.trim()) errors.push('name is required');
        if (!report_type || !REPORT_TYPES.includes(report_type)) {
          errors.push(`report_type must be one of: ${REPORT_TYPES.join(', ')}`);
        }
        if (!frequency || !FREQUENCIES.includes(frequency)) {
          errors.push(`frequency must be one of: ${FREQUENCIES.join(', ')}`);
        }
        if (!recipient_emails || !Array.isArray(recipient_emails) || recipient_emails.length === 0) {
          errors.push('recipient_emails array is required');
        }
        if (format && !FORMATS.includes(format)) {
          errors.push(`format must be one of: ${FORMATS.join(', ')}`);
        }
        if (frequency === 'weekly' && (day_of_week === undefined || day_of_week === null)) {
          errors.push('day_of_week (0-6) is required for weekly frequency');
        }
        if (frequency === 'monthly' && (day_of_month === undefined || day_of_month === null)) {
          errors.push('day_of_month (1-31) is required for monthly frequency');
        }
        if (errors.length > 0) {
          return res.status(400).json({ success: false, message: 'Validation failed', errors });
        }

        const reportData = {
          name: name.trim(), report_type, frequency,
          day_of_week: day_of_week ?? null, day_of_month: day_of_month ?? null,
          time_of_day: time_of_day || '08:00', timezone: timezone || 'America/Toronto',
          filters: filters || {}, recipient_emails, format: format || 'excel',
        };

        const nextSend = calculateFirstSendDate(reportData);

        const result = await pool.query(
          `INSERT INTO scheduled_reports
             (name, report_type, frequency, day_of_week, day_of_month,
              time_of_day, timezone, filters, recipient_emails, format,
              next_send_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            reportData.name, reportData.report_type, reportData.frequency,
            reportData.day_of_week, reportData.day_of_month,
            reportData.time_of_day, reportData.timezone,
            JSON.stringify(reportData.filters), reportData.recipient_emails, reportData.format,
            nextSend, req.user.id,
          ]
        );

        res.status(201).json({ success: true, report: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/scheduled-reports
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    async (req, res, next) => {
      try {
        const result = await pool.query(
          `SELECT sr.*,
                  u.first_name || ' ' || u.last_name AS created_by_name
           FROM scheduled_reports sr
           LEFT JOIN users u ON sr.created_by = u.id::text
           WHERE sr.name IS NOT NULL
           ORDER BY sr.created_at DESC`
        );

        res.json({ success: true, reports: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/scheduled-reports/:id
  // ==========================================================================
  router.get(
    '/:id',
    authenticate,
    async (req, res, next) => {
      if (!/^\d+$/.test(req.params.id)) return next();
      try {
        const { id } = req.params;
        const result = await pool.query(
          `SELECT sr.*, u.first_name || ' ' || u.last_name AS created_by_name
           FROM scheduled_reports sr
           LEFT JOIN users u ON sr.created_by = u.id::text
           WHERE sr.id = $1`, [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Scheduled report not found' });
        }

        // Recent logs
        const logs = await pool.query(
          `SELECT * FROM report_generation_log
           WHERE scheduled_report_id = $1
           ORDER BY created_at DESC LIMIT 20`, [id]
        );

        res.json({
          success: true,
          report: result.rows[0],
          recent_runs: logs.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/scheduled-reports/:id
  // ==========================================================================
  router.put(
    '/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      if (!/^\d+$/.test(req.params.id)) return next();
      try {
        const { id } = req.params;
        const current = await pool.query('SELECT * FROM scheduled_reports WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Scheduled report not found' });
        }

        const merged = { ...current.rows[0], ...req.body };

        // Recalculate next send if schedule changed
        let nextSend = current.rows[0].next_send_at;
        if (req.body.frequency || req.body.day_of_week !== undefined || req.body.day_of_month !== undefined || req.body.time_of_day) {
          nextSend = calculateFirstSendDate(merged);
        }

        const result = await pool.query(
          `UPDATE scheduled_reports SET
             name = $1, report_type = $2, frequency = $3,
             day_of_week = $4, day_of_month = $5, time_of_day = $6,
             timezone = $7, filters = $8, recipient_emails = $9,
             format = $10, is_active = $11, next_send_at = $12, updated_at = NOW()
           WHERE id = $13 RETURNING *`,
          [
            merged.name, merged.report_type, merged.frequency,
            merged.day_of_week, merged.day_of_month, merged.time_of_day || '08:00',
            merged.timezone || 'America/Toronto',
            typeof merged.filters === 'string' ? merged.filters : JSON.stringify(merged.filters || {}),
            merged.recipient_emails, merged.format || 'excel',
            merged.is_active !== false, nextSend, id,
          ]
        );

        res.json({ success: true, report: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // DELETE /api/scheduled-reports/:id
  // ==========================================================================
  router.delete(
    '/:id',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      if (!/^\d+$/.test(req.params.id)) return next();
      try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM scheduled_reports WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Scheduled report not found' });
        }
        res.json({ success: true, message: 'Scheduled report deleted' });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/scheduled-reports/:id/send-now
  // ==========================================================================
  router.post(
    '/:id/send-now',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      if (!/^\d+$/.test(req.params.id)) return next();
      try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM scheduled_reports WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Scheduled report not found' });
        }

        const report = result.rows[0];
        const genResult = await generateAndSendReport(report, req.user.id);

        res.json({
          success: true,
          message: genResult.emailSent ? 'Report generated and sent' : 'Report generated but email failed',
          log_id: genResult.logId,
          filename: genResult.filename,
          row_count: genResult.rowCount,
          email_sent: genResult.emailSent,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/reports/generate
  // On-demand report generation (no scheduling, returns download link)
  // ==========================================================================
  router.post(
    '/generate',
    authenticate,
    async (req, res, next) => {
      try {
        const { report_type, filters, format } = req.body;

        if (!report_type || !REPORT_TYPES.includes(report_type)) {
          return res.status(400).json({
            success: false,
            message: `report_type must be one of: ${REPORT_TYPES.join(', ')}`,
          });
        }

        const data = await generateReportData(report_type, filters || {});
        const { filePath, filename, rowCount, fileSize } = createReportFile(
          data, format || 'excel', `${report_type}_adhoc`
        );

        // Log it
        await pool.query(
          `INSERT INTO report_generation_log
             (report_type, format, file_path, file_size_bytes, row_count, status, generated_by, completed_at)
           VALUES ($1, $2, $3, $4, $5, 'sent', $6, NOW())`,
          [report_type, format || 'excel', filePath, fileSize || 0, rowCount, req.user.id]
        );

        res.json({
          success: true,
          title: data.title,
          filename,
          row_count: rowCount,
          file_size_bytes: fileSize,
          download_url: `/api/reports/download/${encodeURIComponent(filename)}`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/reports/download/:filename
  // ==========================================================================
  router.get(
    '/download/:filename',
    authenticate,
    (req, res) => {
      const { filename } = req.params;
      const safeName = path.basename(filename); // prevent traversal
      const filePath = path.join(REPORTS_DIR, safeName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Report file not found' });
      }

      res.download(filePath, safeName);
    }
  );

  // ==========================================================================
  // GET /api/reports/history
  // ==========================================================================
  router.get(
    '/history',
    authenticate,
    async (req, res, next) => {
      try {
        const { status, report_type, page = 1, limit = 25 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;
        if (status) { conditions.push(`rgl.status = $${pi++}`); params.push(status); }
        if (report_type) { conditions.push(`rgl.report_type = $${pi++}`); params.push(report_type); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM report_generation_log rgl ${where}`, params
        );

        const result = await pool.query(
          `SELECT rgl.*,
                  sr.name AS scheduled_report_name,
                  u.first_name || ' ' || u.last_name AS generated_by_name
           FROM report_generation_log rgl
           LEFT JOIN scheduled_reports sr ON rgl.scheduled_report_id = sr.id
           LEFT JOIN users u ON rgl.generated_by = u.id
           ${where}
           ORDER BY rgl.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          history: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
