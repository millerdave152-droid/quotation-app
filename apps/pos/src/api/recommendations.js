/**
 * TeleTime POS - Recommendations API
 * API functions for fetching and tracking product recommendations
 */

import api from './axios';

/**
 * Get recommendations for a specific product
 * @param {number} productId - Product ID
 * @param {object} options - Query options
 * @returns {Promise<object>} Recommendations response
 */
export const getProductRecommendations = async (productId, options = {}) => {
  const { limit = 4, context = 'product' } = options;

  return api.get(`/recommendations/product/${productId}`, {
    params: { limit, context },
  });
};

/**
 * Get recommendations based on cart items
 * @param {Array} items - Cart items with productId and quantity
 * @param {object} options - Additional options
 * @returns {Promise<object>} Recommendations response
 */
export const getCartRecommendations = async (items, options = {}) => {
  const { customerId, limit = 4, includeBundles = false } = options;

  return api.post('/recommendations/cart', {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    customerId,
    limit,
    includeBundles,
  });
};

/**
 * Get cross-sell suggestions for checkout
 * @param {Array} items - Cart items
 * @param {object} options - Additional options
 * @returns {Promise<object>} Cross-sell response with margin data
 */
export const getCrossSellSuggestions = async (items, options = {}) => {
  const { customerId, limit = 4 } = options;

  return api.post('/recommendations/cross-sell', {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    customerId,
    limit,
  });
};

/**
 * Track recommendation events (impressions, clicks, add-to-cart)
 * @param {object} eventData - Event data
 * @returns {Promise<object>} Acknowledgment
 */
export const trackRecommendationEvent = async (eventData) => {
  const {
    type, // 'impression', 'click', 'add_to_cart', 'conversion'
    productIds,
    context,
    sourceProductId,
    cartProductIds,
  } = eventData;

  return api.post('/recommendations/events', {
    type,
    productIds,
    context,
    sourceProductId,
    cartProductIds,
  });
};

/**
 * Get bundle suggestions
 * @param {Array} items - Cart items
 * @returns {Promise<object>} Bundle suggestions
 */
export const getBundleSuggestions = async (items) => {
  const response = await api.post('/recommendations/cart', {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    includeBundles: true,
    limit: 10,
  });

  // Extract and format bundle opportunities
  const suggestions = response?.recommendations || [];
  const bundles = [];

  // Group accessories to form bundles
  const accessories = suggestions.filter((s) => s.relationship_type === 'accessory');

  if (accessories.length >= 2) {
    const bundleItems = accessories.slice(0, 3);
    const totalPrice = bundleItems.reduce(
      (sum, item) => sum + parseFloat(item.price || item.unitPrice || 0),
      0
    );

    // 10% bundle discount
    const bundlePrice = totalPrice * 0.9;
    const savings = totalPrice - bundlePrice;

    if (savings > 5) {
      bundles.push({
        id: `bundle_${Date.now()}`,
        name: 'Complete Setup Bundle',
        products: bundleItems,
        originalPrice: totalPrice,
        bundlePrice,
        savings,
        savingsPercent: 10,
      });
    }
  }

  return { bundles, suggestions };
};

/**
 * Get recommendation statistics (admin)
 * @returns {Promise<object>} Stats data
 */
export const getRecommendationStats = async () => {
  return api.get('/recommendations/admin/stats');
};

/**
 * Get all product relationships (admin)
 * @param {object} options - Query options
 * @returns {Promise<object>} Relationships list
 */
export const getProductRelationships = async (options = {}) => {
  const { page = 1, limit = 50, type, productId, isActive } = options;

  return api.get('/recommendations/admin/relationships', {
    params: { page, limit, type, productId, isActive },
  });
};

/**
 * Create or update a product relationship (admin)
 * @param {object} relationshipData - Relationship data
 * @returns {Promise<object>} Created/updated relationship
 */
export const saveProductRelationship = async (relationshipData) => {
  if (relationshipData.id) {
    return api.put(`/recommendations/admin/relationships/${relationshipData.id}`, relationshipData);
  }
  return api.post('/recommendations/admin/relationships', relationshipData);
};

/**
 * Delete a product relationship (admin)
 * @param {number} relationshipId - Relationship ID
 * @returns {Promise<void>}
 */
export const deleteProductRelationship = async (relationshipId) => {
  return api.delete(`/recommendations/admin/relationships/${relationshipId}`);
};

/**
 * Toggle relationship active status (admin)
 * @param {number} relationshipId - Relationship ID
 * @param {boolean} isActive - New active status
 * @returns {Promise<object>} Updated relationship
 */
export const toggleRelationshipStatus = async (relationshipId, isActive) => {
  return api.patch(`/recommendations/admin/relationships/${relationshipId}`, {
    isActive,
  });
};

/**
 * Get category rules (admin)
 * @returns {Promise<Array>} Category rules
 */
export const getCategoryRules = async () => {
  return api.get('/recommendations/admin/rules');
};

/**
 * Save category rule (admin)
 * @param {object} ruleData - Rule data
 * @returns {Promise<object>} Created/updated rule
 */
export const saveCategoryRule = async (ruleData) => {
  if (ruleData.id) {
    return api.put(`/recommendations/admin/rules/${ruleData.id}`, ruleData);
  }
  return api.post('/recommendations/admin/rules', ruleData);
};

/**
 * Delete category rule (admin)
 * @param {number} ruleId - Rule ID
 * @returns {Promise<void>}
 */
export const deleteCategoryRule = async (ruleId) => {
  return api.delete(`/recommendations/admin/rules/${ruleId}`);
};

/**
 * Trigger recommendation refresh (admin)
 * @returns {Promise<object>} Job status
 */
export const refreshRecommendations = async () => {
  return api.post('/recommendations/admin/refresh');
};

/**
 * Test recommendations for a product (admin)
 * @param {number} productId - Product ID
 * @returns {Promise<object>} Test results
 */
export const testProductRecommendations = async (productId) => {
  return api.get(`/recommendations/test/${productId}`);
};

/**
 * Test recommendations for a cart (admin)
 * @param {Array} items - Cart items
 * @returns {Promise<object>} Test results
 */
export const testCartRecommendations = async (items) => {
  return api.post('/recommendations/test/cart', {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity || 1,
    })),
  });
};

export default {
  getProductRecommendations,
  getCartRecommendations,
  getCrossSellSuggestions,
  trackRecommendationEvent,
  getBundleSuggestions,
  getRecommendationStats,
  getProductRelationships,
  saveProductRelationship,
  deleteProductRelationship,
  toggleRelationshipStatus,
  getCategoryRules,
  saveCategoryRule,
  deleteCategoryRule,
  refreshRecommendations,
  testProductRecommendations,
  testCartRecommendations,
};
