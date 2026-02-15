/**
 * TeleTime POS - Price Override Modal
 *
 * Allows cashiers/managers to override prices with:
 * - Tier-based approval: Tier 1 (<=10%) auto-approves, Tier 2+ requires manager
 * - Reason selection
 * - Audit logging via approval_requests table
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  TagIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { useCustomerPricing } from '../../hooks/useCustomerPricing';
import { createApprovalRequest, consumeApprovalToken } from '../../api/approvals';

// ============================================================================
// OVERRIDE REASONS
// ============================================================================

const OVERRIDE_REASONS = [
  { id: 'price_match', label: 'Price Match Competitor' },
  { id: 'damaged', label: 'Damaged/Open Box' },
  { id: 'floor_model', label: 'Floor Model' },
  { id: 'bundle_deal', label: 'Bundle Deal' },
  { id: 'loyalty', label: 'Customer Loyalty' },
  { id: 'negotiated', label: 'Negotiated Price' },
  { id: 'clearance', label: 'Clearance Item' },
  { id: 'manager_approval', label: 'Manager Approval' },
  { id: 'error_correction', label: 'Price Error Correction' },
  { id: 'custom', label: 'Other (specify)' },
];

// Tier boundaries (mirrors backend approval_tier_settings)
function calculateTier(retailPrice, overridePrice) {
  if (retailPrice <= 0) return 2;
  const pct = ((retailPrice - overridePrice) / retailPrice) * 100;
  if (pct <= 10)  return 1;
  if (pct <= 25)  return 2;
  if (pct <= 50)  return 3;
  return 4;
}

const TIER_LABELS = {
  1: 'Tier 1 – Auto-approved',
  2: 'Tier 2 – Manager Required',
  3: 'Tier 3 – Senior Manager Required',
  4: 'Tier 4 – Admin Required',
};

// ============================================================================
// PRICE OVERRIDE MODAL
// ============================================================================

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {function} props.onApply - (overridePrice, reason, approvalInfo)
 * @param {function} props.onRequestApproval - (itemData) → opens ManagerSelectionModal for Tier 2+
 * @param {object} props.product
 * @param {number} props.originalPrice - Original base price
 * @param {number} props.customerPrice - Customer tier price
 * @param {number} props.customerId
 * @param {number} props.quantity
 */
