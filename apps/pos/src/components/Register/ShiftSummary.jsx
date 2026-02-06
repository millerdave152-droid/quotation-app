/**
 * TeleTime POS - Shift Summary Component
 * Shows current shift statistics in a compact or expanded view
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChartBarIcon,
  BanknotesIcon,
  CreditCardIcon,
  ReceiptRefundIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useRegister } from '../../context/RegisterContext';
import { formatCurrency, formatTime, formatDateTime } from '../../utils/formatters';

/**
 * Stat card component
 */
function StatCard({ icon: Icon, label, value, subValue, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
      {subValue && (
        <p className="text-xs text-gray-500 mt-1">{subValue}</p>
      )}
    </div>
  );
}

/**
 * Compact shift summary for header/sidebar
 * @param {object} props
 * @param {function} props.onClick - Callback when clicked to expand
 */
export function ShiftSummaryCompact({ onClick }) {
  const { currentShift, shiftSummary, refreshShiftSummary, hasActiveShift } = useRegister();
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!hasActiveShift || !currentShift) {
    return null;
  }

  const summary = shiftSummary?.summary || {};
  const transactionCount = summary.transactionCount || 0;
  const totalSales = summary.totalSales || 0;

  // Calculate shift duration
  const getShiftDuration = () => {
    if (!currentShift.openedAt) return '0h 0m';
    const start = new Date(currentShift.openedAt);
    const now = new Date();
    const diff = now - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleRefresh = async (e) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await refreshShiftSummary();
    setIsRefreshing(false);
  };

  return (
    <button
      onClick={onClick}
      className="
        flex items-center gap-4 px-4 py-2
        bg-gradient-to-r from-slate-700 to-slate-600
        hover:from-slate-600 hover:to-slate-500
        rounded-lg transition-all
        text-left
      "
    >
      <div className="flex items-center gap-3">
        <ChartBarIcon className="w-5 h-5 text-blue-400" />
        <div>
          <p className="text-sm font-semibold text-white">
            {transactionCount} sales
          </p>
          <p className="text-xs text-slate-400">
            {formatCurrency(totalSales)}
          </p>
        </div>
      </div>

      <div className="h-8 w-px bg-slate-500" />

      <div className="flex items-center gap-2">
        <ClockIcon className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-300">{getShiftDuration()}</span>
      </div>

      <button
        onClick={handleRefresh}
        className="ml-2 p-1.5 hover:bg-slate-600 rounded transition-colors"
      >
        <ArrowPathIcon className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>

      <ChevronDownIcon className="w-4 h-4 text-slate-400" />
    </button>
  );
}

/**
 * Expanded shift summary modal/panel
 * @param {object} props
 * @param {boolean} props.isOpen - Whether panel is open
 * @param {function} props.onClose - Callback to close panel
 */
export function ShiftSummaryPanel({ isOpen, onClose }) {
  const { currentShift, shiftSummary, refreshShiftSummary, getExpectedCash } = useRegister();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh on open
  useEffect(() => {
    if (isOpen) {
      handleRefresh();
    }
  }, [isOpen]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshShiftSummary();
    setIsRefreshing(false);
  };

  if (!isOpen || !currentShift) return null;

  const summary = shiftSummary?.summary || {};
  const paymentBreakdown = summary.paymentBreakdown || {};

  // Calculate shift duration
  const getShiftDuration = () => {
    if (!currentShift.openedAt) return '0h 0m';
    const start = new Date(currentShift.openedAt);
    const now = new Date();
    const diff = now - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Shift Summary</h2>
              <p className="text-sm text-gray-500">{currentShift.registerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowPathIcon className={`w-5 h-5 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {/* Shift Info Banner */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Shift Started</p>
                <p className="font-semibold">{formatDateTime(currentShift.openedAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-blue-200 text-sm">Duration</p>
                <p className="text-2xl font-bold">{getShiftDuration()}</p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={ReceiptRefundIcon}
              label="Transactions"
              value={summary.transactionCount || 0}
              color="blue"
            />
            <StatCard
              icon={BanknotesIcon}
              label="Total Sales"
              value={formatCurrency(summary.totalSales || 0)}
              color="green"
            />
            <StatCard
              icon={ReceiptRefundIcon}
              label="Voids"
              value={summary.voidCount || 0}
              color="yellow"
            />
            <StatCard
              icon={ReceiptRefundIcon}
              label="Refunds"
              value={summary.refundCount || 0}
              subValue={summary.refundTotal ? formatCurrency(summary.refundTotal) : null}
              color="red"
            />
          </div>

          {/* Payment Breakdown */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Payment Methods
            </h3>
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              {Object.entries(paymentBreakdown).length > 0 ? (
                Object.entries(paymentBreakdown).map(([method, data]) => (
                  <div
                    key={method}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-200 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {method === 'cash' ? (
                        <BanknotesIcon className="w-5 h-5 text-green-600" />
                      ) : (
                        <CreditCardIcon className="w-5 h-5 text-blue-600" />
                      )}
                      <span className="font-medium text-gray-900 capitalize">{method}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(data.total || 0)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {data.count || 0} {(data.count || 0) === 1 ? 'payment' : 'payments'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500">
                  No payments yet
                </div>
              )}
            </div>
          </div>

          {/* Cash Drawer */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Cash Drawer
            </h3>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-600">Opening Cash</span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {formatCurrency(currentShift.openingCash || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-600">Cash Sales</span>
                <span className="font-semibold text-green-600 tabular-nums">
                  +{formatCurrency(paymentBreakdown.cash?.total || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Expected in Drawer</span>
                <span className="text-xl font-bold text-gray-900 tabular-nums">
                  {formatCurrency(getExpectedCash())}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Combined shift summary component
 * Renders compact version by default, can expand to full panel
 */
export function ShiftSummary({ variant = 'compact' }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (variant === 'panel') {
    return (
      <ShiftSummaryPanel
        isOpen={true}
        onClose={() => {}}
      />
    );
  }

  return (
    <>
      <ShiftSummaryCompact onClick={() => setIsExpanded(true)} />
      <ShiftSummaryPanel
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
      />
    </>
  );
}

export default ShiftSummary;
