/**
 * TeleTime POS - Exchanges API
 * Process return-and-replace as a single transaction
 *
 * Note: The axios interceptor in ./axios.js already unwraps response.data,
 * so we access the data directly from the response.
 */

import api from './axios';

/**
 * Calculate exchange preview (price difference) without processing
 * @param {object} options - Exchange options
 * @param {number} options.originalTransactionId - Original transaction ID
 * @param {Array<number>} options.returnItemIds - IDs of items being returned
 * @param {Array<object>} options.newItems - New items being exchanged to
 * @returns {Promise<object>} Exchange calculation with price difference
 */
export const calculateExchange = async ({ originalTransactionId, returnItemIds, newItems }) => {
  try {
    if (!originalTransactionId) {
      return { success: false, error: 'Original transaction ID is required' };
    }

    if (!returnItemIds || returnItemIds.length === 0) {
      return { success: false, error: 'At least one return item is required' };
    }

    if (!newItems || newItems.length === 0) {
      return { success: false, error: 'At least one new item is required' };
    }

    const response = await api.post('/exchanges/calculate', { originalTransactionId, returnItemIds, newItems });
    return response.data ?? response;
  } catch (error) {
    console.error('[Exchanges] calculateExchange error:', error);
    return { success: false, error: error.message || 'Failed to calculate exchange' };
  }
};

/**
 * Process a full exchange (return + new sale atomically)
 * @param {object} data - Exchange data
 * @param {number} data.originalTransactionId - Original transaction ID
 * @param {Array<number>} data.returnItemIds - IDs of items being returned
 * @param {Array<object>} data.newItems - New items being exchanged to
 * @param {number} data.shiftId - Current shift ID
 * @param {Array<object>} data.payments - Payments for price difference
 * @returns {Promise<object>} Exchange result
 */
export const processExchange = async (data) => {
  try {
    if (!data.originalTransactionId) {
      return { success: false, error: 'Original transaction ID is required' };
    }

    if (!data.shiftId) {
      return { success: false, error: 'Shift ID is required' };
    }

    const response = await api.post('/exchanges', data);
    return response.data ?? response;
  } catch (error) {
    console.error('[Exchanges] processExchange error:', error);
    return { success: false, error: error.message || 'Failed to process exchange' };
  }
};

export default {
  calculateExchange,
  processExchange,
};
