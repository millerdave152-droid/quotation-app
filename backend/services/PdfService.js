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

      // Fetch quote items
      let items = [];
      try {
        const itemsResult = await this.pool.query(`
          SELECT qi.*, p.manufacturer, p.model, p.sku, p.description as product_description,
                 p.screen_size_inches, p.color, p.variant_attributes, p.ce_specs,
                 cat.name AS category_name, cat.slug AS category_slug,
                 dept.name AS department_name, dept.slug AS department_slug
          FROM quotation_items qi
          LEFT JOIN products p ON qi.product_id = p.id
          LEFT JOIN categories cat ON p.category_id = cat.id AND cat.is_active = true
          LEFT JOIN categories dept ON cat.parent_id = dept.id AND dept.level = 1
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

      // Fetch revenue feature add-ons (warranties, delivery, rebates, trade-ins, financing)
      let addOns = { warranties: [], delivery: null, rebates: [], tradeIns: [], financing: null };
      try {
        const [warrantiesRes, deliveryRes, rebatesRes, tradeInsRes, financingRes] = await Promise.all([
          this.pool.query('SELECT qw.* FROM quote_warranties qw WHERE qw.quote_id = $1 ORDER BY qw.created_at', [quoteId]),
          this.pool.query('SELECT * FROM quote_delivery WHERE quote_id = $1', [quoteId]),
          this.pool.query('SELECT qr.* FROM quote_rebates qr WHERE qr.quote_id = $1 ORDER BY qr.created_at', [quoteId]),
          this.pool.query('SELECT * FROM quote_trade_ins WHERE quote_id = $1 ORDER BY created_at', [quoteId]),
          this.pool.query('SELECT * FROM quote_financing WHERE quote_id = $1', [quoteId])
        ]);
        addOns.warranties = warrantiesRes.rows;
        addOns.delivery = deliveryRes.rows[0] || null;
        addOns.rebates = rebatesRes.rows;
        addOns.tradeIns = tradeInsRes.rows;
        addOns.financing = financingRes.rows[0] || null;
      } catch (addOnErr) {
        console.error(`[PDF] Error fetching add-ons for quote ${quoteId}:`, addOnErr.message);
      }

      // Fetch tenant branding (fallback to env vars for PDF generation)
      let tenantBranding = {};
      if (quote.tenant_id) {
        try {
          const { rows } = await this.pool.query(
            'SELECT * FROM tenant_settings WHERE tenant_id = $1',
            [quote.tenant_id]
          );
          if (rows.length > 0) tenantBranding = rows[0];
        } catch (e) { /* fallback to env */ }
      }

      // Generate PDF
      const pdfBuffer = await this.createPdfDocument(quote, items, type, signatures, clvData, tenantBranding, addOns);

      const duration = Date.now() - startTime;

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
  createPdfDocument(quote, items, type = 'customer', signatures = [], clvData = null, tenantBranding = {}, addOns = {}) {
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
          textMuted: '#333333',     // Medium gray — darkened for print
          textLight: '#444444',     // Light gray — darkened for print
          bgLight: '#f8fafc',       // Off-white
          bgMuted: '#fafafa',       // Very light
          border: '#e5e7eb',        // Light gray border
          borderMedium: '#888888',  // Medium border — darkened for print
          success: '#10b981',       // Green
          error: '#dc2626',         // Red
          warning: '#f59e0b'        // Amber
        };

        // Company info (tenant branding → env vars → defaults)
        const companyName = tenantBranding.company_name || process.env.COMPANY_NAME || 'TELETIME';
        const companyAddress = tenantBranding.company_address || process.env.COMPANY_ADDRESS || '3125 Wolfedale Road';
        const companyCity = tenantBranding.company_city || process.env.COMPANY_CITY || 'Mississauga, ON L5C 1V8';
        const companyPhone = tenantBranding.company_phone || process.env.COMPANY_PHONE || '(905) 273-5550';
        const companyEmail = tenantBranding.company_email || process.env.COMPANY_EMAIL || 'info@teletime.ca';
        const companyWebsite = tenantBranding.company_website || process.env.COMPANY_WEBSITE || 'www.teletime.ca';

        // ============================================
        // CONSTANTS
        // ============================================
        const fs = require('fs');
        const path = require('path');
        const PAGE_W = 612;
        const MARGIN = 50;
        const CONTENT_W = PAGE_W - MARGIN * 2; // 512
        const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logos', 'teletime-logo-colour-1200.png');
        const LOGO_PATH_FALLBACK = path.join(__dirname, '..', 'assets', 'logos', 'teletime-logo-colour-400.png');
        const actualLogoPath = fs.existsSync(LOGO_PATH) ? LOGO_PATH : (fs.existsSync(LOGO_PATH_FALLBACK) ? LOGO_PATH_FALLBACK : null);
        const hasLogo = !!actualLogoPath;

        const fmtCents = (c) => `$${(c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const fmtDollars = (d) => `$${parseFloat(d || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Build customer-facing description (no model numbers)
        // Priority: (1) customer_description, (2) auto-built from product attributes, (3) category fallback
        const buildCustomerDescription = (item) => {
          if (item.customer_description) return item.customer_description;
          const parts = [];
          if (item.screen_size_inches) parts.push(`${item.screen_size_inches}"`);
          const color = item.color
            || (item.variant_attributes && typeof item.variant_attributes === 'object'
              ? (item.variant_attributes.color || item.variant_attributes.colour || item.variant_attributes.finish)
              : null);
          if (color) parts.push(color);
          if (item.variant_attributes && typeof item.variant_attributes === 'object') {
            const size = item.variant_attributes.size || item.variant_attributes.capacity;
            if (size && !parts.some(p => String(p).includes(String(size)))) parts.push(size);
          }
          if (item.ce_specs && typeof item.ce_specs === 'object') {
            const specs = item.ce_specs;
            const tech = specs.displayTechnology || specs.technology || specs.panel_type;
            if (tech) parts.push(tech);
            const resolution = specs.resolution || specs.display_resolution;
            if (resolution) parts.push(resolution);
            const energyClass = specs.energyClass || specs.energy_rating;
            if (energyClass) parts.push(`Energy: ${energyClass}`);
          }
          const categoryName = item.category_name || item.category || '';
          if (categoryName) parts.push(categoryName);
          if (parts.length === 0 && item.department_name) parts.push(item.department_name);
          return parts.join(' ').trim() || 'Product';
        };

        // Package pricing mode: hide individual line prices, show only bundle total
        const hideLinePrices = !!(quote.hide_line_prices) && type !== 'internal';
        // Hide model numbers from customer PDFs to protect pricing from competitors
        const hideModelNumbers = !!(quote.hide_model_numbers) && type !== 'internal';

        // Helper: measure text height without drawing
        const measureText = (text, fontSize, width, font = 'Helvetica') => {
          doc.save();
          doc.fontSize(fontSize).font(font);
          const h = doc.heightOfString(text || '', { width });
          doc.restore();
          return h;
        };

        // ============================================
        // HEADER SECTION (Sales Order style)
        // ============================================

        // Top accent bar (full width, 4pt)
        doc.rect(0, 0, PAGE_W, 4).fill(colors.primary);

        // Logo or text fallback (same as SalesOrderService)
        if (hasLogo) {
          try {
            doc.image(actualLogoPath, MARGIN, 12, { width: 120 });
          } catch {
            doc.fontSize(26).font('Helvetica-Bold').fillColor(colors.primary)
              .text('Teletime', MARGIN, 16);
          }
        } else {
          doc.fontSize(26).font('Helvetica-Bold').fillColor(colors.primary)
            .text('Teletime', MARGIN, 16);
        }

        // "Teletime Superstores" below logo (matches SalesOrderService line 382)
        doc.fontSize(14).font('Helvetica-Bold').fillColor(colors.primary)
          .text('Teletime Superstores', MARGIN, 44);

        // Tagline (matches SalesOrderService line 387)
        doc.fontSize(8).font('Helvetica-Oblique').fillColor(colors.textMuted)
          .text('TVs-Electronics-Appliances-Furniture', MARGIN, 60);

        // "Quotation" title — right-aligned (matches "Sales Order" at SalesOrderService line 390)
        doc.fontSize(22).font('Helvetica-BoldOblique').fillColor(colors.primary)
          .text('Quotation', MARGIN, 16, { width: CONTENT_W, align: 'right' });

        // Internal PDF marker
        if (type === 'internal') {
          doc.fontSize(7).font('Helvetica-Bold').fillColor(colors.error)
            .text('CONFIDENTIAL - INTERNAL USE ONLY', MARGIN, 36, { width: CONTENT_W, align: 'right' });
        }

        // Centered company info block (matches SalesOrderService lines 394-399)
        const addrBlockY = 72;
        doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted);
        doc.text(`${companyAddress}, ${tenantBranding.company_city || process.env.COMPANY_CITY || 'Mississauga, ON L5C 1V8'}`, MARGIN, addrBlockY, { width: CONTENT_W, align: 'center' });
        doc.text(`TEL: ${companyPhone}`, MARGIN, addrBlockY + 10, { width: CONTENT_W, align: 'center' });
        doc.text(`${companyWebsite}, Email: ${companyEmail}`, MARGIN, addrBlockY + 20, { width: CONTENT_W, align: 'center' });
        doc.font('Helvetica-Bold').text(`HST #: ${tenantBranding.hst_number || '802845461RT0001'}`, MARGIN, addrBlockY + 30, { width: CONTENT_W, align: 'center' });

        // ============================================
        // 3-BOX CUSTOMER INFO (Sales Order style)
        // ============================================
        let yPos = 112;
        const boxGap = 6;
        const boxW = Math.floor((CONTENT_W - boxGap * 2) / 3); // ~170
        const boxPad = 8;
        const boxInnerW = boxW - boxPad * 2;
        const lineH = 10;
        const headerLineH = 16;

        // Build content for each box
        const customerName = quote.customer_name || quote.name || 'N/A';
        const customerCompany = quote.customer_company || quote.company || '';
        const customerAddr = quote.customer_address || quote.address || '';
        const city = quote.customer_city || quote.city || '';
        const province = quote.customer_province || quote.province || '';
        const postal = quote.customer_postal_code || quote.postal_code || '';
        const cityLine = [city, province, postal].filter(Boolean).join(', ');
        const customerEmail = quote.customer_email || quote.email || '';
        const customerPhone = quote.customer_phone || quote.phone || '';
        const salesRep = quote.sales_rep_name || quote.created_by || '';

        // BILL TO lines
        const billLines = [];
        billLines.push({ text: customerName, bold: true });
        if (customerCompany) billLines.push({ text: customerCompany });
        if (customerAddr) billLines.push({ text: customerAddr });
        if (cityLine) billLines.push({ text: cityLine });

        // CONTACT lines
        const contactLines = [];
        contactLines.push({ text: customerName, bold: true });
        contactLines.push({ text: `Tel: ${customerPhone || 'N/A'}` });
        contactLines.push({ text: `Email: ${customerEmail || 'N/A'}` });
        contactLines.push({ text: `Sales Rep: ${salesRep || 'N/A'}` });

        // QUOTE DETAILS lines
        const createdDate = quote.created_at ? new Date(quote.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const expiryDate = (quote.expires_at || quote.quote_expiry_date) ? new Date(quote.expires_at || quote.quote_expiry_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const quoteStatus = (quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1);
        const quoteDetailLines = [
          { label: 'Quote No:', value: quote.quotation_number || quote.quote_number || 'DRAFT', bold: true },
          { label: 'Date:', value: createdDate },
          { label: 'Valid Until:', value: expiryDate },
          { label: 'Status:', value: quoteStatus }
        ];
        const priorityLevel = quote.priority_level || 'standard';
        if (priorityLevel !== 'standard') {
          quoteDetailLines.push({ label: 'Priority:', value: priorityLevel.charAt(0).toUpperCase() + priorityLevel.slice(1), bold: true });
        }

        // Calculate box height
        const billContentH = headerLineH + billLines.length * lineH + boxPad;
        const contactContentH = headerLineH + contactLines.length * lineH + boxPad;
        const detailContentH = headerLineH + quoteDetailLines.length * lineH + boxPad;
        const minBoxH = 80;
        const boxH = Math.max(minBoxH, billContentH, contactContentH, detailContentH) + boxPad;

        const box1X = MARGIN;
        const box2X = MARGIN + boxW + boxGap;
        const box3X = MARGIN + (boxW + boxGap) * 2;

        // Generic box drawing helper
        const drawInfoBox = (x, y, title, lines, isDetails) => {
          doc.roundedRect(x, y, boxW, boxH, 4)
            .fillAndStroke(colors.bgLight, colors.border);

          let cy = y + boxPad;
          doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.primary)
            .text(title, x + boxPad, cy);
          cy += 12;
          doc.moveTo(x + boxPad, cy).lineTo(x + boxW - boxPad, cy)
            .strokeColor(colors.border).lineWidth(0.5).stroke();
          cy += 6;

          if (isDetails) {
            for (const row of lines) {
              doc.fontSize(7).font('Helvetica').fillColor(colors.textLight)
                .text(row.label, x + boxPad, cy, { width: boxInnerW * 0.45, continued: false });
              doc.fontSize(7).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor(row.bold ? '#000000' : colors.textMuted)
                .text(row.value, x + boxPad + boxInnerW * 0.45, cy, { width: boxInnerW * 0.55 });
              cy += lineH;
            }
          } else {
            for (const line of lines) {
              doc.fontSize(9).font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor(line.bold ? '#000000' : colors.textMuted)
                .text(line.text, x + boxPad, cy, { width: boxInnerW });
              cy += lineH;
            }
          }
        };

        drawInfoBox(box1X, yPos, 'BILL TO', billLines, false);
        drawInfoBox(box2X, yPos, 'CONTACT', contactLines, false);
        drawInfoBox(box3X, yPos, 'QUOTE DETAILS', quoteDetailLines, true);

        yPos += boxH + 10;

        // CLV mini-card (internal only)
        if (type === 'internal' && clvData) {
          doc.roundedRect(MARGIN, yPos, CONTENT_W, 30, 4)
             .fillAndStroke('#fef3c7', '#fcd34d');

          doc.fontSize(8).font('Helvetica-Bold').fillColor('#92400e')
             .text('CUSTOMER VALUE:', MARGIN + 10, yPos + 10);

          // Segment badge
          const segmentColors = {
            platinum: '#1e293b', gold: '#b45309', silver: '#64748b', bronze: '#78716c'
          };
          const segmentColor = segmentColors[clvData.segment] || '#6b7280';

          doc.fillColor(segmentColor)
             .roundedRect(150, yPos + 7, 55, 16, 3).fill();

          doc.fillColor('white').fontSize(7).font('Helvetica-Bold')
             .text((clvData.segment || 'N/A').toUpperCase(), 152, yPos + 11, { width: 51, align: 'center' });

          const lifetimeValue = clvData.metrics?.lifetimeValue || 0;
          const totalTx = clvData.metrics?.totalTransactions || 0;

          doc.fontSize(8).font('Helvetica').fillColor('#92400e')
             .text(`LTV: $${lifetimeValue.toLocaleString('en-CA', { minimumFractionDigits: 0 })}`, 220, yPos + 10)
             .text(`Transactions: ${totalTx}`, 320, yPos + 10);

          const churnRisk = clvData.engagement?.churnRisk || 'unknown';
          const churnColors = { low: '#15803d', medium: '#ca8a04', high: '#dc2626', unknown: '#6b7280' };
          doc.fillColor(churnColors[churnRisk])
             .text(`Churn Risk: ${churnRisk.charAt(0).toUpperCase() + churnRisk.slice(1)}`, 430, yPos + 10);

          yPos += 40;
        }

        // ============================================
        // ITEMS TABLE (Sales Order style)
        // ============================================

        // Ensure table starts below customer info
        yPos = Math.max(yPos, 220);

        // Column definitions
        // Customer PDF: QTY(35) DESC(175) BRAND(62) MODEL(80) PRICE(55) DISC(45) AMOUNT(60) = 512
        // Internal PDF adds COST(50) and GP%(42) by narrowing DESC and others
        const cols = type === 'internal' ? {
          qty:    { x: MARGIN,        w: 35 },
          desc:   { x: MARGIN + 35,   w: 133 },
          brand:  { x: MARGIN + 168,  w: 55 },
          model:  { x: MARGIN + 223,  w: 70 },
          price:  { x: MARGIN + 293,  w: 50 },
          cost:   { x: MARGIN + 343,  w: 50 },
          disc:   { x: MARGIN + 393,  w: 35 },
          amount: { x: MARGIN + 428,  w: 42 },
          gp:     { x: MARGIN + 470,  w: 42 }
        } : hideLinePrices && hideModelNumbers ? {
          qty:    { x: MARGIN,        w: 35 },
          desc:   { x: MARGIN + 35,   w: 415 },
          incl:   { x: MARGIN + 450,  w: 62 }
        } : hideLinePrices ? {
          qty:    { x: MARGIN,        w: 35 },
          desc:   { x: MARGIN + 35,   w: 235 },
          brand:  { x: MARGIN + 270,  w: 80 },
          model:  { x: MARGIN + 350,  w: 100 },
          incl:   { x: MARGIN + 450,  w: 62 }
        } : hideModelNumbers ? {
          qty:    { x: MARGIN,        w: 35 },
          desc:   { x: MARGIN + 35,   w: 317 },
          price:  { x: MARGIN + 352,  w: 55 },
          disc:   { x: MARGIN + 407,  w: 45 },
          amount: { x: MARGIN + 452,  w: 60 }
        } : {
          qty:    { x: MARGIN,        w: 35 },
          desc:   { x: MARGIN + 35,   w: 175 },
          brand:  { x: MARGIN + 210,  w: 62 },
          model:  { x: MARGIN + 272,  w: 80 },
          price:  { x: MARGIN + 352,  w: 55 },
          disc:   { x: MARGIN + 407,  w: 45 },
          amount: { x: MARGIN + 452,  w: 60 }
        };

        // Draw table header
        const drawTableHeader = (y) => {
          doc.rect(MARGIN, y, CONTENT_W, 20).fill(colors.primary);
          doc.fontSize(7).font('Helvetica-Bold').fillColor('white');
          doc.text('QTY', cols.qty.x + 4, y + 6, { width: cols.qty.w - 8, align: 'center' });
          doc.text('DESCRIPTION', cols.desc.x + 4, y + 6, { width: cols.desc.w - 8 });
          if (hideLinePrices) {
            if (!hideModelNumbers) {
              doc.text('BRAND', cols.brand.x + 4, y + 6, { width: cols.brand.w - 8 });
              doc.text('MODEL', cols.model.x + 4, y + 6, { width: cols.model.w - 8 });
            }
            doc.text('INCLUDED', cols.incl.x + 2, y + 6, { width: cols.incl.w - 4, align: 'center' });
          } else {
            if (!hideModelNumbers) {
              doc.text('BRAND', cols.brand.x + 4, y + 6, { width: cols.brand.w - 8 });
              doc.text('MODEL', cols.model.x + 4, y + 6, { width: cols.model.w - 8 });
            }
            doc.text('PRICE', cols.price.x + 2, y + 6, { width: cols.price.w - 4, align: 'right' });
            if (type === 'internal') {
              doc.text('COST', cols.cost.x + 2, y + 6, { width: cols.cost.w - 4, align: 'right' });
            }
            doc.text('DISC', cols.disc.x + 2, y + 6, { width: cols.disc.w - 4, align: 'center' });
            doc.text('AMOUNT', cols.amount.x + 2, y + 6, { width: cols.amount.w - 4, align: 'right' });
            if (type === 'internal') {
              doc.text('GP%', cols.gp.x + 2, y + 6, { width: cols.gp.w - 4, align: 'right' });
            }
          }
          return y + 20;
        };

        yPos = drawTableHeader(yPos);

        // Table rows
        items.forEach((item, index) => {
          // Description text components
          const modelText = hideModelNumbers ? '' : (item.model || '');
          const descText = item.description || item.product_description || '';

          const catBreadcrumb = (!hideModelNumbers && item.department_name && item.category_name)
            ? `${item.department_name} > ${item.category_name}`
            : (!hideModelNumbers && item.category_name) ? item.category_name : '';

          // Measure variable row height
          const primaryText = hideModelNumbers ? buildCustomerDescription(item) : (modelText || descText);
          const primaryH = measureText(primaryText, 8, cols.desc.w - 8, 'Helvetica-Bold');
          const secondaryH = (!hideModelNumbers && modelText && descText) ? measureText(descText, 6, cols.desc.w - 8) : 0;
          const catH = catBreadcrumb ? 7 : 0;
          const rowH = Math.max(20, primaryH + secondaryH + catH + 8);

          // Page break check
          if (yPos + rowH > 700) {
            doc.addPage();
            // Redraw accent bar on new page
            doc.rect(0, 0, PAGE_W, 4).fill(colors.primary);
            yPos = MARGIN;
            yPos = drawTableHeader(yPos);
          }

          // Zebra striping
          if (index % 2 === 0) {
            doc.rect(MARGIN, yPos, CONTENT_W, rowH).fill(colors.bgLight);
          }

          // Row divider
          doc.moveTo(MARGIN, yPos + rowH).lineTo(MARGIN + CONTENT_W, yPos + rowH)
            .strokeColor(colors.border).lineWidth(0.75).stroke();

          const textY = yPos + 4;

          // QTY
          doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.text)
            .text((item.quantity || 1).toString(), cols.qty.x + 4, textY, { width: cols.qty.w - 8, align: 'center' });

          // Description column
          let descY = textY;
          if (hideModelNumbers) {
            // Only show description text, no model numbers
            doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.text)
              .text(primaryText, cols.desc.x + 4, descY, { width: cols.desc.w - 8 });
          } else {
            // model bold, product_description below, category breadcrumb italic
            if (modelText) {
              doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.text)
                .text(modelText, cols.desc.x + 4, descY, { width: cols.desc.w - 8 });
              descY += primaryH;
              if (descText) {
                doc.font('Helvetica').fontSize(6).fillColor(colors.textMuted)
                  .text(descText, cols.desc.x + 4, descY, { width: cols.desc.w - 8 });
                descY += secondaryH;
              }
            } else if (descText) {
              doc.font('Helvetica').fontSize(8).fillColor(colors.text)
                .text(descText, cols.desc.x + 4, descY, { width: cols.desc.w - 8 });
              descY += primaryH;
            }
            if (catBreadcrumb) {
              doc.font('Helvetica-Oblique').fontSize(5.5).fillColor(colors.textLight)
                .text(catBreadcrumb, cols.desc.x + 4, descY, { width: cols.desc.w - 8 });
            }

            // BRAND
            doc.fontSize(8).font('Helvetica').fillColor(colors.text)
              .text((item.manufacturer || '-').substring(0, 12), cols.brand.x + 4, textY, { width: cols.brand.w - 8 });

            // MODEL
            doc.fontSize(8).font('Helvetica').fillColor(colors.text)
              .text((item.model || '-'), cols.model.x + 4, textY, { width: cols.model.w - 8 });
          }

          if (hideLinePrices) {
            // Package pricing mode — show "Included"
            doc.font('Helvetica').fontSize(8).fillColor(colors.success)
              .text('Included', cols.incl.x + 2, textY, { width: cols.incl.w - 4, align: 'center' });
          } else {
            // PRICE
            const unitPrice = (item.unit_price_cents || item.sell_cents || 0) / 100;
            doc.fontSize(8).font('Helvetica').fillColor(colors.textSecondary)
              .text(fmtDollars(unitPrice), cols.price.x + 2, textY, { width: cols.price.w - 4, align: 'right' });

            // COST (internal only)
            if (type === 'internal') {
              const cost = (item.cost_cents || 0) / 100;
              doc.text(fmtDollars(cost), cols.cost.x + 2, textY, { width: cols.cost.w - 4, align: 'right' });
            }

            // DISC
            const discPercent = item.discount_percent || 0;
            if (discPercent > 0) {
              doc.font('Helvetica-Bold').fillColor(colors.error)
                .text(`${discPercent}%`, cols.disc.x + 2, textY, { width: cols.disc.w - 4, align: 'center' });
            } else {
              doc.font('Helvetica').fillColor(colors.textLight)
                .text('-', cols.disc.x + 2, textY, { width: cols.disc.w - 4, align: 'center' });
            }

            // AMOUNT
            const lineTotal = (item.line_total_cents || ((item.unit_price_cents || 0) * (item.quantity || 1))) / 100;
            doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.text)
              .text(fmtDollars(lineTotal), cols.amount.x + 2, textY, { width: cols.amount.w - 4, align: 'right' });

            // GP% (internal only)
            if (type === 'internal') {
              const margin = parseFloat(item.margin_percent) || 0;
              const gpColor = margin >= 20 ? colors.success : margin >= 10 ? colors.warning : colors.error;
              doc.fontSize(8).fillColor(gpColor)
                .text(`${margin.toFixed(1)}%`, cols.gp.x + 2, textY, { width: cols.gp.w - 4, align: 'right' });
            }
          }

          yPos += rowH;
        });

        // ============================================
        // ADD-ONS & ADJUSTMENTS (if any exist)
        // ============================================
        const hasAddOns = addOns.warranties?.length > 0 || addOns.delivery || addOns.tradeIns?.length > 0 || addOns.rebates?.length > 0 || addOns.financing;

        if (hasAddOns) {
          // Section header
          if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }
          doc.rect(MARGIN, yPos, CONTENT_W, 18).fill('#f0fdf4');
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#166534')
             .text('ADD-ONS & ADJUSTMENTS', MARGIN + 6, yPos + 5);
          yPos += 18;

          const addOnRowHeight = 22;

          const drawAddOnRow = (label, detail, amount, isCredit = false) => {
            if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }
            doc.rect(MARGIN, yPos, CONTENT_W, addOnRowHeight).fill(isCredit ? '#eff6ff' : '#f0fdf4');
            doc.moveTo(MARGIN, yPos + addOnRowHeight).lineTo(MARGIN + CONTENT_W, yPos + addOnRowHeight).strokeColor(colors.border).lineWidth(0.5).stroke();
            const ry = yPos + 6;
            // QTY column
            doc.fontSize(8).font('Helvetica').fillColor(isCredit ? '#1e40af' : '#166534')
               .text('1', cols.qty.x + 4, ry, { width: cols.qty.w - 8, align: 'center' });
            // Description (spanning available columns)
            const labelWidth = hideModelNumbers
              ? cols.desc.w - 8
              : cols.desc.w + cols.brand.w - 8;
            const detailWidth = hideModelNumbers
              ? cols.desc.w - 8
              : cols.desc.w + cols.brand.w + cols.model.w - 8;
            doc.fontSize(8).font('Helvetica-Bold').fillColor(isCredit ? '#1e40af' : '#166534')
               .text(label, cols.desc.x + 4, ry, { width: labelWidth });
            if (detail) {
              doc.fontSize(6).font('Helvetica').fillColor(colors.textMuted)
                 .text(detail, cols.desc.x + 4, ry + 10, { width: detailWidth });
            }
            // Price column
            if (!hideLinePrices) {
              doc.fontSize(8).font('Helvetica').fillColor(isCredit ? '#2563eb' : colors.text)
                 .text(fmtCents(Math.abs(amount)), cols.price.x + 2, ry, { width: cols.price.w - 4, align: 'right' });
              // Disc column
              doc.fontSize(8).font('Helvetica').fillColor(colors.textLight)
                 .text('-', cols.disc.x + 2, ry, { width: cols.disc.w - 4, align: 'center' });
              // Amount column (aligned with table)
              doc.fontSize(9).font('Helvetica-Bold').fillColor(isCredit ? '#2563eb' : colors.text)
                 .text((isCredit ? '-' : '+') + fmtCents(Math.abs(amount)), cols.amount.x + 2, ry, { width: cols.amount.w - 4, align: 'right' });
            }
            yPos += addOnRowHeight;
          };

          // Warranty rows
          (addOns.warranties || []).forEach(w => {
            const productLabel = w.covered_product_model
              ? `For: ${w.covered_product_manufacturer || ''} ${w.covered_product_model}`.trim()
              : (w.model ? `For: ${w.manufacturer || ''} ${w.model}`.trim() : '');
            const warnName = w.product_name || w.warranty_type || 'Extended Warranty';
            drawAddOnRow(
              `${warnName}${w.warranty_years ? ` (${w.warranty_years} ${w.warranty_years === 1 ? 'Year' : 'Years'})` : ''}`,
              [productLabel, w.provider ? `Provider: ${w.provider}` : ''].filter(Boolean).join(' · '),
              w.warranty_cost_cents || 0
            );
          });

          // Delivery row
          if (addOns.delivery) {
            const del = addOns.delivery;
            const totalDeliveryCents = del.total_delivery_cost_cents || del.delivery_cost_cents || 0;
            const detail = [
              del.delivery_type,
              del.delivery_date ? `Date: ${new Date(del.delivery_date).toLocaleDateString('en-CA')}` : null,
              del.delivery_time_slot,
              del.delivery_address ? `Addr: ${del.delivery_address}` : null
            ].filter(Boolean).join(' · ');
            drawAddOnRow('Delivery & Installation', detail, totalDeliveryCents);
          }

          // Trade-in rows (credits)
          (addOns.tradeIns || []).forEach(t => {
            const detail = [t.brand, t.model, t.condition ? `${t.condition} condition` : null].filter(Boolean).join(' · ');
            drawAddOnRow(
              `Trade-In: ${t.item_type || t.product_description || 'Item'}`,
              detail,
              t.trade_in_value_cents || 0,
              true
            );
          });

          // Rebate rows (credits)
          (addOns.rebates || []).forEach(r => {
            const detail = [r.manufacturer, r.rebate_type === 'instant' ? 'Instant Rebate' : 'Mail-In Rebate'].filter(Boolean).join(' · ');
            drawAddOnRow(
              r.rebate_name || 'Manufacturer Rebate',
              detail,
              r.rebate_amount_cents || 0,
              true
            );
          });

          // Financing info (light blue box, 38pt tall)
          if (addOns.financing) {
            const fin = addOns.financing;
            if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }

            doc.roundedRect(MARGIN, yPos, CONTENT_W, 38, 3)
              .fillAndStroke('#f0f7ff', '#93c5fd');

            doc.fontSize(7).font('Helvetica-Bold').fillColor('#1e40af')
              .text('FINANCING TERMS', MARGIN + 8, yPos + 5);

            const aprVal = fin.apr_percent != null ? parseFloat(fin.apr_percent) : (fin.interest_rate || 0);
            const providerName = (fin.provider || 'Flexiti').charAt(0).toUpperCase() + (fin.provider || 'flexiti').slice(1);

            doc.fontSize(7).font('Helvetica').fillColor(colors.text);
            const finY = yPos + 16;
            doc.text(`Provider: ${providerName}`, MARGIN + 8, finY);
            doc.text(`Plan: ${fin.plan_name || 'N/A'}`, MARGIN + 140, finY);
            doc.text(`Term: ${fin.term_months || 0} months`, MARGIN + 300, finY);
            doc.text(`Rate: ${aprVal.toFixed(1)}%`, MARGIN + 390, finY);
            if (fin.monthly_payment_cents) {
              doc.font('Helvetica-Bold')
                .text(`Monthly: ${fmtCents(fin.monthly_payment_cents)}`, MARGIN + 440, finY);
            }

            yPos += 44;
          }
        }

        // ============================================
        // TOTALS SECTION (Sales Order style — right-aligned, no card)
        // ============================================

        yPos += 10;

        // Page break if needed
        if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }

        // Align totals with the items table AMOUNT column
        const tableRightEdge = cols.amount.x + cols.amount.w; // 512 (MARGIN + 452 + 60)
        const totValW = 80;
        const totValX = tableRightEdge - totValW; // right-align values to table edge
        const totLblX = totValX - 130; // labels to the left of values
        let tY = yPos;

        // Subtotal
        const subtotal = (quote.subtotal_cents || 0) / 100;
        const subtotalLabel = hideLinePrices ? 'Package Price' : 'Subtotal';
        doc.fontSize(9).font('Helvetica').fillColor(colors.textMuted)
          .text(subtotalLabel, totLblX, tY);
        doc.fillColor(colors.text)
          .text(fmtDollars(subtotal), totValX, tY, { width: totValW, align: 'right' });

        // Discount (red, if > 0)
        if (quote.discount_cents && quote.discount_cents > 0) {
          tY += 14;
          const discount = (quote.discount_cents || 0) / 100;
          const discLabel = quote.discount_percent ? `Discount (${quote.discount_percent}%)` : 'Discount';
          doc.fillColor(colors.textMuted).text(discLabel, totLblX, tY);
          doc.fillColor(colors.error)
             .text(`-${fmtDollars(discount)}`, totValX, tY, { width: totValW, align: 'right' });
        }

        // Add-on totals
        const warrantyTotal = (addOns.warranties || []).reduce((s, w) => s + (w.warranty_cost_cents || 0), 0);
        const deliveryTotal = addOns.delivery ? (addOns.delivery.total_delivery_cost_cents || addOns.delivery.delivery_cost_cents || 0) : 0;
        const tradeInTotal = (addOns.tradeIns || []).reduce((s, t) => s + (t.trade_in_value_cents || 0), 0);
        const rebateTotal = (addOns.rebates || []).reduce((s, r) => s + (r.rebate_amount_cents || 0), 0);

        if (warrantyTotal > 0) {
          tY += 14;
          doc.fillColor('#166534').font('Helvetica').fontSize(9)
            .text('Warranties', totLblX, tY);
          doc.text(`+${fmtCents(warrantyTotal)}`, totValX, tY, { width: totValW, align: 'right' });
        }
        if (deliveryTotal > 0) {
          tY += 14;
          doc.fillColor('#166534')
            .text('Delivery', totLblX, tY);
          doc.text(`+${fmtCents(deliveryTotal)}`, totValX, tY, { width: totValW, align: 'right' });
        }
        if (tradeInTotal > 0) {
          tY += 14;
          doc.fillColor('#2563eb')
            .text('Trade-In Credit', totLblX, tY);
          doc.text(`-${fmtCents(tradeInTotal)}`, totValX, tY, { width: totValW, align: 'right' });
        }
        if (rebateTotal > 0) {
          tY += 14;
          doc.fillColor('#2563eb')
            .text('Rebates', totLblX, tY);
          doc.text(`-${fmtCents(rebateTotal)}`, totValX, tY, { width: totValW, align: 'right' });
        }

        // EHF (brown #92400e bold)
        const ehfCents = quote.ehf_cents || 0;
        if (ehfCents > 0) {
          tY += 14;
          doc.fillColor('#92400e').font('Helvetica-Bold')
            .text('Env. Handling Fee (EHF)', totLblX, tY);
          doc.text(fmtCents(ehfCents), totValX, tY, { width: totValW, align: 'right' });
          doc.font('Helvetica');
        }

        // Tax
        tY += 14;
        const tax = (quote.tax_cents || 0) / 100;
        const taxLabel = quote.tax_rate ? `GST/HST ${quote.tax_rate}%` : 'Tax';
        doc.fillColor(colors.textMuted).font('Helvetica').fontSize(9)
          .text(taxLabel, totLblX, tY);
        doc.fillColor(colors.text)
          .text(fmtDollars(tax), totValX, tY, { width: totValW, align: 'right' });

        // Divider line
        tY += 18;
        doc.moveTo(totLblX, tY).lineTo(totValX + totValW, tY)
          .strokeColor(colors.borderMedium).lineWidth(0.75).stroke();

        // TOTAL (12pt Bold black)
        tY += 8;
        const total = (quote.total_cents || 0) / 100;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
          .text('TOTAL', totLblX, tY);
        doc.text(fmtDollars(total), totValX - 20, tY, { width: totValW + 20, align: 'right' });

        // Profit (internal only, green)
        if (type === 'internal' && quote.gross_profit_cents) {
          tY += 18;
          const grossProfit = (quote.gross_profit_cents || 0) / 100;
          const profitMargin = subtotal > 0 ? ((grossProfit / subtotal) * 100).toFixed(1) : 0;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.success)
            .text(`Profit: ${fmtDollars(grossProfit)} (${profitMargin}%)`, totLblX, tY);
        }

        yPos = tY + 15;

        // ============================================
        // NOTES SECTION
        // ============================================

        if (quote.notes) {
          if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
            .text('NOTES', MARGIN, yPos);

          yPos += 14;
          const notesHeight = doc.heightOfString(quote.notes, { width: CONTENT_W - 16, fontSize: 8 }) + 16;
          doc.roundedRect(MARGIN, yPos, CONTENT_W, notesHeight, 4)
             .fillAndStroke(colors.bgLight, colors.border);

          doc.fontSize(8).font('Helvetica').fillColor(colors.textMuted)
            .text(quote.notes, MARGIN + 8, yPos + 8, { width: CONTENT_W - 16 });

          yPos += notesHeight + 10;
        }

        // ============================================
        // TERMS & CONDITIONS (Sales Order comprehensive terms)
        // ============================================

        if (yPos > 680) { doc.addPage(); doc.rect(0, 0, PAGE_W, 4).fill(colors.primary); yPos = MARGIN; }

        // Use Sales Order comprehensive terms UNLESS quote.terms is set and differs from default
        const useComprehensiveTerms = !quote.terms || (quote.terms || '').toLowerCase().startsWith('payment due within');

        const comprehensiveTerms = [
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

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
          .text('TERMS & CONDITIONS', MARGIN, yPos);
        yPos += 10;

        const footerZoneY = 726;

        if (useComprehensiveTerms) {
          doc.fontSize(5).font('Helvetica').fillColor(colors.textLight);
          for (const term of comprehensiveTerms) {
            if (yPos >= footerZoneY) break;
            const termH = measureText(term, 5, CONTENT_W);
            doc.text(term, MARGIN, yPos, { width: CONTENT_W, height: termH + 1, lineBreak: true, ellipsis: true });
            yPos += termH + 1;
          }
        } else {
          // Custom terms from quote
          doc.fontSize(5).font('Helvetica').fillColor(colors.textLight);
          const termsH = measureText(quote.terms, 5, CONTENT_W);
          if (yPos + termsH < footerZoneY) {
            doc.text(quote.terms, MARGIN, yPos, { width: CONTENT_W, lineGap: 1 });
            yPos += termsH + 4;
          }
        }

        yPos += 6;

        // ============================================
        // SIGNATURE AREA
        // ============================================

        if (yPos > 600) {
          doc.addPage();
          doc.rect(0, 0, PAGE_W, 4).fill(colors.primary);
          yPos = MARGIN;
        }

        const sigBoxWidth = 240;
        const sigBoxHeight = 80;

        // Company Signature Box (blue)
        doc.roundedRect(MARGIN, yPos, sigBoxWidth, sigBoxHeight, 4)
           .stroke(colors.borderMedium);

        doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.primaryLight)
          .text('COMPANY REPRESENTATIVE', MARGIN + 10, yPos + 8);

        doc.moveTo(MARGIN + 10, yPos + 45).lineTo(MARGIN + sigBoxWidth - 10, yPos + 45)
           .strokeColor('#000000').lineWidth(1.5).stroke();

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
          .text('Authorized Signature', MARGIN + 10, yPos + 48)
          .text('Print Name: ________________________', MARGIN + 10, yPos + 60)
          .text('Date: _____________________________', MARGIN + 10, yPos + 70);

        // Customer Acceptance Box (green)
        const custSigX = MARGIN + CONTENT_W - sigBoxWidth;
        doc.roundedRect(custSigX, yPos, sigBoxWidth, sigBoxHeight, 4)
           .stroke(colors.borderMedium);

        doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.success)
          .text('CUSTOMER ACCEPTANCE', custSigX + 10, yPos + 8);

        doc.moveTo(custSigX + 10, yPos + 45).lineTo(custSigX + sigBoxWidth - 10, yPos + 45)
           .strokeColor('#000000').lineWidth(1.5).stroke();

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
          .text('Authorized Signature', custSigX + 10, yPos + 48)
          .text('Print Name: ________________________', custSigX + 10, yPos + 60)
          .text('Date: _____________________________', custSigX + 10, yPos + 70);

        // Legal text
        yPos += sigBoxHeight + 8;
        doc.fontSize(6).font('Helvetica-Oblique').fillColor(colors.textLight)
          .text('By signing above, customer agrees to the terms and conditions stated in this quotation.', MARGIN, yPos, { width: CONTENT_W, align: 'center' });

        // Display captured signatures if any
        if (signatures && signatures.length > 0) {
          yPos += 25;

          if (yPos > 600) {
            doc.addPage();
            doc.rect(0, 0, PAGE_W, 4).fill(colors.primary);
            yPos = MARGIN;
          }

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
            .text('CAPTURED SIGNATURES', MARGIN, yPos);

          yPos += 15;

          signatures.forEach((sig, index) => {
            if (yPos > 700) {
              doc.addPage();
              doc.rect(0, 0, PAGE_W, 4).fill(colors.primary);
              yPos = MARGIN;
            }

            const sigX = MARGIN + (index % 2) * 260;
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

            doc.fillColor('white').fontSize(7).font('Helvetica-Bold')
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
            doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.text)
               .text(sig.signer_name || 'Unknown', sigX + 10, yPos + 62);

            const signedDate = sig.signed_at ? new Date(sig.signed_at).toLocaleString('en-CA') : 'N/A';
            doc.fontSize(7).font('Helvetica').fillColor(colors.textMuted)
               .text(signedDate, sigX + 10, yPos + 75);
          });
        }

        // ============================================
        // WATERMARK (on every page if enabled)
        // ============================================
        const watermarkEnabled = quote.watermark_enabled;
        const watermarkText = quote.watermark_text || quote.status?.toUpperCase() || '';

        // ============================================
        // FOOTER - ALL PAGES (Sales Order style)
        // ============================================

        const pageRange = doc.bufferedPageRange();
        const pageCount = pageRange.count;

        // Temporarily prevent PDFKit from auto-creating pages when
        // rendering footer text below the bottom margin
        const _origAddPage = doc.addPage;
        doc.addPage = function() { return this; };

        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);

          // Watermark on every page (internal PDFs only)
          if (type === 'internal' && watermarkEnabled && watermarkText) {
            doc.save();
            doc.fontSize(60).font('Helvetica-Bold').fillColor('#000000').opacity(0.06);
            doc.translate(306, 400);
            doc.rotate(-45, { origin: [0, 0] });
            doc.text(watermarkText, -200, -30, { width: 400, align: 'center' });
            doc.restore();
          }

          // Footer divider
          doc.moveTo(MARGIN, 750)
             .lineTo(MARGIN + CONTENT_W, 750)
             .strokeColor(colors.border)
             .lineWidth(1)
             .stroke();

          // Left: Page X of Y
          doc.fontSize(7).font('Helvetica').fillColor(colors.textLight)
            .text(`Page ${i + 1} of ${pageCount}`, MARGIN, 754, { lineBreak: false });

          // Center: HST #
          doc.fontSize(7).font('Helvetica-Bold').fillColor(colors.textMuted)
            .text('HST #: 802845461RT0001', MARGIN + 150, 754, { lineBreak: false });

          // Right: contact info
          doc.fontSize(7).font('Helvetica').fillColor(colors.textLight)
            .text(`${companyWebsite} | ${companyPhone} | ${companyEmail}`, MARGIN + 300, 754, { lineBreak: false });
        }

        // Restore addPage before doc.end()
        doc.addPage = _origAddPage;

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
