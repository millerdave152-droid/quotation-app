/**
 * PDF Generation Service
 *
 * Generates professional quote PDFs using PDFKit
 * Used for bulk email attachments and direct downloads
 */

const PDFDocument = require('pdfkit');
const CustomerService = require('./CustomerService');

/**
 * PDF Error Codes for structured error handling
 */
const PDF_ERROR_CODES = {
  QUOTE_NOT_FOUND: 'PDF_QUOTE_NOT_FOUND',
  GENERATION_ERROR: 'PDF_GENERATION_ERROR',
  TEMPLATE_ERROR: 'PDF_TEMPLATE_ERROR',
  DATA_ERROR: 'PDF_DATA_ERROR',
  ITEMS_ERROR: 'PDF_ITEMS_ERROR',
  SIGNATURE_ERROR: 'PDF_SIGNATURE_ERROR',
  CLV_ERROR: 'PDF_CLV_ERROR',
  BUFFER_ERROR: 'PDF_BUFFER_ERROR'
};

/**
 * Custom PDF Error class for structured error responses
 */
class PdfError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

class PdfService {
  static ERROR_CODES = PDF_ERROR_CODES;
  constructor(pool, cache = null) {
    this.pool = pool;
    this.customerService = new CustomerService(pool, cache || { cacheQuery: async (k, t, fn) => fn() });
  }

  /**
   * Generate a PDF for a quote
   * @param {number} quoteId - The quote ID
   * @param {object} options - Generation options
   * @returns {Promise<Buffer>} - PDF as a buffer
   * @throws {PdfError} - Structured error with code
   */
  async generateQuotePdf(quoteId, options = {}) {
    const { type = 'customer' } = options;
    const startTime = Date.now();

    try {
      // Validate input
      if (!quoteId || isNaN(parseInt(quoteId))) {
        throw new PdfError(
          PDF_ERROR_CODES.DATA_ERROR,
          'Invalid quote ID provided',
          { quoteId }
        );
      }

      // Fetch quote data with customer info from customers table
      let quoteResult;
      try {
        quoteResult = await this.pool.query(`
          SELECT q.*,
            COALESCE(c.name, q.customer_name) as cust_name,
            COALESCE(c.email, q.customer_email) as cust_email,
            COALESCE(c.phone, q.customer_phone) as cust_phone,
            c.company as cust_company,
            COALESCE(c.address, q.customer_address) as cust_address,
            c.city as cust_city,
            c.province as cust_province,
            c.postal_code as cust_postal_code
          FROM quotations q
          LEFT JOIN customers c ON q.customer_id = c.id
          WHERE q.id = $1
        `, [quoteId]);
      } catch (dbErr) {
        throw new PdfError(
          PDF_ERROR_CODES.DATA_ERROR,
          'Failed to fetch quote data from database',
          { quoteId, dbError: dbErr.message }
        );
      }

      if (quoteResult.rows.length === 0) {
        throw new PdfError(
          PDF_ERROR_CODES.QUOTE_NOT_FOUND,
          `Quote with ID ${quoteId} not found`,
          { quoteId }
        );
      }

      const quote = quoteResult.rows[0];

      // Map customer data from joined query to expected field names
      quote.customer_name = quote.cust_name;
      quote.customer_email = quote.cust_email;
      quote.customer_phone = quote.cust_phone;
      quote.customer_company = quote.cust_company;
      quote.customer_address = quote.cust_address;
      quote.customer_city = quote.cust_city;
      quote.customer_province = quote.cust_province;
      quote.customer_postal_code = quote.cust_postal_code;

      // Debug: Log customer data for PDF
      console.log(`[PDF] Customer data for quote ${quoteId}:`, {
        customer_name: quote.customer_name,
        customer_email: quote.customer_email,
        customer_phone: quote.customer_phone,
        customer_company: quote.customer_company,
        customer_address: quote.customer_address,
        customer_city: quote.customer_city,
        customer_province: quote.customer_province,
        customer_postal_code: quote.customer_postal_code,
        sales_rep_name: quote.sales_rep_name,
        customer_id: quote.customer_id
      });

      // Fetch quote items
      let items = [];
      try {
        const itemsResult = await this.pool.query(`
          SELECT qi.*, p.manufacturer, p.model, p.sku, p.description as product_description
          FROM quotation_items qi
          LEFT JOIN products p ON qi.product_id = p.id
          WHERE qi.quotation_id = $1
          ORDER BY qi.id
        `, [quoteId]);
        items = itemsResult.rows;
      } catch (itemsErr) {
        console.error(`[PDF] Error fetching items for quote ${quoteId}:`, itemsErr.message);
        // Continue without items - not fatal
      }

      // Fetch signatures
      let signatures = [];
      try {
        const signaturesResult = await this.pool.query(`
          SELECT id, signature_data, signer_name, signer_email, signature_type, signed_at, legal_text
          FROM quote_signatures
          WHERE quote_id = $1
          ORDER BY signed_at ASC
        `, [quoteId]);
        signatures = signaturesResult.rows;
      } catch (sigErr) {
        console.error(`[PDF] Error fetching signatures for quote ${quoteId}:`, sigErr.message);
        // Continue without signatures - not fatal
      }

      // Fetch CLV data for internal PDFs
      let clvData = null;
      if (type === 'internal' && quote.customer_id) {
        try {
          clvData = await this.customerService.calculateLifetimeValue(quote.customer_id);
        } catch (clvErr) {
          console.error(`[PDF] Error fetching CLV data for quote ${quoteId}:`, clvErr.message);
          // Continue without CLV - not fatal
        }
      }

      // Generate PDF
      const pdfBuffer = await this.createPdfDocument(quote, items, type, signatures, clvData);

      const duration = Date.now() - startTime;
      console.log(`[PDF] Generated PDF for quote ${quoteId} (${type}) in ${duration}ms, size: ${pdfBuffer.length} bytes`);

      return pdfBuffer;

    } catch (error) {
      // If it's already a PdfError, rethrow it
      if (error instanceof PdfError) {
        throw error;
      }

      // Wrap unknown errors
      throw new PdfError(
        PDF_ERROR_CODES.GENERATION_ERROR,
        `Failed to generate PDF for quote ${quoteId}`,
        { quoteId, originalError: error.message }
      );
    }
  }

