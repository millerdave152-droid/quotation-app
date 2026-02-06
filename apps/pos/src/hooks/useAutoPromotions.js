/**
 * TeleTime POS - useAutoPromotions Hook
 * Automatically detects applicable promotions when cart changes
 *
 * Features:
 * - Debounced API calls for performance
 * - Auto-apply best promotion
 * - Surface available promo codes to cashier
 * - Near-miss alerts for upselling opportunities
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const DEBOUNCE_MS = 500; // Debounce cart changes

/**
 * Hook for automatic promotion detection
 * @param {object} options
 * @param {Array} options.items - Cart items
 * @param {object} options.customer - Customer object
 * @param {number} options.subtotalCents - Cart subtotal in cents
 * @param {object} options.appliedPromotion - Currently applied promotion
 * @param {function} options.onAutoApply - Callback when auto-apply promotion found
 * @param {boolean} options.autoApplyEnabled - Whether to auto-apply best promotion
 * @returns {object} Promotion detection state
 */
export function useAutoPromotions({
  items = [],
  customer = null,
  subtotalCents = 0,
  appliedPromotion = null,
  onAutoApply = null,
  autoApplyEnabled = true,
}) {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoApplied, setAutoApplied] = useState([]);
  const [available, setAvailable] = useState([]);
  const [nearMiss, setNearMiss] = useState([]);
  const [bestAutoApply, setBestAutoApply] = useState(null);
  const [totalAutoDiscountCents, setTotalAutoDiscountCents] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);

  // Refs for debouncing
  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastCartHashRef = useRef('');

  /**
   * Generate a hash of the cart for change detection
   */
  const cartHash = useMemo(() => {
    const itemsHash = items
      .map((item) => `${item.productId}:${item.quantity}:${item.unitPrice || item.unitPriceCents}`)
      .sort()
      .join('|');
    const customerHash = customer?.id || 'guest';
    const promoHash = appliedPromotion?.id || 'none';
    return `${itemsHash}_${customerHash}_${subtotalCents}_${promoHash}`;
  }, [items, customer, subtotalCents, appliedPromotion]);

  /**
   * Check promotions from API
   */
  const checkPromotions = useCallback(async () => {
    // Skip if cart is empty
    if (!items || items.length === 0) {
      setAutoApplied([]);
      setAvailable([]);
      setNearMiss([]);
      setBestAutoApply(null);
      setTotalAutoDiscountCents(0);
      return;
    }

    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents || Math.round((item.unitPrice || 0) * 100),
          categoryId: item.categoryId || null,
          categoryName: item.categoryName || null,
          brandName: item.brandName || null,
          sku: item.sku || null,
        })),
        customer: customer
          ? {
              id: customer.customerId || customer.id,
              pricingTier: customer.pricingTier || customer.pricing_tier,
            }
          : null,
        subtotalCents: subtotalCents || 0,
        appliedPromotionId: appliedPromotion?.id || null,
      };

      const response = await fetch(`${API_BASE}/pos-promotions/engine/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to check promotions');
      }

      const { data } = result;

      // Update state
      setAutoApplied(data.autoApplied || []);
      setAvailable(data.available || []);
      setNearMiss(data.nearMiss || []);
      setBestAutoApply(data.bestAutoApply || null);
      setTotalAutoDiscountCents(data.totalAutoDiscountCents || 0);
      setLastChecked(new Date());

      // Auto-apply best promotion if enabled and not already applied
      if (
        autoApplyEnabled &&
        data.bestAutoApply &&
        !appliedPromotion &&
        onAutoApply
      ) {
        onAutoApply({
          id: data.bestAutoApply.id,
          name: data.bestAutoApply.name,
          promoType: data.bestAutoApply.promoType,
          discountAmount: data.bestAutoApply.discountCents / 100,
          discountCents: data.bestAutoApply.discountCents,
          description: data.bestAutoApply.discountDescription,
          isAutoApplied: true,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }
      console.error('[useAutoPromotions] Check error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [items, customer, subtotalCents, appliedPromotion, onAutoApply, autoApplyEnabled]);

  /**
   * Debounced check - triggered on cart changes
   */
  useEffect(() => {
    // Skip if cart hash hasn't changed
    if (cartHash === lastCartHashRef.current) {
      return;
    }
    lastCartHashRef.current = cartHash;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounced check
    debounceTimerRef.current = setTimeout(() => {
      checkPromotions();
    }, DEBOUNCE_MS);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [cartHash, checkPromotions]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    lastCartHashRef.current = ''; // Force refresh
    checkPromotions();
  }, [checkPromotions]);

  /**
   * Clear all promotion state
   */
  const clear = useCallback(() => {
    setAutoApplied([]);
    setAvailable([]);
    setNearMiss([]);
    setBestAutoApply(null);
    setTotalAutoDiscountCents(0);
    setError(null);
    lastCartHashRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Computed values
  const hasAutoApply = autoApplied.length > 0;
  const hasAvailableCodes = available.length > 0;
  const hasNearMiss = nearMiss.length > 0;
  const hasPromotions = hasAutoApply || hasAvailableCodes;

  return {
    // State
    isLoading,
    error,
    lastChecked,

    // Promotions
    autoApplied,
    available,
    nearMiss,
    bestAutoApply,
    totalAutoDiscountCents,

    // Computed
    hasAutoApply,
    hasAvailableCodes,
    hasNearMiss,
    hasPromotions,

    // Actions
    refresh,
    clear,
  };
}

export default useAutoPromotions;
