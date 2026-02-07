/**
 * TeleTime POS - Store Credits API
 * Issue, lookup, and redeem store credits
 *
 * Note: The axios interceptor in ./axios.js already unwraps response.data,
 * so we access the data directly from the response.
 */

import api from './axios';

/**
 * Create a new store credit
 * @param {object} options - Store credit options
 * @param {number} options.customerId - Customer ID
 * @param {number} options.amountCents - Amount in cents
 * @param {string} options.sourceType - Source type (return, adjustment, etc.)
 * @param {number} options.sourceId - Source record ID
 * @param {string} options.expiryDate - Expiry date
 * @param {string} options.notes - Notes
 * @returns {Promise<object>} Created store credit
 */
export const createStoreCredit = async ({ customerId, amountCents, sourceType, sourceId, expiryDate, notes }) => {
  try {
    const response = await api.post('/store-credits', { customerId, amountCents, sourceType, sourceId, expiryDate, notes });
    return response;
  } catch (error) {
    console.error('[StoreCredits] createStoreCredit error:', error);
    return { success: false, error: error.message || 'Failed to create store credit' };
  }
};

/**
 * Lookup a store credit by code
 * @param {string} code - Store credit code
 * @returns {Promise<object>} Store credit details
 */
export const lookupStoreCredit = async (code) => {
  try {
    if (!code || code.trim().length === 0) {
      return { success: false, error: 'Store credit code is required' };
    }

    const response = await api.get(`/store-credits/${encodeURIComponent(code.trim())}`);
    return response;
  } catch (error) {
    console.error('[StoreCredits] lookupStoreCredit error:', error);
    return { success: false, error: error.message || 'Failed to lookup store credit' };
  }
};

/**
 * Redeem store credit at checkout
 * @param {string} code - Store credit code
 * @param {object} options - Redemption options
 * @param {number} options.amountCents - Amount to redeem in cents
 * @param {number} options.transactionId - Transaction ID
 * @returns {Promise<object>} Redemption result
 */
export const redeemStoreCredit = async (code, { amountCents, transactionId }) => {
  try {
    if (!code || code.trim().length === 0) {
      return { success: false, error: 'Store credit code is required' };
    }

    if (!amountCents || amountCents <= 0) {
      return { success: false, error: 'Valid amount is required' };
    }

    const response = await api.post(`/store-credits/${encodeURIComponent(code.trim())}/redeem`, { amountCents, transactionId });
    return response;
  } catch (error) {
    console.error('[StoreCredits] redeemStoreCredit error:', error);
    return { success: false, error: error.message || 'Failed to redeem store credit' };
  }
};

export default {
  createStoreCredit,
  lookupStoreCredit,
  redeemStoreCredit,
};
