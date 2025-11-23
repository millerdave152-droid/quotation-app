import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logger from '../utils/logger';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// ===================================
// PREVIEW QUOTE PDF (Opens in new tab)
// ===================================
export const previewQuotePDF = async (quoteId, type = 'customer') => {
  try {
    logger.log('🔍 Previewing quote:', quoteId, 'Type:', type);

    // Fetch quote data
    const quoteResponse = await fetch(`${API_BASE}/quotations/${quoteId}`);
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote: ${quoteResponse.status}`);
    }
    const quote = await quoteResponse.json();

    // Fetch customer data
    const customerResponse = await fetch(`${API_BASE}/customers/${quote.customer_id}`);
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customer = await customerResponse.json();

    // Fetch quote items
    const itemsResponse = await fetch(`${API_BASE}/quotations/${quoteId}/items`);
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const items = await itemsResponse.json();

    if (!items || items.length === 0) {
      alert('⚠️ This quote has no items. Please add products before previewing.');
      return;
    }

    // Generate PDF based on type
    const doc = type === 'internal'
      ? generateInternalPDF(quote, customer, items)
      : generateCustomerPDF(quote, customer, items);

    // Open in new tab
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');

    logger.log('✅ PDF preview opened in new tab');
  } catch (error) {
    console.error('❌ Error previewing PDF:', error);
    alert('Error loading quote details: ' + error.message);
  }
};

// ===================================
// DOWNLOAD QUOTE PDF
// ===================================
export const downloadQuotePDF = async (quoteId, type = 'customer') => {
  try {
    logger.log('📥 Downloading quote:', quoteId, 'Type:', type);

    // Fetch quote data
    const quoteResponse = await fetch(`${API_BASE}/quotations/${quoteId}`);
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote`);
    }
    const quote = await quoteResponse.json();

    // Fetch customer data
    const customerResponse = await fetch(`${API_BASE}/customers/${quote.customer_id}`);
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customer = await customerResponse.json();

    // Fetch quote items
    const itemsResponse = await fetch(`${API_BASE}/quotations/${quoteId}/items`);
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const items = await itemsResponse.json();

    if (!items || items.length === 0) {
      alert('⚠️ This quote has no items. Please add products before downloading PDF.');
      return;
    }

    const doc = type === 'internal'
      ? generateInternalPDF(quote, customer, items)
      : generateCustomerPDF(quote, customer, items);

    const filename = type === 'internal'
      ? `Quote_${quote.quote_number || quote.id}_INTERNAL.pdf`
      : `Quote_${quote.quote_number || quote.id}.pdf`;

    doc.save(filename);
    logger.log('✅ PDF downloaded:', filename);
  } catch (error) {
    console.error('❌ Error generating PDF download:', error);
    alert('Error generating PDF download: ' + error.message);
  }
};

// ===================================
// ADD WATERMARK TO PDF
// ===================================
const addWatermark = (doc, text, options = {}) => {
  const {
    color = [200, 200, 200], // Light gray
    opacity = 0.15,
    rotation = -45,
    fontSize = 50
  } = options;

  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Save the current graphics state
    doc.saveGraphicsState();

    // Set watermark properties
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setGState(new doc.GState({ opacity }));

    // Add watermark text in center, rotated
    const textWidth = doc.getTextWidth(text);
    const x = pageWidth / 2;
    const y = pageHeight / 2;

    // Rotate and draw text
    doc.text(text, x, y, {
      align: 'center',
      angle: rotation,
      baseline: 'middle'
    });

    // Restore graphics state
    doc.restoreGraphicsState();
  }
};

