/**
 * TeleTime POS - Pending Overrides Component
 *
 * Manager panel for reviewing and approving/rejecting price overrides
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  UserIcon,
  TagIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { useCustomerPricing } from '../../hooks/useCustomerPricing';

// ============================================================================
// STATUS BADGE
// ============================================================================

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-700',
    icon: ClockIcon,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircleIcon,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-700',
    icon: XCircleIcon,
  },
  auto_approved: {
    label: 'Auto-Approved',
    color: 'bg-blue-100 text-blue-700',
    icon: CheckCircleIcon,
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5
        text-xs font-medium rounded-full
        ${config.color}
      `}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// OVERRIDE CARD
// ============================================================================

function OverrideCard({ override, onApprove, onReject, isProcessing }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  const discountFromBase =
    ((override.originalPriceCents - override.overridePriceCents) /
      override.originalPriceCents) *
    100;

  const handleApprove = () => {
    onApprove(override.id, approvalNotes || null);
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      return;
    }
    onReject(override.id, rejectReason);
    setShowRejectInput(false);
    setRejectReason('');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {override.productName}
          </h3>
          <p className="text-xs text-gray-500">{override.productSku}</p>
        </div>
        <StatusBadge status={override.status} />
      </div>

      {/* Customer Info */}
      {override.customerName && (
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
          <UserIcon className="w-4 h-4" />
          <span>{override.customerName}</span>
          {override.pricingTier && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              {override.pricingTier}
            </span>
          )}
        </div>
      )}

      {/* Price Comparison */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 bg-gray-50 rounded text-center">
          <p className="text-xs text-gray-500">Original</p>
          <p className="text-sm font-medium text-gray-400 line-through tabular-nums">
            {formatCurrency(override.originalPrice)}
          </p>
        </div>
        {override.customerTierPrice && (
          <div className="p-2 bg-blue-50 rounded text-center">
            <p className="text-xs text-blue-600">Tier Price</p>
            <p className="text-sm font-medium text-blue-700 tabular-nums">
              {formatCurrency(override.customerTierPrice)}
            </p>
          </div>
        )}
        <div className="p-2 bg-green-50 rounded text-center">
          <p className="text-xs text-green-600">Override</p>
          <p className="text-sm font-bold text-green-700 tabular-nums">
            {formatCurrency(override.overridePrice)}
          </p>
        </div>
      </div>

      {/* Discount Info */}
      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-gray-500">Total Discount:</span>
        <span className="font-medium text-green-600">
          {discountFromBase.toFixed(1)}% ({formatCurrency(Math.abs(override.priceDifference))})
        </span>
      </div>

      {/* Reason */}
      <div className="p-2 bg-gray-50 rounded mb-3">
        <p className="text-xs text-gray-500 mb-1">Reason:</p>
        <p className="text-sm text-gray-700">{override.overrideReason}</p>
      </div>

      {/* Requested By */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>Requested by: {override.requestedBy}</span>
        <span>{new Date(override.createdAt).toLocaleString()}</span>
      </div>

      {/* Approval Notes Input */}
      {override.status === 'pending' && !showRejectInput && (
        <div className="mb-3">
          <input
            type="text"
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder="Add approval notes (optional)"
            className="
              w-full h-9 px-3 text-sm
              border border-gray-200 rounded-lg
              focus:border-blue-500 focus:ring-1 focus:ring-blue-200
            "
          />
        </div>
      )}

      {/* Reject Reason Input */}
      {showRejectInput && (
        <div className="mb-3 space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason (required)"
            rows={2}
            className="
              w-full px-3 py-2 text-sm
              border border-red-200 rounded-lg
              focus:border-red-500 focus:ring-1 focus:ring-red-200
            "
          />
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={!rejectReason.trim() || isProcessing}
              className="
                flex-1 h-9
                text-sm font-medium
                text-white bg-red-600 hover:bg-red-700
                disabled:bg-gray-300
                rounded-lg
              "
            >
              Confirm Reject
            </button>
            <button
              onClick={() => {
                setShowRejectInput(false);
                setRejectReason('');
              }}
              className="
                h-9 px-4
                text-sm font-medium
                text-gray-600 bg-gray-100 hover:bg-gray-200
                rounded-lg
              "
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {override.status === 'pending' && !showRejectInput && (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="
              flex-1 h-10
              flex items-center justify-center gap-2
              text-sm font-medium
              text-white bg-green-600 hover:bg-green-700
              disabled:bg-gray-300
              rounded-lg
              transition-colors
            "
          >
            <CheckCircleIcon className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={isProcessing}
            className="
              flex-1 h-10
              flex items-center justify-center gap-2
              text-sm font-medium
              text-white bg-red-600 hover:bg-red-700
              disabled:bg-gray-300
              rounded-lg
              transition-colors
            "
          >
            <XCircleIcon className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}

      {/* Approved/Rejected Info */}
      {override.status !== 'pending' && override.approvedBy && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            {override.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
            {override.approvedBy} on{' '}
            {new Date(override.approvedAt).toLocaleString()}
          </p>
          {override.approvalNotes && (
            <p className="text-sm text-gray-600 mt-1">
              Notes: {override.approvalNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PENDING OVERRIDES PANEL
// ============================================================================

/**
 * Panel showing pending price overrides for manager approval
 */
export function PendingOverridesPanel({ onClose, className = '' }) {
  const { getPendingOverrides, approveOverride, rejectOverride } =
    useCustomerPricing({});

  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState(null);

  // Fetch pending overrides
  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPendingOverrides({ limit: 50 });
      setOverrides(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getPendingOverrides]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  // Handle approve
  const handleApprove = useCallback(
    async (id, notes) => {
      setProcessing(id);

      const result = await approveOverride(id, notes);

      if (result.success) {
        setOverrides((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, status: 'approved', ...result.override } : o
          )
        );
      } else {
        setError(result.error);
      }

      setProcessing(null);
    },
    [approveOverride]
  );

  // Handle reject
  const handleReject = useCallback(
    async (id, reason) => {
      setProcessing(id);

      const result = await rejectOverride(id, reason);

      if (result.success) {
        setOverrides((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, status: 'rejected', ...result.override } : o
          )
        );
      } else {
        setError(result.error);
      }

      setProcessing(null);
    },
    [rejectOverride]
  );

  const pendingCount = overrides.filter((o) => o.status === 'pending').length;

  return (
    <div className={`bg-gray-50 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <BanknotesIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Pending Price Overrides
            </h2>
            <p className="text-sm text-gray-500">
              {pendingCount} {pendingCount === 1 ? 'override' : 'overrides'}{' '}
              awaiting approval
            </p>
          </div>
        </div>
        <button
          onClick={fetchOverrides}
          disabled={loading}
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-500 hover:text-gray-700
            hover:bg-white
            rounded-lg
            transition-colors
          "
        >
          <ArrowPathIcon
            className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && overrides.length === 0 && (
        <div className="py-8 text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading overrides...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && overrides.length === 0 && (
        <div className="py-8 text-center">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
          <p className="text-lg font-medium text-gray-900">All Caught Up!</p>
          <p className="text-sm text-gray-500">
            No pending price overrides to review.
          </p>
        </div>
      )}

      {/* Override List */}
      {overrides.length > 0 && (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {overrides.map((override) => (
            <OverrideCard
              key={override.id}
              override={override}
              onApprove={handleApprove}
              onReject={handleReject}
              isProcessing={processing === override.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MINI NOTIFICATION BADGE
// ============================================================================

/**
 * Small badge showing pending override count
 */
export function PendingOverridesBadge({ onClick }) {
  const { getPendingOverrides } = useCustomerPricing({});
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const data = await getPendingOverrides({ limit: 1 });
      // In production, use a count endpoint
      setCount(data.length);
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000); // Poll every 30s

    return () => clearInterval(interval);
  }, [getPendingOverrides]);

  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="
        relative
        flex items-center gap-2
        px-3 py-2
        text-sm font-medium
        text-amber-700
        bg-amber-100 hover:bg-amber-200
        rounded-lg
        transition-colors
      "
    >
      <ClockIcon className="w-4 h-4" />
      <span>{count} Pending</span>
      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
    </button>
  );
}

export default PendingOverridesPanel;
