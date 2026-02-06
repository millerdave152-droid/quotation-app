/**
 * TeleTime POS - Cash Reconciliation Component
 * Cash drawer reconciliation for end-of-day
 */

import { useState, useEffect, useMemo } from 'react';
import {
  BanknotesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  CalculatorIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value || 0);
}

/**
 * Cash denomination counter
 */
function DenominationCounter({ label, value, count, onChange }) {
  const total = value * count;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="w-16 text-sm font-medium text-gray-700">{label}</span>
      <input
        type="number"
        min="0"
        value={count}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="w-20 px-2 py-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <span className="flex-1 text-right text-sm font-medium text-gray-900">
        {formatCurrency(total)}
      </span>
    </div>
  );
}

/**
 * Quick count buttons
 */
function QuickCountButtons({ onAdd }) {
  const amounts = [20, 50, 100];

  return (
    <div className="flex gap-2 mb-4">
      {amounts.map(amount => (
        <button
          key={amount}
          type="button"
          onClick={() => onAdd(amount)}
          className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
        >
          +${amount}
        </button>
      ))}
    </div>
  );
}

/**
 * Cash Reconciliation Component
 * @param {object} props
 * @param {number} props.expectedCash - Expected cash amount from report
 * @param {number} props.openingCash - Opening cash amount (optional)
 * @param {function} props.onSubmit - Callback when reconciliation is submitted
 * @param {boolean} props.isSubmitting - Whether submission is in progress
 * @param {boolean} props.showDenominations - Show denomination counter (default: false)
 */
