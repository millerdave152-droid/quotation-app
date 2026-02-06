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
 * Get tax rates for a province
 * @param {string} province - Province code (e.g., 'ON', 'BC')
 * @returns {object} Tax rates object
 */
export function getTaxRates(province = 'ON') {
  return TAX_RATES[province.toUpperCase()] || TAX_RATES.ON;
}

/**
 * Calculate taxes for a given amount
 * @param {number} amount - Taxable amount
 * @param {string} province - Province code
 * @returns {object} Tax breakdown
 */
export function calculateTaxes(amount, province = 'ON') {
  const rates = getTaxRates(province);
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
 * Calculate total with taxes
 * @param {number} amount - Pre-tax amount
 * @param {string} province - Province code
 * @returns {object} Total with tax breakdown
 */
export function calculateTotalWithTax(amount, province = 'ON') {
  const taxes = calculateTaxes(amount, province);

  return {
    subtotal: parseFloat(amount.toFixed(2)),
    ...taxes,
    total: parseFloat((amount + taxes.totalTax).toFixed(2)),
  };
}

/**
 * Calculate pre-tax amount from tax-inclusive total
 * @param {number} totalWithTax - Tax-inclusive amount
 * @param {string} province - Province code
 * @returns {object} Pre-tax amount and tax breakdown
 */
export function calculatePreTaxAmount(totalWithTax, province = 'ON') {
  const rates = getTaxRates(province);
  const totalRate = 1 + rates.hst + rates.gst + rates.pst;
  const preTaxAmount = totalWithTax / totalRate;

  return {
    preTaxAmount: parseFloat(preTaxAmount.toFixed(2)),
    ...calculateTaxes(preTaxAmount, province),
    total: parseFloat(totalWithTax.toFixed(2)),
  };
}

/**
 * Get tax display label
 * @param {string} province - Province code
 * @returns {string} Tax label for display
 */
export function getTaxLabel(province = 'ON') {
  const rates = getTaxRates(province);

  if (rates.hst > 0) {
    return `HST (${(rates.hst * 100).toFixed(0)}%)`;
  }

  const labels = [];
  if (rates.gst > 0) {
    labels.push(`GST (${(rates.gst * 100).toFixed(0)}%)`);
  }
  if (rates.pst > 0) {
    const pstLabel = province === 'QC' ? 'QST' : 'PST';
    labels.push(`${pstLabel} (${(rates.pst * 100).toFixed(2)}%)`);
  }

  return labels.join(' + ');
}

/**
 * Get total tax rate as percentage
 * @param {string} province - Province code
 * @returns {number} Total tax rate as percentage
 */
export function getTotalTaxRate(province = 'ON') {
  const rates = getTaxRates(province);
  return (rates.hst + rates.gst + rates.pst) * 100;
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

/**
 * Get list of all provinces with their tax info
 * @returns {Array} Province list with tax info
 */
export function getProvinceList() {
  return Object.entries(TAX_RATES).map(([code, info]) => ({
    code,
    name: info.name,
    totalRate: getTotalTaxRate(code),
    label: getTaxLabel(code),
  }));
}

export default {
  TAX_RATES,
  getTaxRates,
  calculateTaxes,
  calculateTotalWithTax,
  calculatePreTaxAmount,
  getTaxLabel,
  getTotalTaxRate,
  formatTaxBreakdown,
  getProvinceList,
};
