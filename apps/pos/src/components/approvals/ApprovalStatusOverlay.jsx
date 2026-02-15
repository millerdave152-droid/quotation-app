/**
 * TeleTime POS - Approval Status Overlay
 *
 * Full-screen overlay shown while a price-override approval request is
 * pending, and for displaying the result (approved/denied/countered/timed-out).
 */

import { useState, useEffect, useRef } from 'react';
import {
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

// ---------------------------------------------------------------------------
// Live Timer
// ---------------------------------------------------------------------------

function LiveTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState('0:00');
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!createdAt) return;
    const start = new Date(createdAt).getTime();

    const tick = () => {
      const diff = Math.max(0, Date.now() - start);
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [createdAt]);

  const mins = parseInt(elapsed.split(':')[0], 10);

  return (
    <span className={`text-sm font-mono tabular-nums ${mins >= 2 ? 'text-red-500' : 'text-gray-500'}`}>
      {elapsed}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApprovalStatusOverlay({
  isOpen,
  flowState,
  approvalRequest,
  approvedPrice,
  approvedByName,
  counterOffer,
  denyReason,
  error,
  onAcceptCounter,
  onDeclineCounter,
  onCancel,
  onClose,
}) {
  const [closing, setClosing] = useState(false);

  // Auto-close after "done" (approved + consumed) with a brief success display
  useEffect(() => {
    if (flowState === 'done') {
      const t = setTimeout(() => onClose?.(), 1500);
      return () => clearTimeout(t);
    }
  }, [flowState, onClose]);

  if (!isOpen) return null;

  const retailPrice = approvalRequest?.original_price
    ? parseFloat(approvalRequest.original_price)
    : approvalRequest?.originalPrice
      ? parseFloat(approvalRequest.originalPrice)
      : 0;

  const requestedPrice = approvalRequest?.requested_price
    ? parseFloat(approvalRequest.requested_price)
    : approvalRequest?.requestedPrice
      ? parseFloat(approvalRequest.requestedPrice)
      : 0;

  const discountPct = retailPrice > 0
    ? (((retailPrice - requestedPrice) / retailPrice) * 100).toFixed(1)
    : '0.0';

  const tier = approvalRequest?.tier || 2;
  const tierName = approvalRequest?.tierName || `Tier ${tier}`;
  const productName = approvalRequest?.product_name || approvalRequest?.productName || 'Product';

  // -------------------------------------------------------------------
  // PENDING state
  // -------------------------------------------------------------------
  if (flowState === 'pending') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="p-5 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Awaiting Approval</h2>
              </div>
              <LiveTimer createdAt={approvalRequest?.created_at || approvalRequest?.createdAt} />
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Product */}
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-gray-400 mt-0.5" />
              <p className="text-sm font-medium text-gray-900">{productName}</p>
            </div>

            {/* Price summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Retail Price</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(retailPrice)}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600">Requested</p>
                <p className="text-lg font-bold text-blue-700 tabular-nums">{formatCurrency(requestedPrice)}</p>
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded-md">
                {discountPct}% off
              </span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-md">
                {tierName}
              </span>
            </div>

            {/* Spinner */}
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Waiting for manager response...</p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={onCancel}
              className="w-full h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Cancel Request
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // APPROVED / CONSUMING / DONE states
  // -------------------------------------------------------------------
  if (flowState === 'approved' || flowState === 'consuming' || flowState === 'done') {
    const displayPrice = approvedPrice || requestedPrice;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-green-50 border-b border-green-100">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
              <h2 className="text-lg font-bold text-green-800">
                {flowState === 'done' ? 'Price Applied!' : 'Approved!'}
              </h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-gray-400 mt-0.5" />
              <p className="text-sm font-medium text-gray-900">{productName}</p>
            </div>

            <div className="p-4 bg-green-50 rounded-xl text-center">
              <p className="text-xs text-green-600 mb-1">Approved Price</p>
              <p className="text-3xl font-bold text-green-700 tabular-nums">{formatCurrency(displayPrice)}</p>
              {approvedByName && (
                <p className="text-sm text-green-600 mt-2">
                  Approved by {approvedByName}
                </p>
              )}
            </div>

            {flowState === 'consuming' && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                Applying price...
              </div>
            )}

            {flowState === 'done' && (
              <p className="text-center text-sm text-green-600 font-medium">
                Price has been applied to the cart.
              </p>
            )}
          </div>

          {flowState !== 'consuming' && (
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="w-full h-12 text-white font-bold bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
              >
                {flowState === 'done' ? 'Done' : 'Apply Now'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // DENIED state
  // -------------------------------------------------------------------
  if (flowState === 'denied') {
    const REASON_LABELS = {
      price_too_low: 'Price too low',
      margin: 'Insufficient margin',
      not_authorized: 'Not authorized for this product',
      contact_owner: 'Contact owner',
      other: 'Other',
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2">
              <XCircleIcon className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-red-800">Request Denied</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-gray-400 mt-0.5" />
              <p className="text-sm font-medium text-gray-900">{productName}</p>
            </div>

            <div className="p-4 bg-red-50 rounded-xl space-y-2">
              {denyReason?.reasonCode && (
                <p className="text-sm font-medium text-red-700">
                  {REASON_LABELS[denyReason.reasonCode] || denyReason.reasonCode}
                </p>
              )}
              {denyReason?.reasonNote && (
                <p className="text-sm text-red-600">{denyReason.reasonNote}</p>
              )}
              {denyReason?.managerName && (
                <p className="text-xs text-red-500 mt-2">
                  Denied by {denyReason.managerName}
                </p>
              )}
            </div>

            <p className="text-sm text-gray-500 text-center">
              The item will revert to its original price.
            </p>
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // COUNTERED state
  // -------------------------------------------------------------------
  if (flowState === 'countered' && counterOffer) {
    const counterPrice = parseFloat(counterOffer.price);
    const counterDiscountPct = retailPrice > 0
      ? (((retailPrice - counterPrice) / retailPrice) * 100).toFixed(1)
      : '0.0';

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <ArrowPathIcon className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-amber-800">Counter Offer</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-gray-400 mt-0.5" />
              <p className="text-sm font-medium text-gray-900">{productName}</p>
            </div>

            {counterOffer.managerName && (
              <p className="text-sm text-gray-600">
                {counterOffer.managerName} has offered a different price:
              </p>
            )}

            {/* Comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">You Requested</p>
                <p className="text-lg font-bold text-gray-400 tabular-nums line-through">
                  {formatCurrency(requestedPrice)}
                </p>
                <p className="text-xs text-gray-400">{discountPct}% off</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-300">
                <p className="text-xs text-amber-600">Counter Offer</p>
                <p className="text-lg font-bold text-amber-700 tabular-nums">
                  {formatCurrency(counterPrice)}
                </p>
                <p className="text-xs text-amber-600">{counterDiscountPct}% off</p>
              </div>
            </div>

            {counterOffer.marginPercent != null && (
              <div className="text-xs text-gray-500 text-center">
                Margin at counter price: {parseFloat(counterOffer.marginPercent).toFixed(1)}%
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={onDeclineCounter}
              className="flex-1 h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onAcceptCounter}
              className="flex-1 h-12 text-white font-bold bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
            >
              Accept {formatCurrency(counterPrice)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // TIMED OUT state
  // -------------------------------------------------------------------
  if (flowState === 'timed_out') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-600" />
              <h2 className="text-lg font-bold text-amber-800">Request Timed Out</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-600 text-center">
              The manager did not respond in time. You can try again or cancel.
            </p>
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // ERROR state
  // -------------------------------------------------------------------
  if (flowState === 'error') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-red-800">Error</h2>
            </div>
          </div>

          <div className="p-5">
            <p className="text-sm text-red-700">{error || 'An unexpected error occurred.'}</p>
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full h-12 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
