/**
 * TeleTime POS - Discount Authority API
 * Tier-based discounts, budget tracking, escalation workflows
 */

import api from './axios';

/**
 * Get the current user's discount tier + active budget
 */
export async function getMyTier() {
  return api.get('/discount-authority/my-tier');
}

/**
 * Validate a proposed discount with full calculations
 * @param {number} productId
 * @param {number} proposedDiscountPct
 * @param {number} [employeeId] - Optional, defaults to current user
 */
export async function validateDiscount(productId, proposedDiscountPct, employeeId) {
  return api.post('/discount-authority/validate', {
    product_id: productId,
    proposed_discount_pct: proposedDiscountPct,
    ...(employeeId && { employee_id: employeeId }),
  });
}

/**
 * Apply a discount to a cart item (with all checks)
 */
export async function applyDiscount(data) {
  return api.post('/discount-authority/apply', data);
}

/**
 * Initialize weekly budget for the current user
 */
export async function initializeBudget() {
  return api.post('/discount-authority/budget/initialize', {});
}

/**
 * Submit an escalation request for manager approval
 */
export async function submitEscalation(data) {
  return api.post('/discount-escalations', data);
}

/**
 * Get the current user's own escalations (pending + resolved within 24h)
 */
export async function getMyEscalations() {
  return api.get('/discount-escalations/mine');
}

/**
 * Get all pending escalation requests (manager+ only)
 */
export async function getPendingEscalations() {
  return api.get('/discount-escalations/pending');
}

/**
 * Approve an escalation request (manager+ only)
 */
export async function approveEscalation(id, notes) {
  return api.put(`/discount-escalations/${id}/approve`, { notes });
}

/**
 * Deny an escalation request (manager+ only)
 */
export async function denyEscalation(id, reason) {
  return api.put(`/discount-escalations/${id}/deny`, { reason });
}
