/**
 * TeleTime POS - Upsell API
 * API functions for upsell offers and tracking
 */

import api from './axios';

/**
 * Get upsell offers for checkout
 * @param {object} cart - Cart data
 * @param {object} customer - Customer data (optional)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Upsell offers response
 */
export const getUpsellOffers = async (cart, customer = null, options = {}) => {
  const {
    location = 'checkout',
    sessionId,
    maxOffers = 3,
    excludeShownOffers = [],
  } = options;

  return api.post('/upsell/offers', {
    cart: {
      items: cart.items?.map(item => ({
        productId: item.productId,
        categoryId: item.categoryId,
        quantity: item.quantity,
        price: item.unitPrice,
      })),
      total: cart.total,
      subtotal: cart.subtotal,
    },
    customer: customer ? {
      id: customer.customerId || customer.customer_id || customer.id,
      type: customer.customerType,
    } : null,
    location,
    sessionId,
    maxOffers,
    excludeShownOffers,
  });
};

/**
 * Calculate upgrade value
 * @param {number} currentProductId - Current product ID
 * @param {number} upgradeProductId - Upgrade product ID
 * @returns {Promise<object>} Upgrade value analysis
 */
export const calculateUpgradeValue = async (currentProductId, upgradeProductId) => {
  return api.get(`/upsell/upgrade/${currentProductId}/${upgradeProductId}`);
};

/**
 * Record upsell result
 * @param {object} resultData - Result data
 * @returns {Promise<object>} Result record
 */
export const recordUpsellResult = async (resultData) => {
  const {
    offerId,
    orderId,
    result,
    customerId,
    userId,
    sessionId,
    revenueAddedCents,
    marginAddedCents,
    declineReason,
    metadata,
  } = resultData;

  return api.post('/upsell/result', {
    offerId,
    orderId,
    result,
    customerId,
    userId,
    sessionId,
    revenueAddedCents,
    marginAddedCents,
    declineReason,
    metadata,
  });
};

/**
 * Get service recommendations for cart items
 * @param {Array} cartItems - Cart items
 * @returns {Promise<object>} Service recommendations
 */
export const getServiceRecommendations = async (cartItems) => {
  return api.post('/upsell/services', { cartItems });
};

/**
 * Get membership offers
 * @param {object} customer - Customer data
 * @param {number} cartValueCents - Cart value in cents
 * @returns {Promise<object>} Membership offers
 */
export const getMembershipOffers = async (customer, cartValueCents) => {
  return api.post('/upsell/membership-offers', {
    customer: customer ? {
      id: customer.customerId || customer.customer_id || customer.id,
    } : null,
    cartValueCents,
  });
};

/**
 * Get financing options
 * @param {number} amountCents - Amount in cents
 * @returns {Promise<object>} Financing options
 */
export const getFinancingOptions = async (amountCents) => {
  return api.get(`/upsell/financing/${amountCents}`);
};

/**
 * Get upsell analytics (admin)
 * @param {object} options - Date range and filters
 * @returns {Promise<object>} Analytics data
 */
export const getUpsellAnalytics = async (options = {}) => {
  const { startDate, endDate, strategyId, upsellType } = options;

  return api.get('/upsell/admin/analytics', {
    params: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      strategyId,
      upsellType,
    },
  });
};

/**
 * Get all upsell strategies (admin)
 * @param {object} options - Query options
 * @returns {Promise<object>} Strategies list
 */
export const getUpsellStrategies = async (options = {}) => {
  const { type, active, page = 1, limit = 50 } = options;

  return api.get('/upsell/admin/strategies', {
    params: { type, active, page, limit },
  });
};

/**
 * Get single strategy with offers (admin)
 * @param {number} strategyId - Strategy ID
 * @returns {Promise<object>} Strategy with offers
 */
export const getUpsellStrategy = async (strategyId) => {
  return api.get(`/upsell/admin/strategies/${strategyId}`);
};

/**
 * Create upsell strategy (admin)
 * @param {object} strategyData - Strategy data
 * @returns {Promise<object>} Created strategy
 */
export const createUpsellStrategy = async (strategyData) => {
  return api.post('/upsell/admin/strategies', strategyData);
};

/**
 * Update upsell strategy (admin)
 * @param {number} strategyId - Strategy ID
 * @param {object} strategyData - Strategy data
 * @returns {Promise<object>} Updated strategy
 */
export const updateUpsellStrategy = async (strategyId, strategyData) => {
  return api.put(`/upsell/admin/strategies/${strategyId}`, strategyData);
};

/**
 * Delete upsell strategy (admin)
 * @param {number} strategyId - Strategy ID
 * @returns {Promise<void>}
 */
export const deleteUpsellStrategy = async (strategyId) => {
  return api.delete(`/upsell/admin/strategies/${strategyId}`);
};

/**
 * Create upsell offer (admin)
 * @param {object} offerData - Offer data
 * @returns {Promise<object>} Created offer
 */
export const createUpsellOffer = async (offerData) => {
  return api.post('/upsell/admin/offers', offerData);
};

/**
 * Update upsell offer (admin)
 * @param {number} offerId - Offer ID
 * @param {object} offerData - Offer data
 * @returns {Promise<object>} Updated offer
 */
export const updateUpsellOffer = async (offerId, offerData) => {
  return api.put(`/upsell/admin/offers/${offerId}`, offerData);
};

/**
 * Delete upsell offer (admin)
 * @param {number} offerId - Offer ID
 * @returns {Promise<void>}
 */
export const deleteUpsellOffer = async (offerId) => {
  return api.delete(`/upsell/admin/offers/${offerId}`);
};

/**
 * Get all services (admin)
 * @param {object} options - Query options
 * @returns {Promise<object>} Services list
 */
export const getServices = async (options = {}) => {
  const { type, active } = options;

  return api.get('/upsell/admin/services', {
    params: { type, active },
  });
};

/**
 * Create service (admin)
 * @param {object} serviceData - Service data
 * @returns {Promise<object>} Created service
 */
export const createService = async (serviceData) => {
  return api.post('/upsell/admin/services', serviceData);
};

/**
 * Clear upsell cache (admin)
 * @returns {Promise<void>}
 */
export const clearUpsellCache = async () => {
  return api.post('/upsell/admin/clear-cache');
};

export default {
  getUpsellOffers,
  calculateUpgradeValue,
  recordUpsellResult,
  getServiceRecommendations,
  getMembershipOffers,
  getFinancingOptions,
  getUpsellAnalytics,
  getUpsellStrategies,
  getUpsellStrategy,
  createUpsellStrategy,
  updateUpsellStrategy,
  deleteUpsellStrategy,
  createUpsellOffer,
  updateUpsellOffer,
  deleteUpsellOffer,
  getServices,
  createService,
  clearUpsellCache,
};
