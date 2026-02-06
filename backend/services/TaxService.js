/**
 * TeleTime - Canadian Tax Calculation Service
 *
 * Database-backed tax calculation with support for:
 * - HST provinces (ON, NB, NL, NS, PE)
 * - GST/PST provinces (BC, MB, SK)
 * - Quebec compound QST
 * - GST-only territories (AB, NT, NU, YT)
 * - Customer tax exemptions
 * - Product tax exemptions
 *
 * All monetary values in CENTS (integers)
 */

const PricingCalculator = require('./PricingCalculator');

class TaxService {
  constructor(pool, cache = null) {
    this.pool = pool;
    this.cache = cache;
    this.calculator = PricingCalculator;
  }

  // ============================================================================
  // TAX RATE LOOKUPS
  // ============================================================================

  /**
   * Get current tax rates for a province from database
   * Falls back to PricingCalculator constants if DB unavailable
   */
  async getTaxRates(provinceCode) {
    const cacheKey = `tax:rates:${provinceCode}`;

    const fetchRates = async () => {
      try {
        const result = await this.pool.query(`
          SELECT
            tax_type,
            rate_percent,
            is_compound,
            display_label
          FROM tax_rates
          WHERE province_code = $1
            AND effective_date <= CURRENT_DATE
            AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
          ORDER BY
            CASE tax_type
              WHEN 'hst' THEN 1
              WHEN 'gst' THEN 2
              WHEN 'pst' THEN 3
              WHEN 'qst' THEN 4
            END
        `, [provinceCode]);

        if (result.rows.length === 0) {
          // Fall back to hardcoded rates
          return this._getDefaultRates(provinceCode);
        }

        return this._parseDbRates(result.rows, provinceCode);
      } catch (error) {
        console.warn(`Tax rate lookup failed for ${provinceCode}, using defaults:`, error.message);
        return this._getDefaultRates(provinceCode);
      }
    };

    if (this.cache) {
      return await this.cache.cacheQuery(cacheKey, 'medium', fetchRates);
    }

    return await fetchRates();
  }

  /**
   * Get all provinces with their current tax rates
   */
  async getAllTaxRates() {
    const cacheKey = 'tax:rates:all';

    const fetchAll = async () => {
      try {
        const result = await this.pool.query(`
          SELECT * FROM current_tax_rates
          ORDER BY province_code
        `);

        return result.rows.map(row => ({
          provinceCode: row.province_code,
          provinceName: row.province_name,
          hstRate: parseFloat(row.hst_rate) || 0,
          gstRate: parseFloat(row.gst_rate) || 0,
          pstRate: parseFloat(row.pst_rate) || 0,
          qstRate: parseFloat(row.qst_rate) || 0,
          combinedRate: parseFloat(row.combined_rate) || 0,
          displayLabel: row.display_label,
        }));
      } catch (error) {
        // Return hardcoded rates as fallback
        return Object.entries(PricingCalculator.TAX_RATES).map(([code, rates]) => ({
          provinceCode: code,
          hstRate: rates.hst * 100,
          gstRate: rates.gst * 100,
          pstRate: rates.pst * 100,
          qstRate: 0,
          combinedRate: (rates.hst + rates.gst + rates.pst) * 100,
          displayLabel: rates.label,
        }));
      }
    };

    if (this.cache) {
      return await this.cache.cacheQuery(cacheKey, 'long', fetchAll);
    }

    return await fetchAll();
  }

  // ============================================================================
  // TAX CALCULATION
  // ============================================================================

