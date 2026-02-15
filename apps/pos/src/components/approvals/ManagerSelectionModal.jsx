/**
 * TeleTime POS - Manager Selection Modal
 *
 * Displayed when a salesperson requests a price override that exceeds their
 * Tier 1 authority.  Shows available managers (sorted: online-first, fewest
 * pending, highest role) and lets the salesperson pick one before the
 * approval request is created.
 *
 * Props:
 *   isOpen              – boolean
 *   onClose             – () => void
 *   cartItem            – { id, productId, productName, retailPrice, requestedPrice, cost? }
 *   onManagerSelected   – (managerId: number) => void
 *   onPinOverride       – () => void   (optional — opens the PIN modal)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  XMarkIcon,
  UserGroupIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  CheckCircleIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/formatters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Determine what tier a discount falls into (mirrors backend logic). */
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
    // 1. online before away
    const statusOrder = { online: 0, away: 1, offline: 2 };
    const s = (statusOrder[a.availability] ?? 2) - (statusOrder[b.availability] ?? 2);
    if (s !== 0) return s;
    // 2. fewest pending first
    const p = (a.pending_request_count || 0) - (b.pending_request_count || 0);
    if (p !== 0) return p;
    // 3. higher role first
    return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ManagerSelectionModal({
  isOpen,
  onClose,
  cartItem,
  onManagerSelected,
  onPinOverride,
}) {
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // ------------------------------------------------------------------
  // Derived values
  // ------------------------------------------------------------------
  const retailPrice   = parseFloat(cartItem?.retailPrice) || 0;
  const requestedPrice = parseFloat(cartItem?.requestedPrice) || 0;
  const cost          = cartItem?.cost != null ? parseFloat(cartItem.cost) : null;
  const discountPct   = retailPrice > 0
    ? (((retailPrice - requestedPrice) / retailPrice) * 100).toFixed(1)
    : '0.0';
  const tier = useMemo(
    () => calculateTier(retailPrice, requestedPrice),
    [retailPrice, requestedPrice],
  );

  const marginPct = cost != null && requestedPrice > 0
    ? (((requestedPrice - cost) / requestedPrice) * 100).toFixed(1)
    : null;

  // ------------------------------------------------------------------
  // Fetch managers when modal opens
  // ------------------------------------------------------------------
  const fetchManagers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get(`/pos-approvals/managers/available?tier=${tier}`);
      const data = res?.data ?? res;
      setManagers(sortManagers(Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err?.message || 'Failed to load available managers');
    } finally {
      setIsLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setIsConfirming(false);
      fetchManagers();
    }
  }, [isOpen, fetchManagers]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleSelect = (id) => {
    setSelectedId(id === selectedId ? null : id);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    setIsConfirming(true);
    onManagerSelected(selectedId);
  };

  // ------------------------------------------------------------------
  // Render gate
  // ------------------------------------------------------------------
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">

        {/* ============================================================== */}
        {/* HEADER                                                         */}
        {/* ============================================================== */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Select Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ============================================================== */}
        {/* REQUEST SUMMARY                                                */}
        {/* ============================================================== */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          {/* Product name */}
          <div className="flex items-start gap-2">
            <TagIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium text-gray-900 leading-tight">
              {cartItem?.productName || 'Unknown product'}
            </p>
          </div>

          {/* Price grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Retail Price</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">
                {formatCurrency(retailPrice)}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600">Requested Price</p>
              <p className="text-lg font-bold text-blue-700 tabular-nums">
                {formatCurrency(requestedPrice)}
              </p>
            </div>
          </div>

          {/* Discount + margin row */}
          <div className="flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-md font-medium">
              {discountPct}% off
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-medium">
              Tier {tier}
            </span>
            {marginPct !== null ? (
              <span className="text-gray-500">
                {parseFloat(marginPct) >= 0
                  ? `${marginPct}% margin`
                  : `${marginPct}% (below cost)`}
              </span>
            ) : (
              <span className="text-gray-400 italic text-xs">
                Manager will see margin details
              </span>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* MANAGER LIST                                                   */}
        {/* ============================================================== */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Loading available managers…</p>
            </div>
          )}

          {/* Error */}
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

          {/* Empty state */}
          {!isLoading && !error && managers.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                <UserGroupIcon className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  No managers currently online
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  You can wait or use PIN override if a manager is nearby.
                </p>
              </div>
              {onPinOverride && (
                <button
                  onClick={onPinOverride}
                  className="
                    inline-flex items-center gap-2
                    px-4 py-2.5
                    text-sm font-medium
                    text-amber-700 bg-amber-50 border border-amber-200
                    rounded-xl hover:bg-amber-100
                    transition-colors
                  "
                >
                  <LockClosedIcon className="w-4 h-4" />
                  Use PIN Override
                </button>
              )}
              <button
                onClick={fetchManagers}
                className="block mx-auto text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-center"
              >
                <ArrowPathIcon className="w-4 h-4" /> Refresh
              </button>
            </div>
          )}

          {/* Manager cards */}
          {!isLoading && managers.map((mgr) => {
            const badge = ROLE_BADGE[mgr.role] || ROLE_BADGE.manager;
            const dotColor = STATUS_DOT[mgr.availability] || STATUS_DOT.offline;
            const isSelected = selectedId === mgr.id;
            const pending = mgr.pending_request_count || 0;
            const isDelegated = mgr.isDelegated;

            return (
              <button
                key={mgr.id}
                onClick={() => handleSelect(mgr.id)}
                className={`
                  w-full text-left
                  p-3 rounded-xl border-2
                  transition-all duration-150
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : isDelegated
                      ? 'border-purple-200 bg-purple-50/30 hover:border-purple-300 hover:bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar / status indicator */}
                  <div className="relative flex-shrink-0">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${isSelected ? 'bg-blue-600 text-white' : isDelegated ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-600'}
                    `}>
                      {(mgr.name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`
                      absolute -bottom-0.5 -right-0.5
                      w-3.5 h-3.5 rounded-full border-2 border-white
                      ${dotColor}
                    `} />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {mgr.name}
                      </p>
                      <span className={`
                        inline-flex items-center
                        px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ring-1
                        ${badge.bg} ${badge.text} ${badge.ring}
                      `}>
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
                      <span className={`text-xs capitalize ${
                        mgr.availability === 'online' ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {mgr.availability}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className={`text-xs ${
                        pending >= 5 ? 'text-red-500 font-medium' : 'text-gray-500'
                      }`}>
                        {pending} pending
                      </span>
                    </div>
                  </div>

                  {/* Selection indicator */}
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

        {/* ============================================================== */}
        {/* FOOTER                                                         */}
        {/* ============================================================== */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="
              flex-1 h-12
              text-gray-700 font-medium
              bg-gray-100 hover:bg-gray-200
              rounded-xl transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || isConfirming}
            className="
              flex-1 h-12
              flex items-center justify-center gap-2
              text-white font-bold
              bg-blue-600 hover:bg-blue-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              rounded-xl transition-colors
            "
          >
            {isConfirming ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Requesting…
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-5 h-5" />
                Request Approval
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
