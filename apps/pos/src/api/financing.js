/**
 * TeleTime POS - Financing API
 * API functions for financing plans, applications, and payments
 */

import api from './axios';

/**
 * Get available financing plans for an order amount
 * @param {number} amountCents - Order total in cents
 * @param {number|null} customerId - Optional customer ID
 * @returns {Promise<object>} Available plans with calculations
 */
export const getAvailablePlans = async (amountCents, customerId = null) => {
  const params = { amount: amountCents };
  if (customerId) params.customerId = customerId;

  return api.get('/financing/plans', { params });
};

/**
 * Calculate payment details for a specific plan
 * @param {number} planId - Financing option ID
 * @param {number} amountCents - Amount to finance in cents
 * @returns {Promise<object>} Payment plan with schedule
 */
export const calculatePaymentPlan = async (planId, amountCents) => {
  return api.get(`/financing/plans/${planId}/calculate`, {
    params: { amount: amountCents },
  });
};

/**
 * Initiate financing application
 * @param {object} applicationData - Application data
 * @returns {Promise<object>} Application result
 */
export const applyForFinancing = async (applicationData) => {
  const { orderId, planId, customerId, amountCents, transactionId } = applicationData;

  return api.post('/financing/apply', {
    orderId,
    planId,
    customerId,
    amountCents,
    transactionId,
  });
};

/**
 * Get financing application details
 * @param {number} applicationId - Application ID
 * @returns {Promise<object>} Application details
 */
export const getApplication = async (applicationId) => {
  return api.get(`/financing/applications/${applicationId}`);
};

/**
 * Get customer's financing information
 * @param {number} customerId - Customer ID
 * @returns {Promise<object>} Customer financing summary, agreements, payments
 */
export const getCustomerFinancing = async (customerId) => {
  return api.get(`/financing/customer/${customerId}`);
};

/**
 * Record a payment on a financing agreement
 * @param {number} agreementId - Agreement ID
 * @param {object} paymentData - Payment data
 * @returns {Promise<object>} Payment result
 */
export const recordPayment = async (agreementId, paymentData) => {
  const { amountCents, paymentMethod, externalPaymentId } = paymentData;

  return api.post(`/financing/agreements/${agreementId}/payments`, {
    amountCents,
    paymentMethod,
    externalPaymentId,
  });
};

// ============================================================================
// ADMIN API FUNCTIONS
// ============================================================================

/**
 * List financing applications (admin)
 * @param {object} filters - Query filters
 * @returns {Promise<object>} Applications list
 */
export const listApplications = async (filters = {}) => {
  const { status, customerId, provider, page, limit } = filters;

  return api.get('/financing/admin/applications', {
    params: { status, customerId, provider, page, limit },
  });
};

/**
 * List financing agreements (admin)
 * @param {object} filters - Query filters
 * @returns {Promise<object>} Agreements list
 */
export const listAgreements = async (filters = {}) => {
  const { status, customerId, page, limit } = filters;

  return api.get('/financing/admin/agreements', {
    params: { status, customerId, page, limit },
  });
};

/**
 * Get upcoming payments (admin)
 * @param {number} daysAhead - Days to look ahead
 * @returns {Promise<object>} Upcoming payments
 */
export const getUpcomingPayments = async (daysAhead = 7) => {
  return api.get('/financing/admin/upcoming-payments', {
    params: { days: daysAhead },
  });
};

/**
 * Get overdue payments (admin)
 * @returns {Promise<object>} Overdue payments list
 */
export const getOverduePayments = async () => {
  return api.get('/financing/admin/overdue');
};

/**
 * Approve financing application (admin)
 * @param {number} applicationId - Application ID
 * @param {number|null} approvedAmount - Override approved amount (optional)
 * @returns {Promise<object>} Approval result
 */
export const approveApplication = async (applicationId, approvedAmount = null) => {
  return api.post(`/financing/admin/applications/${applicationId}/approve`, {
    approvedAmount,
  });
};

/**
 * Decline financing application (admin)
 * @param {number} applicationId - Application ID
 * @param {string} reason - Decline reason
 * @param {string|null} declineCode - Decline code
 * @returns {Promise<object>} Decline result
 */
export const declineApplication = async (applicationId, reason, declineCode = null) => {
  return api.post(`/financing/admin/applications/${applicationId}/decline`, {
    reason,
    declineCode,
  });
};

/**
 * Get admin dashboard stats
 * @returns {Promise<object>} Dashboard statistics
 */
export const getAdminDashboard = async () => {
  return api.get('/financing/admin/dashboard');
};

/**
 * Get all applications with optional filters
 * @param {object} options - Query options
 * @returns {Promise<object>} Applications list
 */
export const getApplications = async (options = {}) => {
  const { includeAll, status, provider, customerId, page, limit } = options;
  return api.get('/financing/applications', {
    params: { includeAll, status, provider, customerId, page, limit },
  });
};

/**
 * Get collections (past due accounts)
 * @param {object} options - Query options
 * @returns {Promise<object>} Collections list grouped by risk level
 */
export const getCollections = async (options = {}) => {
  const { riskLevel, provider, minDaysOverdue } = options;
  return api.get('/financing/admin/collections', {
    params: { riskLevel, provider, minDaysOverdue },
  });
};

/**
 * Manual approve application (manager only)
 * @param {number} applicationId - Application ID
 * @param {object} data - Approval data
 * @returns {Promise<object>} Approval result
 */
export const manualApprove = async (applicationId, data = {}) => {
  return api.post(`/financing/applications/${applicationId}/manual-approve`, data);
};

/**
 * Manual decline application (manager only)
 * @param {number} applicationId - Application ID
 * @param {object} data - Decline data with reason
 * @returns {Promise<object>} Decline result
 */
export const manualDecline = async (applicationId, data) => {
  return api.post(`/financing/applications/${applicationId}/manual-decline`, data);
};

/**
 * Get payoff amount for an agreement
 * @param {number} agreementId - Agreement ID
 * @returns {Promise<object>} Payoff calculation
 */
export const getPayoffAmount = async (agreementId) => {
  return api.get(`/financing/agreements/${agreementId}/payoff`);
};

/**
 * Process early payoff for an agreement
 * @param {number} agreementId - Agreement ID
 * @param {object} paymentData - Payment data
 * @returns {Promise<object>} Payoff result
 */
export const processEarlyPayoff = async (agreementId, paymentData = {}) => {
  return api.post(`/financing/agreements/${agreementId}/payoff`, paymentData);
};

/**
 * Get agreement details
 * @param {number} agreementId - Agreement ID
 * @returns {Promise<object>} Agreement details with payments
 */
export const getAgreement = async (agreementId) => {
  return api.get(`/financing/agreements/${agreementId}`);
};

export default {
  // Customer-facing
  getAvailablePlans,
  calculatePaymentPlan,
  applyForFinancing,
  getApplication,
  getApplications,
  getAgreement,
  getCustomerFinancing,
  recordPayment,
  getPayoffAmount,
  processEarlyPayoff,

  // Admin
  listApplications,
  listAgreements,
  getUpcomingPayments,
  getOverduePayments,
  approveApplication,
  declineApplication,
  getAdminDashboard,
  getCollections,
  manualApprove,
  manualDecline,
};
