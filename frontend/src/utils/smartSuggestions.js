// Smart Suggestions for Revenue Features
// Automatically suggests relevant revenue features based on quote conditions

/**
 * Analyze quote and return smart suggestions
 * @param {Object} params - Parameters for suggestion
 * @param {number} params.quoteTotal - Total quote amount in cents
 * @param {Array} params.products - Array of products in quote
 * @param {Array} params.availableFinancing - Available financing plans
 * @param {Array} params.availableWarranties - Available warranty plans
 * @param {Array} params.availableRebates - Available rebates
 * @param {Object} params.currentFeatures - Currently selected revenue features
 * @returns {Object} Suggested features with reasons
 */
export const getSmartSuggestions = ({
  quoteTotal = 0,
  products = [],
  availableFinancing = [],
  availableWarranties = [],
  availableRebates = [],
  currentFeatures = {}
}) => {
  const suggestions = {
    financing: null,
    warranties: [],
    rebates: [],
    delivery: null,
    reasons: {
      financing: [],
      warranties: [],
      rebates: [],
      delivery: []
    }
  };

  // FINANCING SUGGESTIONS
  // Suggest financing for quotes over $1,000
  if (quoteTotal >= 100000 && !currentFeatures.financing) { // 100000 cents = $1,000
    // Find best financing option (lowest APR for reasonable term)
    const bestFinancing = availableFinancing
      .filter(plan => plan.term_months >= 12 && plan.term_months <= 48)
      .sort((a, b) => a.apr_percent - b.apr_percent)[0];

    if (bestFinancing) {
      suggestions.financing = bestFinancing;
      suggestions.reasons.financing.push(
        `Quote total ${(quoteTotal / 100).toFixed(2)} exceeds $1,000 - financing recommended`
      );
      suggestions.reasons.financing.push(
        `Best rate: ${bestFinancing.apr_percent}% APR for ${bestFinancing.term_months} months`
      );
    }
  }

  // REBATE SUGGESTIONS
  // Auto-suggest applicable rebates based on product categories
  if (availableRebates.length > 0 && products.length > 0) {
    const productCategories = new Set(products.map(p => p.category?.toLowerCase() || '').filter(c => c));
    const productBrands = new Set(products.map(p => p.brand?.toLowerCase() || '').filter(b => b));
    const productNames = products.map(p => (p.name || '').toLowerCase());

    availableRebates.forEach(rebate => {
      const rebateName = (rebate.rebate_name || '').toLowerCase();
      const description = (rebate.description || '').toLowerCase();
      let applicable = false;
      let reason = '';

      // Check if rebate applies to specific categories
      productCategories.forEach(category => {
        if (rebateName.includes(category) || description.includes(category)) {
          applicable = true;
          reason = `Applies to ${category} products in your quote`;
        }
      });

      // Check if rebate applies to specific brands
      productBrands.forEach(brand => {
        if (rebateName.includes(brand) || description.includes(brand)) {
          applicable = true;
          reason = `Applies to ${brand} brand products`;
        }
      });

      // Check for general rebates (e.g., "Spring Sale", "Holiday Promotion")
      if (rebateName.includes('sale') || rebateName.includes('promo') || rebateName.includes('discount')) {
        applicable = true;
        reason = 'General promotion available';
      }

      // Check minimum purchase requirements
      if (rebate.minimum_purchase_cents && quoteTotal >= rebate.minimum_purchase_cents) {
        applicable = true;
        reason = `Quote meets minimum purchase of $${(rebate.minimum_purchase_cents / 100).toFixed(2)}`;
      }

      if (applicable && !currentFeatures.rebates?.find(r => r.id === rebate.id)) {
        suggestions.rebates.push(rebate);
        suggestions.reasons.rebates.push({
          rebate: rebate.rebate_name,
          reason: reason
        });
      }
    });
  }

  // WARRANTY SUGGESTIONS
  // Suggest warranties based on product categories and price
  if (availableWarranties.length > 0 && products.length > 0) {
    const highValueProducts = products.filter(p => {
      const price = p.unit_price_cents || 0;
      return price >= 50000; // Products over $500
    });

    if (highValueProducts.length > 0) {
      // Categorize products
      const appliances = highValueProducts.filter(p =>
        (p.category || '').toLowerCase().includes('appliance') ||
        (p.name || '').toLowerCase().match(/fridge|refrigerator|washer|dryer|dishwasher|oven|range|stove/)
      );

      const electronics = highValueProducts.filter(p =>
        (p.category || '').toLowerCase().includes('tv') ||
        (p.category || '').toLowerCase().includes('audio') ||
        (p.category || '').toLowerCase().includes('electronic') ||
        (p.name || '').toLowerCase().match(/tv|television|audio|receiver|speaker/)
      );

      const furniture = highValueProducts.filter(p =>
        (p.category || '').toLowerCase().includes('furniture') ||
        (p.name || '').toLowerCase().match(/sofa|couch|chair|table|bed|mattress/)
      );

      // Suggest appropriate warranties
      availableWarranties.forEach(warranty => {
        const warrantyName = (warranty.plan_name || '').toLowerCase();
        const warrantyCategory = (warranty.category_name || '').toLowerCase();
        let applicable = false;
        let reason = '';

        // Match warranties to product categories
        if (appliances.length > 0 && (warrantyCategory.includes('appliance') || warrantyName.includes('appliance'))) {
          applicable = true;
          reason = `${appliances.length} appliance(s) in quote - extended protection recommended`;
        }

        if (electronics.length > 0 && (warrantyCategory.includes('electronic') || warrantyCategory.includes('tv') || warrantyName.includes('electronic'))) {
          applicable = true;
          reason = `${electronics.length} electronic(s) in quote - protect your investment`;
        }

        if (furniture.length > 0 && (warrantyCategory.includes('furniture') || warrantyName.includes('furniture'))) {
          applicable = true;
          reason = `${furniture.length} furniture item(s) - coverage for wear and damage`;
        }

        // General coverage for high-value items
        if (!applicable && highValueProducts.length > 0 && warrantyCategory.includes('comprehensive')) {
          applicable = true;
          reason = `${highValueProducts.length} high-value item(s) over $500`;
        }

        if (applicable && !currentFeatures.warranties?.find(w => w.plan_id === warranty.id)) {
          suggestions.warranties.push(warranty);
          suggestions.reasons.warranties.push({
            warranty: warranty.plan_name,
            reason: reason,
            duration: `${warranty.duration_years} years`
          });
        }
      });
    }
  }

  // DELIVERY SUGGESTIONS
  // Suggest delivery for large/heavy items or multiple items
  if (products.length > 0 && !currentFeatures.delivery) {
    const heavyItems = products.filter(p => {
      const name = (p.name || '').toLowerCase();
      return name.match(/fridge|refrigerator|washer|dryer|sofa|couch|mattress|bed|treadmill|piano/) ||
        (p.category || '').toLowerCase().includes('appliance') ||
        (p.category || '').toLowerCase().includes('furniture');
    });

    if (heavyItems.length > 0) {
      suggestions.delivery = {
        recommended: true,
        reason: `${heavyItems.length} large/heavy item(s) - professional delivery recommended`
      };
      suggestions.reasons.delivery.push(`${heavyItems.length} items benefit from professional delivery and installation`);
    } else if (products.length >= 3) {
      suggestions.delivery = {
        recommended: true,
        reason: `Multiple items (${products.length}) - delivery service recommended`
      };
      suggestions.reasons.delivery.push('Multiple items make delivery convenient');
    }
  }

  return suggestions;
};