  /**
   * Calculate tax for an amount
   *
   * @param {Object} params
   * @param {number} params.amountCents - Taxable amount in cents
   * @param {string} params.provinceCode - Province code
   * @param {number} params.customerId - Customer ID (for exemption check)
   * @param {number} params.productId - Product ID (for exemption check)
   * @param {boolean} params.isTaxExempt - Override exemption flag
   * @returns {Promise<Object>} Tax calculation result
   */
  async calculateTax({
    amountCents,
    provinceCode = 'ON',
    customerId = null,
    productId = null,
    isTaxExempt = false,
  }) {
    // Check exemptions if not already marked exempt
    if (!isTaxExempt) {
      if (customerId) {
        isTaxExempt = await this.isCustomerTaxExempt(customerId, provinceCode);
      }
      if (!isTaxExempt && productId) {
        isTaxExempt = await this.isProductTaxExempt(productId, provinceCode);
      }
    }

    // Get current rates
    const rates = await this.getTaxRates(provinceCode);

    // Handle tax-exempt
    if (isTaxExempt || amountCents <= 0) {
      return {
        provinceCode,
        provinceName: rates.provinceName,
        amountCents,
        taxableAmountCents: 0,
        hstCents: 0,
        gstCents: 0,
        pstCents: 0,
        qstCents: 0,
        totalTaxCents: 0,
        grandTotalCents: amountCents,
        isTaxExempt: true,
        displayLabel: 'Tax Exempt',
        breakdown: [],
      };
    }

    // Calculate taxes
    let hstCents = 0;
    let gstCents = 0;
    let pstCents = 0;
    let qstCents = 0;
    const breakdown = [];

    if (rates.hst > 0) {
      hstCents = this._roundCents(amountCents * rates.hst);
      breakdown.push({
        type: 'HST',
        rate: rates.hst * 100,
        amountCents: hstCents,
        label: `HST ${(rates.hst * 100).toFixed(0)}%`,
      });
    } else {
      if (rates.gst > 0) {
        gstCents = this._roundCents(amountCents * rates.gst);
        breakdown.push({
          type: 'GST',
          rate: rates.gst * 100,
          amountCents: gstCents,
          label: `GST ${(rates.gst * 100).toFixed(0)}%`,
        });
      }

      if (rates.pst > 0) {
        pstCents = this._roundCents(amountCents * rates.pst);
        breakdown.push({
          type: 'PST',
          rate: rates.pst * 100,
          amountCents: pstCents,
          label: `PST ${(rates.pst * 100).toFixed(0)}%`,
        });
      }

      if (rates.qst > 0) {
        // QST is compound (calculated on amount + GST)
        const qstBase = rates.isQstCompound ? amountCents + gstCents : amountCents;
        qstCents = this._roundCents(qstBase * rates.qst);
        breakdown.push({
          type: 'QST',
          rate: rates.qst * 100,
          amountCents: qstCents,
          label: `QST ${(rates.qst * 100).toFixed(3)}%`,
          isCompound: true,
        });
      }
    }

    const totalTaxCents = hstCents + gstCents + pstCents + qstCents;

    return {
      provinceCode,
      provinceName: rates.provinceName,
      amountCents,
      taxableAmountCents: amountCents,
      hstCents,
      gstCents,
      pstCents,
      qstCents,
      totalTaxCents,
      grandTotalCents: amountCents + totalTaxCents,
      isTaxExempt: false,
      displayLabel: rates.displayLabel,
      breakdown,
    };
  }

  /**
   * Calculate tax for multiple line items
   * Handles mixed tax-exempt and taxable items
   */
  async calculateOrderTax({
    items,
    provinceCode = 'ON',
    customerId = null,
    orderDiscountCents = 0,
  }) {
    // Check if customer is exempt
    const isCustomerExempt = customerId
      ? await this.isCustomerTaxExempt(customerId, provinceCode)
      : false;

    // Calculate taxable amount for each item
    let totalTaxableAmount = 0;
    let totalExemptAmount = 0;
    const itemDetails = [];

    for (const item of items) {
      const lineTotal = item.lineTotalCents || (item.unitPriceCents * item.quantity);
      let isExempt = isCustomerExempt || item.isTaxExempt;

      // Check product exemption if not already exempt
      if (!isExempt && item.productId) {
        isExempt = await this.isProductTaxExempt(item.productId, provinceCode);
      }

      if (isExempt) {
        totalExemptAmount += lineTotal;
      } else {
        totalTaxableAmount += lineTotal;
      }

      itemDetails.push({
        ...item,
        lineTotalCents: lineTotal,
        isTaxExempt: isExempt,
      });
    }

    // Apply order discount proportionally to taxable items
    const totalAmount = totalTaxableAmount + totalExemptAmount;
    let adjustedTaxableAmount = totalTaxableAmount;

    if (orderDiscountCents > 0 && totalAmount > 0) {
      const taxableRatio = totalTaxableAmount / totalAmount;
      const taxableDiscount = this._roundCents(orderDiscountCents * taxableRatio);
      adjustedTaxableAmount = Math.max(0, totalTaxableAmount - taxableDiscount);
    }

    // Calculate tax on adjusted taxable amount
    const taxResult = await this.calculateTax({
      amountCents: adjustedTaxableAmount,
      provinceCode,
      isTaxExempt: adjustedTaxableAmount === 0,
    });

    return {
      ...taxResult,
      items: itemDetails,
      summary: {
        totalAmount,
        taxableAmount: adjustedTaxableAmount,
        exemptAmount: totalExemptAmount,
        orderDiscount: orderDiscountCents,
      },
    };
  }

