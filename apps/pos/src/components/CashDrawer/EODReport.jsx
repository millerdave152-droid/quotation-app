/**
 * TeleTime POS - End of Day Report
 * Comprehensive closing report with reconciliation
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  BanknotesIcon,
  CreditCardIcon,
  ChartBarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  const configs = {
    balanced: {
      icon: CheckCircleIcon,
      label: 'Balanced',
      className: 'bg-green-100 text-green-700'
    },
    variance: {
      icon: ExclamationTriangleIcon,
      label: 'Variance',
      className: 'bg-yellow-100 text-yellow-700'
    },
    open: {
      icon: ClockIcon,
      label: 'Open Shifts',
      className: 'bg-blue-100 text-blue-700'
    }
  };

  const config = configs[status] || configs.variance;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.className}`}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

/**
 * Shift summary row
 */
function ShiftRow({ shift }) {
  const hasVariance = shift.variance !== null && Math.abs(shift.variance) >= 0.01;
  const varianceClass = !hasVariance ? '' : shift.variance >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <BanknotesIcon className="w-6 h-6 text-slate-600" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900">{shift.registerName}</p>
          {shift.status === 'open' && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Open</span>
          )}
        </div>
        <p className="text-sm text-gray-500">{shift.cashierName}</p>
        <p className="text-xs text-gray-400">
          {new Date(shift.openedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          {shift.closedAt && (
            <> - {new Date(shift.closedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</>
          )}
        </p>
      </div>

      <div className="text-right">
        <p className="font-semibold text-gray-900 tabular-nums">
          {formatCurrency(shift.totalSales)}
        </p>
        <p className="text-sm text-gray-500">
          {shift.transactionCount} txns
        </p>
        {shift.variance !== null && (
          <p className={`text-sm font-medium tabular-nums ${varianceClass}`}>
            {shift.variance >= 0 ? '+' : ''}{formatCurrency(shift.variance)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Payment method summary
 */
function PaymentSummary({ payments }) {
  const methodIcons = {
    cash: BanknotesIcon,
    credit: CreditCardIcon,
    debit: CreditCardIcon,
    gift_card: BanknotesIcon,
    account: BanknotesIcon
  };

  const methodColors = {
    cash: 'bg-green-100 text-green-600',
    credit: 'bg-blue-100 text-blue-600',
    debit: 'bg-purple-100 text-purple-600',
    gift_card: 'bg-pink-100 text-pink-600',
    account: 'bg-orange-100 text-orange-600'
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(payments).map(([method, data]) => {
        const Icon = methodIcons[method] || BanknotesIcon;
        const colorClass = methodColors[method] || 'bg-gray-100 text-gray-600';

        return (
          <div key={method} className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500 capitalize">{method.replace('_', ' ')}</p>
                <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(data.total)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">{data.count} transactions</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * End of Day Report Component
 * @param {object} props
 * @param {string} props.date - Date for the report (YYYY-MM-DD)
 * @param {function} props.onClose - Close callback
 */
export function EODReport({ date: initialDate, onClose }) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load report
  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/cash-drawer/eod-report?date=${date}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load report');
      }

      setReport(result.data);
    } catch (err) {
      console.error('[EODReport] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Get overall status
  const getStatus = () => {
    if (!report) return 'variance';
    if (report.shiftSummary.openShifts > 0) return 'open';
    if (Math.abs(report.cashReconciliation.totalVariance || 0) < 1) return 'balanced';
    return 'variance';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Generating report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircleIcon className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Report</h3>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={loadReport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!report) return null;

  const status = getStatus();

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 print:border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">End of Day Report</h1>
            <p className="text-sm text-gray-500">Cash reconciliation and sales summary</p>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-4 print:hidden">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="h-10 px-3 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <PrinterIcon className="w-5 h-5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto p-4 print:p-0">
        {/* Grand Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
            <p className="text-blue-100 text-sm">Total Sales</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(report.grandTotal)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
            <p className="text-green-100 text-sm">Cash Sales</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(report.payments.cash?.total || 0)}
            </p>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
            <p className="text-orange-100 text-sm">Safe Drops</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(report.safeDrops.total)}</p>
          </div>

          <div className={`rounded-xl p-4 text-white ${
            status === 'balanced'
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
              : 'bg-gradient-to-br from-yellow-500 to-yellow-600'
          }`}>
            <p className="text-white/80 text-sm">Cash Variance</p>
            <p className="text-2xl font-bold tabular-nums">
              {report.cashReconciliation.totalVariance !== null
                ? (report.cashReconciliation.totalVariance >= 0 ? '+' : '') +
                  formatCurrency(report.cashReconciliation.totalVariance)
                : 'N/A'
              }
            </p>
          </div>
        </div>

        {/* Shifts Section */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5" />
              Shift Summary ({report.shifts.length} shifts)
            </h2>
          </div>
          <div className="p-4">
            {report.shifts.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No shifts for this date</p>
            ) : (
              report.shifts.map(shift => (
                <ShiftRow key={shift.shiftId} shift={shift} />
              ))
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5" />
            Payment Methods
          </h2>
          <PaymentSummary payments={report.payments} />
        </div>

        {/* Safe Drops */}
        {report.safeDrops.details.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ArrowDownTrayIcon className="w-5 h-5" />
                Safe Drops ({report.safeDrops.count})
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {report.safeDrops.details.map(drop => (
                <div key={drop.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{drop.registerName}</p>
                    <p className="text-sm text-gray-500">{drop.reason}</p>
                    <p className="text-xs text-gray-400">
                      {drop.performedBy} • {new Date(drop.createdAt).toLocaleTimeString('en-CA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(drop.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Voids & Refunds */}
        {(report.voids.count > 0 || report.refunds.count > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                Voids & Refunds
              </h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-600 mb-1">Voided Transactions</p>
                <p className="text-xl font-bold text-red-700">{report.voids.count}</p>
                <p className="text-sm text-red-600 tabular-nums">{formatCurrency(report.voids.total)}</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-orange-600 mb-1">Refunds</p>
                <p className="text-xl font-bold text-orange-700">{report.refunds.count}</p>
                <p className="text-sm text-orange-600 tabular-nums">{formatCurrency(report.refunds.total)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Cash Reconciliation Summary */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <BanknotesIcon className="w-5 h-5" />
              Cash Reconciliation
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Total Cash Sales</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(report.cashReconciliation.totalCashSales)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Safe Drops</span>
              <span className="font-semibold text-orange-600 tabular-nums">
                -{formatCurrency(report.cashReconciliation.totalDrops)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Cash Refunds</span>
              <span className="font-semibold text-red-600 tabular-nums">
                -{formatCurrency(report.refunds.total)}
              </span>
            </div>
            <div className="flex justify-between py-3 text-lg">
              <span className="font-semibold text-gray-900">Total Variance</span>
              <span className={`font-bold tabular-nums ${
                status === 'balanced' ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {report.cashReconciliation.totalVariance !== null
                  ? (report.cashReconciliation.totalVariance >= 0 ? '+' : '') +
                    formatCurrency(report.cashReconciliation.totalVariance)
                  : 'N/A (shifts still open)'
                }
              </span>
            </div>
          </div>
        </div>

        {/* Report Footer */}
        <div className="mt-6 text-center text-sm text-gray-400">
          <p>Report generated: {formatDateTime(new Date(report.generatedAt))}</p>
        </div>
      </div>
    </div>
  );
}

export default EODReport;
