/**
 * TeleTime POS - Discount Escalation Modal
 * Allows salesperson to request manager approval for a discount beyond their tier
 */

import { useState, useCallback, useMemo } from 'react';
import {
  ArrowUpCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { submitEscalation } from '../../api/discountAuthority';

const COMMISSION_RATE = 0.05;

/**
 * Modal for requesting a higher discount via manager escalation
 */
export function DiscountEscalationModal({
  isOpen,
  onClose,
  onSubmitted,
  item,
  desiredPct,
  tier,
  validationResult,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const price = item?.unitPrice || 0;
  const cost = item?.unitCost || 0;

  const calc = useMemo(() => {
    const pct = parseFloat(desiredPct) || 0;
    const discountAmount = +(price * pct / 100).toFixed(2);
    const priceAfter = +(price - discountAmount).toFixed(2);
    const marginBeforePct = price > 0 ? +((price - cost) / price * 100).toFixed(1) : 0;
    const marginAfterPct = price > 0 ? +((priceAfter - cost) / price * 100).toFixed(1) : 0;
    const marginAfterDollars = +(priceAfter - cost).toFixed(2);
    const commissionImpact = +(discountAmount * COMMISSION_RATE).toFixed(2);

    return { discountAmount, priceAfter, marginBeforePct, marginAfterPct, marginAfterDollars, commissionImpact };
  }, [price, cost, desiredPct]);

  const handleSubmit = useCallback(async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for this discount request');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitEscalation({
        productId: item.productId,
        discountPct: parseFloat(desiredPct),
        reason: reason.trim(),
        marginAfter: calc.marginAfterPct,
        commissionImpact: calc.commissionImpact,
      });

      setSubmitted(true);
      // Notify parent immediately so polling refreshes and
      // the DiscountSlider switches to "Pending Approval" state
      onSubmitted?.();
    } catch (err) {
      setError(err?.message || 'Failed to submit escalation request');
    } finally {
      setSubmitting(false);
    }
  }, [item, desiredPct, reason, calc, onSubmitted]);

  const handleClose = useCallback(() => {
    setReason('');
    setSubmitted(false);
    setError(null);
    onClose?.();
  }, [onClose]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 z-40" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50">
          <div className="flex items-center gap-2">
            <ArrowUpCircleIcon className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-gray-900">Request Higher Discount</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-amber-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {submitted ? (
            /* Success State */
            <div className="text-center py-6 space-y-3">
              <CheckCircleIcon className="w-14 h-14 text-green-500 mx-auto" />
              <h3 className="text-lg font-bold text-gray-900">Request Submitted</h3>
              <p className="text-sm text-gray-500">
                Your discount request has been sent to the manager approval queue.
                You can continue building the sale while waiting.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-6 h-10 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Continue Sale
              </button>
            </div>
          ) : (
            <>
              {/* Product Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900">{item.productName || item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Current Price: {formatCurrency(price)} | Requested: {desiredPct}% off ({formatCurrency(calc.discountAmount)})
                </p>
              </div>

              {/* Why Escalation is Required */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Requires Manager Approval</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {validationResult?.reason || validationResult?.escalation_reason || `${desiredPct}% exceeds your authorized discount limit`}
                  </p>
                </div>
              </div>

              {/* Impact Summary */}
              {cost > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ChartBarIcon className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700">Impact Summary</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Price After:</span>
                      <span className="ml-1 font-medium">{formatCurrency(calc.priceAfter)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Margin After:</span>
                      <span className={`ml-1 font-medium ${calc.marginAfterPct < 10 ? 'text-red-600' : 'text-gray-700'}`}>
                        {calc.marginAfterPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Margin $:</span>
                      <span className={`ml-1 font-medium ${calc.marginAfterDollars < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {formatCurrency(calc.marginAfterDollars)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Commission Impact:</span>
                      <span className="ml-1 font-medium text-red-600">-{formatCurrency(calc.commissionImpact)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setError(null); }}
                  placeholder="e.g., Customer found lower price at competitor, loyal repeat buyer..."
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-700">{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleClose}
                  className="flex-1 h-10 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !reason.trim()}
                  className={`
                    flex-1 h-10 flex items-center justify-center gap-1.5
                    text-sm font-semibold rounded-lg transition-all
                    ${submitting || !reason.trim()
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'}
                  `}
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ArrowUpCircleIcon className="w-4 h-4" />
                  )}
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DiscountEscalationModal;