/**
 * Calculate potential savings from applying suggested rebates
 * @param {Array} rebates - Array of rebate objects
 * @param {number} quoteTotal - Total quote amount in cents
 * @returns {number} Total savings in cents
 */
export const calculateRebateSavings = (rebates, quoteTotal) => {
  let totalSavings = 0;

  rebates.forEach(rebate => {
    if (rebate.rebate_percent) {
      // Percentage-based rebate
      totalSavings += Math.floor((quoteTotal * rebate.rebate_percent) / 100);
    } else if (rebate.rebate_amount_cents) {
      // Fixed amount rebate
      totalSavings += rebate.rebate_amount_cents;
    }
  });

  return totalSavings;
};

/**
 * Generate a summary message for all suggestions
 * @param {Object} suggestions - Suggestions object from getSmartSuggestions
 * @param {number} quoteTotal - Total quote amount in cents
 * @returns {Object} Summary with count and potential value
 */
export const getSuggestionsSummary = (suggestions, quoteTotal) => {
  let count = 0;
  let potentialValue = 0;
  const messages = [];

  if (suggestions.financing) {
    count++;
    messages.push(`💳 Financing available - make it affordable with monthly payments`);
  }

  if (suggestions.warranties.length > 0) {
    count += suggestions.warranties.length;
    messages.push(`🛡️ ${suggestions.warranties.length} warranty plan(s) recommended`);
  }

  if (suggestions.rebates.length > 0) {
    count += suggestions.rebates.length;
    const savings = calculateRebateSavings(suggestions.rebates, quoteTotal);
    potentialValue += savings;
    messages.push(`🎁 ${suggestions.rebates.length} rebate(s) available - save up to $${(savings / 100).toFixed(2)}`);
  }

  if (suggestions.delivery?.recommended) {
    count++;
    messages.push(`🚚 Delivery recommended for your items`);
  }

  return {
    count,
    potentialValue,
    messages,
    hassuggestions: count > 0
  };
};

export default {
  getSmartSuggestions,
  calculateRebateSavings,
  getSuggestionsSummary
};
