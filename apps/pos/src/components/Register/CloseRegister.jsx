/**
 * TeleTime POS - Close Register Component
 * Full screen process for closing a shift with cash count and variance
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  CalculatorIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { useRegister } from '../../context/RegisterContext';
import { formatCurrency } from '../../utils/formatters';

/**
 * Cash denominations for Canadian currency
 */
const DENOMINATIONS = [
  { id: 'bills_100', label: '$100 Bills', value: 100, type: 'bill' },
  { id: 'bills_50', label: '$50 Bills', value: 50, type: 'bill' },
  { id: 'bills_20', label: '$20 Bills', value: 20, type: 'bill' },
  { id: 'bills_10', label: '$10 Bills', value: 10, type: 'bill' },
  { id: 'bills_5', label: '$5 Bills', value: 5, type: 'bill' },
  { id: 'coins_2', label: '$2 Coins (Toonies)', value: 2, type: 'coin' },
  { id: 'coins_1', label: '$1 Coins (Loonies)', value: 1, type: 'coin' },
  { id: 'coins_025', label: '25¢ Quarters', value: 0.25, type: 'coin' },
  { id: 'coins_010', label: '10¢ Dimes', value: 0.10, type: 'coin' },
  { id: 'coins_005', label: '5¢ Nickels', value: 0.05, type: 'coin' },
];

/**
 * Get variance status and styling
 */
function getVarianceStatus(variance) {
  const absVariance = Math.abs(variance);

  if (absVariance <= 5) {
    return {
      level: 'good',
      color: 'green',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      icon: CheckCircleIcon,
      message: 'Variance is within acceptable range',
    };
  } else if (absVariance <= 20) {
    return {
      level: 'warning',
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      borderColor: 'border-yellow-200',
      icon: ExclamationTriangleIcon,
      message: 'Variance requires explanation',
    };
  } else {
    return {
      level: 'error',
      color: 'red',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      icon: ExclamationTriangleIcon,
      message: 'Significant variance detected - please verify count',
    };
  }
}

/**
 * Denomination input row
 */
