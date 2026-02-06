/**
 * TeleTime POS - Price Override Modal
 *
 * Allows cashiers/managers to override prices with:
 * - Approval workflow for discounts over threshold
 * - Reason selection
 * - Audit logging
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  CalculatorIcon,
  TagIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { useCustomerPricing } from '../../hooks/useCustomerPricing';
import { useManagerApprovalContext } from '../Checkout/ManagerApprovalProvider';

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

// ============================================================================
// PRICE OVERRIDE MODAL
// ============================================================================

/**
 * Price override modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close callback
 * @param {function} props.onApply - Apply override callback (overridePrice, reason)
 * @param {object} props.product - Product being overridden
 * @param {number} props.originalPrice - Original base price
 * @param {number} props.customerPrice - Customer tier price
 * @param {number} props.customerId - Current customer ID
 * @param {number} props.quantity - Quantity being purchased
 */
export function PriceOverrideModal({
  isOpen,
  onClose,
  onApply,
  product,
  originalPrice,
  customerPrice,
  customerId,
  quantity = 1,
}) {
  const { checkOverrideApproval, requestOverride, canApproveOverrides } =
    useCustomerPricing({ customerId });

  // Manager approval context for PIN verification
  const managerApproval = useManagerApprovalContext();

  // State
  const [mode, setMode] = useState('dollar'); // 'dollar' or 'percent'
  const [inputValue, setInputValue] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [approvalCheck, setApprovalCheck] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [overrideResult, setOverrideResult] = useState(null);

  // Calculate override price
  const overridePrice = useMemo(() => {
    const value = parseFloat(inputValue) || 0;
    if (mode === 'percent') {
      // Percentage off customer price
      return customerPrice * (1 - value / 100);
    }
    return value;
  }, [inputValue, mode, customerPrice]);

  // Calculate discount metrics
  const metrics = useMemo(() => {
    const discountFromBase = originalPrice - overridePrice;
    const discountFromCustomer = customerPrice - overridePrice;
    const percentFromBase =
      originalPrice > 0 ? (discountFromBase / originalPrice) * 100 : 0;
    const percentFromCustomer =
      customerPrice > 0 ? (discountFromCustomer / customerPrice) * 100 : 0;

    return {
      discountFromBase,
      discountFromCustomer,
      percentFromBase,
      percentFromCustomer,
      totalSavings: discountFromBase * quantity,
      isValid: overridePrice > 0 && overridePrice <= originalPrice,
      isIncrease: overridePrice > customerPrice,
    };
  }, [overridePrice, originalPrice, customerPrice, quantity]);

  // Get reason text
  const reasonText = useMemo(() => {
    if (selectedReason === 'custom') {
      return customReason.trim() || 'Custom override';
    }
    return OVERRIDE_REASONS.find((r) => r.id === selectedReason)?.label || '';
  }, [selectedReason, customReason]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('dollar');
      setInputValue(customerPrice.toFixed(2));
      setSelectedReason('');
      setCustomReason('');
      setApprovalCheck(null);
      setError(null);
      setOverrideResult(null);
    }
  }, [isOpen, customerPrice]);

  // Check approval when price changes
  useEffect(() => {
    const checkApproval = async () => {
      if (!metrics.isValid || overridePrice === customerPrice) {
        setApprovalCheck(null);
        return;
      }

      const check = await checkOverrideApproval(
        Math.round(originalPrice * 100),
        Math.round(overridePrice * 100)
      );
      setApprovalCheck(check);
    };

    const debounce = setTimeout(checkApproval, 300);
    return () => clearTimeout(debounce);
  }, [overridePrice, originalPrice, customerPrice, metrics.isValid, checkOverrideApproval]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!metrics.isValid || !selectedReason) {
      setError('Please enter a valid price and select a reason');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check if manager approval is required via the new approval system
      if (approvalCheck?.requiresApproval && !canApproveOverrides) {
        // Use manager approval modal for PIN verification
        const approvalResult = await managerApproval.applyPriceOverrideWithApproval({
          originalPrice: customerPrice,
          newPrice: overridePrice,
          reason: reasonText,
          product: {
            productId: product.productId || product.id,
            productName: product.productName || product.name,
          },
          quantity,
          cost: product.unitCost || product.cost || null,
        });

        if (approvalResult.cancelled) {
          // User cancelled the approval
          setIsSubmitting(false);
          return;
        }

        if (!approvalResult.approved) {
          setError(approvalResult.error || 'Manager approval denied');
          setIsSubmitting(false);
          return;
        }

        // Approval granted - apply the override
        onApply?.(overridePrice, reasonText, {
          managerApproved: true,
          managerId: approvalResult.managerId,
          managerName: approvalResult.managerName,
          logId: approvalResult.logId,
        });
        onClose?.();
        return;
      }

      // Use existing override request flow (for auto-approved or manager users)
      const result = await requestOverride({
        productId: product.productId || product.id,
        originalPriceCents: Math.round(originalPrice * 100),
        customerTierPriceCents: Math.round(customerPrice * 100),
        overridePriceCents: Math.round(overridePrice * 100),
        overrideReason: reasonText,
      });

      if (!result.success) {
        setError(result.error || 'Failed to request override');
        return;
      }

      setOverrideResult(result);

      // If auto-approved or manager can approve, apply immediately
      if (result.status === 'auto_approved' || canApproveOverrides) {
        onApply?.(overridePrice, reasonText, result);
        onClose?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    metrics.isValid,
    selectedReason,
    requestOverride,
    product,
    originalPrice,
    customerPrice,
    overridePrice,
    reasonText,
    canApproveOverrides,
    approvalCheck,
    managerApproval,
    quantity,
    onApply,
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
                {formatCurrency(originalPrice)}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600">Customer Price</p>
              <p className="text-lg font-bold text-blue-700 tabular-nums">
                {formatCurrency(customerPrice)}
              </p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('dollar')}
              className={`
                flex-1 h-10 flex items-center justify-center gap-2
                text-sm font-medium rounded-lg
                transition-colors
                ${
                  mode === 'dollar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              $ Amount
            </button>
            <button
              onClick={() => setMode('percent')}
              className={`
                flex-1 h-10 flex items-center justify-center gap-2
                text-sm font-medium rounded-lg
                transition-colors
                ${
                  mode === 'percent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
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
                    ${
                      inputValue === pct.toString()
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }
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
                onChange={(e) => setInputValue(e.target.value)}
                step={mode === 'dollar' ? '0.01' : '1'}
                min="0"
                max={mode === 'percent' ? '100' : originalPrice}
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
          {metrics.isValid && overridePrice !== customerPrice && (
            <div
              className={`p-3 rounded-lg ${
                metrics.isIncrease ? 'bg-yellow-50' : 'bg-green-50'
              }`}
            >
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
                <span
                  className={`text-sm font-medium tabular-nums ${
                    metrics.isIncrease ? 'text-yellow-700' : 'text-green-700'
                  }`}
                >
                  {metrics.isIncrease ? '+' : '-'}
                  {formatCurrency(Math.abs(metrics.discountFromCustomer))} (
                  {metrics.percentFromCustomer.toFixed(1)}%)
                </span>
              </div>
              {quantity > 1 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    Total ({quantity} items):
                  </span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {formatCurrency(overridePrice * quantity)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Approval Warning */}
          {approvalCheck && (
            <div
              className={`p-3 rounded-lg flex items-start gap-3 ${
                approvalCheck.requiresApproval
                  ? 'bg-amber-50 border border-amber-200'
                  : 'bg-green-50 border border-green-200'
              }`}
            >
              {approvalCheck.requiresApproval ? (
                <>
                  <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Manager Approval Required
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Discount of {approvalCheck.discountPercent.toFixed(1)}% exceeds the{' '}
                      {approvalCheck.threshold}% threshold for this customer tier.
                    </p>
                    {canApproveOverrides && (
                      <p className="text-xs text-green-700 mt-1 font-medium">
                        You can approve this override as a manager.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Auto-Approved
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      This discount is within your authorized limit.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Exceeds Max Warning */}
          {approvalCheck?.exceedsMax && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <LockClosedIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  Exceeds Maximum Discount
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  This discount exceeds the maximum allowed for this customer tier.
                  Higher approval may be required.
                </p>
              </div>
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
                    h-10 px-3
                    text-sm font-medium text-left
                    rounded-lg
                    transition-colors
                    ${
                      selectedReason === reason.id
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }
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
                className="
                  w-full h-10 px-3
                  text-sm
                  border-2 border-gray-200 rounded-lg
                  focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                "
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Pending Approval Result */}
          {overrideResult?.status === 'pending' && !canApproveOverrides && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
              <ClockIcon className="w-8 h-8 text-amber-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-amber-800">
                Awaiting Manager Approval
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Override ID: #{overrideResult.overrideId}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="
              flex-1 h-12
              text-gray-700 font-medium
              bg-gray-100 hover:bg-gray-200
              rounded-xl
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !metrics.isValid ||
              !selectedReason ||
              isSubmitting ||
              overridePrice === customerPrice ||
              (overrideResult?.status === 'pending' && !canApproveOverrides)
            }
            className="
              flex-1 h-12
              flex items-center justify-center gap-2
              text-white font-bold
              bg-blue-600 hover:bg-blue-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              rounded-xl
              transition-colors
            "
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : approvalCheck?.requiresApproval && !canApproveOverrides ? (
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
