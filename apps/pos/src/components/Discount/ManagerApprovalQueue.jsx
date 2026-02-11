/**
 * TeleTime POS - Manager Discount Approval Queue
 * Real-time list of pending escalation requests with approve/deny actions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  TagIcon,
  ChartBarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { getPendingEscalations, approveEscalation, denyEscalation } from '../../api/discountAuthority';

const POLL_INTERVAL = 30000; // 30 seconds

/**
 * Manager approval queue for discount escalation requests
 */
export function ManagerApprovalQueue({ isOpen, onClose }) {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // escalation id being acted on
  const [denyReasonId, setDenyReasonId] = useState(null); // which escalation is showing deny input
  const [denyReason, setDenyReason] = useState('');
  const [approveNotesId, setApproveNotesId] = useState(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const fetchEscalations = useCallback(async () => {
    try {
      const result = await getPendingEscalations();
      setEscalations(result?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to load escalations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + poll
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchEscalations();

    pollRef.current = setInterval(fetchEscalations, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [isOpen, fetchEscalations]);

  const handleApprove = useCallback(async (id) => {
    setActionLoading(id);
    try {
      await approveEscalation(id, approveNotes || null);
      setEscalations(prev => prev.filter(e => e.id !== id));
      setApproveNotesId(null);
      setApproveNotes('');
    } catch (err) {
      setError(err?.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  }, [approveNotes]);

  const handleDeny = useCallback(async (id) => {
    if (!denyReason.trim()) {
      setError('A reason is required when denying');
      return;
    }
    setActionLoading(id);
    try {
      await denyEscalation(id, denyReason.trim());
      setEscalations(prev => prev.filter(e => e.id !== id));
      setDenyReasonId(null);
      setDenyReason('');
    } catch (err) {
      setError(err?.message || 'Failed to deny');
    } finally {
      setActionLoading(null);
    }
  }, [denyReason]);

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="relative z-50 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Discount Approvals</h2>
            {escalations.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {escalations.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchEscalations}
              className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : escalations.length === 0 ? (
            <div className="text-center py-12">
              <CheckIcon className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No pending approvals</p>
              <p className="text-xs text-gray-400 mt-1">All discount requests have been handled</p>
            </div>
          ) : (
            escalations.map((esc) => (
              <div key={esc.id} className="border border-gray-200 rounded-xl p-4 space-y-3 hover:border-blue-200 transition-colors">
                {/* Requestor + Time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{esc.employee_name}</p>
                      <p className="text-[10px] text-gray-400">{esc.product_name || `Product #${esc.product_id}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <ClockIcon className="w-3 h-3" />
                    {timeAgo(esc.created_at)}
                  </div>
                </div>

                {/* Request Details */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5 text-center">
                    <p className="text-gray-400 text-[10px]">Requested</p>
                    <p className="font-bold text-gray-900">{parseFloat(esc.requested_discount_pct).toFixed(1)}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5 text-center">
                    <p className="text-gray-400 text-[10px]">Margin After</p>
                    <p className={`font-bold ${parseFloat(esc.margin_after_discount) < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                      {parseFloat(esc.margin_after_discount).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5 text-center">
                    <p className="text-gray-400 text-[10px]">Comm. Impact</p>
                    <p className="font-bold text-red-600">-{formatCurrency(parseFloat(esc.commission_impact))}</p>
                  </div>
                </div>

                {/* Reason */}
                {esc.reason && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">
                    "{esc.reason}"
                  </p>
                )}

                {/* Approve Notes Input */}
                {approveNotesId === esc.id && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={approveNotes}
                      onChange={(e) => setApproveNotes(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(esc.id)}
                        disabled={actionLoading === esc.id}
                        className="flex-1 h-8 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {actionLoading === esc.id ? 'Approving...' : 'Confirm Approve'}
                      </button>
                      <button
                        onClick={() => { setApproveNotesId(null); setApproveNotes(''); }}
                        className="h-8 px-3 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Deny Reason Input */}
                {denyReasonId === esc.id && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={denyReason}
                      onChange={(e) => { setDenyReason(e.target.value); setError(null); }}
                      placeholder="Reason for denying (required)..."
                      className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeny(esc.id)}
                        disabled={actionLoading === esc.id || !denyReason.trim()}
                        className="flex-1 h-8 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {actionLoading === esc.id ? 'Denying...' : 'Confirm Deny'}
                      </button>
                      <button
                        onClick={() => { setDenyReasonId(null); setDenyReason(''); }}
                        className="h-8 px-3 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons (when not in input mode) */}
                {approveNotesId !== esc.id && denyReasonId !== esc.id && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setApproveNotesId(esc.id); setDenyReasonId(null); }}
                      disabled={actionLoading === esc.id}
                      className="
                        flex-1 h-9 flex items-center justify-center gap-1.5
                        text-xs font-semibold rounded-lg
                        bg-green-50 text-green-700 border border-green-200
                        hover:bg-green-100 active:bg-green-200
                        transition-all disabled:opacity-50
                      "
                    >
                      <CheckIcon className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => { setDenyReasonId(esc.id); setApproveNotesId(null); }}
                      disabled={actionLoading === esc.id}
                      className="
                        flex-1 h-9 flex items-center justify-center gap-1.5
                        text-xs font-semibold rounded-lg
                        bg-red-50 text-red-700 border border-red-200
                        hover:bg-red-100 active:bg-red-200
                        transition-all disabled:opacity-50
                      "
                    >
                      <XCircleIcon className="w-4 h-4" />
                      Deny
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-xs text-red-700">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ManagerApprovalQueue;
