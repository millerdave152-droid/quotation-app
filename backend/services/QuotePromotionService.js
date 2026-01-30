/**
 * QuotePromotionService
 *
 * Handles applying and managing manufacturer promotions on quotes.
 * Integrates with QuoteService for total recalculations.
 */

class QuotePromotionService {
  constructor(pool, detectionService) {
    this.pool = pool;
    this.detectionService = detectionService;
  }

  /**
   * Apply a promotion to a quote
   * @param {number} quotationId - Quote ID
   * @param {number} promotionId - Promotion ID to apply
   * @param {number} userId - User applying the promotion
   * @returns {object} Applied promotion details
   */
  async applyPromotion(quotationId, promotionId, userId) {
    // Get the promotion
    const promoResult = await this.pool.query(
      'SELECT * FROM manufacturer_promotions WHERE id = $1 AND is_active = true',
      [promotionId]
    );

    if (promoResult.rows.length === 0) {
      throw new Error('Promotion not found or inactive');
    }

    const promotion = promoResult.rows[0];

    // Check date validity
    const today = new Date().toISOString().split('T')[0];
    if (promotion.start_date > today || promotion.end_date < today) {
      throw new Error('Promotion is not valid for the current date');
    }

    // Check if already applied
    const existingResult = await this.pool.query(
      'SELECT id FROM quote_applied_promotions WHERE quotation_id = $1 AND promotion_id = $2 AND status = $3',
      [quotationId, promotionId, 'active']
    );

    if (existingResult.rows.length > 0) {
      throw new Error('Promotion is already applied to this quote');
    }

    // Check stacking rules - cannot combine with other same-manufacturer promotions
    const stackingCheck = await this.pool.query(`
      SELECT qap.*, mp.promo_name
      FROM quote_applied_promotions qap
      JOIN manufacturer_promotions mp ON qap.promotion_id = mp.id
      WHERE qap.quotation_id = $1
        AND qap.status = 'active'
        AND mp.manufacturer = $2
        AND mp.promo_type = 'bundle_savings'
    `, [quotationId, promotion.manufacturer]);

    if (stackingCheck.rows.length > 0 && promotion.promo_type === 'bundle_savings') {
      throw new Error(`Cannot combine with ${stackingCheck.rows[0].promo_name}. Only one ${promotion.manufacturer} bundle promotion allowed per quote.`);
    }

    // Get quote items to verify qualification
    const itemsResult = await this.pool.query(`
      SELECT qi.*, p.model, p.manufacturer
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [quotationId]);

    const products = itemsResult.rows.map(item => ({
      id: item.product_id,
      model: item.model,
      manufacturer: item.manufacturer,
      name: item.description
    }));

    // Check qualification
    const qualification = await this.detectionService.checkQualification(promotion, products);

    if (!qualification.isEligible) {
      throw new Error(`Quote does not meet promotion requirements. ${qualification.qualifyingCount} qualifying items found, need at least ${promotion.min_qualifying_items || 1}.`);
    }

    // Apply the promotion
    const insertResult = await this.pool.query(`
      INSERT INTO quote_applied_promotions (
        quotation_id, promotion_id, applied_by,
        qualifying_items, qualifying_count, discount_amount_cents,
        gift_included, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
    `, [
      quotationId,
      promotionId,
      userId,
      JSON.stringify(qualification.qualifyingProducts),
      qualification.qualifyingCount,
      qualification.discountCents || 0,
      promotion.promo_type === 'bonus_gift'
    ]);

    // Recalculate quote totals with promotion discount
    await this.recalculateQuoteWithPromotions(quotationId);

    return {
      ...insertResult.rows[0],
      promotion_name: promotion.promo_name,
      promotion_type: promotion.promo_type
    };
  }

  /**
   * Remove a promotion from a quote
   */
  async removePromotion(quotationId, promotionId, userId, reason = null) {
    const result = await this.pool.query(`
      UPDATE quote_applied_promotions
      SET status = 'removed',
          removed_at = CURRENT_TIMESTAMP,
          removed_by = $1,
          removal_reason = $2
      WHERE quotation_id = $3 AND promotion_id = $4 AND status = 'active'
      RETURNING *
    `, [userId, reason, quotationId, promotionId]);

    if (result.rows.length === 0) {
      throw new Error('Promotion not found on this quote');
    }

    // Recalculate quote totals
    await this.recalculateQuoteWithPromotions(quotationId);

    return result.rows[0];
  }

  /**
   * Get all promotions applied to a quote
   */
  async getQuotePromotions(quotationId) {
    const result = await this.pool.query(`
      SELECT
        qap.*,
        mp.promo_code,
        mp.promo_name,
        mp.promo_type,
        mp.manufacturer,
        mp.tier_discounts,
        mp.gift_description,
        mp.badge_text,
        mp.badge_color,
        mp.start_date,
        mp.end_date,
        CONCAT(u.first_name, ' ', u.last_name) as applied_by_name
      FROM quote_applied_promotions qap
      JOIN manufacturer_promotions mp ON qap.promotion_id = mp.id
      LEFT JOIN users u ON qap.applied_by = u.id
      WHERE qap.quotation_id = $1
      ORDER BY qap.applied_at DESC
    `, [quotationId]);

    return result.rows;
  }

  /**
   * Get only active promotions on a quote (not removed)
   */
  async getActiveQuotePromotions(quotationId) {
    const result = await this.pool.query(`
      SELECT
        qap.*,
        mp.promo_code,
        mp.promo_name,
        mp.promo_type,
        mp.manufacturer,
        mp.tier_discounts,
        mp.gift_description,
        mp.badge_text,
        CONCAT(u.first_name, ' ', u.last_name) as applied_by_name
      FROM quote_applied_promotions qap
      JOIN manufacturer_promotions mp ON qap.promotion_id = mp.id
      LEFT JOIN users u ON qap.applied_by = u.id
      WHERE qap.quotation_id = $1 AND qap.status = 'active'
      ORDER BY qap.applied_at DESC
    `, [quotationId]);

    return result.rows;
  }

  /**
   * Validate if a promotion can still be applied (date check, item check)
   */
  async validatePromotionApplication(quotationId, promotionId) {
    const promotion = await this.pool.query(
      'SELECT * FROM manufacturer_promotions WHERE id = $1',
      [promotionId]
    );

    if (promotion.rows.length === 0) {
      return { valid: false, reason: 'Promotion not found' };
    }

    const promo = promotion.rows[0];

    // Date check
    const today = new Date().toISOString().split('T')[0];
    if (!promo.is_active) {
      return { valid: false, reason: 'Promotion is inactive' };
    }
    if (promo.start_date > today) {
      return { valid: false, reason: `Promotion starts on ${promo.start_date}` };
    }
    if (promo.end_date < today) {
      return { valid: false, reason: `Promotion expired on ${promo.end_date}` };
    }

    // Already applied check
    const existing = await this.pool.query(
      'SELECT id FROM quote_applied_promotions WHERE quotation_id = $1 AND promotion_id = $2 AND status = $3',
      [quotationId, promotionId, 'active']
    );
    if (existing.rows.length > 0) {
      return { valid: false, reason: 'Promotion already applied' };
    }

    // Get quote items and check qualification
    const items = await this.pool.query(`
      SELECT qi.*, p.model, p.manufacturer
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [quotationId]);

    const products = items.rows.map(item => ({
      id: item.product_id,
      model: item.model,
      manufacturer: item.manufacturer
    }));

    const qualification = await this.detectionService.checkQualification(promo, products);

    if (!qualification.isEligible) {
      return {
        valid: false,
        reason: `Need ${promo.min_qualifying_items || 1} qualifying items, found ${qualification.qualifyingCount}`,
        qualification
      };
    }

    return { valid: true, qualification };
  }

  /**
   * Recalculate quote totals including promotion discounts
   */
  async recalculateQuoteWithPromotions(quotationId) {
    // Get current quote
    const quoteResult = await this.pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [quotationId]
    );

    if (quoteResult.rows.length === 0) return;

    const quote = quoteResult.rows[0];

    // Get all active promotions on this quote
    const promotions = await this.getActiveQuotePromotions(quotationId);

    // Calculate total promotion discount
    let totalPromotionDiscount = 0;
    for (const promo of promotions) {
      if (promo.promo_type === 'bundle_savings') {
        totalPromotionDiscount += promo.discount_amount_cents || 0;
      }
    }

    // Get quote items for subtotal
    const itemsResult = await this.pool.query(`
      SELECT SUM(COALESCE(sell_cents, 0) * COALESCE(quantity, 1)) as subtotal_cents,
             SUM(COALESCE(cost_cents, 0) * COALESCE(quantity, 1)) as total_cost_cents
      FROM quotation_items
      WHERE quotation_id = $1
    `, [quotationId]);

    const subtotalCents = parseInt(itemsResult.rows[0].subtotal_cents) || 0;
    const totalCostCents = parseInt(itemsResult.rows[0].total_cost_cents) || 0;

    // Calculate existing discount (percentage-based)
    const discountPercent = parseFloat(quote.discount_percent) || 0;
    const percentDiscountCents = Math.round((subtotalCents * discountPercent) / 100);

    // Total discount = percentage discount + promotion discount
    const totalDiscountCents = percentDiscountCents + totalPromotionDiscount;
    const afterDiscount = subtotalCents - totalDiscountCents;

    // Calculate tax
    const taxRate = parseFloat(quote.tax_rate) || 13;
    const taxCents = Math.round((afterDiscount * taxRate) / 100);
    const totalCents = afterDiscount + taxCents;

    // Calculate profit and margin
    const grossProfitCents = afterDiscount - totalCostCents;
    const marginPercent = afterDiscount > 0
      ? Math.round((grossProfitCents / afterDiscount) * 10000) / 100
      : 0;

    // Update quote with new totals
    await this.pool.query(`
      UPDATE quotations SET
        subtotal_cents = $1,
        discount_cents = $2,
        promo_discount_cents = $3,
        tax_cents = $4,
        total_cents = $5,
        total_cost_cents = $6,
        gross_profit_cents = $7,
        margin_percent = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [
      subtotalCents,
      percentDiscountCents,
      totalPromotionDiscount,
      taxCents,
      totalCents,
      totalCostCents,
      grossProfitCents,
      marginPercent,
      quotationId
    ]);

    return {
      subtotal_cents: subtotalCents,
      discount_cents: percentDiscountCents,
      promo_discount_cents: totalPromotionDiscount,
      tax_cents: taxCents,
      total_cents: totalCents,
      margin_percent: marginPercent
    };
  }

  /**
   * Re-evaluate promotions when quote items change
   * Marks expired/invalid promotions and updates discount amounts
   */
  async revalidateQuotePromotions(quotationId) {
    const activePromotions = await this.getActiveQuotePromotions(quotationId);

    // Get current quote items
    const itemsResult = await this.pool.query(`
      SELECT qi.*, p.model, p.manufacturer
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.id
      WHERE qi.quotation_id = $1
    `, [quotationId]);

    const products = itemsResult.rows.map(item => ({
      id: item.product_id,
      model: item.model,
      manufacturer: item.manufacturer
    }));

    const updates = [];

    for (const appliedPromo of activePromotions) {
      // Get full promotion details
      const promoResult = await this.pool.query(
        'SELECT * FROM manufacturer_promotions WHERE id = $1',
        [appliedPromo.promotion_id]
      );

      if (promoResult.rows.length === 0) continue;

      const promotion = promoResult.rows[0];
      const qualification = await this.detectionService.checkQualification(promotion, products);

      if (!qualification.isEligible) {
        // Mark as expired/invalid
        await this.pool.query(`
          UPDATE quote_applied_promotions
          SET status = 'expired',
              removed_at = CURRENT_TIMESTAMP,
              removal_reason = 'No longer qualifies after quote items changed'
          WHERE id = $1
        `, [appliedPromo.id]);

        updates.push({
          promotionId: appliedPromo.promotion_id,
          action: 'removed',
          reason: 'No longer qualifies'
        });
      } else if (qualification.discountCents !== appliedPromo.discount_amount_cents) {
        // Update discount amount (tier may have changed)
        await this.pool.query(`
          UPDATE quote_applied_promotions
          SET discount_amount_cents = $1,
              qualifying_count = $2,
              qualifying_items = $3
          WHERE id = $4
        `, [
          qualification.discountCents,
          qualification.qualifyingCount,
          JSON.stringify(qualification.qualifyingProducts),
          appliedPromo.id
        ]);

        updates.push({
          promotionId: appliedPromo.promotion_id,
          action: 'updated',
          oldDiscount: appliedPromo.discount_amount_cents,
          newDiscount: qualification.discountCents
        });
      }
    }

    // Recalculate totals
    await this.recalculateQuoteWithPromotions(quotationId);

    return updates;
  }

  /**
   * Get promotion summary for quote (for PDF/display)
   */
  async getQuotePromotionSummary(quotationId) {
    const promotions = await this.getActiveQuotePromotions(quotationId);

    let totalDiscount = 0;
    const discountPromotions = [];
    const bonusGifts = [];
    const badges = [];

    for (const promo of promotions) {
      switch (promo.promo_type) {
        case 'bundle_savings':
          totalDiscount += promo.discount_amount_cents || 0;
          discountPromotions.push({
            name: promo.promo_name,
            discount: promo.discount_amount_cents,
            qualifyingCount: promo.qualifying_count
          });
          break;
        case 'bonus_gift':
          bonusGifts.push({
            name: promo.promo_name,
            description: promo.gift_description
          });
          break;
        case 'guarantee':
          badges.push({
            text: promo.badge_text || promo.promo_name,
            color: promo.badge_color
          });
          break;
      }
    }

    return {
      totalDiscountCents: totalDiscount,
      totalDiscountFormatted: `$${(totalDiscount / 100).toFixed(2)}`,
      discountPromotions,
      bonusGifts,
      badges,
      hasPromotions: promotions.length > 0
    };
  }
}

module.exports = QuotePromotionService;
