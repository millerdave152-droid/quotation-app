/**
 * TeleTime POS - Loyalty Points API
 * API functions for customer loyalty point lookup and redemption.
 *
 * TODO: Connect to Hub loyalty API when built. Currently uses mock data
 * so the POS component can be developed and tested independently.
 *
 * Integration points:
 *   GET  /api/customers/:id/loyalty         → getLoyaltyBalance()
 *   POST /api/customers/:id/loyalty/redeem  → redeemPoints()
 */

import api from './axios';

// Points-to-dollar conversion rate (configurable once Hub API exists)
export const POINTS_PER_DOLLAR = 100;

/**
 * Get customer loyalty point balance and tier info.
 * @param {number} customerId
 * @returns {Promise<object>} { success, data: { pointsBalance, tier, ... } }
 *
 * TODO: Replace mock with:  api.get(`/customers/${customerId}/loyalty`)
 */
export const getLoyaltyBalance = async (customerId) => {
  try {
    const response = await api.get(`/customers/${customerId}/loyalty`);
    return response.data ?? response;
  } catch (err) {
    // If Hub endpoint is not yet built, return mock data for development
    if (err.response?.status === 404) {
      return {
        success: true,
        data: {
          customerId,
          pointsBalance: 0,
          lifetimePoints: 0,
          tier: 'none',
          pointsPerDollar: POINTS_PER_DOLLAR,
          _mock: true,
          _message: 'Loyalty API not available yet — showing zero balance',
        },
      };
    }
    return { success: false, error: err.response?.data?.error || err.message };
  }
};

/**
 * Redeem loyalty points against an order.
 * @param {number} customerId
 * @param {object} params
 * @param {number} params.points      - Number of points to redeem
 * @param {number} params.amountCents - Dollar value in cents
 * @param {number} [params.orderId]   - Associated order/transaction ID
 * @returns {Promise<object>}
 *
 * TODO: Replace mock with:  api.post(`/customers/${customerId}/loyalty/redeem`, params)
 */
export const redeemPoints = async (customerId, { points, amountCents, orderId }) => {
  try {
    const response = await api.post(`/customers/${customerId}/loyalty/redeem`, {
      points,
      amountCents,
      orderId,
    });
    return response.data ?? response;
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        success: false,
        error: 'Loyalty system is not yet active. Points cannot be redeemed at this time.',
        _mock: true,
      };
    }
    return { success: false, error: err.response?.data?.error || err.message };
  }
};
