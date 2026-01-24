import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logger from '../utils/logger';
import companyConfig from '../config/companyConfig';
import { handleApiError } from '../utils/errorHandler';
import { toast } from '../components/ui/Toast';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// ===================================
// PREVIEW QUOTE PDF (Opens in new tab)
// ===================================
export const previewQuotePDF = async (quoteId, type = 'customer') => {
  try {
    // Validate quoteId before making API call
    if (!quoteId || quoteId === 'undefined' || quoteId === 'null') {
      toast.error('Cannot preview PDF: Quote has not been saved yet. Please save the quote first.', 'No Quote Selected');
      return;
    }

    logger.log('Previewing quote:', quoteId, 'Type:', type);
    const headers = getAuthHeaders();

    // Fetch quote data
    const quoteResponse = await fetch(`${API_BASE}/quotations/${quoteId}`, { headers });
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote: ${quoteResponse.status}`);
    }
    const quoteJson = await quoteResponse.json();
    const quote = quoteJson.data || quoteJson; // Handle wrapped response

    // Fetch customer data
    const customerResponse = await fetch(`${API_BASE}/customers/${quote.customer_id}`, { headers });
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customerJson = await customerResponse.json();
    // API returns { data: { customer: {...}, quotes: [...], stats: {...} } }
    const customerData = customerJson.data || customerJson;
    const customer = customerData.customer || customerData; // Extract nested customer object

    // Fetch quote items
    const itemsResponse = await fetch(`${API_BASE}/quotations/${quoteId}/items`, { headers });
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const itemsJson = await itemsResponse.json();
    const items = itemsJson.data || itemsJson; // Handle wrapped response

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
    // Validate quoteId before making API call
    if (!quoteId || quoteId === 'undefined' || quoteId === 'null') {
      toast.error('Cannot download PDF: Quote has not been saved yet. Please save the quote first.', 'No Quote Selected');
      return;
    }

    logger.log('Downloading quote:', quoteId, 'Type:', type);
    const headers = getAuthHeaders();

    // Fetch quote data
    const quoteResponse = await fetch(`${API_BASE}/quotations/${quoteId}`, { headers });
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote: ${quoteResponse.status}`);
    }
    const quoteJson = await quoteResponse.json();
    console.log('[PDF Download] Raw quote response:', quoteJson);
    const quote = quoteJson.data || quoteJson; // Handle wrapped response
    console.log('[PDF Download] Extracted quote:', quote);

    // Fetch customer data
    const customerResponse = await fetch(`${API_BASE}/customers/${quote.customer_id}`, { headers });
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customerJson = await customerResponse.json();
    console.log('[PDF Download] Raw customer response:', customerJson);
    // API returns { data: { customer: {...}, quotes: [...], stats: {...} } }
    const customerData = customerJson.data || customerJson;
    const customer = customerData.customer || customerData; // Extract nested customer object
    console.log('[PDF Download] Extracted customer:', customer);

    // Fetch quote items
    const itemsResponse = await fetch(`${API_BASE}/quotations/${quoteId}/items`, { headers });
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const itemsJson = await itemsResponse.json();
    console.log('[PDF Download] Raw items response:', itemsJson);
    const items = itemsJson.data || itemsJson; // Handle wrapped response
    console.log('[PDF Download] Extracted items:', items);

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

  // Ensure taxRate is a number (handle string values from API/DB)
  const rate = parseFloat(taxRate);
  if (isNaN(rate)) return 13; // Default if invalid

  // If tax rate is already a percentage (>1), use it directly
  if (rate > 1) {
    return rate;
  }

  // If it's a decimal (0.13), multiply by 100
  return rate * 100;
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
// ENTERPRISE COLOR SCHEME
// ===================================
const colors = {
  primary: [30, 64, 175],       // Deep blue #1e40af
  primaryLight: [59, 130, 246], // Light blue #3b82f6
  text: [31, 41, 55],           // Near black #1f2937
  textSecondary: [55, 65, 81],  // Dark gray #374151
  textMuted: [107, 114, 128],   // Medium gray #6b7280
  textLight: [156, 163, 175],   // Light gray #9ca3af
  bgLight: [248, 250, 252],     // Off-white #f8fafc
  bgMuted: [250, 250, 250],     // Very light #fafafa
  border: [229, 231, 235],      // Light gray border #e5e7eb
  borderMedium: [209, 213, 219], // Medium border #d1d5db
  success: [16, 185, 129],      // Green #10b981
  error: [220, 38, 38],         // Red #dc2626
  warning: [245, 158, 11]       // Amber #f59e0b
};

