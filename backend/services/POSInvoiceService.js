/**
 * POS Invoice Service - Professional Invoice Generation from POS Transactions
 *
 * Generates invoices from POS transactions matching quote PDF styling:
 * - Same enterprise branding and layout as quotes
 * - Payment status tracking
 * - Account customer support with payment terms
 * - Batch invoice generation
 *
 * Uses enterprise color scheme from PdfService
 */

const PDFDocument = require('pdfkit');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

// QR Code generation - optional
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {
  console.warn('[POSInvoiceService] qrcode package not installed - QR codes disabled');
}

/**
 * Enterprise Color Scheme (matching PdfService/quotes)
 */
const COLORS = {
  primary: '#1e40af',       // Deep blue - headers, accents
  primaryLight: '#3b82f6',  // Light blue - links
  text: '#1f2937',          // Near black - main text
  textSecondary: '#374151', // Dark gray
  textMuted: '#6b7280',     // Medium gray
  textLight: '#9ca3af',     // Light gray
  bgLight: '#f8fafc',       // Off-white
  bgMuted: '#fafafa',       // Very light
  border: '#e5e7eb',        // Light gray border
  borderMedium: '#d1d5db',  // Medium border
  success: '#10b981',       // Green - paid
  error: '#dc2626',         // Red - overdue
  warning: '#f59e0b'        // Amber - pending
};

/**
 * Payment status configurations
 */
const PAYMENT_STATUS = {
  paid: { label: 'PAID', color: COLORS.success, bgColor: '#dcfce7' },
  partial: { label: 'PARTIAL', color: COLORS.warning, bgColor: '#fef3c7' },
  pending: { label: 'PENDING', color: COLORS.warning, bgColor: '#fef3c7' },
  overdue: { label: 'OVERDUE', color: COLORS.error, bgColor: '#fee2e2' },
  void: { label: 'VOID', color: COLORS.textMuted, bgColor: '#f3f4f6' }
};

/**
 * Payment terms configurations
 */
const PAYMENT_TERMS = {
  immediate: { label: 'Due on Receipt', days: 0 },
  net_7: { label: 'Net 7', days: 7 },
  net_15: { label: 'Net 15', days: 15 },
  net_30: { label: 'Net 30', days: 30 },
  net_45: { label: 'Net 45', days: 45 },
  net_60: { label: 'Net 60', days: 60 }
};

