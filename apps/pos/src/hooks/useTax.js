/**
 * TeleTime - useTax Hook
 *
 * React hook for Canadian tax calculations and display.
 * Provides real-time tax calculation with province selection and exemption handling.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import api from '../api/axios';

// ============================================================================
// DEFAULT TAX RATES (fallback if API unavailable)
// ============================================================================

const DEFAULT_TAX_RATES = {
  ON: { hst: 0.13, gst: 0, pst: 0, label: 'HST 13%', name: 'Ontario' },
  BC: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%', name: 'British Columbia' },
  AB: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%', name: 'Alberta' },
  SK: { hst: 0, gst: 0.05, pst: 0.06, label: 'GST 5% + PST 6%', name: 'Saskatchewan' },
  MB: { hst: 0, gst: 0.05, pst: 0.07, label: 'GST 5% + PST 7%', name: 'Manitoba' },
  QC: { hst: 0, gst: 0.05, pst: 0.09975, label: 'GST 5% + QST 9.975%', name: 'Quebec', isCompound: true },
  NB: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%', name: 'New Brunswick' },
  NS: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%', name: 'Nova Scotia' },
  NL: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%', name: 'Newfoundland and Labrador' },
  PE: { hst: 0.15, gst: 0, pst: 0, label: 'HST 15%', name: 'Prince Edward Island' },
  NT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%', name: 'Northwest Territories' },
  NU: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%', name: 'Nunavut' },
  YT: { hst: 0, gst: 0.05, pst: 0, label: 'GST 5%', name: 'Yukon' },
};

const DEFAULT_PROVINCE = 'ON';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Round to cents
 */
function roundCents(cents) {
  return Math.round(cents);
}

/**
 * Calculate tax for an amount
 */
