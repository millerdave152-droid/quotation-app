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
        p.manufacturer, p.model AS model_number,
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

    // Financing info (if financed transaction)
    let financing = null;
    try {
      const finResult = await this.pool.query(`
        SELECT fo.name AS plan_name, fo.provider, fo.term_months, fo.apr,
               fo.display_text, fo.highlight_text, fo.monthly_payment_formula,
               fa.approved_amount_cents
        FROM financing_applications fa
        JOIN financing_options fo ON fa.financing_option_id = fo.id
        WHERE fa.order_id = $1 OR fa.id = (
          SELECT financing_application_id FROM transactions WHERE transaction_id = $1
        )
        LIMIT 1
      `, [transactionId]);
      if (finResult.rows.length) {
        financing = finResult.rows[0];
      }
    } catch {
      // financing tables may not exist
    }

    // Also check quote_financing if transaction came from a quote
    if (!financing) {
      try {
        const qfResult = await this.pool.query(`
          SELECT qf.* FROM quote_financing qf
          JOIN quotations q ON q.id = qf.quote_id
          JOIN orders o ON o.quotation_id = q.id
          JOIN transactions t ON t.order_id = o.id
          WHERE t.transaction_id = $1
          LIMIT 1
        `, [transactionId]);
        if (qfResult.rows.length) {
          const qf = qfResult.rows[0];
          financing = {
            plan_name: qf.financing_type === 'deferred' ? 'Deferred Payment' : 'Equal Monthly Payments',
            provider: qf.provider || 'Flexiti',
            term_months: qf.term_months,
            apr: qf.interest_rate || 0,
            monthly_payment_cents: qf.monthly_payment_cents
          };
        }
      } catch {
        // quote_financing may not exist
      }
    }

    return {
      transaction,
      items: itemsResult.rows,
      payments: paymentsResult.rows,
      salesRep,
      delivery,
      financing
    };
  }

  // ──────────────────────────────────────────────────────────────
  // PDF Generation
  // ──────────────────────────────────────────────────────────────

  async generateSalesOrderPdf(transactionId) {
    const data = await this.getTransactionData(transactionId);
    const { transaction, items, payments, salesRep, delivery, financing } = data;
    const orderNumber = this.generateOrderNumber(transaction);

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);
    const balanceDue = Math.max(0, totalDue - totalPaid);

    // Back-calculate subtotal and HST from the tax-inclusive total
    // total_amount already includes 13% HST in Ontario
    const itemSubtotal = items.reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);

    // Calculate EHF for items
    let totalEHF = 0;
    try {
      const taxEngine = require('./TaxEngine');
      const ehfResult = taxEngine.calculateCartEHF(items.map(i => ({
        name: i.product_name, category: i.manufacturer || '', description: '', quantity: i.quantity
      })), 'ON');
      totalEHF = ehfResult.totalEHF;
    } catch { /* EHF calculation optional */ }
    const subtotal = itemSubtotal > 0 ? itemSubtotal : Math.round(totalDue / 1.13 * 100) / 100;
    const taxAmount = parseFloat(transaction.tax_amount || 0) || Math.round((totalDue - subtotal) * 100) / 100;
    const hasLogo = fs.existsSync(LOGO_PATH);

    const PAGE_W = 612;
    const PAGE_H = 792;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2; // 512

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN }
      });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let yPos = 0;

      // ──────────────────────────────────────────
      // Helper: measure text height without drawing
      // ──────────────────────────────────────────
      const measureText = (text, fontSize, width, font = 'Helvetica') => {
        doc.save();
        doc.fontSize(fontSize).font(font);
        const h = doc.heightOfString(text || '', { width });
        doc.restore();
        return h;
      };

      // ──────────────────────────────────────────
      // Helper: draw table header row
      // ──────────────────────────────────────────
      // Column widths must total CONTENT_W (512)
      // 35 + 175 + 62 + 80 + 70 + 45 + 45 = 512
      const cols = {
        qty:    { x: MARGIN,        w: 35 },
        desc:   { x: MARGIN + 35,   w: 175 },
        brand:  { x: MARGIN + 210,  w: 62 },
        model:  { x: MARGIN + 272,  w: 80 },
        serial: { x: MARGIN + 352,  w: 70 },
        price:  { x: MARGIN + 422,  w: 45 },
        amount: { x: MARGIN + 467,  w: 45 }
      };

      const drawTableHeader = (y) => {
        doc.rect(MARGIN, y, CONTENT_W, 20).fill(COLORS.primary);
        doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
        doc.text('QTY', cols.qty.x + 4, y + 6, { width: cols.qty.w - 8, align: 'center' });
        doc.text('PRODUCT DESCRIPTION', cols.desc.x + 4, y + 6, { width: cols.desc.w - 8 });
        doc.text('BRAND', cols.brand.x + 4, y + 6, { width: cols.brand.w - 8 });
        doc.text('MODEL', cols.model.x + 4, y + 6, { width: cols.model.w - 8 });
        doc.text('SERIAL NO', cols.serial.x + 4, y + 6, { width: cols.serial.w - 8 });
        doc.text('PRICE', cols.price.x + 2, y + 6, { width: cols.price.w - 4, align: 'right' });
        doc.text('AMOUNT', cols.amount.x + 2, y + 6, { width: cols.amount.w - 4, align: 'right' });
        return y + 20;
      };

      // ──────────────────────────────────────────
      // Helper: check if we need a new page
      // ──────────────────────────────────────────
      const ensureSpace = (needed) => {
        if (yPos + needed > 720) {
          doc.addPage();
          yPos = MARGIN;
          return true;
        }
        return false;
      };

      // ============================================
      // HEADER SECTION
      // ============================================

      // Logo or text fallback
      if (hasLogo) {
        try {
          doc.image(LOGO_PATH, MARGIN, 12, { width: 120 });
        } catch {
          doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
            .text('Teletime', MARGIN, 16);
        }
      } else {
        doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
          .text('Teletime', MARGIN, 16);
      }

      // "Teletime Superstores" below
      doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.primary)
        .text('Teletime Superstores', MARGIN, 44);

      // Tagline
      doc.fontSize(8).font('Helvetica-Oblique').fillColor(COLORS.textMuted)
        .text('TVs-Electronics-Appliances-Furniture', MARGIN, 60);

      // "Sales Order" title — right-aligned
      doc.fontSize(22).font('Helvetica-BoldOblique').fillColor(COLORS.primary)
        .text('Sales Order', MARGIN, 16, { width: CONTENT_W, align: 'right' });

      // Company address block centered
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
      const addrBlockY = 76;
      doc.text('3125 Wolfedale Road, Mississauga, ON L5C 1V8', MARGIN, addrBlockY, { width: CONTENT_W, align: 'center' });
      doc.text('TEL: (905) 273-5550', MARGIN, addrBlockY + 10, { width: CONTENT_W, align: 'center' });
      doc.text('www.teletime.ca, Email: info@teletime.ca', MARGIN, addrBlockY + 20, { width: CONTENT_W, align: 'center' });
      doc.font('Helvetica-Bold').text('HST #: 802845461RT0001', MARGIN, addrBlockY + 30, { width: CONTENT_W, align: 'center' });

      // ============================================
      // 3 INFO BOXES (BILL TO, SHIP TO, ORDER DETAILS)
      // ============================================
      yPos = 120;
      const boxGap = 6;
      const boxW = Math.floor((CONTENT_W - boxGap * 2) / 3); // ~170
      const boxPad = 10;
      const boxInnerW = boxW - boxPad * 2;

      // --- Measure dynamic heights for each box ---
      // BILL TO content
      const billLines = [];
      billLines.push({ text: transaction.customer_name || 'Walk-in Customer', bold: true });
      if (transaction.customer_address) billLines.push({ text: transaction.customer_address });
      const billCityLine = [transaction.customer_city, transaction.customer_province, transaction.customer_postal].filter(Boolean).join(', ');
      if (billCityLine) billLines.push({ text: billCityLine });
      if (transaction.customer_phone) billLines.push({ text: transaction.customer_phone });
      if (transaction.customer_email) billLines.push({ text: transaction.customer_email });

      // SHIP TO content
      const shipLines = [];
      if (delivery && delivery.delivery_address) {
        shipLines.push({ text: transaction.customer_name || 'Customer', bold: true });
        shipLines.push({ text: delivery.delivery_address });
        const shipCity = [delivery.delivery_city, delivery.delivery_province, delivery.delivery_postal_code].filter(Boolean).join(', ');
        if (shipCity) shipLines.push({ text: shipCity });
        if (transaction.customer_phone) shipLines.push({ text: transaction.customer_phone });
      } else {
        shipLines.push({ text: 'Same as billing address' });
      }

      // ORDER DETAILS content
      const orderDetailLines = [
        { label: 'Order No:', value: orderNumber, bold: true },
        { label: 'Order Date:', value: this.formatDate(transaction.created_at) },
        { label: 'Sales Person:', value: salesRep || transaction.cashier_name || 'N/A' },
        { label: 'Customer PO No:', value: transaction.transaction_number || 'N/A' },
        { label: 'Confirmation No:', value: orderNumber },
        { label: 'Delivery Mode:', value: delivery ? 'Delivery' : 'Pickup' },
        { label: 'Delivery Date:', value: delivery && delivery.delivery_date ? this.formatDate(delivery.delivery_date) : 'TBD', bold: true }
      ];

      // Calculate each box content height
      const lineH = 11;
      const headerLineH = 18; // label + underline
      const billContentH = headerLineH + billLines.length * lineH + boxPad;
      const shipContentH = headerLineH + shipLines.length * lineH + boxPad;
      const orderContentH = headerLineH + orderDetailLines.length * lineH + boxPad;
      const minBoxH = 100;
      const boxH = Math.max(minBoxH, billContentH, shipContentH, orderContentH) + boxPad;

      // Draw 3 boxes
      const box1X = MARGIN;
      const box2X = MARGIN + boxW + boxGap;
      const box3X = MARGIN + (boxW + boxGap) * 2;

      const drawInfoBox = (x, y, title, lines, isOrderDetails) => {
        doc.roundedRect(x, y, boxW, boxH, 4)
          .fillAndStroke(COLORS.bgLight, COLORS.border);

        let cy = y + boxPad;
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.primary)
          .text(title, x + boxPad, cy);
        cy += 12;
        doc.moveTo(x + boxPad, cy).lineTo(x + boxW - boxPad, cy)
          .strokeColor(COLORS.border).lineWidth(0.5).stroke();
        cy += 6;

        if (isOrderDetails) {
          for (const row of lines) {
            doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
              .text(row.label, x + boxPad, cy, { width: boxInnerW * 0.45, continued: false });
            doc.fontSize(7).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
              .fillColor(row.bold ? '#000000' : COLORS.textMuted)
              .text(row.value, x + boxPad + boxInnerW * 0.45, cy, { width: boxInnerW * 0.55 });
            cy += lineH;
          }
        } else {
          for (const line of lines) {
            doc.fontSize(9).font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
              .fillColor(line.bold ? '#000000' : COLORS.textMuted)
              .text(line.text, x + boxPad, cy, { width: boxInnerW });
            cy += lineH;
          }
        }
      };

      drawInfoBox(box1X, yPos, 'BILL TO', billLines, false);
      drawInfoBox(box2X, yPos, 'SHIP TO', shipLines, false);
      drawInfoBox(box3X, yPos, 'ORDER DETAILS', orderDetailLines, true);

      yPos += boxH + 10;

      // ============================================
      // ITEMS TABLE
      // ============================================
      yPos = drawTableHeader(yPos);

      items.forEach((item, index) => {
        // Measure description height to support multi-line — NO truncation
        const descText = item.product_name || '';
        const descH = measureText(descText, 8, cols.desc.w - 8);
        const rowH = Math.max(20, descH + 8);

        // Page break check
        if (yPos + rowH > 720) {
          doc.addPage();
          yPos = MARGIN;
          yPos = drawTableHeader(yPos);
        }

        // Zebra striping
        if (index % 2 === 0) {
          doc.rect(MARGIN, yPos, CONTENT_W, rowH).fill(COLORS.bgLight);
        }

        // Row divider
        doc.moveTo(MARGIN, yPos + rowH).lineTo(MARGIN + CONTENT_W, yPos + rowH)
          .strokeColor(COLORS.border).lineWidth(0.75).stroke();

        const textY = yPos + 4;

        // Qty
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(item.quantity.toString(), cols.qty.x + 4, textY, { width: cols.qty.w - 8, align: 'center' });

        // Product Description — full text, no truncation
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(descText, cols.desc.x + 4, textY, { width: cols.desc.w - 8 });

        // Brand
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(item.manufacturer || '', cols.brand.x + 4, textY, { width: cols.brand.w - 8 });

        // Model
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(item.model_number || '', cols.model.x + 4, textY, { width: cols.model.w - 8 });

        // Serial No
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(item.serial_number || '', cols.serial.x + 4, textY, { width: cols.serial.w - 8 });

        // Price (right-aligned)
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
          .text(this.formatCurrency(item.unit_price), cols.price.x + 2, textY, { width: cols.price.w - 4, align: 'right' });

        // Amount (right-aligned)
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.text)
          .text(this.formatCurrency(item.line_total), cols.amount.x + 2, textY, { width: cols.amount.w - 4, align: 'right' });

        yPos += rowH;
      });

      yPos += 10;

      // ============================================
      // PAYMENT & TOTALS (2 columns)
      // ============================================

      const leftColX = MARGIN;
      const leftColW = CONTENT_W * 0.5 - 5;
      const rightColX = MARGIN + CONTENT_W * 0.5 + 5;
      const rightColW = CONTENT_W * 0.5 - 5;

      // --- LEFT COLUMN: PAYMENT RECEIVED table ---
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text('PAYMENT RECEIVED', leftColX, yPos);

      let pmtTableY = yPos + 14;
      // Payment table header
      doc.rect(leftColX, pmtTableY, leftColW, 16).fill(COLORS.primary);
      doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
      doc.text('AMOUNT', leftColX + 8, pmtTableY + 5, { width: leftColW * 0.4 });
      doc.text('PAID BY', leftColX + leftColW * 0.4, pmtTableY + 5, { width: leftColW * 0.6 - 8 });
      pmtTableY += 16;

      if (payments.length > 0) {
        payments.forEach((p, idx) => {
          if (idx % 2 === 0) {
            doc.rect(leftColX, pmtTableY, leftColW, 16).fill(COLORS.bgLight);
          }
          let method = p.payment_method.toUpperCase();
          if (p.card_brand && p.card_last_four) method = `${p.card_brand} ****${p.card_last_four}`;
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
            .text(this.formatCurrency(p.amount), leftColX + 8, pmtTableY + 4, { width: leftColW * 0.4 });
          doc.text(method, leftColX + leftColW * 0.4, pmtTableY + 4, { width: leftColW * 0.6 - 8 });
          pmtTableY += 16;
        });
      } else {
        doc.rect(leftColX, pmtTableY, leftColW, 16).fill(COLORS.bgLight);
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
          .text('No payments recorded', leftColX + 8, pmtTableY + 4);
        pmtTableY += 16;
      }

      // Credits Issued, Restocking Charges, Total Returns
      pmtTableY += 6;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
      doc.text('Credits Issued:', leftColX, pmtTableY);
      doc.text('$0.00', leftColX + 120, pmtTableY);
      pmtTableY += 12;
      doc.text('Restocking Charges:', leftColX, pmtTableY);
      doc.text('$0.00', leftColX + 120, pmtTableY);
      pmtTableY += 12;
      doc.text('Total Returns:', leftColX, pmtTableY);
      doc.text('$0.00', leftColX + 120, pmtTableY);

      // --- RIGHT COLUMN: Totals ---
      let tY = yPos;
      const totLblX = rightColX;
      const totValX = rightColX + rightColW - 80;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted)
        .text('Sales Sub Total', totLblX, tY);
      doc.fillColor(COLORS.text)
        .text(this.formatCurrency(subtotal), totValX, tY, { width: 80, align: 'right' });

      tY += 14;
      doc.fillColor(COLORS.textMuted).text('Env. Handling Fee (EHF)', totLblX, tY);
      doc.fillColor(COLORS.text).text(this.formatCurrency(totalEHF), totValX, tY, { width: 80, align: 'right' });

      tY += 14;
      doc.fillColor(COLORS.textMuted).text('Sub Total', totLblX, tY);
      doc.fillColor(COLORS.text).text(this.formatCurrency(subtotal + totalEHF), totValX, tY, { width: 80, align: 'right' });

      tY += 14;
      doc.fillColor(COLORS.textMuted).text('GST/HST 13.000%', totLblX, tY);
      doc.fillColor(COLORS.text).text(this.formatCurrency(taxAmount), totValX, tY, { width: 80, align: 'right' });

      tY += 14;
      doc.fillColor(COLORS.textMuted).text('PST 0.000%', totLblX, tY);
      doc.fillColor(COLORS.text).text('$0.00', totValX, tY, { width: 80, align: 'right' });

      tY += 18;
      doc.moveTo(totLblX, tY).lineTo(rightColX + rightColW, tY)
        .strokeColor(COLORS.borderMedium).lineWidth(0.75).stroke();

      tY += 8;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
        .text('TOTAL', totLblX, tY);
      doc.text(this.formatCurrency(totalDue), totValX - 20, tY, { width: 100, align: 'right' });

      tY += 18;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text('Paid', totLblX, tY);
      doc.text(this.formatCurrency(totalPaid), totValX, tY, { width: 80, align: 'right' });

      tY += 14;
      const balanceColor = balanceDue <= 0 ? COLORS.success : COLORS.error;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(balanceColor)
        .text('Balance', totLblX, tY);
      doc.text(this.formatCurrency(balanceDue), totValX, tY, { width: 80, align: 'right' });

      yPos = Math.max(pmtTableY, tY) + 16;

      // ============================================
      // FINANCING TERMS (if applicable)
      // ============================================
      if (financing) {
        const monthlyPayment = financing.monthly_payment_cents
          ? financing.monthly_payment_cents / 100
          : (financing.term_months > 0 ? totalDue / financing.term_months : 0);
        const isDeferred = (financing.plan_name || '').toLowerCase().includes('defer');

        doc.roundedRect(MARGIN, yPos, CONTENT_W, 38, 3)
          .fillAndStroke('#f0f7ff', '#93c5fd');

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#1e40af')
          .text('FINANCING TERMS', MARGIN + 8, yPos + 5);

        doc.fontSize(7).font('Helvetica').fillColor(COLORS.text);
        const finY = yPos + 16;
        doc.text(`Provider: ${(financing.provider || 'Flexiti').charAt(0).toUpperCase() + (financing.provider || 'flexiti').slice(1)}`, MARGIN + 8, finY);
        doc.text(`Plan: ${financing.plan_name || 'N/A'}`, MARGIN + 140, finY);
        doc.text(`Term: ${financing.term_months} months`, MARGIN + 300, finY);
        doc.text(`Rate: ${parseFloat(financing.apr || 0).toFixed(1)}%`, MARGIN + 390, finY);
        doc.font('Helvetica-Bold')
          .text(`Monthly: ${isDeferred ? '$0.00 (deferred)' : this.formatCurrency(monthlyPayment)}`, MARGIN + 440, finY);

        yPos += 44;
      }

      // ============================================
      // CUSTOMER SECTION
      // ============================================

      // "Thanks For Shopping" italic left
      doc.fontSize(10).font('Helvetica-Oblique').fillColor(COLORS.textMuted)
        .text('Thanks For Shopping, See You Again', MARGIN, yPos);

      // Customer Note(s) box on right
      const noteBoxW = 200;
      const noteBoxH = 36;
      const noteBoxX = MARGIN + CONTENT_W - noteBoxW;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Customer Note(s):', noteBoxX, yPos);
      doc.rect(noteBoxX, yPos + 12, noteBoxW, noteBoxH)
        .strokeColor('#000000').lineWidth(1).stroke();

      yPos += noteBoxH + 16;

      // Accepted By (Name): with drawn line
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Accepted By (Name):', MARGIN, yPos, { lineBreak: false });
      const nameLineX = MARGIN + 115;
      doc.moveTo(nameLineX, yPos + 10).lineTo(nameLineX + 250, yPos + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      yPos += 15;

      // Signature: with drawn line
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Signature:', MARGIN, yPos, { lineBreak: false });
      const sigLineX = MARGIN + 58;
      doc.moveTo(sigLineX, yPos + 10).lineTo(sigLineX + 250, yPos + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      yPos += 15;

      // Date: with drawn line
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Date:', MARGIN, yPos, { lineBreak: false });
      const dateLineX = MARGIN + 32;
      doc.moveTo(dateLineX, yPos + 10).lineTo(dateLineX + 150, yPos + 10)
        .strokeColor('#000000').lineWidth(1).stroke();
      yPos += 18;

      // ============================================
      // TERMS & CONDITIONS
      // ============================================
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
        .text('TERMS & CONDITIONS', MARGIN, yPos, { lineBreak: false });
      yPos += 10;

      const terms = [
        'EXCHANGES: 15 days from delivery/invoice in unused original condition with all packaging. 20% restocking fee applies on non-defective items.',
        'MATTRESSES: 90-Night Comfort Guarantee with mattress protector purchase (min. 21 nights slept on; one-time exchange; delivery fee applies).',
        'DEFECTIVE/DOA: Report within 72 hours of delivery for exchange or repair at no charge. After 72 hours, manufacturer warranty applies. Appliances once installed or used are covered under manufacturer warranty only.',
        'DEPOSITS & CANCELLATIONS: All deposits are non-refundable. A 20% cancellation fee applies to orders already placed with suppliers.',
        'DELIVERY: Standard delivery to front door only. Damage to property or goods beyond front door entry is the customer\'s responsibility. Ensure proper measurements before delivery \u2014 re-delivery due to sizing issues subject to a minimum $100.00 fee. Teletime is not responsible for removal of existing customer property.',
        'DAMAGE REPORTING: Inspect goods at delivery. Report visible damage at time of delivery; concealed damage within 72 hours. Unreported damage is not covered. Mishandled products are not covered under any warranty.',
        'PRICE MATCH: We match any authorized Canadian retailer\'s advertised price on the same brand/model within 30 days of purchase, with valid proof.',
        'FINAL SALE: Special/custom orders, clearance, floor models, opened bedding/accessories, and gift cards are non-refundable.',
        'WARRANTY: All products carry applicable manufacturer\'s warranty. Extended protection plans available \u2014 ask your sales associate.',
        'CONSUMER RIGHTS: These terms do not affect your rights under Ontario\'s Consumer Protection Act, 2002. For full terms visit www.teletime.ca'
      ];

      // Footer zone starts here — T&C must fit above it
      const footerY = PAGE_H - 42;
      const maxTermY = footerY - 24; // leave room for footer

      doc.fontSize(5).font('Helvetica').fillColor(COLORS.textLight);
      for (const term of terms) {
        if (yPos >= maxTermY) break; // stop if we'd overrun the footer
        const termH = measureText(term, 5, CONTENT_W);
        doc.text(term, MARGIN, yPos, { width: CONTENT_W, height: termH + 1, lineBreak: true, ellipsis: true });
        yPos += termH + 1;
      }

      // ============================================
      // FOOTER — absolute position on current page
      // ============================================
      doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY)
        .strokeColor(COLORS.border).lineWidth(1).stroke();

      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text('Page 1 of 1', MARGIN, footerY + 4, { lineBreak: false });

      doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.textMuted)
        .text('HST #: 802845461RT0001', MARGIN + 150, footerY + 4, { lineBreak: false });

      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text('www.teletime.ca | (905) 273-5550 | info@teletime.ca', MARGIN + 300, footerY + 4, { lineBreak: false });

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