class POSInvoiceService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Cache module
   * @param {object} config - Configuration options
   */
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    // Company details
    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TeleTime POS';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyCity = config.companyCity || process.env.COMPANY_CITY || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';
    this.taxNumber = config.taxNumber || process.env.TAX_NUMBER || '';

    // Invoice lookup URL
    this.invoiceBaseUrl = config.invoiceBaseUrl || process.env.INVOICE_URL || 'https://pos.teletime.ca/invoice';

    // SES client for email
    this.sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      requestHandler: {
        requestTimeout: 10_000, // 10 second timeout for SES API calls
      },
    });

    this.fromEmail = config.fromEmail || process.env.EMAIL_FROM || 'invoices@teletime.ca';
  }

  formatCurrency(amount) {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  calculateDueDate(invoiceDate, terms = 'net_30') {
    const date = new Date(invoiceDate);
    const termConfig = PAYMENT_TERMS[terms] || PAYMENT_TERMS.net_30;
    date.setDate(date.getDate() + termConfig.days);
    return date;
  }

  determinePaymentStatus(transaction, payments) {
    if (transaction.status === 'voided') return 'void';

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);

    if (totalPaid >= totalDue) return 'paid';
    if (totalPaid > 0) return 'partial';

    if (transaction.due_date) {
      const dueDate = new Date(transaction.due_date);
      if (new Date() > dueDate) return 'overdue';
    }

    return 'pending';
  }

  async generateQRCode(data) {
    if (!QRCode) return null;
    try {
      return await QRCode.toBuffer(data, {
        type: 'png',
        width: 100,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
    } catch (err) {
      console.error('[POSInvoiceService] QR error:', err);
      return null;
    }
  }

  generateInvoiceNumber(transaction) {
    if (transaction.invoice_number) return transaction.invoice_number;
    const date = new Date(transaction.created_at);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    return `INV-${dateStr}-${String(transaction.transaction_id).padStart(5, '0')}`;
  }

  async getTransactionForInvoice(transactionId) {
    const txnResult = await this.pool.query(`
      SELECT
        t.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company_name,
        c.address as customer_address,
        c.city as customer_city,
        c.province as customer_province,
        c.postal_code as customer_postal,
        c.credit_limit,
        c.current_balance,
        c.payment_terms as customer_terms,
        u.first_name || ' ' || u.last_name as cashier_name,
        r.register_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN register_shifts rs ON t.shift_id = rs.shift_id
      LEFT JOIN registers r ON rs.register_id = r.register_id
      WHERE t.transaction_id = $1
    `, [transactionId]);

    if (txnResult.rows.length === 0) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const itemsResult = await this.pool.query(`
      SELECT product_name, product_sku, quantity, unit_price,
             discount_percent, discount_amount, tax_amount, line_total
      FROM transaction_items
      WHERE transaction_id = $1
      ORDER BY item_id
    `, [transactionId]);

    const paymentsResult = await this.pool.query(`
      SELECT payment_method, amount, card_brand, card_last_four, processed_at, status
      FROM payments
      WHERE transaction_id = $1 AND status = 'completed'
      ORDER BY processed_at
    `, [transactionId]);

    return {
      transaction: txnResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows
    };
  }

  /**
   * Generate Professional Invoice PDF (matching quote styling)
   */
  async generateInvoicePdf(transactionId, options = {}) {
    const { terms, showPayments = true } = options;
    const data = await this.getTransactionForInvoice(transactionId);
    const { transaction, items, payments } = data;

    const paymentTerms = terms || transaction.customer_terms || 'net_30';
    const termConfig = PAYMENT_TERMS[paymentTerms] || PAYMENT_TERMS.net_30;
    const invoiceDate = new Date(transaction.created_at);
    const dueDate = this.calculateDueDate(invoiceDate, paymentTerms);
    const paymentStatus = this.determinePaymentStatus(transaction, payments);
    const statusConfig = PAYMENT_STATUS[paymentStatus];
    const invoiceNumber = this.generateInvoiceNumber(transaction);

    const qrData = `${this.invoiceBaseUrl}/${invoiceNumber}`;
    const qrBuffer = await this.generateQRCode(qrData);

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);
    const balanceDue = Math.max(0, totalDue - totalPaid);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // TOP ACCENT BAR
      doc.rect(0, 0, 612, 4).fill(COLORS.primary);

      // HEADER
      doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.primary)
         .text(this.companyName, 50, 20);

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted);
      let headerY = 45;
      if (this.companyAddress) { doc.text(this.companyAddress, 50, headerY); headerY += 11; }
      if (this.companyCity) { doc.text(this.companyCity, 50, headerY); headerY += 11; }
      if (this.companyPhone) { doc.text(`Tel: ${this.companyPhone}`, 50, headerY); headerY += 11; }
      if (this.taxNumber) { doc.text(`Tax #: ${this.taxNumber}`, 50, headerY); }

      // INVOICE BADGE
      doc.roundedRect(400, 12, 162, 85, 4).fillAndStroke(COLORS.bgLight, COLORS.border);

      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary)
         .text('INVOICE', 402, 18, { width: 158, align: 'center' });

      doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
         .text(invoiceNumber, 402, 32, { width: 158, align: 'center' });

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
         .text(`Date: ${this.formatDate(invoiceDate)}`, 402, 50, { width: 158, align: 'center' })
         .text(`Due: ${this.formatDate(dueDate)}`, 402, 61, { width: 158, align: 'center' });

      // Status badge
      doc.roundedRect(430, 74, 102, 18, 3).fill(statusConfig.bgColor);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(statusConfig.color)
         .text(statusConfig.label, 430, 79, { width: 102, align: 'center' });

      // CUSTOMER CARD
      const customerCardY = 105;
      const customerCardHeight = 95;
      doc.roundedRect(50, customerCardY, 512, customerCardHeight, 6)
         .fillAndStroke(COLORS.bgMuted, COLORS.border);

      // Bill To
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight)
         .text('BILL TO', 60, customerCardY + 10);
      doc.moveTo(60, customerCardY + 22).lineTo(150, customerCardY + 22)
         .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      let leftY = customerCardY + 28;
      const customerName = transaction.customer_name || 'Walk-in Customer';
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.text)
         .text(customerName, 60, leftY, { width: 220 });

      if (transaction.company_name && transaction.company_name !== customerName) {
        leftY += 14;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted)
           .text(transaction.company_name, 60, leftY, { width: 220 });
      }

      if (transaction.customer_address) {
        leftY += 12;
        doc.text(transaction.customer_address, 60, leftY, { width: 220 });
      }

      const cityLine = [transaction.customer_city, transaction.customer_province, transaction.customer_postal].filter(Boolean).join(', ');
      if (cityLine) {
        leftY += 11;
        doc.text(cityLine, 60, leftY, { width: 220 });
      }

      // Divider
      doc.moveTo(300, customerCardY + 10).lineTo(300, customerCardY + customerCardHeight - 10)
         .strokeColor(COLORS.border).stroke();

      // Invoice Details
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight)
         .text('INVOICE DETAILS', 315, customerCardY + 10);
      doc.moveTo(315, customerCardY + 22).lineTo(430, customerCardY + 22)
         .strokeColor(COLORS.border).lineWidth(0.5).stroke();

      let rightY = customerCardY + 28;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight).text('Transaction:', 315, rightY);
      doc.fontSize(9).fillColor(COLORS.textSecondary).text(transaction.transaction_number || 'N/A', 385, rightY);

      rightY += 14;
      doc.fontSize(8).fillColor(COLORS.textLight).text('Terms:', 315, rightY);
      doc.fontSize(9).fillColor(COLORS.textSecondary).text(termConfig.label, 385, rightY);

      rightY += 14;
      doc.fontSize(8).fillColor(COLORS.textLight).text('Issued by:', 315, rightY);
      doc.fontSize(9).fillColor(COLORS.textSecondary).text(transaction.cashier_name || 'N/A', 385, rightY);

      if (transaction.customer_email) {
        rightY += 14;
        doc.fontSize(8).fillColor(COLORS.textLight).text('Email:', 315, rightY);
        doc.fontSize(9).fillColor(COLORS.primaryLight).text(transaction.customer_email, 385, rightY);
      }

      // ITEMS TABLE
      let yPos = customerCardY + customerCardHeight + 15;
      const tableTop = yPos;
      const cols = {
        item: { x: 50, w: 280 },
        qty: { x: 330, w: 50 },
        price: { x: 380, w: 70 },
        total: { x: 450, w: 112 }
      };

      doc.rect(50, tableTop, 512, 22).fill(COLORS.primary);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
      doc.text('DESCRIPTION', cols.item.x + 8, tableTop + 7);
      doc.text('QTY', cols.qty.x, tableTop + 7, { width: cols.qty.w, align: 'center' });
      doc.text('UNIT PRICE', cols.price.x, tableTop + 7, { width: cols.price.w, align: 'right' });
      doc.text('AMOUNT', cols.total.x, tableTop + 7, { width: cols.total.w, align: 'right' });

      yPos = tableTop + 22;
      const rowHeight = 26;

      items.forEach((item, index) => {
        if (yPos > 650) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(COLORS.primary);
          yPos = 30;
          doc.rect(50, yPos, 512, 22).fill(COLORS.primary);
          doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
          doc.text('DESCRIPTION', cols.item.x + 8, yPos + 7);
          doc.text('QTY', cols.qty.x, yPos + 7, { width: cols.qty.w, align: 'center' });
          doc.text('UNIT PRICE', cols.price.x, yPos + 7, { width: cols.price.w, align: 'right' });
          doc.text('AMOUNT', cols.total.x, yPos + 7, { width: cols.total.w, align: 'right' });
          yPos += 22;
        }

        if (index % 2 === 0) doc.rect(50, yPos, 512, rowHeight).fill(COLORS.bgLight);
        doc.moveTo(50, yPos + rowHeight).lineTo(562, yPos + rowHeight).strokeColor(COLORS.border).lineWidth(0.5).stroke();

        const rowY = yPos + 7;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
           .text(item.product_name.substring(0, 45), cols.item.x + 8, rowY, { width: cols.item.w - 12 });
        if (item.product_sku) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted)
             .text(item.product_sku, cols.item.x + 8, rowY + 11);
        }
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
           .text(item.quantity.toString(), cols.qty.x, rowY, { width: cols.qty.w, align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
           .text(this.formatCurrency(item.unit_price), cols.price.x, rowY, { width: cols.price.w, align: 'right' });
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
           .text(this.formatCurrency(item.line_total), cols.total.x, rowY, { width: cols.total.w, align: 'right' });

        if (parseFloat(item.discount_amount) > 0) {
          doc.fontSize(7).font('Helvetica').fillColor(COLORS.error)
             .text(`Disc: -${this.formatCurrency(item.discount_amount)}`, cols.total.x, rowY + 11, { width: cols.total.w, align: 'right' });
        }

        yPos += rowHeight;
      });

      // TOTALS CARD
      yPos += 15;
      const totalsBoxX = 350;
      const totalsBoxWidth = 212;
      const totalsBoxHeight = showPayments && totalPaid > 0 ? 160 : 130;

      doc.roundedRect(totalsBoxX, yPos, totalsBoxWidth, totalsBoxHeight, 4)
         .fillAndStroke(COLORS.bgMuted, COLORS.border);

      const labelX = totalsBoxX + 15;
      const valueX = totalsBoxX + totalsBoxWidth - 15;
      let lineY = yPos + 15;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted).text('Subtotal', labelX, lineY);
      doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(transaction.subtotal), valueX - 80, lineY, { width: 80, align: 'right' });

      if (parseFloat(transaction.discount_amount) > 0) {
        lineY += 16;
        doc.fillColor(COLORS.textMuted).text('Discount', labelX, lineY);
        doc.fillColor(COLORS.error).text(`-${this.formatCurrency(transaction.discount_amount)}`, valueX - 80, lineY, { width: 80, align: 'right' });
      }

      const hst = parseFloat(transaction.hst_amount || 0);
      const gst = parseFloat(transaction.gst_amount || 0);
      const pst = parseFloat(transaction.pst_amount || 0);

      if (hst > 0) { lineY += 16; doc.fillColor(COLORS.textMuted).text('HST (13%)', labelX, lineY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(hst), valueX - 80, lineY, { width: 80, align: 'right' }); }
      if (gst > 0) { lineY += 16; doc.fillColor(COLORS.textMuted).text('GST (5%)', labelX, lineY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(gst), valueX - 80, lineY, { width: 80, align: 'right' }); }
      if (pst > 0) { lineY += 16; doc.fillColor(COLORS.textMuted).text('PST', labelX, lineY); doc.fillColor(COLORS.textSecondary).text(this.formatCurrency(pst), valueX - 80, lineY, { width: 80, align: 'right' }); }

      lineY += 18;
      doc.moveTo(labelX, lineY).lineTo(valueX, lineY).strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();

      lineY += 10;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('Invoice Total', labelX, lineY);
      doc.text(this.formatCurrency(totalDue), valueX - 80, lineY, { width: 80, align: 'right' });

      if (showPayments && totalPaid > 0) {
        lineY += 16;
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.success).text('Payments Received', labelX, lineY);
        doc.text(`-${this.formatCurrency(totalPaid)}`, valueX - 80, lineY, { width: 80, align: 'right' });
      }

      lineY += 22;
      const balanceColor = paymentStatus === 'paid' ? COLORS.success : COLORS.primary;
      doc.roundedRect(totalsBoxX + 10, lineY, totalsBoxWidth - 20, 28, 3).fill(balanceColor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('white').text('BALANCE DUE', labelX, lineY + 8);
      doc.fontSize(13).text(this.formatCurrency(balanceDue), valueX - 85, lineY + 6, { width: 80, align: 'right' });

      // PAYMENT HISTORY
      if (showPayments && payments.length > 0) {
        yPos += totalsBoxHeight + 20;
        if (yPos > 650) { doc.addPage(); doc.rect(0, 0, 612, 4).fill(COLORS.primary); yPos = 30; }

        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('PAYMENT HISTORY', 50, yPos);
        yPos += 14;
        doc.roundedRect(50, yPos, 280, 16 + (payments.length * 18), 4).fillAndStroke(COLORS.bgLight, COLORS.border);

        let paymentY = yPos + 10;
        for (const payment of payments) {
          let methodText = payment.payment_method.toUpperCase();
          if (payment.card_brand && payment.card_last_four) {
            methodText = `${payment.card_brand} ****${payment.card_last_four}`;
          }
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted).text(this.formatDate(payment.processed_at), 60, paymentY);
          doc.fillColor(COLORS.textSecondary).text(methodText, 140, paymentY);
          doc.font('Helvetica-Bold').fillColor(COLORS.success).text(this.formatCurrency(payment.amount), 250, paymentY, { width: 70, align: 'right' });
          paymentY += 18;
        }
      }

      // QR CODE
      if (qrBuffer) {
        const qrY = yPos + (showPayments && payments.length > 0 ? 20 : totalsBoxHeight + 20);
        try {
          doc.image(qrBuffer, 50, qrY, { width: 60, height: 60 });
          doc.fontSize(6).font('Helvetica').fillColor(COLORS.textMuted)
             .text('Scan to view', 48, qrY + 62, { width: 64, align: 'center' })
             .text('invoice online', 48, qrY + 69, { width: 64, align: 'center' });
        } catch (e) { console.error('[POSInvoiceService] QR embed error:', e); }
      }

      // PAYMENT INSTRUCTIONS (unpaid)
      if (paymentStatus !== 'paid' && paymentStatus !== 'void') {
        const instructionsY = 620;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text).text('PAYMENT INSTRUCTIONS', 50, instructionsY);
        doc.roundedRect(50, instructionsY + 14, 512, 45, 4).fillAndStroke('#f0fdf4', '#bbf7d0');
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
           .text('Please include your invoice number on all payments.', 60, instructionsY + 24)
           .text(`Payment is due by ${this.formatDate(dueDate)}.`, 60, instructionsY + 36)
           .text('For questions regarding this invoice, please contact us at ' + (this.companyEmail || this.companyPhone), 60, instructionsY + 48);
      }

      // FOOTER
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.moveTo(50, 745).lineTo(562, 745).strokeColor(COLORS.border).lineWidth(0.5).stroke();
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted).text('Thank you for your business!', 50, 752);
        doc.fontSize(8).fillColor(COLORS.textLight).text(`Page ${i + 1} of ${pageCount}`, 450, 752, { width: 112, align: 'right' });
        const contactParts = [this.companyWebsite, this.companyPhone, this.companyEmail].filter(Boolean);
        doc.fontSize(7).text(contactParts.join('  |  '), 50, 765, { width: 512, align: 'center' });
      }

      doc.end();
    });
  }

  /**
   * Get invoice data as JSON
   */
  async getInvoiceData(transactionId, options = {}) {
    const { terms } = options;
    const data = await this.getTransactionForInvoice(transactionId);
    const { transaction, items, payments } = data;

    const paymentTerms = terms || transaction.customer_terms || 'net_30';
    const termConfig = PAYMENT_TERMS[paymentTerms] || PAYMENT_TERMS.net_30;
    const invoiceDate = new Date(transaction.created_at);
    const dueDate = this.calculateDueDate(invoiceDate, paymentTerms);
    const paymentStatus = this.determinePaymentStatus(transaction, payments);
    const invoiceNumber = this.generateInvoiceNumber(transaction);

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalDue = parseFloat(transaction.total_amount || 0);

    return {
      company: {
        name: this.companyName,
        address: this.companyAddress,
        city: this.companyCity,
        phone: this.companyPhone,
        email: this.companyEmail,
        website: this.companyWebsite,
        taxNumber: this.taxNumber
      },
      invoice: {
        number: invoiceNumber,
        date: invoiceDate,
        dueDate: dueDate,
        terms: termConfig.label,
        termsKey: paymentTerms,
        status: paymentStatus,
        transactionNumber: transaction.transaction_number
      },
      customer: {
        name: transaction.customer_name || 'Walk-in Customer',
        company: transaction.company_name,
        email: transaction.customer_email,
        phone: transaction.customer_phone,
        address: transaction.customer_address,
        city: transaction.customer_city,
        province: transaction.customer_province,
        postalCode: transaction.customer_postal,
        creditLimit: transaction.credit_limit,
        currentBalance: transaction.current_balance
      },
      items: items.map(item => ({
        name: item.product_name,
        sku: item.product_sku,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        discountAmount: parseFloat(item.discount_amount || 0),
        taxAmount: parseFloat(item.tax_amount || 0),
        total: parseFloat(item.line_total)
      })),
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

  /**
   * Generate batch invoices for account customers
   */
  async generateBatchInvoices(options = {}) {
    const { customerId, startDate, endDate, status = 'completed', unpaidOnly = true } = options;

    let query = `
      SELECT DISTINCT t.transaction_id
      FROM transactions t
      LEFT JOIN payments p ON t.transaction_id = p.transaction_id AND p.status = 'completed'
      WHERE t.status = $1 AND t.customer_id IS NOT NULL
    `;
    const params = [status];
    let paramIndex = 2;

    if (customerId) { query += ` AND t.customer_id = $${paramIndex}`; params.push(customerId); paramIndex++; }
    if (startDate) { query += ` AND t.created_at >= $${paramIndex}`; params.push(startDate); paramIndex++; }
    if (endDate) { query += ` AND t.created_at <= $${paramIndex}`; params.push(endDate); paramIndex++; }

    if (unpaidOnly) {
      query += ` GROUP BY t.transaction_id HAVING COALESCE(SUM(p.amount), 0) < t.total_amount`;
    }

    query += ' ORDER BY t.created_at DESC LIMIT 100';

    const result = await this.pool.query(query, params);
    const results = [];

    for (const row of result.rows) {
      try {
        const pdfBuffer = await this.generateInvoicePdf(row.transaction_id);
        const data = await this.getTransactionForInvoice(row.transaction_id);
        const invoiceNumber = this.generateInvoiceNumber(data.transaction);

        results.push({
          transactionId: row.transaction_id,
          invoiceNumber,
          customerId: data.transaction.customer_id,
          customerName: data.transaction.customer_name,
          total: parseFloat(data.transaction.total_amount),
          pdfBuffer,
          success: true
        });
      } catch (err) {
        console.error(`[POSInvoiceService] Batch error for txn ${row.transaction_id}:`, err);
        results.push({ transactionId: row.transaction_id, success: false, error: err.message });
      }
    }

    return results;
  }

  /**
   * Email invoice to customer
   */
  async emailInvoice(transactionId, email, options = {}) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid email address is required');
    }

    const pdfBuffer = await this.generateInvoicePdf(transactionId, options);
    const data = await this.getInvoiceData(transactionId, options);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
        <div style="background:#1e40af;height:4px;"></div>
        <div style="max-width:600px;margin:0 auto;padding:0;">
          <div style="background:#fff;padding:30px;">
            <h1 style="margin:0 0 10px;color:#1e40af;font-size:24px;">${this.companyName}</h1>
            <p style="margin:0;color:#6b7280;">Invoice ${data.invoice.number}</p>
            <div style="margin:25px 0;padding:20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 5px;font-size:12px;color:#6b7280;">Amount Due</p>
                    <p style="margin:0;font-size:28px;font-weight:700;color:#1f2937;">${this.formatCurrency(data.totals.balanceDue)}</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0 0 5px;font-size:12px;color:#6b7280;">Due Date</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#1f2937;">${this.formatDate(data.invoice.dueDate)}</p>
                    <p style="margin:5px 0 0;font-size:12px;color:#6b7280;">${data.invoice.terms}</p>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color:#374151;line-height:1.6;">Dear ${data.customer.name},</p>
            <p style="color:#374151;line-height:1.6;">
              Please find attached your invoice from ${this.companyName}.
              ${data.totals.balanceDue > 0 ? `Payment of ${this.formatCurrency(data.totals.balanceDue)} is due by ${this.formatDate(data.invoice.dueDate)}.` : 'This invoice has been paid in full. Thank you!'}
            </p>
            <p style="color:#374151;line-height:1.6;">Thank you for your business!</p>
          </div>
          <div style="background:#f9fafb;padding:20px 30px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;text-align:center;color:#9ca3af;font-size:12px;">
              ${[this.companyPhone, this.companyEmail].filter(Boolean).join(' | ')}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const pdfBase64 = pdfBuffer.toString('base64');
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;

    const rawEmail = [
      `From: ${this.companyName} <${this.fromEmail}>`,
      `To: ${email}`,
      `Subject: Invoice ${data.invoice.number} from ${this.companyName}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailHtml,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="Invoice-${data.invoice.number}.pdf"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="Invoice-${data.invoice.number}.pdf"`,
      '',
      pdfBase64,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const command = new SendEmailCommand({
      FromEmailAddress: this.fromEmail,
      Destination: { ToAddresses: [email] },
      Content: { Raw: { Data: Buffer.from(rawEmail) } }
    });

    try {
      const result = await this.sesClient.send(command);
      return { success: true, messageId: result.MessageId, email, invoiceNumber: data.invoice.number };
    } catch (error) {
      console.error('[POSInvoiceService] Email error:', error);
      throw new Error(`Failed to send invoice: ${error.message}`);
    }
  }

  /**
   * Get account customers with outstanding balances
   */
  async getAccountCustomersWithBalances() {
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.name,
        c.company_name,
        c.email,
        c.credit_limit,
        c.current_balance,
        c.payment_terms,
        COUNT(t.transaction_id) as unpaid_invoices,
        COALESCE(SUM(t.total_amount - COALESCE(p.paid, 0)), 0) as total_outstanding
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id AND t.status = 'completed'
      LEFT JOIN (
        SELECT transaction_id, SUM(amount) as paid
        FROM payments WHERE status = 'completed'
        GROUP BY transaction_id
      ) p ON t.transaction_id = p.transaction_id
      WHERE c.credit_limit > 0
        AND t.total_amount > COALESCE(p.paid, 0)
      GROUP BY c.id, c.name, c.company_name, c.email, c.credit_limit, c.current_balance, c.payment_terms
      HAVING COUNT(t.transaction_id) > 0
      ORDER BY total_outstanding DESC
    `);

    return result.rows;
  }
}

module.exports = POSInvoiceService;
