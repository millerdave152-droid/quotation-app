/**
 * TeleTime - Pure Pricing Calculation Service
 *
 * Stateless pricing calculations for both Quotation and POS systems.
 * All monetary values are stored in CENTS (integers) to avoid floating-point issues.
 *
 * This module contains pure functions with no database dependencies,
 * making it easy to test and use from any context.
 */

// ============================================================================
// TAX RATES BY PROVINCE (Canada)
// ============================================================================

const TAX_RATES = {
  // HST provinces
  ON: { hst: 0.13, gst: 0, pst: 0, label: 'HST 13%' },
  NB: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  NL: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  NS: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },
  PE: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%' },

  // GST + PST provinces
  BC: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%' },
  MB: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%' },
  SK: { hst: 0, gst: 0.05, pst: 0.06, label: 'GST 5% + PST 6%' },
  QC: { hst: 0, gst: 0.05, pst: 0.09975, label: 'GST 5% + QST 9.975%' },

  // GST only
  AB: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  NT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  NU: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
  YT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%' },
};

// Default to Ontario
const DEFAULT_PROVINCE = 'ON';

// ============================================================================
// CUSTOMER TIER DEFINITIONS
// ============================================================================

const CUSTOMER_TIERS = {
  retail: { discountPercent: 0, label: 'Retail' },
  preferred: { discountPercent: 5, label: 'Preferred Customer' },
  wholesale: { discountPercent: 15, label: 'Wholesale' },
  dealer: { discountPercent: 20, label: 'Dealer' },
  vip: { discountPercent: 25, label: 'VIP' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Round cents to nearest integer (banker's rounding)
 */
function roundCents(cents) {
  if (cents == null || isNaN(cents)) return 0;
  return Math.round(cents);
}

/**
 * Convert dollars to cents
 */
function dollarsToCents(dollars) {
  if (dollars == null || isNaN(dollars)) return 0;
  return roundCents(parseFloat(dollars) * 100);
}

/**
 * Convert cents to dollars
 */
function centsToDollars(cents) {
  if (cents == null || isNaN(cents)) return 0;
  return cents / 100;
}

/**
 * Format cents as currency string
 */
function formatCurrency(cents) {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

/**
 * Validate numeric input
 */
function validateNumber(value, fieldName, options = {}) {
  const { allowNegative = false, allowZero = true, min, max } = options;

  if (value == null || isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  const numValue = Number(value);

  if (!allowNegative && numValue < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }

  if (!allowZero && numValue === 0) {
    throw new Error(`${fieldName} cannot be zero`);
  }

  if (min !== undefined && numValue < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && numValue > max) {
    throw new Error(`${fieldName} must be at most ${max}`);
  }

  return numValue;
}

// ============================================================================
// VOLUME BREAK PRICING
// ============================================================================

/**
 * Find applicable volume break price
 *
 * @param {number} basePriceCents - Base unit price in cents
 * @param {number} quantity - Quantity being purchased
 * @param {Array} volumeBreaks - Array of { minQty, priceCents } or { minQty, discountPercent }
 * @returns {Object} { priceCents, appliedBreak }
 */
function applyVolumeBreaks(basePriceCents, quantity, volumeBreaks = []) {
  if (!volumeBreaks || volumeBreaks.length === 0) {
    return { priceCents: basePriceCents, appliedBreak: null };
  }

  // Sort breaks by minQty descending to find highest applicable break
  const sortedBreaks = [...volumeBreaks].sort((a, b) => b.minQty - a.minQty);

  for (const breakItem of sortedBreaks) {
    if (quantity >= breakItem.minQty) {
      // If break specifies absolute price
      if (breakItem.priceCents !== undefined) {
        return {
          priceCents: breakItem.priceCents,
          appliedBreak: { ...breakItem, type: 'fixed_price' },
        };
      }
      // If break specifies discount percentage
      if (breakItem.discountPercent !== undefined) {
        const discount = basePriceCents * (breakItem.discountPercent / 100);
        return {
          priceCents: roundCents(basePriceCents - discount),
          appliedBreak: { ...breakItem, type: 'percentage' },
        };
      }
    }
  }

  return { priceCents: basePriceCents, appliedBreak: null };
}

// ============================================================================
// CUSTOMER TIER PRICING
// ============================================================================

/**
 * Apply customer tier discount to price
 *
 * @param {number} priceCents - Unit price in cents
 * @param {string} customerTier - Customer tier key
 * @param {Object} customTiers - Optional custom tier definitions
 * @returns {Object} { priceCents, tierDiscount, tierLabel }
 */
function applyCustomerTier(priceCents, customerTier, customTiers = null) {
  const tiers = customTiers || CUSTOMER_TIERS;
  const tier = tiers[customerTier] || tiers.retail;

  const discountAmount = roundCents(priceCents * (tier.discountPercent / 100));
  const finalPrice = priceCents - discountAmount;

  return {
    priceCents: finalPrice,
    tierDiscountCents: discountAmount,
    tierDiscountPercent: tier.discountPercent,
    tierLabel: tier.label,
  };
}

// ============================================================================
// LINE ITEM CALCULATION
// ============================================================================

/**
 * Calculate a single line item's pricing
 *
 * @param {Object} params
 * @param {number} params.unitPriceCents - Base unit price in cents
 * @param {number} params.quantity - Quantity
 * @param {number} params.discountPercent - Line discount percentage (0-100)
 * @param {number} params.discountAmountCents - Fixed line discount in cents
 * @param {number} params.costCents - Product cost for margin calculation
 * @param {Array} params.volumeBreaks - Volume break pricing
 * @param {string} params.customerTier - Customer tier for tier pricing
 * @param {boolean} params.isTaxExempt - Whether item is tax-exempt
 * @returns {Object} Line item calculation result
 */
function calculateLineItem({
  unitPriceCents = 0,
  quantity = 0,
  discountPercent = 0,
  discountAmountCents = 0,
  costCents = 0,
  volumeBreaks = [],
  customerTier = 'retail',
  isTaxExempt = false,
}) {
  // Validate inputs
  const validQty = validateNumber(quantity, 'Quantity', { allowZero: true, min: 0 });
  const validPrice = validateNumber(unitPriceCents, 'Unit price', { allowZero: true, min: 0 });
  const validDiscPct = validateNumber(discountPercent, 'Discount percent', { allowZero: true, min: 0, max: 100 });
  const validDiscAmt = validateNumber(discountAmountCents, 'Discount amount', { allowZero: true, min: 0 });

  // Handle zero quantity
  if (validQty === 0) {
    return {
      unitPriceCents: 0,
      effectiveUnitPriceCents: 0,
      quantity: 0,
      subtotalCents: 0,
      lineDiscountCents: 0,
      tierDiscountCents: 0,
      totalDiscountCents: 0,
      lineTotalCents: 0,
      costCents: 0,
      marginCents: 0,
      marginPercent: 0,
      isTaxExempt,
      volumeBreakApplied: null,
      tierLabel: 'Retail',
    };
  }

  // Step 1: Apply volume breaks to get effective unit price
  const volumeResult = applyVolumeBreaks(validPrice, validQty, volumeBreaks);
  const volumeAdjustedPrice = volumeResult.priceCents;

  // Step 2: Apply customer tier discount
  const tierResult = applyCustomerTier(volumeAdjustedPrice, customerTier);
  const effectivePrice = tierResult.priceCents;
  const tierDiscountPerUnit = tierResult.tierDiscountCents;

  // Step 3: Calculate subtotal before line discounts
  const subtotalCents = roundCents(effectivePrice * validQty);

  // Step 4: Apply line percentage discount
  let lineDiscountCents = 0;
  if (validDiscPct > 0) {
    lineDiscountCents = roundCents(subtotalCents * (validDiscPct / 100));
  }

  // Step 5: Apply fixed line discount
  lineDiscountCents += validDiscAmt;

  // Ensure discount doesn't exceed subtotal
  lineDiscountCents = Math.min(lineDiscountCents, subtotalCents);

  // Step 6: Calculate line total
  const lineTotalCents = subtotalCents - lineDiscountCents;

  // Step 7: Calculate margin (for internal use)
  const totalCostCents = roundCents(costCents * validQty);
  const marginCents = lineTotalCents - totalCostCents;
  const marginPercent = lineTotalCents > 0 ? (marginCents / lineTotalCents) * 100 : 0;

  // Total tier discount for this line
  const totalTierDiscountCents = roundCents(tierDiscountPerUnit * validQty);

  return {
    unitPriceCents: volumeAdjustedPrice,
    originalUnitPriceCents: validPrice,
    effectiveUnitPriceCents: effectivePrice,
    quantity: validQty,
    subtotalCents,
    lineDiscountCents,
    tierDiscountCents: totalTierDiscountCents,
    totalDiscountCents: lineDiscountCents + totalTierDiscountCents,
    lineTotalCents,
    costCents: totalCostCents,
    marginCents,
    marginPercent: roundCents(marginPercent * 100) / 100,
    isTaxExempt,
    volumeBreakApplied: volumeResult.appliedBreak,
    tierLabel: tierResult.tierLabel,
  };
}

// ============================================================================
// TAX CALCULATION
// ============================================================================

/**
 * Calculate taxes for a given amount
 *
 * @param {number} amountCents - Taxable amount in cents
 * @param {string} province - Province code
 * @param {boolean} isTaxExempt - Whether amount is tax-exempt
 * @returns {Object} Tax breakdown
 */
function calculateTaxes(amountCents, province = DEFAULT_PROVINCE, isTaxExempt = false) {
  if (isTaxExempt || amountCents <= 0) {
    return {
      province,
      taxLabel: isTaxExempt ? 'Tax Exempt' : (TAX_RATES[province] || TAX_RATES[DEFAULT_PROVINCE]).label,
      taxableAmountCents: 0,
      hstCents: 0,
      gstCents: 0,
      pstCents: 0,
      totalTaxCents: 0,
    };
  }

  const taxRates = TAX_RATES[province] || TAX_RATES[DEFAULT_PROVINCE];
  let hstCents = 0;
  let gstCents = 0;
  let pstCents = 0;

  if (taxRates.hst > 0) {
    hstCents = roundCents(amountCents * taxRates.hst);
  } else {
    if (taxRates.gst > 0) {
      gstCents = roundCents(amountCents * taxRates.gst);
    }
    if (taxRates.pst > 0) {
      // In Quebec, PST (QST) is calculated on subtotal + GST
      if (province === 'QC') {
        pstCents = roundCents((amountCents + gstCents) * taxRates.pst);
      } else {
        pstCents = roundCents(amountCents * taxRates.pst);
      }
    }
  }

  return {
    province,
    taxLabel: taxRates.label,
    taxableAmountCents: amountCents,
    hstCents,
    gstCents,
    pstCents,
    totalTaxCents: hstCents + gstCents + pstCents,
  };
}

// ============================================================================
// ORDER CALCULATION
// ============================================================================

/**
 * Calculate complete order pricing
 *
 * @param {Object} params
 * @param {Array} params.items - Array of line items
 * @param {number} params.orderDiscountPercent - Order-level percentage discount
 * @param {number} params.orderDiscountCents - Order-level fixed discount in cents
 * @param {string} params.province - Province code for tax calculation
 * @param {string} params.customerTier - Customer tier
 * @param {boolean} params.isTaxExempt - Whether entire order is tax-exempt
 * @returns {Object} Complete order calculation
 */
function calculateOrder({
  items = [],
  orderDiscountPercent = 0,
  orderDiscountCents = 0,
  province = DEFAULT_PROVINCE,
  customerTier = 'retail',
  isTaxExempt = false,
}) {
  // Validate order-level discounts
  const validOrderDiscPct = validateNumber(orderDiscountPercent, 'Order discount percent', { min: 0, max: 100 });
  const validOrderDiscAmt = validateNumber(orderDiscountCents, 'Order discount amount', { min: 0 });

  // Calculate each line item
  const calculatedItems = items.map((item, index) => {
    try {
      const calculation = calculateLineItem({
        unitPriceCents: item.unitPriceCents || 0,
        quantity: item.quantity || 0,
        discountPercent: item.discountPercent || 0,
        discountAmountCents: item.discountAmountCents || 0,
        costCents: item.costCents || 0,
        volumeBreaks: item.volumeBreaks || [],
        customerTier,
        isTaxExempt: item.isTaxExempt || isTaxExempt,
      });

      return {
        ...item,
        calculation,
      };
    } catch (error) {
      throw new Error(`Line item ${index + 1}: ${error.message}`);
    }
  });

  // Calculate subtotal (sum of all line totals)
  const subtotalCents = calculatedItems.reduce(
    (sum, item) => sum + item.calculation.lineTotalCents,
    0
  );

  // Calculate total line-level discounts
  const totalLineDiscountsCents = calculatedItems.reduce(
    (sum, item) => sum + item.calculation.lineDiscountCents,
    0
  );

  // Calculate total tier discounts
  const totalTierDiscountsCents = calculatedItems.reduce(
    (sum, item) => sum + item.calculation.tierDiscountCents,
    0
  );

  // Calculate order-level discount
  let orderDiscountTotalCents = 0;
  if (validOrderDiscPct > 0) {
    orderDiscountTotalCents = roundCents(subtotalCents * (validOrderDiscPct / 100));
  }
  orderDiscountTotalCents += validOrderDiscAmt;

  // Ensure order discount doesn't exceed subtotal
  orderDiscountTotalCents = Math.min(orderDiscountTotalCents, subtotalCents);

  // Calculate discounted subtotal
  const discountedSubtotalCents = subtotalCents - orderDiscountTotalCents;

  // Calculate taxable amount (excluding tax-exempt items)
  let taxableAmountCents;
  if (isTaxExempt) {
    taxableAmountCents = 0;
  } else {
    // Proportionally distribute order discount to taxable items
    const taxableSubtotal = calculatedItems
      .filter((item) => !item.calculation.isTaxExempt)
      .reduce((sum, item) => sum + item.calculation.lineTotalCents, 0);

    const taxableRatio = subtotalCents > 0 ? taxableSubtotal / subtotalCents : 0;
    const taxableOrderDiscount = roundCents(orderDiscountTotalCents * taxableRatio);
    taxableAmountCents = taxableSubtotal - taxableOrderDiscount;
  }

  // Calculate taxes
  const taxResult = calculateTaxes(taxableAmountCents, province, isTaxExempt);

  // Calculate grand total
  const grandTotalCents = discountedSubtotalCents + taxResult.totalTaxCents;

  // Calculate total margin
  const totalCostCents = calculatedItems.reduce(
    (sum, item) => sum + item.calculation.costCents,
    0
  );
  const totalMarginCents = discountedSubtotalCents - totalCostCents;
  const marginPercent = discountedSubtotalCents > 0
    ? (totalMarginCents / discountedSubtotalCents) * 100
    : 0;

  // Total all discounts
  const totalDiscountsCents = totalLineDiscountsCents + totalTierDiscountsCents + orderDiscountTotalCents;

  return {
    items: calculatedItems,
    itemCount: calculatedItems.length,
    totalQuantity: calculatedItems.reduce((sum, item) => sum + item.calculation.quantity, 0),

    // Subtotals
    subtotalCents,
    discountedSubtotalCents,

    // Discounts breakdown
    discounts: {
      lineDiscountsCents: totalLineDiscountsCents,
      tierDiscountsCents: totalTierDiscountsCents,
      orderDiscountCents: orderDiscountTotalCents,
      orderDiscountPercent: validOrderDiscPct,
      totalDiscountsCents,
    },

    // Taxes
    taxes: {
      ...taxResult,
      isTaxExempt,
    },

    // Totals
    grandTotalCents,

    // Margins (internal use)
    margins: {
      totalCostCents,
      totalMarginCents,
      marginPercent: roundCents(marginPercent * 100) / 100,
    },

    // Formatted values for display
    formatted: {
      subtotal: formatCurrency(subtotalCents),
      discountedSubtotal: formatCurrency(discountedSubtotalCents),
      lineDiscounts: formatCurrency(totalLineDiscountsCents),
      tierDiscounts: formatCurrency(totalTierDiscountsCents),
      orderDiscount: formatCurrency(orderDiscountTotalCents),
      totalDiscounts: formatCurrency(totalDiscountsCents),
      tax: formatCurrency(taxResult.totalTaxCents),
      grandTotal: formatCurrency(grandTotalCents),
    },
  };
}

// ============================================================================
// QUICK CALCULATION HELPERS
// ============================================================================

/**
 * Quick single-item price calculation
 */
function calculateItemPrice(unitPriceCents, quantity, discountPercent = 0) {
  return calculateLineItem({
    unitPriceCents,
    quantity,
    discountPercent,
  });
}

/**
 * Quick tax calculation for an amount
 */
function calculateTax(amountCents, province = DEFAULT_PROVINCE) {
  const result = calculateTaxes(amountCents, province);
  return result.totalTaxCents;
}

/**
 * Add tax to an amount
 */
function addTax(amountCents, province = DEFAULT_PROVINCE) {
  const tax = calculateTax(amountCents, province);
  return {
    amountCents,
    taxCents: tax,
    totalCents: amountCents + tax,
    province,
  };
}

/**
 * Extract tax from a tax-inclusive amount
 */
function extractTax(totalCents, province = DEFAULT_PROVINCE) {
  const taxRates = TAX_RATES[province] || TAX_RATES[DEFAULT_PROVINCE];

  let combinedRate;
  if (taxRates.hst > 0) {
    combinedRate = taxRates.hst;
  } else if (province === 'QC') {
    // QST is on top of GST
    combinedRate = taxRates.gst + (1 + taxRates.gst) * taxRates.pst;
  } else {
    combinedRate = taxRates.gst + taxRates.pst;
  }

  const amountCents = roundCents(totalCents / (1 + combinedRate));
  const taxCents = totalCents - amountCents;

  return {
    amountCents,
    taxCents,
    totalCents,
    province,
  };
}

/**
 * Calculate price needed to achieve target margin
 */
function calculatePriceForMargin(costCents, targetMarginPercent) {
  if (targetMarginPercent >= 100) {
    throw new Error('Target margin cannot be 100% or greater');
  }
  if (targetMarginPercent < 0) {
    throw new Error('Target margin cannot be negative');
  }

  // margin = (price - cost) / price
  // margin * price = price - cost
  // cost = price * (1 - margin)
  // price = cost / (1 - margin)
  const price = costCents / (1 - targetMarginPercent / 100);
  return roundCents(price);
}

/**
 * Calculate margin from price and cost
 */
function calculateMargin(priceCents, costCents) {
  if (priceCents <= 0) return 0;
  const margin = ((priceCents - costCents) / priceCents) * 100;
  return roundCents(margin * 100) / 100;
}

/**
 * Calculate markup from price and cost
 */
function calculateMarkup(priceCents, costCents) {
  if (costCents <= 0) return 0;
  const markup = ((priceCents - costCents) / costCents) * 100;
  return roundCents(markup * 100) / 100;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  TAX_RATES,
  CUSTOMER_TIERS,
  DEFAULT_PROVINCE,

  // Helpers
  roundCents,
  dollarsToCents,
  centsToDollars,
  formatCurrency,
  validateNumber,

  // Core calculations
  applyVolumeBreaks,
  applyCustomerTier,
  calculateLineItem,
  calculateTaxes,
  calculateOrder,

  // Quick helpers
  calculateItemPrice,
  calculateTax,
  addTax,
  extractTax,

  // Margin helpers
  calculatePriceForMargin,
  calculateMargin,
  calculateMarkup,
};
