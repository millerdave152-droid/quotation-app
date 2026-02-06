/**
 * Commission API Module
 * Handles commission calculation and reporting
 *
 * Uses the configured axios instance for consistent error handling,
 * authentication, and request/response interceptors.
 */

import api from './axios';

/**
 * Helper to handle API responses consistently
 * @param {Function} apiCall - Async function that makes the API call
 * @param {string} errorMessage - Default error message
 * @returns {Promise<object>} Standardized response
 */
async function handleApiCall(apiCall, errorMessage) {
  try {
    const response = await apiCall();
    return {
      success: true,
      data: response.data ?? response,
    };
  } catch (error) {
    console.error(`[Commissions] ${errorMessage}:`, error);
    return {
      success: false,
      error: error.message || errorMessage,
      data: null,
    };
  }
}

/**
 * Calculate commission preview for a cart
 * @param {object} cart - Cart with items
 * @param {number} salesRepId - Sales rep user ID
 * @returns {Promise<object>} Commission calculation result
 */
export async function calculateCartCommission(cart, salesRepId) {
  return handleApiCall(
    () => api.post('/commissions/calculate/cart', { cart, salesRepId }),
    'Failed to calculate commission'
  );
}

/**
 * Calculate commission for a completed order
 * @param {number} orderId - Order ID
 * @param {number} salesRepId - Sales rep user ID
 * @returns {Promise<object>} Commission calculation result
 */
export async function calculateOrderCommission(orderId, salesRepId) {
  return handleApiCall(
    () => api.post(`/commissions/calculate/order/${orderId}`, { salesRepId }),
    'Failed to calculate commission'
  );
}

/**
 * Record commission for a completed order
 * @param {number} orderId - Order ID
 * @param {number} salesRepId - Sales rep user ID
 * @returns {Promise<object>} Record result
 */
export async function recordCommission(orderId, salesRepId) {
  return handleApiCall(
    () => api.post(`/commissions/record/${orderId}`, { salesRepId }),
    'Failed to record commission'
  );
}

/**
 * Get current user's commissions
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>} User's commissions
 */
export async function getMyCommissions(dateRange = {}) {
  const params = {};
  if (dateRange.startDate) params.startDate = dateRange.startDate;
  if (dateRange.endDate) params.endDate = dateRange.endDate;

  return handleApiCall(
    () => api.get('/commissions/my', { params }),
    'Failed to get commissions'
  );
}

/**
 * Get commission report for a specific rep
 * @param {number} repId - Sales rep user ID
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>} Rep commissions
 */
export async function getRepCommissions(repId, dateRange = {}) {
  const params = {};
  if (dateRange.startDate) params.startDate = dateRange.startDate;
  if (dateRange.endDate) params.endDate = dateRange.endDate;

  return handleApiCall(
    () => api.get(`/commissions/rep/${repId}`, { params }),
    'Failed to get rep commissions'
  );
}

/**
 * Get commission leaderboard
 * @param {string} period - 'today', 'week', 'month', 'quarter', 'year'
 * @returns {Promise<object>} Leaderboard data
 */
export async function getLeaderboard(period = 'month') {
  return handleApiCall(
    () => api.get('/commissions/leaderboard', { params: { period } }),
    'Failed to get leaderboard'
  );
}

/**
 * Get overall commission statistics
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>} Commission stats
 */
export async function getCommissionStats(dateRange = {}) {
  const params = {};
  if (dateRange.startDate) params.startDate = dateRange.startDate;
  if (dateRange.endDate) params.endDate = dateRange.endDate;

  return handleApiCall(
    () => api.get('/commissions/stats', { params }),
    'Failed to get stats'
  );
}

/**
 * Get all commission rules
 * @param {boolean} includeInactive - Include inactive rules
 * @returns {Promise<object>} Commission rules
 */
export async function getCommissionRules(includeInactive = false) {
  const params = includeInactive ? { includeInactive: 'true' } : {};

  return handleApiCall(
    () => api.get('/commissions/rules', { params }),
    'Failed to get rules'
  );
}

/**
 * Create a new commission rule
 * @param {object} ruleData - Rule configuration
 * @returns {Promise<object>} Created rule
 */
export async function createCommissionRule(ruleData) {
  return handleApiCall(
    () => api.post('/commissions/rules', ruleData),
    'Failed to create rule'
  );
}

/**
 * Update a commission rule
 * @param {number} ruleId - Rule ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated rule
 */
export async function updateCommissionRule(ruleId, updates) {
  return handleApiCall(
    () => api.put(`/commissions/rules/${ruleId}`, updates),
    'Failed to update rule'
  );
}

/**
 * Delete (deactivate) a commission rule
 * @param {number} ruleId - Rule ID
 * @returns {Promise<object>} Deletion result
 */
export async function deleteCommissionRule(ruleId) {
  return handleApiCall(
    () => api.delete(`/commissions/rules/${ruleId}`),
    'Failed to delete rule'
  );
}

/**
 * Get rep commission settings
 * @param {number} repId - Sales rep user ID
 * @returns {Promise<object>} Rep settings
 */
export async function getRepSettings(repId) {
  return handleApiCall(
    () => api.get(`/commissions/settings/${repId}`),
    'Failed to get settings'
  );
}

/**
 * Update rep commission settings
 * @param {number} repId - Sales rep user ID
 * @param {object} settings - Settings to update
 * @returns {Promise<object>} Updated settings
 */
export async function updateRepSettings(repId, settings) {
  return handleApiCall(
    () => api.put(`/commissions/settings/${repId}`, settings),
    'Failed to update settings'
  );
}

