/**
 * TeleTime POS - Suggestions Hook
 * Handles recommendation fetching, caching, and interaction tracking
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api/axios';

// Storage keys
const DECLINED_KEY = 'pos_declined_suggestions';
const SHOWN_KEY = 'pos_shown_suggestions_session';
const SESSION_TOUCHPOINT_KEY = 'pos_suggestion_touchpoint';

// Config
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_DECLINED_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Load declined suggestions from storage
 */
const loadDeclined = () => {
  try {
    const stored = localStorage.getItem(DECLINED_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      const now = Date.now();
      // Filter out old declines
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([, timestamp]) => now - timestamp < MAX_DECLINED_AGE)
      );
      return filtered;
    }
  } catch (e) {
    console.warn('[Suggestions] Failed to load declined:', e);
  }
  return {};
};

/**
 * Save declined suggestion
 */
const saveDeclined = (productId) => {
  try {
    const current = loadDeclined();
    current[productId] = Date.now();
    localStorage.setItem(DECLINED_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[Suggestions] Failed to save declined:', e);
  }
};

/**
 * Check if session touchpoint was already used
 */
const hasUsedTouchpoint = () => {
  try {
    return sessionStorage.getItem(SESSION_TOUCHPOINT_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Mark session touchpoint as used
 */
const markTouchpointUsed = () => {
  try {
    sessionStorage.setItem(SESSION_TOUCHPOINT_KEY, 'true');
  } catch (e) {
    console.warn('[Suggestions] Failed to mark touchpoint:', e);
  }
};

/**
 * Reset touchpoint for new transaction
 */
const resetTouchpoint = () => {
  try {
    sessionStorage.removeItem(SESSION_TOUCHPOINT_KEY);
  } catch (e) {
    // Ignore
  }
};

// Recommendation cache
const cache = new Map();

/**
 * Hook for product recommendations
 * @param {object} options
 * @param {number} options.productId - Single product ID for product-based suggestions
 * @param {Array} options.cartItems - Cart items for cart-based suggestions
 * @param {string} options.context - 'product', 'cart', 'checkout', 'bundle'
 * @param {number} options.limit - Max suggestions to return
 * @param {boolean} options.enabled - Whether to fetch recommendations
 * @param {boolean} options.filterDeclined - Filter out previously declined items
 * @param {number} options.customerId - Optional customer ID for personalized recommendations
 */
export function useSuggestions({
  productId = null,
  cartItems = [],
  context = 'cart',
  limit = 4,
  enabled = true,
  filterDeclined = true,
  customerId = null,
} = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track declined items
  const declinedRef = useRef(loadDeclined());

  // Track impression events
  const impressionSentRef = useRef(new Set());

  // Generate cache key
  const cacheKey = useMemo(() => {
    if (productId) {
      return `product:${productId}:${limit}`;
    }
    if (cartItems.length > 0) {
      const ids = cartItems.map((i) => i.productId).sort().join(',');
      return `cart:${ids}:${context}:${limit}`;
    }
    return null;
  }, [productId, cartItems, context, limit]);

  /**
   * Fetch recommendations from API
   */
  const fetchSuggestions = useCallback(async () => {
    if (!enabled || (!productId && cartItems.length === 0)) {
      setSuggestions([]);
      setBundles([]);
      return;
    }

    // Check cache
    if (cacheKey && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        applySuggestions(cached.data);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      let response;

      if (productId) {
        // Product-based recommendations
        response = await api.get(`/recommendations/product/${productId}`, {
          params: { limit: limit + 5, context },
        });
      } else if (context === 'checkout') {
        // Cross-sell for checkout
        response = await api.post('/recommendations/cross-sell', {
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          customerId,
          limit: limit + 5,
        });
      } else {
        // Cart-based recommendations
        response = await api.post('/recommendations/cart', {
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          customerId,
          limit: limit + 5,
        });
      }

      // Cache the response
      if (cacheKey) {
        cache.set(cacheKey, {
          data: response,
          timestamp: Date.now(),
        });
      }

      applySuggestions(response);
    } catch (err) {
      console.error('[Suggestions] Fetch error:', err);
      setError(err.message || 'Failed to load suggestions');
      setSuggestions([]);
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [productId, cartItems, context, limit, enabled, cacheKey, customerId]);

  /**
   * Apply suggestions with filtering
   */
  const applySuggestions = useCallback(
    (response) => {
      let items = response?.recommendations || response?.suggestions || response?.products || [];
      let bundleItems = response?.bundles || [];

      // Filter out declined items
      if (filterDeclined) {
        const declined = declinedRef.current;
        items = items.filter((item) => !declined[item.productId || item.product_id]);
        bundleItems = bundleItems.filter((bundle) => {
          // Filter bundles where all products are declined
          const productIds = bundle.products?.map((p) => p.productId || p.product_id) || [];
          return !productIds.every((id) => declined[id]);
        });
      }

      // Filter out items already in cart
      if (cartItems.length > 0) {
        const cartProductIds = new Set(cartItems.map((i) => i.productId));
        items = items.filter((item) => !cartProductIds.has(item.productId || item.product_id));
      }

      // Apply limit
      items = items.slice(0, limit);
      bundleItems = bundleItems.slice(0, 2);

      setSuggestions(items);
      setBundles(bundleItems);
    },
    [filterDeclined, cartItems, limit]
  );

  // Fetch on dependency changes
  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  /**
   * Track impression event
   */
  const trackImpression = useCallback(
    async (productIds) => {
      const newImpressions = productIds.filter(
        (id) => !impressionSentRef.current.has(id)
      );

      if (newImpressions.length === 0) return;

      newImpressions.forEach((id) => impressionSentRef.current.add(id));

      try {
        await api.post('/recommendations/events', {
          type: 'impression',
          productIds: newImpressions,
          context,
          sourceProductId: productId,
          cartProductIds: cartItems.map((i) => i.productId),
        });
      } catch (e) {
        // Silent fail for analytics
      }
    },
    [context, productId, cartItems]
  );

  /**
   * Track click event
   */
  const trackClick = useCallback(
    async (clickedProductId) => {
      try {
        await api.post('/recommendations/events', {
          type: 'click',
          productIds: [clickedProductId],
          context,
          sourceProductId: productId,
          cartProductIds: cartItems.map((i) => i.productId),
        });
      } catch (e) {
        // Silent fail for analytics
      }
    },
    [context, productId, cartItems]
  );

  /**
   * Track add to cart event
   */
  const trackAdd = useCallback(
    async (addedProductId) => {
      try {
        await api.post('/recommendations/events', {
          type: 'add_to_cart',
          productIds: [addedProductId],
          context,
          sourceProductId: productId,
          cartProductIds: cartItems.map((i) => i.productId),
        });
      } catch (e) {
        // Silent fail for analytics
      }
    },
    [context, productId, cartItems]
  );

  /**
   * Track conversion (purchase completed)
   */
  const trackConversion = useCallback(
    async (purchasedProductIds) => {
      try {
        await api.post('/recommendations/events', {
          type: 'conversion',
          productIds: purchasedProductIds,
          context,
          sourceProductId: productId,
          cartProductIds: cartItems.map((i) => i.productId),
        });
      } catch (e) {
        // Silent fail for analytics
      }
    },
    [context, productId, cartItems]
  );

  /**
   * Decline/dismiss a suggestion
   */
  const declineSuggestion = useCallback((declinedProductId) => {
    saveDeclined(declinedProductId);
    declinedRef.current[declinedProductId] = Date.now();

    // Remove from current suggestions
    setSuggestions((current) =>
      current.filter((s) => (s.productId || s.product_id) !== declinedProductId)
    );
  }, []);

  /**
   * Clear all declined suggestions
   */
  const clearDeclined = useCallback(() => {
    localStorage.removeItem(DECLINED_KEY);
    declinedRef.current = {};
  }, []);

  /**
   * Refresh suggestions (force fetch)
   */
  const refresh = useCallback(() => {
    if (cacheKey) {
      cache.delete(cacheKey);
    }
    fetchSuggestions();
  }, [cacheKey, fetchSuggestions]);

  return {
    // Data
    suggestions,
    bundles,
    loading,
    error,
    hasSuggestions: suggestions.length > 0,
    hasBundles: bundles.length > 0,

    // Actions
    refresh,
    declineSuggestion,
    clearDeclined,

    // Tracking
    trackImpression,
    trackClick,
    trackAdd,
    trackConversion,

    // Touchpoint management (for "don't be annoying" feature)
    hasUsedTouchpoint,
    markTouchpointUsed,
    resetTouchpoint,
  };
}

/**
 * Hook for cross-sell suggestions specifically at checkout
 * Returns margin data for staff visibility
 */
export function useCrossSell({
  cartItems = [],
  customerId = null,
  enabled = true,
  limit = 3,
} = {}) {
  const [crossSells, setCrossSells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    if (!enabled || cartItems.length === 0) {
      setCrossSells([]);
      return;
    }

    const fetchCrossSell = async () => {
      setLoading(true);
      try {
        const response = await api.post('/recommendations/cross-sell', {
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          customerId,
          limit,
        });

        // Check if component is still mounted before updating state
        if (!isMounted) return;

        const items = response?.crossSells || response?.products || [];

        // Filter out items already in cart
        const cartProductIds = new Set(cartItems.map((i) => i.productId));
        const filtered = items.filter(
          (item) => !cartProductIds.has(item.productId || item.product_id)
        );

        setCrossSells(filtered);
      } catch (err) {
        if (!isMounted) return;
        console.error('[CrossSell] Fetch error:', err);
        setError(err.message);
        setCrossSells([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCrossSell();

    return () => {
      isMounted = false;
    };
  }, [cartItems, customerId, enabled, limit]);

  return {
    crossSells,
    loading,
    error,
    hasCrossSells: crossSells.length > 0,
  };
}

/**
 * Hook for smart bundle suggestions
 */
export function useBundles({
  cartItems = [],
  enabled = true,
} = {}) {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!enabled || cartItems.length === 0) {
      setBundles([]);
      return;
    }

    const fetchBundles = async () => {
      setLoading(true);
      try {
        const response = await api.post('/recommendations/cart', {
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          includeBundles: true,
          limit: 10,
        });

        // Check if component is still mounted before updating state
        if (!isMounted) return;

        // Look for bundle opportunities
        const suggestions = response?.recommendations || [];
        const bundleOpportunities = [];

        // Group by relationship type to find bundle-worthy items
        const accessories = suggestions.filter((s) => s.relationship_type === 'accessory');

        if (accessories.length >= 2) {
          // Calculate bundle pricing
          const bundleItems = accessories.slice(0, 3);
          const totalPrice = bundleItems.reduce((sum, item) => {
            return sum + parseFloat(item.price || item.unitPrice || 0);
          }, 0);

          // 10% bundle discount
          const bundlePrice = totalPrice * 0.9;
          const savings = totalPrice - bundlePrice;

          if (savings > 5) { // Only show if savings > $5
            bundleOpportunities.push({
              id: `bundle_${Date.now()}`,
              name: 'Complete Setup Bundle',
              products: bundleItems,
              originalPrice: totalPrice,
              bundlePrice,
              savings,
              savingsPercent: 10,
            });
          }
        }

        setBundles(bundleOpportunities);
      } catch (err) {
        if (!isMounted) return;
        console.error('[Bundles] Fetch error:', err);
        setBundles([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBundles();

    return () => {
      isMounted = false;
    };
  }, [cartItems, enabled]);

  return {
    bundles,
    loading,
    hasBundles: bundles.length > 0,
  };
}

export default useSuggestions;
