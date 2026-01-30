/**
 * Receipt Service - Professional POS Receipt Generation
 *
 * Generates professional receipts matching quote PDF styling:
 * - Full-page PDF receipts for printing/email
 * - Compact thermal printer receipts (80mm width)
 * - Digital email receipts with professional HTML template
 * - QR code for transaction lookup
 *
 * Uses enterprise color scheme from PdfService
 */

const PDFDocument = require('pdfkit');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

// QR Code generation - will be dynamically loaded if available
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {
  console.warn('[ReceiptService] qrcode package not installed - QR codes will be disabled');
}

/**
 * Enterprise Color Scheme (matching PdfService)
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
  success: '#10b981',       // Green
  error: '#dc2626',         // Red
  warning: '#f59e0b'        // Amber
};

/**
 * ESC/POS Commands for thermal printers
 */
const ESC_POS = {
  INIT: '\x1B\x40',           // Initialize printer
  BOLD_ON: '\x1B\x45\x01',    // Bold on
  BOLD_OFF: '\x1B\x45\x00',   // Bold off
  DOUBLE_HEIGHT_ON: '\x1B\x21\x10',   // Double height on
  DOUBLE_HEIGHT_OFF: '\x1B\x21\x00',  // Double height off
  DOUBLE_WIDTH_ON: '\x1B\x21\x20',    // Double width on
  DOUBLE_WIDTH_OFF: '\x1B\x21\x00',   // Double width off
  CENTER: '\x1B\x61\x01',     // Center alignment
  LEFT: '\x1B\x61\x00',       // Left alignment
  RIGHT: '\x1B\x61\x02',      // Right alignment
  CUT: '\x1D\x56\x41\x03',    // Partial cut
  FULL_CUT: '\x1D\x56\x00',   // Full cut
  FEED: '\x1B\x64',           // Feed n lines
  LINE_SPACING: '\x1B\x33',   // Set line spacing
  UNDERLINE_ON: '\x1B\x2D\x01',  // Underline on
  UNDERLINE_OFF: '\x1B\x2D\x00'  // Underline off
};

class ReceiptService {
  /**
   * @param {Pool} pool - PostgreSQL connection pool
   * @param {object} cache - Cache module
   * @param {object} config - Configuration options
   */
  constructor(pool, cache, config = {}) {
    this.pool = pool;
    this.cache = cache;

    // Company details for receipt header
    this.companyName = config.companyName || process.env.COMPANY_NAME || 'TeleTime POS';
    this.companyAddress = config.companyAddress || process.env.COMPANY_ADDRESS || '';
    this.companyCity = config.companyCity || process.env.COMPANY_CITY || '';
    this.companyPhone = config.companyPhone || process.env.COMPANY_PHONE || '';
    this.companyEmail = config.companyEmail || process.env.COMPANY_EMAIL || '';
    this.companyWebsite = config.companyWebsite || process.env.COMPANY_WEBSITE || '';
    this.taxNumber = config.taxNumber || process.env.TAX_NUMBER || '';

    // Receipt lookup URL (for QR codes)
    this.receiptBaseUrl = config.receiptBaseUrl || process.env.RECEIPT_URL || 'https://pos.teletime.ca/receipt';

    // SES client for email
    this.sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    this.fromEmail = config.fromEmail || process.env.EMAIL_FROM || 'receipts@teletime.ca';

    // Rebate service integration
    this.includeRebates = config.includeRebates !== false;
  }

  /**
   * Get trade-in information for a transaction
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object>} Trade-in data for receipt
   */
  async getTradeInsForReceipt(transactionId) {
    try {
      const query = `
        SELECT
          tia.id as assessment_id,
          tia.serial_number,
          tia.imei,
          tia.final_value,
          tia.base_value,
          tia.condition_multiplier,
          tia.adjustment_amount,
          tia.condition_notes,
          tia.status,
          tia.assessed_at,
          COALESCE(tip.brand, tia.custom_brand) as brand,
          COALESCE(tip.model, tia.custom_model) as model,
          tip.variant,
          tic.name as category_name,
          ticond.condition_name,
          ticond.condition_code
        FROM trade_in_assessments tia
        LEFT JOIN trade_in_products tip ON tia.trade_in_product_id = tip.id
        LEFT JOIN trade_in_categories tic ON tia.category_id = tic.id
        LEFT JOIN trade_in_conditions ticond ON tia.condition_id = ticond.id
        WHERE tia.transaction_id = $1
          AND tia.status IN ('applied', 'approved', 'pending')
        ORDER BY tia.assessed_at
      `;
      const result = await this.pool.query(query, [transactionId]);

      const tradeIns = result.rows.map(row => ({
        id: row.assessment_id,
        brand: row.brand,
        model: row.model,
        variant: row.variant,
        category: row.category_name,
        condition: row.condition_name,
        conditionCode: row.condition_code,
        serialNumber: row.serial_number,
        imei: row.imei,
        finalValue: parseFloat(row.final_value),
        baseValue: parseFloat(row.base_value),
        conditionMultiplier: parseFloat(row.condition_multiplier),
        adjustment: parseFloat(row.adjustment_amount || 0),
        notes: row.condition_notes,
        status: row.status,
        assessedAt: row.assessed_at
      }));

      const totalCredit = tradeIns.reduce((sum, ti) => sum + ti.finalValue, 0);
      const hasPending = tradeIns.some(ti => ti.status === 'pending');

      return {
        tradeIns,
        totalCredit,
        hasTradeIns: tradeIns.length > 0,
        hasPending,
        count: tradeIns.length
      };
    } catch (error) {
      console.error('[ReceiptService] Error fetching trade-ins:', error);
      return {
        tradeIns: [],
        totalCredit: 0,
        hasTradeIns: false,
        hasPending: false,
        count: 0
      };
    }
  }

  /**
   * Get rebate information for a transaction
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object>} Rebate data for receipt
   */
  async getRebatesForReceipt(transactionId) {
    try {
      // Get applied instant rebates
      const appliedQuery = `
        SELECT
          ar.id,
          ar.rebate_amount,
          ar.product_id,
          r.name as rebate_name,
          r.manufacturer,
          r.rebate_type,
          p.name as product_name
        FROM applied_rebates ar
        JOIN rebates r ON ar.rebate_id = r.id
        LEFT JOIN products p ON ar.product_id = p.id
        WHERE ar.transaction_id = $1
      `;
      const appliedResult = await this.pool.query(appliedQuery, [transactionId]);

      // Get pending mail-in/online rebates (claims created for this transaction)
      const pendingQuery = `
        SELECT
          rc.id as claim_id,
          rc.rebate_amount,
          rc.claim_status,
          r.name as rebate_name,
          r.manufacturer,
          r.rebate_type,
          r.submission_url,
          r.terms_url,
          r.requires_upc,
          r.requires_receipt,
          r.claim_deadline_days,
          t.created_at as transaction_date,
          (t.created_at + (r.claim_deadline_days || ' days')::INTERVAL) as deadline
        FROM rebate_claims rc
        JOIN rebates r ON rc.rebate_id = r.id
        JOIN transactions t ON rc.transaction_id = t.transaction_id
        WHERE rc.transaction_id = $1
          AND r.rebate_type IN ('mail_in', 'online')
      `;
      const pendingResult = await this.pool.query(pendingQuery, [transactionId]);

      // Calculate totals
      const appliedRebates = appliedResult.rows.map(row => ({
        id: row.id,
        name: row.rebate_name,
        manufacturer: row.manufacturer,
        type: row.rebate_type,
        amount: parseFloat(row.rebate_amount),
        productName: row.product_name,
      }));

      const pendingRebates = pendingResult.rows.map(row => ({
        claimId: row.claim_id,
        name: row.rebate_name,
        manufacturer: row.manufacturer,
        type: row.rebate_type,
        amount: parseFloat(row.rebate_amount),
        status: row.claim_status,
        submissionUrl: row.submission_url,
        termsUrl: row.terms_url,
        requiresUpc: row.requires_upc,
        requiresReceipt: row.requires_receipt,
        deadline: row.deadline,
        deadlineDays: row.claim_deadline_days,
      }));

      const totalApplied = appliedRebates.reduce((sum, r) => sum + r.amount, 0);
      const totalPending = pendingRebates.reduce((sum, r) => sum + r.amount, 0);

      return {
        applied: appliedRebates,
        pending: pendingRebates,
        totalApplied,
        totalPending,
        hasRebates: appliedRebates.length > 0 || pendingRebates.length > 0,
      };
    } catch (error) {
      console.error('[ReceiptService] Error fetching rebates:', error);
      return {
        applied: [],
        pending: [],
        totalApplied: 0,
        totalPending: 0,
        hasRebates: false,
      };
    }
  }

