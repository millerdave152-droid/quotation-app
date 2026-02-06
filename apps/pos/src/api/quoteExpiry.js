/**
 * TeleTime POS - Quote Expiry API
 * API functions for managing expiring quotes
 */

import api from './axios';

/**
 * Get expiring quotes
 * @param {object} options - Query options
 * @returns {Promise<object>} Expiring quotes with stats
 */
export const getExpiringQuotes = async (options = {}) => {
  const { days = 7, repId, sortBy = 'priority', limit = 100, offset = 0, includeExpired = false } = options;

  const params = { days, sortBy, limit, offset };
  if (repId) params.repId = repId;
  if (includeExpired) params.includeExpired = 'true';

  return api.get('/pos/quotes/expiring', { params });
};

/**
 * Get quote expiry stats
 * @param {number|null} repId - Filter by sales rep
 * @returns {Promise<object>} Expiry statistics
 */
export const getExpiryStats = async (repId = null) => {
  const params = repId ? { repId } : {};
  return api.get('/pos/quotes/expiring/stats', { params });
};

/**
 * Get expiry dashboard summary
 * @param {number|null} repId - Filter by sales rep
 * @returns {Promise<object>} Dashboard data with alerts
 */
export const getExpiryDashboard = async (repId = null) => {
  const params = repId ? { repId } : {};
  return api.get('/pos/quotes/expiring/dashboard', { params });
};

/**
 * Log a follow-up on a quote
 * @param {number} quoteId - Quote ID
 * @param {object} data - Follow-up data
 * @returns {Promise<object>} Follow-up record
 */
export const logFollowUp = async (quoteId, data) => {
  return api.post(`/pos/quotes/${quoteId}/followed-up`, data);
};

/**
 * Get follow-up history for a quote
 * @param {number} quoteId - Quote ID
 * @returns {Promise<Array>} Follow-up history
 */
export const getFollowUpHistory = async (quoteId) => {
  return api.get(`/pos/quotes/${quoteId}/follow-ups`);
};

export default {
  getExpiringQuotes,
  getExpiryStats,
  getExpiryDashboard,
  logFollowUp,
  getFollowUpHistory,
};
