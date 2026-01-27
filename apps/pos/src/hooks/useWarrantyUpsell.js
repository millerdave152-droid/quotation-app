/**
 * TeleTime POS - Warranty Upsell Hook
 * Manages the warranty upsell flow for multiple cart items
 */

import { useState, useCallback, useMemo, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Hook to manage warranty upsell flow
 * @param {object} options
 * @param {Array} options.cartItems - Items in the cart
 * @param {Function} options.onAddWarranty - Callback when warranty is added
 * @param {Function} options.onComplete - Callback when flow is complete
 */
export function useWarrantyUpsell({
  cartItems = [],
  onAddWarranty,
  onComplete,
}) {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibleItems, setEligibleItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedWarranties, setSelectedWarranties] = useState({});
  const [declinedItems, setDeclinedItems] = useState(new Set());
  const [error, setError] = useState(null);

  // Current item being shown
  const currentItem = useMemo(() => {
    return eligibleItems[currentIndex] || null;
  }, [eligibleItems, currentIndex]);

  // Progress info
  const progress = useMemo(() => ({
    current: currentIndex + 1,
    total: eligibleItems.length,
    hasMore: currentIndex < eligibleItems.length - 1,
    isLast: currentIndex === eligibleItems.length - 1,
  }), [currentIndex, eligibleItems.length]);

  // Summary of selections
  const summary = useMemo(() => {
    const warranties = Object.values(selectedWarranties);
    return {
      count: warranties.length,
      totalValue: warranties.reduce((sum, w) => sum + (w?.price || 0), 0),
      items: warranties,
    };
  }, [selectedWarranties]);

  /**
   * Fetch eligible warranties for all cart items
   */
  const fetchEligibility = useCallback(async () => {
    if (!cartItems || cartItems.length === 0) {
      return [];
    }

    try {
      const products = cartItems.map((item) => ({
        productId: item.productId,
        price: item.unitPrice,
      }));

      const response = await fetch(`${API_BASE}/warranty/eligible`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ products }),
      });

      const result = await response.json();

      if (result.success && result.results) {
        const eligible = [];

        result.results.forEach((r, index) => {
          const item = cartItems[index];
          if (r.eligible && r.warranties && r.warranties.length > 0) {
            eligible.push({
              cartItem: item,
              productId: r.productId,
              productName: r.productName,
              productPrice: r.productPrice,
              warranties: r.warranties,
              suggestedScript: r.suggestedScript,
            });
          }
        });

        return eligible;
      }

      return [];
    } catch (err) {
      console.error('[useWarrantyUpsell] Fetch error:', err);
      setError(err.message);
      return [];
    }
  }, [cartItems]);

  /**
   * Start the upsell flow
   */
  const startFlow = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCurrentIndex(0);
    setSelectedWarranties({});
    setDeclinedItems(new Set());

    try {
      const eligible = await fetchEligibility();
      setEligibleItems(eligible);

      if (eligible.length > 0) {
        setIsOpen(true);
      } else {
        // No eligible items, complete immediately
        onComplete?.({ warranties: {}, skipped: true });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchEligibility, onComplete]);

  /**
   * Select a warranty for the current item
   */
  const selectWarranty = useCallback((warranty) => {
    if (!currentItem) return;

    const itemId = currentItem.cartItem.id;

    setSelectedWarranties((prev) => ({
      ...prev,
      [itemId]: {
        ...warranty,
        coveredItemId: itemId,
        coveredProductName: currentItem.productName,
        coveredProductPrice: currentItem.productPrice,
      },
    }));

    // Notify parent
    onAddWarranty?.({
      itemId,
      warranty,
      productName: currentItem.productName,
    });
  }, [currentItem, onAddWarranty]);

  /**
   * Add warranty and move to next item
   */
  const addAndContinue = useCallback((warranty) => {
    selectWarranty(warranty);

    if (progress.hasMore) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Complete the flow
      const finalWarranties = {
        ...selectedWarranties,
        [currentItem.cartItem.id]: {
          ...warranty,
          coveredItemId: currentItem.cartItem.id,
          coveredProductName: currentItem.productName,
          coveredProductPrice: currentItem.productPrice,
        },
      };

      setIsOpen(false);
      onComplete?.({
        warranties: finalWarranties,
        declined: Array.from(declinedItems),
        skipped: false,
      });
    }
  }, [selectWarranty, progress, currentItem, selectedWarranties, declinedItems, onComplete]);

  /**
   * Decline warranty for current item
   */
  const declineAndContinue = useCallback(async () => {
    if (!currentItem) return;

    const itemId = currentItem.cartItem.id;

    // Track decline
    setDeclinedItems((prev) => new Set([...prev, itemId]));

    // Send decline tracking to server
    try {
      await fetch(`${API_BASE}/warranty/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          productId: currentItem.productId,
          warrantyOffered: currentItem.warranties.map((w) => w.warrantyId),
          declineReason: 'customer_declined_modal',
        }),
      });
    } catch (err) {
      console.error('[useWarrantyUpsell] Decline tracking error:', err);
    }

    if (progress.hasMore) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Complete the flow
      setIsOpen(false);
      onComplete?.({
        warranties: selectedWarranties,
        declined: Array.from(declinedItems).concat(itemId),
        skipped: false,
      });
    }
  }, [currentItem, progress, selectedWarranties, declinedItems, onComplete]);

  /**
   * Skip entire upsell flow
   */
  const skipAll = useCallback(async () => {
    // Track all declines
    for (const item of eligibleItems) {
      try {
        await fetch(`${API_BASE}/warranty/decline`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            productId: item.productId,
            warrantyOffered: item.warranties.map((w) => w.warrantyId),
            declineReason: 'customer_skipped_all',
          }),
        });
      } catch (err) {
        console.error('[useWarrantyUpsell] Skip tracking error:', err);
      }
    }

    setIsOpen(false);
    onComplete?.({
      warranties: {},
      declined: eligibleItems.map((i) => i.cartItem.id),
      skipped: true,
    });
  }, [eligibleItems, onComplete]);

  /**
   * Go back to previous item
   */
  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  /**
   * Close modal without completing
   */
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  /**
   * Check if upsell should be shown
   */
  const shouldShowUpsell = useCallback(async () => {
    const eligible = await fetchEligibility();
    return eligible.length > 0;
  }, [fetchEligibility]);

  return {
    // State
    isOpen,
    isLoading,
    error,
    currentItem,
    progress,
    summary,
    selectedWarranties,
    eligibleItems,

    // Actions
    startFlow,
    selectWarranty,
    addAndContinue,
    declineAndContinue,
    skipAll,
    goBack,
    close,
    shouldShowUpsell,

    // Helpers
    hasEligibleItems: eligibleItems.length > 0,
    isComplete: currentIndex >= eligibleItems.length,
  };
}

export default useWarrantyUpsell;
