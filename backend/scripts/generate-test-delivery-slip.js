'use strict';

/**
 * Generate a test Delivery Slip PDF with sample data (no DB required).
 * Directly invokes the PDF rendering logic from DeliverySlipService.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUTPUT_PATH = 'C:/Users/WD-PC1/OneDrive/Desktop/DeliverySlip_v2.pdf';

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

// ── Sample Data ──────────────────────────────────────────────────

const slip = {
  slip_number: 'DS-2026-00001',
  status: 'scheduled',
  delivery_date: '2026-03-28',
  delivery_address: '456 Lakeshore Blvd West',
  delivery_city: 'Mississauga',
  delivery_province: 'ON',
  delivery_postal_code: 'L5H 1G3',
  access_instructions: 'Buzz unit 204, elevator to 2nd floor, bring dolly',
  delivery_notes: 'Customer prefers morning delivery before 11 AM',
  customer_name: 'John Smith',
  customer_phone: '905-555-1234',
  customer_email: 'john@email.com',
  company_name: null,
  sales_order_number: 'SO-2026-00042',
  transaction_number: 'TXN-20260324-00089',
  driver_name: null,
  vehicle_number: null
};

const items = [
  {
    product_name: 'Samsung 65" QLED 4K Smart TV',
    product_sku: 'SAM-65Q80C',
    model_number: 'QN65Q80C',
    manufacturer: 'Samsung',
    serial_number: 'SN123456789',
    quantity: 1,
    condition: 'New',
    assembly: 'No'
  },
  {
    product_name: 'Samsung Soundbar HW-Q800C',
    product_sku: 'SAM-HWQ800C',
    model_number: 'HW-Q800C',
    manufacturer: 'Samsung',
    serial_number: 'SN987654321',
    quantity: 1,
    condition: 'New',
    assembly: 'No'
  },
  {
    product_name: 'LG 30 Cu Ft French Door Refrigerator',
    product_sku: 'LG-LRMVS3006S',
    model_number: 'LRMVS3006S',
    manufacturer: 'LG',
    serial_number: 'SN456789123',
    quantity: 1,
    condition: 'New',
    assembly: 'Yes'
  }
];

const salesRep = 'Dave Miller';
const cashierName = 'Sarah Jones';

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

// ── PDF Generation ───────────────────────────────────────────────

function generatePdf() {
  const statusCfg = STATUS_CONFIG[slip.status];
  const companyPhone = '(905) 273-5550';
  const companyAddress = '1111 International Blvd';
  const companyCity = 'Burlington, ON L7L 6W1';
  const companyEmail = 'info@teletime.ca';
  const companyWebsite = 'teletime.ca';
  const hstNumber = '802845461RT0001';

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
    // HEADER
    // ============================================
    doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary)
      .text('Teletime', 50, 16);
    let headerY = 44;

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(companyAddress, 50, headerY); headerY += 11;
    doc.text(companyCity, 50, headerY); headerY += 11;
    doc.text(`Tel: ${companyPhone}`, 50, headerY); headerY += 11;

    // Slip Badge Box (right side)
    doc.roundedRect(400, 12, 162, 85, 4)
      .fillAndStroke(COLORS.bgLight, COLORS.border);

    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.primary)
      .text('DELIVERY SLIP', 402, 18, { width: 158, align: 'center' });

    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
      .text(slip.slip_number, 402, 34, { width: 158, align: 'center' });

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
      .text(`Printed: ${formatDate(new Date())}`, 402, 52, { width: 158, align: 'center' });

    doc.text(`Delivery: ${formatDate(slip.delivery_date)}`, 402, 63, { width: 158, align: 'center' });

    // Status badge
    doc.roundedRect(430, 76, 102, 18, 3).fill(statusCfg.bg);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(statusCfg.color)
      .text(statusCfg.label, 430, 81, { width: 102, align: 'center' });

    // ============================================
    // DELIVER TO (prominent)
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
      .text(slip.customer_name, 62, dY, { width: 480 });
    dY += 18;

    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.textSecondary)
      .text(`Tel: ${slip.customer_phone}`, 62, dY);
    dY += 15;

    const addressParts = [
      slip.delivery_address,
      [slip.delivery_city, slip.delivery_province, slip.delivery_postal_code].filter(Boolean).join(', ')
    ].filter(Boolean);

    doc.fontSize(11).font('Helvetica').fillColor(COLORS.text)
      .text(addressParts.join('\n'), 62, dY, { width: 480 });
    dY += addressParts.length * 14;

    if (slip.access_instructions) {
      dY = Math.max(dY, yPos + 74);
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
      // Zebra striping
      if (index % 2 === 0) doc.rect(50, yPos, 512, rowH).fill(COLORS.bgLight);
      doc.moveTo(50, yPos + rowH).lineTo(562, yPos + rowH)
        .strokeColor(COLORS.border).lineWidth(0.75).stroke();

      const rY = yPos + 4;

      // Product name
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.text)
        .text((item.product_name || '').substring(0, 30), cols.desc.x + 6, rY, { width: cols.desc.w - 10 });

      // Model / SKU line
      const modelLine = [item.model_number, item.product_sku].filter(Boolean).join(' | ');
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

      // Condition
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(item.condition || 'New', cols.cond.x, rY + 4, { width: cols.cond.w, align: 'center' });

      // Assembly
      doc.text(item.assembly || 'No', cols.asm.x, rY + 4, { width: cols.asm.w, align: 'center' });

      yPos += rowH;
    });

    yPos += 10;

    // ============================================
    // SALES REFERENCE BOX
    // ============================================
    const refH = 60;
    doc.roundedRect(50, yPos, 512, refH, 4)
      .fillAndStroke(COLORS.bgMuted, COLORS.border);

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
      .text('SALES REFERENCE', 62, yPos + 8);

    let refY = yPos + 22;

    // Row 1
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight).text('Sales Order:', 62, refY);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary).text(slip.sales_order_number, 150, refY);
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight).text('Sales Rep:', 310, refY);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary).text(salesRep, 400, refY);

    refY += 13;
    // Row 2
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight).text('Transaction:', 62, refY);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary).text(slip.transaction_number, 150, refY);
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight).text('Cashier:', 310, refY);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary).text(cashierName, 400, refY);

    refY += 13;
    // Row 3
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight).text('Store Phone:', 310, refY);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary).text(companyPhone, 400, refY);

    yPos += refH + 10;

    // ============================================
    // WAREHOUSE SECTION (3 signature lines)
    // ============================================
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
      .text('Driver Name: _________________________', 62, yPos + 9);
    doc.text('Vehicle: _______________', 280, yPos + 9);
    doc.text('Departure Time: ___________', 430, yPos + 9);

    yPos += drH + 10;

    // ============================================
    // CUSTOMER SIGNATURE / DELIVERY CONFIRMATION
    // ============================================
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
    sigY += 12;
    doc.moveTo(70, sigY + 22).lineTo(350, sigY + 22)
      .strokeColor('#000000').lineWidth(1.5).stroke();
    sigY += 30;

    // Print name + date/time
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
      .text('Print Name: ___________________________________________', 70, sigY);
    sigY += 16;
    doc.font('Helvetica-Bold').fillColor('#000000')
      .text('Date of Delivery: _______________________   Time of Delivery: _______________________', 70, sigY);
    sigY += 20;

    // Checkboxes
    doc.rect(70, sigY, 10, 10).strokeColor('#000000').lineWidth(1).stroke();
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
      .text('Items received in good condition', 86, sigY + 1);

    doc.rect(310, sigY, 10, 10).strokeColor('#000000').lineWidth(1).stroke();
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.text)
      .text('Items received with damage (describe below)', 326, sigY + 1);

    sigY += 18;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
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

      doc.moveTo(50, 740).lineTo(562, 740)
        .strokeColor(COLORS.border).lineWidth(1).stroke();

      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textMuted)
        .text(`HST #: ${hstNumber}`, 50, 745, { lineBreak: false });

      doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
        .text(
          'Returns accepted within 30 days with original receipt. Items must be in original packaging.',
          50, 756, { width: 400, lineBreak: false }
        );

      doc.fontSize(8).fillColor(COLORS.textLight)
        .text(`Page ${i + 1} of ${pageCount}`, 450, 745, { width: 112, align: 'right', lineBreak: false });

      const contactParts = [companyWebsite, companyPhone, companyEmail].filter(Boolean);
      doc.fontSize(7).text(contactParts.join('  |  '), 50, 768, { width: 512, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}

// ── Run ──────────────────────────────────────────────────────────

async function main() {
  console.log('Generating test Delivery Slip PDF...');
  const pdfBuffer = await generatePdf();
  fs.writeFileSync(OUTPUT_PATH, pdfBuffer);
  console.log(`PDF saved to: ${OUTPUT_PATH}`);
  console.log(`Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
