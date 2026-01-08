/**
 * PDF Generation Service
 *
 * Generates professional quote PDFs using PDFKit
 * Used for bulk email attachments and direct downloads
 */

const PDFDocument = require('pdfkit');

class PdfService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Generate a PDF for a quote
   * @param {number} quoteId - The quote ID
   * @param {object} options - Generation options
   * @returns {Promise<Buffer>} - PDF as a buffer
   */
  async generateQuotePdf(quoteId, options = {}) {
    const { type = 'customer' } = options;

    // Fetch quote data
    const quoteResult = await this.pool.query(`
      SELECT q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company as customer_company,
        c.address as customer_address,
        c.city as customer_city,
        c.province as customer_province,
        c.postal_code as customer_postal_code
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [quoteId]);

    if (quoteResult.rows.length === 0) {
      throw new Error('Quote not found');
    }

    const quote = quoteResult.rows[0];

    // Fetch quote items
    const itemsResult = await this.pool.query(`
      SELECT qi.*, p.manufacturer, p.model, p.sku, p.description as product_description
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
      ORDER BY qi.id
    `, [quoteId]);

    const items = itemsResult.rows;

    // Fetch signatures
    const signaturesResult = await this.pool.query(`
      SELECT id, signature_data, signer_name, signer_email, signature_type, signed_at, legal_text
      FROM quote_signatures
      WHERE quote_id = $1
      ORDER BY signed_at ASC
    `, [quoteId]);

    const signatures = signaturesResult.rows;

    // Generate PDF
    return this.createPdfDocument(quote, items, type, signatures);
  }

  /**
   * Create PDF document
   * @param {object} quote - Quote data
   * @param {array} items - Quote items
   * @param {string} type - 'customer' or 'internal'
   * @param {array} signatures - Signature records
   */
  createPdfDocument(quote, items, type = 'customer', signatures = []) {
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

        // Colors
        const primaryColor = '#3b82f6';
        const textColor = '#1f2937';
        const lightGray = '#6b7280';
        const borderColor = '#e5e7eb';

        // Company info (configurable)
        const companyName = process.env.COMPANY_NAME || 'Your Company';
        const companyAddress = process.env.COMPANY_ADDRESS || '123 Business Street';
        const companyCity = process.env.COMPANY_CITY || 'City, Province, Postal';
        const companyPhone = process.env.COMPANY_PHONE || '(555) 123-4567';
        const companyEmail = process.env.COMPANY_EMAIL || 'sales@company.com';

        // Header
        doc.fontSize(24)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text(companyName, 50, 50);

        doc.fontSize(10)
           .fillColor(lightGray)
           .font('Helvetica')
           .text(companyAddress, 50, 80)
           .text(companyCity, 50, 92)
           .text(`Phone: ${companyPhone}`, 50, 104)
           .text(`Email: ${companyEmail}`, 50, 116);

        // Quote Title
        doc.fontSize(20)
           .fillColor(textColor)
           .font('Helvetica-Bold')
           .text('QUOTATION', 400, 50, { align: 'right' });

        doc.fontSize(12)
           .fillColor(lightGray)
           .font('Helvetica')
           .text(`Quote #: ${quote.quotation_number || 'N/A'}`, 400, 75, { align: 'right' })
           .text(`Date: ${new Date(quote.created_at).toLocaleDateString('en-CA')}`, 400, 90, { align: 'right' });

        if (quote.quote_expiry_date) {
          doc.text(`Valid Until: ${new Date(quote.quote_expiry_date).toLocaleDateString('en-CA')}`, 400, 105, { align: 'right' });
        }

        // Horizontal line
        doc.moveTo(50, 140)
           .lineTo(562, 140)
           .strokeColor(borderColor)
           .stroke();

        // Customer Info
        let yPos = 160;
        doc.fontSize(12)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('BILL TO:', 50, yPos);

        yPos += 18;
        doc.fontSize(11)
           .fillColor(textColor)
           .font('Helvetica-Bold')
           .text(quote.customer_name || 'N/A', 50, yPos);

        yPos += 14;
        doc.font('Helvetica')
           .fillColor(lightGray);

        if (quote.customer_company) {
          doc.text(quote.customer_company, 50, yPos);
          yPos += 14;
        }
        if (quote.customer_address) {
          doc.text(quote.customer_address, 50, yPos);
          yPos += 14;
        }
        if (quote.customer_city || quote.customer_province || quote.customer_postal_code) {
          const cityLine = [quote.customer_city, quote.customer_province, quote.customer_postal_code]
            .filter(Boolean).join(', ');
          doc.text(cityLine, 50, yPos);
          yPos += 14;
        }
        if (quote.customer_email) {
          doc.text(quote.customer_email, 50, yPos);
          yPos += 14;
        }
        if (quote.customer_phone) {
          doc.text(quote.customer_phone, 50, yPos);
          yPos += 14;
        }

        // Items Table
        yPos = Math.max(yPos + 20, 280);

        // Table Header
        const tableTop = yPos;
        const colWidths = type === 'internal'
          ? { item: 180, qty: 50, unit: 80, cost: 80, total: 80, profit: 42 }
          : { item: 220, qty: 60, unit: 100, total: 100 };

        doc.fillColor(primaryColor)
           .rect(50, tableTop, 512, 25)
           .fill();

        doc.fillColor('white')
           .fontSize(10)
           .font('Helvetica-Bold');

        let xPos = 55;
        doc.text('Item Description', xPos, tableTop + 8);
        xPos += colWidths.item;
        doc.text('Qty', xPos, tableTop + 8, { width: colWidths.qty, align: 'center' });
        xPos += colWidths.qty;
        doc.text('Unit Price', xPos, tableTop + 8, { width: colWidths.unit, align: 'right' });
        xPos += colWidths.unit;

        if (type === 'internal') {
          doc.text('Cost', xPos, tableTop + 8, { width: colWidths.cost, align: 'right' });
          xPos += colWidths.cost;
        }

        doc.text('Total', xPos, tableTop + 8, { width: colWidths.total, align: 'right' });

        if (type === 'internal') {
          xPos += colWidths.total;
          doc.text('GP%', xPos, tableTop + 8, { width: colWidths.profit, align: 'right' });
        }

        // Table Rows
        yPos = tableTop + 30;
        doc.font('Helvetica').fontSize(9);

        items.forEach((item, index) => {
          const rowHeight = 35;

          // Alternating row background
          if (index % 2 === 0) {
            doc.fillColor('#f9fafb')
               .rect(50, yPos - 5, 512, rowHeight)
               .fill();
          }

          doc.fillColor(textColor);

          // Item description
          const itemName = item.manufacturer && item.model
            ? `${item.manufacturer} ${item.model}`
            : item.description || item.sku || 'Product';

          xPos = 55;
          doc.text(itemName, xPos, yPos, { width: colWidths.item - 10, height: 30 });
          xPos += colWidths.item;

          // Quantity
          doc.text(item.quantity?.toString() || '1', xPos, yPos, { width: colWidths.qty, align: 'center' });
          xPos += colWidths.qty;

          // Unit price
          const unitPrice = (item.unit_price_cents || 0) / 100;
          doc.text(`$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, xPos, yPos, { width: colWidths.unit, align: 'right' });
          xPos += colWidths.unit;

          // Cost (internal only)
          if (type === 'internal') {
            const cost = (item.cost_cents || 0) / 100;
            doc.text(`$${cost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, xPos, yPos, { width: colWidths.cost, align: 'right' });
            xPos += colWidths.cost;
          }

          // Line total
          const lineTotal = (item.line_total_cents || (item.unit_price_cents * item.quantity)) / 100;
          doc.text(`$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, xPos, yPos, { width: colWidths.total, align: 'right' });

          // Profit margin (internal only)
          if (type === 'internal') {
            xPos += colWidths.total;
            const margin = item.margin_percent || 0;
            doc.text(`${margin.toFixed(1)}%`, xPos, yPos, { width: colWidths.profit, align: 'right' });
          }

          yPos += rowHeight;

          // Check for page break
          if (yPos > 680) {
            doc.addPage();
            yPos = 50;
          }
        });

        // Totals section
        yPos += 20;
        const totalsX = 400;
        const totalsWidth = 162;

        doc.moveTo(totalsX, yPos)
           .lineTo(totalsX + totalsWidth, yPos)
           .strokeColor(borderColor)
           .stroke();

        yPos += 10;

        // Subtotal
        const subtotal = (quote.subtotal_cents || 0) / 100;
        doc.fontSize(10)
           .fillColor(textColor)
           .text('Subtotal:', totalsX, yPos)
           .text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, totalsX + 80, yPos, { width: 82, align: 'right' });

        // Discount
        if (quote.discount_cents && quote.discount_cents > 0) {
          yPos += 18;
          const discount = (quote.discount_cents || 0) / 100;
          const discountLabel = quote.discount_percent ? `Discount (${quote.discount_percent}%):` : 'Discount:';
          doc.text(discountLabel, totalsX, yPos)
             .fillColor('#dc2626')
             .text(`-$${discount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, totalsX + 80, yPos, { width: 82, align: 'right' });
          doc.fillColor(textColor);
        }

        // Tax
        yPos += 18;
        const tax = (quote.tax_cents || 0) / 100;
        const taxLabel = quote.tax_rate ? `Tax (${quote.tax_rate}%):` : 'Tax:';
        doc.text(taxLabel, totalsX, yPos)
           .text(`$${tax.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, totalsX + 80, yPos, { width: 82, align: 'right' });

        // Total
        yPos += 25;
        doc.moveTo(totalsX, yPos - 5)
           .lineTo(totalsX + totalsWidth, yPos - 5)
           .strokeColor(primaryColor)
           .lineWidth(2)
           .stroke();

        const total = (quote.total_cents || 0) / 100;
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(primaryColor)
           .text('TOTAL:', totalsX, yPos)
           .text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, totalsX + 80, yPos, { width: 82, align: 'right' });

        // Gross Profit (internal only)
        if (type === 'internal' && quote.gross_profit_cents) {
          yPos += 25;
          const grossProfit = (quote.gross_profit_cents || 0) / 100;
          const profitMargin = subtotal > 0 ? ((grossProfit / subtotal) * 100).toFixed(1) : 0;
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#15803d')
             .text(`Gross Profit: $${grossProfit.toLocaleString('en-CA', { minimumFractionDigits: 2 })} (${profitMargin}%)`, totalsX, yPos);
        }

        // Notes
        if (quote.notes) {
          yPos += 40;
          if (yPos > 650) {
            doc.addPage();
            yPos = 50;
          }
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(textColor)
             .text('Notes:', 50, yPos);
          yPos += 15;
          doc.font('Helvetica')
             .fontSize(10)
             .fillColor(lightGray)
             .text(quote.notes, 50, yPos, { width: 500 });
        }

        // Terms
        if (quote.terms) {
          yPos += 40;
          if (yPos > 650) {
            doc.addPage();
            yPos = 50;
          }
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(textColor)
             .text('Terms & Conditions:', 50, yPos);
          yPos += 15;
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(lightGray)
             .text(quote.terms, 50, yPos, { width: 500 });
        }

        // Signatures Section
        if (signatures && signatures.length > 0) {
          yPos += 50;

          // Check for page break
          if (yPos > 550) {
            doc.addPage();
            yPos = 50;
          }

          doc.fontSize(12)
             .font('Helvetica-Bold')
             .fillColor(textColor)
             .text('Signatures', 50, yPos);

          yPos += 20;

          // Draw signatures in a grid (2 per row)
          const sigWidth = 230;
          const sigHeight = 120;
          const sigGap = 20;
          let sigCol = 0;
          let sigStartY = yPos;

          signatures.forEach((sig, index) => {
            const xOffset = 50 + (sigCol * (sigWidth + sigGap));

            // Check for page break
            if (yPos + sigHeight > 700) {
              doc.addPage();
              yPos = 50;
              sigStartY = yPos;
            }

            // Signature box border
            doc.strokeColor('#d1d5db')
               .lineWidth(1)
               .rect(xOffset, yPos, sigWidth, sigHeight)
               .stroke();

            // Signature type badge
            const badgeColor = sig.signature_type === 'staff' ? '#3b82f6' : '#10b981';
            const badgeText = sig.signature_type === 'staff' ? 'STAFF' : 'CUSTOMER';

            doc.fillColor(badgeColor)
               .roundedRect(xOffset + 5, yPos + 5, 60, 16, 3)
               .fill();

            doc.fillColor('white')
               .fontSize(8)
               .font('Helvetica-Bold')
               .text(badgeText, xOffset + 8, yPos + 9, { width: 54, align: 'center' });

            // Embed signature image if available
            if (sig.signature_data && sig.signature_data.startsWith('data:image/')) {
              try {
                // Extract base64 data
                const base64Data = sig.signature_data.split(',')[1];
                if (base64Data) {
                  const imgBuffer = Buffer.from(base64Data, 'base64');
                  doc.image(imgBuffer, xOffset + 10, yPos + 25, {
                    width: sigWidth - 20,
                    height: 50,
                    fit: [sigWidth - 20, 50],
                    align: 'center',
                    valign: 'center'
                  });
                }
              } catch (imgError) {
                console.error('Error embedding signature image:', imgError);
                // Draw placeholder if image fails
                doc.fillColor(lightGray)
                   .fontSize(9)
                   .font('Helvetica')
                   .text('[Signature]', xOffset + 10, yPos + 45, { width: sigWidth - 20, align: 'center' });
              }
            }

            // Signer name
            doc.fillColor(textColor)
               .fontSize(10)
               .font('Helvetica-Bold')
               .text(sig.signer_name || 'Unknown', xOffset + 10, yPos + 80, { width: sigWidth - 20 });

            // Signer email (if available)
            if (sig.signer_email) {
              doc.fillColor(lightGray)
                 .fontSize(8)
                 .font('Helvetica')
                 .text(sig.signer_email, xOffset + 10, yPos + 93, { width: sigWidth - 20 });
            }

            // Signed date
            const signedDate = sig.signed_at ? new Date(sig.signed_at).toLocaleString('en-CA', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : 'N/A';

            doc.fillColor(lightGray)
               .fontSize(8)
               .font('Helvetica')
               .text(signedDate, xOffset + 10, yPos + 105, { width: sigWidth - 20 });

            // Move to next column or row
            sigCol++;
            if (sigCol >= 2) {
              sigCol = 0;
              yPos += sigHeight + 15;
            }
          });

          // If we ended on a partial row, move yPos down
          if (sigCol > 0) {
            yPos += sigHeight + 15;
          }
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
             .fillColor(lightGray)
             .text(
               `Page ${i + 1} of ${pageCount} | Generated on ${new Date().toLocaleString('en-CA')}`,
               50,
               750,
               { align: 'center', width: 512 }
             );
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