  /**
   * Create PDF document - Enterprise Layout
   * @param {object} quote - Quote data
   * @param {array} items - Quote items
   * @param {string} type - 'customer' or 'internal'
   * @param {array} signatures - Signature records
   * @param {object} clvData - Customer Lifetime Value data (internal only)
   */
  createPdfDocument(quote, items, type = 'customer', signatures = [], clvData = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'LETTER',
          bufferPages: true
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ============================================
        // ENTERPRISE COLOR SCHEME
        // ============================================
        const colors = {
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

        // Company info (configurable)
        const companyName = process.env.COMPANY_NAME || 'Your Company';
        const companyAddress = process.env.COMPANY_ADDRESS || '123 Business Street';
        const companyCity = process.env.COMPANY_CITY || 'City, Province, Postal';
        const companyPhone = process.env.COMPANY_PHONE || '(555) 123-4567';
        const companyEmail = process.env.COMPANY_EMAIL || 'sales@company.com';
        const companyWebsite = process.env.COMPANY_WEBSITE || 'www.company.com';

        // ============================================
        // HEADER SECTION - ACCENT BAR & LOGO
        // ============================================

        // Top accent bar (full width, 4pt)
        doc.rect(0, 0, 612, 4).fill(colors.primary);

        // Company Name (or Logo placeholder)
        doc.fontSize(22)
           .font('Helvetica-Bold')
           .fillColor(colors.primary)
           .text(companyName, 50, 20);

        // Company contact info (below name)
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text(companyAddress, 50, 45)
           .text(companyCity, 50, 56)
           .text(`${companyPhone}  |  ${companyEmail}`, 50, 67);

        // Quote Badge Box (right side)
        doc.roundedRect(430, 12, 130, 68, 4)
           .fillAndStroke(colors.bgLight, colors.border);

        // Quote badge content
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text('QUOTATION', 432, 18, { width: 126, align: 'center' });

        doc.fontSize(16)
           .font('Helvetica-Bold')
           .fillColor(colors.text)
           .text(quote.quotation_number || 'DRAFT', 432, 32, { width: 126, align: 'center' });

        const createdDate = quote.created_at ? new Date(quote.created_at).toLocaleDateString('en-CA') : 'N/A';
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text(`Date: ${createdDate}`, 432, 52, { width: 126, align: 'center' });

        if (quote.quote_expiry_date) {
          const expiryDate = new Date(quote.quote_expiry_date).toLocaleDateString('en-CA');
          doc.text(`Valid Until: ${expiryDate}`, 432, 63, { width: 126, align: 'center' });
        }

        // Internal PDF marker
        if (type === 'internal') {
          doc.fontSize(7)
             .font('Helvetica-Bold')
             .fillColor(colors.error)
             .text('CONFIDENTIAL - INTERNAL USE ONLY', 50, 82);
        }

        // ============================================
        // CUSTOMER INFORMATION CARD
        // ============================================

        const customerCardY = 95;
        const customerCardHeight = 110;

        // Customer card background
        doc.roundedRect(50, customerCardY, 512, customerCardHeight, 6)
           .fillAndStroke(colors.bgMuted, colors.border);

        // Left Column - BILL TO
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(colors.primaryLight)
           .text('BILL TO', 60, customerCardY + 10);

        // Underline for BILL TO
        doc.moveTo(60, customerCardY + 22)
           .lineTo(150, customerCardY + 22)
           .strokeColor(colors.border)
           .lineWidth(0.5)
           .stroke();

        // Customer Name (always show, with fallback)
        let leftY = customerCardY + 28;
        const customerName = quote.customer_name || quote.name || 'N/A';
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(colors.text)
           .text(customerName, 60, leftY, { width: 220 });

        // Company
        leftY += 13;
        const customerCompany = quote.customer_company || quote.company || '';
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text(customerCompany || '—', 60, leftY, { width: 220 });

        // Address
        leftY += 11;
        const customerAddress = quote.customer_address || quote.address || '';
        doc.text(customerAddress || '—', 60, leftY, { width: 220 });

        // City, Province, Postal
        leftY += 11;
        const city = quote.customer_city || quote.city || '';
        const province = quote.customer_province || quote.province || '';
        const postal = quote.customer_postal_code || quote.postal_code || '';
        const cityLine = [city, province, postal].filter(Boolean).join(', ') || '—';
        doc.text(cityLine, 60, leftY, { width: 220 });

        // Vertical divider
        doc.moveTo(300, customerCardY + 10)
           .lineTo(300, customerCardY + customerCardHeight - 10)
           .strokeColor(colors.border)
           .stroke();

        // Right Column - CONTACT
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(colors.primaryLight)
           .text('CONTACT', 315, customerCardY + 10);

        // Underline for CONTACT
        doc.moveTo(315, customerCardY + 22)
           .lineTo(405, customerCardY + 22)
           .strokeColor(colors.border)
           .lineWidth(0.5)
           .stroke();

        // Contact Name (billing contact person)
        let rightY = customerCardY + 28;
        const contactName = quote.customer_name || quote.name || '';
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor(colors.textLight)
           .text('Name:', 315, rightY);
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(colors.text)
           .text(contactName || 'N/A', 350, rightY, { width: 200 });

        // Email (always show with label)
        rightY += 12;
        const customerEmail = quote.customer_email || quote.email || '';
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor(colors.textLight)
           .text('Email:', 315, rightY);
        doc.fontSize(9)
           .fillColor(customerEmail ? colors.primaryLight : colors.textMuted)
           .text(customerEmail || 'N/A', 350, rightY, { width: 200 });

        // Phone (always show with label)
        rightY += 12;
        const customerPhone = quote.customer_phone || quote.phone || '';
        doc.fontSize(8)
           .fillColor(colors.textLight)
           .text('Phone:', 315, rightY);
        doc.fontSize(9)
           .fillColor(colors.textMuted)
           .text(customerPhone || 'N/A', 350, rightY, { width: 200 });

        // Sales Rep (always show with label)
        rightY += 12;
        const salesRep = quote.sales_rep_name || quote.created_by || '';
        doc.fontSize(8)
           .fillColor(colors.textLight)
           .text('Sales Rep:', 315, rightY);
        doc.fontSize(9)
           .fillColor(colors.textMuted)
           .text(salesRep || 'N/A', 365, rightY, { width: 180 });

        // CLV Section (internal only)
        let yPos = customerCardY + customerCardHeight + 15;

        if (type === 'internal' && clvData) {
          // CLV mini-card
          doc.roundedRect(50, yPos, 512, 30, 4)
             .fillAndStroke('#fef3c7', '#fcd34d');

          doc.fontSize(8)
             .font('Helvetica-Bold')
             .fillColor('#92400e')
             .text('CUSTOMER VALUE:', 60, yPos + 10);

          // Segment badge
          const segmentColors = {
            platinum: '#1e293b',
            gold: '#b45309',
            silver: '#64748b',
            bronze: '#78716c'
          };
          const segmentColor = segmentColors[clvData.segment] || '#6b7280';

          doc.fillColor(segmentColor)
             .roundedRect(150, yPos + 7, 55, 16, 3)
             .fill();

          doc.fillColor('white')
             .fontSize(7)
             .font('Helvetica-Bold')
             .text((clvData.segment || 'N/A').toUpperCase(), 152, yPos + 11, { width: 51, align: 'center' });

          // Metrics
          const lifetimeValue = clvData.metrics?.lifetimeValue || 0;
          const totalTx = clvData.metrics?.totalTransactions || 0;

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#92400e')
             .text(`LTV: $${lifetimeValue.toLocaleString('en-CA', { minimumFractionDigits: 0 })}`, 220, yPos + 10)
             .text(`Transactions: ${totalTx}`, 320, yPos + 10);

          const churnRisk = clvData.engagement?.churnRisk || 'unknown';
          const churnColors = { low: '#15803d', medium: '#ca8a04', high: '#dc2626', unknown: '#6b7280' };
          doc.fillColor(churnColors[churnRisk])
             .text(`Churn Risk: ${churnRisk.charAt(0).toUpperCase() + churnRisk.slice(1)}`, 430, yPos + 10);

          yPos += 40;
        }

        // ============================================
        // ITEMS TABLE - ENTERPRISE STYLE
        // ============================================

        // Ensure table starts below customer card (customer card ends at ~210)
        yPos = Math.max(yPos + 10, 220);
        const tableTop = yPos;

        // Column definitions for detailed table
        // Customer PDF: page width 612, margins 50 each = 512 usable
        // Internal PDF needs extra columns for cost and GP%
        const cols = type === 'internal' ? {
          sku:   { x: 50,  w: 50 },
          mfr:   { x: 100, w: 55 },
          desc:  { x: 155, w: 140 },
          qty:   { x: 295, w: 30 },
          price: { x: 325, w: 55 },
          cost:  { x: 380, w: 55 },
          disc:  { x: 435, w: 35 },
          total: { x: 470, w: 50 },
          gp:    { x: 520, w: 42 }
        } : {
          // Customer PDF columns: 60+65+170+35+60+45+77 = 512 ✓
          sku:   { x: 50,  w: 60 },   // SKU - left align
          mfr:   { x: 110, w: 65 },   // MFR - left align
          desc:  { x: 175, w: 170 },  // DESCRIPTION - left align
          qty:   { x: 345, w: 35 },   // QTY - center align
          price: { x: 380, w: 60 },   // PRICE - right align
          disc:  { x: 440, w: 45 },   // DISC - center align
          total: { x: 485, w: 77 }    // TOTAL - right align
        };

        // Table header
        doc.rect(50, tableTop, 512, 22).fill(colors.primary);

        doc.fontSize(7)
           .font('Helvetica-Bold')
           .fillColor('white');

        doc.text('SKU', cols.sku.x + 3, tableTop + 7);
        doc.text('MFR', cols.mfr.x + 3, tableTop + 7);
        doc.text('DESCRIPTION', cols.desc.x + 3, tableTop + 7);
        doc.text('QTY', cols.qty.x, tableTop + 7, { width: cols.qty.w, align: 'center' });
        doc.text('PRICE', cols.price.x, tableTop + 7, { width: cols.price.w, align: 'right' });

        if (type === 'internal') {
          doc.text('COST', cols.cost.x, tableTop + 7, { width: cols.cost.w, align: 'right' });
        }

        doc.text('DISC', cols.disc.x, tableTop + 7, { width: cols.disc.w, align: 'center' });
        doc.text('TOTAL', cols.total.x, tableTop + 7, { width: cols.total.w, align: 'right' });

        if (type === 'internal') {
          doc.text('GP%', cols.gp.x, tableTop + 7, { width: cols.gp.w, align: 'right' });
        }

        // Table rows
        yPos = tableTop + 22;
        const rowHeight = 28;

        items.forEach((item, index) => {
          // Page break check
          if (yPos > 680) {
            doc.addPage();
            // Redraw header on new page
            doc.rect(0, 0, 612, 4).fill(colors.primary);
            doc.rect(50, 20, 512, 22).fill(colors.primary);
            doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
            doc.text('SKU', cols.sku.x + 3, 27);
            doc.text('MFR', cols.mfr.x + 3, 27);
            doc.text('DESCRIPTION', cols.desc.x + 3, 27);
            doc.text('QTY', cols.qty.x, 27, { width: cols.qty.w, align: 'center' });
            doc.text('PRICE', cols.price.x, 27, { width: cols.price.w, align: 'right' });
            if (type === 'internal') {
              doc.text('COST', cols.cost.x, 27, { width: cols.cost.w, align: 'right' });
            }
            doc.text('DISC', cols.disc.x, 27, { width: cols.disc.w, align: 'center' });
            doc.text('TOTAL', cols.total.x, 27, { width: cols.total.w, align: 'right' });
            if (type === 'internal') {
              doc.text('GP%', cols.gp.x, 27, { width: cols.gp.w, align: 'right' });
            }
            yPos = 42;
          }

          // Zebra striping
          if (index % 2 === 0) {
            doc.rect(50, yPos, 512, rowHeight).fill(colors.bgLight);
          }

          // Row border
          doc.moveTo(50, yPos + rowHeight)
             .lineTo(562, yPos + rowHeight)
             .strokeColor(colors.border)
             .lineWidth(0.5)
             .stroke();

          const rowTextY = yPos + 8;

          // SKU
          doc.fontSize(7)
             .font('Helvetica')
             .fillColor(colors.textMuted)
             .text(item.sku || '-', cols.sku.x + 3, rowTextY, { width: cols.sku.w - 6 });

          // Manufacturer
          doc.text((item.manufacturer || '-').substring(0, 10), cols.mfr.x + 3, rowTextY, { width: cols.mfr.w - 6 });

          // Description (model + description)
          const modelText = item.model || '';
          const descText = item.description || item.product_description || '';
          doc.font('Helvetica-Bold')
             .fontSize(8)
             .fillColor(colors.text)
             .text(modelText.substring(0, 35), cols.desc.x + 3, rowTextY, { width: cols.desc.w - 6 });

          if (descText && modelText) {
            doc.font('Helvetica')
               .fontSize(6)
               .fillColor(colors.textMuted)
               .text(descText.substring(0, 45), cols.desc.x + 3, rowTextY + 10, { width: cols.desc.w - 6 });
          }

          // Quantity (bold, centered)
          doc.font('Helvetica-Bold')
             .fontSize(9)
             .fillColor(colors.text)
             .text((item.quantity || 1).toString(), cols.qty.x, rowTextY, { width: cols.qty.w, align: 'center' });

          // Unit Price
          const unitPrice = (item.unit_price_cents || item.sell_cents || 0) / 100;
          doc.font('Helvetica')
             .fontSize(8)
             .fillColor(colors.textSecondary)
             .text(`$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, cols.price.x, rowTextY, { width: cols.price.w, align: 'right' });

          // Cost (internal only)
          if (type === 'internal') {
            const cost = (item.cost_cents || 0) / 100;
            doc.text(`$${cost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, cols.cost.x, rowTextY, { width: cols.cost.w, align: 'right' });
          }

          // Discount
          const discPercent = item.discount_percent || 0;
          if (discPercent > 0) {
            doc.font('Helvetica-Bold')
               .fillColor(colors.error)
               .text(`${discPercent}%`, cols.disc.x, rowTextY, { width: cols.disc.w, align: 'center' });
          } else {
            doc.font('Helvetica')
               .fillColor(colors.textLight)
               .text('-', cols.disc.x, rowTextY, { width: cols.disc.w, align: 'center' });
          }

          // Line Total (bold)
          const lineTotal = (item.line_total_cents || (item.unit_price_cents * item.quantity)) / 100;
          doc.font('Helvetica-Bold')
             .fontSize(9)
             .fillColor(colors.text)
             .text(`$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, cols.total.x, rowTextY, { width: cols.total.w, align: 'right' });

          // Gross Profit % (internal only)
          if (type === 'internal') {
            const margin = item.margin_percent || 0;
            const gpColor = margin >= 20 ? colors.success : margin >= 10 ? colors.warning : colors.error;
            doc.fontSize(8)
               .fillColor(gpColor)
               .text(`${margin.toFixed(1)}%`, cols.gp.x, rowTextY, { width: cols.gp.w, align: 'right' });
          }

          yPos += rowHeight;
        });

        // ============================================
        // TOTALS SECTION - CARD STYLE
        // ============================================

        yPos += 15;
        const totalsBoxX = 380;
        const totalsBoxWidth = 182;
        const totalsBoxHeight = type === 'internal' ? 130 : 105;

        // Totals card
        doc.roundedRect(totalsBoxX, yPos, totalsBoxWidth, totalsBoxHeight, 4)
           .fillAndStroke(colors.bgMuted, colors.border);

        const labelX = totalsBoxX + 12;
        const valueX = totalsBoxX + totalsBoxWidth - 12;
        let lineY = yPos + 14;

        // Subtotal
        const subtotal = (quote.subtotal_cents || 0) / 100;
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text('Subtotal', labelX, lineY);
        doc.fillColor(colors.textSecondary)
           .text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, valueX - 80, lineY, { width: 80, align: 'right' });

        // Discount
        if (quote.discount_cents && quote.discount_cents > 0) {
          lineY += 15;
          const discount = (quote.discount_cents || 0) / 100;
          const discLabel = quote.discount_percent ? `Discount (${quote.discount_percent}%)` : 'Discount';
          doc.fillColor(colors.textMuted).text(discLabel, labelX, lineY);
          doc.fillColor(colors.error)
             .text(`-$${discount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, valueX - 80, lineY, { width: 80, align: 'right' });
        }

        // Divider
        lineY += 18;
        doc.moveTo(labelX, lineY)
           .lineTo(valueX, lineY)
           .strokeColor(colors.borderMedium)
           .lineWidth(0.5)
           .stroke();

        // Net Amount
        lineY += 8;
        const netAmount = subtotal - ((quote.discount_cents || 0) / 100);
        doc.fillColor(colors.textMuted).text('Net Amount', labelX, lineY);
        doc.fillColor(colors.textSecondary)
           .text(`$${netAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, valueX - 80, lineY, { width: 80, align: 'right' });

        // Tax
        lineY += 15;
        const tax = (quote.tax_cents || 0) / 100;
        const taxLabel = quote.tax_rate ? `HST (${quote.tax_rate}%)` : 'Tax';
        doc.fillColor(colors.textMuted).text(taxLabel, labelX, lineY);
        doc.fillColor(colors.textSecondary)
           .text(`$${tax.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, valueX - 80, lineY, { width: 80, align: 'right' });

        // TOTAL DUE Box (emphasized)
        lineY += 20;
        doc.roundedRect(totalsBoxX + 8, lineY, totalsBoxWidth - 16, 26, 3)
           .fill(colors.primary);

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text('TOTAL DUE', labelX, lineY + 7);

        const total = (quote.total_cents || 0) / 100;
        doc.fontSize(12)
           .text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, valueX - 85, lineY + 6, { width: 80, align: 'right' });

        // Gross Profit (internal only)
        if (type === 'internal' && quote.gross_profit_cents) {
          lineY += 32;
          const grossProfit = (quote.gross_profit_cents || 0) / 100;
          const profitMargin = subtotal > 0 ? ((grossProfit / subtotal) * 100).toFixed(1) : 0;
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(colors.success)
             .text(`Profit: $${grossProfit.toLocaleString('en-CA', { minimumFractionDigits: 2 })} (${profitMargin}%)`, labelX, lineY);
        }

        // ============================================
        // NOTES SECTION
        // ============================================

        yPos += totalsBoxHeight + 20;

        if (quote.notes) {
          if (yPos > 650) {
            doc.addPage();
            doc.rect(0, 0, 612, 4).fill(colors.primary);
            yPos = 30;
          }

          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor(colors.text)
             .text('NOTES', 50, yPos);

          yPos += 14;
          doc.roundedRect(50, yPos, 320, 50, 4)
             .fillAndStroke(colors.bgLight, colors.border);

          doc.fontSize(8)
             .font('Helvetica')
             .fillColor(colors.textMuted)
             .text(quote.notes, 58, yPos + 8, { width: 304, height: 38 });

          yPos += 60;
        }

        // ============================================
        // TERMS & CONDITIONS
        // ============================================

        if (yPos > 620) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(colors.primary);
          yPos = 30;
        }

        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(colors.text)
           .text('TERMS & CONDITIONS', 50, yPos);

        yPos += 14;
        doc.roundedRect(50, yPos, 512, 55, 4)
           .fillAndStroke('#f9fafb', colors.border);

        const defaultTerms = quote.terms || `1. Payment is due within 30 days of invoice date.
2. All prices are in Canadian Dollars (CAD).
3. Quote valid for 14 days from date of issue.
4. Prices and availability subject to change without notice.`;

        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(colors.textMuted)
           .text(defaultTerms, 58, yPos + 8, { width: 496, lineGap: 2 });

        yPos += 65;

        // ============================================
        // SIGNATURE AREA
        // ============================================

        if (yPos > 600) {
          doc.addPage();
          doc.rect(0, 0, 612, 4).fill(colors.primary);
          yPos = 30;
        }

        const sigBoxWidth = 240;
        const sigBoxHeight = 80;

        // Company Signature Box
        doc.roundedRect(50, yPos, sigBoxWidth, sigBoxHeight, 4)
           .stroke(colors.borderMedium);

        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor(colors.primaryLight)
           .text('COMPANY REPRESENTATIVE', 60, yPos + 8);

        // Signature line
        doc.moveTo(60, yPos + 45)
           .lineTo(280, yPos + 45)
           .strokeColor(colors.textLight)
           .lineWidth(0.5)
           .stroke();

        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(colors.textLight)
           .text('Authorized Signature', 60, yPos + 48)
           .text('Name: _____________________________', 60, yPos + 60)
           .text('Date: _____________________________', 60, yPos + 70);

        // Customer Acceptance Box
        doc.roundedRect(320, yPos, sigBoxWidth, sigBoxHeight, 4)
           .stroke(colors.borderMedium);

        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor(colors.success)
           .text('CUSTOMER ACCEPTANCE', 330, yPos + 8);

        // Signature line
        doc.moveTo(330, yPos + 45)
           .lineTo(550, yPos + 45)
           .strokeColor(colors.textLight)
           .lineWidth(0.5)
           .stroke();

        doc.fontSize(7)
           .font('Helvetica')
           .fillColor(colors.textLight)
           .text('Authorized Signature', 330, yPos + 48)
           .text('Name: _____________________________', 330, yPos + 60)
           .text('Date: _____________________________', 330, yPos + 70);

        // Legal text
        yPos += sigBoxHeight + 8;
        doc.fontSize(6)
           .font('Helvetica-Oblique')
           .fillColor(colors.textLight)
           .text('By signing above, customer agrees to the terms and conditions stated in this quotation.', 50, yPos, { width: 512, align: 'center' });

        // Display captured signatures if any
        if (signatures && signatures.length > 0) {
          yPos += 25;

          if (yPos > 600) {
            doc.addPage();
            doc.rect(0, 0, 612, 4).fill(colors.primary);
            yPos = 30;
          }

          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor(colors.text)
             .text('CAPTURED SIGNATURES', 50, yPos);

          yPos += 15;

          signatures.forEach((sig, index) => {
            if (yPos > 700) {
              doc.addPage();
              doc.rect(0, 0, 612, 4).fill(colors.primary);
              yPos = 30;
            }

            const sigX = 50 + (index % 2) * 260;
            if (index % 2 === 0 && index > 0) yPos += 100;

            // Signature box
            doc.roundedRect(sigX, yPos, 240, 90, 4)
               .stroke(colors.border);

            // Badge
            const badgeColor = sig.signature_type === 'staff' ? colors.primaryLight : colors.success;
            const badgeText = sig.signature_type === 'staff' ? 'STAFF' : 'CUSTOMER';

            doc.fillColor(badgeColor)
               .roundedRect(sigX + 5, yPos + 5, 55, 14, 3)
               .fill();

            doc.fillColor('white')
               .fontSize(7)
               .font('Helvetica-Bold')
               .text(badgeText, sigX + 7, yPos + 9, { width: 51, align: 'center' });

            // Signature image
            if (sig.signature_data && sig.signature_data.startsWith('data:image/')) {
              try {
                const base64Data = sig.signature_data.split(',')[1];
                if (base64Data) {
                  const imgBuffer = Buffer.from(base64Data, 'base64');
                  doc.image(imgBuffer, sigX + 10, yPos + 22, {
                    fit: [220, 35],
                    align: 'center'
                  });
                }
              } catch (imgError) {
                console.error('Error embedding signature:', imgError);
              }
            }

            // Signer info
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor(colors.text)
               .text(sig.signer_name || 'Unknown', sigX + 10, yPos + 62);

            const signedDate = sig.signed_at ? new Date(sig.signed_at).toLocaleString('en-CA') : 'N/A';
            doc.fontSize(7)
               .font('Helvetica')
               .fillColor(colors.textMuted)
               .text(signedDate, sigX + 10, yPos + 75);
          });
        }

        // ============================================
        // FOOTER - ALL PAGES
        // ============================================

        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);

          // Footer divider
          doc.moveTo(50, 745)
             .lineTo(562, 745)
             .strokeColor(colors.border)
             .lineWidth(0.5)
             .stroke();

          // Thank you (left)
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor(colors.textMuted)
             .text('Thank you for your business!', 50, 752);

          // Page number (right)
          doc.fontSize(8)
             .fillColor(colors.textLight)
             .text(`Page ${i + 1} of ${pageCount}`, 450, 752, { width: 112, align: 'right' });

          // Contact info (center)
          doc.fontSize(7)
             .fillColor(colors.textLight)
             .text(`${companyWebsite}  |  ${companyPhone}  |  ${companyEmail}`, 50, 765, { width: 512, align: 'center' });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate PDFs for multiple quotes
   * @param {number[]} quoteIds - Array of quote IDs
   * @param {object} options - Generation options
   * @returns {Promise<Array>} - Array of { quoteId, quotation_number, pdfBuffer }
   */
  async generateBulkPdfs(quoteIds, options = {}) {
    const results = [];

    for (const quoteId of quoteIds) {
      try {
        const pdfBuffer = await this.generateQuotePdf(quoteId, options);

        // Get quote number for filename
        const quoteResult = await this.pool.query(
          'SELECT quotation_number FROM quotations WHERE id = $1',
          [quoteId]
        );

        results.push({
          quoteId,
          quotation_number: quoteResult.rows[0]?.quotation_number || `Quote-${quoteId}`,
          pdfBuffer,
          success: true
        });
      } catch (error) {
        console.error(`Error generating PDF for quote ${quoteId}:`, error);
        results.push({
          quoteId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = PdfService;
