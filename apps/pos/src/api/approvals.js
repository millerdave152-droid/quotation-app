/**
 * TeleTime POS - Price Override Approval API
 * Tier-based approval requests, token consumption, counter-offers
 */

import api from './axios';

/**
 * Create an approval request for a price override.
 * Tier 1 (<=10%) returns 200 with autoApproved + token.
 * Tier 2+ returns 201 with pending status.
 */
export async function createApprovalRequest({ productId, requestedPrice, managerId, cartItemId }) {
  return api.post('/pos-approvals/request', {
    productId,
    requestedPrice,
    ...(managerId && { managerId }),
    ...(cartItemId && { cartItemId }),
  });
}

/**
 * Poll the current status of an approval request.
 * Returns status, counter offers, manager name, etc.
 */
export async function getApprovalStatus(requestId) {
  return api.get(`/pos-approvals/${requestId}/status`);
}

/**
 * Consume a one-time approval token to lock in the approved price.
 * Returns { approvedPrice, requestId, productId }.
 */
export async function consumeApprovalToken(token, cartId, cartItemId) {
  return api.post('/pos-approvals/consume-token', {
    token,
    ...(cartId && { cartId }),
    ...(cartItemId && { cartItemId }),
  });
}

/**
 * Accept a counter-offer from a manager.
 * Server approves at the counter price and issues a token.
 */
export async function acceptCounterOffer(requestId, counterOfferId) {
  return api.post(`/pos-approvals/${requestId}/accept-counter`, { counterOfferId });
}

/**
 * Decline a counter-offer. Request returns to pending status.
 */
export async function declineCounterOffer(requestId, counterOfferId) {
  return api.post(`/pos-approvals/${requestId}/decline-counter`, { counterOfferId });
}

/**
 * Cancel a pending approval request.
 */
export async function cancelApproval(requestId) {
  return api.post(`/pos-approvals/${requestId}/cancel`);
}

/**
 * Fetch approval analytics (admin only).
 * Returns summary, previousPeriod, byTier, dailyTimeSeries,
 * bySalesperson, byManager, byProduct.
 */
export async function getApprovalAnalytics({ startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return api.get(`/pos-approvals/analytics?${params}`);
}

/**
 * Fetch pricing intelligence for a pending approval request.
 * Returns floor price, price history, customer context, quick math.
 */
export async function getApprovalIntelligence(requestId, customerId) {
  const params = customerId ? `?customerId=${customerId}` : '';
  return api.get(`/pos-approvals/${requestId}/intelligence${params}`);
}

// ============================================================================
// BATCH APPROVAL
// ============================================================================

/**
 * Create a batch approval request covering multiple cart items.
 */
export async function createBatchApprovalRequest({ cartId, managerId, items }) {
  return api.post('/pos-approvals/batch-request', { cartId, managerId, items });
}

/**
 * Get full batch details (parent + all children).
 */
export async function getBatchDetails(parentRequestId) {
  return api.get(`/pos-approvals/batch/${parentRequestId}`);
}

/**
 * Consume all child tokens in a batch at once.
 */
export async function consumeBatchTokens(parentRequestId, cartId) {
  return api.post(`/pos-approvals/batch/${parentRequestId}/consume-tokens`, {
    ...(cartId && { cartId }),
  });
}

// ============================================================================
// DELEGATION
// ============================================================================

/**
 * Create a delegation: grant approval authority to another user.
 */
export async function createDelegation({ delegateId, maxTier, expiresAt, reason }) {
  return api.post('/pos-approvals/delegations', { delegateId, maxTier, expiresAt, reason });
}

/**
 * Get active delegations for the current user (outgoing + incoming).
 */
export async function getActiveDelegations() {
  return api.get('/pos-approvals/delegations/active');
}

/**
 * Revoke a delegation by ID.
 */
export async function revokeDelegation(delegationId) {
  return api.delete(`/pos-approvals/delegations/${delegationId}`);
}

/**
 * Get users eligible to receive delegation from the current user.
 */
export async function getEligibleDelegates() {
  return api.get('/pos-approvals/delegations/eligible');
}
