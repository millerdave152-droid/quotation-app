/**
 * TeleTime POS - Delegation Modal
 *
 * Allows managers to create and manage delegations of their
 * approval authority to other users.
 *
 * Props:
 *   isOpen   - boolean
 *   onClose  - () => void
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  UserGroupIcon,
  ArrowPathIcon,
  TrashIcon,
  PlusIcon,
  ClockIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  createDelegation,
  getActiveDelegations,
  revokeDelegation,
  getEligibleDelegates,
} from '../../api/approvals';

const TIER_LABELS = {
  1: 'Tier 1 (Salesperson)',
  2: 'Tier 2 (Standard)',
  3: 'Tier 3 (Deep)',
  4: 'Tier 4 (Below Cost)',
};

const DURATION_PRESETS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: 'End of shift (8h)', hours: 8 },
  { label: 'End of day (12h)', hours: 12 },
  { label: 'Custom', hours: null },
];

function formatTimeRemaining(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export default function DelegationModal({ isOpen, onClose }) {
  const [tab, setTab] = useState('active'); // 'active' | 'create'
  const [delegations, setDelegations] = useState({ delegatedTo: [], receivedFrom: [] });
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create form state
  const [selectedDelegate, setSelectedDelegate] = useState(null);
  const [maxTier, setMaxTier] = useState(2);
  const [durationPreset, setDurationPreset] = useState(1);
  const [customHours, setCustomHours] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDelegations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getActiveDelegations();
      const data = res?.data?.data || res?.data || {};
      setDelegations({
        delegatedTo: data.delegatedTo || [],
        receivedFrom: data.receivedFrom || [],
      });
    } catch (err) {
      setError(err?.message || 'Failed to load delegations');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEligible = useCallback(async () => {
    try {
      const res = await getEligibleDelegates();
      const data = res?.data?.data || res?.data || [];
      setEligibleUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[DelegationModal] Failed to load eligible delegates:', err.message);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDelegations();
      fetchEligible();
      setSuccess(null);
      setError(null);
    }
  }, [isOpen, fetchDelegations, fetchEligible]);

  // Auto-refresh countdown every 30s
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      fetchDelegations();
    }, 30000);
    return () => clearInterval(timer);
  }, [isOpen, fetchDelegations]);

  const handleRevoke = async (delegationId) => {
    try {
      await revokeDelegation(delegationId);
      setSuccess('Delegation revoked');
      fetchDelegations();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err?.message || 'Failed to revoke delegation');
    }
  };

  const handleCreate = async () => {
    if (!selectedDelegate) return;

    const preset = DURATION_PRESETS[durationPreset];
    const hours = preset.hours || customHours;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    setSubmitting(true);
    setError(null);
    try {
      await createDelegation({
        delegateId: selectedDelegate.id,
        maxTier,
        expiresAt,
        reason: reason.trim() || null,
      });
      setSuccess(`Authority delegated to ${selectedDelegate.name}`);
      setSelectedDelegate(null);
      setReason('');
      setDurationPreset(1);
      setTab('active');
      fetchDelegations();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create delegation');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">Delegate Authority</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'active'
                ? 'text-purple-700 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Active Delegations
          </button>
          <button
            onClick={() => setTab('create')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'create'
                ? 'text-purple-700 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Create New
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">

          {/* Active Tab */}
          {tab === 'active' && (
            <div className="space-y-4">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && delegations.delegatedTo.length === 0 && delegations.receivedFrom.length === 0 && (
                <div className="text-center py-8">
                  <UserGroupIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No active delegations</p>
                  <button
                    onClick={() => setTab('create')}
                    className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-800"
                  >
                    Create one
                  </button>
                </div>
              )}

              {/* Outgoing delegations */}
              {delegations.delegatedTo.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    You delegated to
                  </p>
                  <div className="space-y-2">
                    {delegations.delegatedTo.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-purple-200 flex items-center justify-center text-xs font-bold text-purple-700">
                          {(d.delegate_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{d.delegate_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-purple-700">
                              Up to Tier {d.max_tier}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              {formatTimeRemaining(d.expires_at)}
                            </span>
                          </div>
                          {d.reason && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{d.reason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleRevoke(d.id)}
                          className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Revoke delegation"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming delegations */}
              {delegations.receivedFrom.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Delegated to you
                  </p>
                  <div className="space-y-2">
                    {delegations.receivedFrom.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-xs font-bold text-blue-700">
                          {(d.delegator_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            From {d.delegator_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-blue-700">
                              Up to Tier {d.max_tier}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              {formatTimeRemaining(d.expires_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refresh */}
              {!loading && (delegations.delegatedTo.length > 0 || delegations.receivedFrom.length > 0) && (
                <button
                  onClick={fetchDelegations}
                  className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 mx-auto"
                >
                  <ArrowPathIcon className="w-4 h-4" /> Refresh
                </button>
              )}
            </div>
          )}

          {/* Create Tab */}
          {tab === 'create' && (
            <div className="space-y-4">
              {/* User Picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delegate to</label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {eligibleUsers.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500 text-center">No eligible users found</p>
                  ) : (
                    eligibleUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedDelegate(u)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                          selectedDelegate?.id === u.id
                            ? 'bg-purple-50 border-l-2 border-purple-500'
                            : 'hover:bg-gray-50 border-l-2 border-transparent'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                          {(u.name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Max Tier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maximum tier</label>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMaxTier(t)}
                      className={`p-2 text-sm rounded-lg border-2 transition-colors ${
                        maxTier === t
                          ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_PRESETS.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => setDurationPreset(i)}
                      className={`p-2 text-xs rounded-lg border-2 transition-colors ${
                        durationPreset === i
                          ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {DURATION_PRESETS[durationPreset]?.hours === null && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      max="72"
                      step="0.5"
                      value={customHours}
                      onChange={(e) => setCustomHours(parseFloat(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <span className="text-sm text-gray-500">hours</span>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Lunch break, day off..."
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Close
          </button>
          {tab === 'create' && (
            <button
              onClick={handleCreate}
              disabled={!selectedDelegate || submitting}
              className="flex-1 h-11 flex items-center justify-center gap-2 text-white font-bold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
                  Delegate
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