  /**
   * Get transaction details for receipt
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object>} Transaction details
   */
  async getTransactionForReceipt(transactionId) {
    // Get transaction with all details
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
        u.first_name || ' ' || u.last_name as cashier_name,
        r.register_name,
        r.location as register_location
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

    const transaction = txnResult.rows[0];

    // Get items with item_id for warranty linking
    const itemsResult = await this.pool.query(`
      SELECT
        item_id,
        product_name,
        product_sku,
        quantity,
        unit_price,
        discount_percent,
        discount_amount,
        tax_amount,
        line_total,
        serial_number
      FROM transaction_items
      WHERE transaction_id = $1
      ORDER BY item_id
    `, [transactionId]);

    // Get warranty purchases linked to transaction items with terms URL
    const warrantiesResult = await this.pool.query(`
      SELECT
        wp.id as warranty_purchase_id,
        wp.transaction_item_id,
        wp.covered_item_id,
        wp.warranty_name,
        wp.warranty_type,
        wp.duration_months,
        wp.warranty_price,
        wp.coverage_start_date,
        wp.coverage_end_date,
        wp.covered_product_name,
        wp.covered_product_serial,
        wp.registration_code,
        wp.status as warranty_status,
        wpr.terms_url,
        wpr.deductible_amount,
        wpr.provider_name
      FROM warranty_purchases wp
      LEFT JOIN warranty_products wpr ON wpr.id = wp.warranty_product_id
      WHERE wp.transaction_id = $1
      ORDER BY wp.id
    `, [transactionId]);

    // Get payments
    const paymentsResult = await this.pool.query(`
      SELECT
        payment_method,
        amount,
        card_brand,
        card_last_four,
        cash_tendered,
        change_given
      FROM payments
      WHERE transaction_id = $1 AND status = 'completed'
      ORDER BY processed_at
    `, [transactionId]);

    // Group items with their warranties
    const groupedItems = this.groupItemsWithWarranties(
      itemsResult.rows,
      warrantiesResult.rows
    );

    // Get rebate information if enabled
    let rebates = { applied: [], pending: [], totalApplied: 0, totalPending: 0, hasRebates: false };
    if (this.includeRebates) {
      rebates = await this.getRebatesForReceipt(transactionId);
    }

    // Get trade-in information
    const tradeIns = await this.getTradeInsForReceipt(transactionId);

    // Get financing information
    const financing = await this.getFinancingForReceipt(transactionId);

    return {
      transaction,
      items: itemsResult.rows,
      groupedItems,
      warranties: warrantiesResult.rows,
      payments: paymentsResult.rows,
      rebates,
      tradeIns,
      financing
    };
  }

  /**
   * Get financing information for receipt
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object|null>} Financing details
   */
  async getFinancingForReceipt(transactionId) {
    try {
      const result = await this.pool.query(`
        SELECT
          t.is_financed,
          fa.application_number,
          fa.status as application_status,
          fg.agreement_number,
          fg.status as agreement_status,
          fg.principal_amount_cents,
          fg.total_amount_cents,
          fg.total_interest_cents,
          fg.monthly_payment_cents,
          fg.term_months,
          fg.apr,
          fg.payments_made,
          fg.payments_remaining,
          fg.first_payment_date,
          fg.next_payment_date,
          fg.final_payment_date,
          fo.name as plan_name,
          fo.provider,
          fo.display_text,
          fo.highlight_text
        FROM transactions t
        LEFT JOIN financing_applications fa ON fa.id = t.financing_application_id
        LEFT JOIN financing_agreements fg ON fg.id = t.financing_agreement_id
        LEFT JOIN financing_options fo ON fo.id = fa.financing_option_id
        WHERE t.transaction_id = $1
          AND t.is_financed = true
      `, [transactionId]);

      if (result.rows.length === 0 || !result.rows[0].is_financed) {
        return null;
      }

      const f = result.rows[0];
      return {
        isFinanced: true,
        applicationNumber: f.application_number,
        agreementNumber: f.agreement_number,
        planName: f.plan_name,
        provider: f.provider,
        principalCents: f.principal_amount_cents,
        principal: f.principal_amount_cents ? f.principal_amount_cents / 100 : 0,
        totalCents: f.total_amount_cents,
        total: f.total_amount_cents ? f.total_amount_cents / 100 : 0,
        interestCents: f.total_interest_cents,
        interest: f.total_interest_cents ? f.total_interest_cents / 100 : 0,
        monthlyPaymentCents: f.monthly_payment_cents,
        monthlyPayment: f.monthly_payment_cents ? f.monthly_payment_cents / 100 : 0,
        termMonths: f.term_months,
        apr: parseFloat(f.apr) || 0,
        paymentsMade: f.payments_made || 0,
        paymentsRemaining: f.payments_remaining || f.term_months,
        firstPaymentDate: f.first_payment_date,
        nextPaymentDate: f.next_payment_date,
        finalPaymentDate: f.final_payment_date,
        displayText: f.display_text,
        highlightText: f.highlight_text,
        status: f.agreement_status || f.application_status
      };
    } catch (error) {
      console.error('[ReceiptService] Get financing error:', error);
      return null;
    }
  }

  /**
   * Group transaction items with their associated warranties
   * @param {Array} items - Transaction items
   * @param {Array} warranties - Warranty purchases
   * @returns {Array} Grouped items with warranties nested under covered products
   */
  groupItemsWithWarranties(items, warranties) {
    // Create a map of covered_item_id -> warranty
    const warrantyMap = new Map();
    const warrantyItemIds = new Set();

    for (const warranty of warranties) {
      if (warranty.covered_item_id) {
        if (!warrantyMap.has(warranty.covered_item_id)) {
          warrantyMap.set(warranty.covered_item_id, []);
        }
        warrantyMap.get(warranty.covered_item_id).push(warranty);
      }
      // Track which transaction items ARE warranties (so we can exclude them from main list)
      if (warranty.transaction_item_id) {
        warrantyItemIds.add(warranty.transaction_item_id);
      }
    }

    // Build grouped items array
    const grouped = [];

    for (const item of items) {
      // Skip items that are warranty line items (they'll be shown under their covered product)
      if (warrantyItemIds.has(item.item_id)) {
        continue;
      }

      const itemWithWarranties = {
        ...item,
        isWarranty: false,
        warranties: warrantyMap.get(item.item_id) || []
      };

      grouped.push(itemWithWarranties);
    }

    return grouped;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount) {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  }

