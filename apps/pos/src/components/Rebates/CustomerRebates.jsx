/**
 * TeleTime POS - Customer Rebates Component
 * View and manage customer rebate claims
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Urgency Badge Component
 */
function UrgencyBadge({ urgency }) {
  const styles = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    urgent: 'bg-amber-100 text-amber-800 border-amber-200',
    pending: 'bg-blue-100 text-blue-800 border-blue-200',
    completed: 'bg-gray-100 text-gray-600 border-gray-200',
    expired: 'bg-gray-100 text-gray-500 border-gray-200',
  };

  const labels = {
    critical: 'Expires Soon!',
    urgent: 'Urgent',
    pending: 'Pending',
    completed: 'Completed',
    expired: 'Expired',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[urgency] || styles.pending}`}>
      {labels[urgency] || urgency}
    </span>
  );
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    submitted: 'bg-blue-100 text-blue-800',
    processing: 'bg-purple-100 text-purple-800',
    approved: 'bg-green-100 text-green-800',
    denied: 'bg-red-100 text-red-800',
    paid: 'bg-emerald-100 text-emerald-800',
    expired: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/**
 * Rebate Type Icon
 */
function RebateTypeIcon({ type }) {
  if (type === 'mail_in') {
    return (
      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

/**
 * Single Rebate Claim Card
 */
function RebateClaimCard({ claim, onMarkSubmitted, isUpdating }) {
  const [showDetails, setShowDetails] = useState(false);
  const [claimReference, setClaimReference] = useState('');

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount) => `$${parseFloat(amount || 0).toFixed(2)}`;

  const handleSubmit = () => {
    onMarkSubmitted(claim.claimId, claimReference);
  };

  const isPending = claim.status === 'pending';
  const isExpiringSoon = claim.daysRemaining <= 7 && claim.daysRemaining > 0;

  return (
    <div className={`bg-white rounded-lg border ${isExpiringSoon && isPending ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'} overflow-hidden`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <RebateTypeIcon type={claim.rebate.type} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{claim.rebate.name}</h4>
              <p className="text-sm text-gray-500">{claim.rebate.manufacturer}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(claim.rebate.amount)}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={claim.status} />
              {isPending && <UrgencyBadge urgency={claim.urgency} />}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-4 text-sm">
        {claim.deadline && (
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={claim.daysRemaining <= 3 ? 'text-red-600 font-medium' : claim.daysRemaining <= 7 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
              Deadline: {formatDate(claim.deadline)}
              {claim.daysRemaining > 0 && isPending && ` (${claim.daysRemaining} days)`}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <span className="text-gray-600">Order: #{claim.orderId || claim.transactionId}</span>
        </div>
        {claim.submittedAt && (
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-600">Submitted: {formatDate(claim.submittedAt)}</span>
          </div>
        )}
      </div>

      {/* Expandable Details */}
      <div className="px-4 py-2 border-t border-gray-100">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <svg className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {showDetails && (
        <div className="px-4 pb-4 space-y-4">
          {/* Products */}
          {claim.products && claim.products.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Qualifying Products:</h5>
              <ul className="text-sm text-gray-600 space-y-1">
                {claim.products.map((product, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                    {product.productName}
                    {product.quantity > 1 && <span className="text-gray-400">(x{product.quantity})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Requirements */}
          {claim.rebate.requirements && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Requirements:</h5>
              <div className="flex flex-wrap gap-2">
                {claim.rebate.requirements.receipt && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Receipt
                  </span>
                )}
                {claim.rebate.requirements.upc && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    UPC Barcode
                  </span>
                )}
                {claim.rebate.requirements.registration && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Product Registration
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Terms URL */}
          {claim.rebate.termsUrl && (
            <a
              href={claim.rebate.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Terms & Conditions
            </a>
          )}

          {/* Actions for pending claims */}
          {isPending && (
            <div className="pt-4 border-t border-gray-200 space-y-3">
              {claim.rebate.submissionUrl && (
                <a
                  href={claim.rebate.submissionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Submit Rebate Online
                </a>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Confirmation/Reference # (optional)"
                  value={claimReference}
                  onChange={(e) => setClaimReference(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSubmit}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                >
                  {isUpdating ? 'Updating...' : 'Mark Submitted'}
                </button>
              </div>
            </div>
          )}

          {/* Reference for submitted claims */}
          {claim.claimReference && (
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Confirmation:</span> {claim.claimReference}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Summary Stats Component
 */
function RebateSummary({ summary }) {
  const formatCurrency = (amount) => `$${parseFloat(amount || 0).toFixed(2)}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-green-50 rounded-lg p-4 border border-green-100">
        <p className="text-sm text-green-600 font-medium">Pending Rebates</p>
        <p className="text-2xl font-bold text-green-700">{summary.totalPending}</p>
        <p className="text-sm text-green-600">{formatCurrency(summary.totalAmount)} available</p>
      </div>
      <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
        <p className="text-sm text-amber-600 font-medium">Urgent</p>
        <p className="text-2xl font-bold text-amber-700">{summary.urgentCount}</p>
        <p className="text-sm text-amber-600">need attention</p>
      </div>
      <div className="bg-red-50 rounded-lg p-4 border border-red-100">
        <p className="text-sm text-red-600 font-medium">Expiring Soon</p>
        <p className="text-2xl font-bold text-red-700">{summary.expiringCount}</p>
        <p className="text-sm text-red-600">within 7 days</p>
      </div>
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
        <p className="text-sm text-blue-600 font-medium">Total Savings</p>
        <p className="text-2xl font-bold text-blue-700">{formatCurrency(summary.totalAmount)}</p>
        <p className="text-sm text-blue-600">potential value</p>
      </div>
    </div>
  );
}

/**
 * Main CustomerRebates Component
 */
export function CustomerRebates({ customerId, onClose }) {
  const [claims, setClaims] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingClaimId, setUpdatingClaimId] = useState(null);
  const [filter, setFilter] = useState('pending'); // 'pending', 'all'

  const fetchRebates = useCallback(async () => {
    if (!customerId) return;

    try {
      setIsLoading(true);
      setError(null);

      const token = localStorage.getItem('pos_token');
      const includeAll = filter === 'all';

      const response = await fetch(
        `${API_BASE}/rebates/customer/${customerId}?includeAll=${includeAll}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch rebates');
      }

      const data = await response.json();
      setClaims(data.claims || []);
      setSummary(data.summary || {});
    } catch (err) {
      console.error('[CustomerRebates] Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [customerId, filter]);

  useEffect(() => {
    fetchRebates();
  }, [fetchRebates]);

  const handleMarkSubmitted = async (claimId, claimReference) => {
    try {
      setUpdatingClaimId(claimId);

      const token = localStorage.getItem('pos_token');
      const response = await fetch(
        `${API_BASE}/rebates/customer/${customerId}/claims/${claimId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            claimReference: claimReference || undefined,
            submissionMethod: 'online',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update claim');
      }

      // Refresh the list
      await fetchRebates();
    } catch (err) {
      console.error('[CustomerRebates] Update error:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingClaimId(null);
    }
  };

  if (!customerId) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p>Select a customer to view their rebates</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Customer Rebates</h2>
          <p className="text-sm text-gray-500">View and manage rebate claims</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === 'pending'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchRebates}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p className="font-medium">Error loading rebates</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : claims.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 text-lg font-medium">No {filter === 'pending' ? 'pending ' : ''}rebates found</p>
            <p className="text-gray-400 text-sm mt-1">
              {filter === 'pending'
                ? 'All rebates have been submitted or there are none available'
                : 'This customer has no rebate claims'}
            </p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            {summary && <RebateSummary summary={summary} />}

            {/* Claims List */}
            <div className="space-y-4">
              {claims.map((claim) => (
                <RebateClaimCard
                  key={claim.claimId}
                  claim={claim}
                  onMarkSubmitted={handleMarkSubmitted}
                  isUpdating={updatingClaimId === claim.claimId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Customer Rebates Modal Wrapper
 */
export function CustomerRebatesModal({ isOpen, onClose, customerId, customerName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Custom Header with Customer Name */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-500 to-emerald-600">
          <div className="text-white">
            <h2 className="text-xl font-bold">Customer Rebates</h2>
            {customerName && <p className="text-green-100">{customerName}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <CustomerRebates customerId={customerId} />
        </div>
      </div>
    </div>
  );
}

export default CustomerRebates;
