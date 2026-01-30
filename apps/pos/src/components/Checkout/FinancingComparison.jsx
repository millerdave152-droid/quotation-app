/**
 * TeleTime POS - Financing Comparison Component
 * Side-by-side comparison of selected financing plans
 */

import {
  XMarkIcon,
  CheckIcon,
  MinusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Comparison row component
 */
function ComparisonRow({ label, values, highlight = false, format = 'text' }) {
  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    switch (format) {
      case 'currency':
        return formatCurrency(value);
      case 'percent':
        return `${value}%`;
      case 'months':
        return `${value} mo`;
      case 'date':
        return formatDate(value);
      case 'boolean':
        return value ? (
          <CheckIcon className="w-5 h-5 text-green-600 mx-auto" />
        ) : (
          <MinusIcon className="w-5 h-5 text-gray-400 mx-auto" />
        );
      default:
        return value;
    }
  };

  // Find best value for highlighting
  const getBestIndex = () => {
    if (!highlight || values.length < 2) return -1;

    switch (format) {
      case 'currency':
        // Lower is better for cost
        if (label.toLowerCase().includes('interest') || label.toLowerCase().includes('total')) {
          return values.indexOf(Math.min(...values.filter(v => v !== null)));
        }
        return -1;
      case 'percent':
        // Lower APR is better
        return values.indexOf(Math.min(...values.filter(v => v !== null)));
      default:
        return -1;
    }
  };

  const bestIndex = getBestIndex();

  return (
    <div className="grid grid-cols-4 gap-2 py-3 border-b border-gray-100 last:border-0">
      <div className="text-sm font-medium text-gray-600">{label}</div>
      {values.map((value, index) => (
        <div
          key={index}
          className={`
            text-sm text-center font-medium
            ${bestIndex === index ? 'text-green-600' : 'text-gray-900'}
          `}
        >
          {formatValue(value)}
          {bestIndex === index && format !== 'boolean' && (
            <span className="ml-1 text-xs text-green-500">Best</span>
          )}
        </div>
      ))}
      {/* Placeholder for missing columns */}
      {values.length < 3 && (
        Array(3 - values.length).fill(null).map((_, i) => (
          <div key={`empty-${i}`} className="text-sm text-center text-gray-300">—</div>
        ))
      )}
    </div>
  );
}

/**
 * Financing comparison component
 * @param {object} props
 * @param {Array} props.plans - Plans to compare (with calculated data)
 * @param {function} props.onRemove - Remove plan from comparison
 * @param {function} props.onSelect - Select a plan
 * @param {function} props.onClose - Close comparison view
 */
export function FinancingComparison({
  plans = [],
  onRemove,
  onSelect,
  onClose,
}) {
  if (plans.length === 0) {
    return null;
  }

  // Find the best plan (lowest total cost with 0% APR preferred)
  const bestPlanIndex = plans.reduce((bestIdx, plan, idx) => {
    const best = plans[bestIdx];
    if (!best) return idx;

    // Prefer 0% APR
    if (plan.interestRate === 0 && best.interestRate > 0) return idx;
    if (plan.interestRate > 0 && best.interestRate === 0) return bestIdx;

    // If same APR type, prefer lower total cost
    const planTotal = plan.calculated?.totalCostCents || plan.totalCostCents;
    const bestTotal = best.calculated?.totalCostCents || best.totalCostCents;
    return planTotal < bestTotal ? idx : bestIdx;
  }, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Compare Plans</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Plan Headers */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-500">Feature</div>
        {plans.map((plan, index) => (
          <div key={plan.planId} className="text-center">
            <div className="relative">
              {index === bestPlanIndex && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500 text-white text-xs font-medium rounded">
                    <SparklesIcon className="w-3 h-3" />
                    Best
                  </span>
                </div>
              )}
              <p className="font-semibold text-gray-900 mt-4">{plan.planName}</p>
              <p className="text-xs text-gray-500">{plan.providerName}</p>
              <button
                type="button"
                onClick={() => onRemove?.(plan)}
                className="mt-1 text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {/* Placeholder for missing columns */}
        {plans.length < 3 && (
          Array(3 - plans.length).fill(null).map((_, i) => (
            <div key={`empty-header-${i}`} className="text-center text-gray-300 text-sm">
              Add plan
            </div>
          ))
        )}
      </div>

      {/* Comparison Rows */}
      <div className="px-4">
        <ComparisonRow
          label="Monthly Payment"
          values={plans.map(p => p.calculated?.monthlyPayment || p.monthlyPayment)}
          format="currency"
        />
        <ComparisonRow
          label="Term"
          values={plans.map(p => p.termMonths)}
          format="months"
        />
        <ComparisonRow
          label="APR"
          values={plans.map(p => p.interestRate)}
          format="percent"
          highlight
        />
        <ComparisonRow
          label="Total Interest"
          values={plans.map(p => p.calculated?.totalInterest || p.totalInterest)}
          format="currency"
          highlight
        />
        <ComparisonRow
          label="Total Cost"
          values={plans.map(p => p.calculated?.totalCost || p.totalCost)}
          format="currency"
          highlight
        />
        <ComparisonRow
          label="First Payment"
          values={plans.map(p => p.calculated?.firstPaymentDate)}
          format="date"
        />
        <ComparisonRow
          label="0% APR Promo"
          values={plans.map(p => p.interestRate === 0)}
          format="boolean"
        />
      </div>

      {/* Select Buttons */}
      <div className="grid grid-cols-4 gap-2 px-4 py-4 bg-gray-50 border-t border-gray-200">
        <div /> {/* Empty cell for label column */}
        {plans.map((plan, index) => (
          <button
            key={plan.planId}
            type="button"
            onClick={() => onSelect?.(plan)}
            className={`
              py-2 px-3 text-sm font-semibold rounded-lg transition-colors
              ${index === bestPlanIndex
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            `}
          >
            Select{index === bestPlanIndex ? ' Best' : ''}
          </button>
        ))}
        {/* Placeholder for missing columns */}
        {plans.length < 3 && (
          Array(3 - plans.length).fill(null).map((_, i) => (
            <div key={`empty-btn-${i}`} />
          ))
        )}
      </div>
    </div>
  );
}

export default FinancingComparison;
