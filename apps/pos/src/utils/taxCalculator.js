/**
 * Canadian Tax Calculator for TeleTime POS
 * Supports HST, GST, and PST for all provinces/territories
 */

/**
 * Tax rates by province/territory
 * Updated as of 2024
 */
export const TAX_RATES = {
  // Harmonized Sales Tax (HST) provinces
  ON: { hst: 0.13, gst: 0, pst: 0, name: 'Ontario' },
  NB: { hst: 0.15, gst: 0, pst: 0, name: 'New Brunswick' },
  NS: { hst: 0.15, gst: 0, pst: 0, name: 'Nova Scotia' },
  PE: { hst: 0.15, gst: 0, pst: 0, name: 'Prince Edward Island' },
  NL: { hst: 0.15, gst: 0, pst: 0, name: 'Newfoundland and Labrador' },

  // GST + PST provinces
  BC: { hst: 0, gst: 0.05, pst: 0.07, name: 'British Columbia' },
  SK: { hst: 0, gst: 0.05, pst: 0.06, name: 'Saskatchewan' },
  MB: { hst: 0, gst: 0.05, pst: 0.07, name: 'Manitoba' },

  // GST + QST (Quebec)
  QC: { hst: 0, gst: 0.05, pst: 0.09975, name: 'Quebec' },

  // GST only provinces/territories
  AB: { hst: 0, gst: 0.05, pst: 0, name: 'Alberta' },
  YT: { hst: 0, gst: 0.05, pst: 0, name: 'Yukon' },
  NT: { hst: 0, gst: 0.05, pst: 0, name: 'Northwest Territories' },
  NU: { hst: 0, gst: 0.05, pst: 0, name: 'Nunavut' },
};

/**
 * Calculate taxes for a given amount
 * @param {number} amount - Taxable amount
 * @param {string} province - Province code
 * @returns {object} Tax breakdown
 */
export function calculateTaxes(amount, province = 'ON') {
  const rates = TAX_RATES[province.toUpperCase()] || TAX_RATES.ON;
  const taxableAmount = parseFloat(amount) || 0;

  const hstAmount = taxableAmount * rates.hst;
  const gstAmount = taxableAmount * rates.gst;
  // QST (Quebec) is compound: calculated on amount + GST
  const pstBase = province.toUpperCase() === 'QC' ? taxableAmount + gstAmount : taxableAmount;
  const pstAmount = pstBase * rates.pst;
  const totalTax = hstAmount + gstAmount + pstAmount;

  return {
    hstAmount: parseFloat(hstAmount.toFixed(2)),
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    pstAmount: parseFloat(pstAmount.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    rates: {
      hst: rates.hst,
      gst: rates.gst,
      pst: rates.pst,
      total: rates.hst + rates.gst + rates.pst,
    },
    province: province.toUpperCase(),
    provinceName: rates.name,
  };
}

/**
 * Format tax breakdown for receipt
 * @param {object} taxes - Tax calculation result
 * @returns {Array} Array of tax line items for display
 */
export function formatTaxBreakdown(taxes) {
  const lines = [];

  if (taxes.hstAmount > 0) {
    lines.push({
      label: 'HST',
      rate: taxes.rates.hst * 100,
      amount: taxes.hstAmount,
    });
  }

  if (taxes.gstAmount > 0) {
    lines.push({
      label: 'GST',
      rate: taxes.rates.gst * 100,
      amount: taxes.gstAmount,
    });
  }

  if (taxes.pstAmount > 0) {
    const label = taxes.province === 'QC' ? 'QST' : 'PST';
    lines.push({
      label,
      rate: taxes.rates.pst * 100,
      amount: taxes.pstAmount,
    });
  }

  return lines;
}

export default {
  TAX_RATES,
  calculateTaxes,
  formatTaxBreakdown,
};
