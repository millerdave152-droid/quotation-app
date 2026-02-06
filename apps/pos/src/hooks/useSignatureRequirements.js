/**
 * TeleTime POS - Signature Requirements Hook
 * Determines when signatures are required based on order context
 */

import { useState, useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Default signature requirements (client-side fallback)
 * These can be overridden by server configuration
 */
const DEFAULT_REQUIREMENTS = {
  // Value threshold for purchase acknowledgment
  purchaseValueThreshold: 500,

  // Always require for deliveries
  deliverySignatureRequired: true,

  // Always require for trade-ins
  tradeInSignatureRequired: true,

  // Always require for financing
  financingSignatureRequired: true,

  // Allow deferring delivery signature ("sign upon delivery")
  allowDeferredDeliverySignature: true,
};

/**
 * Signature requirement types
 */
export const SIGNATURE_TYPES = {
  DELIVERY: 'delivery',
  PURCHASE: 'purchase',
  TRADE_IN: 'trade_in',
  FINANCING: 'financing',
};

/**
 * Check signature requirements for an order
 * @param {object} options - Order context
 * @returns {object} Signature requirements and helpers
 */
export function useSignatureRequirements({
  orderTotal = 0,
  fulfillmentType = 'pickup_now',
  hasTradeIn = false,
  hasFinancing = false,
  customerId = null,
  config = {},
}) {
  const [capturedSignatures, setCapturedSignatures] = useState({});
  const [deferredSignatures, setDeferredSignatures] = useState({});
  const [loading, setLoading] = useState(false);

  // Merge default config with provided config
  const requirements = useMemo(() => ({
    ...DEFAULT_REQUIREMENTS,
    ...config,
  }), [config]);

  /**
   * Calculate required signatures based on order context
   */
  const requiredSignatures = useMemo(() => {
    const required = [];

    // 1. Delivery signature - required for delivery/shipping orders
    if (requirements.deliverySignatureRequired) {
      if (fulfillmentType === 'local_delivery' || fulfillmentType === 'shipping') {
        required.push({
          type: SIGNATURE_TYPES.DELIVERY,
          title: 'Delivery Confirmation',
          subtitle: 'Customer signature for delivery receipt',
          legalText: 'I acknowledge receipt of the above items in satisfactory condition. I understand that by signing, I am confirming the delivery and accepting responsibility for the merchandise.',
          termsVersion: 'v2024.1',
          canDefer: requirements.allowDeferredDeliverySignature,
          deferLabel: 'Customer will sign upon delivery',
          priority: 1,
        });
      }
    }

    // 2. High-value purchase acknowledgment
    if (orderTotal >= requirements.purchaseValueThreshold) {
      required.push({
        type: SIGNATURE_TYPES.PURCHASE,
        title: 'Purchase Acknowledgment',
        subtitle: `Signature required for purchases over $${requirements.purchaseValueThreshold}`,
        legalText: 'I acknowledge this purchase and confirm that I have reviewed the items, pricing, and return policy. I understand the total amount will be charged to my selected payment method.',
        termsVersion: 'v2024.1',
        canDefer: false,
        priority: 2,
      });
    }

    // 3. Trade-in acceptance
    if (hasTradeIn && requirements.tradeInSignatureRequired) {
      required.push({
        type: SIGNATURE_TYPES.TRADE_IN,
        title: 'Trade-In Agreement',
        subtitle: 'Confirm ownership and accept trade-in value',
        legalText: `TRADE-IN AGREEMENT

I, the undersigned, hereby certify that:
1. I am the legal owner of the device(s) being traded in
2. The device(s) are not stolen, lost, or subject to any claims
3. The device(s) are not under lease or financing agreement
4. I have removed all personal data and accounts from the device
5. I accept the assessed trade-in value as final

I hereby transfer all ownership rights to the receiving party.`,
        termsVersion: 'v2024.1',
        canDefer: false,
        priority: 3,
      });
    }

    // 4. Financing agreement
    if (hasFinancing && requirements.financingSignatureRequired) {
      required.push({
        type: SIGNATURE_TYPES.FINANCING,
        title: 'Financing Agreement',
        subtitle: 'Accept financing terms and payment schedule',
        legalText: `FINANCING AGREEMENT

I acknowledge and agree to the following:
1. The total financed amount and payment schedule as presented
2. The applicable interest rate and any fees
3. The terms for early payoff without penalty
4. My responsibility to make timely payments
5. The consequences of missed or late payments

I authorize the scheduled payments from my selected payment method.`,
        termsVersion: 'v2024.1',
        canDefer: false,
        priority: 4,
      });
    }

    // Sort by priority
    return required.sort((a, b) => a.priority - b.priority);
  }, [orderTotal, fulfillmentType, hasTradeIn, hasFinancing, requirements]);

  /**
   * Get pending signatures (required but not yet captured or deferred)
   */
  const pendingSignatures = useMemo(() => {
    return requiredSignatures.filter(req => {
      const isCaptured = capturedSignatures[req.type];
      const isDeferred = deferredSignatures[req.type];
      return !isCaptured && !isDeferred;
    });
  }, [requiredSignatures, capturedSignatures, deferredSignatures]);

  /**
   * Check if all required signatures are complete
   */
  const isComplete = useMemo(() => {
    return pendingSignatures.length === 0;
  }, [pendingSignatures]);

  /**
   * Check if any signatures are required
   */
  const hasRequirements = useMemo(() => {
    return requiredSignatures.length > 0;
  }, [requiredSignatures]);

  /**
   * Get next pending signature requirement
   */
  const nextRequired = useMemo(() => {
    return pendingSignatures[0] || null;
  }, [pendingSignatures]);

  /**
   * Record a captured signature
   */
  const recordSignature = useCallback((type, signatureData) => {
    setCapturedSignatures(prev => ({
      ...prev,
      [type]: signatureData,
    }));
  }, []);

  /**
   * Defer a signature (to be captured later, e.g., upon delivery)
   */
  const deferSignature = useCallback((type) => {
    setDeferredSignatures(prev => ({
      ...prev,
      [type]: {
        deferred: true,
        deferredAt: new Date().toISOString(),
      },
    }));
  }, []);

  /**
   * Clear a specific signature
   */
  const clearSignature = useCallback((type) => {
    setCapturedSignatures(prev => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    setDeferredSignatures(prev => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  }, []);

  /**
   * Reset all signatures
   */
  const reset = useCallback(() => {
    setCapturedSignatures({});
    setDeferredSignatures({});
  }, []);

  /**
   * Get all signature data for saving with order
   */
  const getSignatureData = useCallback(() => {
    return {
      captured: capturedSignatures,
      deferred: deferredSignatures,
      requirements: requiredSignatures.map(r => ({
        type: r.type,
        title: r.title,
        termsVersion: r.termsVersion,
      })),
    };
  }, [capturedSignatures, deferredSignatures, requiredSignatures]);

  /**
   * Save all captured signatures to server
   */
  const saveSignatures = useCallback(async (orderId, transactionId) => {
    setLoading(true);

    try {
      const results = [];

      for (const [type, data] of Object.entries(capturedSignatures)) {
        const requirement = requiredSignatures.find(r => r.type === type);

        const response = await fetch(`${API_BASE}/signatures`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify({
            orderId,
            transactionId,
            signatureType: type,
            signatureData: data.signatureData,
            signerName: data.signerName,
            signatureFormat: data.format || 'svg',
            termsVersion: requirement?.termsVersion,
            legalText: requirement?.legalText,
            deviceInfo: data.deviceInfo,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          results.push({ type, success: true, id: result.data.id });
        } else {
          results.push({ type, success: false, error: result.error });
        }
      }

      return results;
    } catch (error) {
      console.error('[useSignatureRequirements] Save error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [capturedSignatures, requiredSignatures]);

  return {
    // State
    requiredSignatures,
    pendingSignatures,
    capturedSignatures,
    deferredSignatures,
    loading,

    // Computed
    isComplete,
    hasRequirements,
    nextRequired,

    // Actions
    recordSignature,
    deferSignature,
    clearSignature,
    reset,
    getSignatureData,
    saveSignatures,
  };
}

export default useSignatureRequirements;
