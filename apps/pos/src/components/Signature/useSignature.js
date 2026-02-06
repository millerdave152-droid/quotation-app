/**
 * TeleTime POS - Signature Hook
 * Manage signature capture and API interactions
 */

import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Get device info for audit trail
 */
function getDeviceInfo() {
  const ua = navigator.userAgent;

  // Detect device type
  let deviceType = 'desktop';
  if (/tablet|ipad/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|android/i.test(ua)) {
    deviceType = 'mobile';
  }

  // Detect touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return {
    userAgent: ua,
    deviceType,
    hasTouch,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    platform: navigator.platform,
    language: navigator.language,
  };
}

/**
 * useSignature hook
 * Manage signature capture workflow
 */
export function useSignature() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureConfig, setSignatureConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Open signature modal with configuration
   */
  const requestSignature = useCallback((config) => {
    setSignatureConfig(config);
    setError(null);
    setIsModalOpen(true);
  }, []);

  /**
   * Close signature modal
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSignatureConfig(null);
  }, []);

  /**
   * Save signature to backend
   */
  const saveSignature = useCallback(async (signatureData, additionalData = {}) => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        signatureData: signatureData.signatureData,
        signerName: signatureData.signerName,
        signatureType: signatureData.signatureType || signatureConfig?.signatureType,
        signatureFormat: signatureData.format || 'svg',
        termsVersion: signatureData.termsVersion || signatureConfig?.termsVersion,
        legalText: signatureData.legalText || signatureConfig?.legalText,
        deviceInfo: getDeviceInfo(),
        ...additionalData,
      };

      const response = await fetch(`${API_BASE}/signatures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save signature');
      }

      closeModal();
      return result.data;

    } catch (err) {
      console.error('[useSignature] Save error:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signatureConfig, closeModal]);

  /**
   * Get required signatures for an order
   */
  const getRequiredSignatures = useCallback(async (orderId) => {
    try {
      const response = await fetch(`${API_BASE}/signatures/requirements/${orderId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to get requirements');
      }

      return result.data;

    } catch (err) {
      console.error('[useSignature] Get requirements error:', err);
      throw err;
    }
  }, []);

  /**
   * Get signatures for an order
   */
  const getOrderSignatures = useCallback(async (orderId) => {
    try {
      const response = await fetch(`${API_BASE}/signatures/order/${orderId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to get signatures');
      }

      return result.data;

    } catch (err) {
      console.error('[useSignature] Get order signatures error:', err);
      throw err;
    }
  }, []);

  /**
   * Void a signature
   */
  const voidSignature = useCallback(async (signatureId, reason) => {
    try {
      const response = await fetch(`${API_BASE}/signatures/${signatureId}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ reason }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to void signature');
      }

      return result.data;

    } catch (err) {
      console.error('[useSignature] Void error:', err);
      throw err;
    }
  }, []);

  return {
    // State
    isModalOpen,
    signatureConfig,
    loading,
    error,

    // Actions
    requestSignature,
    closeModal,
    saveSignature,
    getRequiredSignatures,
    getOrderSignatures,
    voidSignature,
  };
}

/**
 * useDeliverySignature hook
 * Specialized hook for delivery confirmation signatures
 */
export function useDeliverySignature() {
  const signature = useSignature();

  const requestDeliverySignature = useCallback((orderInfo) => {
    signature.requestSignature({
      signatureType: 'delivery',
      title: 'Delivery Confirmation',
      subtitle: 'Please sign to confirm receipt of your order',
      legalText: 'I acknowledge receipt of the above items in satisfactory condition. I understand that by signing, I am confirming the delivery and accepting responsibility for the merchandise.',
      termsVersion: 'v2024.1',
      orderInfo,
      requirePrintedName: true,
    });
  }, [signature]);

  return {
    ...signature,
    requestDeliverySignature,
  };
}

/**
 * useTradeInSignature hook
 * Specialized hook for trade-in acceptance signatures
 */
export function useTradeInSignature() {
  const signature = useSignature();

  const requestTradeInSignature = useCallback((tradeInInfo) => {
    signature.requestSignature({
      signatureType: 'trade_in',
      title: 'Trade-In Agreement',
      subtitle: 'Please sign to confirm acceptance and ownership transfer',
      legalText: `TRADE-IN AGREEMENT

I, the undersigned, hereby certify that:
1. I am the legal owner of the device(s) being traded in
2. The device(s) are not stolen, lost, or subject to any claims
3. The device(s) are not under lease or financing agreement
4. I have removed all personal data and accounts from the device
5. I accept the assessed trade-in value of $${tradeInInfo.value?.toFixed(2) || '0.00'} as final

I hereby transfer all ownership rights to the receiving party.`,
      termsVersion: 'v2024.1',
      orderInfo: tradeInInfo,
      requirePrintedName: true,
    });
  }, [signature]);

  return {
    ...signature,
    requestTradeInSignature,
  };
}

export default useSignature;