function calculateTaxLocal(amountCents, rates) {
  if (!rates || amountCents <= 0) {
    return { hst: 0, gst: 0, pst: 0, total: 0 };
  }

  let hst = 0;
  let gst = 0;
  let pst = 0;

  if (rates.hst > 0) {
    hst = roundCents(amountCents * rates.hst);
  } else {
    if (rates.gst > 0) {
      gst = roundCents(amountCents * rates.gst);
    }
    if (rates.pst > 0) {
      // Quebec compound tax
      const pstBase = rates.isCompound ? amountCents + gst : amountCents;
      pst = roundCents(pstBase * rates.pst);
    }
  }

  return {
    hst,
    gst,
    pst,
    total: hst + gst + pst,
  };
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * useTax - Canadian tax calculation hook
 *
 * @param {Object} options
 * @param {string} options.defaultProvince - Default province code
 * @param {boolean} options.autoFetch - Auto-fetch rates from API
 * @returns {Object} Tax calculation utilities
 */
export function useTax(options = {}) {
  const {
    defaultProvince = DEFAULT_PROVINCE,
    autoFetch = true,
  } = options;

  // State
  const [province, setProvince] = useState(defaultProvince);
  const [taxRates, setTaxRates] = useState(DEFAULT_TAX_RATES);
  const [allProvinces, setAllProvinces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isTaxExempt, setIsTaxExempt] = useState(false);

  // ============================================================================
  // API CALLS
  // ============================================================================

  /**
   * Fetch all tax rates from API
   */
  const fetchTaxRates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get('/tax/rates');
      if (response.success && response.data) {
        // Convert API response to lookup object
        const rates = {};
        const provinces = [];

        response.data.forEach((item) => {
          rates[item.provinceCode] = {
            hst: (item.hstRate || 0) / 100,
            gst: (item.gstRate || 0) / 100,
            pst: ((item.pstRate || 0) + (item.qstRate || 0)) / 100,
            label: item.displayLabel,
            name: item.provinceName,
            isCompound: item.provinceCode === 'QC',
          };

          provinces.push({
            code: item.provinceCode,
            name: item.provinceName,
            label: item.displayLabel,
            combinedRate: item.combinedRate,
          });
        });

        setTaxRates(rates);
        setAllProvinces(provinces);
      }
    } catch (err) {
      console.warn('Failed to fetch tax rates, using defaults:', err.message);
      setError('Using default tax rates');
      // Keep using DEFAULT_TAX_RATES

      // Build provinces list from defaults
      const provinces = Object.entries(DEFAULT_TAX_RATES).map(([code, rates]) => ({
        code,
        name: rates.name,
        label: rates.label,
        combinedRate: (rates.hst + rates.gst + rates.pst) * 100,
      }));
      setAllProvinces(provinces);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount if autoFetch enabled
  useEffect(() => {
    if (autoFetch) {
      fetchTaxRates();
    } else {
      // Build provinces list from defaults
      const provinces = Object.entries(DEFAULT_TAX_RATES).map(([code, rates]) => ({
        code,
        name: rates.name,
        label: rates.label,
        combinedRate: (rates.hst + rates.gst + rates.pst) * 100,
      }));
      setAllProvinces(provinces);
    }
  }, [autoFetch, fetchTaxRates]);

  // ============================================================================
  // CURRENT RATES
  // ============================================================================

  /**
   * Get current province rates
   */
  const currentRates = useMemo(() => {
    return taxRates[province] || taxRates[DEFAULT_PROVINCE] || DEFAULT_TAX_RATES[DEFAULT_PROVINCE];
  }, [taxRates, province]);

  /**
   * Combined tax rate as percentage
   */
  const taxRatePercent = useMemo(() => {
    const rates = currentRates;
    if (rates.hst > 0) {
      return rates.hst * 100;
    }
    // For compound (QC), this is approximate
    return (rates.gst + rates.pst) * 100;
  }, [currentRates]);

  // ============================================================================
  // CALCULATION FUNCTIONS
  // ============================================================================

  /**
   * Calculate tax for an amount in cents
   */
  const calculateTax = useCallback(
    (amountCents, overrideProvince = null, exempt = null) => {
      const useExempt = exempt !== null ? exempt : isTaxExempt;

      if (useExempt || amountCents <= 0) {
        return {
          amountCents,
          hstCents: 0,
          gstCents: 0,
          pstCents: 0,
          totalTaxCents: 0,
          grandTotalCents: amountCents,
          isTaxExempt: useExempt,
          province: overrideProvince || province,
          label: useExempt ? 'Tax Exempt' : currentRates.label,
        };
      }

      const rates = overrideProvince
        ? taxRates[overrideProvince] || currentRates
        : currentRates;

      const tax = calculateTaxLocal(amountCents, rates);

      return {
        amountCents,
        hstCents: tax.hst,
        gstCents: tax.gst,
        pstCents: tax.pst,
        totalTaxCents: tax.total,
        grandTotalCents: amountCents + tax.total,
        isTaxExempt: false,
        province: overrideProvince || province,
        label: rates.label,
      };
    },
    [province, currentRates, taxRates, isTaxExempt]
  );

  /**
   * Calculate tax for dollars (convenience function)
   */
  const calculateTaxDollars = useCallback(
    (amountDollars, overrideProvince = null) => {
      const cents = roundCents(amountDollars * 100);
      const result = calculateTax(cents, overrideProvince);
      return {
        ...result,
        amount: amountDollars,
        totalTax: result.totalTaxCents / 100,
        grandTotal: result.grandTotalCents / 100,
      };
    },
    [calculateTax]
  );

  /**
   * Add tax to amount
   */
  const addTax = useCallback(
    (amountCents, overrideProvince = null) => {
      const result = calculateTax(amountCents, overrideProvince);
      return result.grandTotalCents;
    },
    [calculateTax]
  );

  /**
   * Extract tax from tax-inclusive amount
   */
  const extractTax = useCallback(
    (totalCents, overrideProvince = null) => {
      const rates = overrideProvince
        ? taxRates[overrideProvince] || currentRates
        : currentRates;

      let combinedRate;
      if (rates.hst > 0) {
        combinedRate = rates.hst;
      } else if (rates.isCompound) {
        // Quebec compound
        combinedRate = rates.gst + (1 + rates.gst) * rates.pst;
      } else {
        combinedRate = rates.gst + rates.pst;
      }

      const amountCents = roundCents(totalCents / (1 + combinedRate));
      const taxCents = totalCents - amountCents;

      return {
        amountCents,
        taxCents,
        totalCents,
      };
    },
    [currentRates, taxRates]
  );

  // ============================================================================
  // DISPLAY FORMATTERS
  // ============================================================================

  /**
   * Format tax breakdown for display
   */
  const formatTaxBreakdown = useCallback(
    (taxResult) => {
      const lines = [];

      if (taxResult.isTaxExempt) {
        lines.push({ label: 'Tax Exempt', amount: 0 });
        return lines;
      }

      if (taxResult.hstCents > 0) {
        lines.push({
          label: `HST (${(currentRates.hst * 100).toFixed(0)}%)`,
          amount: taxResult.hstCents / 100,
          cents: taxResult.hstCents,
        });
      }

      if (taxResult.gstCents > 0) {
        lines.push({
          label: `GST (${(currentRates.gst * 100).toFixed(0)}%)`,
          amount: taxResult.gstCents / 100,
          cents: taxResult.gstCents,
        });
      }

      if (taxResult.pstCents > 0) {
        const pstLabel = province === 'QC' ? 'QST' : 'PST';
        const pstRate = province === 'QC' ? '9.975' : (currentRates.pst * 100).toFixed(0);
        lines.push({
          label: `${pstLabel} (${pstRate}%)`,
          amount: taxResult.pstCents / 100,
          cents: taxResult.pstCents,
        });
      }

      return lines;
    },
    [currentRates, province]
  );

  /**
   * Get tax summary text
   */
  const getTaxSummary = useCallback(
    (amountCents) => {
      if (isTaxExempt) {
        return 'Tax Exempt';
      }
      const result = calculateTax(amountCents);
      return `${currentRates.label}: $${(result.totalTaxCents / 100).toFixed(2)}`;
    },
    [calculateTax, currentRates, isTaxExempt]
  );

  // ============================================================================
  // PROVINCE SELECTION
  // ============================================================================

  /**
   * Province options for dropdowns
   */
  const provinceOptions = useMemo(() => {
    return allProvinces.map((p) => ({
      value: p.code,
      label: `${p.name} (${p.label})`,
      shortLabel: p.code,
      rate: p.combinedRate,
    }));
  }, [allProvinces]);

  /**
   * Get province info
   */
  const getProvinceInfo = useCallback(
    (code) => {
      const rates = taxRates[code] || DEFAULT_TAX_RATES[code];
      if (!rates) return null;

      return {
        code,
        name: rates.name,
        label: rates.label,
        hstRate: rates.hst * 100,
        gstRate: rates.gst * 100,
        pstRate: rates.pst * 100,
        combinedRate: (rates.hst + rates.gst + rates.pst) * 100,
        isHstProvince: rates.hst > 0,
        isCompound: rates.isCompound || false,
      };
    },
    [taxRates]
  );

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    province,
    setProvince,
    isTaxExempt,
    setIsTaxExempt,
    isLoading,
    error,

    // Current rates info
    currentRates,
    taxRatePercent,
    taxLabel: currentRates.label,

    // Calculation functions
    calculateTax,
    calculateTaxDollars,
    addTax,
    extractTax,

    // Display helpers
    formatTaxBreakdown,
    getTaxSummary,

    // Province data
    provinceOptions,
    allProvinces,
    getProvinceInfo,

    // Refresh
    refreshRates: fetchTaxRates,
  };
}

// ============================================================================
// STANDALONE CALCULATION (no hook needed)
// ============================================================================

/**
 * Calculate tax without React (for utilities/services)
 */
export function calculateTaxStandalone(amountCents, provinceCode = 'ON', isTaxExempt = false) {
  if (isTaxExempt || amountCents <= 0) {
    return {
      amountCents,
      totalTaxCents: 0,
      grandTotalCents: amountCents,
      isTaxExempt: true,
    };
  }

  const rates = DEFAULT_TAX_RATES[provinceCode] || DEFAULT_TAX_RATES.ON;
  const tax = calculateTaxLocal(amountCents, rates);

  return {
    amountCents,
    hstCents: tax.hst,
    gstCents: tax.gst,
    pstCents: tax.pst,
    totalTaxCents: tax.total,
    grandTotalCents: amountCents + tax.total,
    isTaxExempt: false,
    label: rates.label,
  };
}

export default useTax;
