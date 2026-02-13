/**
 * TeleTime POS - Escalation Status Badge
 * Small badge in Cart header showing pending escalation count.
 * Click opens a dropdown listing all recent escalations.
 */

import { useState, useRef, useEffect } from 'react';
import {
  TagIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * Status badge + dropdown for escalation tracking
 */
export function EscalationStatusBadge({ escalations, pendingCount, onApplyApprovedEscalation }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!escalations || escalations.length === 0) return null;

  const pending = escalations.filter((e) => e.status === 'pending');
  const approved = escalations.filter((e) => e.status === 'approved');
  const denied = escalations.filter((e) => e.status === 'denied');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`${pendingCount} pending escalation${pendingCount !== 1 ? 's' : ''}`}
        className="
          flex items-center gap-1.5
          px-2.5 py-1.5
          bg-amber-100 hover:bg-amber-200
          text-amber-700 text-xs font-semibold
          rounded-lg
          transition-colors duration-150
        "
      >
        <TagIcon className="w-4 h-4" />
        <span>{pendingCount} Pending</span>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">My Discount Requests</h3>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
            {/* Pending */}
            {pending.map((esc) => (
              <div key={esc.id} className="px-4 py-3 flex items-start gap-3">
                <ClockIcon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {esc.product_name || `Product #${esc.product_id}`}
                  </p>
                  <p className="text-xs text-amber-600">
                    {parseFloat(esc.requested_discount_pct).toFixed(1)}% — Pending approval
                  </p>
                </div>
              </div>
            ))}

            {/* Approved */}
            {approved.map((esc) => (
              <div key={esc.id} className="px-4 py-3 flex items-start gap-3">
                <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {esc.product_name || `Product #${esc.product_id}`}
                  </p>
                  <p className="text-xs text-green-600">
                    {parseFloat(esc.requested_discount_pct).toFixed(1)}% — Approved
                    {esc.reviewer_name ? ` by ${esc.reviewer_name}` : ''}
                  </p>
                  {onApplyApprovedEscalation && (
                    <button
                      onClick={() => {
                        onApplyApprovedEscalation(esc);
                        setIsOpen(false);
                      }}
                      className="
                        mt-1.5 inline-flex items-center gap-1
                        px-2.5 py-1 text-xs font-semibold
                        bg-green-600 text-white rounded-md
                        hover:bg-green-700 transition-colors
                      "
                    >
                      Apply Approved Discount
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Denied */}
            {denied.map((esc) => (
              <div key={esc.id} className="px-4 py-3 flex items-start gap-3">
                <XCircleIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {esc.product_name || `Product #${esc.product_id}`}
                  </p>
                  <p className="text-xs text-red-600">
                    {parseFloat(esc.requested_discount_pct).toFixed(1)}% — Denied
                  </p>
                  {esc.review_notes && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">
                      Reason: {esc.review_notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default EscalationStatusBadge;