// ===================================
// GENERATE CUSTOMER-FACING PDF (Enterprise Design)
// ===================================
export const generateCustomerPDF = (quote, customer, items) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const hideModelNumbers = quote.hide_model_numbers || false;
  const expiryDate = quote.quote_expiry_date || quote.expires_at || new Date(Date.now() + 14*24*60*60*1000);
  const { address, contact } = companyConfig;

  // ========== TOP ACCENT BAR (4pt) ==========
  doc.setFillColor(...colors.primary);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // ========== HEADER SECTION ==========
  // Company name / Logo (left side)
  const { logo } = companyConfig;
  if (logo.base64) {
    try {
      // Reset any stroke state before adding image
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0);
      // Auto-detect image format from base64 data URI
      const imageFormat = logo.base64.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logo.base64, imageFormat, 14, 12, logo.width || 40, logo.height || 20);
    } catch (e) {
      // Fallback to company name
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...colors.primary);
      doc.text(companyConfig.name, 14, 28);
    }
  } else {
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text(companyConfig.name, 14, 28);
  }

  // Company contact info (below logo/name) - positioned after logo height
  const logoBottomY = 12 + (logo.height || 20) + 4; // Logo Y + height + spacing
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);
  doc.text(address.street, 14, logoBottomY);
  doc.text(`${address.city}, ${address.province} ${address.postalCode}`, 14, logoBottomY + 5);
  doc.text(`${contact.phone} | ${contact.email}`, 14, logoBottomY + 10);

  // Quote Badge Box (right side)
  doc.setFillColor(...colors.bgLight);
  doc.setDrawColor(...colors.border);
  doc.roundedRect(145, 10, 50, 48, 3, 3, 'FD');

  // Badge content
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('QUOTATION', 170, 18, { align: 'center' });

  const quoteNumber = quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`;
  doc.setFontSize(10);
  doc.setTextColor(...colors.text);
  doc.text(quoteNumber, 170, 26, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);
  doc.text('Date:', 150, 35);
  doc.text('Valid Until:', 150, 41);
  doc.text('Status:', 150, 47);

  doc.setTextColor(...colors.text);
  doc.text(new Date(quote.created_at).toLocaleDateString('en-CA'), 190, 35, { align: 'right' });
  doc.text(new Date(expiryDate).toLocaleDateString('en-CA'), 190, 41, { align: 'right' });

  // Status with color
  const status = quote.status?.toUpperCase() || 'DRAFT';
  if (status === 'APPROVED' || status === 'ACCEPTED') {
    doc.setTextColor(...colors.success);
  } else if (status === 'REJECTED' || status === 'EXPIRED') {
    doc.setTextColor(...colors.error);
  } else {
    doc.setTextColor(...colors.text);
  }
  doc.text(status, 190, 47, { align: 'right' });

  // ========== EXPIRY WARNING ==========
  let currentY = 65; // Adjusted for taller header with logo
  currentY = addExpiryWarning(doc, expiryDate, currentY);

  // ========== CUSTOMER INFO CARD (Two Column) ==========
  const customerName = customer?.name || 'Customer';
  const customerEmail = customer?.email || '';
  const customerPhone = customer?.phone || '';
  const customerAddress = customer?.address || '';
  const customerCity = customer?.city || '';
  const customerProvince = customer?.province || '';
  const customerPostalCode = customer?.postal_code || '';
  const customerCompany = customer?.company || '';

  // Build full city/province/postal line
  const locationParts = [customerCity, customerProvince, customerPostalCode].filter(Boolean);
  const customerLocation = locationParts.join(', ');

  // Calculate card height - increased to fit all contact info
  let cardHeight = 48;
  if (customerAddress) cardHeight += 4;
  if (customerLocation) cardHeight += 4;

  doc.setFillColor(...colors.bgMuted);
  doc.setDrawColor(...colors.border);
  doc.roundedRect(14, currentY, 182, cardHeight, 4, 4, 'FD');

  // Left column - BILL TO
  const leftColX = 20;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('BILL TO', leftColX, currentY + 8);

  doc.setFontSize(10);
  doc.setTextColor(...colors.text);
  doc.text(customerName, leftColX, currentY + 15);

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textSecondary);
  let leftY = currentY + 21;

  if (customerCompany) {
    doc.text(customerCompany, leftColX, leftY);
    leftY += 4;
  }
  if (customerAddress) {
    doc.text(customerAddress, leftColX, leftY);
    leftY += 4;
  }
  if (customerLocation) {
    doc.text(customerLocation, leftColX, leftY);
    leftY += 4;
  }

  // Right column - CONTACT (Billing Contact Info)
  const rightColX = 115;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('CONTACT', rightColX, currentY + 8);

  let rightY = currentY + 15;
  doc.setFontSize(8);

  // Contact Name (billing contact person)
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.text);
  doc.text(customerName, rightColX, rightY);
  rightY += 5;

  // Phone
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textSecondary);
  if (customerPhone) {
    doc.text(`Tel: ${customerPhone}`, rightColX, rightY);
    rightY += 5;
  }

  // Email
  if (customerEmail) {
    doc.setTextColor(...colors.primaryLight);
    doc.text(customerEmail, rightColX, rightY);
    rightY += 5;
  }

  // Prepared by (Sales Rep)
  if (quote.sales_rep_name) {
    doc.setTextColor(...colors.textMuted);
    doc.text(`Prepared by: ${quote.sales_rep_name}`, rightColX, rightY);
  }

  currentY += cardHeight + 8;

  // ========== ITEMS TABLE (Enterprise Design) ==========
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || item.unit_price_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const lineDiscount = (item.discount_cents || 0) / 100;
    const discountPct = item.discount_percent || 0;
    const sku = item.sku || item.product_code || '-';
    const manufacturer = item.manufacturer || '-';
    const description = formatProductDescription(item, hideModelNumbers);

    return [
      sku.substring(0, 12),
      manufacturer.substring(0, 10),
      description.substring(0, 45),
      quantity.toString(),
      `$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      discountPct > 0 ? `${discountPct}%` : '-',
      `$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ];
  });

  doc.autoTable({
    startY: currentY,
    head: [['SKU', 'MFR', 'DESCRIPTION', 'QTY', 'PRICE', 'DISC', 'TOTAL']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: colors.primary,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
      valign: 'middle'
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 3,
      textColor: colors.text,
      valign: 'middle'
    },
    alternateRowStyles: {
      fillColor: colors.bgLight
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'left' },           // SKU - left
      1: { cellWidth: 20, halign: 'left' },           // MFR - left
      2: { cellWidth: 65, halign: 'left' },           // Description - left
      3: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, // Qty - center
      4: { cellWidth: 25, halign: 'right' },          // Price - right
      5: { cellWidth: 18, halign: 'center' },         // Disc - center
      6: { cellWidth: 27, halign: 'right', fontStyle: 'bold' }   // Total - right
    },
    margin: { left: 14, right: 14 },
    tableLineWidth: 0,  // Remove cell borders for cleaner look
    didParseCell: function(data) {
      // Match header alignment to body column alignment
      if (data.section === 'head') {
        const colIndex = data.column.index;
        if (colIndex === 3 || colIndex === 5) {
          data.cell.styles.halign = 'center';
        } else if (colIndex === 4 || colIndex === 6) {
          data.cell.styles.halign = 'right';
        } else {
          data.cell.styles.halign = 'left';
        }
      }
      // Color discount column red
      if (data.section === 'body' && data.column.index === 5) {
        const val = data.cell.raw;
        if (val && val !== '-') {
          data.cell.styles.textColor = colors.error;
        }
      }
    }
  });

  // ========== TOTALS CARD ==========
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const discountPercent = parseFloat(quote.discount_percent) || 0;
  const discountAmount = (quote.discount_cents || 0) / 100;
  const netAmount = subtotal - discountAmount;
  const taxRatePercent = getTaxRatePercent(quote.tax_rate);
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const taxName = companyConfig.tax.taxName || 'HST';

  let totalsY = doc.lastAutoTable.finalY + 6;
  const totalsCardX = 110;      // Moved left for more room
  const totalsCardWidth = 86;   // Wider card to fit amounts
  let totalsCardHeight = 52;    // Taller for better spacing
  if (discountAmount > 0) totalsCardHeight += 16;

  // Totals card background (fill only, no border line)
  doc.setFillColor(...colors.bgLight);
  doc.roundedRect(totalsCardX, totalsY, totalsCardWidth, totalsCardHeight, 3, 3, 'F');

  const labelX = totalsCardX + 6;
  const amountX = totalsCardX + totalsCardWidth - 6;
  let lineY = totalsY + 10;

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');

  // Subtotal
  doc.setTextColor(...colors.textMuted);
  doc.text('Subtotal', labelX, lineY);
  doc.setTextColor(...colors.text);
  doc.text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

  // Discount (if any)
  if (discountAmount > 0) {
    lineY += 9;
    doc.setTextColor(...colors.error);
    doc.text(`Discount (${discountPercent}%)`, labelX, lineY);
    doc.text(`-$${discountAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

    lineY += 9;
    doc.setTextColor(...colors.textMuted);
    doc.text('Net Amount', labelX, lineY);
    doc.setTextColor(...colors.text);
    doc.text(`$${netAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Tax
  lineY += 9;
  doc.setTextColor(...colors.textMuted);
  doc.text(`${taxName} (${taxRatePercent.toFixed(0)}%)`, labelX, lineY);
  doc.setTextColor(...colors.text);
  doc.text(`$${taxAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

  // TOTAL DUE - Emphasized box
  lineY += 12;
  doc.setFillColor(...colors.primary);
  doc.roundedRect(labelX - 3, lineY - 6, totalsCardWidth - 6, 16, 2, 2, 'F');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL DUE', labelX, lineY + 2);
  doc.setFontSize(10);
  doc.text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX - 3, lineY + 2, { align: 'right' });

  // ========== NOTES SECTION ==========
  let contentY = totalsY;
  doc.setTextColor(...colors.text);

  if (quote.notes && quote.notes.trim()) {
    doc.setFillColor(...colors.bgMuted);
    doc.setDrawColor(...colors.border);
    doc.roundedRect(14, contentY, 100, 30, 3, 3, 'FD');

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('NOTES', 18, contentY + 7);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.textSecondary);
    const splitNotes = doc.splitTextToSize(quote.notes, 90);
    doc.text(splitNotes.slice(0, 4), 18, contentY + 13);
  }

  // ========== TERMS & CONDITIONS ==========
  let termsY = totalsY + totalsCardHeight + 10;
  if (termsY > pageHeight - 80) {
    doc.addPage();
    termsY = 20;
  }

  const terms = quote.terms || companyConfig.quotes.defaultTerms || 'Payment due within 30 days. All prices in CAD.';

  doc.setFillColor(...colors.bgLight);
  doc.setDrawColor(...colors.border);
  doc.roundedRect(14, termsY, 182, 28, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.textSecondary);
  doc.text('TERMS & CONDITIONS', 18, termsY + 7);

  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);
  const splitTerms = doc.splitTextToSize(terms, 175);
  doc.text(splitTerms.slice(0, 3), 18, termsY + 13);

  // ========== DUAL SIGNATURE AREA ==========
  let signatureY = termsY + 35;
  if (signatureY > pageHeight - 50) {
    doc.addPage();
    signatureY = 20;
  }

  // Company Representative (left)
  doc.setFillColor(...colors.primary);
  doc.rect(14, signatureY, 85, 5, 'F');
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('COMPANY REPRESENTATIVE', 18, signatureY + 3.5);

  doc.setDrawColor(...colors.borderMedium);
  doc.setLineWidth(0.3);
  doc.line(14, signatureY + 25, 99, signatureY + 25);
  doc.setFontSize(7);
  doc.setTextColor(...colors.textMuted);
  doc.text('Signature', 14, signatureY + 30);
  doc.text('Date: _______________', 14, signatureY + 36);

  // Customer Acceptance (right)
  doc.setFillColor(...colors.success);
  doc.rect(111, signatureY, 85, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('CUSTOMER ACCEPTANCE', 115, signatureY + 3.5);

  doc.line(111, signatureY + 25, 196, signatureY + 25);
  doc.setTextColor(...colors.textMuted);
  doc.text('Signature', 111, signatureY + 30);
  doc.text('Date: _______________', 111, signatureY + 36);

  // ========== FOOTER ON ALL PAGES ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom accent line
    doc.setDrawColor(...colors.primary);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);

    // Thank you message
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.textMuted);
    doc.text('Thank you for your business!', 14, pageHeight - 12);

    // Contact info center
    doc.setFontSize(7);
    doc.text(`${contact.phone} | ${contact.email}`, pageWidth / 2, pageHeight - 12, { align: 'center' });

    // Page number
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 12, { align: 'right' });
  }

  // ========== WATERMARK ==========
  if (quote.watermark_enabled !== false) {
    addWatermark(doc, 'QUOTATION', {
      color: [200, 200, 200],
      opacity: 0.04,
      rotation: -35,
      fontSize: 60
    });
  }

  return doc;
};

