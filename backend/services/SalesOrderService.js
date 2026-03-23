'use strict';

/**
 * Sales Order Service - Professional Sales Order Confirmation PDF Generation
 *
 * Generates a comprehensive Sales Order Confirmation document including:
 * - Delivery scheduling and address
 * - Serial number tracking
 * - Sales rep attribution
 * - Customer and staff signature lines
 * - Payment slip attachment area
 *
 * Uses enterprise color scheme matching PdfService / POSInvoiceService
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {
  console.warn('[SalesOrderService] qrcode package not installed - QR codes disabled');
}

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  text: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  bgLight: '#f8fafc',
  bgMuted: '#fafafa',
  border: '#e5e7eb',
  borderMedium: '#d1d5db',
  success: '#10b981',
  error: '#dc2626',
  warning: '#f59e0b'
};

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logos', 'teletime-logo-colour-400.png');

class SalesOrderService {
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TELETIME';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyCity = config.companyCity || process.env.COMPANY_CITY || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';
    this.taxNumber = config.taxNumber || process.env.TAX_NUMBER || '';
    this.hstNumber = process.env.TELETIME_HST_NUMBER || this.taxNumber || '';
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

  generateOrderNumber(transaction) {
    if (transaction.order_number) return transaction.order_number;
    const year = new Date(transaction.created_at).getFullYear();
    return `SO-${year}-${String(transaction.transaction_id).padStart(5, '0')}`;
  }

  async generateQRCode(data) {
    if (!QRCode) return null;
    try {
      return await QRCode.toBuffer(data, {
        type: 'png', width: 100, margin: 1, errorCorrectionLevel: 'M'
      });
    } catch (err) {
      console.error('[SalesOrderService] QR error:', err);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Data query
  // ──────────────────────────────────────────────────────────────

  async getTransactionData(transactionId) {
    const txnResult = await this.pool.query(`
      SELECT
        t.*,
        c.name       AS customer_name,
        c.email      AS customer_email,
        c.phone      AS customer_phone,
        c.company    AS company_name,
        c.address    AS customer_address,
        c.city       AS customer_city,
        c.province   AS customer_province,
        c.postal_code AS customer_postal,
        u.first_name || ' ' || u.last_name AS cashier_name,
        r.register_name,
        rs.shift_id
      FROM transactions t
      LEFT JOIN customers c  ON t.customer_id = c.id
      LEFT JOIN users u      ON t.user_id = u.id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r  ON rs.register_id = r.register_id
      WHERE t.transaction_id = $1
    `, [transactionId]);

    if (!txnResult.rows.length) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const transaction = txnResult.rows[0];

    // Items with serial numbers
    const itemsResult = await this.pool.query(`
      SELECT
        ti.product_name, ti.product_sku, ti.quantity,
        ti.unit_price, ti.discount_percent, ti.discount_amount,
        ti.tax_amount, ti.line_total,
        p.manufacturer, p.model_number,
        ti.serial_number
      FROM transaction_items ti
      LEFT JOIN products p ON ti.product_id = p.id
      WHERE ti.transaction_id = $1
      ORDER BY ti.item_id
    `, [transactionId]);

    // Payments
    const paymentsResult = await this.pool.query(`
      SELECT payment_method, amount, card_brand, card_last_four,
             processed_at, status
      FROM payments
      WHERE transaction_id = $1 AND status = 'completed'
      ORDER BY processed_at
    `, [transactionId]);

    // Sales rep (if commission assigned)
    let salesRep = null;
    try {
      const repResult = await this.pool.query(`
        SELECT u.first_name || ' ' || u.last_name AS rep_name
        FROM transaction_commissions tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.transaction_id = $1
        LIMIT 1
      `, [transactionId]);
      if (repResult.rows.length) {
        salesRep = repResult.rows[0].rep_name;
      }
    } catch {
      // commission table may not exist — not critical
    }

    // Delivery info (if stored on transaction or order)
    let delivery = null;
    try {
      const deliveryResult = await this.pool.query(`
        SELECT delivery_date, delivery_address, delivery_city,
               delivery_province, delivery_postal_code, delivery_notes
        FROM transactions
        WHERE transaction_id = $1
          AND (delivery_date IS NOT NULL OR delivery_address IS NOT NULL)
      `, [transactionId]);
      if (deliveryResult.rows.length) {
        const d = deliveryResult.rows[0];
        if (d.delivery_date || d.delivery_address) {
          delivery = d;
        }
      }
    } catch {
      // delivery columns may not exist yet
    }

    return {
      transaction,
      items: itemsResult.rows,
      payments: paymentsResult.rows,
      salesRep,
      delivery
    };
  }

  // ──────────────────────────────────────────────────────────────
  // PDF Generation
  // ──────────────────────────────────────────────────────────────

  async generateSalesOrderPdf(transactionId) {
    const data = await this.getTransactionData(transactionId);
    const { transaction, items, payments, salesRep, delivery } = data;
    const orderNumber = this.generateOrderNumber(transaction);
    const qrBuffer = await this.generateQRCode(`${process.env.APP_URL || 'https://app.eikansupply.com'}/orders/${orderNumber}`);

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);
    const balanceDue = Math.max(0, totalDue - totalPaid);

    const hasLogo = fs.existsSync(LOGO_PATH);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
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
      // HEADER — Logo / Company / Order Badge
      // ============================================
      let headerY = 16;
      if (hasLogo) {
        try {
          doc.image(LOGO_PATH, 50, 14, { width: 120 });
          headerY = 44;
        } catch {
          doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
            .text('Teletime', 50, 16);
          headerY = 44;
        }
      } else {
        doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
          .text('Teletime', 50, 16);
        headerY = 44;
      }

      // Company contact info
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted);
      if (this.companyAddress) { doc.text(this.companyAddress, 50, headerY); headerY += 11; }
      if (this.companyCity) { doc.text(this.companyCity, 50, headerY); headerY += 11; }
      if (this.companyPhone) { doc.text(`Tel: ${this.companyPhone}`, 50, headerY); headerY += 11; }
      if (this.hstNumber) { doc.text(`HST #: ${this.hstNumber}`, 50, headerY); }

      // Order Badge Box (right side)
      doc.roundedRect(400, 12, 162, 85, 4)
        .fillAndStroke(COLORS.bgLight, COLORS.border);

      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.primary)
        .text('SALES ORDER CONFIRMATION', 402, 18, { width: 158, align: 'center' });

      doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(orderNumber, 402, 34, { width: 158, align: 'center' });

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
        .text(this.formatDateTime(transaction.created_at), 402, 52, { width: 158, align: 'center' });

      // Status badge
      const isPaid = balanceDue <= 0;
      const statusColor = isPaid ? COLORS.success : COLORS.warning;
      const statusBg = isPaid ? '#dcfce7' : '#fef3c7';
      const statusLabel = isPaid ? 'PAID' : 'BALANCE DUE';
      doc.roundedRect(430, 66, 102, 18, 3).fill(statusBg);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(statusColor)
        .text(statusLabel, 430, 71, { width: 102, align: 'center' });

      // ============================================
      // SOLD TO CARD
      // ============================================
      yPos = 108;
      const soldToHeight = 80;
      doc.roundedRect(50, yPos, 250, soldToHeight, 6)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight)
        .text('SOLD TO', 60, yPos + 10);
      doc.moveTo(60, yPos + 22).lineTo(150, yPos + 22)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      let custY = yPos + 28;
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(transaction.customer_name || 'Walk-in Customer', 60, custY, { width: 230 });

      if (transaction.company_name && transaction.company_name !== transaction.customer_name) {
        custY += 14;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted)
          .text(transaction.company_name, 60, custY, { width: 230 });
      }
      if (transaction.customer_phone) {
        custY += 12;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
          .text(`Tel: ${transaction.customer_phone}`, 60, custY);
      }
      if (transaction.customer_email) {
        custY += 11;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.primaryLight)
          .text(transaction.customer_email, 60, custY);
      }

      // Customer address (below sold-to card if present)
      const hasAddress = transaction.customer_address || transaction.customer_city;
      if (hasAddress) {
        const addrY = yPos + soldToHeight + 4;
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
        let addrLine = addrY;
        if (transaction.customer_address) {
          doc.text(transaction.customer_address, 60, addrLine);
          addrLine += 10;
        }
        const cityLine = [transaction.customer_city, transaction.customer_province, transaction.customer_postal].filter(Boolean).join(', ');
        if (cityLine) doc.text(cityLine, 60, addrLine);
      }

      // ============================================
      // SALES DETAILS CARD (right side)
      // ============================================
      doc.roundedRect(315, yPos, 247, soldToHeight, 6)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight)
        .text('SALES DETAILS', 325, yPos + 10);
      doc.moveTo(325, yPos + 22).lineTo(430, yPos + 22)
        .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      let detY = yPos + 28;
      const detLabelX = 325;
      const detValueX = 410;

      const detailRows = [
        ['Sales Rep:', salesRep || transaction.cashier_name || 'N/A'],
        ['Processed by:', transaction.cashier_name || 'N/A'],
        ['Register:', transaction.register_name || 'N/A'],
        ['Txn Ref:', transaction.transaction_number || 'N/A']
      ];

      if (transaction.shift_id) {
        detailRows.push(['Shift:', `#${transaction.shift_id}`]);
      }

      for (const [label, value] of detailRows) {
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight)
          .text(label, detLabelX, detY);
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
          .text(value, detValueX, detY, { width: 140 });
        detY += 12;
      }

      // ============================================
      // ITEMS TABLE
      // ============================================
      yPos = yPos + soldToHeight + (hasAddress ? 30 : 15);
      const tableTop = yPos;
      const cols = {
        item: { x: 50, w: 230 },
        serial: { x: 280, w: 80 },
        qty: { x: 360, w: 35 },
        price: { x: 395, w: 70 },
        total: { x: 465, w: 97 }
      };

      // Table header
      doc.rect(50, tableTop, 512, 22).fill(COLORS.primary);
      doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
      doc.text('DESCRIPTION', cols.item.x + 8, tableTop + 7);
      doc.text('SERIAL #', cols.serial.x, tableTop + 7, { width: cols.serial.w, align: 'center' });
      doc.text('QTY', cols.qty.x, tableTop + 7, { width: cols.qty.w, align: 'center' });
      doc.text('UNIT PRICE', cols.price.x, tableTop + 7, { width: cols.price.w, align: 'right' });
      doc.text('TOTAL', cols.total.x, tableTop + 7, { width: cols.total.w, align: 'right' });

      yPos = tableTop + 22;
      const rowHeight = 34;

      items.forEach((item, index) => {
        if (yPos > 640) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(COLORS.primary);
          yPos = 30;
          // Repeat header
          doc.rect(50, yPos, 512, 22).fill(COLORS.primary);
          doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
          doc.text('DESCRIPTION', cols.item.x + 8, yPos + 7);
          doc.text('SERIAL #', cols.serial.x, yPos + 7, { width: cols.serial.w, align: 'center' });
          doc.text('QTY', cols.qty.x, yPos + 7, { width: cols.qty.w, align: 'center' });
          doc.text('UNIT PRICE', cols.price.x, yPos + 7, { width: cols.price.w, align: 'right' });
          doc.text('TOTAL', cols.total.x, yPos + 7, { width: cols.total.w, align: 'right' });
          yPos += 22;
        }

        // Zebra striping
        if (index % 2 === 0) doc.rect(50, yPos, 512, rowHeight).fill(COLORS.bgLight);
        doc.moveTo(50, yPos + rowHeight).lineTo(562, yPos + rowHeight)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke();

        const rowY = yPos + 5;

        // Product name
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
          .text(item.product_name.substring(0, 38), cols.item.x + 8, rowY, { width: cols.item.w - 12 });

        // SKU + Manufacturer/model
        let subLine = item.product_sku || '';
        if (item.manufacturer) subLine += subLine ? ` | ${item.manufacturer}` : item.manufacturer;
        if (item.model_number) subLine += ` ${item.model_number}`;
        if (subLine) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted)
            .text(subLine.substring(0, 50), cols.item.x + 8, rowY + 12, { width: cols.item.w - 12 });
        }

        // Serial number
        if (item.serial_number) {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
            .text(item.serial_number, cols.serial.x, rowY + 4, { width: cols.serial.w, align: 'center' });
        } else {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
            .text('—', cols.serial.x, rowY + 4, { width: cols.serial.w, align: 'center' });
        }

        // Qty
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
          .text(item.quantity.toString(), cols.qty.x, rowY + 4, { width: cols.qty.w, align: 'center' });

        // Unit price
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
          .text(this.formatCurrency(item.unit_price), cols.price.x, rowY + 4, { width: cols.price.w, align: 'right' });

        // Line total
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
          .text(this.formatCurrency(item.line_total), cols.total.x, rowY + 4, { width: cols.total.w, align: 'right' });

        // Discount
        if (parseFloat(item.discount_amount) > 0) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.error)
            .text(`Disc: -${this.formatCurrency(item.discount_amount)}`, cols.total.x, rowY + 16, { width: cols.total.w, align: 'right' });
        }

        yPos += rowHeight;
      });

      // ============================================
      // DELIVERY SECTION
      // ============================================
      yPos += 12;
      if (yPos > 580) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
        .text('DELIVERY INFORMATION', 50, yPos);
      yPos += 14;

      const deliveryBoxHeight = 70;
      doc.roundedRect(50, yPos, 512, deliveryBoxHeight, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      let delY = yPos + 10;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight).text('Delivery Date:', 60, delY);
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(delivery && delivery.delivery_date ? this.formatDate(delivery.delivery_date) : 'To be scheduled', 150, delY);

      delY += 14;
      doc.fontSize(8).fillColor(COLORS.textLight).text('Deliver To:', 60, delY);
      if (delivery && delivery.delivery_address) {
        const delAddr = [
          delivery.delivery_address,
          [delivery.delivery_city, delivery.delivery_province, delivery.delivery_postal_code].filter(Boolean).join(', ')
        ].filter(Boolean).join(', ');
        doc.fontSize(9).fillColor(COLORS.textSecondary).text(delAddr, 150, delY, { width: 380 });
      } else {
        doc.fontSize(9).fillColor(COLORS.textMuted).text('Same as billing address', 150, delY);
      }

      delY += 14;
      doc.fontSize(8).fillColor(COLORS.textLight).text('Instructions:', 60, delY);
      doc.fontSize(9).fillColor(COLORS.textSecondary)
        .text(delivery && delivery.delivery_notes ? delivery.delivery_notes : '—', 150, delY, { width: 380 });

      delY += 16;
      doc.fontSize(8).fillColor(COLORS.textLight).text('Delivery confirmed by:', 60, delY);
      doc.moveTo(170, delY + 10).lineTo(400, delY + 10)
        .strokeColor(COLORS.borderMedium).lineWidth(0.5).dash(3, { space: 3 }).stroke().undash();

      yPos += deliveryBoxHeight + 12;

      // ============================================
      // PAYMENT SUMMARY
      // ============================================
      if (yPos > 520) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      // Totals card (right side)
      const totalsBoxX = 350;
      const totalsBoxW = 212;
      const totalsBoxH = balanceDue > 0 ? 155 : 130;

      doc.roundedRect(totalsBoxX, yPos, totalsBoxW, totalsBoxH, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      const lblX = totalsBoxX + 15;
      const valX = totalsBoxX + totalsBoxW - 15;
      let tY = yPos + 15;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted).text('Subtotal', lblX, tY);
      doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(transaction.subtotal), valX - 80, tY, { width: 80, align: 'right' });

      if (parseFloat(transaction.discount_amount) > 0) {
        tY += 16;
        doc.fillColor(COLORS.textMuted).text('Discount', lblX, tY);
        doc.fillColor(COLORS.error).text(`-${this.formatCurrency(transaction.discount_amount)}`, valX - 80, tY, { width: 80, align: 'right' });
      }

      const hst = parseFloat(transaction.hst_amount || 0);
      const gst = parseFloat(transaction.gst_amount || 0);
      const pst = parseFloat(transaction.pst_amount || 0);
      if (hst > 0) { tY += 16; doc.fillColor(COLORS.textMuted).text('HST (13%)', lblX, tY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(hst), valX - 80, tY, { width: 80, align: 'right' }); }
      if (gst > 0) { tY += 16; doc.fillColor(COLORS.textMuted).text('GST (5%)', lblX, tY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(gst), valX - 80, tY, { width: 80, align: 'right' }); }
      if (pst > 0) { tY += 16; doc.fillColor(COLORS.textMuted).text('PST', lblX, tY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(pst), valX - 80, tY, { width: 80, align: 'right' }); }

      tY += 18;
      doc.moveTo(lblX, tY).lineTo(valX, tY).strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();

      tY += 10;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('Total', lblX, tY);
      doc.text(this.formatCurrency(totalDue), valX - 80, tY, { width: 80, align: 'right' });

      if (totalPaid > 0) {
        tY += 16;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.success).text('Paid', lblX, tY);
        doc.text(`-${this.formatCurrency(totalPaid)}`, valX - 80, tY, { width: 80, align: 'right' });
      }

      // Balance due badge
      tY += 22;
      const balColor = balanceDue <= 0 ? COLORS.success : COLORS.primary;
      doc.roundedRect(totalsBoxX + 10, tY, totalsBoxW - 20, 28, 3).fill(balColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('white').text('BALANCE DUE', lblX, tY + 8);
      doc.fontSize(13).text(this.formatCurrency(balanceDue), valX - 85, tY + 6, { width: 80, align: 'right' });

      // Payment method list (left of totals)
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
        .text('PAYMENT RECEIVED', 50, yPos);

      let pmtY = yPos + 16;
      if (payments.length > 0) {
        const pmtBoxH = 12 + (payments.length * 18);
        doc.roundedRect(50, pmtY, 280, pmtBoxH, 4).fillAndStroke(COLORS.bgLight, COLORS.border);
        let py = pmtY + 8;
        for (const p of payments) {
          let method = p.payment_method.toUpperCase();
          if (p.card_brand && p.card_last_four) method = `${p.card_brand} ****${p.card_last_four}`;
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted).text(this.formatDate(p.processed_at), 60, py);
          doc.fillColor(COLORS.textSecondary).text(method, 140, py);
          doc.font('Helvetica-Bold').fillColor(COLORS.success).text(this.formatCurrency(p.amount), 250, py, { width: 70, align: 'right' });
          py += 18;
        }
      } else {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted)
          .text('No payments recorded', 60, pmtY + 6);
      }

      yPos += totalsBoxH + 15;

      // ============================================
      // SIGNATURE SECTION
      // ============================================
      if (yPos > 600) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
        .text('SIGNATURES', 50, yPos);
      yPos += 16;

      const sigBoxH = 80;
      doc.roundedRect(50, yPos, 512, sigBoxH, 4)
        .fillAndStroke(COLORS.bgMuted, COLORS.border);

      // Customer signature
      const sigLnY = yPos + 40;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight)
        .text('Customer Signature', 60, yPos + 10);
      doc.moveTo(60, sigLnY).lineTo(280, sigLnY)
        .strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(COLORS.textLight)
        .text('Print Name: ______________________________', 60, sigLnY + 6)
        .text('Date: ______________', 60, sigLnY + 18);

      // Staff signature
      doc.fontSize(8).fillColor(COLORS.textLight)
        .text('Staff Signature', 320, yPos + 10);
      doc.moveTo(320, sigLnY).lineTo(550, sigLnY)
        .strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(COLORS.textLight)
        .text('Print Name: ______________________________', 320, sigLnY + 6)
        .text('Date: ______________', 320, sigLnY + 18);

      yPos += sigBoxH + 12;

      // ============================================
      // PAYMENT SLIP ATTACHMENT AREA
      // ============================================
      if (yPos > 650) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

      const slipBoxH = 60;
      doc.roundedRect(50, yPos, 512, slipBoxH, 4)
        .dash(4, { space: 4 })
        .strokeColor(COLORS.borderMedium)
        .lineWidth(1)
        .stroke()
        .undash();

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.textMuted)
        .text('ATTACH PAYMENT RECEIPT HERE', 50, yPos + 22, { width: 512, align: 'center' });
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text('Staple or tape e-Transfer confirmation, cheque copy, or credit card slip', 50, yPos + 36, { width: 512, align: 'center' });

      yPos += slipBoxH + 10;

      // ============================================
      // QR CODE
      // ============================================
      if (qrBuffer) {
        try {
          doc.image(qrBuffer, 50, yPos, { width: 55, height: 55 });
          doc.fontSize(6).font('Helvetica').fillColor(COLORS.textMuted)
            .text('Scan to view', 48, yPos + 57, { width: 60, align: 'center' })
            .text('order online', 48, yPos + 64, { width: 60, align: 'center' });
        } catch (e) {
          console.error('[SalesOrderService] QR embed error:', e);
        }
      }

      // ============================================
      // FOOTER (on every page)
      // ============================================
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Footer line
        doc.moveTo(50, 740).lineTo(562, 740)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke();

        // HST number
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textMuted)
          .text(`HST #: ${this.hstNumber}`, 50, 745);

        // Return policy
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
          .text('Returns accepted within 30 days with original receipt. Items must be in original packaging.', 50, 756, { width: 400 });

        // Page number
        doc.fontSize(8).fillColor(COLORS.textLight)
          .text(`Page ${i + 1} of ${pageCount}`, 450, 745, { width: 112, align: 'right' });

        // Contact line
        const contactParts = [this.companyWebsite, this.companyPhone, this.companyEmail].filter(Boolean);
        doc.fontSize(7).text(contactParts.join('  |  '), 50, 768, { width: 512, align: 'center' });
      }

      doc.end();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // JSON data endpoint
  // ──────────────────────────────────────────────────────────────

  async getSalesOrderData(transactionId) {
    const data = await this.getTransactionData(transactionId);
    const { transaction, items, payments, salesRep, delivery } = data;
    const orderNumber = this.generateOrderNumber(transaction);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);

    return {
      orderNumber,
      date: transaction.created_at,
      company: {
        name: this.companyName,
        address: this.companyAddress,
        city: this.companyCity,
        phone: this.companyPhone,
        email: this.companyEmail,
        website: this.companyWebsite,
        hstNumber: this.hstNumber
      },
      customer: {
        name: transaction.customer_name || 'Walk-in Customer',
        company: transaction.company_name,
        phone: transaction.customer_phone,
        email: transaction.customer_email,
        address: transaction.customer_address,
        city: transaction.customer_city,
        province: transaction.customer_province,
        postalCode: transaction.customer_postal
      },
      salesDetails: {
        salesRep: salesRep || transaction.cashier_name || 'N/A',
        cashier: transaction.cashier_name,
        register: transaction.register_name,
        shiftId: transaction.shift_id,
        transactionNumber: transaction.transaction_number
      },
      items: items.map(item => ({
        name: item.product_name,
        sku: item.product_sku,
        manufacturer: item.manufacturer,
        modelNumber: item.model_number,
        serialNumber: item.serial_number,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        discountAmount: parseFloat(item.discount_amount || 0),
        total: parseFloat(item.line_total)
      })),
      delivery: delivery ? {
        date: delivery.delivery_date,
        address: delivery.delivery_address,
        city: delivery.delivery_city,
        province: delivery.delivery_province,
        postalCode: delivery.delivery_postal_code,
        notes: delivery.delivery_notes
      } : null,
      totals: {
        subtotal: parseFloat(transaction.subtotal),
        discount: parseFloat(transaction.discount_amount || 0),
        hst: parseFloat(transaction.hst_amount || 0),
        gst: parseFloat(transaction.gst_amount || 0),
        pst: parseFloat(transaction.pst_amount || 0),
        total: totalDue,
        paid: totalPaid,
        balanceDue: Math.max(0, totalDue - totalPaid)
      },
      payments: payments.map(p => ({
        method: p.payment_method,
        amount: parseFloat(p.amount),
        cardBrand: p.card_brand,
        cardLastFour: p.card_last_four,
        date: p.processed_at
      }))
    };
  }
}

module.exports = SalesOrderService;
