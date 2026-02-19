/**
 * PromotionImportService
 *
 * Handles importing manufacturer promotion data from Excel files.
 * Supports:
 * - Manual file upload
 * - Automated folder watch imports
 * - Model matching to local product database
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;

class PromotionImportService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Import a promotion Excel file
   * @param {string} filePath - Path to the Excel file
   * @param {object} options - Import options
   * @param {string} options.source - 'manual_upload' or 'folder_watch'
   * @param {number} options.userId - User ID who initiated import
   * @param {object} options.promotionOverrides - Override promotion fields
   * @returns {object} Import result with statistics
   */
  async importPromotionFile(filePath, options = {}) {
    const { source = 'manual_upload', userId = null, promotionOverrides = {} } = options;
    const fileName = path.basename(filePath);
    const startTime = Date.now();

    // Create import log entry
    const logResult = await this.pool.query(`
      INSERT INTO promotion_import_logs (file_name, file_path, import_source, imported_by, status)
      VALUES ($1, $2, $3, $4, 'in_progress')
      RETURNING id
    `, [fileName, filePath, source, userId]);
    const logId = logResult.rows[0].id;

    try {
      // Read and parse Excel file
      const fileBuffer = await fs.readFile(filePath);
      const parsed = await this.parseExcelFile(fileBuffer, fileName);

      if (!parsed.models || parsed.models.length === 0) {
        throw new Error('No eligible models found in file');
      }

      // Create or update promotion
      const promotionData = { ...parsed.promotion, ...promotionOverrides };
      const promotion = await this.upsertPromotion(promotionData);

      // Import eligible models
      const modelResults = await this.importEligibleModels(promotion.id, parsed.models);

      // Match models to local products
      const matchResults = await this.matchModelsToProducts(promotion.id);

      // Update import log with success
      const processingTime = Date.now() - startTime;
      await this.pool.query(`
        UPDATE promotion_import_logs
        SET status = 'success',
            manufacturer = $1,
            promotions_created = $2,
            promotions_updated = $3,
            models_imported = $4,
            models_matched = $5,
            processing_time_ms = $6,
            completed_at = CURRENT_TIMESTAMP,
            summary = $7
        WHERE id = $8
      `, [
        promotion.manufacturer,
        promotionData.isNew ? 1 : 0,
        promotionData.isNew ? 0 : 1,
        modelResults.imported,
        matchResults.matched,
        processingTime,
        JSON.stringify({
          promotionId: promotion.id,
          promoCode: promotion.promo_code,
          categories: parsed.categories,
          modelResults,
          matchResults
        }),
        logId
      ]);

      return {
        success: true,
        logId,
        promotion: {
          id: promotion.id,
          promo_code: promotion.promo_code,
          promo_name: promotion.promo_name
        },
        stats: {
          modelsImported: modelResults.imported,
          modelsSkipped: modelResults.skipped,
          modelsMatched: matchResults.matched,
          processingTimeMs: processingTime
        }
      };

    } catch (error) {
      // Update import log with failure
      await this.pool.query(`
        UPDATE promotion_import_logs
        SET status = 'failed',
            errors_count = 1,
            error_details = $1,
            processing_time_ms = $2,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [
        JSON.stringify({ message: error.message, stack: error.stack }),
        Date.now() - startTime,
        logId
      ]);

      throw error;
    }
  }

  /**
   * Parse Excel file to extract promotion data and eligible models
   * @param {Buffer} buffer - File buffer
   * @param {string} fileName - Original file name (helps detect promotion type)
   * @returns {object} Parsed data with promotion info and models array
   */
  async parseExcelFile(buffer, fileName = '') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      throw new Error('Excel file appears to be empty or has no data rows');
    }

    // Detect column mapping from header row
    const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
    const columnMap = this.detectColumns(headers);

    // Extract models from data rows
    const models = [];
    const categories = new Set();
    const brands = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const brand = this.getColumnValue(row, columnMap.brand);
      const model = this.getColumnValue(row, columnMap.model);

      if (!model) continue; // Skip rows without model

      const category = this.getColumnValue(row, columnMap.category);
      const subcategory = this.getColumnValue(row, columnMap.subcategory);

      if (category) categories.add(category);
      if (brand) brands.add(brand);

      models.push({
        brand: brand || this.detectBrandFromFileName(fileName),
        model: model,
        category: category,
        subcategory: subcategory,
        product_family_detail: this.getColumnValue(row, columnMap.productFamily),
        notes: this.getColumnValue(row, columnMap.notes)
      });
    }

    // Detect promotion type and generate promotion data from file name
    const promotion = this.detectPromotionFromFileName(fileName, {
      brands: Array.from(brands),
      categories: Array.from(categories),
      modelCount: models.length
    });

    return {
      promotion,
      models,
      categories: Array.from(categories),
      brands: Array.from(brands)
    };
  }

  /**
   * Detect column indices from header row
   */
  detectColumns(headers) {
    const findColumn = (patterns) => {
      for (const pattern of patterns) {
        const idx = headers.findIndex(h => h.includes(pattern));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    return {
      brand: findColumn(['brand', 'manufacturer', 'mfr']),
      model: findColumn(['model', 'sku', 'part']),
      category: findColumn(['category', 'cat']),
      subcategory: findColumn(['subcategory', 'subcat', 'sub_category']),
      productFamily: findColumn(['product family', 'family', 'product_family']),
      notes: findColumn(['notes', 'note', 'comment'])
    };
  }

  /**
   * Get value from row by column index
   */
  getColumnValue(row, index) {
    if (index < 0 || index >= row.length) return null;
    const val = row[index];
    if (val === null || val === undefined) return null;
    return String(val).trim();
  }

  /**
   * Detect brand from file name
   */
  detectBrandFromFileName(fileName) {
    const upper = fileName.toUpperCase();
    if (upper.includes('WHR') || upper.includes('WHIRLPOOL')) return 'WHIRLPOOL';
    if (upper.includes('KITCHENAID') || upper.includes('KAD')) return 'KITCHENAID';
    if (upper.includes('MAYTAG') || upper.includes('MAY')) return 'MAYTAG';
    if (upper.includes('JENNAIR') || upper.includes('JNA')) return 'JENNAIR';
    if (upper.includes('AMANA')) return 'AMANA';
    return 'WHIRLPOOL'; // Default
  }

  /**
   * Detect promotion type and details from file name
   */
  detectPromotionFromFileName(fileName, context = {}) {
    const upper = fileName.toUpperCase();
    const brand = this.detectBrandFromFileName(fileName);

    // Extract date from filename (e.g., "Feb 2026")
    const dateMatch = fileName.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i);
    let startDate, endDate;

    if (dateMatch) {
      const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const month = monthMap[dateMatch[1].toUpperCase()];
      const year = parseInt(dateMatch[2]);

      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0); // Last day of month
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Detect promotion type
    let promoType = 'bundle_savings';
    let promoName = `${brand} Promotion`;
    let tierDiscounts = null;
    let minQualifyingItems = null;
    let badgeText = null;
    let giftDescription = null;

    if (upper.includes('SUITE') || upper.includes('BUNDLE') || upper.includes('BMSM')) {
      promoType = 'bundle_savings';
      promoName = `${brand} Kitchen Suite Savings`;
      minQualifyingItems = 2;
      tierDiscounts = [
        { min_items: 2, discount_cents: 15000 },
        { min_items: 3, discount_cents: 30000 }
      ];
    } else if (upper.includes('INDUCTION') || upper.includes('COOKWARE')) {
      promoType = 'bonus_gift';
      promoName = `${brand} Induction Cookware Offer`;
      giftDescription = 'Free 4-Piece Induction-Ready Cookware Set ($599.99 value)';
    } else if (upper.includes('GUARANTEE') || upper.includes('MONEY-BACK') || upper.includes('MONEYBACK')) {
      promoType = 'guarantee';
      promoName = `${brand} 30-Day Money-Back Guarantee`;
      badgeText = '30-Day Money-Back';
    }

    // Generate promo code
    const monthStr = startDate.toISOString().slice(0, 7).replace('-', '');
    const typeCode = promoType === 'bundle_savings' ? 'BUNDLE' : promoType === 'bonus_gift' ? 'GIFT' : 'GUAR';
    const promoCode = `${brand.substring(0, 3)}-${typeCode}-${monthStr}`;

    return {
      promo_code: promoCode,
      promo_name: promoName,
      manufacturer: brand,
      promo_type: promoType,
      min_qualifying_items: minQualifyingItems,
      tier_discounts: tierDiscounts,
      gift_description: giftDescription,
      badge_text: badgeText,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      source_file: fileName,
      exclusion_rules: { exclude_categories: ['countertop_microwave'] }
    };
  }

  /**
   * Create or update a promotion
   */
  async upsertPromotion(data) {
    // Check if promotion with same promo_code exists
    const existing = await this.pool.query(
      'SELECT id FROM manufacturer_promotions WHERE promo_code = $1',
      [data.promo_code]
    );

    if (existing.rows.length > 0) {
      // Update existing
      const result = await this.pool.query(`
        UPDATE manufacturer_promotions SET
          promo_name = COALESCE($2, promo_name),
          manufacturer = COALESCE($3, manufacturer),
          promo_type = COALESCE($4, promo_type),
          min_qualifying_items = COALESCE($5, min_qualifying_items),
          tier_discounts = COALESCE($6, tier_discounts),
          gift_description = COALESCE($7, gift_description),
          badge_text = COALESCE($8, badge_text),
          start_date = COALESCE($9, start_date),
          end_date = COALESCE($10, end_date),
          source_file = COALESCE($11, source_file),
          exclusion_rules = COALESCE($12, exclusion_rules),
          is_active = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE promo_code = $1
        RETURNING *
      `, [
        data.promo_code,
        data.promo_name,
        data.manufacturer,
        data.promo_type,
        data.min_qualifying_items,
        data.tier_discounts ? JSON.stringify(data.tier_discounts) : null,
        data.gift_description,
        data.badge_text,
        data.start_date,
        data.end_date,
        data.source_file,
        data.exclusion_rules ? JSON.stringify(data.exclusion_rules) : null
      ]);

      const promo = result.rows[0];
      promo.isNew = false;
      return promo;
    }

    // Insert new
    const result = await this.pool.query(`
      INSERT INTO manufacturer_promotions (
        promo_code, promo_name, manufacturer, promo_type,
        min_qualifying_items, tier_discounts, gift_description, badge_text,
        start_date, end_date, source_file, exclusion_rules, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
      RETURNING *
    `, [
      data.promo_code,
      data.promo_name,
      data.manufacturer,
      data.promo_type,
      data.min_qualifying_items,
      data.tier_discounts ? JSON.stringify(data.tier_discounts) : null,
      data.gift_description,
      data.badge_text,
      data.start_date,
      data.end_date,
      data.source_file,
      data.exclusion_rules ? JSON.stringify(data.exclusion_rules) : null
    ]);

    const promo = result.rows[0];
    promo.isNew = true;
    return promo;
  }

  /**
   * Import eligible models for a promotion
   */
  async importEligibleModels(promotionId, models) {
    let imported = 0;
    let skipped = 0;

    // Clear existing models for this promotion
    await this.pool.query(
      'DELETE FROM promotion_eligible_models WHERE promotion_id = $1',
      [promotionId]
    );

    for (const model of models) {
      try {
        await this.pool.query(`
          INSERT INTO promotion_eligible_models (
            promotion_id, brand, category, subcategory, model, product_family_detail, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (promotion_id, brand, model) DO UPDATE SET
            category = EXCLUDED.category,
            subcategory = EXCLUDED.subcategory,
            product_family_detail = EXCLUDED.product_family_detail,
            notes = EXCLUDED.notes
        `, [
          promotionId,
          model.brand,
          model.category,
          model.subcategory,
          model.model,
          model.product_family_detail,
          model.notes
        ]);
        imported++;
      } catch (error) {
        console.error(`Failed to import model ${model.model}:`, error.message);
        skipped++;
      }
    }

    return { imported, skipped };
  }

  /**
   * Match imported models to local products database
   */
  async matchModelsToProducts(promotionId) {
    // Update product_id for models that match local products by model number
    const result = await this.pool.query(`
      UPDATE promotion_eligible_models pem
      SET product_id = p.id
      FROM products p
      WHERE pem.promotion_id = $1
        AND pem.product_id IS NULL
        AND (
          UPPER(pem.model) = UPPER(p.model)
          OR UPPER(pem.model) = UPPER(REPLACE(p.model, '-', ''))
          OR UPPER(REPLACE(pem.model, '-', '')) = UPPER(p.model)
        )
    `, [promotionId]);

    // Count matched models
    const countResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE product_id IS NOT NULL) as matched,
        COUNT(*) as total
      FROM promotion_eligible_models
      WHERE promotion_id = $1
    `, [promotionId]);

    return {
      matched: parseInt(countResult.rows[0].matched) || 0,
      total: parseInt(countResult.rows[0].total) || 0
    };
  }

  /**
   * Get import history logs
   */
  async getImportLogs(filters = {}) {
    const { limit = 50, offset = 0, status, manufacturer } = filters;
    const params = [];
    let whereClause = 'WHERE 1=1';
    let paramIdx = 1;

    if (status) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (manufacturer) {
      whereClause += ` AND manufacturer = $${paramIdx++}`;
      params.push(manufacturer);
    }

    params.push(limit, offset);

    const result = await this.pool.query(`
      SELECT pil.*, CONCAT(u.first_name, ' ', u.last_name) as imported_by_name
      FROM promotion_import_logs pil
      LEFT JOIN users u ON pil.imported_by = u.id
      ${whereClause}
      ORDER BY pil.started_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, params);

    return result.rows;
  }

  /**
   * Get a single import log with details
   */
  async getImportLogById(logId) {
    const result = await this.pool.query(`
      SELECT pil.*, CONCAT(u.first_name, ' ', u.last_name) as imported_by_name
      FROM promotion_import_logs pil
      LEFT JOIN users u ON pil.imported_by = u.id
      WHERE pil.id = $1
    `, [logId]);

    return result.rows[0] || null;
  }
}

module.exports = PromotionImportService;
