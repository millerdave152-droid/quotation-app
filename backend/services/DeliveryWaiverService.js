/**
 * Delivery Waiver Service
 *
 * Generates a 2-page Delivery Waiver PDF using PDFKit.
 * Page 1: Pre-delivery preparation instructions and delivery challenges.
 * Page 2: Post-delivery sign-off with signature lines.
 */

const PDFDocument = require('pdfkit');

const COLORS = {
  primary: '#1e40af',
  text: '#1f2937',
  textSecondary: '#374151',
  textMuted: '#333333',
  textLight: '#444444',
  bgLight: '#f8fafc',
  border: '#e5e7eb',
  borderMedium: '#888888'
};

class DeliveryWaiverService {
  constructor(pool, cache, config) {
    this.pool = pool;
    this.cache = cache;
    this.config = config;
  }

  /**
   * Query delivery slip data joined with customers and transactions
   * @param {number} slipId - Delivery slip ID
   * @returns {Promise<object>} - Slip data with customer and transaction info
   */
  async getSlipData(slipId) {
    const query = `
      SELECT
        ds.*,
        c.first_name AS customer_first_name,
        c.last_name AS customer_last_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.address AS customer_address,
        t.transaction_id,
        t.total_amount,
        t.created_at AS transaction_date
      FROM delivery_slips ds
      LEFT JOIN customers c ON ds.customer_id = c.id
      LEFT JOIN transactions t ON ds.transaction_id = t.transaction_id
      WHERE ds.id = $1
    `;
    const result = await this.pool.query(query, [slipId]);
    if (result.rows.length === 0) {
      throw new Error(`Delivery slip not found: ${slipId}`);
    }
    return result.rows[0];
  }

  /**
   * Generate a 2-page Delivery Waiver PDF for a given delivery slip
   * @param {number} slipId - Delivery slip ID
   * @returns {Promise<Buffer>} - PDF as a buffer
   */
  async generateWaiverPdf(slipId) {
    const slip = await this.getSlipData(slipId);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 40, bottom: 60, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const pageWidth = doc.page.width;
        const marginLeft = 50;
        const marginRight = 50;
        const contentWidth = pageWidth - marginLeft - marginRight;

        // =====================================================================
        // PAGE 1 — DELIVERY WAIVER
        // =====================================================================
        this._drawPage1Header(doc, slip, marginLeft, contentWidth);
        this._drawPage1Body(doc, marginLeft, contentWidth);
        this._drawFooter(doc, 1, marginLeft, contentWidth);

        // =====================================================================
        // PAGE 2 — POST-DELIVERY SIGN-OFF
        // =====================================================================
        doc.addPage();
        this._drawPage2Body(doc, marginLeft, contentWidth);
        this._drawFooter(doc, 2, marginLeft, contentWidth);

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Draw page 1 header with store name, title, and order details
   */
  _drawPage1Header(doc, slip, marginLeft, contentWidth) {
    const customerName = [slip.customer_first_name, slip.customer_last_name]
      .filter(Boolean)
      .join(' ') || 'N/A';
    const deliveryDate = slip.delivery_date
      ? new Date(slip.delivery_date).toLocaleDateString('en-CA')
      : 'TBD';
    const orderRef = slip.order_number || slip.transaction_id || `SLIP-${slip.id}`;

    // Left side — store name and title
    doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
      .text('Teletime', marginLeft, 40);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000')
      .text('Delivery Waiver', marginLeft, 70);

    // Right side — order details
    const rightX = marginLeft + contentWidth - 200;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary);
    doc.text(`Order: ${orderRef}`, rightX, 40, { width: 200, align: 'right' });
    doc.text(`Customer: ${customerName}`, rightX, 54, { width: 200, align: 'right' });
    doc.text(`Delivery Date: ${deliveryDate}`, rightX, 68, { width: 200, align: 'right' });

    // Divider line below header
    doc.moveTo(marginLeft, 95)
      .lineTo(marginLeft + contentWidth, 95)
      .strokeColor(COLORS.border)
      .lineWidth(1)
      .stroke();
  }

