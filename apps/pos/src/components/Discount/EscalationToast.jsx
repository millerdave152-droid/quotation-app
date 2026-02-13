/**
 * TeleTime POS - Escalation Toast Notifications
 * Shows green toast for approved escalations, red for denied.
 * Approved toasts include an "Apply Discount" button.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * Single escalation toast
 */
function EscalationToastItem({ escalation, onDismiss, onApplyDiscount }) {
  const status = (escalation.status || '').toLowerCase();
  const isApproved = status === 'approved';
  const isExpired = status === 'expired';
  const isDenied = status === 'denied';
  const autoDismissMs = isApproved ? 15000 : 10000;

  useEffect(() => {
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoDismissMs]);

  const bgClass = isApproved
    ? 'bg-green-50 border-green-200'
    : isExpired
      ? 'bg-amber-50 border-amber-200'
      : 'bg-red-50 border-red-200';

  const iconBgClass = isApproved
    ? 'bg-green-100 text-green-600'
    : isExpired
      ? 'bg-amber-100 text-amber-600'
      : 'bg-red-100 text-red-600';

  const titleColor = isApproved
    ? 'text-green-800'
    : isExpired
      ? 'text-amber-800'
      : 'text-red-800';

  const bodyColor = isApproved
    ? 'text-green-700'
    : isExpired
      ? 'text-amber-700'
      : 'text-red-700';

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-xl border shadow-lg
        animate-slide-in-right
        ${bgClass}
      `}
      role="alert"
    >
      <div className={`p-2 rounded-lg ${iconBgClass}`}>
        {isApproved
          ? <CheckCircleIcon className="w-5 h-5" />
          : isExpired
            ? <ClockIcon className="w-5 h-5" />
            : <XCircleIcon className="w-5 h-5" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <h4 className={`font-semibold ${titleColor}`}>
          Discount {isApproved ? 'Approved' : isExpired ? 'Expired' : 'Denied'}
        </h4>
        <p className={`text-sm mt-0.5 ${bodyColor}`}>
          {escalation.product_name || `Product #${escalation.product_id}`}
          {' — '}
          {parseFloat(escalation.requested_discount_pct).toFixed(1)}% discount
        </p>
        {isExpired && (
          <p className="text-xs text-amber-600 mt-1 italic">
            Request expired — please re-submit if needed
          </p>
        )}
        {isDenied && escalation.review_notes && (
          <p className="text-xs text-red-600 mt-1 italic">
            Reason: {escalation.review_notes}
          </p>
        )}
        {isApproved && escalation.reviewer_name && (
          <p className="text-xs text-green-600 mt-0.5">
            Approved by {escalation.reviewer_name}
          </p>
        )}
        {isApproved && onApplyDiscount && (
          <button
            onClick={() => onApplyDiscount(escalation)}
            className="
              mt-2 inline-flex items-center gap-1 px-3 py-1.5
              text-sm font-semibold rounded-lg transition-colors
              bg-green-600 hover:bg-green-700 text-white
            "
          >
            Apply Discount
          </button>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
      >
        <XMarkIcon className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}

/**
 * Escalation toast container — renders as a portal to document.body
 */
export function EscalationToastContainer({ newlyResolved, clearResolved, onApplyDiscount }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !newlyResolved || newlyResolved.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[100] w-96 max-w-[calc(100vw-2rem)] space-y-3">
      {newlyResolved.map((esc) => (
        <EscalationToastItem
          key={esc.id}
          escalation={esc}
          onDismiss={() => clearResolved(esc.id)}
          onApplyDiscount={onApplyDiscount}
        />
      ))}
    </div>,
    document.body
  );
}

export default EscalationToastContainer;