function DenominationRow({ denomination, count, onChange }) {
  const { id, label, value } = denomination;
  const total = count * value;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">× {formatCurrency(value)}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(id, Math.max(0, count - 1))}
          className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
        >
          -
        </button>
        <input
          type="number"
          min="0"
          value={count || ''}
          onChange={(e) => onChange(id, Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 h-10 text-center text-lg font-semibold border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={() => onChange(id, count + 1)}
          className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
        >
          +
        </button>
      </div>

      <div className="w-24 text-right">
        <span className="text-lg font-semibold text-gray-900 tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Close register component
 * @param {object} props
 * @param {function} props.onBack - Callback to cancel and go back
 * @param {function} props.onComplete - Callback when register is closed
 * @param {function} props.onPrintReport - Callback to print end-of-day report
 */
export function CloseRegister({ onBack, onComplete, onPrintReport }) {
  const {
    currentShift,
    shiftSummary,
    closeShift,
    getExpectedCash,
    refreshShiftSummary,
  } = useRegister();

  // State
  const [step, setStep] = useState('count'); // 'count' | 'review' | 'complete'
  const [mode, setMode] = useState('simple'); // 'simple' | 'detailed'
  const [simpleTotal, setSimpleTotal] = useState('');
  const [denominations, setDenominations] = useState(
    DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.id]: 0 }), {})
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [closingData, setClosingData] = useState(null);

  // Refresh summary on mount
  useEffect(() => {
    refreshShiftSummary();
  }, []);

  // Calculate totals
  const detailedTotal = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => sum + (denominations[d.id] || 0) * d.value, 0);
  }, [denominations]);

  const countedCash = mode === 'simple'
    ? parseFloat(simpleTotal) || 0
    : detailedTotal;

  const expectedCash = getExpectedCash();
  const variance = countedCash - expectedCash;
  const varianceStatus = getVarianceStatus(variance);

  // Handle denomination change
  const handleDenominationChange = useCallback((id, count) => {
    setDenominations(prev => ({ ...prev, [id]: count }));
    setError(null);
  }, []);

  // Handle simple total change
  const handleSimpleTotalChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setSimpleTotal(value);
      setError(null);
    }
  };

  // Clear all
  const handleClear = () => {
    setSimpleTotal('');
    setDenominations(DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.id]: 0 }), {}));
    setError(null);
  };

  // Continue to review
  const handleContinueToReview = () => {
    if (countedCash <= 0) {
      setError('Please enter the cash count');
      return;
    }
    setStep('review');
  };

  // Handle submit
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await closeShift(countedCash, notes);

      if (result.success) {
        setClosingData(result.data);
        setStep('complete');
        onComplete?.(result.data);
      } else {
        setError(result.error || 'Failed to close register');
      }
    } catch (err) {
      console.error('[CloseRegister] Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle print report
  const handlePrintReport = () => {
    onPrintReport?.(closingData || { shiftSummary, currentShift, countedCash, variance });
  };

  const summary = shiftSummary?.summary || {};
  const paymentBreakdown = summary.paymentBreakdown || {};
  const VarianceIcon = varianceStatus.icon;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          {step !== 'complete' && (
            <button
              onClick={step === 'review' ? () => setStep('count') : onBack}
              className="w-10 h-10 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold">Close Register</h1>
            <p className="text-slate-400 text-sm">{currentShift?.registerName}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Step: Count Cash */}
          {step === 'count' && (
            <>
              {/* Expected Cash Banner */}
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-sm">Expected Cash in Drawer</p>
                    <p className="text-3xl font-bold tabular-nums">{formatCurrency(expectedCash)}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-blue-200">Opening: {formatCurrency(currentShift?.openingCash || 0)}</p>
                    <p className="text-blue-200">+ Cash Sales: {formatCurrency(paymentBreakdown.cash?.total || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="mb-6 flex bg-white rounded-xl p-1 shadow-sm">
                <button
                  onClick={() => setMode('simple')}
                  className={`
                    flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                    ${mode === 'simple' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}
                  `}
                >
                  <CurrencyDollarIcon className="w-5 h-5" />
                  Simple Entry
                </button>
                <button
                  onClick={() => setMode('detailed')}
                  className={`
                    flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2
                    ${mode === 'detailed' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}
                  `}
                >
                  <CalculatorIcon className="w-5 h-5" />
                  Denomination Count
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Simple Entry */}
              {mode === 'simple' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <BanknotesIcon className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Closing Cash Count</h2>
                      <p className="text-sm text-gray-500">Enter the total cash in the drawer</p>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={simpleTotal}
                      onChange={handleSimpleTotalChange}
                      placeholder="0.00"
                      className="
                        w-full h-16 pl-10 pr-4
                        text-3xl font-bold text-center
                        border-2 border-gray-200 rounded-xl
                        focus:border-blue-500 focus:ring-4 focus:ring-blue-100
                        transition-all
                      "
                    />
                  </div>
                </div>
              )}

              {/* Detailed Entry */}
              {mode === 'detailed' && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                      <BanknotesIcon className="w-5 h-5" />
                      Bills
                    </h3>
                  </div>
                  <div className="px-4">
                    {DENOMINATIONS.filter(d => d.type === 'bill').map((d) => (
                      <DenominationRow
                        key={d.id}
                        denomination={d}
                        count={denominations[d.id]}
                        onChange={handleDenominationChange}
                      />
                    ))}
                  </div>

                  <div className="p-4 bg-gray-50 border-t border-b border-gray-200">
                    <h3 className="font-semibold text-gray-700">Coins</h3>
                  </div>
                  <div className="px-4">
                    {DENOMINATIONS.filter(d => d.type === 'coin').map((d) => (
                      <DenominationRow
                        key={d.id}
                        denomination={d}
                        count={denominations[d.id]}
                        onChange={handleDenominationChange}
                      />
                    ))}
                  </div>

                  <div className="p-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={handleClear}
                      className="w-full h-10 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}

              {/* Variance Preview */}
              {countedCash > 0 && (
                <div className={`p-4 rounded-xl border-2 ${varianceStatus.bgColor} ${varianceStatus.borderColor}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <VarianceIcon className={`w-6 h-6 ${varianceStatus.textColor}`} />
                    <span className={`font-semibold ${varianceStatus.textColor}`}>
                      {varianceStatus.message}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Variance:</span>
                    <span className={`text-xl font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <p className="text-sm text-gray-500 mb-1">Expected Cash</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(expectedCash)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <p className="text-sm text-gray-500 mb-1">Counted Cash</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(countedCash)}</p>
                </div>
              </div>

              {/* Variance Banner */}
              <div className={`mb-6 p-6 rounded-xl border-2 ${varianceStatus.bgColor} ${varianceStatus.borderColor}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    varianceStatus.level === 'good' ? 'bg-green-100' :
                    varianceStatus.level === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <VarianceIcon className={`w-7 h-7 ${varianceStatus.textColor}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${varianceStatus.textColor}`}>
                      Cash Variance
                    </p>
                    <p className={`text-3xl font-bold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                    </p>
                  </div>
                </div>
                <p className={`mt-3 text-sm ${varianceStatus.textColor}`}>
                  {varianceStatus.message}
                </p>
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                  {varianceStatus.level !== 'good' && (
                    <span className="text-red-500 ml-1">- Please explain the variance</span>
                  )}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about the shift or explain cash variance..."
                  rows={4}
                  className="
                    w-full px-4 py-3
                    border-2 border-gray-200 rounded-xl
                    focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                    resize-none
                  "
                />
              </div>

              {/* Shift Summary */}
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Shift Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Transactions</span>
                    <span className="font-semibold">{summary.transactionCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Sales</span>
                    <span className="font-semibold text-green-600">{formatCurrency(summary.totalSales || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Voids</span>
                    <span className="font-semibold">{summary.voidCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Refunds</span>
                    <span className="font-semibold text-red-600">
                      {summary.refundCount || 0} ({formatCurrency(summary.refundTotal || 0)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircleIcon className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Register Closed</h2>
              <p className="text-gray-500 mb-8">
                Your shift has been closed successfully.
              </p>

              {/* Final Summary */}
              <div className="bg-white rounded-xl p-6 shadow-sm text-left mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Final Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Sales</span>
                    <span className="font-bold text-green-600">{formatCurrency(summary.totalSales || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transactions</span>
                    <span className="font-semibold">{summary.transactionCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cash Variance</span>
                    <span className={`font-semibold ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Print Report Button */}
              <button
                onClick={handlePrintReport}
                className="
                  w-full h-14 mb-4
                  flex items-center justify-center gap-2
                  bg-blue-600 hover:bg-blue-700
                  text-white text-lg font-bold
                  rounded-xl
                  transition-colors
                "
              >
                <PrinterIcon className="w-6 h-6" />
                Print End-of-Day Report
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      {step !== 'complete' && (
        <footer className="bg-white border-t border-gray-200 p-6">
          <div className="max-w-3xl mx-auto">
            {step === 'count' && (
              <button
                onClick={handleContinueToReview}
                disabled={countedCash <= 0}
                className="
                  w-full h-14
                  flex items-center justify-center gap-2
                  bg-blue-600 hover:bg-blue-700
                  disabled:bg-gray-300 disabled:cursor-not-allowed
                  text-white text-lg font-bold
                  rounded-xl
                  transition-colors
                "
              >
                Continue to Review
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="
                  w-full h-14
                  flex items-center justify-center gap-2
                  bg-red-600 hover:bg-red-700
                  disabled:bg-gray-300 disabled:cursor-not-allowed
                  text-white text-lg font-bold
                  rounded-xl
                  transition-colors
                "
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Closing Register...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-6 h-6" />
                    Close Register
                  </>
                )}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

export default CloseRegister;
