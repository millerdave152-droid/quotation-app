import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logger from '../utils/logger';
import companyConfig, { formatCustomerAddress } from '../config/companyConfig';
import { handleApiError } from '../utils/errorHandler';
import { toast } from '../components/ui/Toast';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// ===================================
// PREVIEW QUOTE PDF (Opens in new tab)
// ===================================
export const previewQuotePDF = async (quoteId, type = 'customer') => {
  try {
    logger.log('Previewing quote:', quoteId, 'Type:', type);

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
      toast.warning('This quote has no items. Please add products before previewing.', 'Empty Quote');
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

    logger.log('PDF preview opened in new tab');
  } catch (error) {
    handleApiError(error, { context: 'Preview PDF' });
  }
};

// ===================================
// DOWNLOAD QUOTE PDF
// ===================================
export const downloadQuotePDF = async (quoteId, type = 'customer') => {
  try {
    logger.log('Downloading quote:', quoteId, 'Type:', type);

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
      toast.warning('This quote has no items. Please add products before downloading PDF.', 'Empty Quote');
      return;
    }

    const doc = type === 'internal'
      ? generateInternalPDF(quote, customer, items)
      : generateCustomerPDF(quote, customer, items);

    const filename = type === 'internal'
      ? `Quote_${quote.quote_number || quote.id}_INTERNAL.pdf`
      : `Quote_${quote.quote_number || quote.id}.pdf`;

    doc.save(filename);
    logger.log('PDF downloaded:', filename);
  } catch (error) {
    handleApiError(error, { context: 'Download PDF' });
  }
};

// ===================================
// HELPER: Clean and format product description
// ===================================
const formatProductDescription = (item, hideModelNumbers = false) => {
  // Clean up any CSV-like data in description
  let description = item.description || '';

  // If description looks like CSV data, extract the last meaningful part
  if (description.includes(',') && description.match(/^\w+,\w+,[\d.]+,[\d.]+/)) {
    // This looks like CSV data - extract the actual description
    const parts = description.split(',');
    // Usually the description is the last part after numeric values
    const cleanParts = parts.filter(p => !p.match(/^[\d.]+$/) && p.length > 3);
    description = cleanParts[cleanParts.length - 1] || '';
  }

  if (hideModelNumbers) {
    // Customer-facing: Only show clean description
    return description || item.category || 'Product';
  }

  // Build full product name
  const nameParts = [];

  if (item.manufacturer && item.manufacturer !== 'undefined') {
    nameParts.push(item.manufacturer);
  }

  if (item.model && item.model !== 'undefined' && !item.model.includes(',')) {
    nameParts.push(item.model);
  }

  // Add description if it's not redundant
  if (description && !nameParts.some(p => description.toLowerCase().includes(p.toLowerCase()))) {
    if (nameParts.length > 0) {
      nameParts.push('-');
    }
    nameParts.push(description);
  }

  return nameParts.join(' ') || 'Product';
};

// ===================================
// HELPER: Get tax rate as percentage
// ===================================
const getTaxRatePercent = (taxRate) => {
  if (!taxRate) return 13; // Default 13% HST

  // If tax rate is already a percentage (>1), use it directly
  if (taxRate > 1) {
    return taxRate;
  }

  // If it's a decimal (0.13), multiply by 100
  return taxRate * 100;
};

// ===================================
// ADD WATERMARK TO PDF
// ===================================
const addWatermark = (doc, text, options = {}) => {
  const {
    color = [220, 220, 220],
    opacity = 0.08,
    rotation = -35,
    fontSize = 40
  } = options;

  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setGState(new doc.GState({ opacity }));

    // Center the watermark
    const x = pageWidth / 2;
    const y = pageHeight / 2;

    doc.text(text, x, y, {
      align: 'center',
      angle: rotation,
      baseline: 'middle'
    });

    doc.restoreGraphicsState();
  }
};

