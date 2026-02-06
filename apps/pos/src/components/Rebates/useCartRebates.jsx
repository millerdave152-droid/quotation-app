/**
 * TeleTime POS - Cart Rebates Hook
 * Manages rebate fetching, application, and tracking
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * useCartRebates Hook
 * Fetches and manages rebates for cart items
 *
 * @param {Array} cartItems - Cart items with productId and quantity
 * @param {Object} options - Configuration options
 * @returns {Object} Rebate state and methods
 */
export function useCartRebates(cartItems = [], options = {}) {
  const {
    autoFetch = true,
    autoApplyInstant = true,
    debounceMs = 300,
  } = options;

  // State
  const [rebateData, setRebateData] = useState({
    instantRebates: [],
    mailInRebates: [],
    onlineRebates: [],
    totalInstantSavings: 0,
    totalMailInSavings: 0,
    totalOnlineSavings: 0,
    totalPotentialSavings: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appliedRebates, setAppliedRebates] = useState(new Set());
  const [showMailInModal, setShowMailInModal] = useState(false);

  // Memoize cart item IDs for dependency tracking
  const cartItemsKey = useMemo(() => {
    return cartItems
      .map(item => `${item.productId || item.product_id}:${item.quantity || 1}`)
      .sort()
      .join(',');
  }, [cartItems]);

  /**
   * Fetch rebates for cart items
   */
  const fetchRebates = useCallback(async () => {
    if (!cartItems || cartItems.length === 0) {
      setRebateData({
        instantRebates: [],
        mailInRebates: [],
        onlineRebates: [],
        totalInstantSavings: 0,
        totalMailInSavings: 0,
        totalOnlineSavings: 0,
        totalPotentialSavings: 0,
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem('pos_token');

      // Format cart items for API
      const formattedItems = cartItems.map(item => ({
        productId: item.productId || item.product_id,
        quantity: item.quantity || 1,
      }));

      const response = await fetch(`${API_BASE}/rebates/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cartItems: formattedItems }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch rebates');
      }

      const data = await response.json();

      // Mark instant rebates as applied if autoApply is enabled
      if (autoApplyInstant && data.instantRebates) {
        data.instantRebates = data.instantRebates.map(rebate => ({
          ...rebate,
          applied: true,
        }));

        // Track applied rebate IDs
        const newApplied = new Set(data.instantRebates.map(r => r.rebateId));
        setAppliedRebates(newApplied);
      }

      setRebateData(data);
    } catch (err) {
      console.error('[useCartRebates] Error fetching rebates:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [cartItemsKey, autoApplyInstant]);

  // Auto-fetch when cart changes
  useEffect(() => {
    if (!autoFetch) return;

    const timeoutId = setTimeout(fetchRebates, debounceMs);
    return () => clearTimeout(timeoutId);
  }, [cartItemsKey, autoFetch, debounceMs, fetchRebates]);

  /**
   * Apply an instant rebate to the cart
   */
  const applyInstantRebate = useCallback(async (rebateId, productId) => {
    try {
      const token = localStorage.getItem('pos_token');

      const response = await fetch(`${API_BASE}/rebates/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rebateId, productId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to apply rebate');
      }

      const result = await response.json();

      // Update state
      setAppliedRebates(prev => new Set([...prev, rebateId]));

      // Update rebate data to mark as applied
      setRebateData(prev => ({
        ...prev,
        instantRebates: prev.instantRebates.map(r =>
          r.rebateId === rebateId ? { ...r, applied: true } : r
        ),
      }));

      return result;
    } catch (err) {
      console.error('[useCartRebates] Error applying rebate:', err);
      throw err;
    }
  }, []);

  /**
   * Remove an instant rebate from the cart
   */
  const removeInstantRebate = useCallback(async (rebateId) => {
    try {
      const token = localStorage.getItem('pos_token');

      const response = await fetch(`${API_BASE}/rebates/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rebateId }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove rebate');
      }

      // Update state
      setAppliedRebates(prev => {
        const next = new Set(prev);
        next.delete(rebateId);
        return next;
      });

      // Update rebate data
      setRebateData(prev => ({
        ...prev,
        instantRebates: prev.instantRebates.map(r =>
          r.rebateId === rebateId ? { ...r, applied: false } : r
        ),
        totalInstantSavings: prev.totalInstantSavings - (
          prev.instantRebates.find(r => r.rebateId === rebateId)?.amount || 0
        ),
      }));
    } catch (err) {
      console.error('[useCartRebates] Error removing rebate:', err);
      throw err;
    }
  }, []);

  /**
   * Create claims for mail-in/online rebates after order completion
   */
  const createRebateClaims = useCallback(async (orderId, customerId) => {
    const allMailIn = [...rebateData.mailInRebates, ...rebateData.onlineRebates];

    if (allMailIn.length === 0) {
      return [];
    }

    const claims = [];
    const token = localStorage.getItem('pos_token');

    for (const rebate of allMailIn) {
      try {
        const response = await fetch(`${API_BASE}/rebates/claim`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            rebateId: rebate.rebateId,
            customerId,
          }),
        });

        if (response.ok) {
          const claim = await response.json();
          claims.push(claim);
        }
      } catch (err) {
        console.error(`[useCartRebates] Error creating claim for rebate ${rebate.rebateId}:`, err);
      }
    }

    return claims;
  }, [rebateData.mailInRebates, rebateData.onlineRebates]);

  /**
   * Get rebates for a specific product
   */
  const getProductRebates = useCallback((productId) => {
    const instant = rebateData.instantRebates.filter(r => r.productId === productId);
    const mailIn = rebateData.mailInRebates.filter(r => r.productId === productId);
    const online = rebateData.onlineRebates.filter(r => r.productId === productId);

    return {
      instantRebates: instant,
      mailInRebates: mailIn,
      onlineRebates: online,
      hasRebates: instant.length > 0 || mailIn.length > 0 || online.length > 0,
      totalInstant: instant.reduce((sum, r) => sum + r.amount, 0),
      totalMailIn: mailIn.reduce((sum, r) => sum + r.amount, 0) + online.reduce((sum, r) => sum + r.amount, 0),
    };
  }, [rebateData]);

  /**
   * Check if a rebate is applied
   */
  const isRebateApplied = useCallback((rebateId) => {
    return appliedRebates.has(rebateId);
  }, [appliedRebates]);

  /**
   * Get applied instant rebates total
   */
  const appliedTotal = useMemo(() => {
    return rebateData.instantRebates
      .filter(r => r.applied)
      .reduce((sum, r) => sum + r.amount, 0);
  }, [rebateData.instantRebates]);

  /**
   * Get summary for checkout
   */
  const checkoutSummary = useMemo(() => ({
    appliedRebates: rebateData.instantRebates.filter(r => r.applied),
    pendingMailIn: [...rebateData.mailInRebates, ...rebateData.onlineRebates],
    totalApplied: appliedTotal,
    totalPending: rebateData.totalMailInSavings + rebateData.totalOnlineSavings,
  }), [rebateData, appliedTotal]);

  return {
    // State
    ...rebateData,
    isLoading,
    error,
    appliedRebates: Array.from(appliedRebates),
    showMailInModal,

    // Computed
    appliedTotal,
    checkoutSummary,
    hasRebates: rebateData.instantRebates.length > 0 ||
                rebateData.mailInRebates.length > 0 ||
                rebateData.onlineRebates.length > 0,

    // Methods
    fetchRebates,
    applyInstantRebate,
    removeInstantRebate,
    createRebateClaims,
    getProductRebates,
    isRebateApplied,
    setShowMailInModal,

    // Refresh
    refresh: fetchRebates,
  };
}

export default useCartRebates;
