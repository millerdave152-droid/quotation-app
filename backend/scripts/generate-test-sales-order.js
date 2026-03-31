#!/usr/bin/env node
/**
 * Generate a test Sales Order Confirmation PDF with sample data
 * Usage: node scripts/generate-test-sales-order.js
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

let QRCode = null;
try { QRCode = require('qrcode'); } catch { }

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
const OUTPUT_PATH = path.join(require('os').homedir(), 'OneDrive', 'Desktop', 'SalesOrder_v2.pdf');

function formatCurrency(amount) {
  return `$${parseFloat(amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Sample data ──
const company = {
  name: 'TELETIME',
  address: '3125 Wolfedale Road',
  city: 'Mississauga, ON L5C 1V8',
  phone: '(905) 273-5550',
  email: 'Dave@teletime.ca',
  website: 'www.teletime.ca',
  hstNumber: '802845461RT0001'
};

const orderNumber = 'SO-2026-00001';
const orderDate = new Date('2026-03-23T14:30:00');

const customer = {
  name: 'John Smith',
  phone: '905-555-1234',
  email: 'john@email.com',
  address: '123 Main St',
  city: 'Mississauga',
  province: 'ON',
  postal: 'L5B 2T4'
};

const salesRep = 'Dave Miller';
const cashier = 'Sarah Jones';
const register = 'Register 1';
const txnRef = 'TXN-20260323-00042';
const shiftId = 12;

const items = [
  {
    product_name: 'Samsung 65" QLED 4K Smart TV',
    product_sku: 'SAM-65Q80C',
    manufacturer: 'Samsung',
    model_number: 'QN65Q80C',
    serial_number: 'SN123456789',
    quantity: 1,
    unit_price: 129999,
    discount_amount: 0,
    line_total: 129999
  },
  {
    product_name: 'Extended Warranty - 5 Year Protection Plan',
    product_sku: 'EW-5YR',
    manufacturer: 'Excelsior',
    model_number: null,
    serial_number: null,
    quantity: 1,
    unit_price: 19999,
    discount_amount: 0,
    line_total: 19999
  }
];

const subtotal = 149998; // $1,499.98
const hst = 19500;       // $195.00 (13%)
const totalDue = 169498;  // $1,694.98
const totalPaid = 169498;
const balanceDue = 0;

const payments = [
  { method: 'CASH', amount: 169498, date: orderDate, tendered: 170000, change: 502 }
];

const delivery = {
  date: new Date('2026-03-28'),
  address: null, // same as billing
  notes: null
};

// ── Generate PDF ──
async function generate() {
  const hasLogo = fs.existsSync(LOGO_PATH);
  let qrBuffer = null;
  if (QRCode) {
    try {
      qrBuffer = await QRCode.toBuffer(`https://app.eikansupply.com/orders/${orderNumber}`, {
        type: 'png', width: 100, margin: 1, errorCorrectionLevel: 'M'
      });
    } catch { }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 0, left: 50, right: 50 } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let yPos = 0;

    // TOP ACCENT BAR
    doc.rect(0, 0, 612, 4).fill(COLORS.primary);

    // HEADER
    let headerY = 16;
    if (hasLogo) {
      try {
        doc.image(LOGO_PATH, 50, 14, { width: 120 });
        headerY = 44;
      } catch {
        doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary).text('Teletime', 50, 16);
        headerY = 44;
      }
    } else {
      doc.fontSize(26).font('Helvetica-Bold').fillColor(COLORS.primary).text('Teletime', 50, 16);
      headerY = 44;
    }

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(company.address, 50, headerY); headerY += 11;
    doc.text(company.city, 50, headerY); headerY += 11;
    doc.text(`Tel: ${company.phone}`, 50, headerY); headerY += 11;
    doc.text(`HST #: ${company.hstNumber}`, 50, headerY);

    // ORDER BADGE
    doc.roundedRect(400, 12, 162, 85, 4).fillAndStroke(COLORS.bgLight, COLORS.border);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.primary)
      .text('SALES ORDER CONFIRMATION', 402, 18, { width: 158, align: 'center' });
    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.text)
      .text(orderNumber, 402, 34, { width: 158, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted)
      .text(formatDateTime(orderDate), 402, 52, { width: 158, align: 'center' });

    // Status badge
    doc.roundedRect(430, 66, 102, 18, 3).fill('#dcfce7');
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.success)
      .text('PAID', 430, 71, { width: 102, align: 'center' });

    // SOLD TO CARD
    yPos = 108;
    const soldToHeight = 80;
    doc.roundedRect(50, yPos, 250, soldToHeight, 6).fillAndStroke(COLORS.bgMuted, COLORS.border);

    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight).text('SOLD TO', 60, yPos + 10);
    doc.moveTo(60, yPos + 22).lineTo(150, yPos + 22).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    let custY = yPos + 28;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.text).text(customer.name, 60, custY, { width: 230 });
    custY += 14;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary).text(`Tel: ${customer.phone}`, 60, custY);
    custY += 11;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.primaryLight).text(customer.email, 60, custY);

    // Address below card
    const addrY = yPos + soldToHeight + 4;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted);
    doc.text(customer.address, 60, addrY);
    doc.text(`${customer.city}, ${customer.province} ${customer.postal}`, 60, addrY + 10);

    // SALES DETAILS CARD
    doc.roundedRect(315, yPos, 247, soldToHeight, 6).fillAndStroke(COLORS.bgMuted, COLORS.border);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primaryLight).text('SALES DETAILS', 325, yPos + 10);
    doc.moveTo(325, yPos + 22).lineTo(430, yPos + 22).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    let detY = yPos + 28;
    const detRows = [
      ['Sales Rep:', salesRep],
      ['Processed by:', cashier],
      ['Register:', register],
      ['Txn Ref:', txnRef],
      ['Shift:', `#${shiftId}`]
    ];
    for (const [label, value] of detRows) {
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight).text(label, 325, detY);
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary).text(value, 410, detY, { width: 140 });
      detY += 12;
    }

    // ITEMS TABLE
    yPos = yPos + soldToHeight + 30;
    const tableTop = yPos;
    const cols = {
      item: { x: 50, w: 230 },
      serial: { x: 280, w: 80 },
      qty: { x: 360, w: 35 },
      price: { x: 395, w: 70 },
      total: { x: 465, w: 97 }
    };

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
      if (index % 2 === 0) doc.rect(50, yPos, 512, rowHeight).fill(COLORS.bgLight);
      doc.moveTo(50, yPos + rowHeight).lineTo(562, yPos + rowHeight).strokeColor(COLORS.border).lineWidth(0.5).stroke();

      const rowY = yPos + 5;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(item.product_name.substring(0, 38), cols.item.x + 8, rowY, { width: cols.item.w - 12 });

      let subLine = item.product_sku || '';
      if (item.manufacturer) subLine += subLine ? ` | ${item.manufacturer}` : item.manufacturer;
      if (item.model_number) subLine += ` ${item.model_number}`;
      if (subLine) {
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted)
          .text(subLine.substring(0, 50), cols.item.x + 8, rowY + 12, { width: cols.item.w - 12 });
      }

      if (item.serial_number) {
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary)
          .text(item.serial_number, cols.serial.x, rowY + 4, { width: cols.serial.w, align: 'center' });
      } else {
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
          .text('—', cols.serial.x, rowY + 4, { width: cols.serial.w, align: 'center' });
      }

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(item.quantity.toString(), cols.qty.x, rowY + 4, { width: cols.qty.w, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary)
        .text(formatCurrency(item.unit_price / 100), cols.price.x, rowY + 4, { width: cols.price.w, align: 'right' });
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.text)
        .text(formatCurrency(item.line_total / 100), cols.total.x, rowY + 4, { width: cols.total.w, align: 'right' });

      if (item.discount_amount > 0) {
        doc.fontSize(7).font('Helvetica').fillColor(COLORS.error)
          .text(`Disc: -${formatCurrency(item.discount_amount / 100)}`, cols.total.x, rowY + 16, { width: cols.total.w, align: 'right' });
      }

      yPos += rowHeight;
    });

    // DELIVERY SECTION
    yPos += 8;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('DELIVERY INFORMATION', 50, yPos);
    yPos += 14;

    const deliveryBoxHeight = 62;
    doc.roundedRect(50, yPos, 512, deliveryBoxHeight, 4).fillAndStroke(COLORS.bgMuted, COLORS.border);

    let delY = yPos + 10;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight).text('Delivery Date:', 60, delY);
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textSecondary).text(formatDate(delivery.date), 150, delY);

    delY += 14;
    doc.fontSize(8).fillColor(COLORS.textLight).text('Deliver To:', 60, delY);
    doc.fontSize(9).fillColor(COLORS.textMuted).text('Same as billing address', 150, delY);

    delY += 14;
    doc.fontSize(8).fillColor(COLORS.textLight).text('Instructions:', 60, delY);
    doc.fontSize(9).fillColor(COLORS.textSecondary).text('—', 150, delY);

    delY += 16;
    doc.fontSize(8).fillColor(COLORS.textLight).text('Delivery confirmed by:', 60, delY);
    doc.moveTo(170, delY + 10).lineTo(400, delY + 10)
      .strokeColor(COLORS.borderMedium).lineWidth(0.5).dash(3, { space: 3 }).stroke().undash();

    yPos += deliveryBoxHeight + 8;

    // PAYMENT SUMMARY
    const totalsBoxX = 350;
    const totalsBoxW = 212;
    const totalsBoxH = 130;

    doc.roundedRect(totalsBoxX, yPos, totalsBoxW, totalsBoxH, 4).fillAndStroke(COLORS.bgMuted, COLORS.border);

    const lblX = totalsBoxX + 15;
    const valX = totalsBoxX + totalsBoxW - 15;
    let tY = yPos + 15;

    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textMuted).text('Subtotal', lblX, tY);
    doc.fillColor(COLORS.textSecondary).text(formatCurrency(subtotal / 100), valX - 80, tY, { width: 80, align: 'right' });

    tY += 16;
    doc.fillColor(COLORS.textMuted).text('HST (13%)', lblX, tY);
    doc.fillColor(COLORS.textSecondary).text(formatCurrency(hst / 100), valX - 80, tY, { width: 80, align: 'right' });

    tY += 18;
    doc.moveTo(lblX, tY).lineTo(valX, tY).strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();

    tY += 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('Total', lblX, tY);
    doc.text(formatCurrency(totalDue / 100), valX - 80, tY, { width: 80, align: 'right' });

    tY += 16;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.success).text('Paid', lblX, tY);
    doc.text(`-${formatCurrency(totalPaid / 100)}`, valX - 80, tY, { width: 80, align: 'right' });

    tY += 22;
    doc.roundedRect(totalsBoxX + 10, tY, totalsBoxW - 20, 28, 3).fill(COLORS.success);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white').text('BALANCE DUE', lblX, tY + 8);
    doc.fontSize(13).text(formatCurrency(balanceDue / 100), valX - 85, tY + 6, { width: 80, align: 'right' });

    // Payment method (left of totals)
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('PAYMENT RECEIVED', 50, yPos);
    let pmtY = yPos + 16;
    const pmtBoxH = 30;
    doc.roundedRect(50, pmtY, 280, pmtBoxH, 4).fillAndStroke(COLORS.bgLight, COLORS.border);
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textMuted).text(formatDate(orderDate), 60, pmtY + 8);
    doc.fillColor(COLORS.textSecondary).text('CASH', 140, pmtY + 8);
    doc.font('Helvetica-Bold').fillColor(COLORS.success).text(formatCurrency(totalPaid / 100), 250, pmtY + 8, { width: 70, align: 'right' });

    // Cash tendered / change
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textMuted)
      .text(`Tendered: ${formatCurrency(1700)}   Change: ${formatCurrency(5.02)}`, 60, pmtY + 20);

    yPos += totalsBoxH + 8;

    // SIGNATURE SECTION
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text).text('SIGNATURES', 50, yPos);
    yPos += 16;

    const sigBoxH = 65;
    doc.roundedRect(50, yPos, 512, sigBoxH, 4).fillAndStroke(COLORS.bgMuted, COLORS.border);

    const sigLnY = yPos + 32;

    doc.fontSize(8).font('Helvetica').fillColor(COLORS.textLight).text('Customer Signature', 60, yPos + 10);
    doc.moveTo(60, sigLnY).lineTo(280, sigLnY).strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(COLORS.textLight)
      .text('Print Name: ______________________________', 60, sigLnY + 6)
      .text('Date: ______________', 60, sigLnY + 18);

    doc.fontSize(8).fillColor(COLORS.textLight).text('Staff Signature', 320, yPos + 10);
    doc.moveTo(320, sigLnY).lineTo(550, sigLnY).strokeColor(COLORS.borderMedium).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(COLORS.textLight)
      .text('Print Name: ______________________________', 320, sigLnY + 6)
      .text('Date: ______________', 320, sigLnY + 18);

    yPos += sigBoxH + 8;

    // PAYMENT SLIP ATTACHMENT AREA
    const slipBoxH = 45;
    doc.roundedRect(50, yPos, 512, slipBoxH, 4)
      .dash(4, { space: 4 }).strokeColor(COLORS.borderMedium).lineWidth(1).stroke().undash();

    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.textMuted)
      .text('ATTACH PAYMENT RECEIPT HERE', 50, yPos + 14, { width: 512, align: 'center' });
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
      .text('Staple or tape e-Transfer confirmation, cheque copy, or credit card slip', 50, yPos + 28, { width: 512, align: 'center' });

    // FOOTER (drawn directly — single page)
    doc.moveTo(50, 740).lineTo(562, 740).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textMuted).text(`HST #: ${company.hstNumber}`, 50, 745, { lineBreak: false });
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.textLight)
      .text('Returns accepted within 30 days with original receipt. Items must be in original packaging.', 50, 756, { width: 400, lineBreak: false });
    doc.fontSize(8).fillColor(COLORS.textLight).text('Page 1 of 1', 450, 745, { width: 112, align: 'right', lineBreak: false });
    const contact = [company.website, company.phone, company.email].join('  |  ');
    doc.fontSize(7).text(contact, 50, 768, { width: 512, align: 'center', lineBreak: false });

    doc.end();
  });
}

// ── Main ──
(async () => {
  console.log('Generating test Sales Order Confirmation PDF...');
  const pdfBuffer = await generate();
  fs.writeFileSync(OUTPUT_PATH, pdfBuffer);
  console.log(`PDF saved to: ${OUTPUT_PATH}`);
  console.log(`File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
