/**
 * TeleTime POS - Returns API
 * API functions for invoice lookup and return initiation
 *
 * Note: The axios interceptor in ./axios.js already unwraps response.data,
 * so we access the data directly from the response.
 */

import api from './axios';

/**
 * Search transactions eligible for returns
 * @param {object} options - Search options
 * @param {string} options.search - Search query
 * @param {string} options.startDate - Start date filter
 * @param {string} options.endDate - End date filter
 * @param {string} options.dateRange - Date range preset
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @returns {Promise<object>} Search results
 */
export const searchInvoices = async ({ search, startDate, endDate, dateRange, page, limit } = {}) => {
  try {
    const params = {};
    if (search) params.search = search;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (dateRange) params.dateRange = dateRange;
    if (page) params.page = page;
    if (limit) params.limit = limit;

    const response = await api.get('/returns', { params });
    // Axios interceptor already unwraps response.data
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] searchInvoices error:', error);
    return { success: false, error: error.message || 'Failed to search invoices' };
  }
};

/**
 * Get active return reason codes
 * @returns {Promise<object>} Reason codes list
 */
export const getReasonCodes = async () => {
  try {
    const response = await api.get('/returns/reason-codes');
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] getReasonCodes error:', error);
    return { success: false, error: error.message || 'Failed to get reason codes' };
  }
};

/**
 * Get transaction items for a return
 * @param {number} returnId - Return ID
 * @returns {Promise<object>} Return items
 */
export const getReturnItems = async (returnId) => {
  try {
    const response = await api.get(`/returns/${returnId}/items`);
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] getReturnItems error:', error);
    return { success: false, error: error.message || 'Failed to get return items' };
  }
};

/**
 * Add items to a return (with reason codes)
 * @param {number} returnId - Return ID
 * @param {Array} items - Items to add
 * @returns {Promise<object>} Updated return
 */
export const addReturnItems = async (returnId, items) => {
  try {
    const response = await api.post(`/returns/${returnId}/items`, { items });
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] addReturnItems error:', error);
    return { success: false, error: error.message || 'Failed to add return items' };
  }
};

/**
 * Get payment info and refund calculation for a return
 * @param {number} returnId - Return ID
 * @returns {Promise<object>} Payment info
 */
export const getReturnPaymentInfo = async (returnId) => {
  try {
    const response = await api.get(`/returns/${returnId}/payment-info`);
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] getReturnPaymentInfo error:', error);
    return { success: false, error: error.message || 'Failed to get payment info' };
  }
};

/**
 * Process refund for a return
 * @param {number} returnId - Return ID
 * @param {object} options - Refund options
 * @param {string} options.refundMethod - Refund method
 * @param {number} options.restockingFeeCents - Restocking fee in cents
 * @returns {Promise<object>} Refund result
 */
export const processRefund = async (returnId, { refundMethod, restockingFeeCents = 0 }) => {
  try {
    const response = await api.post(`/returns/${returnId}/process-refund`, { refundMethod, restockingFeeCents });
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] processRefund error:', error);
    return { success: false, error: error.message || 'Failed to process refund' };
  }
};

/**
 * Create a new return record
 * @param {object} options - Return options
 * @param {number} options.originalTransactionId - Original transaction ID
 * @param {string} options.returnType - Type of return
 * @param {string} options.notes - Notes
 * @returns {Promise<object>} Created return
 */
export const createReturn = async ({ originalTransactionId, returnType, notes }) => {
  try {
    const response = await api.post('/returns', { originalTransactionId, returnType, notes });
    return response.data ?? response;
  } catch (error) {
    console.error('[Returns] createReturn error:', error);
    return { success: false, error: error.message || 'Failed to create return' };
  }
};

export default {
  searchInvoices,
  getReasonCodes,
  getReturnItems,
  addReturnItems,
  getReturnPaymentInfo,
  processRefund,
  createReturn,
};
