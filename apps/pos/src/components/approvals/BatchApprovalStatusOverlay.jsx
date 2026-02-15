/**
 * TeleTime POS - Batch Approval Status Overlay
 *
 * Full-screen overlay for batch approval lifecycle:
 * pending, approved, consuming, done, denied, timed_out, error.
 */

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ClockIcon,
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

export default function BatchApprovalStatusOverlay({
  isOpen,
  flowState,
  batchResult,
  approvedChildren,
  approvedByName,
  denyReason,
  error,
  onCancel,
  onClose,
}) {
  // Auto-close after "done"
  useEffect(() => {
    if (flowState === 'done') {
      const t = setTimeout(() => onClose?.(), 1500);
      return () => clearTimeout(t);
    }
  }, [flowState, onClose]);

  if (!isOpen) return null;

  const parent = batchResult?.parent;
  const children = batchResult?.children || [];
  const itemCount = children.length || parent?.batch_label?.match(/(\d+) items/)?.[1] || '?';
  const totalRequested = parent ? parseFloat(parent.requested_price || parent.original_price || 0) : 0;
  const totalOriginal = parent ? parseFloat(parent.original_price || 0) : 0;

  // -------------------------------------------------------------------
  // PENDING
  // -------------------------------------------------------------------
  if (flowState === 'pending') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Awaiting Batch Approval</h2>
              </div>
              <LiveTimer createdAt={parent?.created_at} />
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-gray-50 rounded-lg">
                <p className="text-[10px] text-gray-500 uppercase">Items</p>
                <p className="text-lg font-bold text-gray-900">{itemCount}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg">
                <p className="text-[10px] text-gray-500 uppercase">Retail</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(totalOriginal)}</p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <p className="text-[10px] text-blue-600 uppercase">Requested</p>
                <p className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(totalRequested)}</p>
              </div>
            </div>

            {parent?.batch_label && (
              <div className="flex justify-center">
                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-md">
                  {parent.batch_label}
                </span>
              </div>
            )}

            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Waiting for manager response...</p>
            </div>
          </div>

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
  // APPROVED / CONSUMING / DONE
  // -------------------------------------------------------------------
  if (flowState === 'approved' || flowState === 'consuming' || flowState === 'done') {
    const displayChildren = approvedChildren.length > 0 ? approvedChildren : children;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-green-50 border-b border-green-100">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
              <h2 className="text-lg font-bold text-green-800">
                {flowState === 'done' ? 'Batch Prices Applied!' : 'Batch Approved!'}
              </h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {approvedByName && (
              <p className="text-sm text-green-600 text-center">
                Approved by {approvedByName}
              </p>
            )}

            {/* Approved items table */}
            {displayChildren.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-green-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-green-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium text-green-700">Item</th>
                      <th className="text-right px-2 py-1 font-medium text-green-700">Approved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {displayChildren.map((child, i) => (
                      <tr key={child.childId || child.id || i}>
                        <td className="px-2 py-1.5 text-gray-900 truncate max-w-[200px]">
                          {child.product_name || child.productName || `Item ${i + 1}`}
                        </td>
                        <td className="px-2 py-1.5 text-right text-green-700 font-bold tabular-nums">
                          {formatCurrency(child.approvedPrice || child.approved_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {flowState === 'consuming' && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                Applying prices...
              </div>
            )}

            {flowState === 'done' && (
              <p className="text-center text-sm text-green-600 font-medium">
                All prices have been applied to the cart.
              </p>
            )}
          </div>

          {flowState !== 'consuming' && (
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="w-full h-12 text-white font-bold bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
              >
                {flowState === 'done' ? 'Done' : 'Close'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // DENIED
  // -------------------------------------------------------------------
  if (flowState === 'denied') {
    const REASON_LABELS = {
      price_too_low: 'Price too low',
      margin: 'Insufficient margin',
      not_authorized: 'Not authorized',
      contact_owner: 'Contact owner',
      other: 'Other',
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2">
              <XCircleIcon className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-red-800">Batch Request Denied</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
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
              All items will revert to their original prices.
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
  // TIMED OUT
  // -------------------------------------------------------------------
  if (flowState === 'timed_out') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="p-5 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-600" />
              <h2 className="text-lg font-bold text-amber-800">Batch Request Timed Out</h2>
            </div>
          </div>

          <div className="p-5">
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
  // ERROR
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
