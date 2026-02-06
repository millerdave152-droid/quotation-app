/**
 * TeleTime POS - Volume Pricing Context
 *
 * Provides volume pricing state to cart components:
 * - Automatic price fetching when cart changes
 * - Next tier calculations
 * - Tier caching
 * - Integration with CartContext
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import { useCartContext } from './CartContext';
import { useVolumePricing } from '../hooks/useVolumePricing';

// ============================================================================
// CONTEXT
// ============================================================================

const VolumeContext = createContext(null);

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Volume pricing provider
 * Wraps cart components to provide volume pricing state
 */
export function VolumeProvider({ children }) {
  const cart = useCartContext();
  const customerId = cart.customer?.customerId || cart.customer?.customer_id || null;

  // Initialize volume pricing hook
  const volumePricing = useVolumePricing({
    customerId,
    cartItems: cart.items,
    autoFetch: true,
  });

  // State for next tier info per product
  const [nextTierInfoMap, setNextTierInfoMap] = useState({});

  // Cache for fetched tiers
  const tiersLoadingRef = useRef({});

  // ============================================================================
  // NEXT TIER CALCULATION
  // ============================================================================

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Store getNextTierInfo in ref to avoid stale closure issues
  const getNextTierInfoRef = useRef(volumePricing.getNextTierInfo);
  getNextTierInfoRef.current = volumePricing.getNextTierInfo;

  /**
   * Calculate next tier info for all cart items
   * FIXED: Uses ref to avoid stale closure and checks mounted state
   */
  useEffect(() => {
    const calculateNextTiers = async () => {
      const newNextTierMap = {};

      for (const item of cart.items) {
        // Check if still mounted before each async call
        if (!isMountedRef.current) return;

        try {
          // Use ref to get LATEST function reference
          const nextTier = await getNextTierInfoRef.current(
            item.productId,
            item.quantity
          );
          if (nextTier && isMountedRef.current) {
            newNextTierMap[item.productId] = nextTier;
          }
        } catch (err) {
          console.error(
            `[VolumeContext] Failed to get next tier for product ${item.productId}:`,
            err
          );
        }
      }

      // Only update state if still mounted
      if (isMountedRef.current) {
        setNextTierInfoMap(newNextTierMap);
      }
    };

    if (cart.items.length > 0) {
      calculateNextTiers();
    } else {
      setNextTierInfoMap({});
    }
  }, [cart.items]); // Removed volumePricing.getNextTierInfo - using ref instead

  // ============================================================================
  // TIER LOADING
  // ============================================================================

  /**
   * Load tiers for a product (for tooltip)
   */
  const loadTiersForProduct = useCallback(
    async (productId) => {
      // Prevent duplicate loads
      if (tiersLoadingRef.current[productId]) {
        return volumePricing.productTiers[productId] || [];
      }

      tiersLoadingRef.current[productId] = true;

      try {
        const tiers = await volumePricing.getProductTiers(productId);
        return tiers;
      } finally {
        tiersLoadingRef.current[productId] = false;
      }
    },
    [volumePricing]
  );

  // ============================================================================
  // GETTERS
  // ============================================================================

  /**
   * Get volume info for a specific product
   */
  const getVolumeInfoForItem = useCallback(
    (productId) => {
      return volumePricing.getVolumeInfoForProduct(productId);
    },
    [volumePricing]
  );

  /**
   * Get next tier info for a specific product
   */
  const getNextTierForItem = useCallback(
    (productId) => {
      return nextTierInfoMap[productId] || null;
    },
    [nextTierInfoMap]
  );

  /**
   * Get tiers for a specific product
   */
  const getTiersForItem = useCallback(
    (productId) => {
      return volumePricing.productTiers[productId] || [];
    },
    [volumePricing.productTiers]
  );

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Calculate adjusted totals with volume pricing
   */
  const volumeAdjustedTotals = useMemo(() => {
    let volumeSubtotal = 0;
    let volumeSavingsTotal = 0;
    let originalSubtotal = 0;

    cart.items.forEach((item) => {
      const volumeInfo = volumePricing.volumePrices[item.productId];
      const baseAmount = item.unitPrice * item.quantity;

      originalSubtotal += baseAmount;

      if (volumeInfo && volumeInfo.hasVolumeDiscount) {
        const volumeAmount = volumeInfo.unitPrice * item.quantity;
        volumeSubtotal += volumeAmount;
        volumeSavingsTotal += baseAmount - volumeAmount;
      } else {
        volumeSubtotal += baseAmount;
      }
    });

    // Apply item-level discounts
    let itemDiscountTotal = 0;
    cart.items.forEach((item) => {
      const volumeInfo = volumePricing.volumePrices[item.productId];
      const effectivePrice = volumeInfo?.hasVolumeDiscount
        ? volumeInfo.unitPrice
        : item.unitPrice;
      const lineAmount = effectivePrice * item.quantity;
      const itemDiscount = lineAmount * (item.discountPercent / 100);
      itemDiscountTotal += itemDiscount;
    });

    const subtotalAfterVolume = volumeSubtotal - itemDiscountTotal;
    const cartDiscount = cart.discount?.amount || 0;
    const subtotalAfterAllDiscounts = Math.max(0, subtotalAfterVolume - cartDiscount);

    // Total savings = volume + item + cart discounts
    const totalSavings = volumeSavingsTotal + itemDiscountTotal + cartDiscount;

    return {
      originalSubtotal: Math.round(originalSubtotal * 100) / 100,
      volumeSubtotal: Math.round(volumeSubtotal * 100) / 100,
      volumeSavingsTotal: Math.round(volumeSavingsTotal * 100) / 100,
      itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
      cartDiscount: Math.round(cartDiscount * 100) / 100,
      subtotalAfterAllDiscounts: Math.round(subtotalAfterAllDiscounts * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      hasVolumeSavings: volumeSavingsTotal > 0,
    };
  }, [cart.items, cart.discount, volumePricing.volumePrices]);

  /**
   * Items with volume info attached
   */
  const itemsWithVolumeInfo = useMemo(() => {
    return cart.items.map((item) => ({
      ...item,
      volumeInfo: volumePricing.volumePrices[item.productId] || null,
      nextTierInfo: nextTierInfoMap[item.productId] || null,
      tiers: volumePricing.productTiers[item.productId] || [],
    }));
  }, [cart.items, volumePricing.volumePrices, volumePricing.productTiers, nextTierInfoMap]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = {
    // State
    volumePrices: volumePricing.volumePrices,
    productTiers: volumePricing.productTiers,
    loading: volumePricing.loading,
    error: volumePricing.error,

    // Getters
    getVolumeInfoForItem,
    getNextTierForItem,
    getTiersForItem,

    // Actions
    loadTiersForProduct,
    refreshCartPrices: volumePricing.refreshCartPrices,
    clearCache: volumePricing.clearCache,

    // Computed
    volumeAdjustedTotals,
    itemsWithVolumeInfo,
    hasAnyVolumeDiscount: volumePricing.hasAnyVolumeDiscount,
    totalVolumeSavings: volumePricing.totalVolumeSavings,

    // Next tier map (for direct access)
    nextTierInfoMap,
  };

  return (
    <VolumeContext.Provider value={value}>{children}</VolumeContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access volume pricing context
 */
export function useVolumeContext() {
  const context = useContext(VolumeContext);
  if (!context) {
    throw new Error('useVolumeContext must be used within a VolumeProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if not in provider
 * Useful for components that may or may not have volume pricing
 */
export function useVolumeContextOptional() {
  return useContext(VolumeContext);
}

export default VolumeContext;
