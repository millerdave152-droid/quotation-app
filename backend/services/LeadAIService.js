/**
 * Lead AI Service
 * Provides AI-powered helpers for lead management:
 * - Product suggestions based on requirements
 * - Requirement summarization
 * - Follow-up message drafting
 */

class LeadAIService {
  /**
   * Suggest products based on lead requirements
   * @param {object} lead - Lead with requirements
   * @param {Pool} pool - Database pool
   * @returns {Promise<Array>} Suggested products grouped by category
   */
  static async suggestProducts(lead, pool) {
    const suggestions = [];

    if (!lead.requirements || lead.requirements.length === 0) {
      // If no structured requirements, try to parse from notes
      return this.suggestFromNotes(lead, pool);
    }

    for (const req of lead.requirements) {
      const categoryProducts = await this.findMatchingProducts(req, pool);
      suggestions.push({
        category: req.category,
        subcategory: req.subcategory,
        requirement: req,
        products: categoryProducts,
        reasoning: this.explainSuggestions(req, categoryProducts)
      });
    }

    return suggestions;
  }

  /**
   * Find products matching a requirement
   */
  static async findMatchingProducts(requirement, pool) {
    let query = `
      SELECT
        p.id,
        p.model,
        p.name,
        p.description,
        p.manufacturer,
        p.msrp_cents,
        p.category,
        p.color,
        p.image_url,
        COALESCE(p.stock_quantity, 0) as stock_quantity
      FROM products p
      WHERE p.product_status != 'discontinued'
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by category
    if (requirement.category) {
      query += ` AND p.category ILIKE $${paramIndex}`;
      params.push(`%${requirement.category}%`);
      paramIndex++;
    }

    // Filter by brand preferences (manufacturer column)
    if (requirement.brand_preferences && requirement.brand_preferences.length > 0) {
      const brandConditions = requirement.brand_preferences.map((_, i) => `p.manufacturer ILIKE $${paramIndex + i}`);
      query += ` AND (${brandConditions.join(' OR ')})`;
      params.push(...requirement.brand_preferences.map(b => `%${b}%`));
      paramIndex += requirement.brand_preferences.length;
    }

    // Filter by budget (msrp_cents column)
    if (requirement.budget_min_cents) {
      query += ` AND p.msrp_cents >= $${paramIndex}`;
      params.push(requirement.budget_min_cents);
      paramIndex++;
    }

    if (requirement.budget_max_cents) {
      query += ` AND p.msrp_cents <= $${paramIndex}`;
      params.push(requirement.budget_max_cents);
      paramIndex++;
    }

    // Filter by color
    if (requirement.color_preferences && requirement.color_preferences.length > 0) {
      const colorConditions = requirement.color_preferences.map((_, i) => `p.color ILIKE $${paramIndex + i}`);
      query += ` AND (${colorConditions.join(' OR ')})`;
      params.push(...requirement.color_preferences.map(c => `%${c}%`));
      paramIndex += requirement.color_preferences.length;
    }

    // Order by relevance (in-stock first, then by price)
    query += `
      ORDER BY
        CASE WHEN COALESCE(p.stock_quantity, 0) > 0 THEN 0 ELSE 1 END,
        p.msrp_cents ASC
      LIMIT 5
    `;

    const result = await pool.query(query, params);

    return result.rows.map(p => ({
      id: p.id,
      model: p.model,
      name: p.name,
      description: p.description,
      brand: p.manufacturer,
      price: p.msrp_cents / 100,
      priceCents: p.msrp_cents,
      category: p.category,
      color: p.color,
      imageUrl: p.image_url,
      inStock: p.stock_quantity > 0,
      stockQuantity: p.stock_quantity,
      matchScore: this.calculateMatchScore(requirement, p)
    }));
  }

  /**
   * Calculate how well a product matches requirements
   */
  static calculateMatchScore(requirement, product) {
    let score = 50; // Base score

    // Brand match (using manufacturer column)
    if (requirement.brand_preferences && requirement.brand_preferences.length > 0) {
      const brandMatch = requirement.brand_preferences.some(
        b => product.manufacturer?.toLowerCase().includes(b.toLowerCase())
      );
      if (brandMatch) score += 20;
    }

    // Budget match (using msrp_cents column)
    if (requirement.budget_min_cents && requirement.budget_max_cents) {
      const midBudget = (requirement.budget_min_cents + requirement.budget_max_cents) / 2;
      if (product.msrp_cents >= requirement.budget_min_cents &&
          product.msrp_cents <= requirement.budget_max_cents) {
        score += 20;
        // Bonus for being close to mid-range
        const deviation = Math.abs(product.msrp_cents - midBudget) / midBudget;
        if (deviation < 0.2) score += 5;
      }
    }

    // Color match
    if (requirement.color_preferences && requirement.color_preferences.length > 0) {
      const colorMatch = requirement.color_preferences.some(
        c => product.color?.toLowerCase().includes(c.toLowerCase())
      );
      if (colorMatch) score += 10;
    }

    // In-stock bonus
    if (product.stock_quantity > 0) score += 5;

    return Math.min(100, score);
  }

  /**
   * Explain why products were suggested
   */
  static explainSuggestions(requirement, products) {
    if (products.length === 0) {
      return 'No products found matching all criteria. Try broadening the search.';
    }

    const reasons = [];

    if (requirement.brand_preferences && requirement.brand_preferences.length > 0) {
      const matchedBrands = [...new Set(products.map(p => p.brand))];
      reasons.push(`Filtered for preferred brands: ${requirement.brand_preferences.join(', ')}`);
    }

    if (requirement.budget_max_cents) {
      const maxBudget = requirement.budget_max_cents / 100;
      reasons.push(`Within budget of $${maxBudget.toFixed(0)}`);
    }

    if (requirement.color_preferences && requirement.color_preferences.length > 0) {
      reasons.push(`Color preferences: ${requirement.color_preferences.join(', ')}`);
    }

    const inStockCount = products.filter(p => p.inStock).length;
    if (inStockCount > 0) {
      reasons.push(`${inStockCount} of ${products.length} products in stock`);
    }

    return reasons.length > 0 ? reasons.join('. ') : 'Products matched category requirements.';
  }

  /**
   * Try to suggest products from free-form notes
   */
  static async suggestFromNotes(lead, pool) {
    const notes = (lead.requirements_notes || '').toLowerCase();

    // Detect categories from keywords
    const categoryKeywords = {
      'Refrigerator': ['refrigerator', 'fridge', 'freezer', 'french door', 'side by side'],
      'Range': ['range', 'stove', 'oven', 'cooktop', 'induction'],
      'Dishwasher': ['dishwasher', 'dish washer'],
      'Washer': ['washer', 'washing machine', 'front load', 'top load'],
      'Dryer': ['dryer', 'dryers'],
      'Microwave': ['microwave', 'over the range'],
      'Laundry': ['laundry', 'washer dryer', 'laundry pair']
    };

    const detectedCategories = [];
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => notes.includes(kw))) {
        detectedCategories.push(category);
      }
    }

    // Detect brands
    const brandKeywords = ['whirlpool', 'samsung', 'lg', 'ge', 'bosch', 'kitchenaid', 'maytag', 'frigidaire'];
    const detectedBrands = brandKeywords.filter(b => notes.includes(b));

    // Detect budget (look for dollar amounts)
    const budgetMatch = notes.match(/\$(\d{1,2}),?(\d{3})/);
    let maxBudget = null;
    if (budgetMatch) {
      maxBudget = parseInt(budgetMatch[1] + budgetMatch[2]) * 100;
    }

    const suggestions = [];

    for (const category of detectedCategories) {
      const fakeRequirement = {
        category,
        brand_preferences: detectedBrands.length > 0 ? detectedBrands : null,
        budget_max_cents: maxBudget
      };

      const products = await this.findMatchingProducts(fakeRequirement, pool);

      suggestions.push({
        category,
        subcategory: null,
        requirement: fakeRequirement,
        products,
        reasoning: `Detected "${category}" from notes. ${detectedBrands.length > 0 ? `Brand preferences: ${detectedBrands.join(', ')}. ` : ''}${maxBudget ? `Budget detected: $${(maxBudget/100).toFixed(0)}` : ''}`
      });
    }

    if (suggestions.length === 0) {
      return [{
        category: 'Unknown',
        subcategory: null,
        requirement: {},
        products: [],
        reasoning: 'Could not detect specific product categories from notes. Please add structured requirements.'
      }];
    }

    return suggestions;
  }

  /**
   * Analyze lead requirements and suggest package deals
   */
  static async suggestPackages(lead, pool) {
    // Check if lead wants multiple appliances (kitchen package, laundry pair, etc.)
    if (!lead.requirements || lead.requirements.length < 2) {
      return null;
    }

    const categories = lead.requirements.map(r => r.category.toLowerCase());

    // Kitchen package detection
    const kitchenItems = ['refrigerator', 'range', 'dishwasher', 'microwave'];
    const kitchenMatches = categories.filter(c =>
      kitchenItems.some(k => c.includes(k))
    );

    if (kitchenMatches.length >= 3) {
      // This is likely a kitchen package
      const brands = [...new Set(
        lead.requirements
          .filter(r => r.brand_preferences)
          .flatMap(r => r.brand_preferences)
      )];

      return {
        type: 'kitchen_package',
        items: kitchenMatches.length,
        brands: brands,
        suggestion: `Customer may be interested in a complete kitchen package (${kitchenMatches.length} items). ${brands.length > 0 ? `Preferred brands: ${brands.join(', ')}. ` : ''}Consider manufacturer bundle promotions.`
      };
    }

    // Laundry pair detection
    const hasWasher = categories.some(c => c.includes('washer') && !c.includes('dish'));
    const hasDryer = categories.some(c => c.includes('dryer'));

    if (hasWasher && hasDryer) {
      return {
        type: 'laundry_pair',
        items: 2,
        suggestion: 'Customer looking for washer + dryer pair. Check for laundry pair promotions and pedestal bundles.'
      };
    }

    return null;
  }
}

module.exports = LeadAIService;