// ===================================
// ADD EXPIRY WARNING BANNER
// ===================================
const addExpiryWarning = (doc, expiryDate, currentY) => {
  const daysUntilExpiry = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry <= 14) {
    // Warning colors
    const isUrgent = daysUntilExpiry <= 3;
    const bgColor = isUrgent ? [220, 38, 38] : [234, 179, 8];

    doc.setFillColor(...bgColor);
    doc.rect(14, currentY, 182, 10, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');

    // Use simple text instead of emoji
    let warningText;
    if (daysUntilExpiry <= 0) {
      warningText = '*** THIS QUOTE HAS EXPIRED ***';
    } else if (daysUntilExpiry === 1) {
      warningText = '! URGENT: THIS QUOTE EXPIRES TOMORROW !';
    } else {
      warningText = `THIS QUOTE EXPIRES IN ${daysUntilExpiry} DAYS`;
    }

    doc.text(warningText, 105, currentY + 6.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    return currentY + 14;
  }

  return currentY;
};

// ===================================
// GENERATE CUSTOMER-FACING PDF
// ===================================
export const generateCustomerPDF = (quote, customer, items) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const hideModelNumbers = quote.hide_model_numbers || false;
  const expiryDate = quote.quote_expiry_date || quote.expires_at || new Date(Date.now() + 14*24*60*60*1000);

  // ========== HEADER ==========
  const { primaryColor, headerTextColor } = companyConfig.branding;
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Logo placeholder (left side)
  const { logo } = companyConfig;
  if (logo.base64) {
    try {
      doc.addImage(logo.base64, 'PNG', 12, 7, logo.width, logo.height);
    } catch (e) {
      // Fallback to text placeholder
      doc.setDrawColor(...headerTextColor);
      doc.setLineWidth(0.5);
      doc.rect(12, 7, 22, 22, 'S');
      doc.setFontSize(7);
      doc.setTextColor(...headerTextColor);
      doc.text('LOGO', 23, 19, { align: 'center' });
    }
  } else {
    doc.setDrawColor(...headerTextColor);
    doc.setLineWidth(0.5);
    doc.rect(12, 7, 22, 22, 'S');
    doc.setFontSize(7);
    doc.setTextColor(...headerTextColor);
    doc.text('LOGO', 23, 19, { align: 'center' });
  }

  // Title
  doc.setTextColor(...headerTextColor);
  doc.setFontSize(26);
  doc.setFont(undefined, 'bold');
  doc.text('QUOTATION', 105, 23, { align: 'center' });

  // ========== COMPANY & QUOTE INFO ==========
  doc.setTextColor(51, 51, 51);

  // Company Info (Left)
  const { address, contact } = companyConfig;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(companyConfig.name, 14, 48);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(address.street, 14, 54);
  doc.text(`${address.city}, ${address.province} ${address.postalCode}`, 14, 59);
  doc.text(`Phone: ${contact.phone}`, 14, 64);
  doc.text(`Email: ${contact.email}`, 14, 69);

  // Quote Info (Right) - Clean layout
  const quoteInfoX = 138;
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);

  doc.text('Quote #:', quoteInfoX, 48);
  doc.text('Date:', quoteInfoX, 54);
  doc.text('Status:', quoteInfoX, 60);
  doc.text('Valid Until:', quoteInfoX, 66);

  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  const quoteNumber = quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`;
  doc.text(quoteNumber, 165, 48);
  doc.setFont(undefined, 'normal');
  doc.text(new Date(quote.created_at).toLocaleDateString('en-CA'), 165, 54);
  doc.text(quote.status || 'DRAFT', 165, 60);
  doc.text(new Date(expiryDate).toLocaleDateString('en-CA'), 165, 66);

  // ========== EXPIRY WARNING ==========
  let currentY = 78;
  currentY = addExpiryWarning(doc, expiryDate, currentY);

  // ========== CUSTOMER INFO ==========
  doc.setFillColor(249, 250, 251);

  // Calculate customer box height
  const customerName = customer?.name || 'Customer';
  const customerEmail = customer?.email || '';
  const customerPhone = customer?.phone || '';
  const customerAddress = customer?.address || '';
  const customerCity = customer?.city || '';

  let boxHeight = 24;
  if (customerAddress) boxHeight += 5;
  if (customerCity) boxHeight += 5;
  if (customerPhone) boxHeight += 5;

  doc.rect(14, currentY, 182, boxHeight, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.rect(14, currentY, 182, boxHeight, 'S');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.text('BILL TO:', 18, currentY + 7);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  let customerY = currentY + 13;

  doc.setFont(undefined, 'bold');
  doc.text(customerName, 18, customerY);
  doc.setFont(undefined, 'normal');
  customerY += 5;

  if (customerAddress) {
    doc.text(customerAddress, 18, customerY);
    customerY += 5;
  }

  if (customerCity) {
    doc.text(customerCity, 18, customerY);
    customerY += 5;
  }

  if (customerPhone) {
    doc.text(`Tel: ${customerPhone}`, 18, customerY);
    customerY += 5;
  }

  if (customerEmail) {
    doc.setTextColor(59, 130, 246);
    doc.text(customerEmail, 18, customerY);
    doc.setTextColor(51, 51, 51);
  }

  currentY += boxHeight + 8;

  // ========== ITEMS TABLE ==========
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || item.unit_price_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const description = formatProductDescription(item, hideModelNumbers);

    return [
      description,
      quantity.toString(),
      `$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ];
  });

  doc.autoTable({
    startY: currentY,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [51, 51, 51]
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251]
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14 },
    tableLineColor: [229, 231, 235],
    tableLineWidth: 0.1
  });

  // ========== TOTALS SECTION ==========
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const discountPercent = parseFloat(quote.discount_percent) || 0;
  const discountAmount = (quote.discount_cents || 0) / 100;
  const taxRatePercent = getTaxRatePercent(quote.tax_rate);
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const taxName = companyConfig.tax.taxName || 'HST';

  let totalsY = doc.lastAutoTable.finalY + 8;
  const totalsX = 130;
  const amountX = 195;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 100, 100);

  // Subtotal
  doc.text('Subtotal:', totalsX, totalsY);
  doc.setTextColor(51, 51, 51);
  doc.text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, totalsY, { align: 'right' });

  // Discount (if any)
  if (discountAmount > 0) {
    totalsY += 6;
    doc.setTextColor(220, 38, 38);
    doc.text(`Discount (${discountPercent}%):`, totalsX, totalsY);
    doc.text(`-$${discountAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, totalsY, { align: 'right' });
  }

  // Tax
  totalsY += 6;
  doc.setTextColor(100, 100, 100);
  doc.text(`${taxName} (${taxRatePercent.toFixed(0)}%):`, totalsX, totalsY);
  doc.setTextColor(51, 51, 51);
  doc.text(`$${taxAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, totalsY, { align: 'right' });

  // Total - Prominent display
  totalsY += 10;
  doc.setFillColor(249, 250, 251);
  doc.rect(totalsX - 5, totalsY - 5, 75, 12, 'F');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.text('TOTAL:', totalsX, totalsY + 3);
  doc.setTextColor(59, 130, 246);
  doc.text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, totalsY + 3, { align: 'right' });

  // ========== NOTES SECTION ==========
  doc.setTextColor(51, 51, 51);
  if (quote.notes && quote.notes.trim()) {
    totalsY += 18;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text('Notes:', 14, totalsY);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const splitNotes = doc.splitTextToSize(quote.notes, 180);
    doc.text(splitNotes, 14, totalsY + 6);
    totalsY += 6 + (splitNotes.length * 4);
  }

  // ========== TERMS ==========
  totalsY += 10;
  const terms = quote.terms || companyConfig.quotes.defaultTerms || 'Payment due within 30 days. All prices in CAD.';
  doc.setFont(undefined, 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const splitTerms = doc.splitTextToSize(terms, 180);
  doc.text(splitTerms, 14, totalsY);
  totalsY += splitTerms.length * 3.5;

  // ========== NEXT STEPS (NEW PAGE IF NEEDED) ==========
  let nextStepsY = totalsY + 12;

  if (nextStepsY > pageHeight - 65) {
    doc.addPage();
    nextStepsY = 30;
  }

  // Next Steps Box
  doc.setFillColor(239, 246, 255);
  doc.rect(14, nextStepsY, 182, 28, 'F');
  doc.setDrawColor(191, 219, 254);
  doc.rect(14, nextStepsY, 182, 28, 'S');

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('NEXT STEPS', 18, nextStepsY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text('1. Review this quotation carefully', 18, nextStepsY + 14);
  doc.text('2. Sign below to accept', 18, nextStepsY + 19);
  doc.text(`3. Contact us at ${contact.email} or ${contact.phone} with questions`, 18, nextStepsY + 24);

  // Signature Lines
  const signatureY = nextStepsY + 38;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(14, signatureY, 90, signatureY);
  doc.line(110, signatureY, 196, signatureY);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Customer Signature', 14, signatureY + 5);
  doc.text('Date', 110, signatureY + 5);

  // Payment Methods
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  doc.text('Payment Methods:', 14, signatureY + 14);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const paymentText = `We accept: ${companyConfig.paymentMethods.slice(0, 5).join(', ')}`;
  doc.text(paymentText, 14, signatureY + 19);

  // ========== PAGE NUMBERS ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  // ========== FOOTER ==========
  doc.setPage(totalPages);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.text('Thank you for your business!', 105, pageHeight - 14, { align: 'center' });

  // ========== WATERMARK ==========
  if (quote.watermark_enabled !== false) {
    const watermarkText = 'QUOTATION';
    addWatermark(doc, watermarkText, {
      color: [200, 200, 200],
      opacity: 0.06,
      rotation: -35,
      fontSize: 60
    });
  }

  return doc;
};

// ===================================
// GENERATE INTERNAL PDF
// ===================================
export const generateInternalPDF = (quote, customer, items) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header - Red for Internal
  doc.setFillColor(185, 28, 28);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  doc.text('INTERNAL QUOTATION', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text('CONFIDENTIAL - DO NOT SHARE WITH CUSTOMER', 105, 28, { align: 'center' });

  doc.setTextColor(51, 51, 51);

  // Company & Quote Info
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(companyConfig.name, 14, 48);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Internal Cost Analysis Document', 14, 54);

  // Quote Info (Right)
  const quoteInfoX = 138;
  doc.text('Quote #:', quoteInfoX, 48);
  doc.text('Date:', quoteInfoX, 54);
  doc.text('Status:', quoteInfoX, 60);
  doc.text('Created By:', quoteInfoX, 66);

  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  doc.text(quote.quote_number || `QT-${quote.id}`, 168, 48);
  doc.setFont(undefined, 'normal');
  doc.text(new Date(quote.created_at).toLocaleDateString('en-CA'), 168, 54);
  doc.text(quote.status || 'DRAFT', 168, 60);
  doc.text(quote.sales_rep_name || quote.created_by || 'System', 168, 66);

  // Customer Info Box
  doc.setFillColor(254, 242, 242);
  doc.rect(14, 74, 182, 18, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.text('CUSTOMER:', 18, 82);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`${customer?.name || 'N/A'} | ${customer?.email || 'N/A'} | ${customer?.phone || 'N/A'}`, 55, 82);

  // Items Table with Cost Analysis
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || 0) / 100;
    const unitCost = (item.cost_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const lineCost = quantity * unitCost;
    const lineProfit = lineTotal - lineCost;
    const marginPercent = lineTotal > 0 ? (lineProfit / lineTotal * 100) : 0;
    const description = formatProductDescription(item, false);

    return [
      description,
      quantity.toString(),
      `$${unitCost.toFixed(2)}`,
      `$${unitPrice.toFixed(2)}`,
      `$${lineTotal.toFixed(2)}`,
      `$${lineProfit.toFixed(2)}`,
      `${marginPercent.toFixed(1)}%`
    ];
  });

  doc.autoTable({
    startY: 98,
    head: [['Description', 'Qty', 'Cost', 'Price', 'Total', 'Profit', 'Margin']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [185, 28, 28],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    didParseCell: function(data) {
      // Color code margin column
      if (data.section === 'body' && data.column.index === 6) {
        const marginValue = parseFloat(data.cell.raw);
        if (marginValue < 20) {
          data.cell.styles.textColor = [220, 38, 38]; // Red
        } else if (marginValue < 30) {
          data.cell.styles.textColor = [234, 179, 8]; // Yellow
        } else {
          data.cell.styles.textColor = [22, 163, 74]; // Green
        }
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Financial Summary
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const totalCost = items.reduce((sum, item) => sum + ((item.quantity || 1) * ((item.cost_cents || 0) / 100)), 0);
  const discountAmount = (quote.discount_cents || 0) / 100;
  const taxRatePercent = getTaxRatePercent(quote.tax_rate);
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const grossProfit = subtotal - totalCost - discountAmount;
  const marginPercent = subtotal > 0 ? (grossProfit / subtotal * 100) : 0;

  let summaryY = doc.lastAutoTable.finalY + 10;

  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.text('FINANCIAL SUMMARY', 14, summaryY);

  // Two column layout for financials
  const col1X = 14;
  const col2X = 120;
  summaryY += 8;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);

  // Left Column - Revenue
  doc.text('Subtotal:', col1X, summaryY);
  doc.text(`$${subtotal.toFixed(2)}`, col1X + 50, summaryY, { align: 'right' });

  if (discountAmount > 0) {
    summaryY += 5;
    doc.text('Discount:', col1X, summaryY);
    doc.text(`-$${discountAmount.toFixed(2)}`, col1X + 50, summaryY, { align: 'right' });
  }

  summaryY += 5;
  doc.text(`Tax (${taxRatePercent.toFixed(0)}%):`, col1X, summaryY);
  doc.text(`$${taxAmount.toFixed(2)}`, col1X + 50, summaryY, { align: 'right' });

  summaryY += 6;
  doc.setFont(undefined, 'bold');
  doc.text('Total Revenue:', col1X, summaryY);
  doc.text(`$${total.toFixed(2)}`, col1X + 50, summaryY, { align: 'right' });

  // Right Column - Profit Analysis (in colored box)
  const profitBoxY = doc.lastAutoTable.finalY + 16;

  // Color based on margin
  let boxColor;
  if (marginPercent < 20) {
    boxColor = [254, 226, 226]; // Light red
  } else if (marginPercent < 30) {
    boxColor = [254, 249, 195]; // Light yellow
  } else {
    boxColor = [220, 252, 231]; // Light green
  }

  doc.setFillColor(...boxColor);
  doc.rect(col2X - 5, profitBoxY, 80, 28, 'F');

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);

  let profitY = profitBoxY + 7;
  doc.text('Total Cost:', col2X, profitY);
  doc.text(`$${totalCost.toFixed(2)}`, 190, profitY, { align: 'right' });

  profitY += 6;
  doc.setFont(undefined, 'bold');
  doc.text('Gross Profit:', col2X, profitY);

  // Color code profit
  if (marginPercent < 20) {
    doc.setTextColor(185, 28, 28);
  } else if (marginPercent < 30) {
    doc.setTextColor(161, 98, 7);
  } else {
    doc.setTextColor(22, 101, 52);
  }
  doc.text(`$${grossProfit.toFixed(2)}`, 190, profitY, { align: 'right' });

  profitY += 6;
  doc.text('Margin:', col2X, profitY);
  doc.text(`${marginPercent.toFixed(1)}%`, 190, profitY, { align: 'right' });

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  // Footer
  doc.setPage(totalPages);
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text('CONFIDENTIAL - INTERNAL USE ONLY', 105, pageHeight - 12, { align: 'center' });

  return doc;
};

// ===================================
// EMAIL QUOTE PDF
// ===================================
export const emailQuotePDF = async (quoteId, emailData) => {
  try {
    logger.log('Sending email for quote:', quoteId);

    const response = await fetch(`${API_BASE}/quotations/${quoteId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send email');
    }

    const result = await response.json();
    logger.log('Email sent successfully:', result);
    return result;
  } catch (error) {
    handleApiError(error, { context: 'Send quote email' });
    throw error;
  }
};