// ===================================
// GENERATE INTERNAL PDF (Enterprise Design)
// ===================================
export const generateInternalPDF = (quote, customer, items) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { address, contact } = companyConfig;

  // Internal colors (red accent)
  const internalColors = {
    primary: [153, 27, 27],      // Dark red #991b1b
    accent: [185, 28, 28],       // Red #b91c1c
    lightBg: [254, 242, 242],    // Light red bg #fef2f2
    border: [252, 165, 165]      // Red border #fca5a5
  };

  // ========== TOP ACCENT BAR (4pt) - RED for Internal ==========
  doc.setFillColor(...internalColors.accent);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // ========== HEADER SECTION ==========
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...internalColors.primary);
  doc.text('INTERNAL QUOTATION', 14, 20);

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);
  doc.text(`${companyConfig.name} - Cost Analysis Document`, 14, 27);

  // Confidential Badge (right side)
  doc.setFillColor(...internalColors.lightBg);
  doc.setDrawColor(...internalColors.border);
  doc.roundedRect(130, 10, 66, 22, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...internalColors.accent);
  doc.text('CONFIDENTIAL', 163, 18, { align: 'center' });
  doc.setFontSize(6);
  doc.setFont(undefined, 'normal');
  doc.text('DO NOT SHARE WITH CUSTOMER', 163, 25, { align: 'center' });

  // Quote Info Row
  let currentY = 38;
  doc.setFillColor(...colors.bgLight);
  doc.setDrawColor(...colors.border);
  doc.roundedRect(14, currentY, 182, 16, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);

  const quoteNumber = quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`;
  doc.text('Quote #:', 18, currentY + 7);
  doc.text('Date:', 65, currentY + 7);
  doc.text('Status:', 110, currentY + 7);
  doc.text('Created By:', 150, currentY + 7);

  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.text);
  doc.text(quoteNumber, 35, currentY + 7);
  doc.text(new Date(quote.created_at).toLocaleDateString('en-CA'), 78, currentY + 7);
  doc.text(quote.status?.toUpperCase() || 'DRAFT', 125, currentY + 7);
  doc.text(quote.sales_rep_name || 'System', 173, currentY + 7);

  currentY += 22;

  // ========== CUSTOMER INFO CARD ==========
  doc.setFillColor(...internalColors.lightBg);
  doc.setDrawColor(...internalColors.border);
  doc.roundedRect(14, currentY, 182, 26, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...internalColors.primary);
  doc.text('CUSTOMER', 18, currentY + 7);

  // Customer name and contact
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.text);
  const customerContactInfo = `${customer?.name || 'N/A'} | ${customer?.email || 'N/A'} | ${customer?.phone || 'N/A'}`;
  doc.text(customerContactInfo, 50, currentY + 7);

  // Customer address line
  doc.setFontSize(7);
  doc.setTextColor(...colors.textMuted);
  const addressParts = [customer?.address, customer?.city, customer?.province, customer?.postal_code].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'No address on file';
  doc.text(fullAddress, 50, currentY + 13);

  // CLV display if available
  if (customer?.clv_total_cents || customer?.total_purchases || customer?.clv_score) {
    const clvTotal = customer?.clv_total_cents ? `$${(customer.clv_total_cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}` :
                     customer?.clv_score ? `Score: ${customer.clv_score}` : 'N/A';
    doc.text(`CLV: ${clvTotal} | Segment: ${customer?.clv_segment || 'N/A'}`, 18, currentY + 20);
  }

  currentY += 32;

  // ========== ITEMS TABLE (Enhanced with Cost Analysis) ==========
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || 0) / 100;
    const unitCost = (item.cost_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const lineCost = quantity * unitCost;
    const lineProfit = lineTotal - lineCost;
    const marginPercent = lineTotal > 0 ? (lineProfit / lineTotal * 100) : 0;
    const sku = item.sku || item.product_code || '-';
    const manufacturer = item.manufacturer || '-';
    const description = formatProductDescription(item, false);

    return [
      sku.substring(0, 10),
      manufacturer.substring(0, 8),
      description.substring(0, 35),
      quantity.toString(),
      `$${unitCost.toFixed(2)}`,
      `$${unitPrice.toFixed(2)}`,
      `$${lineTotal.toFixed(2)}`,
      `$${lineProfit.toFixed(2)}`,
      `${marginPercent.toFixed(1)}%`
    ];
  });

  doc.autoTable({
    startY: currentY,
    head: [['SKU', 'MFR', 'DESCRIPTION', 'QTY', 'COST', 'PRICE', 'TOTAL', 'PROFIT', 'GP%']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: internalColors.accent,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 2,
      valign: 'middle'
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
      textColor: colors.text,
      valign: 'middle'
    },
    alternateRowStyles: {
      fillColor: [254, 249, 249]
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'left' },           // SKU - left
      1: { cellWidth: 16, halign: 'left' },           // MFR - left
      2: { cellWidth: 50, halign: 'left' },           // Description - left
      3: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, // Qty - center
      4: { cellWidth: 20, halign: 'right' },          // Cost - right
      5: { cellWidth: 20, halign: 'right' },          // Price - right
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },  // Total - right
      7: { cellWidth: 20, halign: 'right' },          // Profit - right
      8: { cellWidth: 16, halign: 'right', fontStyle: 'bold' }   // GP% - right
    },
    margin: { left: 14, right: 14 },
    tableLineWidth: 0,  // Remove cell borders for cleaner look
    didParseCell: function(data) {
      // Match header alignment to body column alignment
      if (data.section === 'head') {
        const colIndex = data.column.index;
        if (colIndex === 3) {
          data.cell.styles.halign = 'center';  // QTY centered
        } else if (colIndex >= 4) {
          data.cell.styles.halign = 'right';   // COST, PRICE, TOTAL, PROFIT, GP% right-aligned
        } else {
          data.cell.styles.halign = 'left';    // SKU, MFR, DESC left-aligned
        }
      }
      // Color code margin column
      if (data.section === 'body' && data.column.index === 8) {
        const marginValue = parseFloat(data.cell.raw);
        if (marginValue < 20) {
          data.cell.styles.textColor = colors.error;
        } else if (marginValue < 30) {
          data.cell.styles.textColor = colors.warning;
        } else {
          data.cell.styles.textColor = colors.success;
        }
      }
      // Color profit column
      if (data.section === 'body' && data.column.index === 7) {
        const profitStr = data.cell.raw.replace('$', '');
        const profitVal = parseFloat(profitStr);
        if (profitVal < 0) {
          data.cell.styles.textColor = colors.error;
        }
      }
    }
  });

  // ========== FINANCIAL SUMMARY ==========
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const totalCost = items.reduce((sum, item) => sum + ((item.quantity || 1) * ((item.cost_cents || 0) / 100)), 0);
  const discountAmount = (quote.discount_cents || 0) / 100;
  const discountPercent = parseFloat(quote.discount_percent) || 0;
  const taxRatePercent = getTaxRatePercent(quote.tax_rate);
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const grossProfit = subtotal - totalCost - discountAmount;
  const marginPercent = subtotal > 0 ? (grossProfit / subtotal * 100) : 0;

  let summaryY = doc.lastAutoTable.finalY + 8;

  // Left side - Revenue Summary
  doc.setFillColor(...colors.bgLight);
  doc.setDrawColor(...colors.border);
  doc.roundedRect(14, summaryY, 85, 50, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('REVENUE SUMMARY', 18, summaryY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  let leftY = summaryY + 16;

  doc.setTextColor(...colors.textMuted);
  doc.text('Subtotal:', 18, leftY);
  doc.setTextColor(...colors.text);
  doc.text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 90, leftY, { align: 'right' });

  if (discountAmount > 0) {
    leftY += 6;
    doc.setTextColor(...colors.error);
    doc.text(`Discount (${discountPercent}%):`, 18, leftY);
    doc.text(`-$${discountAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 90, leftY, { align: 'right' });
  }

  leftY += 6;
  doc.setTextColor(...colors.textMuted);
  doc.text(`Tax (${taxRatePercent.toFixed(0)}%):`, 18, leftY);
  doc.setTextColor(...colors.text);
  doc.text(`$${taxAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 90, leftY, { align: 'right' });

  leftY += 8;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.text('Total Revenue:', 18, leftY);
  doc.setTextColor(...colors.primary);
  doc.text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 90, leftY, { align: 'right' });

  // Right side - Profit Analysis (color-coded)
  let profitBoxColor;
  if (marginPercent < 20) {
    profitBoxColor = [254, 226, 226]; // Light red
  } else if (marginPercent < 30) {
    profitBoxColor = [254, 249, 195]; // Light yellow
  } else {
    profitBoxColor = [220, 252, 231]; // Light green
  }

  doc.setFillColor(...profitBoxColor);
  doc.setDrawColor(...colors.borderMedium);
  doc.roundedRect(105, summaryY, 91, 50, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');

  // Profit header color based on margin
  if (marginPercent < 20) {
    doc.setTextColor(...internalColors.primary);
  } else if (marginPercent < 30) {
    doc.setTextColor(161, 98, 7);
  } else {
    doc.setTextColor(22, 101, 52);
  }
  doc.text('PROFIT ANALYSIS', 109, summaryY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.text);
  let rightY = summaryY + 16;

  doc.text('Total Cost:', 109, rightY);
  doc.text(`$${totalCost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 190, rightY, { align: 'right' });

  rightY += 6;
  doc.setFont(undefined, 'bold');
  doc.text('Gross Profit:', 109, rightY);

  // Color code profit value
  if (marginPercent < 20) {
    doc.setTextColor(...internalColors.primary);
  } else if (marginPercent < 30) {
    doc.setTextColor(161, 98, 7);
  } else {
    doc.setTextColor(22, 101, 52);
  }
  doc.text(`$${grossProfit.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 190, rightY, { align: 'right' });

  rightY += 10;
  doc.setFontSize(12);
  doc.text('MARGIN:', 109, rightY);
  doc.text(`${marginPercent.toFixed(1)}%`, 190, rightY, { align: 'right' });

  // Margin indicator bar
  rightY += 6;
  doc.setFillColor(...colors.border);
  doc.roundedRect(109, rightY, 77, 4, 1, 1, 'F');

  // Fill based on margin (cap at 50% for display)
  const fillWidth = Math.min(marginPercent / 50 * 77, 77);
  if (marginPercent < 20) {
    doc.setFillColor(...colors.error);
  } else if (marginPercent < 30) {
    doc.setFillColor(...colors.warning);
  } else {
    doc.setFillColor(...colors.success);
  }
  doc.roundedRect(109, rightY, fillWidth, 4, 1, 1, 'F');

  // ========== FOOTER ON ALL PAGES ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom accent line (red for internal)
    doc.setDrawColor(...internalColors.accent);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);

    // Confidential warning
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...internalColors.accent);
    doc.text('CONFIDENTIAL - INTERNAL USE ONLY', 14, pageHeight - 12);

    // Generation timestamp
    doc.setFontSize(6);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.textMuted);
    doc.text(`Generated: ${new Date().toLocaleString('en-CA')}`, pageWidth / 2, pageHeight - 12, { align: 'center' });

    // Page number
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 12, { align: 'right' });
  }

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
      headers: getAuthHeaders(),
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
