/**
 * Tax Engine Service
 * Province-aware Canadian tax calculation with exemption support.
 * Called by POS sale flow, quotation builder, and invoice generator.
 * All monetary values are INTEGER cents — never float.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const S3_BUCKET = process.env.S3_BUCKET || 'teletime-product-images';
const CDN_BASE = process.env.CDN_BASE_URL || `https://${S3_BUCKET}.s3.amazonaws.com`;

// Default store province (Ontario)
const DEFAULT_PROVINCE = 'ON';

// Full province name → 2-char code lookup
const PROVINCE_NAME_TO_CODE = {
  'ontario': 'ON', 'british columbia': 'BC', 'alberta': 'AB',
  'quebec': 'QC', 'québec': 'QC', 'manitoba': 'MB',
  'saskatchewan': 'SK', 'nova scotia': 'NS',
  'new brunswick': 'NB', 'newfoundland': 'NL',
  'newfoundland and labrador': 'NL', 'prince edward island': 'PE',
  'northwest territories': 'NT', 'nunavut': 'NU', 'yukon': 'YT',
};

// Valid 2-char province codes
const VALID_PROVINCE_CODES = new Set(Object.values(PROVINCE_NAME_TO_CODE));

class TaxEngineService {
  constructor(pool) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // CORE: calculateTax
  // -------------------------------------------------------------------------

  /**
   * Calculate tax for a subtotal in a given province, with optional exemption.
   * If transactionId + transactionType provided, persists breakdown atomically.
   *
   * @param {object} params
   * @param {number}  params.subtotalCents - Positive integer
   * @param {string}  params.provinceCode - Two-letter province code
   * @param {number}  [params.customerId] - For exemption lookup
   * @param {number}  [params.transactionId] - To persist breakdown
   * @param {string}  [params.transactionType] - 'pos_sale'|'quote'|'invoice'
   * @returns {Promise<object>} Tax breakdown
   */
  async calculateTax({
    subtotalCents,
    provinceCode,
    customerId = null,
    transactionId = null,
    transactionType = null,
  }) {
    if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
      throw this._error('INVALID_INPUT', 'subtotalCents must be a non-negative integer', {
        subtotalCents
      });
    }

    const province = (provinceCode || DEFAULT_PROVINCE).toUpperCase().trim();

    // 1. Fetch active rates
    const ratesRes = await this.pool.query(
      `SELECT tax_type, rate
       FROM tax_rates
       WHERE province_code = $1
         AND effective_date <= CURRENT_DATE
         AND (end_date IS NULL OR end_date > CURRENT_DATE)`,
      [province]
    );

    if (ratesRes.rows.length === 0) {
      throw this._error('NO_RATES', `No active tax rates found for province ${province}`, {
        provinceCode: province
      });
    }

    // 2. Fetch active exemption if customer provided
    let exemption = null;
    if (customerId != null) {
      const exemptRes = await this.pool.query(
        `SELECT *
         FROM tax_exemption_certificates
         WHERE customer_id = $1
           AND province_code = $2
           AND verified = TRUE
           AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
         ORDER BY created_at DESC
         LIMIT 1`,
        [customerId, province]
      );
      exemption = exemptRes.rows[0] || null;
    }

    const exemptTypes = new Set(exemption?.exempt_tax_types || []);

    // 3. Build breakdown
    const breakdown = { gst: null, hst: null, pst: null, qst: null };
    let totalTaxCents = 0;

    for (const { tax_type, rate } of ratesRes.rows) {
      const key = tax_type.toLowerCase();
      const numRate = Number(rate);

      if (exemptTypes.has(tax_type)) {
        breakdown[key] = { rate: numRate, cents: 0 };
      } else {
        const cents = Math.round(subtotalCents * numRate);
        breakdown[key] = { rate: numRate, cents };
        totalTaxCents += cents;
      }
    }

    const totalCents = subtotalCents + totalTaxCents;
    const exemptCertId = exemption?.id || null;
    const isFullyExempt = totalTaxCents === 0 && ratesRes.rows.length > 0;

    // 4. Persist breakdown if transaction reference provided
    if (transactionId != null && transactionType) {
      await this.pool.query(
        `INSERT INTO transaction_tax_breakdown (
           transaction_id, transaction_type, province_code, subtotal_cents,
           gst_rate, gst_cents, hst_rate, hst_cents,
           pst_rate, pst_cents, qst_rate, qst_cents,
           total_tax_cents, total_cents, exempt_cert_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          transactionId,
          transactionType,
          province,
          subtotalCents,
          breakdown.gst?.rate ?? null,
          breakdown.gst?.cents ?? null,
          breakdown.hst?.rate ?? null,
          breakdown.hst?.cents ?? null,
          breakdown.pst?.rate ?? null,
          breakdown.pst?.cents ?? null,
          breakdown.qst?.rate ?? null,
          breakdown.qst?.cents ?? null,
          totalTaxCents,
          totalCents,
          exemptCertId,
        ]
      );
    }

    return {
      provinceCode: province,
      subtotalCents,
      breakdown,
      totalTaxCents,
      totalCents,
      exemptCertId,
      isFullyExempt,
      isEstimated: false,
    };
  }

  // -------------------------------------------------------------------------
  // PROVINCE RESOLUTION
  // -------------------------------------------------------------------------

  /**
   * Resolve the tax province for a customer.
   * Fallback chain: customer.province → postal_code_cache (FSA) → 'ON'.
   *
   * @param {number} customerId
   * @returns {Promise<{provinceCode: string, source: string, isEstimated: boolean}>}
   */
  async getProvinceForCustomer(customerId) {
    const res = await this.pool.query(
      `SELECT province, postal_code FROM customers WHERE id = $1`,
      [customerId]
    );

    if (res.rows.length === 0) {
      throw this._error('CUSTOMER_NOT_FOUND', 'Customer not found', { customerId });
    }

    const { province, postal_code } = res.rows[0];

    // 1. Resolve from customers.province
    if (province && province.trim()) {
      const code = this._normalizeProvince(province.trim());
      if (code) {
        return { provinceCode: code, source: 'billing', isEstimated: false };
      }
    }

    // 2. Resolve from postal_code_cache via FSA (first 3 chars)
    if (postal_code && postal_code.trim()) {
      const fsa = postal_code.replace(/\s/g, '').substring(0, 3).toUpperCase();
      if (fsa.length === 3) {
        const pcRes = await this.pool.query(
          `SELECT province_code FROM postal_code_cache
           WHERE postal_code = $1
           LIMIT 1`,
          [fsa]
        );
        if (pcRes.rows.length > 0 && pcRes.rows[0].province_code) {
          return {
            provinceCode: pcRes.rows[0].province_code.toUpperCase(),
            source: 'postal_code',
            isEstimated: false,
          };
        }
      }
    }

    // 3. Default: Ontario
    return { provinceCode: DEFAULT_PROVINCE, source: 'default', isEstimated: true };
  }

  /**
   * Normalize a province string to a 2-char uppercase code.
   * Handles both 'ON' and 'Ontario' formats.
   * Returns null if unrecognized.
   */
  _normalizeProvince(raw) {
    if (raw.length === 2) {
      const upper = raw.toUpperCase();
      return VALID_PROVINCE_CODES.has(upper) ? upper : null;
    }
    return PROVINCE_NAME_TO_CODE[raw.toLowerCase()] || null;
  }

  // -------------------------------------------------------------------------
  // EXEMPTIONS
  // -------------------------------------------------------------------------

  /**
   * Get all verified, non-expired exemption certificates for a customer.
   * @param {number} customerId
   * @returns {Promise<object[]>}
   */
  async getActiveExemptions(customerId) {
    const res = await this.pool.query(
      `SELECT tec.*, u.first_name || ' ' || u.last_name AS verified_by_name
       FROM tax_exemption_certificates tec
       LEFT JOIN users u ON u.id = tec.verified_by
       WHERE tec.customer_id = $1
         AND tec.verified = TRUE
         AND (tec.expiry_date IS NULL OR tec.expiry_date > CURRENT_DATE)
       ORDER BY tec.created_at DESC`,
      [customerId]
    );
    return res.rows;
  }

  /**
   * Upload an exemption certificate (file → S3, row → DB).
   * Certificate is created as unverified.
   *
   * @param {number} customerId
   * @param {string} provinceCode
   * @param {object} certData - { certificate_number, exempt_tax_types[], issued_date, expiry_date?, notes? }
   * @param {Buffer} fileBuffer - PDF or image file
   * @param {number} userId
   * @returns {Promise<object>} New certificate row
   */
  async uploadExemptionCertificate(customerId, provinceCode, certData, fileBuffer, userId) {
    // Upload to S3
    let documentUrl = null;
    if (fileBuffer && fileBuffer.length > 0) {
      const key = `tax-exemptions/${customerId}/${randomUUID()}.pdf`;
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: 'application/pdf',
      }));
      documentUrl = `${CDN_BASE}/${key}`;
    }

    const res = await this.pool.query(
      `INSERT INTO tax_exemption_certificates (
         customer_id, province_code, certificate_number, exempt_tax_types,
         issued_date, expiry_date, document_url, notes, verified
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING *`,
      [
        customerId,
        provinceCode.toUpperCase(),
        certData.certificate_number,
        certData.exempt_tax_types,
        certData.issued_date,
        certData.expiry_date || null,
        documentUrl,
        certData.notes || null,
      ]
    );
    return res.rows[0];
  }

  /**
   * Mark an exemption certificate as verified.
   * Authorization check (manager/admin) is enforced in route middleware.
   *
   * @param {string} certId - UUID
   * @param {number} userId
   * @returns {Promise<object>} Updated certificate row
   */
  async verifyExemptionCertificate(certId, userId) {
    const res = await this.pool.query(
      `UPDATE tax_exemption_certificates
       SET verified = TRUE, verified_by = $1, verified_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, certId]
    );
    if (res.rows.length === 0) {
      throw this._error('CERT_NOT_FOUND', 'Exemption certificate not found', { certId });
    }
    return res.rows[0];
  }

  // -------------------------------------------------------------------------
  // RATES ADMIN
  // -------------------------------------------------------------------------

  /**
   * Get all currently active tax rates grouped by province.
   * @returns {Promise<object>} { ON: [{tax_type, rate}], BC: [...], ... }
   */
  async getActiveRates() {
    const res = await this.pool.query(
      `SELECT id, province_code, tax_type, rate, effective_date
       FROM tax_rates
       WHERE effective_date <= CURRENT_DATE
         AND (end_date IS NULL OR end_date > CURRENT_DATE)
       ORDER BY province_code, tax_type`
    );

    const grouped = {};
    for (const row of res.rows) {
      if (!grouped[row.province_code]) grouped[row.province_code] = [];
      grouped[row.province_code].push({
        id: row.id,
        taxType: row.tax_type,
        rate: Number(row.rate),
        effectiveDate: row.effective_date,
      });
    }
    return grouped;
  }

  // -------------------------------------------------------------------------
  // ERROR HELPER
  // -------------------------------------------------------------------------

  _error(code, message, context = {}) {
    const err = new Error(message);
    err.code = code;
    err.context = context;
    return err;
  }
}

module.exports = TaxEngineService;
