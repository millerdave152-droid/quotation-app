/**
 * TeleTime POS - Warranty Upsell Hook
 * Manages the warranty upsell flow for multiple cart items
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import api from '../api/axios';

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

  // Refs to avoid stale closures in callbacks
  const selectedWarrantiesRef = useRef(selectedWarranties);
  selectedWarrantiesRef.current = selectedWarranties;
  const declinedItemsRef = useRef(declinedItems);
  declinedItemsRef.current = declinedItems;
  const eligibleItemsRef = useRef(eligibleItems);
  eligibleItemsRef.current = eligibleItems;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Guard against startFlow being called twice (React dev mode double-fires useEffect)
  const flowInProgressRef = useRef(false);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      // Filter out warranty items (SKU starts with WRN-) and zero-price items
      const eligibleCartItems = cartItems.filter(
        (item) => item.productId && !(item.sku && item.sku.startsWith('WRN-'))
      );

      if (eligibleCartItems.length === 0) {
        return [];
      }

      const products = eligibleCartItems.map((item) => ({
        productId: item.productId,
        price: item.unitPrice || item.unitCost || 0,
      }));

      console.log('[useWarrantyUpsell] Checking eligibility for', products.length, 'items:', products);

      const result = await api.post('/warranty/eligible', { products });

      console.log('[useWarrantyUpsell] API response:', { success: result.success, resultsCount: result.results?.length });

      // Check if component is still mounted before processing
      if (!isMountedRef.current) return [];

      if (result.success && result.results) {
        const eligible = [];

        result.results.forEach((r, index) => {
          const item = eligibleCartItems[index];
          console.log(`[useWarrantyUpsell] Product ${r.productId}: eligible=${r.eligible}, warranties=${r.warranties?.length}`);
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

        console.log('[useWarrantyUpsell] Total eligible items:', eligible.length);
        return eligible;
      }

      console.log('[useWarrantyUpsell] No results in response');
      return [];
    } catch (err) {
      console.error('[useWarrantyUpsell] Fetch error:', err);
      if (isMountedRef.current) {
        setError(err.message);
      }
      return [];
    }
  }, [cartItems]);

  /**
   * Start the upsell flow
   */
  const startFlow = useCallback(async () => {
    // Prevent double-execution (React dev mode double-fires useEffect)
    if (flowInProgressRef.current) {
      console.log('[useWarrantyUpsell] startFlow BLOCKED - already in progress');
      return;
    }
    flowInProgressRef.current = true;

    console.log('[useWarrantyUpsell] startFlow called, cartItems:', cartItems?.length);
    setIsLoading(true);
    setError(null);
    setCurrentIndex(0);
    setSelectedWarranties({});
    setDeclinedItems(new Set());

    try {
      const eligible = await fetchEligibility();
      console.log('[useWarrantyUpsell] startFlow result:', eligible.length, 'eligible items');
      setEligibleItems(eligible);

      if (eligible.length > 0) {
        console.log('[useWarrantyUpsell] Opening warranty modal');
        setIsOpen(true);
      } else {
        console.log('[useWarrantyUpsell] No eligible items, skipping warranty');
        // No eligible items, complete immediately
        onComplete?.({ warranties: {}, skipped: true });
      }
    } finally {
      setIsLoading(false);
      flowInProgressRef.current = false;
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
   * FIXED: Uses refs to avoid stale closure issues when rapidly selecting warranties
   */
  const addAndContinue = useCallback((warranty) => {
    selectWarranty(warranty);

    // Use refs to get LATEST values
    const currentEligibleItems = eligibleItemsRef.current;
    const currentIdx = currentIndexRef.current;
    const currentItemData = currentEligibleItems[currentIdx];
    const hasMore = currentIdx < currentEligibleItems.length - 1;

    if (hasMore) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Complete the flow - use refs for latest state
      const finalWarranties = {
        ...selectedWarrantiesRef.current,
        [currentItemData.cartItem.id]: {
          ...warranty,
          coveredItemId: currentItemData.cartItem.id,
          coveredProductName: currentItemData.productName,
          coveredProductPrice: currentItemData.productPrice,
        },
      };

      setIsOpen(false);
      onComplete?.({
        warranties: finalWarranties,
        declined: Array.from(declinedItemsRef.current),
        skipped: false,
      });
    }
  }, [selectWarranty, onComplete]);

  /**
   * Decline warranty for current item
   * FIXED: Uses refs to avoid stale closure issues
   */
  const declineAndContinue = useCallback(async () => {
    // Use refs to get LATEST values
    const currentEligibleItems = eligibleItemsRef.current;
    const currentIdx = currentIndexRef.current;
    const currentItemData = currentEligibleItems[currentIdx];

    if (!currentItemData) return;

    const itemId = currentItemData.cartItem.id;

    // Track decline
    setDeclinedItems((prev) => new Set([...prev, itemId]));

    // Send decline tracking to server
    try {
      await api.post('/warranty/decline', {
        productId: currentItemData.productId,
        warrantyOffered: currentItemData.warranties.map((w) => w.warrantyId),
        declineReason: 'customer_declined_modal',
      });
    } catch (err) {
      console.error('[useWarrantyUpsell] Decline tracking error:', err);
    }

    const hasMore = currentIdx < currentEligibleItems.length - 1;

    if (hasMore) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Complete the flow - use refs for latest state
      setIsOpen(false);
      onComplete?.({
        warranties: selectedWarrantiesRef.current,
        declined: Array.from(declinedItemsRef.current).concat(itemId),
        skipped: false,
      });
    }
  }, [onComplete]);

  /**
   * Skip entire upsell flow
   */
  const skipAll = useCallback(async () => {
    // Track all declines
    for (const item of eligibleItems) {
      try {
        await api.post('/warranty/decline', {
          productId: item.productId,
          warrantyOffered: item.warranties.map((w) => w.warrantyId),
          declineReason: 'customer_skipped_all',
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
