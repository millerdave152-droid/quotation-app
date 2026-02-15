/**
 * TeleTime POS - Batch Manager Selection Modal
 *
 * Manager picker with multi-item summary for batch approval.
 * Shows all items in the batch with their prices/discounts,
 * then lets the salesperson select a manager.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  XMarkIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/formatters';

const ROLE_ORDER = { admin: 0, senior_manager: 1, manager: 2 };

const ROLE_BADGE = {
  salesperson:    { label: 'Salesperson',    bg: 'bg-green-100',  text: 'text-green-700',  ring: 'ring-green-200' },
  manager:        { label: 'Manager',        bg: 'bg-blue-100',   text: 'text-blue-700',   ring: 'ring-blue-200' },
  senior_manager: { label: 'Senior Manager', bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-200' },
  admin:          { label: 'Admin',          bg: 'bg-amber-100',  text: 'text-amber-700',  ring: 'ring-amber-200' },
};

const STATUS_DOT = {
  online: 'bg-green-500',
  away:   'bg-yellow-400',
  offline:'bg-gray-300',
};

function calculateTier(retailPrice, requestedPrice) {
  if (retailPrice <= 0) return 2;
  const pct = ((retailPrice - requestedPrice) / retailPrice) * 100;
  if (pct <= 10)  return 1;
  if (pct <= 25)  return 2;
  if (pct <= 50)  return 3;
  return 4;
}

function sortManagers(list) {
  return [...list].sort((a, b) => {
    const statusOrder = { online: 0, away: 1, offline: 2 };
    const s = (statusOrder[a.availability] ?? 2) - (statusOrder[b.availability] ?? 2);
    if (s !== 0) return s;
    const p = (a.pending_request_count || 0) - (b.pending_request_count || 0);
    if (p !== 0) return p;
    return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
  });
}

export default function BatchManagerSelectionModal({
  isOpen,
  onClose,
  batchItems,
  onManagerSelected,
}) {
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Compute batch summary
  const summary = useMemo(() => {
    if (!batchItems || batchItems.length === 0) return null;

    let totalRetail = 0;
    let totalRequested = 0;
    let maxTier = 1;

    const itemDetails = batchItems.map((item) => {
      const retail = parseFloat(item.retailPrice || item.basePrice || item.unitPrice || 0);
      const requested = parseFloat(item.requestedPrice || item.overridePrice || item.unitPrice || retail);
      const discountPct = retail > 0 ? ((retail - requested) / retail) * 100 : 0;
      const tier = calculateTier(retail, requested);

      totalRetail += retail;
      totalRequested += requested;
      if (tier > maxTier) maxTier = tier;

      return {
        ...item,
        retail,
        requested,
        discountPct,
        tier,
      };
    });

    const totalDiscountPct = totalRetail > 0
      ? ((totalRetail - totalRequested) / totalRetail) * 100
      : 0;

    return { itemDetails, totalRetail, totalRequested, totalDiscountPct, maxTier };
  }, [batchItems]);

  const maxTier = summary?.maxTier || 2;

  // Fetch managers
  const fetchManagers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get(`/pos-approvals/managers/available?tier=${maxTier}`);
      const data = res?.data ?? res;
      setManagers(sortManagers(Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err?.message || 'Failed to load available managers');
    } finally {
      setIsLoading(false);
    }
  }, [maxTier]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setIsConfirming(false);
      fetchManagers();
    }
  }, [isOpen, fetchManagers]);

  const handleConfirm = () => {
    if (!selectedId) return;
    setIsConfirming(true);
    onManagerSelected(selectedId);
  };

  if (!isOpen || !summary) return null;

  const TIER_COLORS = {
    1: 'bg-green-50 text-green-700',
    2: 'bg-amber-50 text-amber-700',
    3: 'bg-orange-50 text-orange-700',
    4: 'bg-red-50 text-red-700',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Batch Approval Request</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Summary */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Batch Request Summary
          </p>

          {/* Totals row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-gray-50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 uppercase">Items</p>
              <p className="text-lg font-bold text-gray-900">{summary.itemDetails.length}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 uppercase">Total Retail</p>
              <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(summary.totalRetail)}</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-center">
              <p className="text-[10px] text-blue-600 uppercase">Total Requested</p>
              <p className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(summary.totalRequested)}</p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded-md">
              {summary.totalDiscountPct.toFixed(1)}% avg off
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${TIER_COLORS[summary.maxTier] || 'bg-gray-50 text-gray-700'}`}>
              Max Tier {summary.maxTier}
            </span>
          </div>

          {/* Item mini-table */}
          <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1 font-medium text-gray-500">Product</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-500">Retail</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-500">Requested</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-500">Off %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.itemDetails.map((item, i) => (
                  <tr key={item.id || item.productId || i}>
                    <td className="px-2 py-1.5 text-gray-900 truncate max-w-[140px]">
                      {item.productName || item.name || `Item ${i + 1}`}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums">
                      {formatCurrency(item.retail)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-blue-700 font-medium tabular-nums">
                      {formatCurrency(item.requested)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-red-600 tabular-nums">
                      {item.discountPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manager List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Select Manager
          </p>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Loading available managers...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={fetchManagers}
                  className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <ArrowPathIcon className="w-4 h-4" /> Retry
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && managers.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                <UserGroupIcon className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">No managers currently online</p>
              <button
                onClick={fetchManagers}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-center mx-auto"
              >
                <ArrowPathIcon className="w-4 h-4" /> Refresh
              </button>
            </div>
          )}

          {!isLoading && managers.map((mgr) => {
            const badge = ROLE_BADGE[mgr.role] || ROLE_BADGE.manager;
            const dotColor = STATUS_DOT[mgr.availability] || STATUS_DOT.offline;
            const isSelected = selectedId === mgr.id;
            const pending = mgr.pending_request_count || 0;
            const isDelegated = mgr.isDelegated;

            return (
              <button
                key={mgr.id}
                onClick={() => setSelectedId(mgr.id === selectedId ? null : mgr.id)}
                className={`
                  w-full text-left p-3 rounded-xl border-2 transition-all duration-150
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : isDelegated
                      ? 'border-purple-200 bg-purple-50/30 hover:border-purple-300 hover:bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${isSelected ? 'bg-blue-600 text-white' : isDelegated ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-600'}
                    `}>
                      {(mgr.name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${dotColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{mgr.name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ring-1 ${badge.bg} ${badge.text} ${badge.ring}`}>
                        {badge.label}
                      </span>
                    </div>
                    {isDelegated && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ring-1 bg-purple-100 text-purple-700 ring-purple-200">
                          Delegated by {mgr.delegatorName}
                        </span>
                        {mgr.delegationExpires && (
                          <span className="text-[10px] text-gray-400">
                            expires {new Date(mgr.delegationExpires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs capitalize ${mgr.availability === 'online' ? 'text-green-600' : 'text-gray-500'}`}>
                        {mgr.availability}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className={`text-xs ${pending >= 5 ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        {pending} pending
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isSelected ? (
                      <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
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
            onClick={handleConfirm}
            disabled={!selectedId || isConfirming}
            className="
              flex-1 h-12 flex items-center justify-center gap-2
              text-white font-bold
              bg-blue-600 hover:bg-blue-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              rounded-xl transition-colors
            "
          >
            {isConfirming ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Requesting...
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-5 h-5" />
                Request Batch Approval
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
