/**
 * TeleTime POS - Manager Approval Provider
 *
 * Context provider that wraps the manager approval workflow
 * and provides hooks for discount operations with automatic approval checking.
 */

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useManagerApproval, OVERRIDE_TYPES } from '../../hooks/useManagerApproval';
import { ManagerApprovalModal } from './ManagerApprovalModal';

// ============================================================================
// CONTEXT
// ============================================================================

const ManagerApprovalContext = createContext(null);

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Provider component that handles manager approval workflow
 */
export function ManagerApprovalProvider({ children }) {
  const {
    isOpen,
    isLoading,
    error,
    pendingOverride,
    approvalResult,
    checkRequiresApproval,
    checkDiscountApproval,
    requestApproval,
    verifyPin,
    cancelApproval,
    clearError,
  } = useManagerApproval();

  /**
   * Apply a discount with approval workflow
   * Returns a promise that resolves with the discount if approved
   * @param {object} options - Discount options
   * @param {string} options.type - 'percent' or 'amount'
   * @param {number} options.value - Discount value
   * @param {number} options.originalPrice - Original price
   * @param {number} options.discountedPrice - Price after discount
   * @param {string} options.reason - Reason for discount
   * @param {object} options.product - Product info (optional)
   * @param {number} options.quantity - Quantity (optional)
   * @param {number} options.cost - Unit cost (optional)
   * @returns {Promise<object>} Resolves with discount details if approved
   */
  const applyDiscountWithApproval = useCallback(async (options) => {
    const {
      type = 'percent',
      value,
      originalPrice,
      discountedPrice,
      reason = '',
      product = null,
      quantity = 1,
      cost = null,
    } = options;

    // Calculate the discount percentage
    const discountPercent = originalPrice > 0
      ? ((originalPrice - discountedPrice) / originalPrice) * 100
      : 0;

    // Check if approval is required
    const check = await checkDiscountApproval(
      originalPrice,
      discountedPrice,
      quantity,
      cost,
      { productId: product?.productId || product?.id }
    );

    // If no approval required, return success immediately
    if (!check.requiresApproval) {
      return {
        approved: true,
        autoApproved: true,
        discountType: type,
        discountValue: value,
        discountPercent,
        discountedPrice,
        originalPrice,
      };
    }

    // Request manager approval
    try {
      const result = await requestApproval({
        overrideType: check.overrideType || OVERRIDE_TYPES.DISCOUNT_PERCENT,
        originalValue: originalPrice,
        overrideValue: discountedPrice,
        displayValue: discountPercent,
        threshold: check.threshold,
        reason,
        productId: product?.productId || product?.id,
        productName: product?.name || product?.productName,
        quantity,
        requiredLevel: check.requiredLevel || 'manager',
      });

      return {
        approved: result.approved,
        autoApproved: false,
        managerName: result.managerName,
        managerId: result.managerId,
        logId: result.logId,
        discountType: type,
        discountValue: value,
        discountPercent,
        discountedPrice,
        originalPrice,
      };
    } catch (err) {
      // User cancelled
      if (err.cancelled) {
        return { approved: false, cancelled: true };
      }
      throw err;
    }
  }, [checkDiscountApproval, requestApproval]);

  /**
   * Apply an item discount with approval workflow
   * @param {object} item - Cart item
   * @param {number} discountPercent - Discount percentage
   * @param {string} reason - Reason for discount
   * @returns {Promise<object>} Resolves with discount details if approved
   */
  const applyItemDiscountWithApproval = useCallback(async (item, discountPercent, reason = '') => {
    const originalPrice = item.unitPrice;
    const discountedPrice = originalPrice * (1 - discountPercent / 100);

    return applyDiscountWithApproval({
      type: 'percent',
      value: discountPercent,
      originalPrice,
      discountedPrice,
      reason,
      product: {
        productId: item.productId,
        productName: item.productName,
      },
      quantity: item.quantity,
      cost: item.unitCost,
    });
  }, [applyDiscountWithApproval]);

  /**
   * Apply a price override with approval workflow
   * @param {object} options - Override options
   * @returns {Promise<object>} Resolves with override details if approved
   */
  const applyPriceOverrideWithApproval = useCallback(async (options) => {
    const {
      originalPrice,
      newPrice,
      reason = '',
      product = null,
      quantity = 1,
      cost = null,
    } = options;

    const discountPercent = originalPrice > 0
      ? ((originalPrice - newPrice) / originalPrice) * 100
      : 0;

    return applyDiscountWithApproval({
      type: 'amount',
      value: originalPrice - newPrice,
      originalPrice,
      discountedPrice: newPrice,
      reason,
      product,
      quantity,
      cost,
    });
  }, [applyDiscountWithApproval]);

  /**
   * Apply a cart-level discount with approval workflow
   * @param {number} subtotal - Cart subtotal
   * @param {number} discountAmount - Discount amount in dollars
   * @param {string} reason - Reason for discount
   * @returns {Promise<object>} Resolves with discount details if approved
   */
  const applyCartDiscountWithApproval = useCallback(async (subtotal, discountAmount, reason = '') => {
    const discountedTotal = subtotal - discountAmount;

    return applyDiscountWithApproval({
      type: 'amount',
      value: discountAmount,
      originalPrice: subtotal,
      discountedPrice: discountedTotal,
      reason,
      product: null,
      quantity: 1,
      cost: null,
    });
  }, [applyDiscountWithApproval]);

  // Context value
  const value = useMemo(() => ({
    // Raw approval functions
    checkRequiresApproval,
    checkDiscountApproval,
    requestApproval,

    // High-level discount functions with approval
    applyDiscountWithApproval,
    applyItemDiscountWithApproval,
    applyPriceOverrideWithApproval,
    applyCartDiscountWithApproval,

    // State
    isPendingApproval: isOpen,
  }), [
    checkRequiresApproval,
    checkDiscountApproval,
    requestApproval,
    applyDiscountWithApproval,
    applyItemDiscountWithApproval,
    applyPriceOverrideWithApproval,
    applyCartDiscountWithApproval,
    isOpen,
  ]);

  return (
    <ManagerApprovalContext.Provider value={value}>
      {children}

      {/* Manager Approval Modal */}
      <ManagerApprovalModal
        isOpen={isOpen}
        pendingOverride={pendingOverride}
        onVerifyPin={verifyPin}
        onCancel={cancelApproval}
        isLoading={isLoading}
        error={error}
        approvalResult={approvalResult}
        onClearError={clearError}
      />
    </ManagerApprovalContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access manager approval functionality
 * @returns {object} Manager approval methods
 */
export function useManagerApprovalContext() {
  const context = useContext(ManagerApprovalContext);
  if (!context) {
    throw new Error('useManagerApprovalContext must be used within ManagerApprovalProvider');
  }
  return context;
}

export default ManagerApprovalProvider;
