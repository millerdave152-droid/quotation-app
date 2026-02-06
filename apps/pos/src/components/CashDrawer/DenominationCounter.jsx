/**
 * TeleTime POS - Denomination Counter Component
 * Reusable component for counting cash by denomination
 */

import { useMemo } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Canadian currency denominations
 */
export const DENOMINATIONS = {
  bills: [
    { id: 'bills_100', label: '$100 Bills', value: 100 },
    { id: 'bills_50', label: '$50 Bills', value: 50 },
    { id: 'bills_20', label: '$20 Bills', value: 20 },
    { id: 'bills_10', label: '$10 Bills', value: 10 },
    { id: 'bills_5', label: '$5 Bills', value: 5 },
  ],
  coins: [
    { id: 'coins_200', label: '$2 Toonies', value: 2 },
    { id: 'coins_100', label: '$1 Loonies', value: 1 },
    { id: 'coins_25', label: '25¢ Quarters', value: 0.25 },
    { id: 'coins_10', label: '10¢ Dimes', value: 0.10 },
    { id: 'coins_5', label: '5¢ Nickels', value: 0.05 },
  ],
  rolls: [
    { id: 'rolls_200', label: '$2 Rolls', value: 50, per: '$50/roll' },
    { id: 'rolls_100', label: '$1 Rolls', value: 25, per: '$25/roll' },
    { id: 'rolls_25', label: '25¢ Rolls', value: 10, per: '$10/roll' },
    { id: 'rolls_10', label: '10¢ Rolls', value: 5, per: '$5/roll' },
    { id: 'rolls_5', label: '5¢ Rolls', value: 2, per: '$2/roll' },
  ]
};

/**
 * Single denomination row
 */
function DenominationRow({ denomination, count, onChange, compact = false }) {
  const { id, label, value, per } = denomination;
  const total = (count || 0) * value;

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="flex-1 text-sm text-gray-600">{label}</span>
        <input
          type="number"
          min="0"
          value={count || ''}
          onChange={(e) => onChange(id, Math.max(0, parseInt(e.target.value) || 0))}
          className="w-16 h-8 text-center text-sm border border-gray-200 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
        />
        <span className="w-20 text-right text-sm font-medium tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">
          {per || `× ${formatCurrency(value)}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(id, Math.max(0, (count || 0) - 1))}
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
          onClick={() => onChange(id, (count || 0) + 1)}
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
 * Denomination counter component
 * @param {object} props
 * @param {object} props.counts - Current denomination counts
 * @param {function} props.onChange - Callback when counts change
 * @param {boolean} props.showRolls - Whether to show coin rolls section
 * @param {boolean} props.compact - Compact display mode
 * @param {boolean} props.readOnly - Read-only display
 */
export function DenominationCounter({
  counts,
  onChange,
  showRolls = false,
  compact = false,
  readOnly = false
}) {
  // Calculate totals
  const totals = useMemo(() => {
    const billsTotal = DENOMINATIONS.bills.reduce(
      (sum, d) => sum + (counts[d.id] || 0) * d.value, 0
    );
    const coinsTotal = DENOMINATIONS.coins.reduce(
      (sum, d) => sum + (counts[d.id] || 0) * d.value, 0
    );
    const rollsTotal = showRolls ? DENOMINATIONS.rolls.reduce(
      (sum, d) => sum + (counts[d.id] || 0) * d.value, 0
    ) : 0;

    return {
      bills: billsTotal,
      coins: coinsTotal,
      rolls: rollsTotal,
      total: billsTotal + coinsTotal + rollsTotal
    };
  }, [counts, showRolls]);

  const handleChange = (id, value) => {
    if (readOnly) return;
    onChange({ ...counts, [id]: value });
  };

  const handleClear = () => {
    if (readOnly) return;
    const cleared = {};
    [...DENOMINATIONS.bills, ...DENOMINATIONS.coins, ...(showRolls ? DENOMINATIONS.rolls : [])].forEach(d => {
      cleared[d.id] = 0;
    });
    onChange(cleared);
  };

  if (compact) {
    return (
      <div className="space-y-4">
        {/* Bills */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Bills</h4>
          {DENOMINATIONS.bills.map(d => (
            <DenominationRow
              key={d.id}
              denomination={d}
              count={counts[d.id]}
              onChange={handleChange}
              compact
            />
          ))}
        </div>

        {/* Coins */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Coins</h4>
          {DENOMINATIONS.coins.map(d => (
            <DenominationRow
              key={d.id}
              denomination={d}
              count={counts[d.id]}
              onChange={handleChange}
              compact
            />
          ))}
        </div>

        {/* Total */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Bills Section */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <BanknotesIcon className="w-5 h-5" />
            Bills
          </h3>
          <span className="text-sm font-medium text-gray-500">
            {formatCurrency(totals.bills)}
          </span>
        </div>
      </div>
      <div className="px-4">
        {DENOMINATIONS.bills.map(d => (
          <DenominationRow
            key={d.id}
            denomination={d}
            count={counts[d.id]}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Coins Section */}
      <div className="p-4 bg-gray-50 border-t border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
            </svg>
            Coins
          </h3>
          <span className="text-sm font-medium text-gray-500">
            {formatCurrency(totals.coins)}
          </span>
        </div>
      </div>
      <div className="px-4">
        {DENOMINATIONS.coins.map(d => (
          <DenominationRow
            key={d.id}
            denomination={d}
            count={counts[d.id]}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Rolls Section (optional) */}
      {showRolls && (
        <>
          <div className="p-4 bg-gray-50 border-t border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="6" y="4" width="12" height="16" rx="2" strokeWidth="2" />
                </svg>
                Coin Rolls
              </h3>
              <span className="text-sm font-medium text-gray-500">
                {formatCurrency(totals.rolls)}
              </span>
            </div>
          </div>
          <div className="px-4">
            {DENOMINATIONS.rolls.map(d => (
              <DenominationRow
                key={d.id}
                denomination={d}
                count={counts[d.id]}
                onChange={handleChange}
              />
            ))}
          </div>
        </>
      )}

      {/* Clear Button & Total */}
      <div className="p-4 border-t border-gray-200">
        {!readOnly && (
          <button
            type="button"
            onClick={handleClear}
            className="w-full h-10 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors mb-4"
          >
            Clear All
          </button>
        )}
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total Cash</span>
          <span className="text-xl tabular-nums text-green-600">{formatCurrency(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate total from denomination counts
 */
export function calculateDenominationTotal(counts) {
  let total = 0;

  DENOMINATIONS.bills.forEach(d => {
    total += (counts[d.id] || 0) * d.value;
  });

  DENOMINATIONS.coins.forEach(d => {
    total += (counts[d.id] || 0) * d.value;
  });

  DENOMINATIONS.rolls.forEach(d => {
    total += (counts[d.id] || 0) * d.value;
  });

  return total;
}

/**
 * Get empty denomination counts
 */
export function getEmptyDenominations() {
  const empty = {};
  [...DENOMINATIONS.bills, ...DENOMINATIONS.coins, ...DENOMINATIONS.rolls].forEach(d => {
    empty[d.id] = 0;
  });
  return empty;
}

export default DenominationCounter;