  /**
   * Format date for receipt
   */
  formatDate(date) {
    return new Date(date).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Format short date
   */
  formatShortDate(date) {
    return new Date(date).toLocaleDateString('en-CA');
  }

  /**
   * Generate QR code as PNG buffer for embedding in PDF
   * @param {string} data - Data to encode
   * @returns {Promise<Buffer|null>} PNG buffer or null if unavailable
   */
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
      console.error('[ReceiptService] QR generation error:', err);
      return null;
    }
  }

  /**
   * Generate Professional PDF Receipt (matching quote styling)
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateReceiptPdf(transactionId) {
    const data = await this.getTransactionForReceipt(transactionId);
    const { transaction, items, payments, financing } = data;

    // Generate QR code for transaction lookup
    const qrData = `${this.receiptBaseUrl}/${transaction.transaction_number}`;
    const qrBuffer = await this.generateQRCode(qrData);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50,
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ============================================
      // TOP ACCENT BAR
      // ============================================
      doc.rect(0, 0, 612, 4).fill(COLORS.primary);

      // ============================================
      // HEADER - Company Info & Receipt Badge
      // ============================================

      // Company Name
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor(COLORS.primary)
         .text(this.companyName, 50, 20);

      // Company contact info
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(COLORS.textMuted);

      let headerY = 45;
      if (this.companyAddress) {
        doc.text(this.companyAddress, 50, headerY);
        headerY += 11;
      }
      if (this.companyCity) {
        doc.text(this.companyCity, 50, headerY);
        headerY += 11;
      }
      if (this.companyPhone) {
        doc.text(`Tel: ${this.companyPhone}`, 50, headerY);
        headerY += 11;
      }
      if (this.taxNumber) {
        doc.text(`Tax #: ${this.taxNumber}`, 50, headerY);
      }

      // Receipt Badge Box (right side)
      doc.roundedRect(420, 12, 142, 75, 4)
         .fillAndStroke(COLORS.bgLight, COLORS.border);

      // Receipt badge content
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(COLORS.success)
         .text('RECEIPT', 422, 18, { width: 138, align: 'center' });

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(COLORS.text)
         .text(transaction.transaction_number || 'N/A', 422, 32, { width: 138, align: 'center' });

      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(COLORS.textMuted)
         .text(this.formatDate(transaction.created_at), 422, 50, { width: 138, align: 'center' });

      // Register info
      if (transaction.register_name) {
        doc.text(`${transaction.register_name}`, 422, 62, { width: 138, align: 'center' });
      }
      if (transaction.cashier_name) {
        doc.text(`Cashier: ${transaction.cashier_name}`, 422, 74, { width: 138, align: 'center' });
      }

      // ============================================
      // CUSTOMER INFO CARD (if customer present)
      // ============================================

      let yPos = 100;

      if (transaction.customer_name || transaction.company_name) {
        const cardHeight = 55;
        doc.roundedRect(50, yPos, 340, cardHeight, 4)
           .fillAndStroke(COLORS.bgMuted, COLORS.border);

        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor(COLORS.primaryLight)
           .text('SOLD TO', 60, yPos + 8);

        // Underline
        doc.moveTo(60, yPos + 18)
           .lineTo(120, yPos + 18)
           .strokeColor(COLORS.border)
           .lineWidth(0.5)
           .stroke();

        let custY = yPos + 24;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(COLORS.text)
           .text(transaction.customer_name || transaction.company_name, 60, custY);

        if (transaction.company_name && transaction.customer_name) {
          custY += 12;
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(transaction.company_name, 60, custY);
        }

        yPos += cardHeight + 15;
      } else {
        yPos += 10;
      }

      // ============================================
      // ITEMS TABLE - Enterprise Style
      // ============================================

      const tableTop = yPos;
      const cols = {
        item: { x: 50, w: 280 },
        qty: { x: 330, w: 50 },
        price: { x: 380, w: 70 },
        total: { x: 450, w: 112 }
      };

      // Table header
      doc.rect(50, tableTop, 512, 22).fill(COLORS.primary);

      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('white');

      doc.text('ITEM', cols.item.x + 8, tableTop + 7);
      doc.text('QTY', cols.qty.x, tableTop + 7, { width: cols.qty.w, align: 'center' });
      doc.text('PRICE', cols.price.x, tableTop + 7, { width: cols.price.w, align: 'right' });
      doc.text('TOTAL', cols.total.x, tableTop + 7, { width: cols.total.w, align: 'right' });

      // Table rows - use groupedItems to show warranties under products
      yPos = tableTop + 22;
      const rowHeight = 26;
      const warrantyRowHeight = 22;
      let rowIndex = 0;

      // Use groupedItems if available, otherwise fall back to items
      const displayItems = data.groupedItems || items;

      displayItems.forEach((item) => {
        // Zebra striping
        if (rowIndex % 2 === 0) {
          doc.rect(50, yPos, 512, rowHeight).fill(COLORS.bgLight);
        }

        // Row border
        doc.moveTo(50, yPos + rowHeight)
           .lineTo(562, yPos + rowHeight)
           .strokeColor(COLORS.border)
           .lineWidth(0.5)
           .stroke();

        const rowY = yPos + 7;

        // Item name
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(COLORS.text)
           .text(item.product_name.substring(0, 45), cols.item.x + 8, rowY, { width: cols.item.w - 12 });

        // SKU (smaller, below name)
        if (item.product_sku) {
          doc.fontSize(7)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(item.product_sku, cols.item.x + 8, rowY + 11);
        }

        // Quantity
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(COLORS.text)
           .text(item.quantity.toString(), cols.qty.x, rowY, { width: cols.qty.w, align: 'center' });

        // Unit price
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(COLORS.textSecondary)
           .text(this.formatCurrency(item.unit_price), cols.price.x, rowY, { width: cols.price.w, align: 'right' });

        // Line total
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(COLORS.text)
           .text(this.formatCurrency(item.line_total), cols.total.x, rowY, { width: cols.total.w, align: 'right' });

        // Discount indicator
        if (parseFloat(item.discount_amount) > 0) {
          doc.fontSize(7)
             .font('Helvetica')
             .fillColor(COLORS.error)
             .text(`-${this.formatCurrency(item.discount_amount)} disc`, cols.total.x, rowY + 11, { width: cols.total.w, align: 'right' });
        }

        yPos += rowHeight;
        rowIndex++;

        // Render warranties under this product (indented)
        if (item.warranties && item.warranties.length > 0) {
          for (const warranty of item.warranties) {
            // Warranty row background (slightly different color)
            doc.rect(50, yPos, 512, warrantyRowHeight).fill('#f0f9ff'); // Light blue tint

            // Row border
            doc.moveTo(50, yPos + warrantyRowHeight)
               .lineTo(562, yPos + warrantyRowHeight)
               .strokeColor(COLORS.border)
               .lineWidth(0.5)
               .stroke();

            const wRowY = yPos + 5;

            // Protection shield icon indicator (using text)
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor(COLORS.primaryLight)
               .text('↳', cols.item.x + 12, wRowY);

            // Warranty name (indented)
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(COLORS.primaryLight)
               .text(warranty.warranty_name || 'Protection Plan', cols.item.x + 24, wRowY, { width: cols.item.w - 30 });

            // Coverage period
            const coverageText = warranty.coverage_start_date && warranty.coverage_end_date
              ? `Coverage: ${this.formatShortDate(warranty.coverage_start_date)} - ${this.formatShortDate(warranty.coverage_end_date)}`
              : `${warranty.duration_months} months coverage`;
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor(COLORS.textMuted)
               .text(coverageText, cols.item.x + 24, wRowY + 9);

            // Quantity (always 1 for warranty)
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor(COLORS.textSecondary)
               .text('1', cols.qty.x, wRowY, { width: cols.qty.w, align: 'center' });

            // Price
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor(COLORS.textSecondary)
               .text(this.formatCurrency(warranty.warranty_price), cols.price.x, wRowY, { width: cols.price.w, align: 'right' });

            // Total
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(COLORS.primaryLight)
               .text(this.formatCurrency(warranty.warranty_price), cols.total.x, wRowY, { width: cols.total.w, align: 'right' });

            yPos += warrantyRowHeight;
          }
        }
      });

      // ============================================
      // TOTALS CARD
      // ============================================

      yPos += 15;
      const totalsBoxX = 350;
      const totalsBoxWidth = 212;
      const totalsBoxHeight = 130;

      doc.roundedRect(totalsBoxX, yPos, totalsBoxWidth, totalsBoxHeight, 4)
         .fillAndStroke(COLORS.bgMuted, COLORS.border);

      const labelX = totalsBoxX + 15;
      const valueX = totalsBoxX + totalsBoxWidth - 15;
      let lineY = yPos + 15;

      // Subtotal
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(COLORS.textMuted)
         .text('Subtotal', labelX, lineY);
      doc.fillColor(COLORS.textSecondary)
         .text(this.formatCurrency(transaction.subtotal), valueX - 80, lineY, { width: 80, align: 'right' });

      // Discount
      if (parseFloat(transaction.discount_amount) > 0) {
        lineY += 16;
        doc.fillColor(COLORS.textMuted).text('Discount', labelX, lineY);
        doc.fillColor(COLORS.error)
           .text(`-${this.formatCurrency(transaction.discount_amount)}`, valueX - 80, lineY, { width: 80, align: 'right' });
      }

      // Taxes
      const hst = parseFloat(transaction.hst_amount || 0);
      const gst = parseFloat(transaction.gst_amount || 0);
      const pst = parseFloat(transaction.pst_amount || 0);

      if (hst > 0) {
        lineY += 16;
        doc.fillColor(COLORS.textMuted).text('HST (13%)', labelX, lineY);
        doc.fillColor(COLORS.textSecondary)
           .text(this.formatCurrency(hst), valueX - 80, lineY, { width: 80, align: 'right' });
      }
      if (gst > 0) {
        lineY += 16;
        doc.fillColor(COLORS.textMuted).text('GST (5%)', labelX, lineY);
        doc.fillColor(COLORS.textSecondary)
           .text(this.formatCurrency(gst), valueX - 80, lineY, { width: 80, align: 'right' });
      }
      if (pst > 0) {
        lineY += 16;
        doc.fillColor(COLORS.textMuted).text('PST', labelX, lineY);
        doc.fillColor(COLORS.textSecondary)
           .text(this.formatCurrency(pst), valueX - 80, lineY, { width: 80, align: 'right' });
      }

      // Trade-In Credit (if applicable)
      const { tradeIns } = data;
      if (tradeIns && tradeIns.hasTradeIns) {
        lineY += 16;
        doc.fillColor('#059669').text('Trade-In Credit', labelX, lineY);
        doc.fillColor('#059669')
           .text(`-${this.formatCurrency(tradeIns.totalCredit)}`, valueX - 80, lineY, { width: 80, align: 'right' });
      }

      // Calculate final amount due
      const tradeInCredit = (tradeIns && tradeIns.hasTradeIns) ? tradeIns.totalCredit : 0;
      const amountDue = Math.max(0, parseFloat(transaction.total_amount) - tradeInCredit);

      // TOTAL Box (emphasized)
      lineY += 22;
      doc.roundedRect(totalsBoxX + 10, lineY, totalsBoxWidth - 20, 28, 3)
         .fill(COLORS.primary);

      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('white')
         .text(tradeInCredit > 0 ? 'AMOUNT DUE' : 'TOTAL', labelX, lineY + 8);

      doc.fontSize(13)
         .text(this.formatCurrency(tradeInCredit > 0 ? amountDue : transaction.total_amount), valueX - 85, lineY + 7, { width: 80, align: 'right' });

      // ============================================
      // PAYMENT DETAILS
      // ============================================

      yPos += totalsBoxHeight + 20;

      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(COLORS.text)
         .text('PAYMENT DETAILS', 50, yPos);

      yPos += 14;
      doc.roundedRect(50, yPos, 280, 16 + (payments.length * 20), 4)
         .fillAndStroke(COLORS.bgLight, COLORS.border);

      let paymentY = yPos + 10;

      for (const payment of payments) {
        let methodText = payment.payment_method.toUpperCase();
        if (payment.card_brand && payment.card_last_four) {
          methodText = `${payment.card_brand} ****${payment.card_last_four}`;
        }
        // Handle financing payment method
        if (payment.payment_method === 'financing' && financing) {
          methodText = `FINANCED - ${financing.termMonths} MONTH PLAN`;
        }

        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(COLORS.textSecondary)
           .text(methodText, 60, paymentY);

        doc.font('Helvetica-Bold')
           .fillColor(COLORS.text)
           .text(this.formatCurrency(payment.amount), 250, paymentY, { width: 70, align: 'right' });

        paymentY += 14;

        // Show financing details
        if (payment.payment_method === 'financing' && financing) {
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(`Monthly: ${this.formatCurrency(financing.monthlyPayment)} × ${financing.termMonths} payments`, 70, paymentY);
          paymentY += 12;
          doc.text(`First Payment Due: ${this.formatDate(financing.firstPaymentDate)}`, 70, paymentY);
          paymentY += 12;
          if (financing.apr === 0) {
            doc.fillColor(COLORS.success)
               .text('0% APR Promotional Financing', 70, paymentY);
          } else {
            doc.text(`${financing.apr}% APR`, 70, paymentY);
          }
          paymentY += 14;
        }

        if (parseFloat(payment.cash_tendered) > 0) {
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(`Tendered: ${this.formatCurrency(payment.cash_tendered)}`, 70, paymentY);
          doc.fillColor(COLORS.success)
             .text(`Change: ${this.formatCurrency(payment.change_given || 0)}`, 200, paymentY, { width: 120, align: 'right' });
          paymentY += 14;
        }
      }

      // ============================================
      // QR CODE (for transaction lookup)
      // ============================================

      if (qrBuffer) {
        try {
          doc.image(qrBuffer, 480, yPos, { width: 70, height: 70 });
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text('Scan for digital', 478, yPos + 72, { width: 74, align: 'center' })
             .text('receipt', 478, yPos + 79, { width: 74, align: 'center' });
        } catch (imgErr) {
          console.error('[ReceiptService] QR embed error:', imgErr);
        }
      }

      yPos += Math.max(payments.length * 20 + 30, 100);

      // ============================================
      // FOOTER
      // ============================================

      // Thank you message
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(COLORS.primary)
         .text('Thank you for your purchase!', 50, yPos, { width: 512, align: 'center' });

      yPos += 20;
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(COLORS.textMuted)
         .text('Please keep this receipt for your records.', 50, yPos, { width: 512, align: 'center' });

      yPos += 12;
      doc.text('Returns accepted within 30 days with receipt.', 50, yPos, { width: 512, align: 'center' });

      // ============================================
      // WARRANTY PROTECTION SECTION (if warranties present)
      // ============================================

      const allWarranties = data.warranties || [];
      if (allWarranties.length > 0) {
        yPos += 25;

        // Warranty section header
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(COLORS.primary)
           .text('PROTECTION PLAN COVERAGE', 50, yPos, { width: 512, align: 'center' });

        yPos += 18;

        // List each warranty with coverage details
        for (const warranty of allWarranties) {
          // Warranty box
          doc.roundedRect(50, yPos, 512, 50, 4)
             .fillAndStroke('#f0f9ff', COLORS.border);

          // Warranty name and product
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(COLORS.primaryLight)
             .text(warranty.warranty_name || 'Protection Plan', 60, yPos + 8);

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(`Covers: ${warranty.covered_product_name}`, 60, yPos + 20);

          // Coverage period
          if (warranty.coverage_start_date && warranty.coverage_end_date) {
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(COLORS.text)
               .text(
                 `Coverage: ${this.formatShortDate(warranty.coverage_start_date)} - ${this.formatShortDate(warranty.coverage_end_date)}`,
                 60, yPos + 32
               );
          }

          // Registration code (right side)
          if (warranty.registration_code) {
            doc.fontSize(8)
               .font('Helvetica')
               .fillColor(COLORS.textMuted)
               .text('Registration:', 380, yPos + 8);
            doc.font('Helvetica-Bold')
               .fillColor(COLORS.text)
               .text(warranty.registration_code, 380, yPos + 20);
          }

          // Terms URL
          if (warranty.terms_url) {
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor(COLORS.primaryLight)
               .text(`Terms: ${warranty.terms_url}`, 380, yPos + 34, { width: 170 });
          }

          yPos += 58;
        }

        // General warranty terms note
        yPos += 5;
        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(COLORS.textMuted)
           .text(
             'For warranty claims, contact us with your registration code. Full terms and conditions available at the URL above.',
             50, yPos, { width: 512, align: 'center' }
           );
      }

      // ============================================
      // TRADE-IN SECTION (if trade-ins present)
      // ============================================

      if (tradeIns && tradeIns.hasTradeIns) {
        yPos += 25;

        // Trade-in section header
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('#059669')
           .text('TRADE-IN ITEMS', 50, yPos, { width: 512, align: 'center' });

        yPos += 18;

        // List each trade-in
        for (const tradeIn of tradeIns.tradeIns) {
          // Trade-in box
          doc.roundedRect(50, yPos, 512, 55, 4)
             .fillAndStroke('#ecfdf5', '#a7f3d0'); // Emerald tint

          // Item name (brand + model)
          const itemName = `${tradeIn.brand} ${tradeIn.model}${tradeIn.variant ? ` (${tradeIn.variant})` : ''}`;
          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor('#065f46')
             .text(itemName, 60, yPos + 8, { width: 300 });

          // Category and condition
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(`${tradeIn.category || 'Item'} • Condition: ${tradeIn.condition}`, 60, yPos + 22);

          // Serial/IMEI
          if (tradeIn.serialNumber || tradeIn.imei) {
            const idText = tradeIn.imei ? `IMEI: ${tradeIn.imei}` : `S/N: ${tradeIn.serialNumber}`;
            doc.fontSize(7)
               .fillColor(COLORS.textMuted)
               .text(idText, 60, yPos + 34);
          }

          // Trade-in value (right side)
          doc.fontSize(14)
             .font('Helvetica-Bold')
             .fillColor('#059669')
             .text(this.formatCurrency(tradeIn.finalValue), 420, yPos + 12, { width: 130, align: 'right' });

          doc.fontSize(7)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text('Credit Applied', 420, yPos + 28, { width: 130, align: 'right' });

          yPos += 62;
        }

        // Total trade-in credit
        doc.roundedRect(350, yPos, 212, 30, 4)
           .fill('#059669');

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text('TOTAL TRADE-IN CREDIT', 360, yPos + 9);

        doc.fontSize(12)
           .text(this.formatCurrency(tradeIns.totalCredit), 480, yPos + 8, { width: 70, align: 'right' });

        yPos += 40;

        // Trade-in legal notice
        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(COLORS.textMuted)
           .text(
             `Trade-in items become property of ${this.companyName}. Items must match the assessed condition.`,
             50, yPos, { width: 512, align: 'center' }
           );

        yPos += 15;
      }

      // ============================================
      // MAIL-IN REBATES SECTION (if pending rebates exist)
      // ============================================

      const { rebates } = data;
      if (rebates && rebates.pending && rebates.pending.length > 0) {
        yPos += 25;

        // Rebate section header
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(COLORS.success)
           .text('AVAILABLE REBATES - DON\'T MISS OUT!', 50, yPos, { width: 512, align: 'center' });

        yPos += 5;
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor(COLORS.textMuted)
           .text(`Total potential savings: ${this.formatCurrency(rebates.totalPending)}`, 50, yPos + 10, { width: 512, align: 'center' });

        yPos += 25;

        // List each pending rebate
        for (const rebate of rebates.pending) {
          // Rebate box
          doc.roundedRect(50, yPos, 512, 65, 4)
             .fillAndStroke('#f0fdf4', '#bbf7d0'); // Green tint

          // Rebate name and manufacturer
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(COLORS.success)
             .text(rebate.name, 60, yPos + 8);

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(COLORS.textMuted)
             .text(rebate.manufacturer, 60, yPos + 20);

          // Rebate amount (large, right side)
          doc.fontSize(16)
             .font('Helvetica-Bold')
             .fillColor(COLORS.success)
             .text(this.formatCurrency(rebate.amount), 420, yPos + 10, { width: 130, align: 'right' });

          // Type badge
          const typeLabel = rebate.type === 'mail_in' ? 'MAIL-IN' : 'ONLINE';
          doc.fontSize(7)
             .font('Helvetica-Bold')
             .fillColor(COLORS.primaryLight)
             .text(typeLabel, 420, yPos + 28, { width: 130, align: 'right' });

          // Deadline
          if (rebate.deadline) {
            doc.fontSize(8)
               .font('Helvetica-Bold')
               .fillColor(COLORS.warning)
               .text(`Deadline: ${this.formatShortDate(rebate.deadline)}`, 60, yPos + 35);
          }

          // Requirements
          const requirements = [];
          if (rebate.requiresReceipt) requirements.push('Receipt');
          if (rebate.requiresUpc) requirements.push('UPC Barcode');
          if (requirements.length > 0) {
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor(COLORS.textMuted)
               .text(`Required: ${requirements.join(', ')}`, 60, yPos + 47);
          }

          // Submission URL
          if (rebate.submissionUrl) {
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor(COLORS.primaryLight)
               .text(`Submit at: ${rebate.submissionUrl}`, 250, yPos + 47, { width: 300 });
          }

          yPos += 73;
        }

        // Rebate instructions
        yPos += 5;
        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(COLORS.textMuted)
           .text(
             'Keep this receipt as proof of purchase. Submit rebates before the deadline to receive your savings!',
             50, yPos, { width: 512, align: 'center' }
           );
      }

      // ============================================
      // APPLIED REBATES SUMMARY (if instant rebates were applied)
      // ============================================

      if (rebates && rebates.applied && rebates.applied.length > 0) {
        yPos += 20;
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor(COLORS.success)
           .text(`Instant rebates applied: ${this.formatCurrency(rebates.totalApplied)} saved!`, 50, yPos, { width: 512, align: 'center' });
      }

      // Page footer with contact info
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Footer divider
        doc.moveTo(50, 745)
           .lineTo(562, 745)
           .strokeColor(COLORS.border)
           .lineWidth(0.5)
           .stroke();

        // Contact info
        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(COLORS.textLight);

        const contactParts = [];
        if (this.companyWebsite) contactParts.push(this.companyWebsite);
        if (this.companyPhone) contactParts.push(this.companyPhone);
        if (this.companyEmail) contactParts.push(this.companyEmail);

        doc.text(contactParts.join('  |  '), 50, 752, { width: 512, align: 'center' });

        // Tax number
        if (this.taxNumber) {
          doc.text(`Tax Registration: ${this.taxNumber}`, 50, 762, { width: 512, align: 'center' });
        }
      }

      doc.end();
    });
  }

  /**
   * Generate Thermal Receipt (80mm width, 42 characters)
   * Includes ESC/POS commands for proper formatting
   * @param {number} transactionId - Transaction ID
   * @param {object} options - Options { escPos: boolean }
   * @returns {Promise<string>} Formatted receipt text
   */
  async generateThermalReceipt(transactionId, options = {}) {
    const { escPos = false } = options;
    const data = await this.getTransactionForReceipt(transactionId);
    const { transaction, items, payments } = data;

    const width = 42; // Characters for 80mm thermal
    const lines = [];

    // Helper functions
    const center = (text) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const separator = (char = '-') => char.repeat(width);

    const formatLine = (left, right) => {
      const gap = width - left.length - right.length;
      return left + ' '.repeat(Math.max(1, gap)) + right;
    };

    const doubleLine = () => '='.repeat(width);

    // ESC/POS initialization
    if (escPos) {
      lines.push(ESC_POS.INIT);
      lines.push(ESC_POS.CENTER);
      lines.push(ESC_POS.DOUBLE_HEIGHT_ON);
    }

    // Header
    lines.push(center(this.companyName.toUpperCase()));

    if (escPos) {
      lines.push(ESC_POS.DOUBLE_HEIGHT_OFF);
    }

    if (this.companyAddress) lines.push(center(this.companyAddress));
    if (this.companyCity) lines.push(center(this.companyCity));
    if (this.companyPhone) lines.push(center(`Tel: ${this.companyPhone}`));
    if (this.taxNumber) lines.push(center(`Tax #: ${this.taxNumber}`));
    lines.push('');

    if (escPos) {
      lines.push(ESC_POS.LEFT);
    }

    lines.push(doubleLine());

    // Transaction header
    if (escPos) {
      lines.push(ESC_POS.BOLD_ON);
    }
    lines.push(center('*** SALES RECEIPT ***'));
    if (escPos) {
      lines.push(ESC_POS.BOLD_OFF);
    }

    lines.push(doubleLine());
    lines.push('');

    // Transaction details
    lines.push(`TXN#: ${transaction.transaction_number}`);
    lines.push(`Date: ${this.formatDate(transaction.created_at)}`);
    if (transaction.register_name) {
      lines.push(`Register: ${transaction.register_name}`);
    }
    lines.push(`Cashier: ${transaction.cashier_name || 'N/A'}`);

    if (transaction.customer_name) {
      lines.push(`Customer: ${transaction.customer_name}`);
    }

    lines.push('');
    lines.push(separator());

    // Items - use groupedItems to show warranties under products
    const displayItems = data.groupedItems || items;

    for (const item of displayItems) {
      // Product name (truncate if needed)
      let name = item.product_name;
      if (name.length > width - 2) {
        name = name.substring(0, width - 5) + '...';
      }

      if (escPos) {
        lines.push(ESC_POS.BOLD_ON);
      }
      lines.push(name);
      if (escPos) {
        lines.push(ESC_POS.BOLD_OFF);
      }

      // Quantity x Price = Total
      const qtyPrice = `  ${item.quantity} x ${this.formatCurrency(item.unit_price)}`;
      const total = this.formatCurrency(item.line_total);
      lines.push(formatLine(qtyPrice, total));

      // Discount (if any)
      if (parseFloat(item.discount_amount) > 0) {
        lines.push(`    Discount: -${this.formatCurrency(item.discount_amount)}`);
      }

      // Warranties under this product (indented)
      if (item.warranties && item.warranties.length > 0) {
        for (const warranty of item.warranties) {
          // Warranty name (indented with arrow)
          let wName = warranty.warranty_name || 'Protection Plan';
          if (wName.length > width - 6) {
            wName = wName.substring(0, width - 9) + '...';
          }
          lines.push(`  + ${wName}`);

          // Coverage period or duration
          let coverageText;
          if (warranty.coverage_start_date && warranty.coverage_end_date) {
            const startDate = this.formatShortDate(warranty.coverage_start_date);
            const endDate = this.formatShortDate(warranty.coverage_end_date);
            coverageText = `    ${startDate} - ${endDate}`;
          } else {
            coverageText = `    ${warranty.duration_months}mo coverage`;
          }
          const wPrice = this.formatCurrency(warranty.warranty_price);
          lines.push(formatLine(coverageText, wPrice));
        }
      }
    }

    lines.push(separator());

    // Totals
    lines.push(formatLine('Subtotal:', this.formatCurrency(transaction.subtotal)));

    if (parseFloat(transaction.discount_amount) > 0) {
      lines.push(formatLine('Discount:', `-${this.formatCurrency(transaction.discount_amount)}`));
    }

    // Taxes
    const hst = parseFloat(transaction.hst_amount || 0);
    const gst = parseFloat(transaction.gst_amount || 0);
    const pst = parseFloat(transaction.pst_amount || 0);

    if (hst > 0) lines.push(formatLine('HST (13%):', this.formatCurrency(hst)));
    if (gst > 0) lines.push(formatLine('GST (5%):', this.formatCurrency(gst)));
    if (pst > 0) lines.push(formatLine('PST:', this.formatCurrency(pst)));

    // Trade-in credit
    const { tradeIns } = data;
    if (tradeIns && tradeIns.hasTradeIns) {
      lines.push(formatLine('Trade-In Credit:', `-${this.formatCurrency(tradeIns.totalCredit)}`));
    }

    lines.push(doubleLine());

    // Calculate final amount
    const tradeInCredit = (tradeIns && tradeIns.hasTradeIns) ? tradeIns.totalCredit : 0;
    const amountDue = Math.max(0, parseFloat(transaction.total_amount) - tradeInCredit);

    // Total (emphasized)
    if (escPos) {
      lines.push(ESC_POS.DOUBLE_HEIGHT_ON);
      lines.push(ESC_POS.BOLD_ON);
    }
    lines.push(formatLine(tradeInCredit > 0 ? 'AMOUNT DUE:' : 'TOTAL:', this.formatCurrency(tradeInCredit > 0 ? amountDue : transaction.total_amount)));
    if (escPos) {
      lines.push(ESC_POS.BOLD_OFF);
      lines.push(ESC_POS.DOUBLE_HEIGHT_OFF);
    }

    lines.push(doubleLine());
    lines.push('');

    // Payment details
    if (escPos) {
      lines.push(ESC_POS.BOLD_ON);
    }
    lines.push('PAYMENT:');
    if (escPos) {
      lines.push(ESC_POS.BOLD_OFF);
    }

    for (const payment of payments) {
      let method = payment.payment_method.toUpperCase();
      if (payment.card_last_four) {
        method = `${payment.card_brand || 'CARD'} ****${payment.card_last_four}`;
      }
      lines.push(formatLine(method, this.formatCurrency(payment.amount)));

      if (parseFloat(payment.cash_tendered) > 0) {
        lines.push(formatLine('  Tendered:', this.formatCurrency(payment.cash_tendered)));
        lines.push(formatLine('  CHANGE:', this.formatCurrency(payment.change_given || 0)));
      }
    }

    lines.push('');
    lines.push(separator());

    // Footer
    if (escPos) {
      lines.push(ESC_POS.CENTER);
    }

    lines.push('');
    lines.push(center('Thank you for shopping with us!'));
    lines.push(center('Please come again'));
    lines.push('');

    // Return policy
    lines.push(center('Returns accepted within 30 days'));
    lines.push(center('with original receipt'));
    lines.push('');

    // Warranty protection info (if warranties present)
    const allWarranties = data.warranties || [];
    if (allWarranties.length > 0) {
      if (escPos) {
        lines.push(ESC_POS.LEFT);
      }
      lines.push(separator());
      if (escPos) {
        lines.push(ESC_POS.BOLD_ON);
      }
      lines.push(center('PROTECTION PLANS'));
      if (escPos) {
        lines.push(ESC_POS.BOLD_OFF);
      }
      lines.push(separator());

      for (const warranty of allWarranties) {
        let wName = warranty.warranty_name || 'Protection Plan';
        if (wName.length > width - 2) {
          wName = wName.substring(0, width - 5) + '...';
        }
        lines.push(wName);

        // Registration code
        if (warranty.registration_code) {
          lines.push(`  Code: ${warranty.registration_code}`);
        }

        // Coverage period
        if (warranty.coverage_start_date && warranty.coverage_end_date) {
          lines.push(`  ${this.formatShortDate(warranty.coverage_start_date)} - ${this.formatShortDate(warranty.coverage_end_date)}`);
        }

        // Terms URL (truncated for thermal)
        if (warranty.terms_url) {
          let termsText = warranty.terms_url;
          if (termsText.length > width - 4) {
            termsText = termsText.substring(0, width - 7) + '...';
          }
          lines.push(`  ${termsText}`);
        }
        lines.push('');
      }

      if (escPos) {
        lines.push(ESC_POS.CENTER);
      }
      lines.push(center('For claims, call with your'));
      lines.push(center('registration code.'));
      lines.push('');
    }

    // ============================================
    // TRADE-IN ITEMS SECTION
    // ============================================

    if (tradeIns && tradeIns.hasTradeIns) {
      if (escPos) {
        lines.push(ESC_POS.LEFT);
      }
      lines.push(separator());
      if (escPos) {
        lines.push(ESC_POS.BOLD_ON);
      }
      lines.push(center('TRADE-IN ITEMS'));
      if (escPos) {
        lines.push(ESC_POS.BOLD_OFF);
      }
      lines.push(separator());

      for (const tradeIn of tradeIns.tradeIns) {
        // Item name
        let itemName = `${tradeIn.brand} ${tradeIn.model}`;
        if (tradeIn.variant) {
          itemName += ` (${tradeIn.variant})`;
        }
        if (itemName.length > width - 2) {
          itemName = itemName.substring(0, width - 5) + '...';
        }
        if (escPos) {
          lines.push(ESC_POS.BOLD_ON);
        }
        lines.push(itemName);
        if (escPos) {
          lines.push(ESC_POS.BOLD_OFF);
        }

        // Condition
        lines.push(`  Condition: ${tradeIn.condition}`);

        // Serial/IMEI
        if (tradeIn.imei) {
          lines.push(`  IMEI: ${tradeIn.imei}`);
        } else if (tradeIn.serialNumber) {
          let snText = `  S/N: ${tradeIn.serialNumber}`;
          if (snText.length > width) {
            snText = snText.substring(0, width - 3) + '...';
          }
          lines.push(snText);
        }

        // Credit value
        lines.push(formatLine('  Credit:', this.formatCurrency(tradeIn.finalValue)));
        lines.push('');
      }

      // Total trade-in credit
      if (escPos) {
        lines.push(ESC_POS.BOLD_ON);
      }
      lines.push(formatLine('TOTAL CREDIT:', this.formatCurrency(tradeIns.totalCredit)));
      if (escPos) {
        lines.push(ESC_POS.BOLD_OFF);
      }
      lines.push('');

      // Legal notice
      if (escPos) {
        lines.push(ESC_POS.CENTER);
      }
      lines.push(center('Trade-in items become'));
      lines.push(center(`property of ${this.companyName}.`));
      lines.push('');
    }

    // ============================================
    // MAIL-IN REBATES SECTION
    // ============================================

    const { rebates } = data;
    if (rebates && rebates.pending && rebates.pending.length > 0) {
      if (escPos) {
        lines.push(ESC_POS.LEFT);
      }
      lines.push(separator());
      if (escPos) {
        lines.push(ESC_POS.BOLD_ON);
      }
      lines.push(center('*** AVAILABLE REBATES ***'));
      if (escPos) {
        lines.push(ESC_POS.BOLD_OFF);
      }
      lines.push(separator());

      // Total pending rebates
      lines.push(center(`Save up to ${this.formatCurrency(rebates.totalPending)}!`));
      lines.push('');

      for (const rebate of rebates.pending) {
        // Rebate name (truncate if needed)
        let name = rebate.name;
        if (name.length > width - 2) {
          name = name.substring(0, width - 5) + '...';
        }
        if (escPos) {
          lines.push(ESC_POS.BOLD_ON);
        }
        lines.push(name);
        if (escPos) {
          lines.push(ESC_POS.BOLD_OFF);
        }

        // Manufacturer and amount
        lines.push(formatLine(`  ${rebate.manufacturer}`, this.formatCurrency(rebate.amount)));

        // Type
        const typeLabel = rebate.type === 'mail_in' ? 'Mail-In Rebate' : 'Online Rebate';
        lines.push(`  Type: ${typeLabel}`);

        // Deadline
        if (rebate.deadline) {
          lines.push(`  Deadline: ${this.formatShortDate(rebate.deadline)}`);
        }

        // Requirements
        const reqs = [];
        if (rebate.requiresReceipt) reqs.push('Receipt');
        if (rebate.requiresUpc) reqs.push('UPC');
        if (reqs.length > 0) {
          lines.push(`  Required: ${reqs.join(', ')}`);
        }

        // Submission URL (truncated)
        if (rebate.submissionUrl) {
          let url = rebate.submissionUrl;
          if (url.length > width - 4) {
            url = url.substring(0, width - 7) + '...';
          }
          lines.push(`  ${url}`);
        }

        lines.push('');
      }

      if (escPos) {
        lines.push(ESC_POS.CENTER);
      }
      lines.push(center('Keep receipt for rebate claims!'));
      lines.push('');
    }

    // Applied rebates summary
    if (rebates && rebates.applied && rebates.applied.length > 0) {
      if (escPos) {
        lines.push(ESC_POS.CENTER);
      }
      lines.push(center(`Instant rebates: -${this.formatCurrency(rebates.totalApplied)}`));
      lines.push('');
    }

    // Website
    if (this.companyWebsite) {
      lines.push(center(this.companyWebsite));
    }

    lines.push('');
    lines.push(''); // Extra blank lines before cut

    // Paper cut command
    if (escPos) {
      lines.push(ESC_POS.FEED + '\x05'); // Feed 5 lines
      lines.push(ESC_POS.CUT);
    }

    return lines.join('\n');
  }

  /**
   * Generate ESC/POS binary commands for thermal printer
   * Returns a Buffer suitable for direct printer communication
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<Buffer>} Binary commands
   */
  async generateThermalBinary(transactionId) {
    const text = await this.generateThermalReceipt(transactionId, { escPos: true });
    return Buffer.from(text, 'binary');
  }

  /**
   * Email receipt with professional HTML template
   * @param {number} transactionId - Transaction ID
   * @param {string} email - Email address
   * @returns {Promise<object>} Send result
   */
  async emailReceipt(transactionId, email) {
    if (!email) {
      throw new Error('Email address is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address');
    }

    // Generate PDF for attachment
    const pdfBuffer = await this.generateReceiptPdf(transactionId);
    const data = await this.getTransactionForReceipt(transactionId);
    const { transaction, items, payments } = data;

    // Build items HTML - use groupedItems to show warranties under products
    const displayItems = data.groupedItems || items;
    const itemsHtml = displayItems.map(item => {
      // Main product row
      let html = `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb;">
          <strong style="color: #1f2937;">${item.product_name}</strong>
          ${item.product_sku ? `<br><small style="color: #9ca3af;">${item.product_sku}</small>` : ''}
        </td>
        <td style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #374151;">
          ${item.quantity}
        </td>
        <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #374151;">
          ${this.formatCurrency(item.unit_price)}
        </td>
        <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #1f2937;">
          ${this.formatCurrency(item.line_total)}
        </td>
      </tr>`;

      // Add warranty rows if present
      if (item.warranties && item.warranties.length > 0) {
        for (const warranty of item.warranties) {
          // Build coverage text
          let coverageText;
          if (warranty.coverage_start_date && warranty.coverage_end_date) {
            coverageText = `Coverage: ${this.formatShortDate(warranty.coverage_start_date)} - ${this.formatShortDate(warranty.coverage_end_date)}`;
          } else {
            coverageText = `${warranty.duration_months} months coverage`;
          }

          html += `
      <tr style="background-color: #f0f9ff;">
        <td style="padding: 8px 8px 8px 24px; border-bottom: 1px solid #e5e7eb;">
          <span style="color: #3b82f6;">↳</span>
          <strong style="color: #3b82f6; margin-left: 4px;">${warranty.warranty_name || 'Protection Plan'}</strong>
          <br><small style="color: #6b7280;">${coverageText}</small>
          ${warranty.registration_code ? `<br><small style="color: #9ca3af;">Code: ${warranty.registration_code}</small>` : ''}
        </td>
        <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #6b7280;">
          1
        </td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">
          ${this.formatCurrency(warranty.warranty_price)}
        </td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #3b82f6;">
          ${this.formatCurrency(warranty.warranty_price)}
        </td>
      </tr>`;
        }
      }

      return html;
    }).join('');

    // Build payments HTML
    const paymentsHtml = payments.map(payment => {
      let method = payment.payment_method.toUpperCase();
      if (payment.card_brand && payment.card_last_four) {
        method = `${payment.card_brand} ****${payment.card_last_four}`;
      }
      return `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">${method}</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1f2937;">
            ${this.formatCurrency(payment.amount)}
          </td>
        </tr>
        ${parseFloat(payment.cash_tendered) > 0 ? `
          <tr>
            <td style="padding: 4px 0 4px 20px; color: #9ca3af; font-size: 13px;">Cash Tendered</td>
            <td style="padding: 4px 0; text-align: right; color: #6b7280; font-size: 13px;">
              ${this.formatCurrency(payment.cash_tendered)}
            </td>
          </tr>
          <tr>
            <td style="padding: 4px 0 4px 20px; color: #10b981; font-size: 13px;">Change</td>
            <td style="padding: 4px 0; text-align: right; color: #10b981; font-size: 13px;">
              ${this.formatCurrency(payment.change_given || 0)}
            </td>
          </tr>
        ` : ''}
      `;
    }).join('');

    // Tax breakdown
    const hst = parseFloat(transaction.hst_amount || 0);
    const gst = parseFloat(transaction.gst_amount || 0);
    const pst = parseFloat(transaction.pst_amount || 0);

    let taxHtml = '';
    if (hst > 0) taxHtml += `<tr><td style="padding: 4px 0; color: #6b7280;">HST (13%)</td><td style="text-align: right; color: #374151;">${this.formatCurrency(hst)}</td></tr>`;
    if (gst > 0) taxHtml += `<tr><td style="padding: 4px 0; color: #6b7280;">GST (5%)</td><td style="text-align: right; color: #374151;">${this.formatCurrency(gst)}</td></tr>`;
    if (pst > 0) taxHtml += `<tr><td style="padding: 4px 0; color: #6b7280;">PST</td><td style="text-align: right; color: #374151;">${this.formatCurrency(pst)}</td></tr>`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Receipt from ${this.companyName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6;">

        <!-- Top accent bar -->
        <div style="background-color: #1e40af; height: 4px;"></div>

        <div style="max-width: 600px; margin: 0 auto; padding: 0;">

          <!-- Header -->
          <div style="background-color: #ffffff; padding: 30px; border-bottom: 1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="margin: 0; font-size: 24px; color: #1e40af;">${this.companyName}</h1>
                  <p style="margin: 5px 0 0; color: #6b7280; font-size: 14px;">
                    ${this.companyAddress || ''} ${this.companyCity ? `<br>${this.companyCity}` : ''}
                  </p>
                </td>
                <td style="text-align: right;">
                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; display: inline-block;">
                    <p style="margin: 0 0 5px; font-size: 11px; color: #10b981; font-weight: 600;">RECEIPT</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1f2937;">${transaction.transaction_number}</p>
                    <p style="margin: 5px 0 0; font-size: 12px; color: #6b7280;">${this.formatDate(transaction.created_at)}</p>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Main content -->
          <div style="background-color: #ffffff; padding: 30px;">

            ${transaction.customer_name ? `
            <!-- Customer info -->
            <div style="background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
              <p style="margin: 0 0 5px; font-size: 11px; color: #3b82f6; font-weight: 600;">SOLD TO</p>
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1f2937;">${transaction.customer_name}</p>
              ${transaction.company_name && transaction.company_name !== transaction.customer_name ?
                `<p style="margin: 5px 0 0; font-size: 14px; color: #6b7280;">${transaction.company_name}</p>` : ''}
            </div>
            ` : ''}

            <!-- Items -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
              <thead>
                <tr style="background-color: #1e40af;">
                  <th style="padding: 12px 8px; text-align: left; color: #ffffff; font-size: 12px; font-weight: 600;">ITEM</th>
                  <th style="padding: 12px 8px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 600;">QTY</th>
                  <th style="padding: 12px 8px; text-align: right; color: #ffffff; font-size: 12px; font-weight: 600;">PRICE</th>
                  <th style="padding: 12px 8px; text-align: right; color: #ffffff; font-size: 12px; font-weight: 600;">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
              <tr>
                <td width="60%"></td>
                <td width="40%">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Subtotal</td>
                      <td style="text-align: right; color: #374151;">${this.formatCurrency(transaction.subtotal)}</td>
                    </tr>
                    ${parseFloat(transaction.discount_amount) > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Discount</td>
                      <td style="text-align: right; color: #dc2626;">-${this.formatCurrency(transaction.discount_amount)}</td>
                    </tr>
                    ` : ''}
                    ${taxHtml}
                    ${(data.tradeIns && data.tradeIns.hasTradeIns) ? `
                    <tr>
                      <td style="padding: 8px 0; color: #059669;">Trade-In Credit</td>
                      <td style="text-align: right; color: #059669; font-weight: 600;">-${this.formatCurrency(data.tradeIns.totalCredit)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td colspan="2" style="padding: 10px 0;">
                        <div style="background-color: #1e40af; color: #ffffff; padding: 12px; border-radius: 6px; margin-top: 10px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-weight: 600;">${(data.tradeIns && data.tradeIns.hasTradeIns) ? 'AMOUNT DUE' : 'TOTAL'}</td>
                              <td style="text-align: right; font-size: 18px; font-weight: 700;">
                                ${this.formatCurrency((data.tradeIns && data.tradeIns.hasTradeIns) ? Math.max(0, parseFloat(transaction.total_amount) - data.tradeIns.totalCredit) : transaction.total_amount)}
                              </td>
                            </tr>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Payment details -->
            <div style="background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
              <p style="margin: 0 0 10px; font-size: 12px; font-weight: 600; color: #1f2937;">PAYMENT DETAILS</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${paymentsHtml}
              </table>
            </div>

            <!-- Thank you -->
            <div style="text-align: center; padding: 20px; background-color: #f0fdf4; border-radius: 8px;">
              <h2 style="margin: 0 0 10px; color: #1e40af; font-size: 18px;">Thank you for your purchase!</h2>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Your receipt is attached as a PDF for your records.
              </p>
            </div>

            ${(data.warranties && data.warranties.length > 0) ? `
            <!-- Protection Plans Section -->
            <div style="margin-top: 25px; background-color: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px;">
              <h3 style="margin: 0 0 15px; color: #1e40af; font-size: 16px; font-weight: 600;">
                🛡️ Your Protection Plans
              </h3>
              ${data.warranties.map(w => `
                <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 10px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin: 0 0 5px; font-weight: 600; color: #1f2937;">${w.warranty_name || 'Protection Plan'}</p>
                        <p style="margin: 0 0 5px; font-size: 13px; color: #6b7280;">
                          Covers: ${w.covered_product_name}
                        </p>
                        <p style="margin: 0; font-size: 13px; color: #059669; font-weight: 600;">
                          Coverage: ${w.coverage_start_date ? this.formatShortDate(w.coverage_start_date) : 'TBD'} - ${w.coverage_end_date ? this.formatShortDate(w.coverage_end_date) : 'TBD'}
                        </p>
                      </td>
                      <td style="text-align: right; vertical-align: top;">
                        ${w.registration_code ? `
                          <p style="margin: 0 0 5px; font-size: 11px; color: #9ca3af;">Registration Code</p>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1f2937; font-family: monospace;">${w.registration_code}</p>
                        ` : ''}
                      </td>
                    </tr>
                  </table>
                  ${w.terms_url ? `
                    <p style="margin: 10px 0 0; font-size: 12px;">
                      <a href="${w.terms_url}" style="color: #3b82f6; text-decoration: none;">View Terms & Conditions →</a>
                    </p>
                  ` : ''}
                </div>
              `).join('')}
              <p style="margin: 15px 0 0; font-size: 12px; color: #6b7280; text-align: center;">
                For warranty claims, please contact us with your registration code.
              </p>
            </div>
            ` : ''}

            ${(data.tradeIns && data.tradeIns.hasTradeIns) ? `
            <!-- Trade-In Items Section -->
            <div style="margin-top: 25px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 20px;">
              <h3 style="margin: 0 0 15px; color: #065f46; font-size: 16px; font-weight: 600;">
                ↔️ Trade-In Items
              </h3>
              ${data.tradeIns.tradeIns.map(ti => `
                <div style="background-color: #ffffff; border: 1px solid #d1fae5; border-radius: 6px; padding: 15px; margin-bottom: 10px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin: 0 0 5px; font-weight: 600; color: #065f46;">${ti.brand} ${ti.model}${ti.variant ? ` (${ti.variant})` : ''}</p>
                        <p style="margin: 0 0 5px; font-size: 13px; color: #6b7280;">
                          ${ti.category || 'Item'} • Condition: ${ti.condition}
                        </p>
                        ${ti.imei ? `<p style="margin: 0; font-size: 12px; color: #9ca3af;">IMEI: ${ti.imei}</p>` : ''}
                        ${ti.serialNumber && !ti.imei ? `<p style="margin: 0; font-size: 12px; color: #9ca3af;">S/N: ${ti.serialNumber}</p>` : ''}
                      </td>
                      <td style="text-align: right; vertical-align: top;">
                        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #059669;">${this.formatCurrency(ti.finalValue)}</p>
                        <p style="margin: 5px 0 0; font-size: 11px; color: #9ca3af;">Credit Applied</p>
                      </td>
                    </tr>
                  </table>
                </div>
              `).join('')}
              <div style="background-color: #059669; color: white; padding: 12px 15px; border-radius: 6px; margin-top: 15px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-weight: 600;">TOTAL TRADE-IN CREDIT</td>
                    <td style="text-align: right; font-size: 18px; font-weight: 700;">
                      ${this.formatCurrency(data.tradeIns.totalCredit)}
                    </td>
                  </tr>
                </table>
              </div>
              <p style="margin: 15px 0 0; font-size: 11px; color: #6b7280; text-align: center;">
                Trade-in items become property of ${this.companyName}. Items must match the assessed condition.
              </p>
            </div>
            ` : ''}

            ${(data.rebates && data.rebates.pending && data.rebates.pending.length > 0) ? `
            <!-- Mail-In Rebates Section -->
            <div style="margin-top: 25px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px;">
              <h3 style="margin: 0 0 15px; color: #059669; font-size: 16px; font-weight: 600;">
                💰 Don't Miss Your Rebates!
              </h3>
              <p style="margin: 0 0 15px; font-size: 14px; color: #374151;">
                You have <strong>${this.formatCurrency(data.rebates.totalPending)}</strong> in manufacturer rebates available!
              </p>
              ${data.rebates.pending.map(rebate => `
                <div style="background-color: #ffffff; border: 1px solid #d1fae5; border-radius: 6px; padding: 15px; margin-bottom: 10px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin: 0 0 5px; font-weight: 600; color: #059669;">${rebate.name}</p>
                        <p style="margin: 0 0 5px; font-size: 13px; color: #6b7280;">
                          ${rebate.manufacturer} • ${rebate.type === 'mail_in' ? 'Mail-In' : 'Online'} Rebate
                        </p>
                        ${rebate.deadline ? `
                        <p style="margin: 0; font-size: 13px; color: #d97706; font-weight: 600;">
                          ⏰ Deadline: ${this.formatShortDate(rebate.deadline)}
                        </p>
                        ` : ''}
                      </td>
                      <td style="text-align: right; vertical-align: top;">
                        <p style="margin: 0; font-size: 24px; font-weight: 700; color: #059669;">${this.formatCurrency(rebate.amount)}</p>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #d1fae5;">
                    <p style="margin: 0 0 5px; font-size: 12px; color: #6b7280;">
                      <strong>Required:</strong> ${[rebate.requiresReceipt ? 'Receipt' : null, rebate.requiresUpc ? 'UPC Barcode' : null].filter(Boolean).join(', ') || 'None'}
                    </p>
                    ${rebate.submissionUrl ? `
                      <a href="${rebate.submissionUrl}" style="display: inline-block; margin-top: 8px; padding: 8px 16px; background: #059669; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">
                        Submit Rebate →
                      </a>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
              <p style="margin: 15px 0 0; font-size: 12px; color: #6b7280; text-align: center;">
                Keep this receipt as proof of purchase. Submit your rebates before the deadlines to save!
              </p>
            </div>
            ` : ''}

            ${(data.rebates && data.rebates.applied && data.rebates.applied.length > 0) ? `
            <!-- Applied Rebates Note -->
            <div style="margin-top: 15px; text-align: center; padding: 10px; background-color: #f0fdf4; border-radius: 6px;">
              <p style="margin: 0; font-size: 13px; color: #059669;">
                ✓ Instant rebates applied: <strong>${this.formatCurrency(data.rebates.totalApplied)}</strong> saved!
              </p>
            </div>
            ` : ''}

          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align: center;">
                  <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px;">
                    Returns accepted within 30 days with original receipt.
                  </p>
                  <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                    ${[this.companyPhone, this.companyEmail, this.companyWebsite].filter(Boolean).join(' | ')}
                  </p>
                  ${this.taxNumber ? `<p style="margin: 10px 0 0; color: #9ca3af; font-size: 11px;">Tax Registration: ${this.taxNumber}</p>` : ''}
                </td>
              </tr>
            </table>
          </div>

          <!-- Copyright -->
          <div style="padding: 15px; text-align: center;">
            <p style="margin: 0; color: #9ca3af; font-size: 11px;">
              &copy; ${new Date().getFullYear()} ${this.companyName}. All rights reserved.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    // Encode PDF for raw email with attachment
    const pdfBase64 = pdfBuffer.toString('base64');
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;

    const rawEmail = [
      `From: ${this.companyName} <${this.fromEmail}>`,
      `To: ${email}`,
      `Subject: Your Receipt from ${this.companyName} - ${transaction.transaction_number}`,
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
      `Content-Type: application/pdf; name="Receipt-${transaction.transaction_number}.pdf"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="Receipt-${transaction.transaction_number}.pdf"`,
      '',
      pdfBase64,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const command = new SendEmailCommand({
      FromEmailAddress: this.fromEmail,
      Destination: {
        ToAddresses: [email]
      },
      Content: {
        Raw: {
          Data: Buffer.from(rawEmail)
        }
      }
    });

    try {
      const result = await this.sesClient.send(command);
      return {
        success: true,
        messageId: result.MessageId,
        email,
        transactionNumber: transaction.transaction_number
      };
    } catch (error) {
      console.error('[ReceiptService] Email send error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Get receipt data as JSON (for custom rendering)
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<object>} Receipt data
   */
  async getReceiptData(transactionId) {
    const data = await this.getTransactionForReceipt(transactionId);

    // Map grouped items with warranties
    const groupedItems = (data.groupedItems || data.items).map(item => ({
      name: item.product_name,
      sku: item.product_sku,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
      discountPercent: parseFloat(item.discount_percent || 0),
      discountAmount: parseFloat(item.discount_amount || 0),
      taxAmount: parseFloat(item.tax_amount || 0),
      total: parseFloat(item.line_total),
      serialNumber: item.serial_number,
      // Include warranties grouped under this item
      warranties: (item.warranties || []).map(w => ({
        id: w.warranty_purchase_id,
        name: w.warranty_name,
        type: w.warranty_type,
        durationMonths: w.duration_months,
        price: parseFloat(w.warranty_price),
        coverageStartDate: w.coverage_start_date,
        coverageEndDate: w.coverage_end_date,
        registrationCode: w.registration_code,
        status: w.warranty_status,
        termsUrl: w.terms_url,
        deductible: w.deductible_amount ? parseFloat(w.deductible_amount) : 0,
        provider: w.provider_name
      }))
    }));

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
      transaction: {
        number: data.transaction.transaction_number,
        date: data.transaction.created_at,
        register: data.transaction.register_name,
        registerLocation: data.transaction.register_location,
        cashier: data.transaction.cashier_name,
        customer: data.transaction.customer_name || data.transaction.company_name,
        customerEmail: data.transaction.customer_email,
        customerPhone: data.transaction.customer_phone,
        status: data.transaction.status
      },
      // Grouped items with warranties nested under products
      items: groupedItems,
      totals: {
        subtotal: parseFloat(data.transaction.subtotal),
        discount: parseFloat(data.transaction.discount_amount || 0),
        discountReason: data.transaction.discount_reason,
        hst: parseFloat(data.transaction.hst_amount || 0),
        gst: parseFloat(data.transaction.gst_amount || 0),
        pst: parseFloat(data.transaction.pst_amount || 0),
        taxProvince: data.transaction.tax_province,
        total: parseFloat(data.transaction.total_amount)
      },
      payments: data.payments.map(p => ({
        method: p.payment_method,
        amount: parseFloat(p.amount),
        cardBrand: p.card_brand,
        cardLastFour: p.card_last_four,
        cashTendered: p.cash_tendered ? parseFloat(p.cash_tendered) : null,
        changeGiven: p.change_given ? parseFloat(p.change_given) : null
      })),
      tradeIns: data.tradeIns ? {
        items: data.tradeIns.tradeIns.map(ti => ({
          id: ti.id,
          brand: ti.brand,
          model: ti.model,
          variant: ti.variant,
          category: ti.category,
          condition: ti.condition,
          conditionCode: ti.conditionCode,
          serialNumber: ti.serialNumber,
          imei: ti.imei,
          creditAmount: ti.finalValue
        })),
        totalCredit: data.tradeIns.totalCredit,
        count: data.tradeIns.count,
        hasTradeIns: data.tradeIns.hasTradeIns
      } : null,
      financing: data.financing ? {
        isFinanced: true,
        agreementNumber: data.financing.agreementNumber,
        planName: data.financing.planName,
        provider: data.financing.provider,
        principal: data.financing.principal,
        monthlyPayment: data.financing.monthlyPayment,
        termMonths: data.financing.termMonths,
        apr: data.financing.apr,
        paymentsRemaining: data.financing.paymentsRemaining,
        firstPaymentDate: data.financing.firstPaymentDate,
        displayText: `Financed - ${data.financing.termMonths} Month Plan`,
        paymentSummary: `${data.financing.termMonths} payments of ${this.formatCurrency(data.financing.monthlyPayment)}`,
        termsNote: 'See financing agreement for full terms'
      } : null,
      qrCodeUrl: `${this.receiptBaseUrl}/${data.transaction.transaction_number}`
    };
  }
}

module.exports = ReceiptService;