  /**
   * Draw page 1 body — preparation instructions and delivery challenges
   */
  _drawPage1Body(doc, marginLeft, contentWidth) {
    let y = 108;

    // Section: PREPARING FOR YOUR APPLIANCE DELIVERY
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text('PREPARING FOR YOUR APPLIANCE DELIVERY', marginLeft, y);
    y += 16;

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(
      'Thank you for choosing Teletime. In an effort to provide you with the highest level of service,',
      marginLeft, y, { width: contentWidth }
    );
    y += 12;
    doc.text(
      'Please remember, if you have any questions, contact your Sales Associate at (905) 273-5550',
      marginLeft, y, { width: contentWidth }
    );
    y += 18;

    // Numbered bullet points
    const bullets = [
      'Please verify that the product you have purchased will fit in your home. Consider the height, width, depth and door swing of the appliances, as well as any ventilation (round or rectangular ducting) or gas requirements (natural gas or liquid propane).',
      'It is your responsibility to protect your floor coverings.',
      'As an added convenience, we are happy to call you (upon request) at work or on your cell phone 30 minutes prior to our arrival. If we do not receive verification that you are not prepared to accept your order we will un-schedule your delivery. To reschedule, please call 905-273-5550 (for faster service, please have your order number available). Unfortunately, we are unable to guarantee definite AM or PM time frames.',
      'Our policy requires the person receiving and signing for the delivery to be at least 18 years of age.',
      'Upon arrival at your home, our delivery team will review our sign-off sheet with you and develop a plan that identifies the best possible route through your home. You may be asked to clear a path free of furniture, breakables, banisters/railings and other obstructions from your door to the delivery area. If the delivery is particularly difficult or there is potential for damage, you will have the option to sign a damage waiver to proceed with the delivery (difficult deliveries may include: inadequate plumbing or electrical applications, improperly protected floor coverings, spiral or narrow staircases, landings or doorways, etc).',
      'Our delivery team is unable to take off their shoes in your home. They will wear protective coverings over their shoes unless it is unsafe to do so.',
      'WE HIGHLY RECOMMEND THAT YOU INSPECT ALL OF YOUR APPLIANCES OUTSIDE THE PROPERTY. NEITHER TELETIME NOR THE MANUFACTURER IS ABLE TO ADDRESS DAMAGE THAT OCCURS AFTER DELIVERY.',
      'To help us continue your delivery program in the future, please call us with a minimum of 48 hours notice if you need to postpone your delivery. Thank you very much!'
    ];

    const numberWidth = 18;
    const bulletTextWidth = contentWidth - numberWidth;

    for (let i = 0; i < bullets.length; i++) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textMuted)
        .text(`${i + 1}.`, marginLeft, y, { width: numberWidth });

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
      const textHeight = doc.heightOfString(bullets[i], {
        width: bulletTextWidth
      });
      doc.text(bullets[i], marginLeft + numberWidth, y, {
        width: bulletTextWidth
      });
      y += textHeight + 6;
    }

    y += 10;

    // Section: DELIVERY CHALLENGES
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text('DELIVERY CHALLENGES', marginLeft, y);
    y += 16;

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
    const challenge1 = 'Please inform your sales associate if we are delivering to a townhome or second floor kitchen location.';
    doc.text(`\u2022  ${challenge1}`, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(`\u2022  ${challenge1}`, { width: contentWidth }) + 6;

    const challenge2 = 'WE ARE ABLE TO MOVE APPLIANCES WITHIN YOUR HOME THAT ARE NOT PART OF YOUR DELIVERY AT A COST OF $100.00 WITH ADVANCE NOTICE (AT YOUR OWN RISK OF ANY DAMAGES). WE DO NOT REMOVE SCRAP APPLIANCES.';
    doc.text(`\u2022  ${challenge2}`, marginLeft, y, { width: contentWidth });
  }

  /**
   * Draw page 2 body — post-delivery info and signature section
   */
  _drawPage2Body(doc, marginLeft, contentWidth) {
    let y = 50;

    // Section: APPLIANCE INSTALLATION
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text('APPLIANCE INSTALLATION', marginLeft, y);
    y += 16;

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(
      'Please remember, if you have any questions, contact your Sales Associate at (905) 273-5550',
      marginLeft, y, { width: contentWidth }
    );
    y += 14;

    const installNote = 'If you require installation of any gas or built-in appliances (dishwashers, wall ovens, pro appliances, etc), please see your Sales Associate.';
    doc.text(`\u2022  ${installNote}`, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(`\u2022  ${installNote}`, { width: contentWidth }) + 14;

    // Section: POST-DELIVERY
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text('POST-DELIVERY', marginLeft, y);
    y += 16;

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);

    const postItems = [
      'It is our expectation that our delivery personnel will present themselves in a clean, professional and courteous manner. Should you have any questions or concerns regarding your delivery, please write your comments on the sign-off sheet, or contact our delivery office at 905-273-5550. Your feedback is essential to help us maintain the highest possible level of service.',
      'Should you have any questions regarding the operation or performance of your product please contact your sales associate or feel free to call 905-273-5550. We look forward to assisting you!',
      'Please do not install damaged items. Manufacturers require all product packaging for any damaged returns.'
    ];

    for (const item of postItems) {
      const bulletText = `\u2022  ${item}`;
      doc.text(bulletText, marginLeft, y, { width: contentWidth });
      y += doc.heightOfString(bulletText, { width: contentWidth }) + 6;
    }

    y += 10;

    // NOTE
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.text);
    const noteText = 'NOTE: Our delivery personnel are authorized to decline any delivery that they feel will cause excessive damage, personal injury, or if they are being subjected to verbal or physical abuse.';
    doc.text(noteText, marginLeft, y, { width: contentWidth });
    y += doc.heightOfString(noteText, { width: contentWidth }) + 24;

    // =====================================================================
    // SIGNATURE SECTION
    // =====================================================================
    this._drawSignatureSection(doc, marginLeft, contentWidth, y);
  }

  /**
   * Draw signature fields with bold labels and drawn lines
   */
  _drawSignatureSection(doc, marginLeft, contentWidth, startY) {
    let y = startY;
    const labelWidth = 120;
    const lineStartX = marginLeft + labelWidth;
    const lineLength = contentWidth - labelWidth;
    const rowSpacing = 36;

    const drawField = (label, yPos) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(label, marginLeft, yPos);
      doc.moveTo(lineStartX, yPos + 12)
        .lineTo(lineStartX + lineLength, yPos + 12)
        .strokeColor('#000000')
        .lineWidth(1.5)
        .stroke();
    };

    drawField('Customer Name:', y);
    y += rowSpacing;
    drawField('Date:', y);
    y += rowSpacing;
    drawField('Signature:', y);
    y += rowSpacing;
    drawField('Invoice #:', y);
    y += rowSpacing + 10;

    drawField('Employee Name:', y);
    y += rowSpacing;
    drawField('Date:', y);
    y += rowSpacing;
    drawField('Signature:', y);
  }

  /**
   * Draw footer on the current page
   */
  _drawFooter(doc, pageNumber, marginLeft, contentWidth) {
    const footerY = 740;

    // Horizontal rule
    doc.moveTo(marginLeft, footerY)
      .lineTo(marginLeft + contentWidth, footerY)
      .strokeColor(COLORS.borderMedium)
      .lineWidth(1)
      .stroke();

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight);
    doc.text(`Page ${pageNumber} of 2`, marginLeft, footerY + 8, {
      width: contentWidth,
      align: 'left'
    });
    doc.text('Teletime Superstores | (905) 273-5550', marginLeft, footerY + 8, {
      width: contentWidth,
      align: 'center'
    });
    doc.text('www.teletime.ca', marginLeft, footerY + 8, {
      width: contentWidth,
      align: 'right'
    });
  }
}

module.exports = DeliveryWaiverService;