export function PriceOverrideModal({
  isOpen,
  onClose,
  onApply,
  onRequestApproval,
  product,
  originalPrice,
  customerPrice,
  customerId,
  quantity = 1,
}) {
  const { canApproveOverrides } = useCustomerPricing({ customerId });

  // State
  const [mode, setMode] = useState('dollar'); // 'dollar' or 'percent'
  const [inputValue, setInputValue] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Safe prices
  const safeCustomerPrice = customerPrice || 0;
  const safeOriginalPrice = originalPrice || 0;

  // Calculate override price
  const overridePrice = useMemo(() => {
    const value = parseFloat(inputValue) || 0;
    if (mode === 'percent') {
      return safeCustomerPrice * (1 - value / 100);
    }
    return value;
  }, [inputValue, mode, safeCustomerPrice]);

  // Discount metrics
  const metrics = useMemo(() => {
    const discountFromBase = safeOriginalPrice - overridePrice;
    const discountFromCustomer = safeCustomerPrice - overridePrice;
    const percentFromBase =
      safeOriginalPrice > 0 ? (discountFromBase / safeOriginalPrice) * 100 : 0;
    const percentFromCustomer =
      safeCustomerPrice > 0 ? (discountFromCustomer / safeCustomerPrice) * 100 : 0;

    return {
      discountFromBase,
      discountFromCustomer,
      percentFromBase,
      percentFromCustomer,
      totalSavings: discountFromBase * quantity,
      isValid: overridePrice > 0 && overridePrice <= safeOriginalPrice,
      isIncrease: overridePrice > safeCustomerPrice,
    };
  }, [overridePrice, safeOriginalPrice, safeCustomerPrice, quantity]);

  // Tier calculation
  const tier = useMemo(
    () => metrics.isValid && overridePrice < safeOriginalPrice
      ? calculateTier(safeOriginalPrice, overridePrice)
      : null,
    [safeOriginalPrice, overridePrice, metrics.isValid],
  );

  const needsManagerApproval = tier !== null && tier >= 2 && !canApproveOverrides;

  // Reason text
  const reasonText = useMemo(() => {
    if (selectedReason === 'custom') {
      return customReason.trim() || 'Custom override';
    }
    return OVERRIDE_REASONS.find((r) => r.id === selectedReason)?.label || '';
  }, [selectedReason, customReason]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMode('dollar');
      setInputValue(safeCustomerPrice.toFixed(2));
      setSelectedReason('');
      setCustomReason('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, safeCustomerPrice]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!metrics.isValid || !selectedReason) {
      setError('Please enter a valid price and select a reason');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Managers can always apply directly
      if (canApproveOverrides) {
        onApply?.(overridePrice, reasonText, {
          managerApproved: true,
          status: 'manager_approved',
        });
        onClose?.();
        return;
      }

      const discountPct = safeOriginalPrice > 0
        ? ((safeOriginalPrice - overridePrice) / safeOriginalPrice) * 100
        : 0;

      if (discountPct <= 10) {
        // Tier 1: Auto-approve via API, consume token, apply to cart
        const res = await createApprovalRequest({
          productId: product.productId || product.id,
          requestedPrice: overridePrice,
        });
        const data = res?.data || res;

        if (data.autoApproved && data.approval_token) {
          const consumeRes = await consumeApprovalToken(data.approval_token);
          const consumed = consumeRes?.data || consumeRes;

          onApply?.(consumed.approvedPrice, reasonText, {
            approvalRequestId: consumed.requestId,
            approvedByName: 'Auto-approved',
          });
          onClose?.();
        } else {
          // Unexpected: Tier 1 didn't auto-approve — apply with logged request ID
          onApply?.(overridePrice, reasonText, {
            approvalRequestId: data.id,
          });
          onClose?.();
        }
      } else {
        // Tier 2+: Delegate to approval flow (ManagerSelectionModal → ApprovalStatusOverlay)
        onRequestApproval?.({
          productId: product.productId || product.id,
          productName: product.productName || product.name,
          retailPrice: safeOriginalPrice,
          requestedPrice: overridePrice,
          cost: product.unitCost || product.cost || null,
          reason: reasonText,
          itemId: product.id, // cart item ID
          entryPoint: 'priceOverride',
        });
        onClose?.();
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err
        : err?.message && typeof err.message === 'string' ? err.message
        : 'Failed to apply price override';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    metrics.isValid,
    selectedReason,
    product,
    safeOriginalPrice,
    overridePrice,
    reasonText,
    canApproveOverrides,
    quantity,
    onApply,
    onRequestApproval,
    onClose,
  ]);

  // Quick discount buttons
  const handleQuickDiscount = useCallback(
    (percent) => {
      setMode('percent');
      setInputValue(percent.toString());
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <TagIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Override Price</h2>
              <p className="text-sm text-gray-500">{product.productName || product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Current Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Base Price</p>
              <p className="text-lg font-bold text-gray-400 line-through tabular-nums">
                {formatCurrency(safeOriginalPrice)}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600">Customer Price</p>
              <p className="text-lg font-bold text-blue-700 tabular-nums">
                {formatCurrency(safeCustomerPrice)}
              </p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('dollar'); setInputValue(''); }}
              className={`
                flex-1 h-10 flex items-center justify-center gap-2
                text-sm font-medium rounded-lg transition-colors
                ${mode === 'dollar'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              $ Amount
            </button>
            <button
              onClick={() => { setMode('percent'); setInputValue(''); }}
              className={`
                flex-1 h-10 flex items-center justify-center gap-2
                text-sm font-medium rounded-lg transition-colors
                ${mode === 'percent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              % Discount
            </button>
          </div>

          {/* Quick Discounts */}
          {mode === 'percent' && (
            <div className="flex gap-2">
              {[5, 10, 15, 20, 25].map((pct) => (
                <button
                  key={pct}
                  onClick={() => handleQuickDiscount(pct)}
                  className={`
                    flex-1 h-9 text-sm font-medium rounded-lg
                    ${inputValue === pct.toString()
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'}
                  `}
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {/* Price Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'dollar' ? 'Override Price' : 'Discount Percentage'}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
                {mode === 'dollar' ? '$' : ''}
              </span>
              <input
                type="number"
                value={inputValue}
                onChange={(e) => {
                  let val = e.target.value;
                  if (mode === 'percent') {
                    const num = parseFloat(val);
                    if (num > 100) val = '100';
                    if (num < 0) val = '0';
                  } else {
                    const num = parseFloat(val);
                    if (num > safeOriginalPrice) val = safeOriginalPrice.toFixed(2);
                    if (num < 0) val = '0';
                  }
                  setInputValue(val);
                }}
                step={mode === 'dollar' ? '0.01' : '1'}
                min="0"
                max={mode === 'percent' ? '100' : safeOriginalPrice}
                className={`
                  w-full h-14
                  ${mode === 'dollar' ? 'pl-8' : 'pl-4'} pr-12
                  text-2xl font-bold text-right
                  border-2 border-gray-200 rounded-xl
                  focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                `}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
                {mode === 'percent' ? '%' : ''}
              </span>
            </div>
          </div>

          {/* Override Preview */}
          {metrics.isValid && overridePrice !== safeCustomerPrice && (
            <div className={`p-3 rounded-lg ${metrics.isIncrease ? 'bg-yellow-50' : 'bg-green-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">New Price:</span>
                <span className="text-xl font-bold text-gray-900 tabular-nums">
                  {formatCurrency(overridePrice)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">
                  {metrics.isIncrease ? 'Price Increase' : 'Additional Discount'}:
                </span>
                <span className={`text-sm font-medium tabular-nums ${metrics.isIncrease ? 'text-yellow-700' : 'text-green-700'}`}>
                  {metrics.isIncrease ? '+' : '-'}
                  {formatCurrency(Math.abs(metrics.discountFromCustomer))} (
                  {metrics.percentFromCustomer.toFixed(1)}%)
                </span>
              </div>
              {quantity > 1 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">Total ({quantity} items):</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {formatCurrency(overridePrice * quantity)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tier Indicator */}
          {tier !== null && !metrics.isIncrease && (
            <div className={`p-3 rounded-lg flex items-start gap-3 ${
              tier === 1
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }`}>
              {tier === 1 ? (
                <>
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">{TIER_LABELS[1]}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {metrics.percentFromBase.toFixed(1)}% discount — will be applied immediately.
                    </p>
                  </div>
                </>
              ) : canApproveOverrides ? (
                <>
                  <ShieldCheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Manager Override</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {metrics.percentFromBase.toFixed(1)}% discount ({TIER_LABELS[tier]}).
                      You can approve this as a manager.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">{TIER_LABELS[tier]}</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {metrics.percentFromBase.toFixed(1)}% discount exceeds Tier 1 threshold.
                      You will select a manager to approve this override.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Override Reason
            </label>
            <div className="grid grid-cols-2 gap-2">
              {OVERRIDE_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  className={`
                    h-10 px-3 text-sm font-medium text-left rounded-lg transition-colors
                    ${selectedReason === reason.id
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'}
                  `}
                >
                  {reason.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Reason Input */}
          {selectedReason === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specify Reason
              </label>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter reason for override..."
                maxLength={200}
                className="w-full h-10 px-3 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !metrics.isValid ||
              !selectedReason ||
              isSubmitting ||
              overridePrice === safeCustomerPrice
            }
            className="flex-1 h-12 flex items-center justify-center gap-2 text-white font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : needsManagerApproval ? (
              <>
                <ClockIcon className="w-5 h-5" />
                Request Approval
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5" />
                Apply Override
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PriceOverrideModal;
