/**
 * TeleTime POS - Open Register Component
 * Form for entering opening cash count and starting a shift
 */

import { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  CalculatorIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
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
 * Denomination input row
 */
function DenominationRow({ denomination, count, onChange }) {
  const { id, label, value, type } = denomination;
  const total = count * value;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">× {formatCurrency(value)}</p>
      </div>

      {/* Count Input */}
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

      {/* Total */}
      <div className="w-24 text-right">
        <span className="text-lg font-semibold text-gray-900 tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Open register component
 * @param {object} props
 * @param {object} props.register - Selected register
 * @param {function} props.onBack - Callback to go back to register selection
 * @param {function} props.onComplete - Callback when register is opened
 */
export function OpenRegister({ register, onBack, onComplete }) {
  const { openShift } = useRegister();

  // State
  const [mode, setMode] = useState('simple'); // 'simple' | 'detailed'
  const [simpleTotal, setSimpleTotal] = useState('');
  const [denominations, setDenominations] = useState(
    DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.id]: 0 }), {})
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Calculate total from denominations
  const detailedTotal = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => sum + (denominations[d.id] || 0) * d.value, 0);
  }, [denominations]);

  // Get effective total based on mode
  const effectiveTotal = mode === 'simple'
    ? parseFloat(simpleTotal) || 0
    : detailedTotal;

  // Handle denomination change
  const handleDenominationChange = useCallback((id, count) => {
    setDenominations(prev => ({ ...prev, [id]: count }));
    setError(null);
  }, []);

  // Handle simple total change
  const handleSimpleTotalChange = (e) => {
    const value = e.target.value;
    // Allow empty string or valid number
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setSimpleTotal(value);
      setError(null);
    }
  };

  // Handle quick amount buttons
  const handleQuickAmount = (amount) => {
    setSimpleTotal(amount.toString());
    setError(null);
  };

  // Clear all
  const handleClear = () => {
    setSimpleTotal('');
    setDenominations(DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.id]: 0 }), {}));
    setError(null);
  };

  // Handle submit
  const handleSubmit = async () => {
    if (effectiveTotal <= 0) {
      setError('Please enter the opening cash amount');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const registerId = register.registerId || register.register_id || register.id;
      const result = await openShift(registerId, effectiveTotal);

      if (result.success) {
        onComplete?.(result.data);
      } else {
        setError(result.error || 'Failed to open register');
      }
    } catch (err) {
      console.error('[OpenRegister] Error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick amounts
  const quickAmounts = [100, 150, 200, 250, 300, 500];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Open Register</h1>
            <p className="text-slate-400 text-sm">{register.registerName}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
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

          {/* Simple Entry Mode */}
          {mode === 'simple' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <BanknotesIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Opening Cash Amount</h2>
                  <p className="text-sm text-gray-500">Enter the total cash in the drawer</p>
                </div>
              </div>

              {/* Total Input */}
              <div className="mb-6">
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

              {/* Quick Amounts */}
              <div>
                <p className="text-sm text-gray-500 mb-3">Quick Select:</p>
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => handleQuickAmount(amount)}
                      className={`
                        h-12 rounded-lg font-semibold transition-colors
                        ${parseFloat(simpleTotal) === amount
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      `}
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Detailed Entry Mode */}
          {mode === 'detailed' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Bills Section */}
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

              {/* Coins Section */}
              <div className="p-4 bg-gray-50 border-t border-b border-gray-200">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="12" cy="12" r="9" strokeWidth="2" />
                    <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">$</text>
                  </svg>
                  Coins
                </h3>
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

              {/* Clear Button */}
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

          {/* Total Summary */}
          <div className="mt-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Opening Cash Total</p>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(effectiveTotal)}</p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <BanknotesIcon className="w-7 h-7" />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || effectiveTotal <= 0}
            className="
              w-full h-14
              flex items-center justify-center gap-2
              bg-green-600 hover:bg-green-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              text-white text-lg font-bold
              rounded-xl
              transition-colors
            "
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Opening Register...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-6 h-6" />
                Open Register
              </>
            )}
          </button>
          <p className="mt-3 text-center text-sm text-gray-500">
            This will start a new shift at {register.registerName}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default OpenRegister;
