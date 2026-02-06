/**
 * TeleTime POS - Manager Approval Hook
 * Handles manager override workflow for discounts and price overrides
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Override types that can require manager approval
export const OVERRIDE_TYPES = {
  DISCOUNT_PERCENT: 'discount_percent',
  DISCOUNT_AMOUNT: 'discount_amount',
  PRICE_BELOW_MARGIN: 'price_below_margin',
  PRICE_BELOW_COST: 'price_below_cost',
  REFUND_OVERRIDE: 'refund_override',
  VOID_TRANSACTION: 'void_transaction',
  DRAWER_ADJUSTMENT: 'drawer_adjustment',
};

/**
 * Hook for managing manager approval workflow
 * @returns {object} Manager approval state and methods
 */
export function useManagerApproval() {
  // Modal state
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Current override request
  const [pendingOverride, setPendingOverride] = useState(null);

  // Approval result
  const [approvalResult, setApprovalResult] = useState(null);

  // Callback refs for resolve/reject
  const resolveRef = useRef(null);
  const rejectRef = useRef(null);

  /**
   * Check if an action requires manager approval
   * @param {string} overrideType - Type of override (from OVERRIDE_TYPES)
   * @param {number} value - The value to check (e.g., discount percentage)
   * @param {object} context - Additional context (productId, customerId, etc.)
   * @returns {Promise<object>} Check result with requiresApproval boolean
   */
  const checkRequiresApproval = useCallback(async (overrideType, value, context = {}) => {
    try {
      const response = await fetch(`${API_BASE}/api/manager-overrides/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideType,
          value,
          context,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to check approval requirement');
      }

      return data.data;
    } catch (err) {
      console.error('[ManagerApproval] Check failed:', err);
      return { requiresApproval: false, error: err.message };
    }
  }, []);

  /**
   * Check if a discount requires approval
   * @param {number} originalPrice - Original price in dollars
   * @param {number} discountedPrice - Discounted price in dollars
   * @param {number} quantity - Quantity of items
   * @param {number|null} cost - Cost per unit (optional)
   * @param {object} context - Additional context
   * @returns {Promise<object>} Check result
   */
  const checkDiscountApproval = useCallback(async (
    originalPrice,
    discountedPrice,
    quantity = 1,
    cost = null,
    context = {}
  ) => {
    try {
      const response = await fetch(`${API_BASE}/api/manager-overrides/check-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPrice,
          discountedPrice,
          quantity,
          cost,
          context,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to check discount approval');
      }

      return data.data;
    } catch (err) {
      console.error('[ManagerApproval] Discount check failed:', err);
      return { requiresApproval: false, error: err.message };
    }
  }, []);

  /**
   * Request manager approval (opens modal and returns promise)
   * @param {object} overrideDetails - Details about the override
   * @returns {Promise<object>} Resolves with approval result, rejects if cancelled
   */
  const requestApproval = useCallback((overrideDetails) => {
    return new Promise((resolve, reject) => {
      // Store resolve/reject for later
      resolveRef.current = resolve;
      rejectRef.current = reject;

      // Set pending override and open modal
      setPendingOverride({
        ...overrideDetails,
        requestedAt: new Date().toISOString(),
      });
      setApprovalResult(null);
      setError(null);
      setIsOpen(true);
    });
  }, []);

  /**
   * Verify manager PIN and approve override
   * @param {string} pin - Manager PIN
   * @returns {Promise<object>} Approval result
   */
  const verifyPin = useCallback(async (pin) => {
    if (!pendingOverride) {
      throw new Error('No pending override to approve');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/manager-overrides/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          overrideType: pendingOverride.overrideType,
          transactionId: pendingOverride.transactionId || null,
          quotationId: pendingOverride.quotationId || null,
          originalValue: pendingOverride.originalValue,
          overrideValue: pendingOverride.overrideValue,
          reason: pendingOverride.reason || null,
          productId: pendingOverride.productId || null,
          productName: pendingOverride.productName || null,
          quantity: pendingOverride.quantity || null,
          requiredLevel: pendingOverride.requiredLevel || 'manager',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle lockout or invalid PIN
        if (response.status === 401) {
          setError(data.error || 'Invalid PIN');

          if (data.lockedUntil) {
            setError(`Account locked until ${new Date(data.lockedUntil).toLocaleTimeString()}`);
          } else if (data.attemptsRemaining !== undefined) {
            setError(`Invalid PIN. ${data.attemptsRemaining} attempts remaining.`);
          }

          return { approved: false, error: data.error };
        }

        throw new Error(data.error || 'Approval failed');
      }

      if (!data.success || !data.approved) {
        const errorMsg = data.error || 'Approval denied';
        setError(errorMsg);
        return { approved: false, error: errorMsg };
      }

      // Approval successful
      const result = {
        approved: true,
        logId: data.data.logId,
        managerId: data.data.managerId,
        managerName: data.data.managerName,
        approvalLevel: data.data.approvalLevel,
      };

      setApprovalResult(result);

      // Resolve the promise after a brief delay to show success
      setTimeout(() => {
        setIsOpen(false);
        resolveRef.current?.(result);
        setPendingOverride(null);
      }, 1500);

      return result;
    } catch (err) {
      console.error('[ManagerApproval] Verify PIN failed:', err);
      setError(err.message);
      return { approved: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [pendingOverride]);

  /**
   * Cancel the current approval request
   */
  const cancelApproval = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setApprovalResult(null);

    // Reject the promise
    rejectRef.current?.({ cancelled: true });

    setPendingOverride(null);
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isOpen,
    isLoading,
    error,
    pendingOverride,
    approvalResult,

    // Methods
    checkRequiresApproval,
    checkDiscountApproval,
    requestApproval,
    verifyPin,
    cancelApproval,
    clearError,
  };
}

export default useManagerApproval;