// ===================================
// ADD EXPIRY WARNING BANNER
// ===================================
const addExpiryWarning = (doc, expiryDate, currentY) => {
  const daysUntilExpiry = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry <= 14) {
    // Add warning banner
    const color = daysUntilExpiry <= 3 ? [220, 38, 38] : [234, 179, 8]; // Red or Yellow
    doc.setFillColor(...color);
    doc.rect(14, currentY, 182, 12, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');

    const warningText = daysUntilExpiry <= 0
      ? '⚠️ THIS QUOTE HAS EXPIRED'
      : `⚠️ THIS QUOTE EXPIRES IN ${daysUntilExpiry} DAY${daysUntilExpiry === 1 ? '' : 'S'}`;

    doc.text(warningText, 105, currentY + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    return currentY + 16; // Return new Y position
  }

  return currentY;
};

// ===================================
// GENERATE CUSTOMER-FACING PDF
// ===================================
export const generateCustomerPDF = (quote, customer, items) => {
  const doc = new jsPDF();

  // Check if model numbers should be hidden
  const hideModelNumbers = quote.hide_model_numbers || false;

  // Check expiry date
  const expiryDate = quote.quote_expiry_date || new Date(Date.now() + 14*24*60*60*1000);

  // Header with company branding
  doc.setFillColor(102, 126, 234); // Professional blue
  doc.rect(0, 0, 220, 40, 'F');

  // Logo placeholder area (left side of header)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1);
  doc.rect(10, 8, 24, 24, 'S'); // Square logo area
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('LOGO', 22, 21, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont(undefined, 'bold');
  doc.text('QUOTATION', 105, 25, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Company Info (Left)
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('TeleTime Solutions', 14, 50);
  doc.setFont(undefined, 'normal');
  doc.text('123 Business Street', 14, 56);
  doc.text('Toronto, ON M5H 2N2', 14, 62);
  doc.text('Phone: (416) 555-1234', 14, 68);
  doc.text('Email: info@teletime.ca', 14, 74);

  // Quote Info (Right)
  doc.setFont(undefined, 'bold');
  doc.text('Quote #:', 140, 50);
  doc.text('Date:', 140, 56);
  doc.text('Status:', 140, 62);
  doc.text('Valid Until:', 140, 68);

  doc.setFont(undefined, 'normal');
  doc.text(quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`, 165, 50);
  doc.text(new Date(quote.created_at).toLocaleDateString(), 165, 56);
  doc.text(quote.status || 'DRAFT', 165, 62);
  doc.text(new Date(expiryDate).toLocaleDateString(), 165, 68);

  // Add expiry warning if needed
  let currentY = 82;
  currentY = addExpiryWarning(doc, expiryDate, currentY);

  // Customer Info Section
  doc.setFillColor(249, 250, 251);
  doc.rect(14, currentY, 182, 28, 'F');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('BILL TO:', 18, currentY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(String(customer?.name || 'N/A'), 18, currentY + 14);
  if (customer?.company) doc.text(String(customer.company), 18, currentY + 20);
  doc.text(String(customer?.email || 'N/A'), 18, (customer?.company ? currentY + 26 : currentY + 20));

  currentY += 36;

  // Items Table
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || item.unit_price_cents || item.unit_price || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);

    // Determine description based on hide_model_numbers setting
    let description;
    if (hideModelNumbers) {
      // Customer-facing: Only show description, no model/manufacturer
      description = item.description || 'Product';
    } else {
      // Show full details including manufacturer and model
      const parts = [];
      if (item.manufacturer) parts.push(item.manufacturer);
      if (item.model) parts.push(item.model);
      if (item.description) parts.push(`- ${item.description}`);
      description = parts.join(' ') || 'N/A';
    }

    return [
      description,
      quantity,
      `$${unitPrice.toFixed(2)}`,
      `$${lineTotal.toFixed(2)}`
    ];
  });

  doc.autoTable({
    startY: currentY,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [102, 126, 234],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });

  // Parse revenue features from quote
  let revenueFeatures = null;
  try {
    revenueFeatures = quote.revenue_features ?
      (typeof quote.revenue_features === 'string' ? JSON.parse(quote.revenue_features) : quote.revenue_features) :
      null;
  } catch (e) {
    console.warn('Could not parse revenue_features:', e);
  }

  // Revenue Features Section (if any exist)
  let revenueFeaturesY = doc.lastAutoTable.finalY + 10;

  if (revenueFeatures && (revenueFeatures.delivery || revenueFeatures.warranties?.length > 0 ||
      revenueFeatures.financing || revenueFeatures.rebates?.length > 0 || revenueFeatures.tradeIns?.length > 0)) {

    doc.setFillColor(240, 253, 244); // Light green background
    doc.rect(14, revenueFeaturesY, 182, 6, 'F');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(22, 101, 52); // Dark green
    doc.text('VALUE-ADDED SERVICES', 18, revenueFeaturesY + 4);
    doc.setTextColor(0, 0, 0);

    let currentYRev = revenueFeaturesY + 12;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    // Delivery & Installation
    if (revenueFeatures.delivery && revenueFeatures.delivery.service) {
      doc.setFont(undefined, 'bold');
      doc.text('Delivery & Installation:', 18, currentYRev);
      doc.setFont(undefined, 'normal');
      doc.text(revenueFeatures.delivery.service.service_name, 18, currentYRev + 5);
      if (revenueFeatures.delivery.calculation) {
        doc.text(`$${(revenueFeatures.delivery.calculation.totalCents / 100).toFixed(2)}`, 195, currentYRev + 5, { align: 'right' });
      }
      currentYRev += 12;
    }

    // Extended Warranties
    if (revenueFeatures.warranties && revenueFeatures.warranties.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.text('Extended Warranty Coverage:', 18, currentYRev);
      currentYRev += 5;
      doc.setFont(undefined, 'normal');
      revenueFeatures.warranties.forEach(warranty => {
        doc.text(`• ${warranty.plan?.plan_name || 'Warranty Plan'} - ${warranty.plan?.duration_years || 'N/A'} years`, 22, currentYRev);
        doc.text(`$${(warranty.cost / 100).toFixed(2)}`, 195, currentYRev, { align: 'right' });
        currentYRev += 5;
      });
      currentYRev += 5;
    }

    // Rebates
    if (revenueFeatures.rebates && revenueFeatures.rebates.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(37, 99, 235); // Blue
      doc.text('Manufacturer Rebates Applied:', 18, currentYRev);
      currentYRev += 5;
      doc.setFont(undefined, 'normal');
      revenueFeatures.rebates.forEach(rebate => {
        doc.text(`• ${rebate.rebate_name || 'Rebate'}`, 22, currentYRev);
        const rebateAmount = rebate.rebate_percent ?
          `${rebate.rebate_percent}% off` :
          `-$${(rebate.rebate_amount_cents / 100).toFixed(2)}`;
        doc.text(rebateAmount, 195, currentYRev, { align: 'right' });
        currentYRev += 5;
      });
      doc.setTextColor(0, 0, 0);
      currentYRev += 5;
    }

    // Trade-Ins
    if (revenueFeatures.tradeIns && revenueFeatures.tradeIns.length > 0) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(37, 99, 235); // Blue
      doc.text('Trade-In Credit:', 18, currentYRev);
      currentYRev += 5;
      doc.setFont(undefined, 'normal');
      revenueFeatures.tradeIns.forEach(tradeIn => {
        doc.text(`• ${tradeIn.item_description || 'Trade-In Item'}`, 22, currentYRev);
        doc.text(`-$${(tradeIn.estimatedValueCents / 100).toFixed(2)}`, 195, currentYRev, { align: 'right' });
        currentYRev += 5;
      });
      doc.setTextColor(0, 0, 0);
      currentYRev += 5;
    }

    // Financing Option
    if (revenueFeatures.financing && revenueFeatures.financing.plan) {
      doc.setFillColor(219, 234, 254); // Light blue
      doc.rect(14, currentYRev, 182, 18, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175); // Dark blue
      doc.text('FINANCING AVAILABLE', 18, currentYRev + 6);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const monthlyPayment = revenueFeatures.financing.calculation ?
        (revenueFeatures.financing.calculation.monthlyPaymentCents / 100).toFixed(2) : '0.00';
      doc.text(`${revenueFeatures.financing.plan.plan_name} - As low as $${monthlyPayment}/month`, 18, currentYRev + 12);
      currentYRev += 22;
    }

    revenueFeaturesY = currentYRev;
  }

  // Calculate totals (convert from cents to dollars)
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const discountAmount = (quote.discount_cents || 0) / 100;
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const taxRate = quote.tax_rate || 0.13; // Default 13% HST

  // Totals Section
  const finalY = revenueFeaturesY + 5;
  const totalsX = 140;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);

  doc.text('Subtotal:', totalsX, finalY);
  doc.text(`$${subtotal.toFixed(2)}`, 195, finalY, { align: 'right' });

  if (discountAmount > 0) {
    doc.text('Discount:', totalsX, finalY + 6);
    doc.text(`-$${discountAmount.toFixed(2)}`, 195, finalY + 6, { align: 'right' });
  }

  const taxY = finalY + (discountAmount > 0 ? 12 : 6);
  doc.text(`Tax (${(taxRate * 100).toFixed(0)}%):`, totalsX, taxY);
  doc.text(`$${taxAmount.toFixed(2)}`, 195, taxY, { align: 'right' });

  // Total
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', totalsX, taxY + 8);
  doc.text(`$${total.toFixed(2)}`, 195, taxY + 8, { align: 'right' });

  // Notes Section
  if (quote.notes) {
    const notesY = taxY + 20;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Notes:', 14, notesY);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(quote.notes, 180);
    doc.text(splitNotes, 14, notesY + 6);
  }

  // Terms & Conditions Section
  const pageHeight = doc.internal.pageSize.height;
  let termsY = pageHeight - 60;

  if (quote.terms_and_conditions) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9);
    doc.text('Terms & Conditions:', 14, termsY);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    const splitTerms = doc.splitTextToSize(quote.terms_and_conditions, 180);
    doc.text(splitTerms, 14, termsY + 4);
    termsY = termsY + splitTerms.length * 2.5 + 8;
  } else {
    // Default terms
    doc.setFont(undefined, 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const terms = quote.terms || 'Payment due within 30 days. All prices in CAD. Prices subject to change.';
    const splitTerms = doc.splitTextToSize(terms, 180);
    doc.text(splitTerms, 14, termsY);
    termsY += splitTerms.length * 3 + 4;
  }

  // Next Steps Section (Call to Action)
  let nextStepsY = termsY + 6;

  // Check if we need a new page
  if (nextStepsY > pageHeight - 80) {
    doc.addPage();
    nextStepsY = 50;
  }

  doc.setFillColor(240, 249, 255); // Light blue background
  doc.rect(14, nextStepsY, 182, 26, 'F');
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 64, 175); // Dark blue
  doc.text('NEXT STEPS', 18, nextStepsY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('1. Review this quotation carefully', 18, nextStepsY + 14);
  doc.text('2. Sign below to accept', 18, nextStepsY + 19);
  doc.text('3. Contact us at info@teletime.ca or (416) 555-1234 with any questions', 18, nextStepsY + 24);

  // Signature Section (after Next Steps)
  const signatureY = nextStepsY + 34;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, signatureY, 95, signatureY);
  doc.line(115, signatureY, 196, signatureY);

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Customer Signature', 14, signatureY + 5);
  doc.text('Date', 115, signatureY + 5);

  // Payment Methods Section
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text('Payment Methods:', 14, signatureY + 12);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.text('We accept: Cash, Check, Credit Card, Wire Transfer', 14, signatureY + 17);

  // Add page numbers to all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, 195, pageHeight - 5, { align: 'right' });
  }

  // Footer (Thank you message)
  doc.setPage(totalPages); // Go back to last page
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text('Thank you for your business!', 105, pageHeight - 10, { align: 'center' });

  // Add watermark if enabled
  if (quote.watermark_enabled !== false) {
    const customerName = customer?.name ? String(customer.name).toUpperCase() : 'CUSTOMER';
    const watermarkText = quote.watermark_text || `CONFIDENTIAL - FOR ${customerName} ONLY`;
    addWatermark(doc, watermarkText, {
      color: [200, 200, 200],
      opacity: 0.1,
      rotation: -45,
      fontSize: 50
    });
  }

  return doc;
};

// ===================================
// GENERATE INTERNAL PDF (unchanged - keeping original)
// ===================================
export const generateInternalPDF = (quote, customer, items) => {
  const doc = new jsPDF();

  // Header - Internal Use Only
  doc.setFillColor(220, 38, 38); // Red for internal
  doc.rect(0, 0, 220, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text('INTERNAL QUOTATION', 105, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text('CONFIDENTIAL - DO NOT SHARE', 105, 30, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Company Info (Left)
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('TeleTime Solutions', 14, 50);
  doc.setFont(undefined, 'normal');
  doc.text('Internal Analysis Document', 14, 56);

  // Quote Info (Right)
  doc.setFont(undefined, 'bold');
  doc.text('Quote #:', 140, 50);
  doc.text('Date:', 140, 56);
  doc.text('Status:', 140, 62);
  doc.text('Created By:', 140, 68);

  doc.setFont(undefined, 'normal');
  doc.text(quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`, 165, 50);
  doc.text(new Date(quote.created_at).toLocaleDateString(), 165, 56);
  doc.text(quote.status || 'DRAFT', 165, 62);
  doc.text(quote.created_by || 'System', 165, 68);

  // Customer Info
  doc.setFillColor(254, 242, 242);
  doc.rect(14, 76, 182, 22, 'F');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('CUSTOMER:', 18, 84);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(String(customer?.name || 'N/A'), 18, 90);
  doc.text(String(customer?.email || 'N/A'), 18, 96);

  // Items Table with Cost Analysis
  const tableStartY = 106;
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || item.unit_price_cents || 0) / 100;
    const unitCost = (item.cost_cents || item.unit_cost_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const lineProfit = (item.line_profit_cents || 0) / 100 || (lineTotal - (quantity * unitCost));
    const marginPercent = lineTotal > 0 ? (lineProfit / lineTotal * 100) : 0;

    // For internal PDF, always show full details
    const parts = [];
    if (item.manufacturer) parts.push(item.manufacturer);
    if (item.model) parts.push(item.model);
    if (item.description) parts.push(`- ${item.description}`);
    const description = parts.join(' ') || 'N/A';

    return [
      description,
      quantity,
      `$${unitCost.toFixed(2)}`,
      `$${unitPrice.toFixed(2)}`,
      `$${lineTotal.toFixed(2)}`,
      `$${lineProfit.toFixed(2)}`,
      `${marginPercent.toFixed(1)}%`
    ];
  });

  doc.autoTable({
    startY: tableStartY,
    head: [['Description', 'Qty', 'Unit Cost', 'Unit Price', 'Total', 'Margin $', 'Margin %']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });

  // ... (rest of internal PDF code continues as before - revenue features, totals, etc.)
  // Calculate totals
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const totalCost = items.reduce((sum, item) =>
    sum + ((item.quantity || 1) * ((item.cost_cents || 0) / 100)), 0);
  const discountAmount = (quote.discount_cents || 0) / 100;
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const grossProfit = (quote.gross_profit_cents || 0) / 100;
  const taxRate = quote.tax_rate || 0.13;
  const totalMarginPercent = total > 0 ? (grossProfit / total * 100) : 0;

  // Totals Section
  const finalY = doc.lastAutoTable.finalY + 10;
  const totalsX = 120;

  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('FINANCIAL ANALYSIS:', 14, finalY);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);

  // Revenue Side
  doc.text('Subtotal:', totalsX, finalY + 6);
  doc.text(`$${subtotal.toFixed(2)}`, 195, finalY + 6, { align: 'right' });

  if (discountAmount > 0) {
    doc.text('Discount:', totalsX, finalY + 12);
    doc.text(`-$${discountAmount.toFixed(2)}`, 195, finalY + 12, { align: 'right' });
  }

  const taxY = finalY + (discountAmount > 0 ? 18 : 12);
  doc.text(`Tax (${(taxRate * 100).toFixed(0)}%):`, totalsX, taxY);
  doc.text(`$${taxAmount.toFixed(2)}`, 195, taxY, { align: 'right' });

  doc.setFont(undefined, 'bold');
  doc.text('Total Revenue:', totalsX, taxY + 6);
  doc.text(`$${total.toFixed(2)}`, 195, taxY + 6, { align: 'right' });

  // Cost Analysis
  doc.setFillColor(254, 242, 242);
  doc.rect(14, taxY + 12, 182, 30, 'F');

  doc.setFont(undefined, 'normal');
  doc.text('Total Cost:', totalsX, taxY + 20);
  doc.text(`$${totalCost.toFixed(2)}`, 195, taxY + 20, { align: 'right' });

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);

  // Color code margin based on percentage
  if (totalMarginPercent < 20) {
    doc.setTextColor(220, 38, 38); // Red
  } else if (totalMarginPercent < 30) {
    doc.setTextColor(234, 179, 8); // Yellow
  } else {
    doc.setTextColor(22, 163, 74); // Green
  }

  doc.text('Gross Profit:', totalsX, taxY + 28);
  doc.text(`$${grossProfit.toFixed(2)}`, 195, taxY + 28, { align: 'right' });

  doc.text('Margin %:', totalsX, taxY + 36);
  doc.text(`${totalMarginPercent.toFixed(1)}%`, 195, taxY + 36, { align: 'right' });

  // Reset color
  doc.setTextColor(0, 0, 0);

  // Add page numbers to all pages
  const pageHeight = doc.internal.pageSize.height;
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, 195, pageHeight - 5, { align: 'right' });
  }

  // Footer - Confidentiality Notice
  doc.setPage(totalPages); // Go back to last page
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text('CONFIDENTIAL - INTERNAL USE ONLY - DO NOT DISTRIBUTE', 105, pageHeight - 10, { align: 'center' });

  return doc;
};

// ===================================
// EMAIL QUOTE PDF
// ===================================
export const emailQuotePDF = async (quoteId, emailData) => {
  try {
    logger.log('📧 Sending email for quote:', quoteId);

    const response = await fetch(`${API_BASE}/quotations/${quoteId}/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send email');
    }

    const result = await response.json();
    logger.log('✅ Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
};
