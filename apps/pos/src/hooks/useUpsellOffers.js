/**
 * TeleTime POS - Upsell Offers Hook
 * Manages upsell offer fetching, display timing, and result tracking
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api/axios';

// Storage keys
const DECLINED_SESSION_KEY = 'pos_declined_upsells_session';
const SHOWN_SESSION_KEY = 'pos_shown_upsells_session';

/**
 * Load declined offers from session storage
 */
const loadDeclinedOffers = () => {
  try {
    const stored = sessionStorage.getItem(DECLINED_SESSION_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

/**
 * Save declined offer to session storage
 */
const saveDeclinedOffer = (offerId) => {
  try {
    const current = loadDeclinedOffers();
    if (!current.includes(offerId)) {
      current.push(offerId);
      sessionStorage.setItem(DECLINED_SESSION_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.warn('[Upsell] Failed to save declined offer:', e);
  }
};

/**
 * Clear session declined offers (call on new transaction)
 */
const clearSessionDeclined = () => {
  try {
    sessionStorage.removeItem(DECLINED_SESSION_KEY);
    sessionStorage.removeItem(SHOWN_SESSION_KEY);
  } catch (e) {
    // Ignore
  }
};

/**
 * Generate unique session ID
 */
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Hook for managing upsell offers in checkout flow
 * @param {object} options
 * @param {object} options.cart - Cart data with items and totals
 * @param {object} options.customer - Customer data (optional)
 * @param {boolean} options.enabled - Enable fetching offers
 * @param {string} options.location - Display location ('checkout', 'cart', etc.)
 * @param {number} options.maxOffers - Maximum offers to show
 */
export function useUpsellOffers({
  cart,
  customer = null,
  enabled = true,
  location = 'checkout',
  maxOffers = 3,
} = {}) {
  const [offers, setOffers] = useState([]);
  const [currentOfferIndex, setCurrentOfferIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Services, membership, financing (fetched separately for dedicated prompts)
  const [services, setServices] = useState([]);
  const [membershipOffers, setMembershipOffers] = useState([]);
  const [financingOptions, setFinancingOptions] = useState([]);

  // Session tracking
  const sessionIdRef = useRef(generateSessionId());
  const declinedRef = useRef(loadDeclinedOffers());
  const offerTimingRef = useRef({}); // Track time spent on each offer
  const acceptedOffersRef = useRef([]);

  // Refs to avoid stale closures in callbacks
  const offersRef = useRef(offers);
  offersRef.current = offers;

  // Calculate cart value in cents
  const cartValueCents = useMemo(() => {
    return Math.round((cart?.total || cart?.subtotal || 0) * 100);
  }, [cart]);

  // Check if we should show financing (high-value carts)
  const shouldShowFinancing = cartValueCents >= 50000; // $500+

  /**
   * Fetch all upsell offers
   */
  const fetchOffers = useCallback(async () => {
    if (!enabled || !cart?.items?.length) {
      setOffers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch main upsell offers
      const response = await api.post('/upsell/offers', {
        cart: {
          items: cart.items,
          total: cart.total,
          subtotal: cart.subtotal,
        },
        customer: customer ? {
          id: customer.customerId || customer.customer_id || customer.id,
          type: customer.customerType,
        } : null,
        location,
        sessionId: sessionIdRef.current,
        maxOffers: maxOffers + 2, // Fetch extra to filter declined
        excludeShownOffers: declinedRef.current,
      });

      // Filter out declined offers
      const filteredOffers = (response.offers || []).filter(
        offer => !declinedRef.current.includes(offer.offerId)
      );

      setOffers(filteredOffers.slice(0, maxOffers));
      setCurrentOfferIndex(0);
    } catch (err) {
      console.error('[Upsell] Fetch offers error:', err);
      setError(err.message || 'Failed to load offers');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [cart, customer, enabled, location, maxOffers]);

  /**
   * Fetch service recommendations
   */
  const fetchServices = useCallback(async () => {
    if (!cart?.items?.length) {
      setServices([]);
      return;
    }

    try {
      const response = await api.post('/upsell/services', {
        cartItems: cart.items.map(item => ({
          productId: item.productId,
          categoryId: item.categoryId,
          quantity: item.quantity,
        })),
      });

      setServices(response.services || []);
    } catch (err) {
      console.error('[Upsell] Fetch services error:', err);
      setServices([]);
    }
  }, [cart]);

  /**
   * Fetch membership offers
   */
  const fetchMembershipOffers = useCallback(async () => {
    try {
      const response = await api.post('/upsell/membership-offers', {
        customer: customer ? {
          id: customer.customerId || customer.customer_id || customer.id,
        } : null,
        cartValueCents,
      });

      setMembershipOffers(response.offers || []);
    } catch (err) {
      console.error('[Upsell] Fetch membership error:', err);
      setMembershipOffers([]);
    }
  }, [customer, cartValueCents]);

  /**
   * Fetch financing options
   */
  const fetchFinancingOptions = useCallback(async () => {
    if (!shouldShowFinancing) {
      setFinancingOptions([]);
      return;
    }

    try {
      const response = await api.get(`/upsell/financing/${cartValueCents}`);
      setFinancingOptions(response.options || []);
    } catch (err) {
      console.error('[Upsell] Fetch financing error:', err);
      setFinancingOptions([]);
    }
  }, [cartValueCents, shouldShowFinancing]);

  // Fetch all on cart/customer change
  useEffect(() => {
    if (enabled) {
      fetchOffers();
      fetchServices();
      fetchMembershipOffers();
      if (shouldShowFinancing) {
        fetchFinancingOptions();
      }
    }
  }, [enabled, fetchOffers, fetchServices, fetchMembershipOffers, fetchFinancingOptions, shouldShowFinancing]);

  /**
   * Start tracking time for an offer
   */
  const startOfferTiming = useCallback((offerId) => {
    offerTimingRef.current[offerId] = {
      startTime: Date.now(),
      endTime: null,
    };
  }, []);

  /**
   * End tracking time for an offer
   */
  const endOfferTiming = useCallback((offerId) => {
    if (offerTimingRef.current[offerId]) {
      offerTimingRef.current[offerId].endTime = Date.now();
    }
  }, []);

  /**
   * Get time spent on an offer (in ms)
   */
  const getOfferTimeSpent = useCallback((offerId) => {
    const timing = offerTimingRef.current[offerId];
    if (!timing) return 0;
    const endTime = timing.endTime || Date.now();
    return endTime - timing.startTime;
  }, []);

  /**
   * Accept an offer
   */
  const acceptOffer = useCallback(async (offer, additionalData = {}) => {
    const offerId = offer.offerId || offer.id;

    // End timing
    endOfferTiming(offerId);
    const timeSpent = getOfferTimeSpent(offerId);

    // Track accepted offer
    acceptedOffersRef.current.push(offerId);

    try {
      // Record result
      await api.post('/upsell/result', {
        offerId,
        result: 'accepted',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        revenueAddedCents: additionalData.revenueAddedCents || offer.priceDifferenceCents || offer.priceCents,
        metadata: {
          timeSpentMs: timeSpent,
          ...additionalData.metadata,
        },
      });
    } catch (err) {
      console.error('[Upsell] Record accept error:', err);
    }

    // Move to next offer
    moveToNextOffer();

    return { success: true, offerId };
  }, [customer, endOfferTiming, getOfferTimeSpent]);

  /**
   * Decline an offer
   */
  const declineOffer = useCallback(async (offer, reason = null) => {
    const offerId = offer.offerId || offer.id;

    // End timing
    endOfferTiming(offerId);
    const timeSpent = getOfferTimeSpent(offerId);

    // Save to declined list
    saveDeclinedOffer(offerId);
    declinedRef.current = loadDeclinedOffers();

    try {
      // Record result
      await api.post('/upsell/result', {
        offerId,
        result: 'declined',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        declineReason: reason,
        metadata: {
          timeSpentMs: timeSpent,
        },
      });
    } catch (err) {
      console.error('[Upsell] Record decline error:', err);
    }

    // Remove from offers list
    setOffers(current => current.filter(o => (o.offerId || o.id) !== offerId));

    // Move to next offer
    moveToNextOffer();

    return { success: true, offerId };
  }, [customer, endOfferTiming, getOfferTimeSpent]);

  /**
   * Skip/ignore an offer (viewed but no action)
   */
  const skipOffer = useCallback(async (offer) => {
    const offerId = offer.offerId || offer.id;

    // End timing
    endOfferTiming(offerId);
    const timeSpent = getOfferTimeSpent(offerId);

    try {
      await api.post('/upsell/result', {
        offerId,
        result: 'ignored',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        metadata: {
          timeSpentMs: timeSpent,
        },
      });
    } catch (err) {
      // Silent fail
    }

    moveToNextOffer();
  }, [customer, endOfferTiming, getOfferTimeSpent]);

  /**
   * Move to the next offer in the queue
   * FIXED: Uses ref to get LATEST offers length, avoiding stale closure
   */
  const moveToNextOffer = useCallback(() => {
    setCurrentOfferIndex(current => {
      const next = current + 1;
      // Use ref to get current length, not stale closure value
      return next < offersRef.current.length ? next : current;
    });
  }, []);

  /**
   * Move to previous offer
   */
  const moveToPreviousOffer = useCallback(() => {
    setCurrentOfferIndex(current => Math.max(0, current - 1));
  }, []);

  /**
   * Accept a service add-on
   */
  const acceptService = useCallback(async (service) => {
    try {
      // Track service acceptance
      await api.post('/upsell/result', {
        offerId: service.serviceId,
        result: 'accepted',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        revenueAddedCents: service.priceCents,
        metadata: { type: 'service', serviceCode: service.code },
      });

      // Remove from services list
      setServices(current => current.filter(s => s.serviceId !== service.serviceId));
    } catch (err) {
      console.error('[Upsell] Accept service error:', err);
    }

    return { success: true, service };
  }, [customer]);

  /**
   * Decline a service
   */
  const declineService = useCallback((service) => {
    setServices(current => current.filter(s => s.serviceId !== service.serviceId));
  }, []);

  /**
   * Accept membership
   */
  const acceptMembership = useCallback(async (membership) => {
    try {
      await api.post('/upsell/result', {
        offerId: membership.program?.id,
        result: 'accepted',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        revenueAddedCents: membership.program?.annualFeeCents,
        metadata: { type: 'membership', programCode: membership.program?.code },
      });
    } catch (err) {
      console.error('[Upsell] Accept membership error:', err);
    }

    return { success: true, membership };
  }, [customer]);

  /**
   * Decline membership
   */
  const declineMembership = useCallback(() => {
    setMembershipOffers([]);
  }, []);

  /**
   * Select financing option
   */
  const selectFinancing = useCallback(async (financing) => {
    try {
      await api.post('/upsell/result', {
        offerId: financing.financingId,
        result: 'accepted',
        sessionId: sessionIdRef.current,
        customerId: customer?.customerId || customer?.customer_id || customer?.id,
        metadata: { type: 'financing', provider: financing.provider },
      });
    } catch (err) {
      console.error('[Upsell] Select financing error:', err);
    }

    return { success: true, financing };
  }, [customer]);

  /**
   * Reset session (call on new transaction)
   */
  const resetSession = useCallback(() => {
    clearSessionDeclined();
    sessionIdRef.current = generateSessionId();
    declinedRef.current = [];
    offerTimingRef.current = {};
    acceptedOffersRef.current = [];
    setOffers([]);
    setCurrentOfferIndex(0);
    setServices([]);
    setMembershipOffers([]);
    setFinancingOptions([]);
  }, []);

  /**
   * Refresh offers
   */
  const refresh = useCallback(() => {
    fetchOffers();
    fetchServices();
    fetchMembershipOffers();
    if (shouldShowFinancing) {
      fetchFinancingOptions();
    }
  }, [fetchOffers, fetchServices, fetchMembershipOffers, fetchFinancingOptions, shouldShowFinancing]);

  // Current offer
  const currentOffer = offers[currentOfferIndex] || null;

  // Has more offers
  const hasMoreOffers = currentOfferIndex < offers.length - 1;

  // All offers processed
  const allOffersProcessed = currentOfferIndex >= offers.length && offers.length > 0;

  return {
    // Main offers
    offers,
    currentOffer,
    currentOfferIndex,
    hasMoreOffers,
    allOffersProcessed,
    loading,
    error,

    // Additional offer types
    services,
    membershipOffers,
    financingOptions,

    // Derived state
    hasOffers: offers.length > 0,
    hasServices: services.length > 0,
    hasMembershipOffers: membershipOffers.length > 0,
    hasFinancingOptions: financingOptions.length > 0,
    shouldShowFinancing,

    // Navigation
    moveToNextOffer,
    moveToPreviousOffer,

    // Offer actions
    acceptOffer,
    declineOffer,
    skipOffer,
    startOfferTiming,
    endOfferTiming,
    getOfferTimeSpent,

    // Service actions
    acceptService,
    declineService,

    // Membership actions
    acceptMembership,
    declineMembership,

    // Financing actions
    selectFinancing,

    // Session management
    sessionId: sessionIdRef.current,
    acceptedOffers: acceptedOffersRef.current,
    resetSession,
    refresh,
  };
}

export default useUpsellOffers;
