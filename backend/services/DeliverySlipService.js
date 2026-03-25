'use strict';

/**
 * Delivery Slip Service - Professional Delivery Slip PDF Generation
 *
 * Generates comprehensive delivery slip documents including:
 * - Warehouse pull/check/load signature lines
 * - Driver section
 * - Prominent delivery address (easy to read while driving)
 * - Customer delivery confirmation with signature box
 * - Item condition tracking
 *
 * Uses enterprise color scheme matching SalesOrderService / POSInvoiceService
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logos', 'teletime-logo-colour-400.png');

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  text: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#333333',
  textLight: '#444444',
  bgLight: '#f8fafc',
  bgMuted: '#fafafa',
  border: '#e5e7eb',
  borderMedium: '#888888',
  success: '#10b981',
  error: '#dc2626',
  warning: '#f59e0b'
};

const STATUS_CONFIG = {
  scheduled: { label: 'SCHEDULED', color: COLORS.warning, bg: '#fef3c7' },
  out_for_delivery: { label: 'OUT FOR DELIVERY', color: COLORS.primaryLight, bg: '#dbeafe' },
  delivered: { label: 'DELIVERED', color: COLORS.success, bg: '#dcfce7' },
  cancelled: { label: 'CANCELLED', color: COLORS.textMuted, bg: '#f3f4f6' }
};

class DeliverySlipService {
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TELETIME';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyCity = config.companyCity || process.env.COMPANY_CITY || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '(905) 273-5550';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';
    this.hstNumber = process.env.TELETIME_HST_NUMBER || process.env.TAX_NUMBER || '802845461RT0001';
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  formatCurrency(amount) {
    return `$${parseFloat(amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  formatDateTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Data Access
  // ──────────────────────────────────────────────────────────────

  async getSlipData(slipId) {
    const slipResult = await this.pool.query(`
      SELECT
        ds.*,
        c.name       AS customer_name,
        c.email      AS customer_email,
        c.phone      AS customer_phone,
        c.company    AS company_name,
        t.transaction_number,
        t.total_amount,
        t.user_id    AS cashier_id,
        so.sales_order_number
      FROM delivery_slips ds
      LEFT JOIN customers c   ON ds.customer_id = c.id
      LEFT JOIN transactions t ON ds.transaction_id = t.transaction_id
      LEFT JOIN sales_orders so ON ds.sales_order_id = so.id
      WHERE ds.id = $1
    `, [slipId]);

    if (!slipResult.rows.length) {
      throw new Error(`Delivery slip ${slipId} not found`);
    }

    const slip = slipResult.rows[0];

    // Items from transaction
    let items = [];
    if (slip.transaction_id) {
      const itemsResult = await this.pool.query(`
        SELECT
          ti.product_name, ti.product_sku, ti.quantity,
          ti.serial_number,
          p.manufacturer, p.model AS model_number, p.model
        FROM transaction_items ti
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE ti.transaction_id = $1
        ORDER BY ti.item_id
      `, [slip.transaction_id]);
      items = itemsResult.rows;
    }

    // Sales rep
    let salesRep = null;
    let cashierName = null;
    try {
      if (slip.transaction_id) {
        const repResult = await this.pool.query(`
          SELECT u.first_name || ' ' || u.last_name AS rep_name
          FROM transaction_commissions tc
          JOIN users u ON tc.user_id = u.id
          WHERE tc.transaction_id = $1
          LIMIT 1
        `, [slip.transaction_id]);
        if (repResult.rows.length) salesRep = repResult.rows[0].rep_name;

        const cashResult = await this.pool.query(`
          SELECT u.first_name || ' ' || u.last_name AS name
          FROM users u
          WHERE u.id = $1
        `, [slip.cashier_id]);
        if (cashResult.rows.length) cashierName = cashResult.rows[0].name;
      }
    } catch {
      // non-critical
    }

    return { slip, items, salesRep, cashierName };
  }

  async getSlipByTransaction(transactionId) {
    const result = await this.pool.query(
      'SELECT id FROM delivery_slips WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );
    return result.rows[0] || null;
  }

  async createSlip(data, userId) {
    const result = await this.pool.query(`
      INSERT INTO delivery_slips (
        sales_order_id, transaction_id, customer_id,
        delivery_date, delivery_address, delivery_city,
        delivery_province, delivery_postal_code,
        access_instructions, delivery_notes,
        status, driver_name, vehicle_number,
        created_by, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        current_setting('app.current_tenant', true)::UUID)
      RETURNING *
    `, [
      data.salesOrderId || null,
      data.transactionId || null,
      data.customerId || null,
      data.deliveryDate || null,
      data.deliveryAddress || null,
      data.deliveryCity || null,
      data.deliveryProvince || null,
      data.deliveryPostalCode || null,
      data.accessInstructions || null,
      data.deliveryNotes || null,
      data.status || 'scheduled',
      data.driverName || null,
      data.vehicleNumber || null,
      userId
    ]);

    return result.rows[0];
  }

  async updateStatus(slipId, status, extra = {}) {
    const updates = ['status = $2', 'updated_at = NOW()'];
    const params = [slipId, status];
    let idx = 3;

    if (status === 'delivered') {
      updates.push(`delivered_at = $${idx++}`);
      params.push(extra.deliveredAt || new Date());
      if (extra.signatureObtained != null) {
        updates.push(`signature_obtained = $${idx++}`);
        params.push(extra.signatureObtained);
      }
      if (extra.conditionOnDelivery) {
        updates.push(`condition_on_delivery = $${idx++}`);
        params.push(extra.conditionOnDelivery);
      }
      if (extra.damageNotes) {
        updates.push(`damage_notes = $${idx++}`);
        params.push(extra.damageNotes);
      }
    }

    if (extra.driverName) {
      updates.push(`driver_name = $${idx++}`);
      params.push(extra.driverName);
    }
    if (extra.vehicleNumber) {
      updates.push(`vehicle_number = $${idx++}`);
      params.push(extra.vehicleNumber);
    }

    const result = await this.pool.query(
      `UPDATE delivery_slips SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows[0];
  }

  async listPending() {
    const result = await this.pool.query(`
      SELECT ds.*, c.name AS customer_name, c.phone AS customer_phone,
             t.transaction_number
      FROM delivery_slips ds
      LEFT JOIN customers c ON ds.customer_id = c.id
      LEFT JOIN transactions t ON ds.transaction_id = t.transaction_id
      WHERE ds.status IN ('scheduled', 'out_for_delivery')
      ORDER BY ds.delivery_date ASC NULLS LAST, ds.created_at ASC
    `);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────
  // PDF Generation
  // ──────────────────────────────────────────────────────────────

  async generateDeliverySlipPdf(slipId) {
    const { slip, items, salesRep, cashierName } = await this.getSlipData(slipId);
    const statusCfg = STATUS_CONFIG[slip.status] || STATUS_CONFIG.scheduled;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 0, left: 50, right: 50 }, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let yPos = 0;

      // ============================================
      // TOP ACCENT BAR
      // ============================================
      doc.rect(0, 0, 612, 4).fill(COLORS.primary);

      // ============================================
      // HEADER — Logo / Company / Slip Badge
      // ============================================
      if (fs.existsSync(LOGO_PATH)) {
        try { doc.image(LOGO_PATH, 50, 12, { width: 120 }); } catch {
          doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary).text('Teletime', 50, 16);
        }
      } else {
        doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary).text('Teletime', 50, 16);
      }
      let headerY = 44;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted);
      if (this.companyAddress) { doc.text(this.companyAddress, 50, headerY); headerY += 11; }
      if (this.companyCity) { doc.text(this.companyCity, 50, headerY); headerY += 11; }
      if (this.companyPhone) { doc.text(`Tel: ${this.companyPhone}`, 50, headerY); headerY += 11; }

      // Slip Badge Box (right side)
      doc.roundedRect(400, 12, 162, 85, 4)
        .fillAndStroke(COLORS.bgLight, COLORS.border);

      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary)
        .text('DELIVERY SLIP', 402, 18, { width: 158, align: 'center' });

      doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(slip.slip_number, 402, 34, { width: 158, align: 'center' });

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
        .text(`Printed: ${this.formatDate(new Date())}`, 402, 52, { width: 158, align: 'center' });

      if (slip.delivery_date) {
        doc.text(`Delivery: ${this.formatDate(slip.delivery_date)}`, 402, 63, { width: 158, align: 'center' });
      }

      // Status badge
      doc.roundedRect(430, 76, 102, 18, 3).fill(statusCfg.bg);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(statusCfg.color)
        .text(statusCfg.label, 430, 81, { width: 102, align: 'center' });

      // ============================================
      // DELIVER TO (prominent section)
      // ============================================
      yPos = 108;
      const deliverH = 100;
      doc.roundedRect(50, yPos, 512, deliverH, 6)
        .fillAndStroke('#f0f7ff', COLORS.primaryLight);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text('DELIVER TO', 62, yPos + 10);
      doc.moveTo(62, yPos + 22).lineTo(180, yPos + 22)
        .strokeColor(COLORS.primaryLight).lineWidth(0.75).stroke();

      let dY = yPos + 28;
      doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(slip.customer_name || 'Customer', 62, dY, { width: 480 });
      dY += 18;

      if (slip.customer_phone) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.textSecondary)
          .text(`Tel: ${slip.customer_phone}`, 62, dY);
        dY += 15;
      }

      // Full address (large, easy to read)
      const addressParts = [
        slip.delivery_address,
        [slip.delivery_city, slip.delivery_province, slip.delivery_postal_code].filter(Boolean).join(', ')
      ].filter(Boolean);

      if (addressParts.length) {
        doc.fontSize(11).font('Helvetica').fillColor(COLORS.text)
          .text(addressParts.join('\n'), 62, dY, { width: 480 });
        dY += addressParts.length * 14;
      }

      if (slip.access_instructions) {
        dY = Math.max(dY, yPos + 70);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.warning)
          .text('ACCESS: ', 62, dY, { continued: true });
        doc.font('Helvetica').fillColor(COLORS.textSecondary)
          .text(slip.access_instructions, { width: 470 });
      }

      yPos += deliverH + 8;

      // Delivery notes
      if (slip.delivery_notes) {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor(COLORS.textMuted)
          .text(`Notes: ${slip.delivery_notes}`, 60, yPos, { width: 490 });
        yPos += 14;
      }

      // ============================================
      // ITEMS TABLE
      // ============================================
      yPos += 4;
      const cols = {
        desc: { x: 50, w: 180 },
        serial: { x: 230, w: 90 },
        qty: { x: 320, w: 30 },
        cond: { x: 350, w: 65 },
        asm: { x: 415, w: 45 },
        notes: { x: 460, w: 102 }
      };

      // Table header
      doc.rect(50, yPos, 512, 20).fill(COLORS.primary);
      doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
      doc.text('DESCRIPTION / MODEL / SKU', cols.desc.x + 6, yPos + 6);
      doc.text('SERIAL #', cols.serial.x, yPos + 6, { width: cols.serial.w, align: 'center' });
      doc.text('QTY', cols.qty.x, yPos + 6, { width: cols.qty.w, align: 'center' });
      doc.text('CONDITION', cols.cond.x, yPos + 6, { width: cols.cond.w, align: 'center' });
      doc.text('ASM', cols.asm.x, yPos + 6, { width: cols.asm.w, align: 'center' });
      doc.text('NOTES', cols.notes.x, yPos + 6, { width: cols.notes.w, align: 'center' });

      yPos += 20;
      const rowH = 30;

      items.forEach((item, index) => {
        if (yPos > 660) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(COLORS.primary);
          yPos = 30;
          doc.rect(50, yPos, 512, 20).fill(COLORS.primary);
          doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
          doc.text('DESCRIPTION / MODEL / SKU', cols.desc.x + 6, yPos + 6);
          doc.text('SERIAL #', cols.serial.x, yPos + 6, { width: cols.serial.w, align: 'center' });
          doc.text('QTY', cols.qty.x, yPos + 6, { width: cols.qty.w, align: 'center' });
          doc.text('CONDITION', cols.cond.x, yPos + 6, { width: cols.cond.w, align: 'center' });
          doc.text('ASM', cols.asm.x, yPos + 6, { width: cols.asm.w, align: 'center' });
          doc.text('NOTES', cols.notes.x, yPos + 6, { width: cols.notes.w, align: 'center' });
          yPos += 20;
        }

        // Zebra striping
        if (index % 2 === 0) doc.rect(50, yPos, 512, rowH).fill(COLORS.bgLight);
        doc.moveTo(50, yPos + rowH).lineTo(562, yPos + rowH)
          .strokeColor(COLORS.border).lineWidth(0.75).stroke();

        const rY = yPos + 4;

        // Product name
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.text)
          .text((item.product_name || '').substring(0, 30), cols.desc.x + 6, rY, { width: cols.desc.w - 10 });

        // Model / SKU line
        const modelLine = [item.model_number || item.model, item.product_sku].filter(Boolean).join(' | ');
        if (modelLine) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted)
            .text(modelLine.substring(0, 35), cols.desc.x + 6, rY + 11, { width: cols.desc.w - 10 });
        }

        // Serial
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textSecondary)
          .text(item.serial_number || '—', cols.serial.x, rY + 4, { width: cols.serial.w, align: 'center' });

        // Qty
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
          .text(String(item.quantity || 1), cols.qty.x, rY + 4, { width: cols.qty.w, align: 'center' });

        // Condition (blank for driver to fill)
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
          .text('New', cols.cond.x, rY + 4, { width: cols.cond.w, align: 'center' });

        // Assembly required
        doc.text('No', cols.asm.x, rY + 4, { width: cols.asm.w, align: 'center' });

        // Notes (blank)
        doc.text('', cols.notes.x, rY + 4, { width: cols.notes.w, align: 'center' });

        yPos += rowH;
      });

      // If no items, show placeholder
      if (!items.length) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(COLORS.textLight)
          .text('No items listed', 50, yPos + 8, { width: 512, align: 'center' });
        yPos += 30;
      }

      yPos += 10;

      // ============================================
      // SALES REFERENCE BOX
      // ============================================
      if (yPos > 620) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      const refH = 60;
      doc.roundedRect(50, yPos, 512, refH, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('SALES REFERENCE', 62, yPos + 8);

      let refY = yPos + 22;
      const refCol1X = 62;
      const refCol1V = 150;
      const refCol2X = 310;
      const refCol2V = 400;

      const refRows = [
        [refCol1X, 'Sales Order:', refCol1V, slip.sales_order_number || 'N/A'],
        [refCol1X, 'Transaction:', refCol1V, slip.transaction_number || 'N/A'],
        [refCol2X, 'Sales Rep:', refCol2V, salesRep || cashierName || 'N/A'],
        [refCol2X, 'Store Phone:', refCol2V, this.companyPhone]
      ];

      // Row 1
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text(refRows[0][1], refRows[0][0], refY);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(refRows[0][3], refRows[0][2], refY);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text(refRows[2][1], refRows[2][0], refY);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(refRows[2][3], refRows[2][2], refY);

      refY += 13;
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text(refRows[1][1], refRows[1][0], refY);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(refRows[1][3], refRows[1][2], refY);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text(refRows[3][1], refRows[3][0], refY);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(refRows[3][3], refRows[3][2], refY);

      yPos += refH + 10;

      // ============================================
      // WAREHOUSE SECTION (3 signature lines)
      // ============================================
      if (yPos > 580) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text('WAREHOUSE', 50, yPos);
      yPos += 14;

      const whH = 58;
      doc.roundedRect(50, yPos, 512, whH, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      const whLines = ['Pulled by', 'Checked by', 'Loaded by'];
      let whY = yPos + 8;
      for (const label of whLines) {
        doc.fontSize(8).font('Helvetica').fillColor('#222222')
          .text(`${label}: _________________________`, 62, whY);
        doc.text('Date: ___________   Time: ___________', 310, whY);
        whY += 16;
      }

      yPos += whH + 10;

      // ============================================
      // DRIVER SECTION
      // ============================================
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text('DRIVER', 50, yPos);
      yPos += 14;

      const drH = 30;
      doc.roundedRect(50, yPos, 512, drH, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
        .text(`Driver Name: ${slip.driver_name || '_________________________'}`, 62, yPos + 9);
      doc.text(`Vehicle: ${slip.vehicle_number || '_______________'}`, 280, yPos + 9);
      doc.text('Departure Time: ___________', 430, yPos + 9);

      yPos += drH + 10;

      // ============================================
      // CUSTOMER SIGNATURE / DELIVERY CONFIRMATION
      // ============================================
      if (yPos > 530) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      const sigBoxH = 175;
      doc.roundedRect(50, yPos, 512, sigBoxH, 6)
        .dash(3, { space: 3 })
        .strokeColor(COLORS.primaryLight)
        .lineWidth(2)
        .stroke()
        .undash();

      // Header
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
        .text('DELIVERY CONFIRMATION', 50, yPos + 10, { width: 512, align: 'center' });

      let sigY = yPos + 30;

      // Signature line (large space)
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
        .text('Customer Signature', 70, sigY);
      sigY += 14;
      doc.moveTo(70, sigY + 24).lineTo(450, sigY + 24)
        .strokeColor('#000000').lineWidth(1.5).stroke();
      sigY += 34;

      // Print name with drawn line
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Print Name:', 70, sigY);
      doc.moveTo(140, sigY + 10).lineTo(350, sigY + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      sigY += 18;

      // Date and time with drawn lines
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Date of Delivery:', 70, sigY);
      doc.moveTo(155, sigY + 10).lineTo(270, sigY + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      doc.text('Time of Delivery:', 290, sigY);
      doc.moveTo(380, sigY + 10).lineTo(500, sigY + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      sigY += 22;

      // Checkboxes
      doc.rect(70, sigY, 10, 10).strokeColor('#000000').lineWidth(1).stroke();
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
        .text('Items received in good condition', 86, sigY + 1);

      doc.rect(310, sigY, 10, 10).strokeColor('#000000').lineWidth(1).stroke();
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
        .text('Items received with damage (describe below)', 326, sigY + 1);

      sigY += 18;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
        .text('Damage Notes: ________________________________________________________________________________', 70, sigY);

      sigY += 18;
      doc.fontSize(6.5).font('Helvetica-Oblique').fillColor(COLORS.textLight)
        .text(
          'By signing I confirm receipt of the above items in the stated condition. All sales final after signed delivery acceptance.',
          70, sigY, { width: 470 }
        );

      // ============================================
      // FOOTER (on every page)
      // ============================================
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.save();

        doc.moveTo(50, 740).lineTo(562, 740)
          .strokeColor(COLORS.border).lineWidth(1).stroke();

        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textMuted)
          .text(`HST #: ${this.hstNumber}`, 50, 745, { lineBreak: false });

        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
          .text(
            'Returns accepted within 30 days with original receipt. Items must be in original packaging.',
            50, 756, { width: 400, lineBreak: false }
          );

        doc.fontSize(8).fillColor(COLORS.textLight)
          .text(`Page ${i + 1} of ${pageCount}`, 450, 745, { width: 112, align: 'right', lineBreak: false });

        const contactParts = [this.companyWebsite, this.companyPhone, this.companyEmail].filter(Boolean);
        doc.fontSize(7).text(contactParts.join('  |  '), 50, 768, { width: 512, align: 'center', lineBreak: false });
        doc.restore();
      }

      if (pageCount > 0) doc.switchToPage(pageCount - 1);
      doc.end();
    });
  }
}

module.exports = DeliverySlipService;
