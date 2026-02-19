const pool = require('../db');

/**
 * FeedEngine — Transforms product data to meet each channel's specific requirements.
 *
 * Uses channel_feed_templates to define per-channel field mappings, transformations,
 * and validation rules. Scores product listings for completeness.
 *
 * Usage:
 *   const feedEngine = require('./services/FeedEngine');
 *   const result = await feedEngine.transformProduct(product, channelId);
 *   const score  = await feedEngine.scoreProduct(productId, channelId);
 */
class FeedEngine {
  constructor(dbPool) {
    this.pool = dbPool;

    // Template cache: channelId -> { templates, loadedAt }
    this._cache = new Map();
    this._cacheTTL = 60_000; // 1 minute

    // Pluggable transformer registry
    this.transformers = {
      truncate: (val, opts) => {
        return String(val || '').substring(0, opts.max_length || 9999);
      },

      strip_html: (val, opts) => {
        return String(val || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, opts.max_length || 9999);
      },

      format: (val, opts, product) => {
        let result = opts.pattern || '{value}';
        // Replace all {fieldName} placeholders with product values
        for (const [key, v] of Object.entries(product)) {
          result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), v != null ? String(v) : '');
        }
        return result.replace(/\s+/g, ' ').trim().substring(0, opts.max_length || 9999);
      },

      upc_validate: (val) => {
        const cleaned = String(val || '').replace(/\D/g, '');
        if (cleaned.length === 12 || cleaned.length === 13) return cleaned;
        return null; // invalid UPC
      },

      number: (val, opts) => {
        const n = parseFloat(val);
        if (isNaN(n)) return null;
        if (opts.min !== undefined && n < opts.min) return null;
        if (opts.max !== undefined && n > opts.max) return null;
        return n;
      },

      integer: (val, opts) => {
        const n = parseInt(val, 10);
        if (isNaN(n)) return null;
        if (opts.min !== undefined && n < opts.min) return null;
        if (opts.max !== undefined && n > opts.max) return null;
        return n;
      },

      enum: (val, opts) => {
        const values = opts.values || [];
        if (values.includes(val)) return val;
        return null; // don't default to first — let default_value handle it
      },

      string: (val) => {
        return val != null ? String(val) : '';
      },

      boolean: (val) => {
        if (val === true || val === 'true' || val === '1' || val === 1) return true;
        if (val === false || val === 'false' || val === '0' || val === 0) return false;
        return null;
      },

      date: (val, opts) => {
        if (!val) return null;
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return null;
        if (opts.format === 'iso') return d.toISOString();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },

      concat: (val, opts, product) => {
        const fields = opts.fields || [];
        const separator = opts.separator || ' ';
        return fields
          .map(f => product[f] != null ? String(product[f]) : '')
          .filter(Boolean)
          .join(separator)
          .substring(0, opts.max_length || 9999);
      }
    };
  }

  // ============================================================
  // TEMPLATE LOADING (with cache)
  // ============================================================

  /**
   * Get feed templates for a channel (cached).
   * @param {number} channelId
   * @returns {Array} templates
   */
  async getTemplates(channelId) {
    const cached = this._cache.get(channelId);
    if (cached && (Date.now() - cached.loadedAt) < this._cacheTTL) {
      return cached.templates;
    }

    const { rows } = await this.pool.query(
      'SELECT * FROM channel_feed_templates WHERE channel_id = $1 ORDER BY display_order, id',
      [channelId]
    );

    this._cache.set(channelId, { templates: rows, loadedAt: Date.now() });
    return rows;
  }

  /** Invalidate template cache for a channel. */
  invalidateCache(channelId) {
    if (channelId) {
      this._cache.delete(channelId);
    } else {
      this._cache.clear();
    }
  }

  // ============================================================
  // PRODUCT TRANSFORMATION
  // ============================================================

  /**
   * Transform a product for a specific channel using its feed template.
   *
   * @param {object} product - raw product row from DB
   * @param {number} channelId
   * @returns {{ transformed, errors, warnings, valid }}
   */
  async transformProduct(product, channelId) {
    const templates = await this.getTemplates(channelId);

    if (templates.length === 0) {
      return {
        transformed: { ...product },
        errors: [],
        warnings: [{ field: '_template', message: 'No feed template configured for this channel' }],
        valid: true
      };
    }

    const transformed = {};
    const errors = [];
    const warnings = [];

    for (const tmpl of templates) {
      const rawValue = product[tmpl.source_field];
      const transform = tmpl.transformation || {};
      const transformType = transform.type || 'string';
      const transformer = this.transformers[transformType];

      let value;
      if (transformer) {
        try {
          value = transformer(rawValue, transform, product);
        } catch (err) {
          value = null;
          warnings.push({
            field: tmpl.field_name,
            message: `Transform "${transformType}" failed: ${err.message}`
          });
        }
      } else {
        value = rawValue;
        warnings.push({
          field: tmpl.field_name,
          message: `Unknown transform type: ${transformType}`
        });
      }

      // Apply max_length enforcement (double-check even after transform)
      if (tmpl.max_length && typeof value === 'string' && value.length > tmpl.max_length) {
        value = value.substring(0, tmpl.max_length);
        warnings.push({
          field: tmpl.field_name,
          message: `Truncated to ${tmpl.max_length} characters`
        });
      }

      // Apply default_value if value is empty
      if (value === null || value === undefined || value === '') {
        value = tmpl.default_value ?? null;
      }

      // Required field check
      if (tmpl.required && (value === null || value === undefined || value === '')) {
        errors.push({
          field: tmpl.field_name,
          sourceField: tmpl.source_field,
          message: `Required field missing: ${tmpl.field_name} (source: ${tmpl.source_field})`
        });
      }

      transformed[tmpl.field_name] = value;
    }

    return {
      transformed,
      errors,
      warnings,
      valid: errors.length === 0
    };
  }

  /**
   * Transform multiple products for a channel (bulk).
   *
   * @param {Array} products
   * @param {number} channelId
   * @returns {{ results, validCount, invalidCount, errorSummary }}
   */
  async transformBulk(products, channelId) {
    const templates = await this.getTemplates(channelId);
    let validCount = 0;
    let invalidCount = 0;
    const errorSummary = {};

    const results = [];
    for (const product of products) {
      // Use cached templates directly to avoid repeated queries
      const result = await this.transformProduct(product, channelId);
      result.productId = product.id;
      result.sku = product.sku;
      results.push(result);

      if (result.valid) {
        validCount++;
      } else {
        invalidCount++;
        for (const err of result.errors) {
          errorSummary[err.field] = (errorSummary[err.field] || 0) + 1;
        }
      }
    }

    return { results, validCount, invalidCount, errorSummary, total: products.length };
  }

  // ============================================================
  // PRODUCT SCORING
  // ============================================================

  /**
   * Score a product's listing quality for a channel.
   * completeness = (fields with valid values / total template fields) * 100
   *
   * @param {number} productId
   * @param {number} channelId
   * @returns {{ score, missingFields, warnings, productId, channelId }}
   */
  async scoreProduct(productId, channelId) {
    // Get product data
    const productResult = await this.pool.query(
      'SELECT * FROM products WHERE id = $1',
      [productId]
    );
    if (productResult.rows.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }
    const product = productResult.rows[0];

    // Transform to find errors/warnings
    const { transformed, errors, warnings } = await this.transformProduct(product, channelId);

    const templates = await this.getTemplates(channelId);
    const totalFields = templates.length;
    if (totalFields === 0) {
      return { score: 100, missingFields: [], warnings: [], productId, channelId };
    }

    // Count fields that have valid (non-null, non-empty) values
    let filledFields = 0;
    const missingFields = [];
    for (const tmpl of templates) {
      const val = transformed[tmpl.field_name];
      if (val !== null && val !== undefined && val !== '') {
        filledFields++;
      } else {
        missingFields.push({
          field: tmpl.field_name,
          sourceField: tmpl.source_field,
          required: tmpl.required
        });
      }
    }

    const score = Math.round((filledFields / totalFields) * 100);

    // Upsert into product_listing_scores
    await this.pool.query(
      `INSERT INTO product_listing_scores
         (product_id, channel_id, completeness_score, missing_fields, warnings, last_scored_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (product_id, channel_id) DO UPDATE
       SET completeness_score = EXCLUDED.completeness_score,
           missing_fields = EXCLUDED.missing_fields,
           warnings = EXCLUDED.warnings,
           last_scored_at = NOW()`,
      [productId, channelId, score, JSON.stringify(missingFields), JSON.stringify(warnings)]
    );

    return { score, missingFields, warnings, errors, productId, channelId };
  }

  /**
   * Bulk score all products with listings on a channel.
   *
   * @param {number} channelId
   * @param {object} options - { threshold: 80 }
   * @returns {{ avgScore, totalScored, belowThreshold, aboveThreshold, distribution }}
   */
  async scoreBulk(channelId, options = {}) {
    const threshold = options.threshold || 80;

    // Get all products listed on this channel
    const { rows: listings } = await this.pool.query(
      `SELECT pcl.product_id, p.*
       FROM product_channel_listings pcl
       JOIN products p ON p.id = pcl.product_id
       WHERE pcl.channel_id = $1
       ORDER BY pcl.product_id`,
      [channelId]
    );

    if (listings.length === 0) {
      return {
        avgScore: 0,
        totalScored: 0,
        belowThreshold: 0,
        aboveThreshold: 0,
        distribution: {},
        threshold
      };
    }

    // Preload templates once (cache will be warm)
    await this.getTemplates(channelId);

    let totalScore = 0;
    let belowThreshold = 0;
    let aboveThreshold = 0;
    const distribution = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };

    for (const product of listings) {
      const { score } = await this.scoreProduct(product.id, channelId);
      totalScore += score;
      if (score < threshold) belowThreshold++;
      else aboveThreshold++;

      if (score <= 25) distribution['0-25']++;
      else if (score <= 50) distribution['26-50']++;
      else if (score <= 75) distribution['51-75']++;
      else distribution['76-100']++;
    }

    return {
      avgScore: Math.round(totalScore / listings.length),
      totalScored: listings.length,
      belowThreshold,
      aboveThreshold,
      distribution,
      threshold
    };
  }

  /**
   * Get stored scores for a channel (from DB, no re-computation).
   *
   * @param {number} channelId
   * @param {object} options - { minScore, maxScore, limit, offset }
   * @returns {Array}
   */
  async getScores(channelId, options = {}) {
    const where = ['pls.channel_id = $1'];
    const params = [channelId];
    let idx = 2;

    if (options.minScore !== undefined) {
      where.push(`pls.completeness_score >= $${idx}`);
      params.push(options.minScore);
      idx++;
    }
    if (options.maxScore !== undefined) {
      where.push(`pls.completeness_score <= $${idx}`);
      params.push(options.maxScore);
      idx++;
    }

    const limit = Math.min(parseInt(options.limit, 10) || 50, 200);
    const offset = parseInt(options.offset, 10) || 0;
    params.push(limit, offset);

    const { rows } = await this.pool.query(`
      SELECT pls.*, p.name, p.sku, p.price
      FROM product_listing_scores pls
      JOIN products p ON p.id = pls.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY pls.completeness_score ASC, pls.product_id
      LIMIT $${idx} OFFSET $${idx + 1}
    `, params);

    return rows;
  }

  // ============================================================
  // TEMPLATE MANAGEMENT
  // ============================================================

  /**
   * Update a feed template field.
   *
   * @param {number} templateId
   * @param {object} updates - { source_field, transformation, required, max_length, default_value, display_order }
   * @returns {object|null} updated row
   */
  async updateTemplate(templateId, updates) {
    const sets = [];
    const params = [];
    let idx = 1;

    if (updates.source_field !== undefined) {
      sets.push(`source_field = $${idx++}`);
      params.push(updates.source_field);
    }
    if (updates.transformation !== undefined) {
      sets.push(`transformation = $${idx++}`);
      params.push(JSON.stringify(updates.transformation));
    }
    if (updates.required !== undefined) {
      sets.push(`required = $${idx++}`);
      params.push(updates.required);
    }
    if (updates.max_length !== undefined) {
      sets.push(`max_length = $${idx++}`);
      params.push(updates.max_length);
    }
    if (updates.default_value !== undefined) {
      sets.push(`default_value = $${idx++}`);
      params.push(updates.default_value);
    }
    if (updates.display_order !== undefined) {
      sets.push(`display_order = $${idx++}`);
      params.push(updates.display_order);
    }

    if (sets.length === 0) return null;

    params.push(templateId);
    const { rows } = await this.pool.query(
      `UPDATE channel_feed_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Invalidate cache for this template's channel
    if (rows[0]) this.invalidateCache(rows[0].channel_id);

    return rows[0] || null;
  }

  /**
   * Add a new feed template field for a channel.
   *
   * @param {number} channelId
   * @param {object} field - { field_name, source_field, transformation, required, max_length, default_value, display_order }
   * @returns {object} created row
   */
  async addTemplate(channelId, field) {
    const { rows } = await this.pool.query(
      `INSERT INTO channel_feed_templates
         (channel_id, field_name, source_field, transformation, required, max_length, default_value, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (channel_id, field_name) DO UPDATE
       SET source_field = EXCLUDED.source_field,
           transformation = EXCLUDED.transformation,
           required = EXCLUDED.required,
           max_length = EXCLUDED.max_length,
           default_value = EXCLUDED.default_value,
           display_order = EXCLUDED.display_order
       RETURNING *`,
      [
        channelId,
        field.field_name,
        field.source_field || null,
        JSON.stringify(field.transformation || {}),
        field.required || false,
        field.max_length || null,
        field.default_value || null,
        field.display_order || 0
      ]
    );

    this.invalidateCache(channelId);
    return rows[0];
  }

  /**
   * Delete a feed template field.
   *
   * @param {number} templateId
   * @returns {boolean}
   */
  async deleteTemplate(templateId) {
    const { rows } = await this.pool.query(
      'DELETE FROM channel_feed_templates WHERE id = $1 RETURNING channel_id',
      [templateId]
    );
    if (rows[0]) this.invalidateCache(rows[0].channel_id);
    return rows.length > 0;
  }

  /**
   * Clone all templates from one channel to another.
   * Useful when onboarding a new Mirakl channel similar to Best Buy.
   *
   * @param {number} sourceChannelId
   * @param {number} targetChannelId
   * @returns {{ cloned: number }}
   */
  async cloneTemplates(sourceChannelId, targetChannelId) {
    const { rowCount } = await this.pool.query(
      `INSERT INTO channel_feed_templates
         (channel_id, field_name, source_field, transformation, required, max_length, default_value, display_order)
       SELECT $2, field_name, source_field, transformation, required, max_length, default_value, display_order
       FROM channel_feed_templates
       WHERE channel_id = $1
       ON CONFLICT (channel_id, field_name) DO NOTHING`,
      [sourceChannelId, targetChannelId]
    );

    this.invalidateCache(targetChannelId);
    return { cloned: rowCount };
  }
}

// Singleton instance
const feedEngine = new FeedEngine(pool);

module.exports = feedEngine;