export function CashReconciliation({
  expectedCash = 0,
  openingCash = 0,
  onSubmit,
  isSubmitting = false,
  showDenominations = false,
}) {
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [showCounter, setShowCounter] = useState(showDenominations);

  // Denomination counts
  const [denominations, setDenominations] = useState({
    hundred: 0,
    fifty: 0,
    twenty: 0,
    ten: 0,
    five: 0,
    two: 0,
    one: 0,
    quarter: 0,
    dime: 0,
    nickel: 0,
    penny: 0,
  });

  // Calculate denomination total
  const denominationTotal = useMemo(() => {
    return (
      denominations.hundred * 100 +
      denominations.fifty * 50 +
      denominations.twenty * 20 +
      denominations.ten * 10 +
      denominations.five * 5 +
      denominations.two * 2 +
      denominations.one * 1 +
      denominations.quarter * 0.25 +
      denominations.dime * 0.1 +
      denominations.nickel * 0.05 +
      denominations.penny * 0.01
    );
  }, [denominations]);

  // Sync denomination total to actual cash when using counter
  useEffect(() => {
    if (showCounter && denominationTotal > 0) {
      setActualCash(denominationTotal.toFixed(2));
    }
  }, [denominationTotal, showCounter]);

  // Calculate variance
  const actualValue = parseFloat(actualCash) || 0;
  const variance = actualValue - expectedCash;
  const absVariance = Math.abs(variance);
  const requiresNotes = absVariance > 5;

  // Determine status
  const getStatus = () => {
    if (!actualCash) return 'pending';
    if (absVariance <= 0.01) return 'balanced';
    if (variance > 0) return 'over';
    return 'short';
  };

  const status = getStatus();

  const statusConfig = {
    pending: { color: 'gray', icon: CalculatorIcon, label: 'Enter actual cash' },
    balanced: { color: 'green', icon: CheckCircleIcon, label: 'Balanced' },
    over: { color: 'blue', icon: ExclamationTriangleIcon, label: 'Over' },
    short: { color: 'red', icon: XCircleIcon, label: 'Short' },
  };

  const config = statusConfig[status];

  const handleSubmit = () => {
    if (!actualCash) return;
    if (requiresNotes && !notes.trim()) {
      alert('Please provide notes explaining the variance.');
      return;
    }

    onSubmit?.({
      actualCash: actualValue,
      expectedCash,
      variance,
      notes: notes.trim(),
      status,
    });
  };

  const updateDenomination = (key, value) => {
    setDenominations(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-gray-50">
        <div className="p-2 bg-orange-100 rounded-lg">
          <BanknotesIcon className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Cash Reconciliation</h3>
          <p className="text-sm text-gray-500">Count and verify cash drawer</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Expected Cash */}
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-600">Expected Cash</span>
          <span className="text-lg font-bold text-gray-900">{formatCurrency(expectedCash)}</span>
        </div>

        {/* Opening Cash Info */}
        {openingCash > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Opening Cash</span>
            <span className="text-gray-700">{formatCurrency(openingCash)}</span>
          </div>
        )}

        {/* Denomination Counter Toggle */}
        <button
          type="button"
          onClick={() => setShowCounter(!showCounter)}
          className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {showCounter ? 'Hide denomination counter' : 'Use denomination counter'}
        </button>

        {/* Denomination Counter */}
        {showCounter && (
          <div className="border border-gray-200 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Count by Denomination</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {/* Bills */}
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Bills</p>
                <DenominationCounter
                  label="$100"
                  value={100}
                  count={denominations.hundred}
                  onChange={(v) => updateDenomination('hundred', v)}
                />
                <DenominationCounter
                  label="$50"
                  value={50}
                  count={denominations.fifty}
                  onChange={(v) => updateDenomination('fifty', v)}
                />
                <DenominationCounter
                  label="$20"
                  value={20}
                  count={denominations.twenty}
                  onChange={(v) => updateDenomination('twenty', v)}
                />
                <DenominationCounter
                  label="$10"
                  value={10}
                  count={denominations.ten}
                  onChange={(v) => updateDenomination('ten', v)}
                />
                <DenominationCounter
                  label="$5"
                  value={5}
                  count={denominations.five}
                  onChange={(v) => updateDenomination('five', v)}
                />
              </div>

              {/* Coins */}
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Coins</p>
                <DenominationCounter
                  label="$2"
                  value={2}
                  count={denominations.two}
                  onChange={(v) => updateDenomination('two', v)}
                />
                <DenominationCounter
                  label="$1"
                  value={1}
                  count={denominations.one}
                  onChange={(v) => updateDenomination('one', v)}
                />
                <DenominationCounter
                  label="$0.25"
                  value={0.25}
                  count={denominations.quarter}
                  onChange={(v) => updateDenomination('quarter', v)}
                />
                <DenominationCounter
                  label="$0.10"
                  value={0.1}
                  count={denominations.dime}
                  onChange={(v) => updateDenomination('dime', v)}
                />
                <DenominationCounter
                  label="$0.05"
                  value={0.05}
                  count={denominations.nickel}
                  onChange={(v) => updateDenomination('nickel', v)}
                />
              </div>
            </div>

            <div className="mt-3 pt-3 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Counted Total</span>
              <span className="text-lg font-bold text-blue-600">
                {formatCurrency(denominationTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Manual Entry */}
        {!showCounter && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Actual Cash in Drawer
            </label>
            <QuickCountButtons onAdd={(amount) => setActualCash(prev => (parseFloat(prev) || 0) + amount)} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 text-lg font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Variance Display */}
        {actualCash && (
          <div className={`p-4 rounded-lg ${
            status === 'balanced' ? 'bg-green-50 border border-green-200' :
            status === 'over' ? 'bg-blue-50 border border-blue-200' :
            status === 'short' ? 'bg-red-50 border border-red-200' :
            'bg-gray-50 border border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <config.icon className={`w-5 h-5 ${
                  status === 'balanced' ? 'text-green-600' :
                  status === 'over' ? 'text-blue-600' :
                  status === 'short' ? 'text-red-600' :
                  'text-gray-600'
                }`} />
                <span className={`font-medium ${
                  status === 'balanced' ? 'text-green-700' :
                  status === 'over' ? 'text-blue-700' :
                  status === 'short' ? 'text-red-700' :
                  'text-gray-700'
                }`}>
                  {config.label}
                </span>
              </div>
              <span className={`text-lg font-bold ${
                status === 'balanced' ? 'text-green-700' :
                status === 'over' ? 'text-blue-700' :
                status === 'short' ? 'text-red-700' :
                'text-gray-700'
              }`}>
                {variance > 0 ? '+' : ''}{formatCurrency(variance)}
              </span>
            </div>

            {requiresNotes && (
              <p className={`mt-2 text-sm ${
                status === 'over' ? 'text-blue-600' : 'text-red-600'
              }`}>
                <ExclamationTriangleIcon className="inline w-4 h-4 mr-1" />
                Variance exceeds $5. Notes required.
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {(requiresNotes || notes) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes {requiresNotes && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain the variance..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                requiresNotes && !notes.trim() ? 'border-red-300' : 'border-gray-300'
              }`}
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!actualCash || isSubmitting || (requiresNotes && !notes.trim())}
          className={`
            w-full py-3 font-medium rounded-lg
            transition-colors
            ${!actualCash || (requiresNotes && !notes.trim())
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting...
            </span>
          ) : (
            'Confirm Cash Count'
          )}
        </button>
      </div>
    </div>
  );
}

export default CashReconciliation;