  /**
   * Add tax to an amount (for tax-inclusive pricing)
   */
  async addTax(amountCents, provinceCode = 'ON') {
    const result = await this.calculateTax({ amountCents, provinceCode });
    return {
      amountCents,
      taxCents: result.totalTaxCents,
      totalCents: result.grandTotalCents,
      breakdown: result.breakdown,
    };
  }

  /**
   * Extract tax from a tax-inclusive amount
   */
  async extractTax(totalCents, provinceCode = 'ON') {
    const rates = await this.getTaxRates(provinceCode);

    // Calculate combined rate
    let combinedRate;
    if (rates.hst > 0) {
      combinedRate = rates.hst;
    } else if (rates.qst > 0) {
      // Quebec compound: GST + QST on (1 + GST)
      combinedRate = rates.gst + (1 + rates.gst) * rates.qst;
    } else {
      combinedRate = rates.gst + rates.pst;
    }

    const amountCents = this._roundCents(totalCents / (1 + combinedRate));
    const taxCents = totalCents - amountCents;

    return {
      amountCents,
      taxCents,
      totalCents,
      provinceCode,
    };
  }

  // ============================================================================
  // EXEMPTION CHECKS
  // ============================================================================

  /**
   * Check if customer is tax exempt
   */
  async isCustomerTaxExempt(customerId, provinceCode = null) {
    const cacheKey = `tax:exempt:customer:${customerId}:${provinceCode || 'all'}`;

    const check = async () => {
      try {
        const result = await this.pool.query(`
          SELECT 1
          FROM customer_tax_exemptions
          WHERE customer_id = $1
            AND is_active = TRUE
            AND valid_from <= CURRENT_DATE
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
            AND (province_code IS NULL OR province_code = $2)
          LIMIT 1
        `, [customerId, provinceCode]);

        return result.rows.length > 0;
      } catch (error) {
        // Check customers table fallback
        const fallback = await this.pool.query(
          'SELECT is_tax_exempt FROM customers WHERE id = $1',
          [customerId]
        );
        return fallback.rows[0]?.is_tax_exempt || false;
      }
    };

    if (this.cache) {
      return await this.cache.cacheQuery(cacheKey, 'short', check);
    }

    return await check();
  }

  /**
   * Check if product is tax exempt
   */
  async isProductTaxExempt(productId, provinceCode = null) {
    const cacheKey = `tax:exempt:product:${productId}:${provinceCode || 'all'}`;

    const check = async () => {
      try {
        const result = await this.pool.query(`
          SELECT
            p.is_tax_exempt,
            ptc.is_tax_exempt as category_exempt,
            ptc.exempt_provinces
          FROM products p
          LEFT JOIN product_tax_categories ptc ON p.tax_category_id = ptc.id
          WHERE p.id = $1
        `, [productId]);

        if (result.rows.length === 0) return false;

        const row = result.rows[0];

        // Direct product exemption
        if (row.is_tax_exempt) return true;

        // Category exemption
        if (row.category_exempt) return true;

        // Province-specific category exemption
        if (row.exempt_provinces && provinceCode) {
          return row.exempt_provinces.includes(provinceCode);
        }

        return false;
      } catch {
        return false;
      }
    };

    if (this.cache) {
      return await this.cache.cacheQuery(cacheKey, 'medium', check);
    }

    return await check();
  }

  /**
   * Get customer's exemption details
   */
  async getCustomerExemptions(customerId) {
    const result = await this.pool.query(`
      SELECT
        cte.*,
        ter.code as reason_code,
        ter.description as reason_description
      FROM customer_tax_exemptions cte
      LEFT JOIN tax_exemption_reasons ter ON cte.exemption_reason_id = ter.id
      WHERE cte.customer_id = $1
        AND cte.is_active = TRUE
      ORDER BY cte.valid_from DESC
    `, [customerId]);

    return result.rows;
  }

  // ============================================================================
  // EXEMPTION MANAGEMENT
  // ============================================================================

