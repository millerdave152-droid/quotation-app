/**
 * TeleTime POS - Manager Approval Panel
 *
 * Full-screen panel that managers use (phone / tablet / desktop) to review,
 * approve, deny, or counter price-override requests from salespeople.
 *
 * Props:
 *   isOpen   – boolean
 *   onClose  – () => void
 *
 * Connects to the backend WebSocket for real-time arrival of new requests
 * and counter-offer responses.  Falls back to polling GET /pending every 15 s.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  CheckIcon,
  XCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  HandThumbDownIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { getApprovalIntelligence } from '../../api/approvals';
import { formatCurrency } from '../../utils/formatters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL = 15_000;
const DENY_REASONS = [
  { code: 'price_too_low',    label: 'Price too low' },
  { code: 'not_authorized',   label: 'Not authorized for this product' },
  { code: 'contact_owner',    label: 'Contact owner' },
  { code: 'other',            label: 'Other' },
];
const TIER_LABELS = {
  1: 'Tier 1 – Salesperson Discretion',
  2: 'Tier 2 – Standard Override',
  3: 'Tier 3 – Deep Override',
  4: 'Tier 4 – Below Cost',
};
const TIER_COLORS = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
// Web Audio chime (short two-tone notification)
// ---------------------------------------------------------------------------
let _audioCtx = null;
function playChime() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Two ascending tones
    osc.frequency.setValueAtTime(587, now);        // D5
    osc.frequency.setValueAtTime(784, now + 0.12); // G5
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Silently fail — audio not critical
  }
}

// ---------------------------------------------------------------------------
// Margin bar component
// ---------------------------------------------------------------------------
function MarginBar({ cost, retail, requested }) {
  const range = retail - cost;
  if (range <= 0) return null;

  const marginPct = retail > 0 ? ((requested - cost) / retail) * 100 : 0;
  const position = Math.max(0, Math.min(100, ((requested - cost) / range) * 100));

  let barColor = 'bg-green-500';
  if (marginPct < 0)       barColor = 'bg-gray-900';
  else if (marginPct < 5)  barColor = 'bg-red-500';
  else if (marginPct < 15) barColor = 'bg-yellow-400';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>Cost</span>
        <span>Retail</span>
      </div>
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        {/* Gradient zones */}
        <div className="absolute inset-y-0 left-0 bg-red-200 rounded-l-full" style={{ width: '15%' }} />
        <div className="absolute inset-y-0 bg-yellow-100" style={{ left: '15%', width: '20%' }} />
        <div className="absolute inset-y-0 bg-green-100 rounded-r-full" style={{ left: '35%', right: '0' }} />

        {/* Filled portion */}
        <div
          className={`absolute inset-y-0 left-0 ${barColor} rounded-l-full transition-all duration-300`}
          style={{ width: `${position}%` }}
        />

        {/* Marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-md bg-gray-800 transition-all duration-300"
          style={{ left: `calc(${position}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-500 tabular-nums">{formatCurrency(cost)}</span>
        <span className="text-gray-500 tabular-nums">{formatCurrency(retail)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live timer
// ---------------------------------------------------------------------------
function LiveTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const isUrgent = elapsed >= 120;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
      <ClockIcon className={`w-3.5 h-3.5 ${isUrgent ? 'text-red-500 animate-pulse' : ''}`} />
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------
function ToastContainer({ toasts, onDismiss }) {
  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-80 max-w-[calc(100vw-2rem)] space-y-2 pointer-events-auto">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`
            flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
            animate-[slideDown_0.3s_ease-out]
            ${t.type === 'success' ? 'bg-green-600 text-white' : ''}
            ${t.type === 'error'   ? 'bg-red-600 text-white' : ''}
            ${t.type === 'warning' ? 'bg-amber-500 text-white' : ''}
            ${t.type === 'info'    ? 'bg-blue-600 text-white' : ''}
          `}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-70 hover:opacity-100">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Product history (collapsible)
// ---------------------------------------------------------------------------
function ProductHistory({ requestId, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/pos-approvals/${requestId}/product-history?limit=5`);
      setHistory(res?.data ?? res ?? []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (expanded && history === null) fetchHistory();
  }, [expanded, history, fetchHistory]);

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span>Previous overrides</span>
        {expanded
          ? <ChevronUpIcon className="w-4 h-4" />
          : <ChevronDownIcon className="w-4 h-4" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {loading ? (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No previous overrides</p>
          ) : (
            <div className="space-y-1.5">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between text-[11px] text-gray-600 py-1 border-b border-gray-50 last:border-0">
                  <span className="tabular-nums">{new Date(h.responded_at).toLocaleDateString()}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(parseFloat(h.approved_price))}</span>
                  <span className={`tabular-nums ${parseFloat(h.margin_percent) < 5 ? 'text-red-500' : ''}`}>
                    {parseFloat(h.margin_percent).toFixed(1)}%
                  </span>
                  <span className="text-gray-400 truncate max-w-[80px]">{h.manager_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Intelligence (collapsible)
// ---------------------------------------------------------------------------
function PricingIntelligence({ requestId, cost, retail, requested, customerId }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIntel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getApprovalIntelligence(requestId, customerId);
      setData(res?.data?.data || res?.data || res);
    } catch (err) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [requestId, customerId]);

  useEffect(() => {
    if (expanded && data === null && !loading) fetchIntel();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const fp = data?.floorPrice;
  const ph = data?.priceHistory;
  const cc = data?.customerContext;
  const qm = data?.quickMath;

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .572.729 6.016 6.016 0 0 0 2.856 0A.75.75 0 0 0 12 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.553 7.553 0 0 1-2.274 0Z" />
          </svg>
          Pricing Intelligence
        </span>
        {expanded
          ? <ChevronUpIcon className="w-4 h-4" />
          : <ChevronDownIcon className="w-4 h-4" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loading && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 py-1">{error}</p>
          )}

          {data && (
            <>
              {/* ---- Quick Math ---- */}
              {qm && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Math</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">At {formatCurrency(requested)}:</span>
                      <span className="font-bold text-gray-900">You make {formatCurrency(qm.marginAtRequested)} / unit</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">At retail:</span>
                      <span className="font-medium text-gray-500">You'd make {formatCurrency(qm.marginAtRetail)} / unit</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>Giving up:</span>
                      <span className="font-bold">{formatCurrency(qm.givingUp)} ({(qm.marginPctAtRetail - qm.marginPctAtRequested).toFixed(1)}% less margin)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ---- Floor Price ---- */}
              {fp && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Suggested Floor Price</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      Minimum at {fp.minMarginPct}% margin:
                    </span>
                    <span className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(fp.price)}</span>
                  </div>
                  {fp.aboveFloor ? (
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      Above floor
                    </span>
                  ) : (
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      Below floor by {formatCurrency(fp.belowFloorBy)}
                    </span>
                  )}
                </div>
              )}

              {/* ---- Price History ---- */}
              {ph && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Price History</p>
                  {ph.recent.length > 0 ? (
                    <>
                      <div className="space-y-1">
                        {ph.recent.map(h => (
                          <div key={h.id} className="flex items-center justify-between text-[11px] text-gray-600 py-0.5 border-b border-gray-100 last:border-0">
                            <span className="tabular-nums">{new Date(h.date).toLocaleDateString()}</span>
                            <span className="font-medium tabular-nums">{formatCurrency(h.approvedPrice)}</span>
                            <span className={`tabular-nums ${h.marginPercent < 5 ? 'text-red-500' : ''}`}>
                              {h.marginPercent.toFixed(1)}%
                            </span>
                            <span className="text-gray-400 truncate max-w-[70px]">{h.managerName}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-xs pt-1">
                        <span className="text-gray-500">Avg approved:</span>
                        <span className="font-bold text-gray-900 tabular-nums">{formatCurrency(ph.avgApprovedPrice)}</span>
                      </div>
                      {ph.isLowestEver && (
                        <div className="flex items-start gap-1.5 mt-1 p-2 bg-amber-50 border border-amber-200 rounded-md">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-700 font-medium">
                            This would be the lowest price ever approved for this product
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">No previous overrides for this product</p>
                  )}
                </div>
              )}

              {/* ---- Customer Context ---- */}
              {cc && (
                <div className="bg-indigo-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Customer Context</p>
                  <p className="text-xs font-semibold text-gray-900">{cc.name}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Lifetime spend:</span>
                      <span className="font-bold text-gray-900 tabular-nums">{formatCurrency(cc.totalSpend)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transactions:</span>
                      <span className="font-bold text-gray-900">{cc.transactionCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Past overrides:</span>
                      <span className="font-bold text-gray-900">{cc.overrideCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Customer since:</span>
                      <span className="font-medium text-gray-700">{new Date(cc.customerSince).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {cc.lastOverride && (
                    <div className="text-[11px] text-gray-600 pt-1 border-t border-indigo-100">
                      Last override: {cc.lastOverride.product} at {formatCurrency(cc.lastOverride.price)} ({new Date(cc.lastOverride.date).toLocaleDateString()})
                    </div>
                  )}
                </div>
              )}
              {!cc && (
                <p className="text-[11px] text-gray-400 italic">No customer linked to this request</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single request card
// ---------------------------------------------------------------------------
function RequestCard({ req: r, onAction, actionLoading, isMobile }) {
  const [mode, setMode] = useState(null); // null | 'counter' | 'deny'
  const [counterPrice, setCounterPrice] = useState('');
  const [denyCode, setDenyCode] = useState('');
  const [denyNote, setDenyNote] = useState('');
  const counterRef = useRef(null);

  const cost      = parseFloat(r.cost_at_time) || 0;
  const retail    = parseFloat(r.original_price) || 0;
  const requested = parseFloat(r.requested_price) || 0;
  const reqMarginAmt  = requested - cost;
  const reqMarginPct  = requested > 0 ? ((requested - cost) / requested) * 100 : -100;
  const normMarginAmt = retail - cost;
  const normMarginPct = retail > 0 ? ((retail - cost) / retail) * 100 : 0;

  // Counter-offer live margin
  const counterNum = parseFloat(counterPrice) || 0;
  const counterMarginAmt = counterNum - cost;
  const counterMarginPct = counterNum > 0 ? ((counterNum - cost) / counterNum) * 100 : 0;

  const isActing = actionLoading === r.id;

  useEffect(() => {
    if (mode === 'counter' && counterRef.current) {
      counterRef.current.focus();
    }
  }, [mode]);

  const handleApprove = () => onAction(r.id, 'approve');
  const handleCounter = () => {
    if (!counterNum || counterNum <= 0) return;
    onAction(r.id, 'counter', { counterPrice: counterNum });
    setMode(null);
    setCounterPrice('');
  };
  const handleDeny = () => {
    if (!denyCode) return;
    onAction(r.id, 'deny', {
      reasonCode: denyCode,
      reasonNote: denyCode === 'other' ? denyNote : DENY_REASONS.find(d => d.code === denyCode)?.label,
    });
    setMode(null);
    setDenyCode('');
    setDenyNote('');
  };

  const tierLabel = TIER_LABELS[r.tier] || `Tier ${r.tier}`;
  const tierColor = TIER_COLORS[r.tier] || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300">
      {/* ---- HEADER ---- */}
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{r.salesperson_name}</p>
            <p className="text-xs text-gray-400">Walk-in</p>
          </div>
          <LiveTimer createdAt={r.created_at} />
        </div>
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColor}`}>
          {tierLabel}
        </span>
      </div>

      {/* ---- PRICING GRID ---- */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Retail</span>
            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(retail)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Cost</span>
            <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Requested</span>
            <span className="font-bold text-blue-700 tabular-nums">{formatCurrency(requested)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Margin @req</span>
            <span className={`font-bold tabular-nums ${reqMarginPct < 5 ? 'text-red-600' : reqMarginPct < 15 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatCurrency(reqMarginAmt)} ({reqMarginPct.toFixed(1)}%)
            </span>
          </div>
          <div className="col-span-2 flex justify-between text-gray-400">
            <span>Normal margin</span>
            <span className="tabular-nums">{formatCurrency(normMarginAmt)} ({normMarginPct.toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* ---- MARGIN BAR ---- */}
      <div className="px-4 pb-3">
        <MarginBar cost={cost} retail={retail} requested={requested} />
      </div>

      {/* ---- PRICING INTELLIGENCE ---- */}
      <PricingIntelligence
        requestId={r.id}
        cost={cost}
        retail={retail}
        requested={requested}
        customerId={r.customer_id}
      />

      {/* ---- ACTIONS ---- */}
      <div className="px-4 pb-4 space-y-2">
        {mode === null && (
          <>
            {/* APPROVE - full width, large */}
            <button
              onClick={handleApprove}
              disabled={isActing}
              className="
                w-full h-14
                flex items-center justify-center gap-2
                text-base font-bold
                bg-green-600 text-white
                hover:bg-green-700 active:bg-green-800
                disabled:opacity-50 disabled:cursor-not-allowed
                rounded-xl transition-colors
              "
            >
              {isActing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckIcon className="w-5 h-5" />
                  Approve {formatCurrency(requested)}
                </>
              )}
            </button>

            {/* COUNTER + DENY row */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('counter')}
                disabled={isActing}
                className="
                  flex-1 h-12
                  flex items-center justify-center gap-2
                  text-sm font-bold
                  bg-amber-50 text-amber-700 border border-amber-200
                  hover:bg-amber-100 active:bg-amber-200
                  disabled:opacity-50
                  rounded-xl transition-colors
                "
              >
                <CurrencyDollarIcon className="w-5 h-5" />
                Counter
              </button>
              <button
                onClick={() => setMode('deny')}
                disabled={isActing}
                className="
                  flex-1 h-12
                  flex items-center justify-center gap-2
                  text-sm font-bold
                  bg-red-50 text-red-700 border border-red-200
                  hover:bg-red-100 active:bg-red-200
                  disabled:opacity-50
                  rounded-xl transition-colors
                "
              >
                <HandThumbDownIcon className="w-5 h-5" />
                Deny
              </button>
            </div>
          </>
        )}

        {/* ---- COUNTER PANEL ---- */}
        {mode === 'counter' && (
          <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-xs font-semibold text-amber-800">Counter-offer price</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 text-lg font-medium">$</span>
              <input
                ref={counterRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={cost}
                max={retail}
                value={counterPrice}
                onChange={e => setCounterPrice(e.target.value)}
                placeholder="0.00"
                className="
                  w-full h-14 pl-8 pr-4
                  text-2xl font-bold text-right text-gray-900
                  border-2 border-amber-300 rounded-xl
                  focus:border-amber-500 focus:ring-2 focus:ring-amber-200
                  bg-white
                "
              />
            </div>
            {counterNum > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className={`font-bold ${counterMarginPct < 5 ? 'text-red-600' : counterMarginPct < 15 ? 'text-amber-700' : 'text-green-600'}`}>
                  Margin: {formatCurrency(counterMarginAmt)} ({counterMarginPct.toFixed(1)}%)
                </span>
                <MarginBar cost={cost} retail={retail} requested={counterNum} />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setMode(null); setCounterPrice(''); }}
                className="flex-1 h-11 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCounter}
                disabled={!counterNum || counterNum <= 0 || counterNum > retail || isActing}
                className="
                  flex-1 h-11
                  flex items-center justify-center gap-2
                  text-sm font-bold text-white
                  bg-amber-600 hover:bg-amber-700
                  disabled:bg-gray-300 disabled:cursor-not-allowed
                  rounded-xl transition-colors
                "
              >
                {isActing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ChatBubbleLeftEllipsisIcon className="w-4 h-4" />
                    Send Counter
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ---- DENY PANEL ---- */}
        {mode === 'deny' && (
          <div className="space-y-3 p-3 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs font-semibold text-red-800">Reason for denial</p>
            <div className="grid grid-cols-2 gap-2">
              {DENY_REASONS.map(d => (
                <button
                  key={d.code}
                  onClick={() => setDenyCode(d.code)}
                  className={`
                    h-10 px-3 text-xs font-medium text-left rounded-lg transition-colors
                    ${denyCode === d.code
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }
                  `}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {denyCode === 'other' && (
              <input
                type="text"
                value={denyNote}
                onChange={e => setDenyNote(e.target.value)}
                placeholder="Enter reason…"
                className="w-full h-10 px-3 text-sm border border-red-300 rounded-lg focus:ring-2 focus:ring-red-200 bg-white"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setMode(null); setDenyCode(''); setDenyNote(''); }}
                className="flex-1 h-11 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeny}
                disabled={!denyCode || (denyCode === 'other' && !denyNote.trim()) || isActing}
                className="
                  flex-1 h-11
                  flex items-center justify-center gap-2
                  text-sm font-bold text-white
                  bg-red-600 hover:bg-red-700
                  disabled:bg-gray-300 disabled:cursor-not-allowed
                  rounded-xl transition-colors
                "
              >
                {isActing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <XCircleIcon className="w-4 h-4" />
                    Confirm Deny
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- PRODUCT HISTORY ---- */}
      <ProductHistory requestId={r.id} defaultExpanded={!isMobile} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function ManagerApprovalPanel({ isOpen, onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const toastIdRef = useRef(0);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // ----- TOAST HELPERS ---------------------------------------------------
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ----- FETCH PENDING ---------------------------------------------------
  const fetchPending = useCallback(async () => {
    try {
      const res = await api.get('/pos-approvals/pending');
      const data = res?.data ?? res;
      setRequests(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to load pending requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // ----- WEBSOCKET -------------------------------------------------------
  const connectWS = useCallback(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws?token=${token}`;

    try {
      const ws = new WebSocket(url);

      ws.onmessage = (evt) => {
        try {
          const { event, data } = JSON.parse(evt.data);

          if (event === 'approval:request') {
            // New request arrived — add to queue, play chime
            setRequests(prev => {
              if (prev.some(r => r.id === data.requestId)) return prev;
              // Map WS payload to the same shape as the REST endpoint
              const mapped = {
                id: data.requestId,
                product_name: data.productName,
                salesperson_name: data.salespersonName,
                original_price: data.originalPrice,
                requested_price: data.requestedPrice,
                cost_at_time: data.cost,
                margin_amount: data.marginAmount,
                margin_percent: data.marginPercent,
                tier: data.tier,
                tier_name: data.tierName,
                created_at: data.createdAt,
                status: 'pending',
              };
              return [mapped, ...prev];
            });
            playChime();
            addToast(`New request from ${data.salespersonName}`, 'info');
          }

          if (event === 'approval:counter-accepted') {
            addToast(`Counter accepted by ${data.salespersonName}`, 'success');
            // Remove from queue — it's now approved
            setRequests(prev => prev.filter(r => r.id !== data.requestId));
          }

          if (event === 'approval:counter-declined') {
            addToast(`${data.salespersonName} declined counter`, 'warning');
            // Request is back to pending — refresh to get latest state
            fetchPending();
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Reconnect after 5s if still open
        if (isOpen) {
          setTimeout(() => { if (isOpen) connectWS(); }, 5000);
        }
      };

      ws.onerror = () => ws.close();

      wsRef.current = ws;
    } catch {
      // WebSocket not available — polling is the fallback
    }
  }, [isOpen, addToast, fetchPending]);

  // ----- LIFECYCLE -------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchPending();
    connectWS();

    pollRef.current = setInterval(fetchPending, POLL_INTERVAL);

    return () => {
      clearInterval(pollRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen, fetchPending, connectWS]);

  // ----- ACTIONS ---------------------------------------------------------
  const handleAction = useCallback(async (requestId, action, payload = {}) => {
    setActionLoading(requestId);
    try {
      if (action === 'approve') {
        const res = await api.post(`/pos-approvals/${requestId}/approve`, { method: 'remote' });
        const approved = res?.data ?? res;
        setRequests(prev => prev.filter(r => r.id !== requestId));
        addToast(`Approved – ${formatCurrency(parseFloat(approved?.approved_price || 0))}`, 'success');
      }
      else if (action === 'counter') {
        await api.post(`/pos-approvals/${requestId}/counter`, { counterPrice: payload.counterPrice });
        setRequests(prev => prev.filter(r => r.id !== requestId));
        addToast(`Counter sent: ${formatCurrency(payload.counterPrice)}`, 'warning');
      }
      else if (action === 'deny') {
        await api.post(`/pos-approvals/${requestId}/deny`, {
          reasonCode: payload.reasonCode,
          reasonNote: payload.reasonNote || null,
        });
        setRequests(prev => prev.filter(r => r.id !== requestId));
        addToast('Denied', 'error');
      }
    } catch (err) {
      addToast(err?.message || `Failed to ${action}`, 'error');
    } finally {
      setActionLoading(null);
    }
  }, [addToast]);

  // ----- RENDER ----------------------------------------------------------
  if (!isOpen) return null;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* ---- HEADER BAR ---- */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-900">Price Override Approvals</h1>
            {requests.length > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 text-[11px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
                {requests.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchPending}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ---- CONTENT ---- */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-4 space-y-4">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading pending requests…</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  <button
                    onClick={() => { setLoading(true); fetchPending(); }}
                    className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 flex items-center gap-1"
                  >
                    <ArrowPathIcon className="w-4 h-4" /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && requests.length === 0 && (
              <div className="text-center py-20 space-y-3">
                <div className="w-16 h-16 mx-auto bg-green-50 rounded-full flex items-center justify-center">
                  <CheckIcon className="w-8 h-8 text-green-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">No pending requests</p>
                <p className="text-xs text-gray-400">
                  New requests will appear here in real-time
                </p>
              </div>
            )}

            {/* Request cards */}
            {!loading && requests.map(r => (
              <RequestCard
                key={r.id}
                req={r}
                onAction={handleAction}
                actionLoading={actionLoading}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