// ============================================
// COMMISSION SUMMARY (logout/shift-close)
// ============================================

/**
 * Get commission summary (today + pay period) for the current user
 * @returns {Promise<object>} Commission summary
 */
export async function getCommissionSummary() {
  return handleApiCall(
    () => api.get('/commissions/summary'),
    'Failed to get commission summary'
  );
}

// ============================================
// COMMISSION SPLITS
// ============================================

/**
 * Preview commission split amounts
 * @param {object} params - { totalAmountCents, splits, cart }
 * @returns {Promise<object>} Split preview
 */
export async function previewCommissionSplits({ totalAmountCents, splits, cart }) {
  return handleApiCall(
    () => api.post('/commissions/splits/preview', { totalAmountCents, splits, cart }),
    'Failed to preview splits'
  );
}

/**
 * Save commission splits for a transaction
 * @param {number} transactionId
 * @param {Array} splits - [{ userId, splitPercentage, role }]
 * @returns {Promise<object>} Save result
 */
export async function saveCommissionSplits(transactionId, splits) {
  return handleApiCall(
    () => api.post(`/commissions/splits/${transactionId}`, { splits }),
    'Failed to save splits'
  );
}

/**
 * Get commission splits for a transaction
 * @param {number} transactionId
 * @returns {Promise<object>} Commission splits
 */
export async function getCommissionSplits(transactionId) {
  return handleApiCall(
    () => api.get(`/commissions/splits/${transactionId}`),
    'Failed to get splits'
  );
}

// ============================================
// TEAM REPORTING (Manager)
// ============================================

/**
 * Get team commission summary (manager only)
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>} Team commissions
 */
export async function getTeamCommissions(dateRange = {}) {
  const params = {};
  if (dateRange.startDate) params.startDate = dateRange.startDate;
  if (dateRange.endDate) params.endDate = dateRange.endDate;

  return handleApiCall(
    () => api.get('/commissions/team', { params }),
    'Failed to get team commissions'
  );
}

/**
 * Get detailed commission report for a specific rep
 * @param {number} repId - Sales rep user ID
 * @param {object} dateRange - { startDate, endDate }
 * @returns {Promise<object>} Detailed rep commissions
 */
export async function getRepDetailedCommissions(repId, dateRange = {}) {
  const params = {};
  if (dateRange.startDate) params.startDate = dateRange.startDate;
  if (dateRange.endDate) params.endDate = dateRange.endDate;

  return handleApiCall(
    () => api.get(`/commissions/rep/${repId}/detailed`, { params }),
    'Failed to get rep details'
  );
}

// ============================================
// CSV EXPORT
// ============================================

/**
 * Export commissions to CSV (triggers download)
 * @param {object} options - { startDate, endDate, repId }
 * @returns {Promise<object>} Export result with filename
 */
export async function exportCommissionsCSV(options = {}) {
  try {
    const params = { format: 'csv' };
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.repId) params.repId = options.repId.toString();

    const response = await api.get('/commissions/export', {
      params,
      responseType: 'blob',
    });

    // Get filename from header or generate one
    const disposition = response.headers?.['content-disposition'];
    let filename = 'commissions.csv';
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // Get blob data - axios returns data directly when responseType is blob
    const blob = response.data ?? response;

    // Trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    return { success: true, filename };
  } catch (error) {
    console.error('[Commissions] exportCommissionsCSV error:', error);
    return {
      success: false,
      error: error.message || 'Failed to export',
    };
  }
}

// ============================================
// PAYROLL / PAYOUTS
// ============================================

/**
 * Get payroll summary for a period
 * @param {string} periodStart - Start date
 * @param {string} periodEnd - End date
 * @returns {Promise<object>} Payroll summary
 */
export async function getPayrollSummary(periodStart, periodEnd) {
  return handleApiCall(
    () => api.get('/commissions/payroll/summary', { params: { periodStart, periodEnd } }),
    'Failed to get payroll summary'
  );
}

/**
 * Create a payout record
 * @param {object} data - Payout data
 * @returns {Promise<object>} Created payout
 */
export async function createPayout(data) {
  return handleApiCall(
    () => api.post('/commissions/payouts', data),
    'Failed to create payout'
  );
}

/**
 * Get pending payouts
 * @returns {Promise<object>} Pending payouts
 */
export async function getPendingPayouts() {
  return handleApiCall(
    () => api.get('/commissions/payouts/pending'),
    'Failed to get pending payouts'
  );
}

/**
 * Approve a payout
 * @param {number} payoutId - Payout ID
 * @returns {Promise<object>} Approval result
 */
export async function approvePayout(payoutId) {
  return handleApiCall(
    () => api.post(`/commissions/payouts/${payoutId}/approve`),
    'Failed to approve payout'
  );
}

/**
 * Mark payout as paid
 * @param {number} payoutId - Payout ID
 * @param {string} paymentReference - Payment reference
 * @returns {Promise<object>} Update result
 */
export async function markPayoutPaid(payoutId, paymentReference = '') {
  return handleApiCall(
    () => api.post(`/commissions/payouts/${payoutId}/paid`, { paymentReference }),
    'Failed to mark payout as paid'
  );
}

/**
 * Add commission adjustment (chargeback, etc.)
 * @param {object} data - Adjustment data
 * @returns {Promise<object>} Created adjustment
 */
export async function addAdjustment(data) {
  return handleApiCall(
    () => api.post('/commissions/adjustments', data),
    'Failed to add adjustment'
  );
}
