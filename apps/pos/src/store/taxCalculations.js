/**
 * Tax Calculations
 * Canadian provincial tax rates and calculations
 */

// Tax rates by province (as of 2024)
export const TAX_RATES = {
  // HST Provinces
  ON: { hst: 0.13, gst: 0, pst: 0, qst: 0, label: 'HST 13%' },
  NB: { hst: 0.15, gst: 0, pst: 0, qst: 0, label: 'HST 15%' },
  NS: { hst: 0.15, gst: 0, pst: 0, qst: 0, label: 'HST 15%' },
  NL: { hst: 0.15, gst: 0, pst: 0, qst: 0, label: 'HST 15%' },
  PE: { hst: 0.15, gst: 0, pst: 0, qst: 0, label: 'HST 15%' },

  // GST + PST Provinces
  BC: { hst: 0, gst: 0.05, pst: 0.07, qst: 0, label: 'GST 5% + PST 7%' },
  SK: { hst: 0, gst: 0.05, pst: 0.06, qst: 0, label: 'GST 5% + PST 6%' },
  MB: { hst: 0, gst: 0.05, pst: 0.07, qst: 0, label: 'GST 5% + PST 7%' },

  // GST + QST (Quebec)
  QC: { hst: 0, gst: 0.05, pst: 0, qst: 0.09975, label: 'GST 5% + QST 9.975%' },

  // GST Only
  AB: { hst: 0, gst: 0.05, pst: 0, qst: 0, label: 'GST 5%' },
  NT: { hst: 0, gst: 0.05, pst: 0, qst: 0, label: 'GST 5%' },
  NU: { hst: 0, gst: 0.05, pst: 0, qst: 0, label: 'GST 5%' },
  YT: { hst: 0, gst: 0.05, pst: 0, qst: 0, label: 'GST 5%' },
};

/**
 * Calculate tax breakdown for a given amount and province
 * @param {number} amountCents - Taxable amount in cents
 * @param {string} province - Province code (e.g., 'ON', 'BC')
 * @returns {Object} Tax breakdown with individual components and total
 */
export const calculateTax = (amountCents, province = 'ON') => {
  const rates = TAX_RATES[province] || TAX_RATES.ON;

  const hst = Math.round(amountCents * rates.hst);
  const gst = Math.round(amountCents * rates.gst);
  const pst = Math.round(amountCents * rates.pst);

  // QST is calculated on the amount + GST (compound tax)
  const qstBase = rates.qst > 0 ? amountCents + gst : 0;
  const qst = Math.round(qstBase * rates.qst);

  const total = hst + gst + pst + qst;

  return {
    hst,
    gst,
    pst,
    qst,
    total,
    label: rates.label,
    province,
    rates,
  };
};

/**
 * Get effective tax rate for a province
 * @param {string} province - Province code
 * @returns {number} Effective tax rate as decimal (e.g., 0.13 for 13%)
 */
export const getEffectiveTaxRate = (province = 'ON') => {
  const rates = TAX_RATES[province] || TAX_RATES.ON;
  // QC: QST is applied on (amount + GST), so effective rate is gst + pst + (gst * pst)
  if (province === 'QC') {
    return rates.gst + rates.pst + (rates.gst * rates.pst);
  }
  return rates.hst + rates.gst + rates.pst + (rates.qst || 0);
};

/**
 * Format tax label for display
 * @param {string} province - Province code
 * @returns {string} Human-readable tax label
 */
export const getTaxLabel = (province = 'ON') => {
  const rates = TAX_RATES[province] || TAX_RATES.ON;
  return rates.label;
};

/**
 * Get all provinces for dropdown
 * @returns {Array} Array of province objects
 */
export const getProvinces = () => [
  { code: 'ON', name: 'Ontario', label: TAX_RATES.ON.label },
  { code: 'BC', name: 'British Columbia', label: TAX_RATES.BC.label },
  { code: 'AB', name: 'Alberta', label: TAX_RATES.AB.label },
  { code: 'SK', name: 'Saskatchewan', label: TAX_RATES.SK.label },
  { code: 'MB', name: 'Manitoba', label: TAX_RATES.MB.label },
  { code: 'QC', name: 'Quebec', label: TAX_RATES.QC.label },
  { code: 'NB', name: 'New Brunswick', label: TAX_RATES.NB.label },
  { code: 'NS', name: 'Nova Scotia', label: TAX_RATES.NS.label },
  { code: 'PE', name: 'Prince Edward Island', label: TAX_RATES.PE.label },
  { code: 'NL', name: 'Newfoundland and Labrador', label: TAX_RATES.NL.label },
  { code: 'YT', name: 'Yukon', label: TAX_RATES.YT.label },
  { code: 'NT', name: 'Northwest Territories', label: TAX_RATES.NT.label },
  { code: 'NU', name: 'Nunavut', label: TAX_RATES.NU.label },
];
