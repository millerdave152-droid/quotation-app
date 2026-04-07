import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logger from '../utils/logger';
import companyConfig from '../config/companyConfig';
import { handleApiError } from '../utils/errorHandler';
import { toast } from '../components/ui/Toast';

import { authFetch } from './authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || ''}/api`;

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// ===================================
// FETCH QUOTE ADD-ONS (revenue features)
// ===================================
const fetchQuoteAddOns = async (quoteId, headers) => {
  const addOns = { warranties: [], delivery: null, rebates: [], tradeIns: [], financing: null };
  try {
    const [warRes, delRes, rebRes, tiRes, finRes] = await Promise.allSettled([
      authFetch(`${API_BASE}/quotations/${quoteId}/warranties`, { headers }),
      authFetch(`${API_BASE}/quotations/${quoteId}/delivery`, { headers }),
      authFetch(`${API_BASE}/quotations/${quoteId}/rebates`, { headers }),
      authFetch(`${API_BASE}/quotations/${quoteId}/trade-ins`, { headers }),
      authFetch(`${API_BASE}/quotations/${quoteId}/financing`, { headers })
    ]);
    const extract = async (res) => {
      if (res.status !== 'fulfilled' || !res.value.ok) return null;
      const json = await res.value.json();
      return json?.data || json;
    };
    addOns.warranties = (await extract(warRes)) || [];
    addOns.delivery = await extract(delRes);
    addOns.rebates = (await extract(rebRes)) || [];
    addOns.tradeIns = (await extract(tiRes)) || [];
    addOns.financing = await extract(finRes);
  } catch (err) {
    logger.error('Error fetching quote add-ons for PDF:', err);
  }
  return addOns;
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
    const quoteResponse = await authFetch(`${API_BASE}/quotations/${quoteId}`, { headers });
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote: ${quoteResponse.status}`);
    }
    const quoteJson = await quoteResponse.json();
    const quote = quoteJson.data || quoteJson; // Handle wrapped response

    // Fetch customer data
    const customerResponse = await authFetch(`${API_BASE}/customers/${quote.customer_id}`, { headers });
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customerJson = await customerResponse.json();
    // API returns { data: { customer: {...}, quotes: [...], stats: {...} } }
    const customerData = customerJson.data || customerJson;
    const customer = customerData.customer || customerData; // Extract nested customer object

    // Fetch quote items
    const itemsResponse = await authFetch(`${API_BASE}/quotations/${quoteId}/items`, { headers });
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const itemsJson = await itemsResponse.json();
    const items = itemsJson.data || itemsJson; // Handle wrapped response

    if (!items || items.length === 0) {
      toast.warning('This quote has no items. Please add products before previewing.', 'Empty Quote');
      return;
    }

    // Fetch revenue feature add-ons
    const addOns = await fetchQuoteAddOns(quoteId, headers);

    // Generate PDF based on type
    const doc = type === 'internal'
      ? generateInternalPDF(quote, customer, items, addOns)
      : generateCustomerPDF(quote, customer, items, addOns);

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
    const quoteResponse = await authFetch(`${API_BASE}/quotations/${quoteId}`, { headers });
    if (!quoteResponse.ok) {
      throw new Error(`Failed to fetch quote: ${quoteResponse.status}`);
    }
    const quoteJson = await quoteResponse.json();
    const quote = quoteJson.data || quoteJson; // Handle wrapped response

    // Fetch customer data
    const customerResponse = await authFetch(`${API_BASE}/customers/${quote.customer_id}`, { headers });
    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer`);
    }
    const customerJson = await customerResponse.json();
    // API returns { data: { customer: {...}, quotes: [...], stats: {...} } }
    const customerData = customerJson.data || customerJson;
    const customer = customerData.customer || customerData; // Extract nested customer object

    // Fetch quote items
    const itemsResponse = await authFetch(`${API_BASE}/quotations/${quoteId}/items`, { headers });
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch quote items`);
    }
    const itemsJson = await itemsResponse.json();
    const items = itemsJson.data || itemsJson; // Handle wrapped response

    if (!items || items.length === 0) {
      toast.warning('This quote has no items. Please add products before downloading PDF.', 'Empty Quote');
      return;
    }

    // Fetch revenue feature add-ons
    const addOns = await fetchQuoteAddOns(quoteId, headers);

    const doc = type === 'internal'
      ? generateInternalPDF(quote, customer, items, addOns)
      : generateCustomerPDF(quote, customer, items, addOns);

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
  primary: [53, 99, 233],       // Blue #3563E9
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
export const generateCustomerPDF = (quote, customer, items, addOns = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const hideModelNumbers = quote.hide_model_numbers || false;
  const expiryDate = quote.quote_expiry_date || quote.expires_at || new Date(Date.now() + 14*24*60*60*1000);
  const { address, contact } = companyConfig;
  const hstNumber = companyConfig.business?.hstNumber || '802845461RT0001';

  // Currency formatter from cents
  const fmtDollars = (cents) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ========== TOP ACCENT BAR (4mm) ==========
  doc.setFillColor(...colors.primary);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // ========== HEADER SECTION (Sales Order style) ==========
  // "Teletime" left-aligned
  doc.setFontSize(26);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('Teletime', 14, 18);

  // "Quotation" right-aligned
  doc.setFontSize(22);
  doc.setFont(undefined, 'bolditalic');
  doc.setTextColor(...colors.primary);
  doc.text('Quotation', pageWidth - 14, 18, { align: 'right' });

  // "Teletime Superstores" below
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('Teletime Superstores', 14, 28);

  // Tagline italic
  doc.setFontSize(8);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(...colors.textMuted);
  doc.text('TVs-Electronics-Appliances-Furniture', 14, 35);

  // Centered company info block
  const addrBlockY = 42;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textMuted);
  doc.text(`${address.street}, ${address.city}, ${address.province} ${address.postalCode}`, pageWidth / 2, addrBlockY, { align: 'center' });
  doc.text(`TEL: ${contact.phone}`, pageWidth / 2, addrBlockY + 5, { align: 'center' });
  doc.text(`${contact.website}, Email: ${contact.email}`, pageWidth / 2, addrBlockY + 10, { align: 'center' });
  doc.setFont(undefined, 'bold');
  doc.text(`HST #: ${hstNumber}`, pageWidth / 2, addrBlockY + 15, { align: 'center' });

  // ========== EXPIRY WARNING ==========
  let currentY = 64;
  currentY = addExpiryWarning(doc, expiryDate, currentY);

  // ========== 3-SECTION CUSTOMER INFO (autoTable) ==========
  const customerName = customer?.name || 'Customer';
  const customerEmail = customer?.email || '';
  const customerPhone = customer?.phone || '';
  const customerAddress = customer?.address || '';
  const customerCity = customer?.city || '';
  const customerProvince = customer?.province || '';
  const customerPostalCode = customer?.postal_code || '';
  const customerCompany = customer?.company || '';
  const locationParts = [customerCity, customerProvince, customerPostalCode].filter(Boolean);
  const customerLocation = locationParts.join(', ');

  const quoteNumber = quote.quote_number || `QT-2025-${String(quote.id).padStart(4, '0')}`;
  const createdDate = quote.created_at ? new Date(quote.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
  const expiryDateStr = new Date(expiryDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  const quoteStatus = (quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1);

  // Build BILL TO content
  const billToLines = [customerName];
  if (customerCompany) billToLines.push(customerCompany);
  if (customerAddress) billToLines.push(customerAddress);
  if (customerLocation) billToLines.push(customerLocation);

  // Build CONTACT content
  const contactLines = [customerName, `Tel: ${customerPhone || 'N/A'}`, `Email: ${customerEmail || 'N/A'}`];
  if (quote.sales_rep_name) contactLines.push(`Sales Rep: ${quote.sales_rep_name}`);

  // Build QUOTE DETAILS content
  const detailLines = [`Quote No: ${quoteNumber}`, `Date: ${createdDate}`, `Valid Until: ${expiryDateStr}`, `Status: ${quoteStatus}`];

  doc.autoTable({
    startY: currentY,
    head: [['BILL TO', 'CONTACT', 'QUOTE DETAILS']],
    body: [[
      billToLines.join('\n'),
      contactLines.join('\n'),
      detailLines.join('\n')
    ]],
    theme: 'plain',
    headStyles: {
      fillColor: colors.primary,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: colors.text,
      fillColor: colors.bgLight,
      lineWidth: 0.3,
      lineColor: colors.border
    },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 60 },
      2: { cellWidth: 60 }
    },
    margin: { left: 14, right: 14 },
    didParseCell: function(data) {
      if (data.section === 'body') {
        // Make first line of each cell bold
        data.cell.styles.cellPadding = { top: 4, right: 4, bottom: 4, left: 4 };
      }
    }
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // ========== ITEMS TABLE ==========
  const tableData = items.map(item => {
    const unitPrice = (item.sell_cents || item.unit_price_cents || 0) / 100;
    const quantity = item.quantity || 1;
    const lineTotal = (item.line_total_cents || 0) / 100 || (quantity * unitPrice);
    const discountPct = item.discount_percent || 0;
    const description = formatProductDescription(item, hideModelNumbers);

    if (hideModelNumbers) {
      return [
        quantity.toString(),
        description.substring(0, 80),
        `$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        discountPct > 0 ? `${discountPct}%` : '-',
        `$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ];
    }

    const manufacturer = item.manufacturer || '-';
    const model = (item.model && item.model !== 'undefined') ? item.model : '';

    return [
      quantity.toString(),
      description.substring(0, 45),
      manufacturer.substring(0, 12),
      model.substring(0, 15),
      `$${unitPrice.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      discountPct > 0 ? `${discountPct}%` : '-',
      `$${lineTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ];
  });

  // Add add-on rows to table
  const totalCols = hideModelNumbers ? 5 : 7;
  const hasAddOns = addOns.warranties?.length > 0 || addOns.delivery || addOns.tradeIns?.length > 0 || addOns.rebates?.length > 0;

  if (hasAddOns) {
    tableData.push([{ content: 'ADD-ONS & ADJUSTMENTS', colSpan: totalCols, styles: { fillColor: [240, 253, 244], fontStyle: 'bold', textColor: [22, 101, 52], fontSize: 7 } }]);
  }

  (addOns.warranties || []).forEach(w => {
    const warnName = w.product_name || w.warranty_type || 'Extended Warranty';
    const yearsLabel = w.warranty_years ? ` (${w.warranty_years} ${w.warranty_years === 1 ? 'Year' : 'Years'})` : '';
    const productLabel = w.covered_product_model
      ? `${w.covered_product_manufacturer || ''} ${w.covered_product_model}`.trim()
      : [w.manufacturer, w.model].filter(Boolean).join(' ');
    const detail = [productLabel ? `For: ${productLabel}` : '', w.provider ? `Provider: ${w.provider}` : ''].filter(Boolean).join(' · ');
    if (hideModelNumbers) {
      tableData.push(['1', `${warnName}${yearsLabel}`, fmtDollars(w.warranty_cost_cents || 0), '-', `+${fmtDollars(w.warranty_cost_cents || 0)}`]);
    } else {
      tableData.push(['1', `${warnName}${yearsLabel}${detail ? ' - ' + detail : ''}`, '', 'WRN', fmtDollars(w.warranty_cost_cents || 0), '-', `+${fmtDollars(w.warranty_cost_cents || 0)}`]);
    }
  });

  if (addOns.delivery) {
    const del = addOns.delivery;
    const totalCents = del.total_delivery_cost_cents || del.delivery_cost_cents || 0;
    if (hideModelNumbers) {
      tableData.push(['1', `Delivery: ${del.delivery_type || 'Standard'}`, fmtDollars(totalCents), '-', `+${fmtDollars(totalCents)}`]);
    } else {
      tableData.push(['1', `Delivery: ${del.delivery_type || 'Standard'}`, '', 'DLV', fmtDollars(totalCents), '-', `+${fmtDollars(totalCents)}`]);
    }
  }

  (addOns.tradeIns || []).forEach(t => {
    const label = `Trade-In: ${[t.brand, t.model, t.item_type].filter(Boolean).join(' ')}`;
    if (hideModelNumbers) {
      tableData.push(['1', label, '', '-', `-${fmtDollars(t.trade_in_value_cents || 0)}`]);
    } else {
      tableData.push(['1', label, '', 'TRD', '', '-', `-${fmtDollars(t.trade_in_value_cents || 0)}`]);
    }
  });

  (addOns.rebates || []).forEach(r => {
    if (hideModelNumbers) {
      tableData.push(['1', r.rebate_name || 'Manufacturer Rebate', '', '-', `-${fmtDollars(r.rebate_amount_cents || 0)}`]);
    } else {
      tableData.push(['1', r.rebate_name || 'Manufacturer Rebate', '', 'REB', '', '-', `-${fmtDollars(r.rebate_amount_cents || 0)}`]);
    }
  });

  if (addOns.financing) {
    const fin = addOns.financing;
    const finLabel = fin.plan_name || fin.financing_type || 'Financing';
    const aprVal = fin.apr_percent != null ? parseFloat(fin.apr_percent) : (fin.interest_rate || 0);
    const detail = `${finLabel} - ${fin.term_months || 0}mo @ ${aprVal}%${fin.provider ? ` · ${fin.provider}` : ''}`;
    const monthly = fin.monthly_payment_cents ? `${fmtDollars(fin.monthly_payment_cents)}/mo` : '';
    tableData.push([{ content: `Financing: ${detail}  ${monthly}`, colSpan: totalCols, styles: { fillColor: [254, 252, 232], fontStyle: 'italic', textColor: [133, 77, 14], fontSize: 7 } }]);
  }

  const tableHead = hideModelNumbers
    ? [['QTY', 'DESCRIPTION', 'PRICE', 'DISC', 'AMOUNT']]
    : [['QTY', 'DESCRIPTION', 'BRAND', 'MODEL', 'PRICE', 'DISC', 'AMOUNT']];

  const tableColumnStyles = hideModelNumbers
    ? {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },  // QTY
      1: { cellWidth: 106, halign: 'left' },                       // DESCRIPTION (wider)
      2: { cellWidth: 24, halign: 'right' },                       // PRICE
      3: { cellWidth: 16, halign: 'center' },                      // DISC
      4: { cellWidth: 27, halign: 'right', fontStyle: 'bold' }     // AMOUNT
    }
    : {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },  // QTY
      1: { cellWidth: 60, halign: 'left' },                        // DESCRIPTION
      2: { cellWidth: 22, halign: 'left' },                        // BRAND
      3: { cellWidth: 24, halign: 'left' },                        // MODEL
      4: { cellWidth: 24, halign: 'right' },                       // PRICE
      5: { cellWidth: 16, halign: 'center' },                      // DISC
      6: { cellWidth: 27, halign: 'right', fontStyle: 'bold' }     // AMOUNT
    };

  const discColIndex = hideModelNumbers ? 3 : 5;

  doc.autoTable({
    startY: currentY,
    head: tableHead,
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
    columnStyles: tableColumnStyles,
    margin: { left: 14, right: 14 },
    tableLineWidth: 0,
    didParseCell: function(data) {
      if (data.section === 'head') {
        const colIndex = data.column.index;
        if (colIndex === 0 || colIndex === discColIndex) {
          data.cell.styles.halign = 'center';
        } else if (colIndex === discColIndex - 1 || colIndex === discColIndex + 1) {
          data.cell.styles.halign = 'right';
        } else {
          data.cell.styles.halign = 'left';
        }
      }
      // Color discount column red
      if (data.section === 'body' && data.column.index === discColIndex) {
        const val = data.cell.raw;
        if (val && val !== '-') {
          data.cell.styles.textColor = colors.error;
        }
      }
    }
  });

  // ========== TOTALS SECTION (right-aligned, no card) ==========
  const subtotal = (quote.subtotal_cents || 0) / 100;
  const discountPercent = parseFloat(quote.discount_percent) || 0;
  const discountAmount = (quote.discount_cents || 0) / 100;
  const taxRatePercent = getTaxRatePercent(quote.tax_rate);
  const taxAmount = (quote.tax_cents || 0) / 100;
  const total = (quote.total_cents || 0) / 100;
  const taxName = companyConfig.tax.taxName || 'HST';
  const ehfCents = quote.ehf_cents || 0;

  const wTotal = (addOns.warranties || []).reduce((s, w) => s + (w.warranty_cost_cents || 0), 0);
  const dTotal = addOns.delivery ? (addOns.delivery.total_delivery_cost_cents || addOns.delivery.delivery_cost_cents || 0) : 0;
  const tiTotal = (addOns.tradeIns || []).reduce((s, t) => s + (t.trade_in_value_cents || 0), 0);
  const rTotal = (addOns.rebates || []).reduce((s, r) => s + (r.rebate_amount_cents || 0), 0);

  let totalsY = doc.lastAutoTable.finalY + 6;
  const labelX = 130;
  const amountX = pageWidth - 14;
  let lineY = totalsY;

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');

  // Subtotal
  doc.setTextColor(...colors.textMuted);
  doc.text('Subtotal', labelX, lineY);
  doc.setTextColor(...colors.text);
  doc.text(`$${subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

  // Discount (if any)
  if (discountAmount > 0) {
    lineY += 7;
    doc.setTextColor(...colors.error);
    doc.text(`Discount (${discountPercent}%)`, labelX, lineY);
    doc.text(`-$${discountAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Warranties (+)
  if (wTotal > 0) {
    lineY += 7;
    doc.setTextColor(22, 101, 52);
    doc.text('Warranties', labelX, lineY);
    doc.text(`+$${(wTotal / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Delivery (+)
  if (dTotal > 0) {
    lineY += 7;
    doc.setTextColor(22, 101, 52);
    doc.text('Delivery', labelX, lineY);
    doc.text(`+$${(dTotal / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Trade-In (-)
  if (tiTotal > 0) {
    lineY += 7;
    doc.setTextColor(37, 99, 235);
    doc.text('Trade-In Credit', labelX, lineY);
    doc.text(`-$${(tiTotal / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Rebates (-)
  if (rTotal > 0) {
    lineY += 7;
    doc.setTextColor(37, 99, 235);
    doc.text('Rebates', labelX, lineY);
    doc.text(`-$${(rTotal / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // EHF (if > 0)
  if (ehfCents > 0) {
    lineY += 7;
    doc.setTextColor(146, 64, 14);
    doc.text('Env. Handling Fee (EHF)', labelX, lineY);
    doc.text(`$${(ehfCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });
  }

  // Tax
  lineY += 7;
  doc.setTextColor(...colors.textMuted);
  doc.text(`${taxName} (${taxRatePercent.toFixed(0)}%)`, labelX, lineY);
  doc.setTextColor(...colors.text);
  doc.text(`$${taxAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

  // Divider line before TOTAL
  lineY += 4;
  doc.setDrawColor(...colors.borderMedium);
  doc.setLineWidth(0.5);
  doc.line(labelX, lineY, amountX, lineY);

  // TOTAL DUE
  lineY += 8;
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('TOTAL', labelX, lineY);
  doc.text(`$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, amountX, lineY, { align: 'right' });

  const totalsEndY = lineY + 4;

  // ========== NOTES SECTION (left side, beside totals) ==========
  doc.setTextColor(...colors.text);

  if (quote.notes && quote.notes.trim()) {
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('NOTES', 14, totalsY);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colors.textSecondary);
    const splitNotes = doc.splitTextToSize(quote.notes, 100);
    doc.text(splitNotes.slice(0, 5), 14, totalsY + 6);
  }

  // ========== FINANCING BOX (if financing exists) ==========
  let financingEndY = totalsEndY;
  if (addOns.financing) {
    const fin = addOns.financing;
    const finBoxY = totalsEndY + 6;

    // Check page overflow
    if (finBoxY > pageHeight - 100) {
      doc.addPage();
      financingEndY = 20;
    } else {
      financingEndY = finBoxY;
    }

    // Light blue box
    doc.setFillColor(240, 247, 255);   // #f0f7ff
    doc.setDrawColor(147, 197, 253);   // #93c5fd
    doc.roundedRect(14, financingEndY, 182, 20, 3, 3, 'FD');

    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(30, 64, 175); // #1e40af
    doc.text('FINANCING TERMS', 18, financingEndY + 5);

    const aprVal = fin.apr_percent != null ? parseFloat(fin.apr_percent) : (fin.interest_rate || 0);
    const providerName = fin.provider ? fin.provider.charAt(0).toUpperCase() + fin.provider.slice(1) : 'Flexiti';

    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.text);
    const finInfoY = financingEndY + 12;
    doc.text(`Provider: ${providerName}`, 18, finInfoY);
    doc.text(`Plan: ${fin.plan_name || 'N/A'}`, 60, finInfoY);
    doc.text(`Term: ${fin.term_months || 0} months`, 108, finInfoY);
    doc.text(`Rate: ${aprVal.toFixed(1)}%`, 145, finInfoY);
    if (fin.monthly_payment_cents) {
      doc.setFont(undefined, 'bold');
      doc.text(`Monthly: ${fmtDollars(fin.monthly_payment_cents)}`, 165, finInfoY);
    }

    financingEndY += 26;
  }

  // ========== TERMS & CONDITIONS (comprehensive Teletime terms) ==========
  let termsY = Math.max(financingEndY, totalsEndY) + 8;
  if (termsY > pageHeight - 80) {
    doc.addPage();
    termsY = 20;
  }

  // Determine whether to use comprehensive terms
  const defaultTermsText = 'Payment due within 30 days';
  const useComprehensiveTerms = !quote.terms || quote.terms === defaultTermsText || quote.terms === companyConfig.quotes.defaultTerms;

  const comprehensiveTerms = [
    'EXCHANGES: 15 days from delivery/invoice in unused original condition with all packaging. 20% restocking fee applies on non-defective items.',
    'MATTRESSES: 90-Night Comfort Guarantee with mattress protector purchase (min. 21 nights slept on; one-time exchange; delivery fee applies).',
    'DEFECTIVE/DOA: Report within 72 hours of delivery for exchange or repair at no charge. After 72 hours, manufacturer warranty applies. Appliances once installed or used are covered under manufacturer warranty only.',
    'DEPOSITS & CANCELLATIONS: All deposits are non-refundable. A 20% cancellation fee applies to orders already placed with suppliers.',
    'DELIVERY: Standard delivery to front door only. Damage to property or goods beyond front door entry is the customer\'s responsibility. Ensure proper measurements before delivery - re-delivery due to sizing issues subject to a minimum $100.00 fee. Teletime is not responsible for removal of existing customer property.',
    'DAMAGE REPORTING: Inspect goods at delivery. Report visible damage at time of delivery; concealed damage within 72 hours. Unreported damage is not covered. Mishandled products are not covered under any warranty.',
    'PRICE MATCH: We match any authorized Canadian retailer\'s advertised price on the same brand/model within 30 days of purchase, with valid proof.',
    'FINAL SALE: Special/custom orders, clearance, floor models, opened bedding/accessories, and gift cards are non-refundable.',
    'WARRANTY: All products carry applicable manufacturer\'s warranty. Extended protection plans available - ask your sales associate.',
    'CONSUMER RIGHTS: These terms do not affect your rights under Ontario\'s Consumer Protection Act, 2002. For full terms visit www.teletime.ca'
  ];

  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.text);
  doc.text('TERMS & CONDITIONS', 14, termsY);
  termsY += 5;

  doc.setFontSize(5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...colors.textLight);

  if (useComprehensiveTerms) {
    for (const term of comprehensiveTerms) {
      if (termsY > pageHeight - 55) {
        doc.addPage();
        termsY = 20;
      }
      const splitTerm = doc.splitTextToSize(term, 182);
      doc.text(splitTerm, 14, termsY);
      termsY += splitTerm.length * 3 + 1;
    }
  } else {
    const splitTerms = doc.splitTextToSize(quote.terms, 182);
    doc.text(splitTerms, 14, termsY);
    termsY += splitTerms.length * 3 + 2;
  }

  // ========== DUAL SIGNATURE AREA ==========
  let signatureY = termsY + 6;
  if (signatureY > pageHeight - 50) {
    doc.addPage();
    signatureY = 20;
  }

  // Company Representative (left)
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.primaryLight);
  doc.text('COMPANY REPRESENTATIVE', 14, signatureY);

  doc.setDrawColor(...colors.borderMedium);
  doc.setLineWidth(0.5);
  doc.line(14, signatureY + 18, 99, signatureY + 18);
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.text);
  doc.text('Authorized Signature', 14, signatureY + 23);
  doc.text('Print Name: ________________________', 14, signatureY + 30);
  doc.text('Date: _____________________________', 14, signatureY + 37);

  // Customer Acceptance (right)
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...colors.success);
  doc.text('CUSTOMER ACCEPTANCE', 111, signatureY);

  doc.line(111, signatureY + 18, 196, signatureY + 18);
  doc.setFontSize(7);
  doc.setTextColor(...colors.text);
  doc.text('Authorized Signature', 111, signatureY + 23);
  doc.text('Print Name: ________________________', 111, signatureY + 30);
  doc.text('Date: _____________________________', 111, signatureY + 37);

  // Legal text below signatures
  const legalY = signatureY + 43;
  doc.setFontSize(6);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(...colors.textLight);
  doc.text('By signing above, customer agrees to the terms and conditions stated in this quotation.', pageWidth / 2, legalY, { align: 'center' });

  // ========== FOOTER ON ALL PAGES ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom accent line
    doc.setDrawColor(...colors.primary);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);

    // Left: Page X of Y
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.textLight);
    doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 10);

    // Center: HST #
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...colors.textMuted);
    doc.text(`HST #: ${hstNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Right: contact info
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.textLight);
    doc.text(`${contact.website} | ${contact.phone} | ${contact.email}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
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
export const generateInternalPDF = (quote, customer, items, addOns = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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

  // Add add-on rows to internal table
  const fmtD = (cents) => `$${(cents / 100).toFixed(2)}`;
  const hasInternalAddOns = addOns.warranties?.length > 0 || addOns.delivery || addOns.tradeIns?.length > 0 || addOns.rebates?.length > 0;

  if (hasInternalAddOns) {
    tableData.push([{ content: 'ADD-ONS & ADJUSTMENTS', colSpan: 9, styles: { fillColor: [240, 253, 244], fontStyle: 'bold', textColor: [22, 101, 52], fontSize: 6 } }]);
  }

  (addOns.warranties || []).forEach(w => {
    const c = w.warranty_cost_cents || 0;
    const warnName = w.product_name || w.warranty_type || 'Extended Warranty';
    const yearsLabel = w.warranty_years ? ` (${w.warranty_years}yr)` : '';
    tableData.push(['WRN', '', `${warnName}${yearsLabel}`, '1', '$0.00', fmtD(c), `+${fmtD(c)}`, fmtD(c), '100%']);
  });

  if (addOns.delivery) {
    const c = addOns.delivery.total_delivery_cost_cents || addOns.delivery.delivery_cost_cents || 0;
    tableData.push(['DLV', '', `Delivery: ${addOns.delivery.delivery_type || 'Standard'}`, '1', '$0.00', fmtD(c), `+${fmtD(c)}`, fmtD(c), '-']);
  }

  (addOns.tradeIns || []).forEach(t => {
    const c = t.trade_in_value_cents || 0;
    tableData.push(['TRD', '', `Trade-In: ${[t.brand, t.model].filter(Boolean).join(' ')}`, '1', '', '', `-${fmtD(c)}`, '', '-']);
  });

  (addOns.rebates || []).forEach(r => {
    const c = r.rebate_amount_cents || 0;
    tableData.push(['REB', '', r.rebate_name || 'Rebate', '1', '', '', `-${fmtD(c)}`, '', '-']);
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

    const response = await authFetch(`${API_BASE}/quotations/${quoteId}/send-email`, {
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