  /**
   * Add tax exemption for a customer
   */
  async addCustomerExemption({
    customerId,
    exemptionReasonId,
    exemptionNumber,
    provinceCode = null,
    validFrom = new Date(),
    validUntil = null,
    certificateFilePath = null,
    notes = null,
    verifiedBy = null,
  }) {
    const result = await this.pool.query(`
      INSERT INTO customer_tax_exemptions (
        customer_id, exemption_reason_id, exemption_number,
        province_code, valid_from, valid_until,
        certificate_file_path, notes, verified_by,
        verified_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (customer_id, province_code, tax_type)
      DO UPDATE SET
        exemption_reason_id = EXCLUDED.exemption_reason_id,
        exemption_number = EXCLUDED.exemption_number,
        valid_from = EXCLUDED.valid_from,
        valid_until = EXCLUDED.valid_until,
        certificate_file_path = EXCLUDED.certificate_file_path,
        notes = EXCLUDED.notes,
        verified_by = EXCLUDED.verified_by,
        verified_at = EXCLUDED.verified_at,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      customerId,
      exemptionReasonId,
      exemptionNumber,
      provinceCode,
      validFrom,
      validUntil,
      certificateFilePath,
      notes,
      verifiedBy,
      verifiedBy ? new Date() : null,
    ]);

    // Clear cache
    if (this.cache) {
      await this.cache.invalidatePattern(`tax:exempt:customer:${customerId}:*`);
    }

    return result.rows[0];
  }

  /**
   * Remove/deactivate customer exemption
   */
  async removeCustomerExemption(exemptionId) {
    const result = await this.pool.query(`
      UPDATE customer_tax_exemptions
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING customer_id
    `, [exemptionId]);

    if (result.rows.length > 0 && this.cache) {
      await this.cache.invalidatePattern(`tax:exempt:customer:${result.rows[0].customer_id}:*`);
    }

    return result.rowCount > 0;
  }

  // ============================================================================
  // AUDIT LOGGING
  // ============================================================================

  /**
   * Log a tax calculation for audit purposes
   */
  async logCalculation({
    orderId = null,
    quoteId = null,
    transactionId = null,
    provinceCode,
    subtotalCents,
    taxableAmountCents,
    hstCents = 0,
    gstCents = 0,
    pstCents = 0,
    qstCents = 0,
    totalTaxCents,
    taxRatesSnapshot,
    exemptionsApplied = null,
    calculatedBy = null,
  }) {
    const result = await this.pool.query(`
      INSERT INTO tax_calculation_log (
        order_id, quote_id, transaction_id,
        province_code, subtotal_cents, taxable_amount_cents,
        hst_cents, gst_cents, pst_cents, qst_cents, total_tax_cents,
        tax_rates_snapshot, exemptions_applied, calculated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      orderId, quoteId, transactionId,
      provinceCode, subtotalCents, taxableAmountCents,
      hstCents, gstCents, pstCents, qstCents, totalTaxCents,
      JSON.stringify(taxRatesSnapshot),
      exemptionsApplied ? JSON.stringify(exemptionsApplied) : null,
      calculatedBy,
    ]);

    return result.rows[0].id;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  _roundCents(cents) {
    return Math.round(cents);
  }

  _getDefaultRates(provinceCode) {
    const rates = PricingCalculator.TAX_RATES[provinceCode] ||
                  PricingCalculator.TAX_RATES['ON'];

    // For Quebec, the PST in PricingCalculator is actually QST
    const isQuebec = provinceCode === 'QC';

    return {
      provinceCode,
      provinceName: this._getProvinceName(provinceCode),
      hst: rates.hst,
      gst: rates.gst,
      pst: isQuebec ? 0 : rates.pst,  // Quebec has no PST, only QST
      qst: isQuebec ? rates.pst : 0,   // Quebec's PST is actually QST
      isQstCompound: isQuebec,
      displayLabel: rates.label,
    };
  }

  _parseDbRates(rows, provinceCode) {
    const rates = {
      provinceCode,
      provinceName: '',
      hst: 0,
      gst: 0,
      pst: 0,
      qst: 0,
      isQstCompound: false,
      displayLabel: '',
    };

    const labels = [];

    for (const row of rows) {
      const rate = parseFloat(row.rate_percent) / 100;

      switch (row.tax_type) {
        case 'hst':
          rates.hst = rate;
          break;
        case 'gst':
          rates.gst = rate;
          break;
        case 'pst':
          rates.pst = rate;
          break;
        case 'qst':
          rates.qst = rate;
          rates.isQstCompound = row.is_compound;
          break;
      }

      if (row.display_label) {
        labels.push(row.display_label);
      }
    }

    rates.displayLabel = labels.join(' + ');
    return rates;
  }

  _getProvinceName(code) {
    const names = {
      ON: 'Ontario',
      BC: 'British Columbia',
      AB: 'Alberta',
      SK: 'Saskatchewan',
      MB: 'Manitoba',
      QC: 'Quebec',
      NB: 'New Brunswick',
      NS: 'Nova Scotia',
      NL: 'Newfoundland and Labrador',
      PE: 'Prince Edward Island',
      NT: 'Northwest Territories',
      NU: 'Nunavut',
      YT: 'Yukon',
    };
    return names[code] || code;
  }
}

module.exports = TaxService;
