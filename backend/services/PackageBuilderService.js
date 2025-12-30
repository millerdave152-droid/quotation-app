/**
 * Package Builder Service
 * Handles session management, questionnaire operations, and package generation
 */

class PackageBuilderService {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Create a new package building session
   * @param {string} packageType - 'kitchen' or 'laundry'
   * @param {number} customerId - Optional customer ID
   * @returns {Promise<object>} New session
   */
  async createSession(packageType, customerId = null) {
    // Get the active questionnaire for this package type
    const questionnaireResult = await this.pool.query(`
      SELECT id FROM package_questionnaires
      WHERE package_type = $1 AND is_active = true
      ORDER BY version DESC LIMIT 1
    `, [packageType]);

    if (questionnaireResult.rows.length === 0) {
      throw new Error(`No active questionnaire found for package type: ${packageType}`);
    }

    const questionnaireId = questionnaireResult.rows[0].id;

    const result = await this.pool.query(`
      INSERT INTO package_sessions (questionnaire_id, customer_id, answers, status)
      VALUES ($1, $2, '{}', 'in_progress')
      RETURNING *
    `, [questionnaireId, customerId]);

    console.log(`📦 Created package session: ${result.rows[0].session_uuid}`);
    return result.rows[0];
  }

  /**
   * Get session by UUID
   * @param {string} sessionUuid - Session UUID
   * @returns {Promise<object>} Session data with questionnaire info
   */
  async getSession(sessionUuid) {
    const result = await this.pool.query(`
      SELECT
        ps.*,
        pq.name as questionnaire_name,
        pq.package_type,
        c.name as customer_name
      FROM package_sessions ps
      JOIN package_questionnaires pq ON ps.questionnaire_id = pq.id
      LEFT JOIN customers c ON ps.customer_id = c.id
      WHERE ps.session_uuid = $1
    `, [sessionUuid]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update session answers
   * @param {string} sessionUuid - Session UUID
   * @param {object} answers - Answer updates (merged with existing)
   * @returns {Promise<object>} Updated session
   */
  async updateAnswers(sessionUuid, answers) {
    // Merge with existing answers
    const result = await this.pool.query(`
      UPDATE package_sessions
      SET
        answers = answers || $1::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_uuid = $2
      RETURNING *
    `, [JSON.stringify(answers), sessionUuid]);

    if (result.rows.length === 0) {
      throw new Error('Session not found');
    }

    return result.rows[0];
  }

  /**
   * Mark session as completed
   * @param {string} sessionUuid - Session UUID
   * @param {string} selectedTier - 'good', 'better', or 'best'
   * @returns {Promise<object>} Updated session
   */
  async completeSession(sessionUuid, selectedTier) {
    const result = await this.pool.query(`
      UPDATE package_sessions
      SET
        status = 'completed',
        selected_tier = $1,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_uuid = $2
      RETURNING *
    `, [selectedTier, sessionUuid]);

    return result.rows[0];
  }

  /**
   * Link session to a quote
   * @param {string} sessionUuid - Session UUID
   * @param {number} quoteId - Quote ID
   * @returns {Promise<object>} Updated session
   */
  async linkToQuote(sessionUuid, quoteId) {
    const result = await this.pool.query(`
      UPDATE package_sessions
      SET
        status = 'added_to_quote',
        quote_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_uuid = $2
      RETURNING *
    `, [quoteId, sessionUuid]);

    return result.rows[0];
  }

  /**
   * Store generated packages in session
   * @param {string} sessionUuid - Session UUID
   * @param {object} packages - Generated packages
   * @returns {Promise<object>} Updated session
   */
  async storeGeneratedPackages(sessionUuid, packages) {
    const result = await this.pool.query(`
      UPDATE package_sessions
      SET
        generated_packages = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE session_uuid = $2
      RETURNING *
    `, [JSON.stringify(packages), sessionUuid]);

    return result.rows[0];
  }

  // ============================================
  // QUESTIONNAIRE OPERATIONS
  // ============================================

  /**
   * Get questionnaire by type with all questions and options
   * @param {string} packageType - 'kitchen' or 'laundry'
   * @returns {Promise<object>} Full questionnaire with questions
   */
  async getQuestionnaire(packageType) {
    const questionnaireResult = await this.pool.query(`
      SELECT * FROM package_questionnaires
      WHERE package_type = $1 AND is_active = true
      ORDER BY version DESC LIMIT 1
    `, [packageType]);

    if (questionnaireResult.rows.length === 0) {
      return null;
    }

    const questionnaire = questionnaireResult.rows[0];

    // Get questions with options
    const questionsResult = await this.pool.query(`
      SELECT
        pq.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pqo.id,
              'option_key', pqo.option_key,
              'option_text', pqo.option_text,
              'option_icon', pqo.option_icon,
              'display_order', pqo.display_order,
              'hard_filter', pqo.hard_filter,
              'soft_score', pqo.soft_score
            ) ORDER BY pqo.display_order
          ) FILTER (WHERE pqo.id IS NOT NULL),
          '[]'
        ) as options
      FROM package_questions pq
      LEFT JOIN package_question_options pqo ON pq.id = pqo.question_id
      WHERE pq.questionnaire_id = $1
      GROUP BY pq.id
      ORDER BY pq.display_order
    `, [questionnaire.id]);

    questionnaire.questions = questionsResult.rows;
    return questionnaire;
  }

  /**
   * Get all available questionnaires (summary)
   * @returns {Promise<Array>} List of questionnaires
   */
  async listQuestionnaires() {
    const result = await this.pool.query(`
      SELECT
        pq.*,
        COUNT(DISTINCT pqs.id) as question_count
      FROM package_questionnaires pq
      LEFT JOIN package_questions pqs ON pq.id = pqs.questionnaire_id
      WHERE pq.is_active = true
      GROUP BY pq.id
      ORDER BY pq.package_type
    `);

    return result.rows;
  }

  // ============================================
  // PACKAGE TEMPLATES
  // ============================================

  /**
   * Get package template by type
   * @param {string} packageType - 'kitchen' or 'laundry'
   * @returns {Promise<object>} Template with slots
   */
  async getTemplate(packageType) {
    const result = await this.pool.query(`
      SELECT * FROM package_templates
      WHERE package_type = $1 AND is_active = true
      ORDER BY use_count DESC LIMIT 1
    `, [packageType]);

    return result.rows[0] || null;
  }

  /**
   * Increment template use count
   * @param {number} templateId - Template ID
   */
  async incrementTemplateUse(templateId) {
    await this.pool.query(`
      UPDATE package_templates
      SET use_count = use_count + 1
      WHERE id = $1
    `, [templateId]);
  }

  // ============================================
  // PRODUCT EXTENDED ATTRIBUTES
  // ============================================

  /**
   * Get extended attributes for a product
   * @param {number} productId - Product ID
   * @returns {Promise<object>} Extended attributes
   */
  async getProductAttributes(productId) {
    const result = await this.pool.query(`
      SELECT pea.*, p.manufacturer, p.model, p.name, p.category, p.msrp_cents, p.cost_cents
      FROM product_extended_attributes pea
      JOIN products p ON pea.product_id = p.id
      WHERE pea.product_id = $1
    `, [productId]);

    return result.rows[0] || null;
  }

  /**
   * Update/insert extended attributes for a product
   * @param {number} productId - Product ID
   * @param {object} attributes - Attribute values
   * @returns {Promise<object>} Updated attributes
   */
  async upsertProductAttributes(productId, attributes) {
    const {
      width_inches_x10,
      height_inches_x10,
      depth_inches_x10,
      capacity_cubic_ft_x10,
      fuel_type,
      db_level,
      smart_level,
      finish,
      has_ice_water,
      has_air_fry,
      has_convection,
      has_steam_clean,
      has_steam_feature,
      is_stackable,
      reliability_tier,
      quiet_tier,
      package_tier,
      appliance_type,
      bundle_sku,
      bundle_discount_percent
    } = attributes;

    const result = await this.pool.query(`
      INSERT INTO product_extended_attributes (
        product_id,
        width_inches_x10, height_inches_x10, depth_inches_x10, capacity_cubic_ft_x10,
        fuel_type, db_level, smart_level, finish,
        has_ice_water, has_air_fry, has_convection, has_steam_clean, has_steam_feature, is_stackable,
        reliability_tier, quiet_tier, package_tier, appliance_type,
        bundle_sku, bundle_discount_percent,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP
      )
      ON CONFLICT (product_id) DO UPDATE SET
        width_inches_x10 = COALESCE(EXCLUDED.width_inches_x10, product_extended_attributes.width_inches_x10),
        height_inches_x10 = COALESCE(EXCLUDED.height_inches_x10, product_extended_attributes.height_inches_x10),
        depth_inches_x10 = COALESCE(EXCLUDED.depth_inches_x10, product_extended_attributes.depth_inches_x10),
        capacity_cubic_ft_x10 = COALESCE(EXCLUDED.capacity_cubic_ft_x10, product_extended_attributes.capacity_cubic_ft_x10),
        fuel_type = COALESCE(EXCLUDED.fuel_type, product_extended_attributes.fuel_type),
        db_level = COALESCE(EXCLUDED.db_level, product_extended_attributes.db_level),
        smart_level = COALESCE(EXCLUDED.smart_level, product_extended_attributes.smart_level),
        finish = COALESCE(EXCLUDED.finish, product_extended_attributes.finish),
        has_ice_water = COALESCE(EXCLUDED.has_ice_water, product_extended_attributes.has_ice_water),
        has_air_fry = COALESCE(EXCLUDED.has_air_fry, product_extended_attributes.has_air_fry),
        has_convection = COALESCE(EXCLUDED.has_convection, product_extended_attributes.has_convection),
        has_steam_clean = COALESCE(EXCLUDED.has_steam_clean, product_extended_attributes.has_steam_clean),
        has_steam_feature = COALESCE(EXCLUDED.has_steam_feature, product_extended_attributes.has_steam_feature),
        is_stackable = COALESCE(EXCLUDED.is_stackable, product_extended_attributes.is_stackable),
        reliability_tier = COALESCE(EXCLUDED.reliability_tier, product_extended_attributes.reliability_tier),
        quiet_tier = COALESCE(EXCLUDED.quiet_tier, product_extended_attributes.quiet_tier),
        package_tier = COALESCE(EXCLUDED.package_tier, product_extended_attributes.package_tier),
        appliance_type = COALESCE(EXCLUDED.appliance_type, product_extended_attributes.appliance_type),
        bundle_sku = COALESCE(EXCLUDED.bundle_sku, product_extended_attributes.bundle_sku),
        bundle_discount_percent = COALESCE(EXCLUDED.bundle_discount_percent, product_extended_attributes.bundle_discount_percent),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      productId,
      width_inches_x10, height_inches_x10, depth_inches_x10, capacity_cubic_ft_x10,
      fuel_type, db_level, smart_level, finish,
      has_ice_water, has_air_fry, has_convection, has_steam_clean, has_steam_feature, is_stackable,
      reliability_tier, quiet_tier, package_tier, appliance_type,
      bundle_sku, bundle_discount_percent
    ]);

    return result.rows[0];
  }

  /**
   * Bulk update attributes from CSV data
   * @param {Array} attributeRows - Array of {product_id, ...attributes}
   * @returns {Promise<{success: number, failed: number}>}
   */
  async bulkUpdateAttributes(attributeRows) {
    let success = 0;
    let failed = 0;

    for (const row of attributeRows) {
      try {
        await this.upsertProductAttributes(row.product_id, row);
        success++;
      } catch (err) {
        console.error(`Failed to update product ${row.product_id}:`, err.message);
        failed++;
      }
    }

    return { success, failed };
  }

  // ============================================
  // BUNDLE DISCOUNT RULES
  // ============================================

  /**
   * Get active bundle discount rules
   * @returns {Promise<Array>} List of active rules
   */
  async getBundleDiscountRules() {
    const result = await this.pool.query(`
      SELECT * FROM bundle_discount_rules
      WHERE is_active = true
        AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
        AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)
      ORDER BY priority DESC
    `);

    return result.rows;
  }

  /**
   * Calculate bundle discount for a set of items
   * @param {Array} items - Array of product items with manufacturer info
   * @returns {Promise<{discount_percent: number, rule_name: string}>}
   */
  async calculateBundleDiscount(items) {
    const rules = await this.getBundleDiscountRules();

    for (const rule of rules) {
      // Check if rule applies
      if (items.length < rule.min_items) continue;

      if (rule.require_same_brand) {
        // Count items per brand
        const brandCounts = {};
        for (const item of items) {
          const brand = item.manufacturer || item.brand;
          brandCounts[brand] = (brandCounts[brand] || 0) + 1;
        }

        // Check if any brand has enough items
        const maxBrandCount = Math.max(...Object.values(brandCounts));
        if (maxBrandCount >= rule.min_items) {
          return {
            discount_percent: Math.min(rule.discount_percent, rule.max_discount_percent),
            rule_name: rule.name,
            qualifying_brand: Object.keys(brandCounts).find(b => brandCounts[b] === maxBrandCount)
          };
        }
      } else {
        // No brand requirement, just item count
        return {
          discount_percent: Math.min(rule.discount_percent, rule.max_discount_percent),
          rule_name: rule.name
        };
      }
    }

    return { discount_percent: 0, rule_name: null };
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get package builder statistics
   * @returns {Promise<object>} Stats summary
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'added_to_quote' THEN 1 END) as added_to_quote,
        COUNT(CASE WHEN status = 'abandoned' THEN 1 END) as abandoned_sessions,
        COUNT(CASE WHEN selected_tier = 'good' THEN 1 END) as good_tier_selected,
        COUNT(CASE WHEN selected_tier = 'better' THEN 1 END) as better_tier_selected,
        COUNT(CASE WHEN selected_tier = 'best' THEN 1 END) as best_tier_selected,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM package_sessions
    `);

    return result.rows[0];
  }
}

module.exports = PackageBuilderService;
